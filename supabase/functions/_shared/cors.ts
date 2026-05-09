/**
 * CORS headers for Supabase Edge Functions.
 * Import this in every function to handle preflight requests.
 *
 * Usage:
 *   import { corsHeaders, handleCors } from '../_shared/cors.ts';
 *
 *   Deno.serve(async (req) => {
 *     const corsResponse = handleCors(req);
 *     if (corsResponse) return corsResponse;
 *     // ... your handler
 *   });
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

/** Returns a 200 response for OPTIONS preflight, or null for other methods. */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
