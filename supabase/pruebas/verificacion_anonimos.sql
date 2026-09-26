-- =====================================================================
-- VERIFICACIÓN AUTOMÁTICA · APORTACIONES ANÓNIMAS (migración 08)
--
-- Cómo usar: pegue TODO este archivo en el SQL Editor de Supabase y
-- presione "Run" después de ejecutar 20260926000800_aportaciones_anonimas.sql.
--
-- Igual que las demás verificaciones, todo se ejecuta dentro de una
-- subtransacción que se REVIERTE al final: no deja datos de prueba.
--
-- Resultado: una tabla con cada prueba. Todas deben decir "OK".
-- =====================================================================

create or replace function pg_temp.verificar_anonimos()
returns table (n bigint, prueba text, resultado text, detalle text)
language plpgsql
as $$
declare
  v_log        jsonb := '[]'::jsonb;
  v_rol        text := current_user;
  v_admin      uuid := gen_random_uuid();
  v_admin_mail text := 'prueba.anonimos@verificacion.local';
  v_anon uuid; v_m1 uuid; v_fam uuid;
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
    select count(*) into v_cnt from public.miembros where es_anonimo;
    v_log := v_log || jsonb_build_object('p', 'Existe exactamente un donante anónimo', 'ok', v_cnt = 1, 'd', v_cnt || ' registro(s)');
    select id into v_anon from public.miembros where es_anonimo;

    select count(*) into v_cnt from public.miembros where id = v_anon and activo and familia_id is null;
    v_log := v_log || jsonb_build_object('p', 'El donante anónimo está activo y sin familia', 'ok', v_cnt = 1, 'd', '');

    select count(*) into v_cnt from public.miembros where id = v_anon and nombre = 'Anónimo' and apellido = '';
    v_log := v_log || jsonb_build_object('p', 'El donante anónimo se llama literalmente "Anónimo"', 'ok', v_cnt = 1, 'd', '');

    select count(*) into v_cnt from information_schema.columns
     where table_schema = 'public' and table_name = 'v_aportaciones' and column_name = 'miembro_anonimo';
    v_log := v_log || jsonb_build_object('p', 'La vista de aportaciones incluye miembro_anonimo', 'ok', v_cnt = 1, 'd', '');

    -- ------------------------------------------------------------------
    -- Actuar como SUPER ADMIN
    -- ------------------------------------------------------------------
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated', 'email', v_admin_mail)::text, true);
    perform set_config('role', 'authenticated', true);

    begin
      insert into public.miembros (nombre, apellido, es_anonimo) values ('Otro', 'Anónimo', true);
      v_log := v_log || jsonb_build_object('p', 'No se puede crear un segundo donante anónimo', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'No se puede crear un segundo donante anónimo', 'ok', true, 'd', sqlerrm);
    end;

    insert into public.miembros (nombre, apellido) values ('Persona', 'Verificación') returning id into v_m1;
    select count(*) into v_cnt from public.miembros where id = v_m1 and not es_anonimo;
    v_log := v_log || jsonb_build_object('p', 'Los miembros nuevos no son anónimos', 'ok', v_cnt = 1, 'd', '');

    begin
      update public.miembros set es_anonimo = true where id = v_m1;
      v_log := v_log || jsonb_build_object('p', 'No se puede convertir otro miembro en anónimo', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'No se puede convertir otro miembro en anónimo', 'ok', true, 'd', sqlerrm);
    end;

    begin
      update public.miembros set es_anonimo = false where id = v_anon;
      v_log := v_log || jsonb_build_object('p', 'No se puede quitar la marca de anónimo', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'No se puede quitar la marca de anónimo', 'ok', true, 'd', sqlerrm);
    end;

    begin
      update public.miembros set activo = false where id = v_anon;
      v_log := v_log || jsonb_build_object('p', 'El donante anónimo no puede desactivarse', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'El donante anónimo no puede desactivarse', 'ok', true, 'd', sqlerrm);
    end;

    insert into public.familias (nombre) values ('Familia Verificación') returning id into v_fam;
    begin
      update public.miembros set familia_id = v_fam where id = v_anon;
      v_log := v_log || jsonb_build_object('p', 'El donante anónimo no puede pertenecer a una familia', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'El donante anónimo no puede pertenecer a una familia', 'ok', true, 'd', sqlerrm);
    end;

    begin
      delete from public.miembros where id = v_anon;
      v_log := v_log || jsonb_build_object('p', 'El donante anónimo no puede eliminarse', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'El donante anónimo no puede eliminarse', 'ok', true, 'd', sqlerrm);
    end;

    update public.miembros set notas = 'Nota de prueba' where id = v_anon;
    select count(*) into v_cnt from public.miembros where id = v_anon and notas = 'Nota de prueba';
    v_log := v_log || jsonb_build_object('p', 'Las notas del donante anónimo se pueden editar', 'ok', v_cnt = 1, 'd', '');

    update public.miembros set nombre = 'Juan', apellido = 'Pérez' where id = v_anon;
    select count(*) into v_cnt from public.miembros where id = v_anon and nombre = 'Anónimo' and apellido = '';
    v_log := v_log || jsonb_build_object('p', 'El nombre "Anónimo" no se puede cambiar', 'ok', v_cnt = 1, 'd', '');

    begin
      insert into public.miembros (nombre, apellido) values ('Sin', '  ');
      v_log := v_log || jsonb_build_object('p', 'Los demás miembros siguen necesitando apellido', 'ok', false, 'd', 'Se permitió');
    exception when others then
      v_log := v_log || jsonb_build_object('p', 'Los demás miembros siguen necesitando apellido', 'ok', true, 'd', sqlerrm);
    end;

    -- Aportaciones
    insert into public.aportaciones (miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id, descripcion)
    values (v_anon, v_hoy, v_fondo, 87.50, v_metodo, 'Ofrenda del servicio');
    v_r := public.buscar_aportaciones(jsonb_build_object('miembro_id', v_anon, 'desde', v_hoy, 'hasta', v_hoy, 'estado', 'REGISTRADA'));
    v_log := v_log || jsonb_build_object('p', 'Se registran aportaciones anónimas',
      'ok', (v_r ->> 'cantidad_validas')::int >= 1, 'd', '$' || (v_r ->> 'total_validas'));
    v_log := v_log || jsonb_build_object('p', 'Las filas de la búsqueda marcan miembro_anonimo',
      'ok', (v_r -> 'filas' -> 0 ->> 'miembro_anonimo')::boolean, 'd', '');

    v_r := public.resumen_dashboard();
    select count(*) into v_cnt from public.miembros m
     where not m.es_anonimo and coalesce(to_jsonb(m) ->> 'registro_sistema', '') = '';
    v_log := v_log || jsonb_build_object('p', 'El panel de inicio no cuenta al donante anónimo como miembro',
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

select * from pg_temp.verificar_anonimos();
