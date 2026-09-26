-- =====================================================================
-- Migración 08 · Aportaciones anónimas
-- Crea un registro especial llamado "Anónimo" para las aportaciones de
-- las que no se sabe quién las dio (p. ej., la ofrenda en efectivo).
--
--  * Aparece en reportes, historial y estados de cuenta como "Anónimo".
--  * Sus aportaciones cuentan en todos los totales.
--  * No recibe carta anual, no pertenece a una familia y no cuenta como
--    miembro en el panel de inicio.
--  * Solo puede existir uno; no puede eliminarse ni desactivarse.
--
-- Instalaciones existentes: pegue este archivo en el SQL Editor y pulse
-- Run una sola vez. Después ejecute supabase/pruebas/verificacion_anonimos.sql
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Columna, unicidad y reglas
-- ---------------------------------------------------------------------
alter table public.miembros
  add column es_anonimo boolean not null default false;
comment on column public.miembros.es_anonimo is
  'TRUE solo en el registro del sistema que recibe las aportaciones anónimas.';

-- Solo un registro puede ser el donante anónimo.
create unique index miembros_anonimo_uk on public.miembros ((true)) where es_anonimo;

alter table public.miembros
  add constraint miembros_anonimo_chk check (not es_anonimo or (activo and familia_id is null));

-- El donante anónimo se llama solo "Anónimo" (sin apellido).
alter table public.miembros drop constraint miembros_apellido_chk;
alter table public.miembros
  add constraint miembros_apellido_chk check (es_anonimo or length(btrim(apellido)) > 0);

-- ---------------------------------------------------------------------
-- Registro del donante anónimo
--
-- OPCIONAL: si ya tenía un miembro creado a mano para las aportaciones
-- anónimas, escriba su número entre las comillas (p. ej. 'EBE-000123').
-- Ese registro pasará a llamarse "Anónimo" y conservará sus aportaciones.
-- Si lo deja vacío se crea uno nuevo.
-- ---------------------------------------------------------------------
do $$
declare
  v_numero_existente text := '';
begin
  if btrim(v_numero_existente) <> '' then
    update public.miembros
       set es_anonimo = true, activo = true, familia_id = null, nombre = 'Anónimo', apellido = ''
     where numero_miembro = upper(btrim(v_numero_existente));
    if not found then
      raise exception 'No existe el miembro %. Revise el número o deje las comillas vacías.', v_numero_existente;
    end if;
  else
    insert into public.miembros (nombre, apellido, tipo_persona, es_anonimo, notas)
    values ('Anónimo', '', 'Otro', true,
            'Registro del sistema para las aportaciones anónimas. No recibe carta anual.');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Trigger de miembros: se protege al donante anónimo (resto sin cambios)
-- ---------------------------------------------------------------------
create or replace function public.tg_miembros_antes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.nombre    := btrim(new.nombre);
  new.apellido  := btrim(new.apellido);
  new.email     := nullif(lower(btrim(new.email)), '');
  new.telefono  := nullif(btrim(new.telefono), '');
  new.direccion := nullif(btrim(new.direccion), '');
  new.ciudad    := nullif(btrim(new.ciudad), '');
  new.estado    := nullif(btrim(new.estado), '');
  new.zip       := nullif(btrim(new.zip), '');
  new.notas     := nullif(btrim(new.notas), '');

  if tg_op = 'INSERT' then
    -- El número visible siempre lo asigna el servidor.
    new.numero_miembro := 'EBE-' || public.formato_consecutivo(public.siguiente_consecutivo('MIEMBRO'));
    new.created_at := now();
    new.created_by := auth.uid();
    new.updated_at := now();
    new.updated_by := null;
  else
    if new.numero_miembro is distinct from old.numero_miembro then
      raise exception 'El número de miembro % no puede modificarse.', old.numero_miembro
        using errcode = 'P0001';
    end if;
    if new.es_anonimo is distinct from old.es_anonimo then
      raise exception 'No se puede cambiar cuál registro es el donante anónimo.'
        using errcode = 'P0001';
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;

  if new.es_anonimo then
    -- Siempre aparece literalmente como "Anónimo".
    new.nombre   := 'Anónimo';
    new.apellido := '';
    if not new.activo then
      raise exception 'El donante anónimo no puede desactivarse.' using errcode = 'P0001';
    end if;
    if new.familia_id is not null then
      raise exception 'El donante anónimo no puede pertenecer a una familia.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger miembros_anonimo_no_eliminar
  before delete on public.miembros
  for each row when (old.es_anonimo)
  execute function public.tg_bloquear_operacion('El donante anónimo no puede eliminarse.');

-- ---------------------------------------------------------------------
-- Vista de aportaciones: se agrega miembro_anonimo al final (resto sin cambios)
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
  m.familia_id,
  m.es_anonimo        as miembro_anonimo
from public.aportaciones a
join public.miembros m       on m.id = a.miembro_id
join public.fondos f         on f.id = a.fondo_id
join public.metodos_pago mp  on mp.id = a.metodo_pago_id
left join public.aportaciones ao    on ao.id = a.corrige_aportacion_id
left join public.aportaciones ac    on ac.id = a.corregida_por_id
left join public.administradores cre on cre.user_id = a.created_by
left join public.administradores anu on anu.user_id = a.anulada_by;

-- ---------------------------------------------------------------------
-- Panel de inicio: el donante anónimo no cuenta como miembro (resto sin cambios)
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
    'miembros_activos', (select count(*) from public.miembros m where m.activo and not m.es_anonimo),
    'miembros_total',   (select count(*) from public.miembros m where not m.es_anonimo),
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
-- Seguridad: se reafirman los privilegios de lo reemplazado
-- ---------------------------------------------------------------------
revoke all on table public.v_aportaciones from anon, authenticated;
grant select on public.v_aportaciones to authenticated;

revoke execute on function public.resumen_dashboard() from public, anon;
grant  execute on function public.resumen_dashboard() to authenticated;

revoke execute on function public.tg_miembros_antes() from public, anon, authenticated;

commit;
