/**
 * stripe-webhook — Edge Function
 *
 * Handles Stripe webhook events to update order status in the DB.
 * Called by Stripe after payment is completed, failed, or refunded.
 *
 * POST /functions/v1/stripe-webhook
 * Headers: stripe-signature (validated via STRIPE_WEBHOOK_SECRET)
 *
 * Environment variables:
 *   STRIPE_SECRET_KEY      — sk_live_xxx
 *   STRIPE_WEBHOOK_SECRET  — whsec_xxx (from Stripe Dashboard → Webhooks)
 *
 * Events handled:
 *   checkout.session.completed  → create/update order (status: paid)
 *   payment_intent.failed       → update order (status: failed)
 *
 * Deploy: supabase functions deploy stripe-webhook
 * Register: stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
 */

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsHeaders } from '../_shared/cors.ts';
import { createServiceClient, errorResponse, jsonResponse } from '../_shared/auth.ts';

Deno.serve(async (req: Request) => {
  // Webhooks come as raw POST — no CORS preflight needed
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const stripeKey    = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!stripeKey || !webhookSecret) {
    return errorResponse('Stripe not configured', 500);
  }

  const stripe    = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
  const signature = req.headers.get('stripe-signature');

  if (!signature) return errorResponse('Missing stripe-signature', 400);

  let event: Stripe.Event;
  try {
    const body = await req.arrayBuffer();
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
    );
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed', err);
    return errorResponse('Invalid signature', 400);
  }

  const supabase = createServiceClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const { error } = await supabase
        .from('orders')
        .upsert({
          stripe_session_id:  session.id,
          stripe_payment_id:  session.payment_intent as string,
          customer_email:     session.customer_email,
          customer_name:      session.metadata?.customer_name,
          amount_total:       (session.amount_total ?? 0) / 100,
          currency:           session.currency,
          order_status:       'paid',
          paid_at:            new Date().toISOString(),
          metadata:           session.metadata ?? {},
        }, { onConflict: 'stripe_session_id' });

      if (error) {
        console.error('[stripe-webhook] upsert order failed', error);
        return errorResponse('DB error', 500);
      }
      console.info('[stripe-webhook] order created/updated:', session.id);
      break;
    }

    case 'payment_intent.payment_failed': {
      const intent = event.data.object as Stripe.PaymentIntent;
      await supabase
        .from('orders')
        .update({ order_status: 'failed' })
        .eq('stripe_payment_id', intent.id);
      break;
    }

    default:
      // Ignore unhandled events
      console.info('[stripe-webhook] unhandled event type:', event.type);
  }

  return jsonResponse({ received: true });
});
