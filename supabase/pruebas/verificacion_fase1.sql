-- =====================================================================
-- VERIFICACIÓN AUTOMÁTICA · FASE 1 (base de datos y seguridad)
--
-- Cómo usar: pegue TODO este archivo en el SQL Editor de Supabase y
-- presione "Run" después de ejecutar las migraciones 01 a 06.
--
-- Todas las pruebas se ejecutan dentro de una subtransacción que se
-- REVIERTE al final: no quedan miembros, aportaciones ni registros de
-- bitácora de prueba en la base de datos.
--
-- Resultado: una tabla con cada prueba. Todas deben decir "OK".
-- =====================================================================

create or replace function pg_temp.verificar_sistema()
returns table (n bigint, prueba text, resultado text, detalle text)
language plpgsql
as $$
declare
  v_log        jsonb := '[]'::jsonb;
  v_rol        text := current_user;
  v_admin      uuid := gen_random_uuid();
  v_admin_mail text := 'prueba.admin@verificacion.local';
  v_intruso    uuid := gen_random_uuid();
  v_m1 uuid; v_m2 uuid; v_m3 uuid;
  v_fondo uuid; v_fondo_inactivo uuid; v_fondo_libre uuid; v_metodo uuid;
  v_hoy date;
  v_a1 jsonb; v_a2 jsonb; v_a3 jsonb; v_c1 jsonb; v_c3 jsonb;
  v_txt text; v_txt2 text; v_cnt bigint; v_r jsonb; v_ok boolean;
