# Pasarelas de Pago — Guía de Integración

Esta template soporta dos pasarelas: **Stripe** (global) y **MercadoPago** (LATAM).
Ambas siguen el mismo patrón: Edge Function → hosted checkout → webhook confirma el pago.

---

## Arquitectura

```
Browser (Astro)
  └─ CartCheckout (React island)
       └─ POST /functions/v1/stripe-checkout  (o mp-checkout)
            └─ Stripe / MercadoPago API
                 └─ Redirect a hosted checkout
                      └─ Pago completado
                           └─ Webhook → /functions/v1/stripe-webhook
                                └─ UPDATE orders SET status='paid'
```

---

## Opción A — Stripe (Global)

### 1. Configurar secrets

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
supabase secrets set PUBLIC_SITE_URL=https://tucliente.com
```

### 2. Desplegar funciones

```bash
supabase functions deploy stripe-checkout
supabase functions deploy stripe-webhook
```

### 3. Registrar el webhook en Stripe

- Ir a [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
- Agregar endpoint: `https://<project>.supabase.co/functions/v1/stripe-webhook`
- Eventos a escuchar:
  - `checkout.session.completed`
  - `payment_intent.payment_failed`
- Copiar el **Signing secret** → guardar como `STRIPE_WEBHOOK_SECRET`

### 4. Modo test vs producción

| Variable | Desarrollo | Producción |
|----------|-----------|-----------|
| `STRIPE_SECRET_KEY` | `sk_test_xxx` | `sk_live_xxx` |
| `STRIPE_WEBHOOK_SECRET` | Usar `stripe listen` CLI | Dashboard → Webhooks |

**Test local con Stripe CLI:**
```bash
stripe listen --forward-to https://<project>.supabase.co/functions/v1/stripe-webhook
```

---

## Opción B — MercadoPago (LATAM)

MercadoPago Checkout Pro es la opción preferida para México, Argentina, Brasil y Colombia.

### 1. Obtener credenciales

- [Ir a MercadoPago Developers](https://www.mercadopago.com.mx/developers)
- Crear aplicación → obtener `Access Token`

### 2. Crear Edge Function `mp-checkout`

```bash
cp -r supabase/functions/stripe-checkout supabase/functions/mp-checkout
```

Reemplazar el contenido con el patrón de MercadoPago (ver comentario en `stripe-checkout/index.ts`):

```typescript
import { MercadoPagoConfig, Preference } from 'https://esm.sh/mercadopago@2';

const client = new Preference(
  new MercadoPagoConfig({ accessToken: Deno.env.get('MP_ACCESS_TOKEN')! })
);

const result = await client.create({
  body: {
    items: items.map(i => ({
      id:         i.id,
      title:      i.name,
      quantity:   i.quantity,
      unit_price: i.price,
      currency_id: 'MXN',
    })),
    payer:      { email: customer.email },
    back_urls:  { success: `${siteUrl}/gracias`, failure: `${siteUrl}/checkout` },
    auto_return: 'approved',
  },
});

return jsonResponse({ url: result.init_point });
```

### 3. Secrets MercadoPago

```bash
supabase secrets set MP_ACCESS_TOKEN=APP_USR-xxx
```

### 4. Webhook MercadoPago

- URL: `https://<project>.supabase.co/functions/v1/mp-webhook`
- Configurar en el [panel de notificaciones MP](https://www.mercadopago.com.mx/developers/panel/notifications)
- Tópicos: `payment`

---

## Tabla `orders` (schema: `docs/database/01_security_engine.sql` / migración `…20000_pragmata_schema.sql`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `stripe_session_id` | TEXT UNIQUE | ID de sesión Stripe |
| `stripe_payment_id` | TEXT | ID del PaymentIntent |
| `amount_total` | NUMERIC | Monto en pesos (ya convertido desde centavos) |
| `currency` | TEXT | 'mxn', 'usd', etc. |
| `order_status` | TEXT | pending → paid → refunded |
| `customer_email` | TEXT | Email del comprador |
| `paid_at` | TIMESTAMPTZ | Cuándo se confirmó el pago |

---

## Checklist antes de salir a producción

- [ ] Variables de entorno en Supabase (no en `.env` del repo)
- [ ] Webhook registrado y verificado con evento de prueba
- [ ] Página `/gracias` creada en Astro con confirmación al usuario
- [ ] RLS de `orders` revisada — solo service role puede insertar
- [ ] Probado el flujo completo en modo test con tarjeta `4242 4242 4242 4242`
