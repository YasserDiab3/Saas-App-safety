-- ============================================================
-- 0012_storage.sql — tenant-scoped file attachments bucket
-- Path convention: {tenant_id}/{module}/{record_id}/{filename}
-- Apply after 0011.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-attachments',
  'tenant-attachments',
  false,
  52428800, -- 50 MB
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Helpers: first folder segment = tenant_id (uuid)
create or replace function app.storage_tenant_id(object_name text)
returns uuid
language sql stable
as $$
  select nullif(split_part(object_name, '/', 1), '')::uuid
$$;

-- SELECT: members read files in their tenant folder
drop policy if exists tenant_attachments_select on storage.objects;
create policy tenant_attachments_select on storage.objects for select
  using (
    bucket_id = 'tenant-attachments'
    and app.storage_tenant_id(name) = app.current_tenant_id()
  );

-- INSERT: writable tenants only
drop policy if exists tenant_attachments_insert on storage.objects;
create policy tenant_attachments_insert on storage.objects for insert
  with check (
    bucket_id = 'tenant-attachments'
    and app.storage_tenant_id(name) = app.current_tenant_id()
    and app.tenant_is_writable()
  );

-- UPDATE
drop policy if exists tenant_attachments_update on storage.objects;
create policy tenant_attachments_update on storage.objects for update
  using (
    bucket_id = 'tenant-attachments'
    and app.storage_tenant_id(name) = app.current_tenant_id()
  )
  with check (
    bucket_id = 'tenant-attachments'
    and app.storage_tenant_id(name) = app.current_tenant_id()
    and app.tenant_is_writable()
  );

-- DELETE
drop policy if exists tenant_attachments_delete on storage.objects;
create policy tenant_attachments_delete on storage.objects for delete
  using (
    bucket_id = 'tenant-attachments'
    and app.storage_tenant_id(name) = app.current_tenant_id()
    and app.tenant_is_writable()
  );
