-- =====================================================================
-- INSTALACIÓN COMPLETA · Sistema de Administración de Aportaciones
-- Centro Evangelístico Ebenezer — "Tocando a las Naciones"
--
-- ARCHIVO GENERADO a partir de supabase/migrations (no editar a mano).
-- Pegue todo el contenido en Supabase → SQL Editor → Run, UNA sola vez,
-- en un proyecto nuevo. Después ejecute supabase/pruebas/verificacion_fase1.sql
-- =====================================================================


-- >>>>> 20260922000100_esquema_base.sql
-- =====================================================================
-- SISTEMA DE ADMINISTRACIÓN DE APORTACIONES
-- Centro Evangelístico Ebenezer — "Tocando a las Naciones"
--
-- Migración 01 · FASE 1: Esquema base
-- Tablas, restricciones de integridad e índices.
-- Ejecutar en orden: 01 → 06 (o usar supabase/instalacion_completa.sql).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Administradores del sistema (vinculados a Supabase Auth).
-- Las contraseñas las gestiona exclusivamente Supabase Auth.
-- ---------------------------------------------------------------------
create table public.administradores (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  nombre      text,
  rol         text not null default 'SUPER_ADMIN',
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint administradores_rol_chk check (rol in ('SUPER_ADMIN'))
);
comment on table public.administradores is
  'Usuarios de Supabase Auth autorizados para usar el sistema. Solo se modifica desde el SQL Editor.';

