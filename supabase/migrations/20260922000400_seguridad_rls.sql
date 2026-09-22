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
