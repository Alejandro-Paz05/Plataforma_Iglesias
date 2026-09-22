-- =====================================================================
-- Migración 03 · FASE 1: Vistas y funciones RPC
-- Todas las funciones de consulta validan es_super_admin() y se
-- ejecutan con los permisos del usuario (RLS aplica siempre).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Vista de aportaciones con datos relacionados.
-- security_invoker = true → respeta las políticas RLS de las tablas.
-- ---------------------------------------------------------------------
create view public.v_aportaciones
with (security_invoker = true)
as
select
  a.id,
  a.numero_recibo,
  a.fecha_aportacion,
  a.monto,
  a.estado,
  a.miembro_id,
  m.numero_miembro,
  m.nombre            as miembro_nombre,
  m.apellido          as miembro_apellido,
  m.texto_busqueda    as miembro_busqueda,
  a.fondo_id,
  f.nombre            as fondo_nombre,
  a.metodo_pago_id,
  mp.nombre           as metodo_pago_nombre,
  a.referencia_pago,
  a.bienes_servicios,
  a.valor_bienes_servicios,
  a.descripcion_bienes_servicios,
  a.descripcion,
  a.corrige_aportacion_id,
  ao.numero_recibo    as corrige_numero_recibo,
  a.corregida_por_id,
  ac.numero_recibo    as corregida_por_numero_recibo,
  a.created_at,
  a.created_by,
  cre.email           as creado_por_email,
  a.updated_at,
  a.updated_by,
  a.anulada_at,
  a.anulada_by,
  anu.email           as anulada_por_email,
  a.motivo_anulacion
from public.aportaciones a
join public.miembros m       on m.id = a.miembro_id
join public.fondos f         on f.id = a.fondo_id
join public.metodos_pago mp  on mp.id = a.metodo_pago_id
left join public.aportaciones ao    on ao.id = a.corrige_aportacion_id
left join public.aportaciones ac    on ac.id = a.corregida_por_id
left join public.administradores cre on cre.user_id = a.created_by
left join public.administradores anu on anu.user_id = a.anulada_by;

comment on view public.v_aportaciones is 'Aportaciones con miembro, fondo, método y trazabilidad. Respeta RLS (security_invoker).';

