// ============================================================
// Edge Function: create-checkout
// Creates a Stripe Checkout session for the caller's tenant.
// Deploy:  supabase functions deploy create-checkout
// Secrets: STRIPE_SECRET_KEY, APP_URL (+ SUPABASE_URL/SERVICE_ROLE for tenant link)
// Auth: requires the user's JWT (verify_jwt on). Body: { plan: 'pro'|'enterprise' }
// ============================================================
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:3000';

const PRICE: Record<string, string | undefined> = {
  pro: Deno.env.get('STRIPE_PRICE_PRO'),
  enterprise: Deno.env.get('STRIPE_PRICE_ENTERPRISE')
};

// CORS — the browser calls this cross-origin from the Vercel site.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    // user-scoped client to read tenant/email under RLS
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false }
    });
    const { data: userData } = await supa.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { plan } = await req.json();
    const priceId = PRICE[plan];
    if (!priceId) return json({ error: 'unknown plan' }, 400);

    // ensure a Stripe customer for this tenant
    const { data: billing } = await supa.rpc('api_billing_status');
    const tenant = billing?.tenant;
    let customerId = tenant?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email, name: tenant?.name, metadata: { tenant_id: tenant?.id }
      });
      customerId = customer.id;
      await supa.rpc('api_set_stripe_customer', { p_customer_id: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}/billing.html?success=1`,
      cancel_url: `${APP_URL}/billing.html?canceled=1`,
      allow_promotion_codes: true
    });

    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
