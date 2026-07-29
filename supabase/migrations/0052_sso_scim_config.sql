-- SSO / SCIM tenant configuration sheet (enterprise IAM readiness).

insert into app.sheets (name, module_key, is_config) values
  ('SsoConfig', 'settings', true)
on conflict (name) do nothing;

comment on table app.sheets is 'Sheet registry; SsoConfig holds per-tenant SAML/SSO + SCIM pilot settings';