-- ---------------------------------------------------------------------
-- Búsqueda unificada de aportaciones (historial, reportes, estados de
-- cuenta, cartas). Devuelve la página solicitada y los totales del
-- filtro completo. Solo las aportaciones REGISTRADAS suman al total válido.
--
-- p_filtros (jsonb): desde, hasta, fondo_id, metodo_pago_id, miembro_id,
--   estado (TODAS | REGISTRADA | ANULADA | CORREGIDA | NO_VALIDAS),
--   texto (número de recibo o datos del miembro, normalizado).
-- p_orden: 'fecha_desc' (predeterminado) | 'fecha_asc'
-- ---------------------------------------------------------------------
create or replace function public.buscar_aportaciones(
  p_filtros        jsonb   default '{}'::jsonb,
  p_limite         integer default 50,
  p_desplazamiento integer default 0,
  p_orden          text    default 'fecha_desc'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_desde   date := nullif(p_filtros ->> 'desde', '')::date;
  v_hasta   date := nullif(p_filtros ->> 'hasta', '')::date;
  v_fondo   uuid := nullif(p_filtros ->> 'fondo_id', '')::uuid;
  v_metodo  uuid := nullif(p_filtros ->> 'metodo_pago_id', '')::uuid;
  v_miembro uuid := nullif(p_filtros ->> 'miembro_id', '')::uuid;
  v_estado  text := coalesce(nullif(p_filtros ->> 'estado', ''), 'TODAS');
  v_asc     boolean := (p_orden = 'fecha_asc');
  v_tokens  text[];
  v_limite  integer := least(greatest(coalesce(p_limite, 50), 1), 50000);
  v_desp    integer := greatest(coalesce(p_desplazamiento, 0), 0);
  v_res     jsonb;
begin
  if not public.es_super_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if v_estado not in ('TODAS', 'REGISTRADA', 'ANULADA', 'CORREGIDA', 'NO_VALIDAS') then
    raise exception 'Filtro de estado no válido: %', v_estado using errcode = 'P0001';
  end if;

  -- Palabras de búsqueda (sin comodines).
  select coalesce(array_agg(t), '{}')
    into v_tokens
    from (
      select replace(replace(replace(t, '\', ''), '%', ''), '_', '') as t
      from unnest(regexp_split_to_array(lower(btrim(coalesce(p_filtros ->> 'texto', ''))), '\s+')) as t
    ) x
   where t <> '';

  with base as (
    select v.*
    from public.v_aportaciones v
    where (v_desde is null or v.fecha_aportacion >= v_desde)
      and (v_hasta is null or v.fecha_aportacion <= v_hasta)
      and (v_fondo is null or v.fondo_id = v_fondo)
      and (v_metodo is null or v.metodo_pago_id = v_metodo)
      and (v_miembro is null or v.miembro_id = v_miembro)
      and (
        v_estado = 'TODAS'
        or (v_estado = 'NO_VALIDAS' and v.estado <> 'REGISTRADA')
        or v.estado = v_estado
      )
      and not exists (
        select 1 from unnest(v_tokens) as t
        where not (lower(v.numero_recibo) like '%' || t || '%'
                   or v.miembro_busqueda like '%' || t || '%')
      )
  ),
  ordenada as (
    select b.*,
           row_number() over (
             order by
               case when v_asc then b.fecha_aportacion end asc,
               case when v_asc then b.numero_recibo end asc,
               case when not v_asc then b.fecha_aportacion end desc,
               case when not v_asc then b.created_at end desc
           ) as fila
    from base b
  )
  select jsonb_build_object(
    'filas', coalesce((
        select jsonb_agg(to_jsonb(o) - 'miembro_busqueda' - 'fila' order by o.fila)
        from ordenada o
        where o.fila > v_desp and o.fila <= v_desp + v_limite
      ), '[]'::jsonb),
    'total_filas',         (select count(*) from base),
    'cantidad_validas',    (select count(*) from base where estado = 'REGISTRADA'),
    'total_validas',       (select coalesce(sum(monto), 0) from base where estado = 'REGISTRADA'),
    'cantidad_no_validas', (select count(*) from base where estado <> 'REGISTRADA'),
    'total_no_validas',    (select coalesce(sum(monto), 0) from base where estado <> 'REGISTRADA')
  )
  into v_res;

  return v_res;
end;
$$;

-- ---------------------------------------------------------------------
-- Indicadores del dashboard (fechas según la zona horaria de la iglesia)
-- ---------------------------------------------------------------------
create or replace function public.resumen_dashboard()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tz       text := public.zona_horaria_iglesia();
  v_hoy      date := public.fecha_hoy_iglesia();
  v_anio     int  := extract(year from v_hoy)::int;
  v_ini_anio date := make_date(v_anio, 1, 1);
  v_fin_anio date := make_date(v_anio, 12, 31);
  v_ini_mes  date := make_date(v_anio, extract(month from v_hoy)::int, 1);
  v_fin_mes  date := (make_date(v_anio, extract(month from v_hoy)::int, 1) + interval '1 month')::date - 1;
  v_res      jsonb;
begin
  if not public.es_super_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'hoy',           v_hoy,
    'zona_horaria',  v_tz,
    'total_hoy',     coalesce(sum(a.monto) filter (where a.fecha_aportacion = v_hoy), 0),
    'cantidad_hoy',  count(*) filter (where a.fecha_aportacion = v_hoy),
    'total_mes',     coalesce(sum(a.monto) filter (where a.fecha_aportacion between v_ini_mes and v_fin_mes), 0),
    'cantidad_mes',  count(*) filter (where a.fecha_aportacion between v_ini_mes and v_fin_mes),
    'total_anio',    coalesce(sum(a.monto), 0),
    'cantidad_anio', count(*)
  )
  into v_res
  from public.aportaciones a
  where a.estado = 'REGISTRADA'
    and a.fecha_aportacion between v_ini_anio and v_fin_anio;

  v_res := v_res || jsonb_build_object(
    'miembros_activos', (select count(*) from public.miembros m where m.activo),
    'miembros_total',   (select count(*) from public.miembros),
    'no_validas_anio',  (
      select count(*) from public.aportaciones a
      where a.estado <> 'REGISTRADA'
        and (a.anulada_at at time zone v_tz)::date between v_ini_anio and v_fin_anio
    ),
    'por_fondo', coalesce((
      select jsonb_agg(jsonb_build_object('fondo', x.nombre, 'cantidad', x.cantidad, 'total', x.total)
                       order by x.total desc)
      from (
        select f.nombre, count(*) as cantidad, sum(a.monto) as total
        from public.aportaciones a
        join public.fondos f on f.id = a.fondo_id
        where a.estado = 'REGISTRADA'
          and a.fecha_aportacion between v_ini_anio and v_fin_anio
        group by f.nombre
      ) x
    ), '[]'::jsonb),
    'por_mes', (
      select jsonb_agg(jsonb_build_object('mes', g.mes,
                                          'cantidad', coalesce(x.cantidad, 0),
                                          'total', coalesce(x.total, 0))
                       order by g.mes)
      from generate_series(1, 12) as g(mes)
      left join (
        select extract(month from a.fecha_aportacion)::int as mes, count(*) as cantidad, sum(a.monto) as total
        from public.aportaciones a
        where a.estado = 'REGISTRADA'
          and a.fecha_aportacion between v_ini_anio and v_fin_anio
        group by 1
      ) x on x.mes = g.mes
    ),
    'recientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id,
               'numero_recibo', r.numero_recibo,
               'fecha_aportacion', r.fecha_aportacion,
               'miembro', r.miembro_nombre || ' ' || r.miembro_apellido,
               'numero_miembro', r.numero_miembro,
               'fondo', r.fondo_nombre,
               'metodo', r.metodo_pago_nombre,
               'monto', r.monto,
               'estado', r.estado)
             order by r.created_at desc)
      from (select * from public.v_aportaciones v order by v.created_at desc limit 8) r
    ), '[]'::jsonb)
  );

  return v_res;
