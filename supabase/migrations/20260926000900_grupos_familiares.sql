-- =====================================================================
-- Migración 09 · Grupos Familiares
-- Agrega un segundo registro del sistema, "Grupos Familiares", para las
-- aportaciones de los grupos familiares.
--
--  * Los registros del sistema se identifican con miembros.registro_sistema
--    ('ANONIMO' o 'GRUPOS_FAMILIARES'). es_anonimo se conserva por
--    compatibilidad y siempre coincide con registro_sistema = 'ANONIMO'.
--  * "Grupos Familiares" funciona como un miembro: recibos, historial,
--    reportes, estado de cuenta y carta anual. ("Anónimo" no recibe carta.)
--  * Ambos tienen nombre fijo, no pertenecen a una familia, no cuentan como
--    miembros en el panel de inicio y no pueden eliminarse ni desactivarse.
--
-- Instalaciones existentes: pegue este archivo en el SQL Editor y pulse
-- Run una sola vez. Después ejecute supabase/pruebas/verificacion_grupos_familiares.sql
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Columna, unicidad y reglas
-- ---------------------------------------------------------------------
alter table public.miembros
  add column registro_sistema text;
comment on column public.miembros.registro_sistema is
  'Registro del sistema que recibe aportaciones sin una persona: ANONIMO o GRUPOS_FAMILIARES. NULL en los demás miembros.';

update public.miembros set registro_sistema = 'ANONIMO' where es_anonimo;

-- Solo puede existir un registro de cada tipo.
create unique index miembros_registro_sistema_uk on public.miembros (registro_sistema) where registro_sistema is not null;

alter table public.miembros
  add constraint miembros_registro_sistema_chk
    check (registro_sistema in ('ANONIMO', 'GRUPOS_FAMILIARES')),
  add constraint miembros_registro_anonimo_chk
    check (es_anonimo = (registro_sistema is not distinct from 'ANONIMO'));

-- Las reglas de "Anónimo" pasan a todos los registros del sistema.
alter table public.miembros drop constraint miembros_anonimo_chk;
alter table public.miembros
  add constraint miembros_registro_sistema_reglas_chk
    check (registro_sistema is null or (activo and familia_id is null));

alter table public.miembros drop constraint miembros_apellido_chk;
alter table public.miembros
  add constraint miembros_apellido_chk check (registro_sistema is not null or length(btrim(apellido)) > 0);

-- ---------------------------------------------------------------------
-- Registro "Grupos Familiares"
--
-- OPCIONAL: si ya tenía un miembro creado a mano para las aportaciones de
-- los grupos familiares, escriba su número entre las comillas
-- (p. ej. 'EBE-000123'). Ese registro pasará a llamarse "Grupos Familiares"
-- y conservará sus aportaciones. Si lo deja vacío se crea uno nuevo.
-- ---------------------------------------------------------------------
do $$
declare
  v_numero_existente text := '';
begin
  if btrim(v_numero_existente) <> '' then
    if exists (select 1 from public.miembros
                where numero_miembro = upper(btrim(v_numero_existente)) and registro_sistema is not null) then
      raise exception 'El miembro % ya es un registro del sistema.', v_numero_existente;
    end if;
    update public.miembros
       set registro_sistema = 'GRUPOS_FAMILIARES', activo = true, familia_id = null,
           nombre = 'Grupos Familiares', apellido = ''
     where numero_miembro = upper(btrim(v_numero_existente));
    if not found then
      raise exception 'No existe el miembro %. Revise el número o deje las comillas vacías.', v_numero_existente;
    end if;
  else
    insert into public.miembros (nombre, apellido, tipo_persona, registro_sistema, notas)
    values ('Grupos Familiares', '', 'Otro', 'GRUPOS_FAMILIARES',
            'Registro del sistema para las aportaciones de los grupos familiares.');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Trigger de miembros: protege a todos los registros del sistema
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
    -- Compatibilidad: marcar es_anonimo equivale a pedir el registro ANONIMO.
    if new.es_anonimo and new.registro_sistema is null then
      new.registro_sistema := 'ANONIMO';
    end if;
  else
    if new.numero_miembro is distinct from old.numero_miembro then
      raise exception 'El número de miembro % no puede modificarse.', old.numero_miembro
        using errcode = 'P0001';
    end if;
    if new.registro_sistema is distinct from old.registro_sistema or new.es_anonimo is distinct from old.es_anonimo then
      raise exception 'No se puede cambiar cuáles son los registros del sistema (Anónimo, Grupos Familiares).'
        using errcode = 'P0001';
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;

  new.es_anonimo := new.registro_sistema is not distinct from 'ANONIMO';

  if new.registro_sistema is not null then
    -- Siempre aparecen con su nombre fijo.
    new.nombre := case new.registro_sistema when 'ANONIMO' then 'Anónimo' else 'Grupos Familiares' end;
    new.apellido := '';
    if not new.activo then
      raise exception 'El registro "%" no puede desactivarse.', new.nombre using errcode = 'P0001';
    end if;
    if new.familia_id is not null then
      raise exception 'El registro "%" no puede pertenecer a una familia.', new.nombre using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger miembros_anonimo_no_eliminar on public.miembros;
create trigger miembros_sistema_no_eliminar
  before delete on public.miembros
  for each row when (old.registro_sistema is not null)
  execute function public.tg_bloquear_operacion('Los registros del sistema (Anónimo, Grupos Familiares) no pueden eliminarse.');

-- ---------------------------------------------------------------------
-- Vista de aportaciones: se agrega miembro_registro_sistema al final (resto sin cambios)
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
  m.es_anonimo        as miembro_anonimo,
  m.registro_sistema  as miembro_registro_sistema
from public.aportaciones a
join public.miembros m       on m.id = a.miembro_id
join public.fondos f         on f.id = a.fondo_id
join public.metodos_pago mp  on mp.id = a.metodo_pago_id
left join public.aportaciones ao    on ao.id = a.corrige_aportacion_id
left join public.aportaciones ac    on ac.id = a.corregida_por_id
left join public.administradores cre on cre.user_id = a.created_by
left join public.administradores anu on anu.user_id = a.anulada_by;

-- ---------------------------------------------------------------------
-- Panel de inicio: los registros del sistema no cuentan como miembros (resto sin cambios)
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
    'miembros_activos', (select count(*) from public.miembros m where m.activo and m.registro_sistema is null),
    'miembros_total',   (select count(*) from public.miembros m where m.registro_sistema is null),
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
