/**
 * CartButton — React island for the product detail page.
 */

import { useState, useSyncExternalStore } from 'react';
import { PublicIcon } from '../icons/PublicIcon';
import {
  getCartSnapshot,
  getCartServerSnapshot,
  subscribeToCart,
  saveCart,
  readCart,
} from '../../lib/cart';

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

export default function CartButton({ product, disabled = false }: CartButtonProps) {
  // El carrito se LEE del store, no se copia a estado. Antes, `inCart` se
  // sembraba con un efecto al montar y después sólo lo movían los clicks de este
  // botón: si vaciabas el carrito desde el drawer, este botón se quedaba diciendo
  // "Agregado" para siempre. Derivándolo, los dos islands van sincronizados.
  const cart = useSyncExternalStore(subscribeToCart, getCartSnapshot, getCartServerSnapshot);
  const existing = cart.find(i => i.id === product.id);
  const inCart = Boolean(existing);

  // Lo único que sí es estado propio: la cantidad que el usuario está eligiendo
  // ANTES de agregar. Si el producto ya está en el carrito manda la del carrito.
  const [pendingQty, setPendingQty] = useState(1);
  const quantity = existing ? existing.quantity : pendingQty;

  const [added, setAdded] = useState(false);

  const handleAddToCart = () => {
    if (disabled) return;
    const next = readCart();
    const index = next.findIndex(i => i.id === product.id);
    if (index >= 0) {
      next[index] = { ...next[index], quantity: next[index].quantity + quantity };
    } else {
      next.push({ ...product, quantity });
    }
    saveCart(next);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleRemoveFromCart = () => {
    saveCart(readCart().filter(i => i.id !== product.id));
    setPendingQty(1);
  };

  const qtyBtn =
    'flex h-10 w-10 items-center justify-center border-0 bg-transparent text-lg text-brand-dark transition hover:bg-slate-100';

  return (
    <div className="flex flex-col gap-3">
      {!inCart && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-brand-steel">Cantidad</span>
          <div className="inline-flex items-stretch overflow-hidden rounded-pragmata border border-brand-border bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900">
            <button type="button" className={qtyBtn} onClick={() => setPendingQty(q => Math.max(1, q - 1))}>
              −
            </button>
            <span className="flex min-w-[2.25rem] items-center justify-center border-x border-brand-border px-2 text-sm font-semibold tabular-nums">
              {quantity}
            </span>
            <button type="button" className={qtyBtn} onClick={() => setPendingQty(q => q + 1)}>
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
