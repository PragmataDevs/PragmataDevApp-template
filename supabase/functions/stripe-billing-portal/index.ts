/**
 * stripe-billing-portal — Edge Function
 *
 * Abre el portal hospedado de Stripe para que el admin del tenant cambie tarjeta,
 * vea facturas o cancele, sin escribirle a nadie.
 *
 * POST /functions/v1/stripe-billing-portal   (JWT del usuario)
 * Returns: { url: string }
 * Secrets: STRIPE_SECRET_KEY, APP_URL
 */
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { handleCors } from '../_shared/cors.ts';
import { createServiceClient, createSupabaseClient, errorResponse, jsonResponse, requireAuth } from '../_shared/auth.ts';
import { requireTeamAdmin } from '../_shared/billing.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const user = await requireAuth(req);
    const { teamId } = await requireTeamAdmin(createSupabaseClient(req), user.id);
    const service = createServiceClient();

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return errorResponse('Stripe not configured', 500);

    const { data: sub } = await service
      .from('team_subscriptions')
      .select('stripe_customer_id')
      .eq('team_id', teamId)
      .maybeSingle();
    if (!sub?.stripe_customer_id) return errorResponse('no_stripe_customer', 409);

    const origin = Deno.env.get('APP_URL') ?? req.headers.get('origin') ?? '';
    if (!origin) return errorResponse('APP_URL not configured', 500);

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id as string,
      return_url: `${origin}/config/plan`,
    });
    return jsonResponse({ url: portal.url });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('[stripe-billing-portal]', err);
    return errorResponse('Internal error', 500);
  }
});
