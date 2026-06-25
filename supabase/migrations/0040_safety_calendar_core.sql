-- ============================================================
-- 0040_safety_calendar_core.sql — Safety calendar as core module
-- ============================================================

create or replace function app.core_module_keys()
returns text[]
language sql immutable
as $$ select array[
  'dashboard',
  'profile',
  'help',
  'settings',
  'users',
  'apptester',
  'safety-calendar',
  'core'
]::text[] $$;
