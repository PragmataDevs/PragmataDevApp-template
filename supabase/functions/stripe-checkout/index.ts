/**
 * stripe-checkout — Edge Function
 *
 * Creates a Stripe Checkout Session and returns the hosted payment URL.
 * The browser then redirects the user to Stripe to complete payment.
 *
 * POST /functions/v1/stripe-checkout
 * Body: { items: CartItem[], customer: { name, email, phone? } }
 * Returns: { url: string }  ← Stripe hosted checkout URL
 *
 * Environment variables required (set in Supabase Dashboard → Edge Functions → Secrets):
 *   STRIPE_SECRET_KEY     — sk_live_xxx or sk_test_xxx
 *   PUBLIC_SITE_URL       — https://tucliente.com (for success/cancel redirects)
 *
 * For MercadoPago (LATAM): see the commented section at the bottom.
 * Deploy: supabase functions deploy stripe-checkout
 */

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { handleCors, corsHeaders } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/auth.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CartItem {
  id:       string;
  name:     string;
  price:    number;   // in MXN (whole pesos)
  quantity: number;
}

interface CheckoutBody {
  items:    CartItem[];
  customer: { name: string; email: string; phone?: string };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const body = await req.json() as CheckoutBody;
    const { items, customer } = body;

    if (!items?.length) return errorResponse('No items in cart');
    if (!customer?.email) return errorResponse('Customer email required');

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return errorResponse('Stripe not configured', 500);

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? 'https://tucliente.com';

    // Convert cart items to Stripe line items
    const lineItems = items.map((item) => ({
      price_data: {
        currency:     'mxn',
        unit_amount:  Math.round(item.price * 100),  // Stripe uses cents
        product_data: { name: item.name },
      },
      quantity: item.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode:                 'payment',
      line_items:           lineItems,
      customer_email:       customer.email,
      success_url:          `${siteUrl}/gracias?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:           `${siteUrl}/checkout`,
      metadata: {
        customer_name:  customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone ?? '',
      },
    });

    return jsonResponse({ url: session.url });

  } catch (err) {
    console.error('[stripe-checkout]', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});

// ─── MercadoPago alternative (LATAM) ─────────────────────────────────────────
//
// Replace the Stripe block above with this for MercadoPago:
//
// import { MercadoPagoConfig, Preference } from 'https://esm.sh/mercadopago@2';
//
// const client = new MercadoPagoConfig({ accessToken: Deno.env.get('MP_ACCESS_TOKEN')! });
// const preference = new Preference(client);
//
// const result = await preference.create({
//   body: {
//     items: items.map(i => ({
//       id:          i.id,
//       title:       i.name,
//       quantity:    i.quantity,
//       unit_price:  i.price,
//       currency_id: 'MXN',
//     })),
//     payer: { email: customer.email, name: customer.name },
//     back_urls: {
//       success: `${siteUrl}/gracias`,
//       failure: `${siteUrl}/checkout`,
//       pending: `${siteUrl}/checkout`,
//     },
//     auto_return: 'approved',
//   },
// });
//
// return jsonResponse({ url: result.init_point });
