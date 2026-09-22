-- =====================================================================
-- Migración 02 · FASE 1: Funciones base y triggers
-- Numeración segura, reglas de integridad financiera y bitácora.
-- Las reglas se aplican en PostgreSQL: no dependen del frontend.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Autorización
-- ---------------------------------------------------------------------
create or replace function public.es_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.administradores a
    where a.user_id = auth.uid()
      and a.activo
      and a.rol = 'SUPER_ADMIN'
  );
$$;
comment on function public.es_super_admin() is 'TRUE si el usuario autenticado es un SUPER ADMIN activo. Base de todas las políticas RLS.';

-- ---------------------------------------------------------------------
-- Zona horaria y fecha actual de la iglesia (no se asume UTC)
-- ---------------------------------------------------------------------
create or replace function public.zona_horaria_iglesia()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.zona_horaria from public.configuracion_iglesia c limit 1),
    'America/New_York'
  );
$$;

create or replace function public.fecha_hoy_iglesia()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone public.zona_horaria_iglesia())::date;
$$;

-- ---------------------------------------------------------------------
-- Consecutivos transaccionales (sin huecos si la transacción falla)
-- ---------------------------------------------------------------------
create or replace function public.siguiente_consecutivo(p_clave text)
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.contadores as c (clave, ultimo)
  values (p_clave, 1)
  on conflict (clave) do update
    set ultimo = c.ultimo + 1,
        updated_at = now()
  returning c.ultimo;
$$;

create or replace function public.formato_consecutivo(p_valor bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select lpad(p_valor::text, greatest(6, length(p_valor::text)), '0');
$$;

-- ---------------------------------------------------------------------
-- Genéricos
-- ---------------------------------------------------------------------
create or replace function public.tg_bloquear_operacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Operación no permitida sobre %. %', tg_table_name, coalesce(tg_argv[0], '')
    using errcode = 'P0001';
end;
$$;

-- Impide eliminar fondos, métodos o miembros que tengan aportaciones.
create or replace function public.tg_impedir_eliminar_con_aportaciones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_columna text := tg_argv[0];
  v_old     jsonb := to_jsonb(old);   -- jsonb: la función se usa en tablas con columnas distintas
  v_existe  boolean;
  v_nombre  text;
begin
  execute format('select exists (select 1 from public.aportaciones where %I = $1)', v_columna)
    into v_existe using (v_old ->> 'id')::uuid;
  if v_existe then
    v_nombre := case tg_table_name
      when 'miembros' then 'el miembro ' || (v_old ->> 'numero_miembro')
      when 'fondos' then 'el fondo "' || (v_old ->> 'nombre') || '"'
      when 'metodos_pago' then 'el método de pago "' || (v_old ->> 'nombre') || '"'
      else 'el registro'
    end;
    raise exception 'No se puede eliminar % porque tiene aportaciones registradas. Puede desactivarlo en su lugar.', v_nombre
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

-- ---------------------------------------------------------------------
-- Miembros
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
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger miembros_antes
  before insert or update on public.miembros
  for each row execute function public.tg_miembros_antes();

create trigger miembros_impedir_eliminar
  before delete on public.miembros
  for each row execute function public.tg_impedir_eliminar_con_aportaciones('miembro_id');

-- ---------------------------------------------------------------------
-- Fondos y métodos de pago
-- ---------------------------------------------------------------------
create or replace function public.tg_catalogo_antes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nombre := btrim(new.nombre);
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger fondos_antes
  before insert or update on public.fondos
  for each row execute function public.tg_catalogo_antes();

create trigger fondos_impedir_eliminar
  before delete on public.fondos
  for each row execute function public.tg_impedir_eliminar_con_aportaciones('fondo_id');

create trigger metodos_pago_antes
  before insert or update on public.metodos_pago
  for each row execute function public.tg_catalogo_antes();

create trigger metodos_pago_impedir_eliminar
  before delete on public.metodos_pago
  for each row execute function public.tg_impedir_eliminar_con_aportaciones('metodo_pago_id');

-- ---------------------------------------------------------------------
-- Configuración institucional
-- ---------------------------------------------------------------------
create or replace function public.tg_configuracion_antes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = new.zona_horaria) then
    raise exception 'La zona horaria "%" no es válida.', new.zona_horaria using errcode = 'P0001';
  end if;
  new.nombre_iglesia := btrim(new.nombre_iglesia);
  new.ein   := nullif(btrim(new.ein), '');
  new.email := nullif(lower(btrim(new.email)), '');
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.registro_unico := true;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger configuracion_antes
  before insert or update on public.configuracion_iglesia
  for each row execute function public.tg_configuracion_antes();