end;
$$;

-- ---------------------------------------------------------------------
-- Anular una aportación (conserva el registro original)
-- ---------------------------------------------------------------------
create or replace function public.anular_aportacion(p_aportacion_id uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_fila public.aportaciones;
begin
  if not public.es_super_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  update public.aportaciones
     set estado = 'ANULADA',
         motivo_anulacion = p_motivo
   where id = p_aportacion_id
     and estado = 'REGISTRADA'
  returning * into v_fila;

  if not found then
    raise exception 'La aportación no existe o ya no está en estado REGISTRADA.' using errcode = 'P0001';
  end if;
  return to_jsonb(v_fila);
end;
$$;

-- ---------------------------------------------------------------------
-- Corregir una aportación en una sola transacción:
--   1. si está REGISTRADA, se anula con el motivo indicado;
--   2. se registra la nueva aportación vinculada (nuevo recibo);
--   3. la original queda CORREGIDA y apunta a la nueva.
-- También sirve para registrar la corrección de una aportación que
-- se anuló anteriormente.
-- ---------------------------------------------------------------------
create or replace function public.corregir_aportacion(
  p_aportacion_id uuid,
  p_motivo        text,
  p_datos         jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_original public.aportaciones;
  v_nueva    public.aportaciones;
begin
  if not public.es_super_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select * into v_original
    from public.aportaciones
   where id = p_aportacion_id
   for update;

  if not found then
    raise exception 'La aportación a corregir no existe.' using errcode = 'P0001';
  end if;
  if v_original.estado = 'CORREGIDA' then
    raise exception 'La aportación % ya fue corregida anteriormente.', v_original.numero_recibo using errcode = 'P0001';
  end if;

  if v_original.estado = 'REGISTRADA' then
    update public.aportaciones
       set estado = 'ANULADA',
           motivo_anulacion = p_motivo
     where id = p_aportacion_id;
  end if;

  insert into public.aportaciones (
    miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id,
    referencia_pago, bienes_servicios, valor_bienes_servicios,
    descripcion_bienes_servicios, descripcion, corrige_aportacion_id
  ) values (
    (p_datos ->> 'miembro_id')::uuid,
    (p_datos ->> 'fecha_aportacion')::date,
    (p_datos ->> 'fondo_id')::uuid,
    (p_datos ->> 'monto')::numeric,
    (p_datos ->> 'metodo_pago_id')::uuid,
    p_datos ->> 'referencia_pago',
    coalesce((p_datos ->> 'bienes_servicios')::boolean, false),
    nullif(p_datos ->> 'valor_bienes_servicios', '')::numeric,
    p_datos ->> 'descripcion_bienes_servicios',
    p_datos ->> 'descripcion',
    p_aportacion_id
  )
  returning * into v_nueva;

  return to_jsonb(v_nueva);
end;
$$;

-- ---------------------------------------------------------------------
-- Registro de eventos de la aplicación (documentos, sesiones, exportaciones).
-- El usuario siempre es el autenticado; las acciones están restringidas.
-- ---------------------------------------------------------------------
create or replace function public.registrar_evento(
  p_accion      text,
  p_tabla       text default null,
  p_registro_id text default null,
  p_descripcion text default null,
  p_datos       jsonb default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.es_super_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_accion not in (
    'INICIAR_SESION', 'CERRAR_SESION',
    'GENERAR_RECIBO', 'GENERAR_ESTADO_CUENTA', 'GENERAR_CARTA_ANUAL',
    'GENERAR_REPORTE', 'EXPORTAR_DATOS', 'ARCHIVAR_DOCUMENTO', 'ACTUALIZAR_LOGO'
  ) then
    raise exception 'Acción de bitácora no permitida: %', p_accion using errcode = 'P0001';
  end if;

  insert into public.bitacora (usuario_id, usuario_email, accion, tabla_afectada, registro_id, descripcion, datos_nuevos)
  values (
    auth.uid(),
    auth.jwt() ->> 'email',
    p_accion,
    left(p_tabla, 60),
    left(p_registro_id, 100),
    left(p_descripcion, 500),
    case when p_datos is null or pg_column_size(p_datos) > 8192 then null else p_datos end
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Datos públicos para la pantalla de inicio de sesión (sin datos sensibles)
-- ---------------------------------------------------------------------
create or replace function public.datos_publicos_iglesia()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('nombre_iglesia', c.nombre_iglesia, 'lema', c.lema, 'logo_url', c.logo_url)
       from public.configuracion_iglesia c limit 1),
    jsonb_build_object('nombre_iglesia', 'Centro Evangelístico Ebenezer', 'lema', 'Tocando a las Naciones', 'logo_url', null)
  );
$$;

-- ---------------------------------------------------------------------
-- Alta de SUPER ADMIN. Solo desde el SQL Editor de Supabase
-- (no está disponible para la API). Uso:
--   select public.registrar_super_admin('correo@dominio.org', 'Nombre');
-- ---------------------------------------------------------------------
create or replace function public.registrar_super_admin(p_email text, p_nombre text default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select u.id into v_id
    from auth.users u
   where lower(u.email) = lower(btrim(p_email));

  if v_id is null then
    raise exception 'No existe un usuario con el correo %. Créelo primero en Authentication → Users.', p_email;
  end if;

  insert into public.administradores (user_id, email, nombre, rol, activo)
  values (v_id, lower(btrim(p_email)), p_nombre, 'SUPER_ADMIN', true)
  on conflict (user_id) do update
    set activo = true,
        rol = 'SUPER_ADMIN',
        nombre = coalesce(excluded.nombre, public.administradores.nombre);

  return 'SUPER ADMIN registrado: ' || lower(btrim(p_email));
end;
$$;

commit;
