-- =====================================================================
-- VERIFICACIÓN AUTOMÁTICA · FAMILIAS (migración 07)
--
-- Cómo usar: pegue TODO este archivo en el SQL Editor de Supabase y
-- presione "Run" después de ejecutar 20260922000700_familias.sql.
--
-- Igual que la verificación de la fase 1, todo se ejecuta dentro de una
-- subtransacción que se REVIERTE al final: no deja datos de prueba.
--
-- Resultado: una tabla con cada prueba. Todas deben decir "OK".
-- =====================================================================

create or replace function pg_temp.verificar_familias()
returns table (n bigint, prueba text, resultado text, detalle text)
language plpgsql
as $$
declare
  v_log        jsonb := '[]'::jsonb;
  v_rol        text := current_user;
  v_admin      uuid := gen_random_uuid();
  v_admin_mail text := 'prueba.familias@verificacion.local';
  v_intruso    uuid := gen_random_uuid();
  v_fam uuid; v_fam2 uuid;
  v_m1 uuid; v_m2 uuid; v_m3 uuid;
  v_fondo uuid; v_metodo uuid;
  v_hoy date;
  v_txt text; v_txt2 text; v_cnt bigint; v_r jsonb;
begin
  begin  -- ====== subtransacción: TODO se revierte al final ======

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

    -- Estructura
    select count(*) into v_cnt from pg_class c
     where c.oid = 'public.familias'::regclass and c.relrowsecurity;
    v_log := v_log || jsonb_build_object('p', 'RLS activo en la tabla familias', 'ok', v_cnt = 1, 'd', '');

    select count(*) into v_cnt from information_schema.columns
     where table_schema = 'public' and table_name = 'v_aportaciones' and column_name = 'familia_id';
    v_log := v_log || jsonb_build_object('p', 'La vista de aportaciones incluye familia_id', 'ok', v_cnt = 1, 'd', '');

    -- ------------------------------------------------------------------
    -- Actuar como SUPER ADMIN
    -- ------------------------------------------------------------------
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated', 'email', v_admin_mail)::text, true);
    perform set_config('role', 'authenticated', true);

    insert into public.familias (nombre, nombre_carta) values ('  Familia Verificación  ', '   ')
    returning id into v_fam;
    select numero_familia, nombre into v_txt, v_txt2 from public.familias where id = v_fam;
    v_log := v_log || jsonb_build_object('p', 'Número de familia automático (FAM-000000)', 'ok', v_txt ~ '^FAM-[0-9]{6,}$', 'd', v_txt);
    v_log := v_log || jsonb_build_object('p', 'Nombre sin espacios sobrantes y nombre de carta vacío → NULL',
      'ok', v_txt2 = 'Familia Verificación' and (select nombre_carta from public.familias where id = v_fam) is null, 'd', v_txt2);

    insert into public.familias (numero_familia, nombre) values ('FAM-999999', 'Otra familia')
    returning id into v_fam2;
    select numero_familia into v_txt2 from public.familias where id = v_fam2;
    v_log := v_log || jsonb_build_object('p', 'El cliente no puede imponer el número de familia', 'ok', v_txt2 <> 'FAM-999999', 'd', v_txt2);

    begin
      update public.familias set numero_familia = 'FAM-000999' where id = v_fam;
      v_log := v_log || jsonb_build_object('p', 'Número de familia inmutable', 'ok', false, 'd', 'Se permitió modificarlo');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Número de familia inmutable', 'ok', true, 'd', sqlerrm);
    end;

    -- Miembros de la familia y aportaciones
    insert into public.miembros (nombre, apellido, familia_id) values ('José', 'Verificación', v_fam) returning id into v_m1;
    insert into public.miembros (nombre, apellido) values ('María', 'Verificación') returning id into v_m2;
    update public.miembros set familia_id = v_fam where id = v_m2;
    insert into public.miembros (nombre, apellido) values ('Pedro', 'Sin Familia') returning id into v_m3;

    select count(*) into v_cnt from public.miembros where familia_id = v_fam;
    v_log := v_log || jsonb_build_object('p', 'Se asignan miembros a la familia (al crear y al editar)', 'ok', v_cnt = 2, 'd', v_cnt || ' miembros');

    insert into public.aportaciones (miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id) values (v_m1, v_hoy, v_fondo, 100, v_metodo);
    insert into public.aportaciones (miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id) values (v_m2, v_hoy, v_fondo, 50.25, v_metodo);
    insert into public.aportaciones (miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id) values (v_m3, v_hoy, v_fondo, 999, v_metodo);

    v_r := public.buscar_aportaciones(jsonb_build_object('familia_id', v_fam, 'estado', 'REGISTRADA'));
    v_log := v_log || jsonb_build_object('p', 'Búsqueda por familia suma solo a sus miembros',
      'ok', (v_r ->> 'total_validas')::numeric = 150.25 and (v_r ->> 'cantidad_validas')::int = 2,
      'd', '$' || (v_r ->> 'total_validas') || ' en ' || (v_r ->> 'cantidad_validas') || ' aportaciones');

    v_log := v_log || jsonb_build_object('p', 'Las filas de la búsqueda incluyen familia_id',
      'ok', (v_r -> 'filas' -> 0 ->> 'familia_id')::uuid = v_fam, 'd', '');

    v_r := public.buscar_aportaciones(jsonb_build_object('miembro_id', v_m1));
    v_log := v_log || jsonb_build_object('p', 'La búsqueda por persona no cambia',
      'ok', (v_r ->> 'total_validas')::numeric = 100, 'd', '$' || (v_r ->> 'total_validas'));

    -- Bitácora
    select count(*) into v_cnt from public.bitacora
     where usuario_id = v_admin and tabla_afectada = 'familias' and accion = 'CREAR' and descripcion like 'Familia FAM-%';
    v_log := v_log || jsonb_build_object('p', 'Bitácora registra la creación de familias', 'ok', v_cnt >= 2, 'd', v_cnt || ' eventos');

    select count(*) into v_cnt from public.bitacora
     where usuario_id = v_admin and tabla_afectada = 'miembros' and descripcion like '%Asignado a la familia%';
    v_log := v_log || jsonb_build_object('p', 'Bitácora registra la asignación de un miembro a una familia', 'ok', v_cnt >= 1, 'd', v_cnt || ' eventos');

    -- Eliminar una familia no elimina a sus miembros ni sus aportaciones
    delete from public.familias where id = v_fam;
    select count(*) into v_cnt from public.miembros where id in (v_m1, v_m2) and familia_id is null;
    v_log := v_log || jsonb_build_object('p', 'Al eliminar la familia, sus miembros se conservan sin familia', 'ok', v_cnt = 2, 'd', v_cnt || ' miembros');
    select count(*) into v_cnt from public.aportaciones where miembro_id in (v_m1, v_m2) and estado = 'REGISTRADA';
    v_log := v_log || jsonb_build_object('p', 'Al eliminar la familia, las aportaciones se conservan', 'ok', v_cnt = 2, 'd', v_cnt || ' aportaciones');

    -- ------------------------------------------------------------------
    -- Usuario autenticado que NO es SUPER ADMIN
    -- ------------------------------------------------------------------
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_intruso, 'role', 'authenticated', 'email', 'intruso@verificacion.local')::text, true);

    select count(*) into v_cnt from public.familias;
    v_log := v_log || jsonb_build_object('p', 'Usuario no autorizado: no ve familias', 'ok', v_cnt = 0, 'd', v_cnt || ' visibles');

    begin
      insert into public.familias (nombre) values ('Intrusa');
      v_log := v_log || jsonb_build_object('p', 'Usuario no autorizado: no puede crear familias', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Usuario no autorizado: no puede crear familias', 'ok', true, 'd', sqlerrm);
    end;

    -- ------------------------------------------------------------------
    -- Visitante anónimo (sin sesión)
    -- ------------------------------------------------------------------
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    perform set_config('role', 'anon', true);
    begin
      select count(*) into v_cnt from public.familias;
      v_log := v_log || jsonb_build_object('p', 'Anónimo: sin acceso a familias', 'ok', false, 'd', 'Se permitió leer');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Anónimo: sin acceso a familias', 'ok', true, 'd', sqlerrm);
    end;

    perform set_config('role', v_rol, true);

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

select * from pg_temp.verificar_familias();