create trigger configuracion_no_eliminar
  before delete on public.configuracion_iglesia
  for each row execute function public.tg_bloquear_operacion('La configuración institucional no puede eliminarse.');

-- ---------------------------------------------------------------------
-- Aportaciones: inserción
--   * número de recibo generado en el servidor (EBE-AAAA-000001)
--   * estado inicial REGISTRADA y datos de auditoría forzados
--   * valida fondo/método activos, fecha y bienes o servicios
-- ---------------------------------------------------------------------
create or replace function public.tg_aportaciones_antes_insertar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy  date := public.fecha_hoy_iglesia();
  v_anio int;
begin
  if new.miembro_id is null or not exists (select 1 from public.miembros m where m.id = new.miembro_id) then
    raise exception 'Debe seleccionar un miembro/donante válido.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.fondos f where f.id = new.fondo_id and f.activo) then
    raise exception 'El fondo seleccionado no existe o está inactivo.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.metodos_pago mp where mp.id = new.metodo_pago_id and mp.activo) then
    raise exception 'El método de pago seleccionado no existe o está inactivo.' using errcode = 'P0001';
  end if;
  if new.fecha_aportacion is null then
    raise exception 'La fecha de la aportación es obligatoria.' using errcode = 'P0001';
  end if;
  if new.fecha_aportacion > v_hoy then
    raise exception 'La fecha de la aportación (%) no puede ser posterior a hoy (%).',
      to_char(new.fecha_aportacion, 'MM/DD/YYYY'), to_char(v_hoy, 'MM/DD/YYYY')
      using errcode = 'P0001';
  end if;
  if new.monto is null or new.monto <= 0 then
    raise exception 'El monto debe ser mayor que $0.00.' using errcode = 'P0001';
  end if;

  -- Estado y auditoría: nunca se aceptan desde el cliente.
  new.estado           := 'REGISTRADA';
  new.anulada_at       := null;
  new.anulada_by       := null;
  new.motivo_anulacion := null;
  new.corregida_por_id := null;
  new.created_at       := now();
  new.created_by       := auth.uid();
  new.updated_at       := null;
  new.updated_by       := null;

  new.referencia_pago := nullif(btrim(new.referencia_pago), '');
  new.descripcion     := nullif(btrim(new.descripcion), '');
  new.bienes_servicios := coalesce(new.bienes_servicios, false);
  if new.bienes_servicios then
    new.descripcion_bienes_servicios := nullif(btrim(new.descripcion_bienes_servicios), '');
    if new.valor_bienes_servicios is null or new.valor_bienes_servicios < 0 or new.valor_bienes_servicios > new.monto then
      raise exception 'El valor de los bienes o servicios debe estar entre $0.00 y el monto de la aportación.'
        using errcode = 'P0001';
    end if;
    if new.descripcion_bienes_servicios is null then
      raise exception 'Describa los bienes o servicios proporcionados.' using errcode = 'P0001';
    end if;
  else
    new.valor_bienes_servicios := null;
    new.descripcion_bienes_servicios := null;
  end if;

  -- Corrección: solo de una aportación ANULADA que aún no haya sido corregida.
  if new.corrige_aportacion_id is not null then
    perform 1
    from public.aportaciones o
    where o.id = new.corrige_aportacion_id
      and o.estado = 'ANULADA'
      and o.corregida_por_id is null
    for update;
    if not found then
      raise exception 'Solo puede registrarse una corrección de una aportación ANULADA que aún no haya sido corregida.'
        using errcode = 'P0001';
    end if;
  end if;

  -- Número de recibo: consecutivo por año de la aportación.
  v_anio := extract(year from new.fecha_aportacion)::int;
  new.numero_recibo := 'EBE-' || v_anio::text || '-'
    || public.formato_consecutivo(public.siguiente_consecutivo('RECIBO-' || v_anio::text));

  return new;
end;
$$;

create trigger aportaciones_antes_insertar
  before insert on public.aportaciones
  for each row execute function public.tg_aportaciones_antes_insertar();

-- Vincula la aportación original (ANULADA → CORREGIDA) con la nueva.
create or replace function public.tg_aportaciones_despues_insertar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.corrige_aportacion_id is not null then
    update public.aportaciones
       set estado = 'CORREGIDA',
           corregida_por_id = new.id
     where id = new.corrige_aportacion_id;
  end if;
  return null;
end;
$$;

create trigger aportaciones_despues_insertar
  after insert on public.aportaciones
  for each row execute function public.tg_aportaciones_despues_insertar();

