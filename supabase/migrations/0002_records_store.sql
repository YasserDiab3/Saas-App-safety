-- ============================================================
-- 0002_records_store.sql
-- Generic, sheet-compatible data store for the Strangler-Fig migration.
--
-- WHY a single generic table instead of 40 hand-modeled tables:
--   The frontend talks to the backend ONLY through a sheet-style contract
--   (readFromSheet / saveToSheet / appendToSheet / updateSingleRowInSheet)
--   exchanging whole row objects. Modeling every one of the ~40 sheets with
--   exact columns would (a) require reverse-engineering 48 Apps Script files,
--   and (b) break the moment a module sends a column we didn't predict.
--   A generic (tenant_id, sheet, id, data jsonb) store reproduces the sheet
--   contract EXACTLY, enforces tenant isolation via one RLS policy, and needs
--   no migration when modules evolve. High-value analytical entities can later
--   be projected into typed VIEWS without touching the write path.
-- ============================================================

-- ------------------------------------------------------------
-- app.sheets : registry of known logical sheets (for validation,
-- module-gating, and alias normalization). Global (not tenant-scoped).
-- ------------------------------------------------------------
create table if not exists app.sheets (
  name        text primary key,     -- canonical sheet name (matches frontend contract)
  module_key  text,                 -- owning module (for plan-gating)
  alias_of    text references app.sheets(name),  -- non-null = alias → canonical
  is_config   boolean not null default false,    -- per-tenant config sheet (e.g. ModuleManagement)
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- app.records : the universal per-tenant row store.
--   PK (tenant_id, sheet, id) → id is the frontend-generated string id
--   (e.g. 'CLV-..','MED-..','TASK-..',uuid). Kept as TEXT to preserve
--   existing id formats and client-generated ids.
-- ------------------------------------------------------------
create table if not exists app.records (
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  sheet       text not null,
  id          text not null,
  data        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, sheet, id)
);

-- Fast list-by-sheet (the most common query: readFromSheet)
create index if not exists idx_records_tenant_sheet
  on app.records (tenant_id, sheet);

-- JSONB containment / field lookups (filters, search)
create index if not exists idx_records_data_gin
  on app.records using gin (data jsonb_path_ops);

create trigger trg_records_updated before update on app.records
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------
-- RLS : one policy isolates every sheet for every tenant.
-- ------------------------------------------------------------
alter table app.records enable row level security;
alter table app.sheets  enable row level security;

drop policy if exists records_tenant on app.records;
create policy records_tenant on app.records
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- sheets registry is public-readable (needed for module-gating in UI)
drop policy if exists sheets_read on app.sheets;
create policy sheets_read on app.sheets for select using (true);

-- ------------------------------------------------------------
-- Convenience RPCs mirroring the sheet contract (optional — the /api
-- Edge Function may call these or run SQL directly). All run with the
-- caller's JWT so RLS applies; service role bypasses but still passes tenant.
-- ------------------------------------------------------------

-- read all rows of a sheet for the active tenant
create or replace function app.read_sheet(p_sheet text)
returns setof jsonb
language sql
stable
as $$
  select data || jsonb_build_object('id', id)
  from app.records
  where tenant_id = app.current_tenant_id()
    and sheet = p_sheet
$$;

-- upsert a single row (append or update by id)
create or replace function app.upsert_record(p_sheet text, p_id text, p_data jsonb)
returns void
language plpgsql
as $$
declare
  v_tenant uuid := app.current_tenant_id();
begin
  if v_tenant is null then
    raise exception 'no active tenant';
  end if;
  insert into app.records(tenant_id, sheet, id, data)
  values (v_tenant, p_sheet, p_id, coalesce(p_data, '{}'::jsonb) - 'id')
  on conflict (tenant_id, sheet, id)
  do update set data = excluded.data, updated_at = now();
end;
$$;

-- patch (merge) a single row
create or replace function app.patch_record(p_sheet text, p_id text, p_patch jsonb)
returns void
language plpgsql
as $$
declare
  v_tenant uuid := app.current_tenant_id();
begin
  update app.records
     set data = data || (coalesce(p_patch, '{}'::jsonb) - 'id'),
         updated_at = now()
   where tenant_id = v_tenant and sheet = p_sheet and id = p_id;
end;
$$;

-- delete a single row
create or replace function app.delete_record(p_sheet text, p_id text)
returns void
language sql
as $$
  delete from app.records
   where tenant_id = app.current_tenant_id() and sheet = p_sheet and id = p_id
$$;