-- ---------------------------------------------------------------------
-- Configuración institucional (registro único).
-- ---------------------------------------------------------------------
create table public.configuracion_iglesia (
  id                      uuid primary key default gen_random_uuid(),
  registro_unico          boolean not null default true,
  nombre_iglesia          text not null,
  lema                    text,
  direccion               text,
  ciudad                  text,
  estado                  text,
  zip                     text,
  telefono                text,
  email                   text,
  sitio_web               text,
  ein                     text,
  logo_url                text,
  nombre_responsable      text,
  cargo_responsable       text,
  zona_horaria            text not null default 'America/New_York',
  texto_carta_sin_bienes  text,
  texto_carta_con_bienes  text,
  texto_carta_cierre      text,
  texto_pie_recibo        text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  updated_by              uuid references auth.users (id),
  constraint configuracion_registro_unico_uk  unique (registro_unico),
  constraint configuracion_registro_unico_chk check (registro_unico),
  constraint configuracion_nombre_chk         check (length(btrim(nombre_iglesia)) > 0),
  constraint configuracion_ein_chk            check (ein is null or ein ~ '^[0-9]{2}-?[0-9]{7}$'),
  constraint configuracion_email_chk          check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
comment on table public.configuracion_iglesia is 'Datos institucionales y textos de documentos. Registro único.';

-- ---------------------------------------------------------------------
-- Contadores transaccionales (numeración de miembros y recibos).
-- Al estar en una tabla (y no en una secuencia) la numeración es
-- consecutiva: si una transacción falla, el número no se pierde.
-- ---------------------------------------------------------------------
create table public.contadores (
  clave       text primary key,
  ultimo      bigint not null default 0,
  updated_at  timestamptz not null default now(),
  constraint contadores_ultimo_chk check (ultimo >= 0)
);
comment on table public.contadores is 'Consecutivos internos: MIEMBRO y RECIBO-<año>. No accesible desde la API.';

-- ---------------------------------------------------------------------
-- Miembros / donantes
-- ---------------------------------------------------------------------
create table public.miembros (
  id              uuid primary key default gen_random_uuid(),
  numero_miembro  text not null,
  nombre          text not null,
  apellido        text not null,
  direccion       text,
  ciudad          text,
  estado          text,
  zip             text,
  telefono        text,
  email           text,
  fecha_ingreso   date,
  tipo_persona    text not null default 'Miembro',
  activo          boolean not null default true,
  notas           text,
  -- Texto normalizado (minúsculas, sin acentos) para búsquedas rápidas.
  texto_busqueda  text generated always as (
    translate(
      lower(
        numero_miembro || ' ' || nombre || ' ' || apellido || ' ' ||
        coalesce(email, '') || ' ' || coalesce(telefono, '') || ' ' ||
        regexp_replace(coalesce(telefono, ''), '[^0-9]', '', 'g')
      ),
      'áàâäãéèêëíìîïóòôöõúùûüñç',
      'aaaaaeeeeiiiiooooouuuunc'
    )
  ) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_by      uuid references auth.users (id),
  constraint miembros_numero_uk      unique (numero_miembro),
  constraint miembros_numero_formato check (numero_miembro ~ '^EBE-[0-9]{6,}$'),
  constraint miembros_nombre_chk     check (length(btrim(nombre)) > 0),
  constraint miembros_apellido_chk   check (length(btrim(apellido)) > 0),
  constraint miembros_tipo_chk       check (tipo_persona in ('Miembro', 'Donante', 'Visitante', 'Otro')),
  constraint miembros_email_chk      check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint miembros_fecha_ingreso_chk check (fecha_ingreso is null or fecha_ingreso >= date '1900-01-01')
);
comment on table public.miembros is 'Miembros y donantes. El UUID es el identificador interno; numero_miembro (EBE-000001) es el visible.';

create index miembros_apellido_nombre_idx on public.miembros (apellido, nombre);
create index miembros_activo_idx          on public.miembros (activo);

-- ---------------------------------------------------------------------
-- Fondos
-- ---------------------------------------------------------------------
create table public.fondos (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  descripcion  text,
  orden        smallint not null default 100,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint fondos_nombre_uk  unique (nombre),
  constraint fondos_nombre_chk check (length(btrim(nombre)) between 1 and 80)
);
create unique index fondos_nombre_ci_uk on public.fondos (lower(btrim(nombre)));

-- ---------------------------------------------------------------------
-- Métodos de pago
-- (No se almacenan números de tarjeta, CVV, credenciales ni datos bancarios.)
-- ---------------------------------------------------------------------
create table public.metodos_pago (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  orden       smallint not null default 100,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint metodos_pago_nombre_uk  unique (nombre),
  constraint metodos_pago_nombre_chk check (length(btrim(nombre)) between 1 and 80)
);
create unique index metodos_pago_nombre_ci_uk on public.metodos_pago (lower(btrim(nombre)));

-- ---------------------------------------------------------------------
-- Aportaciones (tabla financiera principal)
-- Regla fundamental: no se eliminan; se ANULAN conservando el registro.
-- ---------------------------------------------------------------------
create table public.aportaciones (
  id                            uuid primary key default gen_random_uuid(),
  numero_recibo                 text not null,
  miembro_id                    uuid not null references public.miembros (id) on delete restrict,
  fecha_aportacion              date not null,
  fondo_id                      uuid not null references public.fondos (id) on delete restrict,
  monto                         numeric(12, 2) not null,
  metodo_pago_id                uuid not null references public.metodos_pago (id) on delete restrict,
  referencia_pago               text,
  bienes_servicios              boolean not null default false,
  valor_bienes_servicios        numeric(12, 2),
  descripcion_bienes_servicios  text,
  descripcion                   text,
  estado                        text not null default 'REGISTRADA',
  -- Trazabilidad de correcciones:
  --   corrige_aportacion_id → en la aportación NUEVA, apunta a la original.
  --   corregida_por_id      → en la aportación ORIGINAL, apunta a la nueva.
  corrige_aportacion_id         uuid references public.aportaciones (id) on delete restrict,
  corregida_por_id              uuid references public.aportaciones (id) on delete restrict,
  created_at                    timestamptz not null default now(),
  created_by                    uuid references auth.users (id),
  updated_at                    timestamptz,
  updated_by                    uuid references auth.users (id),
  anulada_at                    timestamptz,
  anulada_by                    uuid references auth.users (id),
  motivo_anulacion              text,

  constraint aportaciones_numero_recibo_uk   unique (numero_recibo),
  constraint aportaciones_recibo_formato     check (numero_recibo ~ '^EBE-[0-9]{4}-[0-9]{6,}$'),
  constraint aportaciones_monto_positivo     check (monto > 0),
  constraint aportaciones_estado_chk         check (estado in ('REGISTRADA', 'ANULADA', 'CORREGIDA')),
  constraint aportaciones_fecha_chk          check (fecha_aportacion >= date '2000-01-01'),
  constraint aportaciones_bienes_chk check (
    (bienes_servicios = false
       and valor_bienes_servicios is null
       and descripcion_bienes_servicios is null)
    or
    (bienes_servicios = true
       and valor_bienes_servicios is not null
       and valor_bienes_servicios >= 0
       and valor_bienes_servicios <= monto
       and length(btrim(coalesce(descripcion_bienes_servicios, ''))) > 0)
  ),
  constraint aportaciones_anulacion_chk check (
    (estado = 'REGISTRADA'
       and anulada_at is null and anulada_by is null and motivo_anulacion is null)
    or
    (estado in ('ANULADA', 'CORREGIDA')
       and anulada_at is not null
       and length(btrim(coalesce(motivo_anulacion, ''))) >= 5)
  ),
  constraint aportaciones_corregida_chk      check ((estado = 'CORREGIDA') = (corregida_por_id is not null)),
  constraint aportaciones_no_autocorreccion  check (corrige_aportacion_id is distinct from id and corregida_por_id is distinct from id)
);
comment on table public.aportaciones is
  'Aportaciones económicas. Nunca se eliminan: se anulan (ANULADA) o se corrigen (CORREGIDA) conservando el historial.';

-- Una aportación solo puede ser corregida una vez.
create unique index aportaciones_corrige_uk on public.aportaciones (corrige_aportacion_id)
  where corrige_aportacion_id is not null;

create index aportaciones_fecha_idx          on public.aportaciones (fecha_aportacion);
create index aportaciones_miembro_fecha_idx  on public.aportaciones (miembro_id, fecha_aportacion);
create index aportaciones_fondo_idx          on public.aportaciones (fondo_id);
create index aportaciones_metodo_idx         on public.aportaciones (metodo_pago_id);
create index aportaciones_estado_fecha_idx   on public.aportaciones (estado, fecha_aportacion);
create index aportaciones_created_at_idx     on public.aportaciones (created_at desc);

-- ---------------------------------------------------------------------
-- Bitácora de operaciones (solo inserción; inmutable)
-- ---------------------------------------------------------------------
create table public.bitacora (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid,
  usuario_email     text,
  accion            text not null,
  tabla_afectada    text,
  registro_id       text,
  descripcion       text,
  datos_anteriores  jsonb,
  datos_nuevos      jsonb,
  fecha_hora        timestamptz not null default now()
);
comment on table public.bitacora is 'Registro inmutable de operaciones. usuario_id no tiene FK para conservar el historial aunque se elimine el usuario.';

create index bitacora_fecha_idx     on public.bitacora (fecha_hora desc);
create index bitacora_registro_idx  on public.bitacora (tabla_afectada, registro_id);
create index bitacora_accion_idx    on public.bitacora (accion);

commit;


-- >>>>> 20260922000200_funciones_y_triggers.sql
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


-- >>>>> 20260922000300_vistas_y_funciones_rpc.sql
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


-- >>>>> 20260922000400_seguridad_rls.sql
-- =====================================================================
-- Migración 04 · FASE 1: Seguridad (privilegios + Row Level Security)
--
-- Dos capas:
--   1. Privilegios mínimos por tabla/columna (anon no tiene acceso a nada).
--   2. RLS: solo usuarios SUPER ADMIN activos (public.es_super_admin()).
-- Ninguna tabla permite DELETE de aportaciones ni escritura en bitácora.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Privilegios de tablas y vistas
-- ---------------------------------------------------------------------
revoke all on table
  public.administradores,
  public.configuracion_iglesia,
  public.contadores,
  public.miembros,
  public.fondos,
  public.metodos_pago,
  public.aportaciones,
  public.bitacora,
  public.v_aportaciones
from anon, authenticated;

grant select                         on public.administradores       to authenticated;
grant select, update                 on public.configuracion_iglesia to authenticated;
grant select, insert, update, delete on public.miembros              to authenticated;
grant select, insert, update, delete on public.fondos                to authenticated;
grant select, insert, update, delete on public.metodos_pago          to authenticated;
grant select                         on public.bitacora              to authenticated;
grant select                         on public.v_aportaciones        to authenticated;
-- contadores: sin privilegios (solo funciones internas).

-- Aportaciones: sin DELETE; INSERT/UPDATE limitados a columnas permitidas.
grant select on public.aportaciones to authenticated;
grant insert (
  id, miembro_id, fecha_aportacion, fondo_id, monto, metodo_pago_id,
  referencia_pago, bienes_servicios, valor_bienes_servicios,
  descripcion_bienes_servicios, descripcion, corrige_aportacion_id
) on public.aportaciones to authenticated;
grant update (
  descripcion, referencia_pago, descripcion_bienes_servicios,
  estado, motivo_anulacion
) on public.aportaciones to authenticated;

-- ---------------------------------------------------------------------
-- 2. Row Level Security
-- ---------------------------------------------------------------------
alter table public.administradores       enable row level security;
alter table public.configuracion_iglesia enable row level security;
alter table public.contadores            enable row level security;
alter table public.miembros              enable row level security;
alter table public.fondos                enable row level security;
alter table public.metodos_pago          enable row level security;
alter table public.aportaciones          enable row level security;
alter table public.bitacora              enable row level security;

-- Administradores (lectura)
create policy administradores_select on public.administradores
  for select to authenticated
  using ((select public.es_super_admin()));

-- Configuración (lectura y actualización; sin insertar/eliminar)
create policy configuracion_select on public.configuracion_iglesia
  for select to authenticated
  using ((select public.es_super_admin()));
create policy configuracion_update on public.configuracion_iglesia
  for update to authenticated
  using ((select public.es_super_admin()))
  with check ((select public.es_super_admin()));

-- Miembros
create policy miembros_select on public.miembros
  for select to authenticated using ((select public.es_super_admin()));
create policy miembros_insert on public.miembros
  for insert to authenticated with check ((select public.es_super_admin()));
create policy miembros_update on public.miembros
  for update to authenticated
  using ((select public.es_super_admin())) with check ((select public.es_super_admin()));
create policy miembros_delete on public.miembros
  for delete to authenticated using ((select public.es_super_admin()));

-- Fondos
create policy fondos_select on public.fondos
  for select to authenticated using ((select public.es_super_admin()));
create policy fondos_insert on public.fondos
  for insert to authenticated with check ((select public.es_super_admin()));
create policy fondos_update on public.fondos
  for update to authenticated
  using ((select public.es_super_admin())) with check ((select public.es_super_admin()));
create policy fondos_delete on public.fondos
  for delete to authenticated using ((select public.es_super_admin()));

-- Métodos de pago
create policy metodos_pago_select on public.metodos_pago
  for select to authenticated using ((select public.es_super_admin()));
create policy metodos_pago_insert on public.metodos_pago
  for insert to authenticated with check ((select public.es_super_admin()));
create policy metodos_pago_update on public.metodos_pago
  for update to authenticated
  using ((select public.es_super_admin())) with check ((select public.es_super_admin()));
create policy metodos_pago_delete on public.metodos_pago
  for delete to authenticated using ((select public.es_super_admin()));

-- Aportaciones (sin política DELETE: nunca se eliminan)
create policy aportaciones_select on public.aportaciones
  for select to authenticated using ((select public.es_super_admin()));
create policy aportaciones_insert on public.aportaciones
  for insert to authenticated with check ((select public.es_super_admin()));
create policy aportaciones_update on public.aportaciones
  for update to authenticated
  using ((select public.es_super_admin())) with check ((select public.es_super_admin()));

-- Bitácora (solo lectura; la escritura la hacen triggers y registrar_evento)
create policy bitacora_select on public.bitacora
  for select to authenticated using ((select public.es_super_admin()));

-- Contadores: RLS activo y sin políticas → inaccesible desde la API.

-- ---------------------------------------------------------------------
-- 3. Funciones: ejecución solo para usuarios autenticados
--    (cada función valida además es_super_admin()).
-- ---------------------------------------------------------------------
revoke execute on function public.es_super_admin()                                from public, anon;
revoke execute on function public.zona_horaria_iglesia()                          from public, anon;
revoke execute on function public.fecha_hoy_iglesia()                             from public, anon;
revoke execute on function public.buscar_aportaciones(jsonb, integer, integer, text) from public, anon;
revoke execute on function public.resumen_dashboard()                             from public, anon;
revoke execute on function public.anular_aportacion(uuid, text)                   from public, anon;
revoke execute on function public.corregir_aportacion(uuid, text, jsonb)          from public, anon;
revoke execute on function public.registrar_evento(text, text, text, text, jsonb) from public, anon;

grant execute on function public.es_super_admin()                                to authenticated;
grant execute on function public.zona_horaria_iglesia()                          to authenticated;
grant execute on function public.fecha_hoy_iglesia()                             to authenticated;
grant execute on function public.buscar_aportaciones(jsonb, integer, integer, text) to authenticated;
grant execute on function public.resumen_dashboard()                             to authenticated;
grant execute on function public.anular_aportacion(uuid, text)                   to authenticated;
grant execute on function public.corregir_aportacion(uuid, text, jsonb)          to authenticated;
grant execute on function public.registrar_evento(text, text, text, text, jsonb) to authenticated;

-- Pantalla de inicio de sesión: solo nombre, lema y logo.
revoke execute on function public.datos_publicos_iglesia() from public;
grant  execute on function public.datos_publicos_iglesia() to anon, authenticated;

-- Funciones internas: no invocables desde la API.
revoke execute on function public.registrar_super_admin(text, text)          from public, anon, authenticated;
revoke execute on function public.siguiente_consecutivo(text)                from public, anon, authenticated;
revoke execute on function public.formato_consecutivo(bigint)                from public, anon, authenticated;
revoke execute on function public.tg_bloquear_operacion()                    from public, anon, authenticated;
revoke execute on function public.tg_impedir_eliminar_con_aportaciones()     from public, anon, authenticated;
revoke execute on function public.tg_miembros_antes()                        from public, anon, authenticated;
revoke execute on function public.tg_catalogo_antes()                        from public, anon, authenticated;
revoke execute on function public.tg_configuracion_antes()                   from public, anon, authenticated;
revoke execute on function public.tg_aportaciones_antes_insertar()           from public, anon, authenticated;
revoke execute on function public.tg_aportaciones_despues_insertar()         from public, anon, authenticated;
revoke execute on function public.tg_aportaciones_antes_actualizar()         from public, anon, authenticated;
revoke execute on function public.tg_bitacora()                              from public, anon, authenticated;

commit;


-- >>>>> 20260922000500_datos_iniciales.sql
-- =====================================================================
-- Migración 05 · FASE 1: Datos iniciales
-- Fondos, métodos de pago y configuración institucional.
-- Los textos de documentos son editables en Configuración.
-- IMPORTANTE: revise los textos de las cartas anuales con su asesor
-- fiscal/contable antes de emitirlas.
-- =====================================================================

begin;

insert into public.fondos (nombre, descripcion, orden) values
  ('Diezmo',        'Diezmos de los miembros',                 1),
  ('Ofrenda',       'Ofrendas generales',                      2),
  ('Misiones',      'Apoyo a la obra misionera',               3),
  ('Construcción',  'Proyectos de construcción y mejoras',     4),
  ('Fondo General', 'Gastos generales de la iglesia',          5),
  ('Otros',         'Otras aportaciones',                      6)
on conflict (nombre) do nothing;

insert into public.metodos_pago (nombre, orden) values
  ('Efectivo',               1),
  ('Cheque',                 2),
  ('Zelle',                  3),
  ('ACH',                    4),
  ('Transferencia bancaria', 5),
  ('Tarjeta',                6),
  ('Otro',                   7)
on conflict (nombre) do nothing;

insert into public.configuracion_iglesia (
  nombre_iglesia, lema, zona_horaria, cargo_responsable,
  texto_carta_sin_bienes, texto_carta_con_bienes, texto_carta_cierre, texto_pie_recibo
) values (
  'Centro Evangelístico Ebenezer',
  'Tocando a las Naciones',
  'America/New_York',
  'Pastor',
$txt$Estimado(a) {nombre_donante}:

Reciba un cordial saludo en el amor de nuestro Señor Jesucristo. En nombre del {nombre_iglesia}, le expresamos nuestra sincera gratitud por su fidelidad y generosidad durante el año {anio}. Sus aportaciones hacen posible que continuemos cumpliendo la misión que Dios nos ha encomendado.

Por medio de la presente hacemos constar que, durante el período comprendido entre el 1 de enero y el 31 de diciembre de {anio}, usted realizó contribuciones a nuestra iglesia por un total de {total}, según el resumen que se presenta a continuación.

No se proporcionaron bienes ni servicios a cambio de estas contribuciones, salvo beneficios religiosos intangibles.$txt$,
$txt$Estimado(a) {nombre_donante}:

Reciba un cordial saludo en el amor de nuestro Señor Jesucristo. En nombre del {nombre_iglesia}, le expresamos nuestra sincera gratitud por su fidelidad y generosidad durante el año {anio}. Sus aportaciones hacen posible que continuemos cumpliendo la misión que Dios nos ha encomendado.

Por medio de la presente hacemos constar que, durante el período comprendido entre el 1 de enero y el 31 de diciembre de {anio}, usted realizó contribuciones a nuestra iglesia por un total de {total}, según el resumen que se presenta a continuación.

En relación con algunas de estas contribuciones, la iglesia proporcionó bienes o servicios ({descripcion_bienes}) con un valor estimado de {valor_bienes}. El monto de sus contribuciones que excede el valor de dichos bienes o servicios es de {total_deducible}.$txt$,
$txt$Le sugerimos conservar esta carta para sus registros y consultar a su asesor fiscal sobre el tratamiento de sus contribuciones.

Que el Señor le bendiga y le recompense abundantemente.

Con gratitud en Cristo,$txt$,
$txt$Gracias por su generosidad. «Cada uno dé como propuso en su corazón: no con tristeza, ni por necesidad, porque Dios ama al dador alegre.» — 2 Corintios 9:7$txt$
)
on conflict (registro_unico) do nothing;

commit;


-- >>>>> 20260922000600_storage.sql
-- =====================================================================
-- Migración 06 · FASE 1: Supabase Storage
--
--  institucional → logo e imagen institucional. Público SOLO para lectura
--                  (necesario para mostrar el logo en la pantalla de acceso).
--                  No debe contener información de miembros.
--  documentos    → PRIVADO. Copias archivadas de documentos financieros
--                  (cartas anuales). Solo SUPER ADMIN; sin modificación ni
--                  eliminación desde la aplicación.
-- =====================================================================

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('institucional', 'institucional', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- institucional: escritura solo SUPER ADMIN
create policy "institucional_select_admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'institucional' and (select public.es_super_admin()));

create policy "institucional_insert_admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'institucional' and (select public.es_super_admin()));

create policy "institucional_update_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'institucional' and (select public.es_super_admin()))
  with check (bucket_id = 'institucional' and (select public.es_super_admin()));

create policy "institucional_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'institucional' and (select public.es_super_admin()));

-- documentos: privado, solo lectura y archivo por SUPER ADMIN
create policy "documentos_select_admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos' and (select public.es_super_admin()));

create policy "documentos_insert_admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos' and (select public.es_super_admin()));

commit;
