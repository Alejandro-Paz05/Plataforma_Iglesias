-- =====================================================================
-- Migración 07 · Familias
-- Agrupa miembros/donantes en familias (p. ej., un matrimonio) para
-- emitir una carta anual y un estado de cuenta conjuntos.
--
--  * Cada aportación sigue perteneciendo a la persona que la dio;
--    la familia solo agrupa para los documentos.
--  * Número visible asignado por el servidor: FAM-000001.
--  * Eliminar una familia NO elimina a sus miembros: quedan sin familia.
--
-- Instalaciones existentes: pegue este archivo en el SQL Editor y pulse
-- Run una sola vez. Después ejecute supabase/pruebas/verificacion_familias.sql
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Tabla
-- ---------------------------------------------------------------------
create table public.familias (
  id              uuid primary key default gen_random_uuid(),
  numero_familia  text not null,
  nombre          text not null,
  -- Cómo se dirige la carta (p. ej., "José y María Sariñana").
  -- Si es NULL, la aplicación lo arma con los nombres de los miembros.
  nombre_carta    text,
  -- TRUE: la carta anual y el lote generan UNA carta para toda la familia.
  carta_conjunta  boolean not null default true,
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_by      uuid references auth.users (id),
  constraint familias_numero_uk      unique (numero_familia),
  constraint familias_numero_formato check (numero_familia ~ '^FAM-[0-9]{6,}$'),
  constraint familias_nombre_chk     check (length(btrim(nombre)) between 1 and 120),
  constraint familias_nombre_carta_chk check (nombre_carta is null or length(nombre_carta) <= 200)
);
comment on table public.familias is
  'Familias de miembros/donantes (carta anual y estado de cuenta conjuntos). Las aportaciones siguen siendo de cada persona.';

create index familias_nombre_idx on public.familias (nombre);

alter table public.miembros
  add column familia_id uuid references public.familias (id) on delete set null;
comment on column public.miembros.familia_id is 'Familia a la que pertenece (opcional).';

create index miembros_familia_idx on public.miembros (familia_id) where familia_id is not null;

-- ---------------------------------------------------------------------
-- Trigger: número automático, limpieza y auditoría
-- ---------------------------------------------------------------------
create or replace function public.tg_familias_antes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.nombre       := btrim(new.nombre);
  new.nombre_carta := nullif(btrim(new.nombre_carta), '');
  new.notas        := nullif(btrim(new.notas), '');

  if tg_op = 'INSERT' then
    new.numero_familia := 'FAM-' || public.formato_consecutivo(public.siguiente_consecutivo('FAMILIA'));
    new.created_at := now();
    new.created_by := auth.uid();
    new.updated_at := now();
    new.updated_by := null;
  else
    if new.numero_familia is distinct from old.numero_familia then
      raise exception 'El número de familia % no puede modificarse.', old.numero_familia
        using errcode = 'P0001';
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger familias_antes
  before insert or update on public.familias
  for each row execute function public.tg_familias_antes();

