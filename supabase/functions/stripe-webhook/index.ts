// ============================================================
// Edge Function: stripe-webhook
// Receives Stripe events and applies subscription state to the tenant.
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: supabase secrets set STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... \
//          SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
// Then add the function URL as a webhook endpoint in the Stripe dashboard.
// ============================================================
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

// Map a Stripe price id → internal plan id
function planFromPrice(priceId: string | null): string {
  const map: Record<string, string> = {};
  const pro = Deno.env.get('STRIPE_PRICE_PRO'); if (pro) map[pro] = 'pro';
  const ent = Deno.env.get('STRIPE_PRICE_ENTERPRISE'); if (ent) map[ent] = 'enterprise';
  return (priceId && map[priceId]) || 'free';
}

function customerId(sub: { customer?: string | { id?: string } }): string {
  const c = sub.customer;
  return typeof c === 'string' ? c : (c?.id ?? '');
}

async function applySub(sub: any) {
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const { error } = await admin.rpc('apply_subscription', {
    p_customer_id: customerId(sub),
    p_subscription_id: sub.id,
    p_plan_id: planFromPrice(priceId),
    p_status: sub.status,
    p_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    p_cancel_at_period_end: !!sub.cancel_at_period_end
  });
  if (error) {
    console.error('apply_subscription failed', error);
    throw error;
  }
}

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Webhook signature error: ${(err as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await applySub(event.data.object);
        break;
      case 'checkout.session.completed': {
        const s = event.data.object as any;
        if (s.subscription) {
          const sub = await stripe.subscriptions.retrieve(s.subscription as string);
          await applySub(sub);
        }
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as any;
        if (inv.subscription) {
          const sub = await stripe.subscriptions.retrieve(inv.subscription as string);
          await applySub(sub);
        }
        break;
      }
      default:
        // ignore other events
        break;
    }
    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('webhook handler error', e);
    return new Response('handler error', { status: 500 });
  }
});
