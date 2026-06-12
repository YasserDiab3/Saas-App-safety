-- 0013_subscription_conflict_fix.sql
-- Partial unique index cannot back ON CONFLICT (stripe_subscription_id) in apply_subscription.
-- Replace with a proper UNIQUE constraint (multiple NULLs still allowed in PostgreSQL).

drop index if exists app.uq_subscriptions_stripe;

alter table app.subscriptions
  drop constraint if exists subscriptions_stripe_subscription_id_key;

alter table app.subscriptions
  add constraint subscriptions_stripe_subscription_id_key unique (stripe_subscription_id);
