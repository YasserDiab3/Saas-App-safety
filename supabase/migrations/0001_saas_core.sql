-- ============================================================
-- 0001_saas_core.sql
-- HSE SaaS — Core multi-tenant schema (tenants, plans, billing, users)
-- Postgres / Supabase. Safe to re-run (idempotent where practical).
-- ============================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()

create schema if not exists app;

-- ------------------------------------------------------------
-- Helper: current tenant id from the JWT.
-- Supabase exposes JWT claims via request.jwt.claims (GUC).
-- We look for tenant_id in app_metadata first, then top-level.
-- ------------------------------------------------------------
create or replace function app.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id'),
      (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')
    ),
    ''
  )::uuid
$$;

-- Helper: current auth user id
create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'sub'),
    ''
  )::uuid
$$;

-- Helper: updated_at touch trigger
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- plans : subscription tiers + their limits
-- ------------------------------------------------------------
create table if not exists app.plans (
  id            text primary key,                 -- 'free' | 'pro' | 'enterprise'
  name          text not null,
  price_id      text,                             -- Stripe price id
  max_users     integer not null default 5,
  storage_mb    integer not null default 100,
  modules       jsonb   not null default '[]',    -- enabled module keys ([] = all)
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- tenants : the organization (one customer)
-- ------------------------------------------------------------
create table if not exists app.tenants (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text unique,
  logo_url       text,
  default_lang   text not null default 'ar',
  plan_id        text not null default 'free' references app.plans(id),
  status         text not null default 'trialing',  -- trialing|active|past_due|frozen|canceled
  trial_ends_at  timestamptz,
  settings       jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_tenants_updated before update on app.tenants
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------
-- profiles : 1-1 with auth.users (Supabase Auth)
-- ------------------------------------------------------------
create table if not exists app.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text,
  full_name          text,
  default_tenant_id  uuid references app.tenants(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger trg_profiles_updated before update on app.profiles
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------
-- tenant_users : membership + role (a user may join many tenants)
-- ------------------------------------------------------------
create table if not exists app.tenant_users (
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  user_id     uuid not null references app.profiles(id) on delete cascade,
  role        text not null default 'user',  -- owner|admin|safety_officer|user
  status      text not null default 'active',-- active|invited|disabled
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index if not exists idx_tenant_users_user on app.tenant_users(user_id);
create trigger trg_tenant_users_updated before update on app.tenant_users
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------
-- subscriptions : Stripe subscription state per tenant
-- ------------------------------------------------------------
create table if not exists app.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references app.tenants(id) on delete cascade,
  stripe_customer_id    text,
  stripe_subscription_id text,
  plan_id               text references app.plans(id),
  status                text,   -- mirrors Stripe: trialing|active|past_due|canceled|...
  current_period_end    timestamptz,
  cancel_at_period_end  boolean default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_subscriptions_tenant on app.subscriptions(tenant_id);
create unique index if not exists uq_subscriptions_stripe on app.subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;
create trigger trg_subscriptions_updated before update on app.subscriptions
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------
-- invitations : invite users into a tenant
-- ------------------------------------------------------------
create table if not exists app.invitations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  email       text not null,
  role        text not null default 'user',
  token       text not null unique,
  invited_by  uuid references app.profiles(id) on delete set null,
  accepted_at timestamptz,
  expires_at  timestamptz not null default (now() + interval '14 days'),
  created_at  timestamptz not null default now()
);
create index if not exists idx_invitations_tenant on app.invitations(tenant_id);

-- ------------------------------------------------------------
-- audit_log : sensitive operations per tenant
-- ------------------------------------------------------------
create table if not exists app.audit_log (
  id          bigint generated always as identity primary key,
  tenant_id   uuid references app.tenants(id) on delete cascade,
  user_id     uuid,
  action      text,
  entity      text,
  entity_id   text,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_tenant_time on app.audit_log(tenant_id, created_at desc);

-- ============================================================
-- RLS — enable + policies
-- A member can see/act within tenants they belong to (tenant_users),
-- and rows scoped by app.current_tenant_id() (the active tenant claim).
-- ============================================================
alter table app.tenants        enable row level security;
alter table app.profiles       enable row level security;
alter table app.tenant_users   enable row level security;
alter table app.subscriptions  enable row level security;
alter table app.invitations    enable row level security;
alter table app.audit_log      enable row level security;
alter table app.plans          enable row level security;

-- plans are public-readable (needed for pricing/onboarding); writes via service role only
drop policy if exists plans_read on app.plans;
create policy plans_read on app.plans for select using (true);

-- profiles: a user sees/updates their own profile
drop policy if exists profiles_self on app.profiles;
create policy profiles_self on app.profiles
  using (id = app.current_user_id())
  with check (id = app.current_user_id());

-- tenant_users: members can read memberships of their active tenant
drop policy if exists tenant_users_member on app.tenant_users;
create policy tenant_users_member on app.tenant_users
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- tenants: members can read/update their active tenant
drop policy if exists tenants_member on app.tenants;
create policy tenants_member on app.tenants
  using (id = app.current_tenant_id())
  with check (id = app.current_tenant_id());

-- subscriptions / invitations / audit_log: scoped to active tenant
drop policy if exists subscriptions_tenant on app.subscriptions;
create policy subscriptions_tenant on app.subscriptions
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop policy if exists invitations_tenant on app.invitations;
create policy invitations_tenant on app.invitations
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop policy if exists audit_tenant on app.audit_log;
create policy audit_tenant on app.audit_log
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- NOTE: the service-role key (used only by Edge Functions) bypasses RLS.
-- The /api router still injects tenant_id from the verified JWT on every query.