-- ---------------------------------------------------------------------
-- Aportaciones: actualización
-- Transiciones permitidas:
--   REGISTRADA → REGISTRADA : solo notas (descripción, referencia, descripción de bienes)
--   REGISTRADA → ANULADA    : requiere motivo (mín. 5 caracteres)
--   ANULADA    → CORREGIDA  : solo al registrar la corrección vinculada
-- Los datos financieros (miembro, fecha, fondo, monto, método, bienes)
-- nunca se modifican.
-- ---------------------------------------------------------------------
create or replace function public.tg_aportaciones_antes_actualizar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permitidos text[];
begin
  if old.estado = 'REGISTRADA' and new.estado = 'REGISTRADA' then
    v_permitidos := array['descripcion', 'referencia_pago', 'descripcion_bienes_servicios'];
    new.descripcion     := nullif(btrim(new.descripcion), '');
    new.referencia_pago := nullif(btrim(new.referencia_pago), '');
    if old.bienes_servicios then
      new.descripcion_bienes_servicios := nullif(btrim(new.descripcion_bienes_servicios), '');
      if new.descripcion_bienes_servicios is null then
        raise exception 'Describa los bienes o servicios proporcionados.' using errcode = 'P0001';
      end if;
    end if;

  elsif old.estado = 'REGISTRADA' and new.estado = 'ANULADA' then
    new.motivo_anulacion := nullif(btrim(new.motivo_anulacion), '');
    if new.motivo_anulacion is null or length(new.motivo_anulacion) < 5 then
      raise exception 'Debe indicar el motivo de la anulación (mínimo 5 caracteres).' using errcode = 'P0001';
    end if;
    new.anulada_at := now();
    new.anulada_by := auth.uid();
    v_permitidos := array['estado', 'motivo_anulacion', 'anulada_at', 'anulada_by'];

  elsif old.estado = 'ANULADA' and new.estado = 'CORREGIDA' then
    if old.corregida_por_id is not null
       or new.corregida_por_id is null
       or not exists (
         select 1 from public.aportaciones n
         where n.id = new.corregida_por_id
           and n.corrige_aportacion_id = old.id
       ) then
      raise exception 'Transición no válida: la corrección debe registrarse como una nueva aportación vinculada.'
        using errcode = 'P0001';
    end if;
    v_permitidos := array['estado', 'corregida_por_id'];

  elsif old.estado = new.estado then
    raise exception 'La aportación % está % y no puede modificarse.', old.numero_recibo, old.estado
      using errcode = 'P0001';
  else
    raise exception 'Cambio de estado no permitido: % → %.', old.estado, new.estado
      using errcode = 'P0001';
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  v_permitidos := v_permitidos || array['updated_at', 'updated_by'];

  if (to_jsonb(new) - v_permitidos) is distinct from (to_jsonb(old) - v_permitidos) then
    raise exception 'Los datos financieros de la aportación % no pueden modificarse. Para corregir un error, anule la aportación y registre la corrección.', old.numero_recibo
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger aportaciones_antes_actualizar
  before update on public.aportaciones
  for each row execute function public.tg_aportaciones_antes_actualizar();

-- Las aportaciones nunca se eliminan físicamente.
create trigger aportaciones_no_eliminar
  before delete on public.aportaciones
  for each row execute function public.tg_bloquear_operacion('Las aportaciones no se eliminan: anúlela conservando el registro histórico.');

create trigger aportaciones_no_truncar
  before truncate on public.aportaciones
  for each statement execute function public.tg_bloquear_operacion('Las aportaciones no se eliminan.');

-- ---------------------------------------------------------------------
-- Bitácora: inmutable
-- ---------------------------------------------------------------------
create trigger bitacora_inmutable
  before update or delete on public.bitacora
  for each row execute function public.tg_bloquear_operacion('La bitácora es de solo lectura.');

create trigger bitacora_no_truncar
  before truncate on public.bitacora
  for each statement execute function public.tg_bloquear_operacion('La bitácora es de solo lectura.');

-- ---------------------------------------------------------------------
-- Bitácora automática de cambios en tablas
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

create trigger miembros_bitacora
  after insert or update or delete on public.miembros
  for each row execute function public.tg_bitacora();

create trigger fondos_bitacora
  after insert or update or delete on public.fondos
  for each row execute function public.tg_bitacora();

create trigger metodos_pago_bitacora
  after insert or update or delete on public.metodos_pago
  for each row execute function public.tg_bitacora();

create trigger aportaciones_bitacora
  after insert or update on public.aportaciones
  for each row execute function public.tg_bitacora();

create trigger configuracion_bitacora
  after insert or update on public.configuracion_iglesia
  for each row execute function public.tg_bitacora();

create trigger administradores_bitacora
  after insert or update or delete on public.administradores
  for each row execute function public.tg_bitacora();

commit;