begin
  begin  -- ====== subtransacción: TODO se revierte al final ======

    -- Usuario administrador de prueba (si no es posible crearlo, se usa uno existente)
    begin
      insert into auth.users (id, email, aud, role)
      values (v_admin, v_admin_mail, 'authenticated', 'authenticated');
      insert into public.administradores (user_id, email, rol, activo)
      values (v_admin, v_admin_mail, 'SUPER_ADMIN', true);
    exception when others then
      select a.user_id, a.email into v_admin, v_admin_mail
        from public.administradores a where a.activo limit 1;
      if v_admin is null then
        raise exception 'No fue posible crear el usuario de prueba y no existe ningún SUPER ADMIN. Registre uno primero con public.registrar_super_admin().';
      end if;
    end;

    select id into v_fondo  from public.fondos       where activo order by orden limit 1;
    select id into v_metodo from public.metodos_pago where activo order by orden limit 1;
    v_hoy := public.fecha_hoy_iglesia();

    -- ------------------------------------------------------------------
    -- Estructura
    -- ------------------------------------------------------------------
    select count(*) into v_cnt from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity;
    v_log := v_log || jsonb_build_object('p', 'RLS activo en todas las tablas públicas', 'ok', v_cnt = 0, 'd', v_cnt || ' tablas sin RLS');

    v_ok := exists (select 1 from pg_constraint where conname = 'aportaciones_numero_recibo_uk');
    v_log := v_log || jsonb_build_object('p', 'Restricción UNIQUE en número de recibo', 'ok', v_ok, 'd', '');

    v_ok := exists (select 1 from pg_constraint where conname = 'aportaciones_monto_positivo');
    v_log := v_log || jsonb_build_object('p', 'Restricción monto > 0', 'ok', v_ok, 'd', '');

    select count(*) into v_cnt from public.fondos;
    v_log := v_log || jsonb_build_object('p', 'Fondos iniciales cargados', 'ok', v_cnt >= 6, 'd', v_cnt || ' fondos');
    select count(*) into v_cnt from public.metodos_pago;
    v_log := v_log || jsonb_build_object('p', 'Métodos de pago iniciales cargados', 'ok', v_cnt >= 7, 'd', v_cnt || ' métodos');
    select count(*) into v_cnt from public.configuracion_iglesia;
    v_log := v_log || jsonb_build_object('p', 'Configuración institucional (registro único)', 'ok', v_cnt = 1, 'd', v_cnt || ' registro(s)');

    -- ------------------------------------------------------------------
    -- Actuar como SUPER ADMIN
    -- ------------------------------------------------------------------
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated', 'email', v_admin_mail)::text, true);
    perform set_config('role', 'authenticated', true);

    v_log := v_log || jsonb_build_object('p', 'Usuario de prueba reconocido como SUPER ADMIN', 'ok', public.es_super_admin(), 'd', v_admin_mail);

    -- Miembros
    insert into public.miembros (nombre, apellido, email, telefono)
    values ('José', 'Verificación Núñez', 'Prueba@Example.com', '(305) 555-0100')
    returning id into v_m1;
    select numero_miembro, email into v_txt, v_txt2 from public.miembros where id = v_m1;
    v_log := v_log || jsonb_build_object('p', 'Número de miembro automático (EBE-000000)', 'ok', v_txt ~ '^EBE-[0-9]{6,}$', 'd', v_txt);
    v_log := v_log || jsonb_build_object('p', 'Email normalizado a minúsculas', 'ok', v_txt2 = 'prueba@example.com', 'd', v_txt2);

    insert into public.miembros (numero_miembro, nombre, apellido)
    values ('EBE-999999', 'Otro', 'Miembro')
    returning id into v_m2;
    select numero_miembro into v_txt2 from public.miembros where id = v_m2;
    v_log := v_log || jsonb_build_object('p', 'El cliente no puede imponer el número de miembro', 'ok', v_txt2 <> 'EBE-999999', 'd', v_txt2);
    v_log := v_log || jsonb_build_object('p', 'Números de miembro consecutivos',
      'ok', substring(v_txt2 from 5)::bigint = substring(v_txt from 5)::bigint + 1, 'd', v_txt || ' → ' || v_txt2);

    select count(*) into v_cnt from public.miembros
     where id = v_m1 and texto_busqueda like '%jose%' and texto_busqueda like '%nunez%' and texto_busqueda like '%3055550100%';
    v_log := v_log || jsonb_build_object('p', 'Búsqueda sin acentos y por teléfono (solo dígitos)', 'ok', v_cnt = 1, 'd', '');

    begin
      update public.miembros set numero_miembro = 'EBE-000999' where id = v_m1;
      v_log := v_log || jsonb_build_object('p', 'Número de miembro inmutable', 'ok', false, 'd', 'Se permitió modificarlo');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Número de miembro inmutable', 'ok', true, 'd', sqlerrm);
    end;

    -- Aportaciones: validaciones
    begin
      insert into public.aportaciones (miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id)
      values (v_m1, v_hoy, v_fondo, 0, v_metodo);
      v_log := v_log || jsonb_build_object('p', 'Rechaza monto $0.00', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Rechaza monto $0.00', 'ok', true, 'd', sqlerrm);
    end;

    begin
      insert into public.aportaciones (miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id)
      values (v_m1, v_hoy, v_fondo, -10, v_metodo);
      v_log := v_log || jsonb_build_object('p', 'Rechaza monto negativo', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Rechaza monto negativo', 'ok', true, 'd', sqlerrm);
    end;

    begin
      insert into public.aportaciones (miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id)
      values (v_m1, v_hoy + 5, v_fondo, 10, v_metodo);
      v_log := v_log || jsonb_build_object('p', 'Rechaza fecha futura', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Rechaza fecha futura', 'ok', true, 'd', sqlerrm);
    end;

    begin
      insert into public.aportaciones (miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id, numero_recibo)
      values (v_m1, v_hoy, v_fondo, 10, v_metodo, 'EBE-2000-000001');
      v_log := v_log || jsonb_build_object('p', 'El cliente no puede imponer el número de recibo', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'El cliente no puede imponer el número de recibo', 'ok', true, 'd', sqlerrm);
    end;

    begin
      insert into public.aportaciones (miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id, estado)
      values (v_m1, v_hoy, v_fondo, 10, v_metodo, 'ANULADA');
      v_log := v_log || jsonb_build_object('p', 'El cliente no puede imponer el estado', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'El cliente no puede imponer el estado', 'ok', true, 'd', sqlerrm);
    end;

    begin
      insert into public.aportaciones (miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id, bienes_servicios)
      values (v_m1, v_hoy, v_fondo, 50, v_metodo, true);
      v_log := v_log || jsonb_build_object('p', 'Bienes/servicios exige valor y descripción', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Bienes/servicios exige valor y descripción', 'ok', true, 'd', sqlerrm);
    end;

    begin
      insert into public.aportaciones (miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id,
                                       bienes_servicios, valor_bienes_servicios, descripcion_bienes_servicios)
      values (v_m1, v_hoy, v_fondo, 50, v_metodo, true, 80, 'Cena');
      v_log := v_log || jsonb_build_object('p', 'Valor de bienes/servicios no puede exceder el monto', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Valor de bienes/servicios no puede exceder el monto', 'ok', true, 'd', sqlerrm);
    end;

    -- Aportaciones válidas
    insert into public.aportaciones (miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id, referencia_pago)
    values (v_m1, v_hoy, v_fondo, 250.00, v_metodo, '1234')
    returning to_jsonb(aportaciones) into v_a1;
    v_log := v_log || jsonb_build_object('p', 'Número de recibo automático (EBE-AAAA-000000)',
      'ok', (v_a1 ->> 'numero_recibo') ~ ('^EBE-' || extract(year from v_hoy)::int || '-[0-9]{6,}$'),
      'd', v_a1 ->> 'numero_recibo');
    v_log := v_log || jsonb_build_object('p', 'Estado inicial REGISTRADA y usuario creador registrado',
      'ok', (v_a1 ->> 'estado') = 'REGISTRADA' and (v_a1 ->> 'created_by')::uuid = v_admin, 'd', v_a1 ->> 'estado');

    insert into public.aportaciones (miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id)
    values (v_m1, v_hoy, v_fondo, 100.00, v_metodo)
    returning to_jsonb(aportaciones) into v_a2;
    v_log := v_log || jsonb_build_object('p', 'Números de recibo consecutivos',
      'ok', right(v_a2 ->> 'numero_recibo', 6)::int = right(v_a1 ->> 'numero_recibo', 6)::int + 1,
      'd', (v_a1 ->> 'numero_recibo') || ' → ' || (v_a2 ->> 'numero_recibo'));

    insert into public.aportaciones (miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id)
    values (v_m1, v_hoy, v_fondo, 75.00, v_metodo)
    returning to_jsonb(aportaciones) into v_a3;

    -- Modificaciones
    begin
      update public.aportaciones set monto = 999 where id = (v_a1 ->> 'id')::uuid;
      v_log := v_log || jsonb_build_object('p', 'API: no se puede modificar el monto', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'API: no se puede modificar el monto', 'ok', true, 'd', sqlerrm);
    end;

    perform set_config('role', v_rol, true);
    begin
      update public.aportaciones set monto = 999 where id = (v_a1 ->> 'id')::uuid;
      v_log := v_log || jsonb_build_object('p', 'Base de datos: monto inmutable incluso para el propietario', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Base de datos: monto inmutable incluso para el propietario', 'ok', true, 'd', sqlerrm);
    end;
    begin
      delete from public.aportaciones where id = (v_a1 ->> 'id')::uuid;
      v_log := v_log || jsonb_build_object('p', 'Base de datos: aportaciones no se eliminan (propietario)', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Base de datos: aportaciones no se eliminan (propietario)', 'ok', true, 'd', sqlerrm);
    end;
    perform set_config('role', 'authenticated', true);

    begin
      delete from public.aportaciones where id = (v_a1 ->> 'id')::uuid;
      v_log := v_log || jsonb_build_object('p', 'API: aportaciones no se eliminan', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'API: aportaciones no se eliminan', 'ok', true, 'd', sqlerrm);
    end;

    update public.aportaciones set descripcion = 'Nota de prueba' where id = (v_a1 ->> 'id')::uuid;
    select descripcion into v_txt from public.aportaciones where id = (v_a1 ->> 'id')::uuid;
    v_log := v_log || jsonb_build_object('p', 'Se permite editar la descripción de una aportación REGISTRADA', 'ok', v_txt = 'Nota de prueba', 'd', '');

    -- Anulación
    begin
      update public.aportaciones set estado = 'ANULADA' where id = (v_a1 ->> 'id')::uuid;
      v_log := v_log || jsonb_build_object('p', 'Anulación exige motivo', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Anulación exige motivo', 'ok', true, 'd', sqlerrm);
    end;

    v_r := public.anular_aportacion((v_a1 ->> 'id')::uuid, 'Registrada con monto equivocado');
    v_log := v_log || jsonb_build_object('p', 'Anulación registra estado, fecha, usuario y motivo',
      'ok', (v_r ->> 'estado') = 'ANULADA' and (v_r ->> 'anulada_at') is not null
            and (v_r ->> 'anulada_by')::uuid = v_admin and (v_r ->> 'motivo_anulacion') is not null,
      'd', v_r ->> 'estado');

    select count(*) into v_cnt from public.aportaciones where id = (v_a1 ->> 'id')::uuid;
    v_log := v_log || jsonb_build_object('p', 'La aportación anulada se conserva', 'ok', v_cnt = 1, 'd', '');

    begin
      update public.aportaciones set descripcion = 'cambio' where id = (v_a1 ->> 'id')::uuid;
      v_log := v_log || jsonb_build_object('p', 'Una aportación ANULADA no puede modificarse', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Una aportación ANULADA no puede modificarse', 'ok', true, 'd', sqlerrm);
    end;

    begin
      update public.aportaciones set estado = 'REGISTRADA' where id = (v_a1 ->> 'id')::uuid;
      v_log := v_log || jsonb_build_object('p', 'No se puede revertir una anulación', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'No se puede revertir una anulación', 'ok', true, 'd', sqlerrm);
    end;

    -- Corrección directa (REGISTRADA → nueva aportación)
    v_c3 := public.corregir_aportacion((v_a3 ->> 'id')::uuid, 'Monto incorrecto en la captura',
      jsonb_build_object('miembro_id', v_m1, 'fecha_aportacion', v_hoy, 'fondo_id', v_fondo,
                         'monto', '80.00', 'metodo_pago_id', v_metodo));
    select to_jsonb(a) into v_r from public.aportaciones a where a.id = (v_a3 ->> 'id')::uuid;
    v_log := v_log || jsonb_build_object('p', 'Corrección: original queda CORREGIDA y vinculada a la nueva',
      'ok', (v_r ->> 'estado') = 'CORREGIDA'
            and (v_r ->> 'corregida_por_id') = (v_c3 ->> 'id')
            and (v_c3 ->> 'corrige_aportacion_id') = (v_a3 ->> 'id')
            and (v_c3 ->> 'estado') = 'REGISTRADA',
      'd', (v_a3 ->> 'numero_recibo') || ' → ' || (v_c3 ->> 'numero_recibo'));

    begin
      perform public.corregir_aportacion((v_a3 ->> 'id')::uuid, 'Segundo intento',
        jsonb_build_object('miembro_id', v_m1, 'fecha_aportacion', v_hoy, 'fondo_id', v_fondo,
                           'monto', '81.00', 'metodo_pago_id', v_metodo));
      v_log := v_log || jsonb_build_object('p', 'Una aportación solo puede corregirse una vez', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Una aportación solo puede corregirse una vez', 'ok', true, 'd', sqlerrm);
    end;

    -- Corrección posterior de una aportación ya anulada
    v_c1 := public.corregir_aportacion((v_a1 ->> 'id')::uuid, null,
      jsonb_build_object('miembro_id', v_m1, 'fecha_aportacion', v_hoy, 'fondo_id', v_fondo,
                         'monto', '260.00', 'metodo_pago_id', v_metodo, 'referencia_pago', '1234'));
    select estado into v_txt from public.aportaciones where id = (v_a1 ->> 'id')::uuid;
    v_log := v_log || jsonb_build_object('p', 'Corrección posterior de una aportación ANULADA', 'ok', v_txt = 'CORREGIDA', 'd', v_txt);

    -- Totales (solo REGISTRADAS): 100 + 80 + 260 = 440
    v_r := public.buscar_aportaciones(jsonb_build_object('miembro_id', v_m1));
    v_log := v_log || jsonb_build_object('p', 'Totales excluyen anuladas/corregidas',
      'ok', (v_r ->> 'total_validas')::numeric = 440 and (v_r ->> 'cantidad_validas')::int = 3
            and (v_r ->> 'cantidad_no_validas')::int = 2,
      'd', 'válido $' || (v_r ->> 'total_validas') || ' · no válidas ' || (v_r ->> 'cantidad_no_validas'));

    v_r := public.buscar_aportaciones(jsonb_build_object('texto', 'nunez jose'));
    v_log := v_log || jsonb_build_object('p', 'Búsqueda de aportaciones por nombre (sin acentos)',
      'ok', (v_r ->> 'total_filas')::int = 5, 'd', (v_r ->> 'total_filas') || ' filas');

    -- Fondos y miembros con historial
    insert into public.fondos (nombre, activo) values ('Fondo de Prueba Inactivo', false) returning id into v_fondo_inactivo;
    begin
      insert into public.aportaciones (miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id)
      values (v_m1, v_hoy, v_fondo_inactivo, 10, v_metodo);
      v_log := v_log || jsonb_build_object('p', 'Rechaza aportaciones a fondos inactivos', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Rechaza aportaciones a fondos inactivos', 'ok', true, 'd', sqlerrm);
    end;

    begin
      delete from public.fondos where id = v_fondo;
      v_log := v_log || jsonb_build_object('p', 'No se elimina un fondo con aportaciones', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'No se elimina un fondo con aportaciones', 'ok', true, 'd', sqlerrm);
    end;

    delete from public.fondos where id = v_fondo_inactivo;
    get diagnostics v_cnt = row_count;
    v_log := v_log || jsonb_build_object('p', 'Se puede eliminar un fondo sin aportaciones', 'ok', v_cnt = 1, 'd', '');

    begin
      delete from public.metodos_pago where id = v_metodo;
      v_log := v_log || jsonb_build_object('p', 'No se elimina un método de pago con aportaciones', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'No se elimina un método de pago con aportaciones', 'ok', true, 'd', sqlerrm);
    end;

    begin
      delete from public.miembros where id = v_m1;
      v_log := v_log || jsonb_build_object('p', 'No se elimina un miembro con aportaciones', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'No se elimina un miembro con aportaciones', 'ok', true, 'd', sqlerrm);
    end;

    delete from public.miembros where id = v_m2;
    get diagnostics v_cnt = row_count;
    v_log := v_log || jsonb_build_object('p', 'Se puede eliminar un miembro sin aportaciones', 'ok', v_cnt = 1, 'd', '');

    -- Bitácora
    select count(*) into v_cnt from public.bitacora where usuario_id = v_admin;
    v_log := v_log || jsonb_build_object('p', 'Bitácora registra las operaciones con el usuario', 'ok', v_cnt >= 10, 'd', v_cnt || ' eventos');
    select count(*) into v_cnt from public.bitacora
     where usuario_id = v_admin and accion in ('ANULAR', 'VINCULAR_CORRECCION');
    v_log := v_log || jsonb_build_object('p', 'Bitácora registra anulaciones y correcciones', 'ok', v_cnt >= 3, 'd', v_cnt || ' eventos');

    begin
      delete from public.bitacora where usuario_id = v_admin;
      get diagnostics v_cnt = row_count;
      v_log := v_log || jsonb_build_object('p', 'API: la bitácora no se puede borrar', 'ok', v_cnt = 0, 'd', 'Filas afectadas: ' || v_cnt);
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'API: la bitácora no se puede borrar', 'ok', true, 'd', sqlerrm);
    end;

    perform set_config('role', v_rol, true);
    begin
      update public.bitacora set descripcion = 'alterado' where usuario_id = v_admin;
      v_log := v_log || jsonb_build_object('p', 'Base de datos: bitácora inmutable (propietario)', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Base de datos: bitácora inmutable (propietario)', 'ok', true, 'd', sqlerrm);
    end;
    perform set_config('role', 'authenticated', true);

    begin
      perform public.registrar_evento('BORRAR_TODO', null, null, 'intento');
      v_log := v_log || jsonb_build_object('p', 'registrar_evento solo acepta acciones permitidas', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'registrar_evento solo acepta acciones permitidas', 'ok', true, 'd', sqlerrm);
    end;

    begin
      select count(*) into v_cnt from public.contadores;
      v_log := v_log || jsonb_build_object('p', 'Contadores internos no accesibles desde la API', 'ok', false, 'd', 'Se permitió leer');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Contadores internos no accesibles desde la API', 'ok', true, 'd', sqlerrm);
    end;

    -- ------------------------------------------------------------------
    -- Usuario autenticado que NO es SUPER ADMIN
    -- ------------------------------------------------------------------
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_intruso, 'role', 'authenticated', 'email', 'intruso@verificacion.local')::text, true);

    v_log := v_log || jsonb_build_object('p', 'Usuario no autorizado: es_super_admin() = false', 'ok', not public.es_super_admin(), 'd', '');

    select count(*) into v_cnt from public.miembros;
    v_log := v_log || jsonb_build_object('p', 'Usuario no autorizado: no ve miembros', 'ok', v_cnt = 0, 'd', v_cnt || ' visibles');
    select count(*) into v_cnt from public.v_aportaciones;
    v_log := v_log || jsonb_build_object('p', 'Usuario no autorizado: no ve aportaciones', 'ok', v_cnt = 0, 'd', v_cnt || ' visibles');
    select count(*) into v_cnt from public.bitacora;
    v_log := v_log || jsonb_build_object('p', 'Usuario no autorizado: no ve la bitácora', 'ok', v_cnt = 0, 'd', v_cnt || ' visibles');

    begin
      insert into public.miembros (nombre, apellido) values ('Intruso', 'Prueba') returning id into v_m3;
      v_log := v_log || jsonb_build_object('p', 'Usuario no autorizado: no puede crear miembros', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Usuario no autorizado: no puede crear miembros', 'ok', true, 'd', sqlerrm);
    end;

    begin
      v_r := public.buscar_aportaciones('{}'::jsonb);
      v_log := v_log || jsonb_build_object('p', 'Usuario no autorizado: no puede consultar aportaciones (RPC)', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Usuario no autorizado: no puede consultar aportaciones (RPC)', 'ok', true, 'd', sqlerrm);
    end;

    update public.configuracion_iglesia set lema = 'alterado';
    get diagnostics v_cnt = row_count;
    v_log := v_log || jsonb_build_object('p', 'Usuario no autorizado: no puede modificar la configuración', 'ok', v_cnt = 0, 'd', 'Filas afectadas: ' || v_cnt);

    -- ------------------------------------------------------------------
    -- Visitante anónimo (sin sesión)
    -- ------------------------------------------------------------------
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    perform set_config('role', 'anon', true);

    begin
      select count(*) into v_cnt from public.miembros;
      v_log := v_log || jsonb_build_object('p', 'Anónimo: sin acceso a miembros', 'ok', false, 'd', 'Se permitió leer');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Anónimo: sin acceso a miembros', 'ok', true, 'd', sqlerrm);
    end;

    begin
      select count(*) into v_cnt from public.aportaciones;
      v_log := v_log || jsonb_build_object('p', 'Anónimo: sin acceso a aportaciones', 'ok', false, 'd', 'Se permitió leer');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Anónimo: sin acceso a aportaciones', 'ok', true, 'd', sqlerrm);
    end;

    v_r := public.datos_publicos_iglesia();
    v_log := v_log || jsonb_build_object('p', 'Anónimo: solo obtiene nombre, lema y logo', 'ok',
      (v_r ->> 'nombre_iglesia') is not null and not (v_r ? 'ein') and not (v_r ? 'email'), 'd', v_r ->> 'nombre_iglesia');

    perform set_config('role', v_rol, true);

    -- Revertir todo lo realizado durante la verificación
    raise exception using errcode = 'P0099', message = 'revertir';
  exception
    when sqlstate 'P0099' then
      null;  -- reversión esperada
    when others then
      v_log := v_log || jsonb_build_object('p', 'ERROR INESPERADO (verificación interrumpida)', 'ok', false, 'd', sqlerrm);
  end;

  return query
    select e.ord, e.val ->> 'p',
           case when (e.val ->> 'ok')::boolean then 'OK' else 'FALLÓ' end,
           e.val ->> 'd'
    from jsonb_array_elements(v_log) with ordinality as e(val, ord)
    order by e.ord;
end;
$$;

select * from pg_temp.verificar_sistema();
