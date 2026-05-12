/**
 * CartButton — React island for the product detail page.
 */

import { useState, useEffect } from 'react';
import { PublicIcon } from '../icons/PublicIcon';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  slug: string;
  image?: string;
  quantity: number;
}

export interface CartButtonProps {
  product: {
    id: string;
    name: string;
    price: number;
    slug: string;
    image?: string;
  };
  disabled?: boolean;
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

export default function CartButton({ product, disabled = false }: CartButtonProps) {
  const [inCart, setInCart] = useState(false);
  const [quantity, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const cart = getCart();
    const existing = cart.find(i => i.id === product.id);
    if (existing) {
      setInCart(true);
      setQty(existing.quantity);
    }
  }, [product.id]);

  const handleAddToCart = () => {
    if (disabled) return;
    const cart = getCart();
    const existing = cart.findIndex(i => i.id === product.id);
    if (existing >= 0) {
      cart[existing].quantity += quantity;
    } else {
      cart.push({ ...product, quantity });
    }
    saveCart(cart);
    setInCart(true);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleRemoveFromCart = () => {
    const cart = getCart().filter(i => i.id !== product.id);
    saveCart(cart);
    setInCart(false);
    setQty(1);
  };

  const qtyBtn =
    'flex h-10 w-10 items-center justify-center border-0 bg-transparent text-lg text-brand-dark transition hover:bg-slate-100';

  return (
    <div className="flex flex-col gap-3">
      {!inCart && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-brand-steel">Cantidad</span>
          <div className="inline-flex items-stretch overflow-hidden rounded-pragmata border border-brand-border bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900">
            <button type="button" className={qtyBtn} onClick={() => setQty(q => Math.max(1, q - 1))}>
              −
            </button>
            <span className="flex min-w-[2.25rem] items-center justify-center border-x border-brand-border px-2 text-sm font-semibold tabular-nums">
              {quantity}
            </span>
            <button type="button" className={qtyBtn} onClick={() => setQty(q => q + 1)}>
              +
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {inCart ? (
          <>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/checkout';
              }}
              className="flex-1 rounded-pragmata bg-brand-accent px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-accent-dark hover:shadow-psy-glow"
            >
              {added ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <PublicIcon name="check" className="h-4 w-4 shrink-0" />
                  Agregado
                  <span aria-hidden>→</span>
                </span>
              ) : (
                'Ir al carrito →'
              )}
            </button>
            <button
              type="button"
              onClick={handleRemoveFromCart}
              className="rounded-pragmata border border-red-200 bg-white px-4 py-3.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/50 dark:bg-slate-900 dark:hover:bg-red-950/40"
            >
              Quitar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={disabled}
            className={`flex-1 rounded-pragmata px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:shadow-none ${
              disabled
                ? ''
                : added
                  ? 'bg-emerald-500 hover:bg-emerald-600 hover:shadow-psy-glow'
                  : 'bg-brand-accent hover:bg-brand-accent-dark hover:shadow-psy-glow'
            }`}
          >
            {disabled ? 'Sin stock' : added ? (
              <span className="inline-flex items-center justify-center gap-2">
                <PublicIcon name="check" className="h-4 w-4 shrink-0" />
                Agregado al carrito
              </span>
            ) : (
              'Agregar al carrito'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
