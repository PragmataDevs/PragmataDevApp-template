/**
 * CartCheckout — Full cart + checkout form React island.
 */

import { useState, useEffect } from 'react';
import { PublicIcon } from '../icons/PublicIcon';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  slug: string;
  image?: string;
}

const CART_KEY = 'pragmata_cart';

function getCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

function saveCart(cart: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent('cart:updated', { detail: cart }));
}

export default function CartCheckout() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    setCart(getCart());
    const handler = (e: Event) => setCart((e as CustomEvent<CartItem[]>).detail);
    window.addEventListener('cart:updated', handler);
    return () => window.removeEventListener('cart:updated', handler);
  }, []);

  const updateQty = (id: string, qty: number) => {
    const updated =
      qty <= 0 ? cart.filter(i => i.id !== id) : cart.map(i => (i.id === id ? { ...i, quantity: qty } : i));
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
      const edgeFnUrl = `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1/stripe-checkout`;
      const res = await fetch(edgeFnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart, customer: { name, email, phone } }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar el pago');
    } finally {
      setLoading(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="py-12 text-center">
        <PublicIcon name="cart" className="mx-auto h-12 w-12 text-slate-300" />
        <p className="mt-3 text-brand-steel">Tu carrito está vacío.</p>
        <a
          href="/productos"
          className="mt-4 inline-block text-sm font-semibold text-brand-accent hover:text-brand-accent-dark"
        >
          Ver productos →
        </a>
      </div>
    );
  }

  const fields: {
    label: string;
    val: string;
    set: (v: string) => void;
    type: string;
    required: boolean;
  }[] = [
    { label: 'Nombre completo', val: name, set: setName, type: 'text', required: true },
    { label: 'Correo electrónico', val: email, set: setEmail, type: 'email', required: true },
    { label: 'Teléfono (opcional)', val: phone, set: setPhone, type: 'tel', required: false },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-1">
      <div className="overflow-hidden rounded-pragmata border border-brand-border bg-white/90 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
        {cart.map((item, idx) => (
          <div
            key={item.id}
            className={`flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5 ${
              idx > 0 ? 'border-t border-brand-border' : ''
            }`}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-pragmata border border-brand-border bg-brand-surface text-xl">
              {item.image ? (
                <img src={item.image} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <PublicIcon name="package" className="h-6 w-6 text-slate-400" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="m-0 font-semibold text-brand-dark">{item.name}</p>
              <p className="m-0 text-sm text-brand-steel">
                {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.price)}{' '}
                c/u
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateQty(item.id, item.quantity - 1)}
                className="flex h-8 w-8 items-center justify-center rounded-pragmata border border-brand-border bg-white text-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                −
              </button>
              <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums">
                {item.quantity}
              </span>
              <button
                type="button"
                onClick={() => updateQty(item.id, item.quantity + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-pragmata border border-brand-border bg-white text-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                +
              </button>
            </div>
            <p className="m-0 min-w-[5rem] text-right text-sm font-bold tabular-nums text-brand-dark sm:text-base">
              {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
                item.price * item.quantity,
              )}
            </p>
          </div>
        ))}
        <div className="flex items-center justify-between border-t-2 border-brand-border bg-brand-surface/80 px-4 py-4 sm:px-5 dark:border-slate-700 dark:bg-slate-800/50">
          <span className="font-semibold text-brand-dark">Total</span>
          <span className="text-xl font-extrabold tabular-nums text-brand-dark">
            {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(total)}
          </span>
        </div>
      </div>

      <form onSubmit={handleCheckout} className="flex flex-col gap-3">
        <h2 className="m-0 text-sm font-bold uppercase tracking-wide text-brand-dark">Datos de contacto</h2>
        {fields.map(({ label, val, set, type, required }) => (
          <div key={label}>
            <label className="mb-1 block text-xs font-medium text-brand-steel">{label}</label>
            <input
              type={type}
              value={val}
              onChange={e => set(e.target.value)}
              required={required}
              className="w-full rounded-pragmata border border-brand-border bg-white px-3 py-2.5 text-sm text-brand-dark outline-none ring-brand-accent/25 transition focus:border-brand-accent focus:ring-2 dark:border-slate-600 dark:bg-slate-900"
            />
          </div>
        ))}
        {error && <p className="m-0 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-pragmata bg-brand-accent py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-accent-dark hover:shadow-psy-glow disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {loading
            ? 'Redirigiendo...'
            : `Pagar ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(total)} →`}
        </button>
        <p className="m-0 text-center text-xs text-brand-steel">
          Pago seguro con Stripe · Tus datos no se almacenan en este sitio
        </p>
      </form>
    </div>
  );
}
