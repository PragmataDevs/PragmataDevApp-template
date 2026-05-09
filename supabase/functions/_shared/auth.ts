/**
 * Auth helpers for Supabase Edge Functions.
 * Use requireAuth() to protect endpoints that need a logged-in user.
 *
 * Usage:
 *   import { requireAuth } from '../_shared/auth.ts';
 *   const user = await requireAuth(req);   // throws Response if not authed
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';

/** Creates a Supabase client using the incoming request's auth token. */
export function createSupabaseClient(req: Request) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: {
        headers: { Authorization: req.headers.get('Authorization') ?? '' },
      },
    }
  );
}

/** Creates a service-role client (bypasses RLS — use with caution). */
export function createServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Validates the JWT from the Authorization header.
 * Throws a 401 Response if the user is not authenticated.
 */
export async function requireAuth(req: Request): Promise<AuthUser> {
  const supabase = createSupabaseClient(req);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return { id: user.id, email: user.email! };
}

/** Returns a standardized JSON error response. */
export function errorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Returns a standardized JSON success response. */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
