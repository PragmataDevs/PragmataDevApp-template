/**
 * stripe-billing-webhook — Edge Function
 *
 * Recibe eventos de Stripe BILLING y actualiza team_subscriptions. Hermana de
 * stripe-webhook (que es de `orders`): NO reciclar, hacen cosas distintas.
 *
 * POST /functions/v1/stripe-billing-webhook   (verify_jwt = false en config.toml)
 * Headers: stripe-signature
 * Secrets: STRIPE_SECRET_KEY, STRIPE_BILLING_WEBHOOK_SECRET (distinto del de orders)
 *
 * Idempotencia: primero INSERT en billing_events(stripe_event_id UNIQUE); si ya
 * existe → 200 y salir. Stripe reintenta y reordena; sin esto se corrompe el estado.
 *
 * Mapeo (spec §2): trialing|active → de_paga · past_due → periodo_gracia (7 días)
 *   · unpaid|incomplete_expired → suspendido · canceled → cancelado y de vuelta al
 *   plan gratis del producto.
 */
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createServiceClient, errorResponse, jsonResponse } from '../_shared/auth.ts';
import { GRACE_DAYS, defaultFreePlan, mapStripeStatus } from '../_shared/billing.ts';

const HANDLED = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
]);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const secret = Deno.env.get('STRIPE_BILLING_WEBHOOK_SECRET');
  if (!stripeKey || !secret) return errorResponse('Stripe billing not configured', 500);

  const signature = req.headers.get('stripe-signature');
  if (!signature) return errorResponse('Missing stripe-signature', 400);

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.arrayBuffer(), signature, secret);
  } catch (err) {
    console.error('[stripe-billing-webhook] firma inválida', err);
    return errorResponse('Invalid signature', 400);
  }

  const service = createServiceClient();

  // ── Idempotencia ──────────────────────────────────────────────────────────
  const { error: insErr } = await service.from('billing_events').insert({
    stripe_event_id: event.id,
    type: event.type,
    payload: HANDLED.has(event.type) ? (event.data.object as unknown as Record<string, unknown>) : {},
  });
  if (insErr) {
    if (insErr.code === '23505') {
      console.info('[stripe-billing-webhook] evento repetido, ignorado:', event.id);
      return jsonResponse({ received: true, duplicate: true });
    }
    console.error('[stripe-billing-webhook] no se pudo registrar el evento', insErr);
    return errorResponse('DB error', 500);
  }

  const fail = async (detail: string, status = 500) => {
    await service.from('billing_events').update({ error_detail: detail }).eq('stripe_event_id', event.id);
    console.error('[stripe-billing-webhook]', event.type, detail);
    return errorResponse(detail, status);
  };
  const done = async (teamId: string | null) => {
    await service.from('billing_events').update({ processed_at: new Date().toISOString(), team_id: teamId }).eq('stripe_event_id', event.id);
    return jsonResponse({ received: true });
  };

  // Localiza la fila de suscripción por subscription id, customer id o metadata.team_id
  const findSub = async (opts: { subscriptionId?: string | null; customerId?: string | null; teamId?: string | null }) => {
    if (opts.teamId) {
      const { data } = await service.from('team_subscriptions').select('*').eq('team_id', opts.teamId).maybeSingle();
      if (data) return data;
    }
    if (opts.subscriptionId) {
      const { data } = await service.from('team_subscriptions').select('*').eq('stripe_subscription_id', opts.subscriptionId).maybeSingle();
      if (data) return data;
    }
    if (opts.customerId) {
      const { data } = await service.from('team_subscriptions').select('*').eq('stripe_customer_id', opts.customerId).maybeSingle();
      if (data) return data;
    }
    return null;
  };

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode !== 'subscription') return done(null);
        const teamId = s.metadata?.team_id ?? null;
        const sub = await findSub({ teamId, customerId: typeof s.customer === 'string' ? s.customer : s.customer?.id ?? null });
        if (!sub) return fail('team_subscription_not_found_for_checkout', 409);
        const { error } = await service.from('team_subscriptions').update({
          stripe_customer_id: typeof s.customer === 'string' ? s.customer : s.customer?.id ?? sub.stripe_customer_id,
          stripe_subscription_id: typeof s.subscription === 'string' ? s.subscription : s.subscription?.id ?? sub.stripe_subscription_id,
          plan_code: s.metadata?.plan_code ?? sub.plan_code,
          sub_status: 'de_paga',
          grace_until: null,
        }).eq('id', sub.id);
        if (error) return fail(error.message);
        return done(sub.team_id);
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const st = event.data.object as Stripe.Subscription;
        const sub = await findSub({
          teamId: st.metadata?.team_id ?? null,
          subscriptionId: st.id,
          customerId: typeof st.customer === 'string' ? st.customer : st.customer?.id ?? null,
        });
        if (!sub) return fail('team_subscription_not_found', 409);
        const status = mapStripeStatus(st.status);
        const patch: Record<string, unknown> = {
          stripe_subscription_id: st.id,
          sub_status: status,
          current_period_end: st.current_period_end ? new Date(st.current_period_end * 1000).toISOString() : null,
          trial_end: st.trial_end ? new Date(st.trial_end * 1000).toISOString() : null,
          cancel_at_period_end: Boolean(st.cancel_at_period_end),
          grace_until: status === 'periodo_gracia' ? new Date(Date.now() + GRACE_DAYS * 86400000).toISOString() : null,
        };
        if (st.metadata?.plan_code) patch.plan_code = st.metadata.plan_code;
        const { error } = await service.from('team_subscriptions').update(patch).eq('id', sub.id);
        if (error) return fail(error.message);
        return done(sub.team_id);
      }

      case 'customer.subscription.deleted': {
        const st = event.data.object as Stripe.Subscription;
        const sub = await findSub({ teamId: st.metadata?.team_id ?? null, subscriptionId: st.id });
        if (!sub) return fail('team_subscription_not_found', 409);
        const { data: plan } = await service.from('subscription_plans').select('producto').eq('code', sub.plan_code).maybeSingle();
        const free = plan ? await defaultFreePlan(service, plan.producto as string) : null;
        const { error } = await service.from('team_subscriptions').update({
          sub_status: free ? 'gratis' : 'cancelado',
          plan_code: free ?? sub.plan_code,
          stripe_subscription_id: null,
          current_period_end: null,
          cancel_at_period_end: false,
          grace_until: null,
        }).eq('id', sub.id);
        if (error) return fail(error.message);
        return done(sub.team_id);
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const sub = await findSub({
          subscriptionId: typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id ?? null,
          customerId: typeof inv.customer === 'string' ? inv.customer : inv.customer?.id ?? null,
        });
        if (!sub) return fail('team_subscription_not_found', 409);
        const { error } = await service.from('team_subscriptions').update({
          sub_status: 'periodo_gracia',
          grace_until: new Date(Date.now() + GRACE_DAYS * 86400000).toISOString(),
        }).eq('id', sub.id).eq('sub_status', 'de_paga');
        if (error) return fail(error.message);
        return done(sub.team_id);
      }

      case 'invoice.payment_succeeded': {
        const inv = event.data.object as Stripe.Invoice;
        const sub = await findSub({
          subscriptionId: typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id ?? null,
          customerId: typeof inv.customer === 'string' ? inv.customer : inv.customer?.id ?? null,
        });
        if (!sub) return done(null); // primer invoice puede llegar antes del checkout.completed
        const { error } = await service.from('team_subscriptions').update({
          sub_status: 'de_paga',
          grace_until: null,
        }).eq('id', sub.id).in('sub_status', ['periodo_gracia', 'suspendido', 'de_paga']);
        if (error) return fail(error.message);
        return done(sub.team_id);
      }

      default:
        return done(null);
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
});
