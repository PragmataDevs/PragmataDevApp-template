/**
 * CartCheckout — Full cart + checkout form React island.
 *
 * Reads cart from localStorage, shows items with quantity editing,
 * and submits to the Edge Function 'stripe-checkout' (or 'mp-checkout').
 *
 * Feature flag: if PUBLIC_ENABLE_ECOMMERCE=false this component is not rendered.
 */

import { useState, useEffect } from 'react';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  slug: string;
}

const CART_KEY = 'pragmata_cart';

function getCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch { return []; }
}

function saveCart(cart: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent('cart:updated', { detail: cart }));
}

export default function CartCheckout() {
  const [cart, setCart]       = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Form fields
  const [name,  setName]  = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    setCart(getCart());
    const handler = (e: Event) => setCart((e as CustomEvent<CartItem[]>).detail);
    window.addEventListener('cart:updated', handler);
    return () => window.removeEventListener('cart:updated', handler);
  }, []);

  const updateQty = (id: string, qty: number) => {
    const updated = qty <= 0
      ? cart.filter(i => i.id !== id)
      : cart.map(i => i.id === id ? { ...i, quantity: qty } : i);
    setCart(updated);
    saveCart(updated);
  };

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      // POST to the Edge Function (see supabase/functions/stripe-checkout)
      const edgeFnUrl = `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1/stripe-checkout`;
      const res = await fetch(edgeFnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart, customer: { name, email, phone } }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json() as { url: string };
      // Redirect to Stripe/MercadoPago hosted checkout
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar el pago');
    } finally {
      setLoading(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <p style={{ fontSize: '3rem', marginBottom: '16px' }}>🛒</p>
        <p style={{ color: 'var(--brand-muted)' }}>Tu carrito está vacío.</p>
        <a href="/productos" style={{ color: 'var(--brand-accent)', marginTop: '12px', display: 'inline-block' }}>
          Ver productos →
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
      {/* Cart items */}
      <div style={{ border: '1px solid var(--brand-border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--brand-surface)' }}>
        {cart.map((item, idx) => (
          <div
            key={item.id}
            style={{
              display: 'flex', alignItems: 'center', gap: '16px',
              padding: '16px 20px',
              borderTop: idx > 0 ? '1px solid var(--brand-border)' : 'none',
            }}
          >
            <div style={{ width: '48px', height: '48px', background: 'var(--brand-bg)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>
              🛍️
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, margin: '0 0 2px' }}>{item.name}</p>
              <p style={{ fontSize: '0.875rem', color: 'var(--brand-muted)', margin: 0 }}>
                ${item.price.toLocaleString('es-MX')} MXN c/u
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => updateQty(item.id, item.quantity - 1)} style={{ width: '28px', height: '28px', border: '1px solid var(--brand-border)', borderRadius: '6px', cursor: 'pointer', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
              <span style={{ minWidth: '24px', textAlign: 'center', fontWeight: 600 }}>{item.quantity}</span>
              <button onClick={() => updateQty(item.id, item.quantity + 1)} style={{ width: '28px', height: '28px', border: '1px solid var(--brand-border)', borderRadius: '6px', cursor: 'pointer', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
            </div>
            <p style={{ fontWeight: 700, minWidth: '80px', textAlign: 'right', margin: 0 }}>
              ${(item.price * item.quantity).toLocaleString('es-MX')}
            </p>
          </div>
        ))}
        <div style={{ padding: '16px 20px', borderTop: '2px solid var(--brand-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Total</span>
          <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>${total.toLocaleString('es-MX')} MXN</span>
        </div>
      </div>

      {/* Customer form */}
      <form onSubmit={handleCheckout} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600 }}>Datos de contacto</h2>
        {[
          { label: 'Nombre completo', val: name, set: setName, type: 'text', required: true },
          { label: 'Correo electrónico', val: email, set: setEmail, type: 'email', required: true },
          { label: 'Teléfono (opcional)', val: phone, set: setPhone, type: 'tel', required: false },
        ].map(({ label, val, set, type, required }) => (
          <div key={label}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--brand-muted)', marginBottom: '4px' }}>{label}</label>
            <input
              type={type}
              value={val}
              onChange={e => set(e.target.value)}
              required={required}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--brand-border)', borderRadius: '8px', fontSize: '0.875rem', boxSizing: 'border-box' }}
            />
          </div>
        ))}
        {error && (
          <p style={{ color: '#dc2626', fontSize: '0.875rem', margin: '4px 0 0' }}>{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '14px 24px', fontWeight: 700, fontSize: '1rem',
            color: '#fff', background: loading ? '#94a3b8' : 'var(--brand-accent)',
            border: 'none', borderRadius: '10px', cursor: loading ? 'not-allowed' : 'pointer',
            marginTop: '8px', transition: 'background 0.2s',
          }}
        >
          {loading ? 'Redirigiendo...' : `Pagar $${total.toLocaleString('es-MX')} MXN →`}
        </button>
        <p style={{ fontSize: '0.75rem', color: 'var(--brand-muted)', textAlign: 'center', margin: '4px 0 0' }}>
          🔒 Pago seguro con Stripe · Tus datos no se almacenan en este sitio
        </p>
      </form>
    </div>
  );
}
