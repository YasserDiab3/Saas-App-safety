// ============================================================
// Edge Function: scim-v2 — SCIM 2.0 pilot for HSEHub 360
// Deploy: supabase functions deploy scim-v2 --no-verify-jwt
// Secret: SCIM_BEARER_TOKEN (platform-wide pilot token)
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const JSON_SCIM = 'application/scim+json';

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': JSON_SCIM,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type'
    }
  });
}

function unauthorized() {
  return json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    status: '401',
    detail: 'Unauthorized'
  }, 401);
}

function notImplemented(detail: string) {
  return json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    status: '501',
    detail
  }, 501);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
      }
    });
  }

  const expected = Deno.env.get('SCIM_BEARER_TOKEN') || '';
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!expected || token !== expected) return unauthorized();

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/scim-v2\/?/, '').replace(/^\//, '');

  // Service discovery
  if (req.method === 'GET' && (path === '' || path === 'ServiceProviderConfig')) {
    return json({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: false, maxResults: 0 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [{
        type: 'oauthbearertoken',
        name: 'OAuth Bearer Token',
        description: 'HSEHub SCIM pilot bearer token'
      }]
    });
  }

  if (req.method === 'GET' && path === 'Schemas') {
    return json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 1,
      Resources: [{
        id: 'urn:ietf:params:scim:schemas:core:2.0:User',
        name: 'User',
        description: 'User Account'
      }]
    });
  }

  if (path === 'Users' || path.startsWith('Users/')) {
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    if (req.method === 'GET' && path === 'Users') {
      // Pilot: empty list — full directory sync is phase-2
      return json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
        totalResults: 0,
        Resources: []
      });
    }

    if (req.method === 'POST' && path === 'Users') {
      const body = await req.json().catch(() => ({}));
      const email =
        (body && body.userName) ||
        (Array.isArray(body?.emails) && body.emails[0]?.value) ||
        '';
      const name =
        (body?.name && (body.name.formatted || body.name.givenName)) ||
        body?.displayName ||
        email;
      if (!email) {
        return json({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '400',
          detail: 'userName/email required'
        }, 400);
      }
      const { data, error } = await supa.auth.admin.createUser({
        email: String(email),
        email_confirm: true,
        user_metadata: { full_name: String(name || ''), provisioned_by: 'scim-v2' }
      });
      if (error) {
        return json({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '400',
          detail: error.message
        }, 400);
      }
      return json({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        id: data.user?.id,
        userName: email,
        active: true,
        meta: { resourceType: 'User' }
      }, 201);
    }

    if (req.method === 'DELETE' && path.startsWith('Users/')) {
      const id = path.slice('Users/'.length);
      const { error } = await supa.auth.admin.deleteUser(id);
      if (error) {
        return json({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '404',
          detail: error.message
        }, 404);
      }
      return new Response(null, { status: 204 });
    }

    return notImplemented('SCIM Users operation not implemented in pilot');
  }

  return notImplemented('SCIM path not implemented: ' + path);
});
