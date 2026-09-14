/**
 * stripe-checkout — Edge Function
 *
 * Crea una sesión de Stripe Checkout y devuelve la URL de pago hospedada.
 * El navegador manda QUÉ y CUÁNTO quiere; el precio SIEMPRE sale de la base.
 *
 * POST /functions/v1/stripe-checkout
 * Body:    { items: [{ id, quantity }], customer: { name, email, phone? } }
 * Devuelve: { url: string }  ← checkout hospedado de Stripe
 *
 * Secretos (Supabase Dashboard → Edge Functions → Secrets):
 *   STRIPE_CHECKOUT_ENABLED — 'true' para habilitarla. Sin esto responde 503.
 *   STRIPE_SECRET_KEY       — sk_live_xxx o sk_test_xxx
 *   PUBLIC_SITE_URL         — https://tucliente.com (redirecciones de éxito/cancelación)
 *
 * ── Por qué está escrita así (C2 de la auditoría 12-sep-2026) ───────────────
 *
 * Antes el body traía `price` por artículo y se mandaba a Stripe tal cual:
 *   unit_amount: Math.round(item.price * 100)
 * O sea el precio lo ponía el navegador. Un `curl` con `"price": 1` compraba
 * un plan de $4,500 por un peso. Venía así del template, así que lo heredaron
 * todos los clientes instanciados de él.
 *
 * Ahora:
 *   1. **Fail-closed.** Sin `STRIPE_CHECKOUT_ENABLED=true` responde 503 y no
 *      llama a Stripe. Hace falta porque `supabase functions deploy` SIN
 *      ARGUMENTO sube TODAS las funciones: apagar el ecommerce en el front
 *      (`VITE_ENABLE_ECOMMERCE=false`) esconde la interfaz, NO el endpoint.
 *   2. **El precio se lee de `products` con el service client**, junto con
 *      estado y existencias. Del body solo se acepta `id` y `quantity`.
 *   3. **Entrada estricta** (mandamiento 4.3): id uuid, cantidad entera 1..99,
 *      máximo 50 renglones; cualquier cosa fuera de eso truena con el motivo.
 *   4. **La moneda también sale de la base**, no hardcodeada: un catálogo en
 *      USD cobraba en MXN.
 *
 * NO se exige `requireAuth`: una tienda pública con compra de invitado es un
 * caso legítimo y el correo del comprador ya se pide en `customer`. El agujero
 * era el precio, no la sesión. Si este proyecto vende solo a usuarios con
 * cuenta, agrega `requireAuth(req)` al inicio del try — el helper ya existe.
 *
 * Deploy: supabase functions deploy stripe-checkout
 */

import Stripe from 'https://esm.sh/stripe@14?target=deno';
// Sin `corsHeaders`: `jsonResponse`/`errorResponse` ya los ponen.
import { handleCors } from '../_shared/cors.ts';
import { createServiceClient, errorResponse, jsonResponse } from '../_shared/auth.ts';

// ─── Límites de entrada ───────────────────────────────────────────────────────

