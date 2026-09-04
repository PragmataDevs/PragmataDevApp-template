/**
 * stripe-billing-checkout — Edge Function
 *
 * Crea una sesión de Stripe Checkout en modo SUSCRIPCIÓN para que el admin de un
 * tenant pase su team a un plan de paga. Cantidad = número de sucursales
 * (entities activas) porque el precio es por sucursal.
 *
 * POST /functions/v1/stripe-billing-checkout   (JWT del usuario, verify_jwt = true)
 * Body:    { plan_code: string }
 * Returns: { url: string }
 *
 * Secrets: STRIPE_SECRET_KEY, APP_URL (https://app.tuproducto.com; fallback: origin de la request)
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
    const userClient = createSupabaseClient(req);
    const service = createServiceClient();

    const body = (await req.json().catch(() => ({}))) as { plan_code?: string };
    const planCode = (body.plan_code ?? '').trim();
    if (!/^[a-z0-9_-]{2,40}$/.test(planCode)) return errorResponse('plan_code inválido');

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return errorResponse('Stripe not configured', 500);

    // Modo plataforma encendido
    const { data: settings } = await service.from('platform_settings').select('platform_mode').eq('id', 1).maybeSingle();
    if (!settings?.platform_mode) return errorResponse('platform_mode_off', 403);

    const { teamId, email, teamName } = await requireTeamAdmin(userClient, user.id);

    // Plan con precio en Stripe
    const { data: plan } = await service
      .from('subscription_plans')
      .select('code, nombre, producto, precio_mxn, stripe_price_id, is_public')
      .eq('code', planCode)
      .eq('status', 'active')
      .maybeSingle();
    if (!plan || !plan.is_public) return errorResponse('plan_not_found', 404);
    if (!plan.stripe_price_id) return errorResponse('plan_without_stripe_price', 409);

    // Suscripción actual del team (la crea create_tenant; si no existe, algo anda mal)
    const { data: sub } = await service
      .from('team_subscriptions')
      .select('id, stripe_customer_id, stripe_subscription_id, sub_status, plan_code')
      .eq('team_id', teamId)
      .maybeSingle();
    if (!sub) return errorResponse('subscription_row_missing', 409);
    if (sub.stripe_subscription_id && sub.sub_status === 'de_paga') {
      return errorResponse('already_subscribed_use_portal', 409);
    }

    // Cantidad = sucursales activas (mínimo 1)
    const { count } = await service
      .from('entities')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('status', 'active');
    const quantity = Math.max(1, count ?? 1);

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

    // Customer: reusar o crear (y guardarlo YA, no esperar al webhook)
    let customerId = sub.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        name: teamName || undefined,
        metadata: { team_id: teamId, producto: plan.producto },
      });
      customerId = customer.id;
      await service.from('team_subscriptions').update({ stripe_customer_id: customerId }).eq('id', sub.id);
    }

    const origin = Deno.env.get('APP_URL') ?? req.headers.get('origin') ?? '';
    if (!origin) return errorResponse('APP_URL not configured', 500);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: plan.stripe_price_id, quantity }],
      allow_promotion_codes: true,          // "regalamos tiempo, no precio": cupones de meses
      success_url: `${origin}/config/plan?checkout=ok`,
      cancel_url: `${origin}/config/plan?checkout=cancel`,
      locale: 'es-419',
      metadata: { team_id: teamId, plan_code: plan.code, producto: plan.producto },
      subscription_data: { metadata: { team_id: teamId, plan_code: plan.code, producto: plan.producto } },
    });

    if (!session.url) return errorResponse('Stripe no devolvió URL', 502);
    return jsonResponse({ url: session.url });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('[stripe-billing-checkout]', err);
    return errorResponse('Internal error', 500);
  }
});