-- ---------------------------------------------------------------------
-- Bitácora: se agrega la descripción de familias (resto sin cambios)
-- ---------------------------------------------------------------------
create or replace function public.tg_bitacora()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_ref     jsonb;
  v_accion  text;
  v_desc    text;
  v_otro    text;
  v_excluir text[] := array['texto_busqueda'];
  v_ruido   text[] := array['updated_at', 'updated_by'];
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old) - v_excluir; end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new) - v_excluir; end if;
  v_ref := coalesce(v_new, v_old);

  if tg_op = 'INSERT' then
    v_accion := 'CREAR';
  elsif tg_op = 'DELETE' then
    v_accion := 'ELIMINAR';
  else
    if (v_old - v_ruido) = (v_new - v_ruido) then
      return null;  -- sin cambios reales
    end if;
    v_accion := 'MODIFICAR';
    if tg_table_name = 'aportaciones' and (v_old ->> 'estado') <> (v_new ->> 'estado') then
      v_accion := case v_new ->> 'estado'
                    when 'ANULADA' then 'ANULAR'
                    when 'CORREGIDA' then 'VINCULAR_CORRECCION'
                    else 'MODIFICAR'
                  end;
    elsif v_ref ? 'activo' and (v_old ->> 'activo') is distinct from (v_new ->> 'activo') then
      v_accion := case when (v_new ->> 'activo')::boolean then 'ACTIVAR' else 'DESACTIVAR' end;
    end if;
  end if;

  v_desc := case tg_table_name
    when 'miembros' then
      'Miembro ' || (v_ref ->> 'numero_miembro') || ' — ' || (v_ref ->> 'nombre') || ' ' || (v_ref ->> 'apellido')
    when 'aportaciones' then
      'Recibo ' || (v_ref ->> 'numero_recibo') || ' por $'
        || to_char((v_ref ->> 'monto')::numeric, 'FM999,999,999,990.00')
    when 'fondos' then 'Fondo: ' || (v_ref ->> 'nombre')
    when 'metodos_pago' then 'Método de pago: ' || (v_ref ->> 'nombre')
    when 'configuracion_iglesia' then 'Configuración institucional'
    when 'administradores' then 'Administrador: ' || (v_ref ->> 'email')
    when 'familias' then 'Familia ' || (v_ref ->> 'numero_familia') || ' — ' || (v_ref ->> 'nombre')
    else tg_table_name
  end;

  if tg_table_name = 'aportaciones' then
    if v_accion = 'ANULAR' then
      v_desc := v_desc || ' — Motivo: ' || coalesce(v_new ->> 'motivo_anulacion', '');
    elsif v_accion = 'CREAR' and (v_new ->> 'corrige_aportacion_id') is not null then
      select a.numero_recibo into v_otro from public.aportaciones a
       where a.id = (v_new ->> 'corrige_aportacion_id')::uuid;
      v_desc := v_desc || ' — Corrige el recibo ' || coalesce(v_otro, '?');
    elsif v_accion = 'VINCULAR_CORRECCION' then
      select a.numero_recibo into v_otro from public.aportaciones a
       where a.id = (v_new ->> 'corregida_por_id')::uuid;
      v_desc := v_desc || ' — Corregida por el recibo ' || coalesce(v_otro, '?');
    end if;
  elsif tg_table_name = 'miembros' and v_accion = 'MODIFICAR'
        and (v_old ->> 'familia_id') is distinct from (v_new ->> 'familia_id') then
    if (v_new ->> 'familia_id') is null then
      v_desc := v_desc || ' — Retirado de su familia';
    else
      select f.numero_familia || ' ' || f.nombre into v_otro from public.familias f
       where f.id = (v_new ->> 'familia_id')::uuid;
      v_desc := v_desc || ' — Asignado a la familia ' || coalesce(v_otro, '?');
    end if;
  end if;

  insert into public.bitacora (
    usuario_id, usuario_email, accion, tabla_afectada, registro_id,
    descripcion, datos_anteriores, datos_nuevos
  ) values (
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', 'sistema:' || session_user),
    v_accion,
    tg_table_name,
    coalesce(v_ref ->> 'id', v_ref ->> 'user_id'),
    v_desc,
    v_old,
    v_new
  );
  return null;
end;
$$;

create trigger familias_bitacora
  after insert or update or delete on public.familias
  for each row execute function public.tg_bitacora();

-- ---------------------------------------------------------------------
-- Vista de aportaciones: se agrega familia_id al final (resto sin cambios)
-- ---------------------------------------------------------------------
create or replace view public.v_aportaciones
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
  a.motivo_anulacion,
  m.familia_id
from public.aportaciones a
join public.miembros m       on m.id = a.miembro_id
join public.fondos f         on f.id = a.fondo_id
join public.metodos_pago mp  on mp.id = a.metodo_pago_id
left join public.aportaciones ao    on ao.id = a.corrige_aportacion_id
left join public.aportaciones ac    on ac.id = a.corregida_por_id
left join public.administradores cre on cre.user_id = a.created_by
left join public.administradores anu on anu.user_id = a.anulada_by;

-- ---------------------------------------------------------------------
-- Búsqueda de aportaciones: nuevo filtro familia_id (resto sin cambios)
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
  v_familia uuid := nullif(p_filtros ->> 'familia_id', '')::uuid;
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
      and (v_familia is null or v.familia_id = v_familia)
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
-- Seguridad: privilegios mínimos + RLS (solo SUPER ADMIN)
-- ---------------------------------------------------------------------
revoke all on table public.familias from anon, authenticated;
grant select, insert, update, delete on public.familias to authenticated;

alter table public.familias enable row level security;

create policy familias_select on public.familias
  for select to authenticated using ((select public.es_super_admin()));
create policy familias_insert on public.familias
  for insert to authenticated with check ((select public.es_super_admin()));
create policy familias_update on public.familias
  for update to authenticated
  using ((select public.es_super_admin())) with check ((select public.es_super_admin()));
create policy familias_delete on public.familias
  for delete to authenticated using ((select public.es_super_admin()));

-- La vista se reemplazó: se reafirman sus privilegios.
revoke all on table public.v_aportaciones from anon, authenticated;
grant select on public.v_aportaciones to authenticated;

revoke execute on function public.buscar_aportaciones(jsonb, integer, integer, text) from public, anon;
grant  execute on function public.buscar_aportaciones(jsonb, integer, integer, text) to authenticated;

revoke execute on function public.tg_familias_antes() from public, anon, authenticated;
revoke execute on function public.tg_bitacora()       from public, anon, authenticated;

commit;