const MAX_RENGLONES = 50;
const MAX_CANTIDAD = 99;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  // 1. Candado: la función nace apagada
  if (Deno.env.get('STRIPE_CHECKOUT_ENABLED') !== 'true') {
    return errorResponse('checkout_disabled', 503);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      items?: { id?: string; quantity?: number }[];
      customer?: { name?: string; email?: string; phone?: string };
    };

    // 2. Entrada: solo id y cantidad. Cualquier `price` del body se ignora.
    const items = body.items ?? [];
    if (!items.length) return errorResponse('El carrito viene vacío');
    if (items.length > MAX_RENGLONES) return errorResponse(`Máximo ${MAX_RENGLONES} renglones por compra`);

    const pedido = new Map<string, number>();
    for (const item of items) {
      const id = (item?.id ?? '').trim();
      if (!UUID_RE.test(id)) return errorResponse(`Artículo inválido: se esperaba un id uuid, llegó "${id}"`);

      const cantidad = Number(item?.quantity);
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_CANTIDAD) {
        return errorResponse(`Cantidad inválida para ${id}: se esperaba un entero entre 1 y ${MAX_CANTIDAD}, llegó "${item?.quantity}"`);
      }
      // el mismo artículo repetido se acumula, no se duplica el renglón
      pedido.set(id, (pedido.get(id) ?? 0) + cantidad);
    }

    const email = (body.customer?.email ?? '').trim();
    if (!email.includes('@')) return errorResponse('Falta el correo del comprador');
    const nombre = (body.customer?.name ?? '').trim();

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return errorResponse('Stripe not configured', 500);

    // 3. El precio, la moneda y las existencias salen de la BASE, nunca del body
    const service = createServiceClient();
    const { data: productos, error: dbError } = await service
      .from('products')
      .select('id, name, price, currency, status, in_stock, stock_qty')
      .in('id', [...pedido.keys()]);

    if (dbError) return errorResponse(`No se pudo leer el catálogo: ${dbError.message}`, 500);

    const porId = new Map((productos ?? []).map((p) => [p.id as string, p]));
    const lineItems = [];
    const monedas = new Set<string>();

    for (const [id, cantidad] of pedido) {
      const p = porId.get(id);
      if (!p) return errorResponse(`El producto ${id} no existe`, 404);
      if (p.status !== 'active') return errorResponse(`"${p.name}" ya no está disponible`, 409);
      if (p.in_stock === false) return errorResponse(`"${p.name}" está agotado`, 409);
      if (p.stock_qty !== null && p.stock_qty !== undefined && cantidad > Number(p.stock_qty)) {
        return errorResponse(`Solo quedan ${p.stock_qty} de "${p.name}"`, 409);
      }

      const centavos = Math.round(Number(p.price) * 100);
      if (!Number.isFinite(centavos) || centavos <= 0) {
        return errorResponse(`"${p.name}" no tiene precio válido en el catálogo`, 409);
      }

      const moneda = String(p.currency ?? 'MXN').toLowerCase();
      monedas.add(moneda);

      lineItems.push({
        price_data: {
          currency:     moneda,
          unit_amount:  centavos,
          product_data: { name: p.name as string },
        },
        quantity: cantidad,
      });
    }

    // Stripe cobra una sesión en una sola moneda
    if (monedas.size > 1) {
      return errorResponse(`El carrito mezcla monedas (${[...monedas].join(', ')}); sepáralo en dos compras`, 409);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? 'https://tucliente.com';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode:                 'payment',
      line_items:           lineItems,
      customer_email:       email,
      success_url:          `${siteUrl}/gracias?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:           `${siteUrl}/checkout`,
      metadata: {
        customer_name:  nombre,
        customer_email: email,
        customer_phone: body.customer?.phone ?? '',
        // para que el webhook reconstruya el pedido sin confiar en el navegador
        pedido: JSON.stringify([...pedido].map(([id, qty]) => ({ id, qty }))),
      },
    });

    return jsonResponse({ url: session.url });

  } catch (err) {
    console.error('[stripe-checkout]', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});

// ─── Alternativa MercadoPago (LATAM) ─────────────────────────────────────────
//
// Reemplaza el bloque de Stripe por esto. OJO: el precio y el título salen de
// `porId` (la base), NO del body — si los tomas de `items` vuelves a abrir C2.
//
// import { MercadoPagoConfig, Preference } from 'https://esm.sh/mercadopago@2';
//
// const client = new MercadoPagoConfig({ accessToken: Deno.env.get('MP_ACCESS_TOKEN')! });
// const preference = new Preference(client);
//
// const result = await preference.create({
//   body: {
//     items: [...pedido].map(([id, qty]) => {
//       const p = porId.get(id)!;
//       return {
//         id,
//         title:       p.name,
//         quantity:    qty,
//         unit_price:  Number(p.price),
//         currency_id: String(p.currency ?? 'MXN'),
//       };
//     }),
//     payer: { email, name: nombre },
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
