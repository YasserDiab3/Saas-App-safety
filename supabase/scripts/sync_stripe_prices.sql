-- sync_stripe_prices.sql
-- Run in Supabase SQL Editor AFTER setting STRIPE_PRICE_* secrets.
-- Replace price_... with your real Stripe Price IDs (Test or Live).

-- Pro plan
update app.plans
   set price_id = 'price_REPLACE_PRO'
 where id = 'pro';

-- Enterprise plan
update app.plans
   set price_id = 'price_REPLACE_ENTERPRISE'
 where id = 'enterprise';

-- Verify
select id, name, price_id, max_users from app.plans order by sort_order;
