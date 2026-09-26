-- =====================================================================
-- VERIFICACIÓN AUTOMÁTICA · GRUPOS FAMILIARES (migración 09)
--
-- Cómo usar: pegue TODO este archivo en el SQL Editor de Supabase y
-- presione "Run" después de ejecutar 20260926000900_grupos_familiares.sql.
--
-- Igual que las demás verificaciones, todo se ejecuta dentro de una
-- subtransacción que se REVIERTE al final: no deja datos de prueba.
--
-- Resultado: una tabla con cada prueba. Todas deben decir "OK".
-- =====================================================================

create or replace function pg_temp.verificar_grupos_familiares()
returns table (n bigint, prueba text, resultado text, detalle text)
language plpgsql
as $$
declare
  v_log        jsonb := '[]'::jsonb;
  v_rol        text := current_user;
  v_admin      uuid := gen_random_uuid();
  v_admin_mail text := 'prueba.grupos@verificacion.local';
  v_gf uuid; v_anon uuid; v_m1 uuid; v_fam uuid;
  v_fondo uuid; v_metodo uuid;
  v_hoy date;
  v_cnt bigint; v_r jsonb;
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
    select count(*) into v_cnt from public.miembros where registro_sistema = 'GRUPOS_FAMILIARES';
    v_log := v_log || jsonb_build_object('p', 'Existe exactamente un registro "Grupos Familiares"', 'ok', v_cnt = 1, 'd', v_cnt || ' registro(s)');
    select id into v_gf from public.miembros where registro_sistema = 'GRUPOS_FAMILIARES';

    select count(*) into v_cnt from public.miembros
     where id = v_gf and nombre = 'Grupos Familiares' and apellido = '' and activo and familia_id is null and not es_anonimo;
    v_log := v_log || jsonb_build_object('p', 'Se llama literalmente "Grupos Familiares", activo, sin familia y no anónimo', 'ok', v_cnt = 1, 'd', '');

    select count(*) into v_cnt from public.miembros where registro_sistema = 'ANONIMO' and es_anonimo;
    v_log := v_log || jsonb_build_object('p', '"Anónimo" sigue existiendo como registro del sistema', 'ok', v_cnt = 1, 'd', '');
    select id into v_anon from public.miembros where registro_sistema = 'ANONIMO';

    select count(*) into v_cnt from information_schema.columns
     where table_schema = 'public' and table_name = 'v_aportaciones' and column_name = 'miembro_registro_sistema';
    v_log := v_log || jsonb_build_object('p', 'La vista de aportaciones incluye miembro_registro_sistema', 'ok', v_cnt = 1, 'd', '');

    -- ------------------------------------------------------------------
    -- Actuar como SUPER ADMIN
    -- ------------------------------------------------------------------
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated', 'email', v_admin_mail)::text, true);
    perform set_config('role', 'authenticated', true);

    begin
      insert into public.miembros (nombre, apellido, registro_sistema) values ('Otro', 'Grupo', 'GRUPOS_FAMILIARES');
      v_log := v_log || jsonb_build_object('p', 'No se puede crear un segundo "Grupos Familiares"', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'No se puede crear un segundo "Grupos Familiares"', 'ok', true, 'd', sqlerrm);
    end;

    begin
      insert into public.miembros (nombre, apellido, registro_sistema) values ('Otro', 'Registro', 'OTRO');
      v_log := v_log || jsonb_build_object('p', 'Solo se aceptan los registros del sistema conocidos', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Solo se aceptan los registros del sistema conocidos', 'ok', true, 'd', sqlerrm);
    end;

    insert into public.miembros (nombre, apellido) values ('Persona', 'Verificación') returning id into v_m1;

    begin
      update public.miembros set registro_sistema = 'GRUPOS_FAMILIARES' where id = v_m1;
      v_log := v_log || jsonb_build_object('p', 'No se puede convertir otro miembro en "Grupos Familiares"', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'No se puede convertir otro miembro en "Grupos Familiares"', 'ok', true, 'd', sqlerrm);
    end;

    begin
      update public.miembros set registro_sistema = null where id = v_gf;
      v_log := v_log || jsonb_build_object('p', 'No se puede quitar la marca de "Grupos Familiares"', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'No se puede quitar la marca de "Grupos Familiares"', 'ok', true, 'd', sqlerrm);
    end;

    begin
      update public.miembros set activo = false where id = v_gf;
      v_log := v_log || jsonb_build_object('p', '"Grupos Familiares" no puede desactivarse', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', '"Grupos Familiares" no puede desactivarse', 'ok', true, 'd', sqlerrm);
    end;

    insert into public.familias (nombre) values ('Familia Verificación') returning id into v_fam;
    begin
      update public.miembros set familia_id = v_fam where id = v_gf;
      v_log := v_log || jsonb_build_object('p', '"Grupos Familiares" no puede pertenecer a una familia', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', '"Grupos Familiares" no puede pertenecer a una familia', 'ok', true, 'd', sqlerrm);
    end;

    begin
      delete from public.miembros where id = v_gf;
      v_log := v_log || jsonb_build_object('p', '"Grupos Familiares" no puede eliminarse', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', '"Grupos Familiares" no puede eliminarse', 'ok', true, 'd', sqlerrm);
    end;

    begin
      delete from public.miembros where id = v_anon;
      v_log := v_log || jsonb_build_object('p', '"Anónimo" sigue sin poder eliminarse', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', '"Anónimo" sigue sin poder eliminarse', 'ok', true, 'd', sqlerrm);
    end;

    update public.miembros set nombre = 'Juan', apellido = 'Pérez', notas = 'Nota de prueba' where id = v_gf;
    select count(*) into v_cnt from public.miembros where id = v_gf and nombre = 'Grupos Familiares' and apellido = '' and notas = 'Nota de prueba';
    v_log := v_log || jsonb_build_object('p', 'Sus notas se editan, pero su nombre no cambia', 'ok', v_cnt = 1, 'd', '');

    -- Aportaciones
    insert into public.aportaciones (miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id, descripcion)
    values (v_gf, v_hoy, v_fondo, 145.00, v_metodo, 'Ofrenda de los grupos familiares');
    v_r := public.buscar_aportaciones(jsonb_build_object('miembro_id', v_gf, 'desde', v_hoy, 'hasta', v_hoy, 'estado', 'REGISTRADA'));
    v_log := v_log || jsonb_build_object('p', 'Se registran aportaciones de "Grupos Familiares"',
      'ok', (v_r ->> 'cantidad_validas')::int >= 1, 'd', '$' || (v_r ->> 'total_validas'));
    v_log := v_log || jsonb_build_object('p', 'Las filas de la búsqueda indican el registro del sistema',
      'ok', (v_r -> 'filas' -> 0 ->> 'miembro_registro_sistema') = 'GRUPOS_FAMILIARES'
            and not (v_r -> 'filas' -> 0 ->> 'miembro_anonimo')::boolean, 'd', '');

    v_r := public.resumen_dashboard();
    select count(*) into v_cnt from public.miembros where registro_sistema is null;
    v_log := v_log || jsonb_build_object('p', 'El panel de inicio no cuenta los registros del sistema como miembros',
      'ok', (v_r ->> 'miembros_total')::bigint = v_cnt, 'd', (v_r ->> 'miembros_total') || ' miembros');

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

select * from pg_temp.verificar_grupos_familiares();
