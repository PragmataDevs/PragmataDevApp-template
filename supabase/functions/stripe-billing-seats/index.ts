/**
 * stripe-billing-seats — Edge Function
 *
 * Cambia cuántas "sucursales" (seats) paga el tenant en su suscripción de Stripe
 * (auditoría M1: el tope de entities en Pro es lo que se paga). Stripe prorratea;
 * el webhook `customer.subscription.updated` escribe `team_subscriptions.quantity`
 * (aquí también se escribe para que la UI no espere al webhook: mismo valor).
 *
 * POST /functions/v1/stripe-billing-seats   (JWT del usuario, admin del team)
 * Body:    { quantity: number }   1..50
 * Returns: { quantity: number }
 * Errores: 409 no_stripe_subscription | 409 seats_below_active_entities | 400 quantity_invalid
 * Secrets: STRIPE_SECRET_KEY
 */
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { handleCors } from '../_shared/cors.ts';
import { createServiceClient, createSupabaseClient, errorResponse, jsonResponse, requireAuth } from '../_shared/auth.ts';
import { requireTeamAdmin } from '../_shared/billing.ts';

const MAX_SEATS = 50;

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const user = await requireAuth(req);
    const userClient = createSupabaseClient(req);
    const { teamId } = await requireTeamAdmin(userClient, user.id);
    const service = createServiceClient();

    let body: { quantity?: unknown };
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body');
    }
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_SEATS) {
      return errorResponse('quantity_invalid', 400);
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return errorResponse('Stripe not configured', 500);

    const { data: sub } = await service
      .from('team_subscriptions')
      .select('stripe_subscription_id, sub_status, quantity')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .maybeSingle();
    if (!sub?.stripe_subscription_id) return errorResponse('no_stripe_subscription', 409);

    // No se puede pagar menos sucursales de las que ya están en uso.
    const { count } = await service
      .from('entities')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('status', 'active');
    if ((count ?? 0) > quantity) return errorResponse('seats_below_active_entities', 409);

    if (sub.quantity === quantity) return jsonResponse({ quantity });

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id as string);
    const item = current.items.data[0];
    if (!item) return errorResponse('subscription_without_items', 409);

    await stripe.subscriptions.update(current.id, {
      items: [{ id: item.id, quantity }],
      proration_behavior: 'create_prorations',
      metadata: { ...(current.metadata ?? {}), team_id: teamId },
    });

    const { error } = await service
      .from('team_subscriptions')
      .update({ quantity })
      .eq('team_id', teamId)
      .eq('status', 'active');
    if (error) console.error('[stripe-billing-seats] team_subscriptions', error);

    return jsonResponse({ quantity });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('[stripe-billing-seats]', err);
    return errorResponse('Internal error', 500);
  }
});
