// Prueba de las migraciones en PostgreSQL real (PGlite) con un entorno tipo Supabase.
import { PGlite } from 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist/index.js';

const salida = document.getElementById('salida');
const log = (s) => { salida.textContent += s + '\n'; };

// Entorno mínimo que imita a Supabase.
const ENTORNO_SUPABASE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant anon, authenticated, service_role to postgres;

  create schema auth;
  create table auth.users (
    id uuid primary key, email text, aud text, role text, instance_id uuid,
    created_at timestamptz default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid
  $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                    nullif(current_setting('request.jwt.claims', true), ''))::jsonb
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;

  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;

  grant usage on schema public to anon, authenticated;
  -- Privilegios predeterminados que Supabase concede en el esquema public
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

const MIGRACIONES = [
  '20260922000100_esquema_base.sql',
  '20260922000200_funciones_y_triggers.sql',
  '20260922000300_vistas_y_funciones_rpc.sql',
  '20260922000400_seguridad_rls.sql',
  '20260922000500_datos_iniciales.sql',
  '20260922000600_storage.sql',
];

async function texto(ruta) {
  const r = await fetch(ruta, { cache: 'no-store' });
  if (!r.ok) throw new Error(`No se pudo leer ${ruta}`);
  return r.text();
}

(async () => {
  try {
    const db = await PGlite.create();
    const version = await db.query('select version() as v');
    log('PostgreSQL: ' + version.rows[0].v);
    await db.exec(ENTORNO_SUPABASE);
    log('Entorno Supabase simulado: OK');

    // ?completa → prueba el instalador único (supabase/instalacion_completa.sql)
    const archivos = new URLSearchParams(location.search).has('completa')
      ? ['../supabase/instalacion_completa.sql']
      : MIGRACIONES.map((m) => '../supabase/migrations/' + m);
    for (const archivo of archivos) {
      try {
        await db.exec(await texto(archivo));
        log('Migración OK: ' + archivo.split('/').pop());
      } catch (e) {
        log('ERROR en ' + archivo + ': ' + e.message);
        throw e;
      }
    }

    const resultado = await db.exec(await texto('../supabase/pruebas/verificacion_fase1.sql'));
    const filas = resultado[resultado.length - 1].rows;
    let fallos = 0;
    log('\n=== VERIFICACIÓN FASE 1 ===');
    for (const r of filas) {
      if (r.resultado !== 'OK') fallos++;
      log(`${String(r.n).padStart(2)}. [${r.resultado}] ${r.prueba}${r.detalle ? ' — ' + r.detalle : ''}`);
    }
    log(`\nTotal: ${filas.length} pruebas · ${filas.length - fallos} OK · ${fallos} con fallo`);

    // Alta de SUPER ADMIN (flujo del README)
    await db.exec(`insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'pastor@ebenezer.org', 'authenticated', 'authenticated');`);
    const alta = await db.query(`select public.registrar_super_admin('Pastor@Ebenezer.org', 'Pastor') as r`);
    log('\nregistrar_super_admin: ' + alta.rows[0].r);
    const cuenta = await db.query(`select count(*)::int as n from public.administradores where email = 'pastor@ebenezer.org' and activo`);
    log('Administradores activos con ese correo: ' + cuenta.rows[0].n);

    // La verificación no debe dejar datos
    const residuos = await db.query(`select (select count(*) from public.miembros)::int as miembros,
      (select count(*) from public.aportaciones)::int as aportaciones,
      (select count(*) from public.contadores)::int as contadores`);
    log('Datos residuales tras la verificación: ' + JSON.stringify(residuos.rows[0]));
    log('FIN');
  } catch (e) {
    log('ERROR: ' + (e.message || e));
  }
  document.body.dataset.listo = '1';
})();
