/**
 * CORS headers for Supabase Edge Functions.
 * Import this in every function to handle preflight requests.
 *
 * Origen permitido (auditoría M5): un solo origen, el del ERP (`APP_URL`).
 * Sin `APP_URL` (local, `supabase functions serve`) se abre a `*` para que el
 * dev server y el celular en LAN lleguen. Los webhooks servidor-a-servidor
 * (Stripe) no pasan por aquí.
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

function allowedOrigin(): string {
  const raw = Deno.env.get('APP_URL')?.trim();
  if (!raw) return '*';
  try {
    return new URL(raw).origin;
  } catch {
    return '*';
  }
}

export const corsHeaders = {
  'Access-Control-Allow-Origin':  allowedOrigin(),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Vary': 'Origin',
};

/** Returns a 200 response for OPTIONS preflight, or null for other methods. */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
