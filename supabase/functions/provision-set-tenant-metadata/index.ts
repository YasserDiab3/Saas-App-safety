// ============================================================
// Edge Function: provision-set-tenant-metadata
// After api_provision_tenant succeeds, sets app_metadata.tenant_id
// on the auth user so subsequent JWTs carry tenant_id.
// Deploy:  supabase functions deploy provision-set-tenant-metadata
// Secrets: SUPABASE_SERVICE_ROLE_KEY (for admin auth update)
// Auth: requires the user's JWT (verify_jwt on). Body: { tenant_id }
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = new Set([
  Deno.env.get('APP_URL') ?? 'http://localhost:3000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://saas-app-safety.vercel.app',
  'https://tbkajjarkqhsdiabufjv.supabase.co',
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : (Deno.env.get('APP_URL') ?? 'https://saas-app-safety.vercel.app');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error('missing env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
    }

    // user-scoped client to verify JWT + read membership
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
      });
    }

    const { tenant_id } = await req.json();
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: 'tenant_id required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
      });
    }

    // verify caller is a member of this tenant
    const { data: me, error: meErr } = await userClient.rpc('api_me');
    if (meErr || !me || me.tenant_id !== tenant_id) {
      return new Response(JSON.stringify({ error: 'forbidden: not a member' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
      });
    }

    // admin client with service_role to update app_metadata
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
      app_metadata: { tenant_id },
    });
    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, tenant_id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }
});
