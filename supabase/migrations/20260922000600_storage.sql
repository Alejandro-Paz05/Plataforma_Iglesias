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
