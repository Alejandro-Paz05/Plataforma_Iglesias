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
