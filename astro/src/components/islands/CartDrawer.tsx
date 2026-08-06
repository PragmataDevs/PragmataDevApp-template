/**
 * CartDrawer — Floating cart icon + slide-in drawer.
 */

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { PublicIcon } from '../icons/PublicIcon';
import {
  getCartSnapshot,
  getCartServerSnapshot,
  subscribeToCart,
  saveCart,
  readCart,
} from '../../lib/cart';

export default function CartDrawer() {
  // El carrito se lee del store compartido en vez de copiarse a estado con un
  // `setCart(getCart())` dentro del efecto de montaje. `getCartServerSnapshot`
  // hace que la primera pintura (la que genera Astro en el servidor) coincida
  // con la del cliente antes de hidratar — que es justo para lo que existía la
  // bandera `mounted`.
  const cart = useSyncExternalStore(subscribeToCart, getCartSnapshot, getCartServerSnapshot);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const updateQty = useCallback((id: string, delta: number) => {
    const updated = readCart().map(item =>
      item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item,
    );
    saveCart(updated);
  }, []);

  const removeItem = useCallback((id: string) => {
    saveCart(readCart().filter(item => item.id !== id));
  }, []);

  const clearCart = useCallback(() => saveCart([]), []);

  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const formatted = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
    totalPrice,
  );

  // Ya no hace falta el `if (!mounted) return null`: el server snapshot del store
  // es un carrito vacío, así que el HTML que emite Astro y el primer render del
  // cliente coinciden por construcción. El contenido real entra al hidratar, sin
  // mismatch y sin el frame en blanco que dejaba el guard.
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Carrito — ${totalItems} producto${totalItems !== 1 ? 's' : ''}`}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-brand-accent text-white shadow-psy-glow-lg transition hover:scale-[1.04] hover:shadow-psy-glow active:scale-[0.98]"
      >
        <PublicIcon name="cart" className="h-6 w-6" />
        {totalItems > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-bold text-white">
            {totalItems > 99 ? '99+' : totalItems}
          </span>
        )}
      </button>

      {open && (
        <button
          type="button"
          aria-label="Cerrar overlay"
          className="fixed inset-0 z-[49] animate-[fadeIn_0.2s_ease] bg-slate-900/45 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        />
      )}

      <div
        role="dialog"
        aria-label="Carrito de compras"
        className={`fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[400px] flex-col border-l border-brand-border bg-white/95 shadow-[-12px_0_40px_rgba(15,23,42,0.12)] backdrop-blur-md transition-transform duration-300 ease-out dark:border-slate-700 dark:bg-slate-950/98 dark:shadow-[-12px_0_40px_rgba(0,0,0,0.45)] ${
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-brand-border px-5 py-4">
          <h2 className="m-0 text-base font-bold text-brand-dark">
            Tu carrito
            {totalItems > 0 && (
              <span className="ml-2 text-sm font-normal text-brand-steel">
                ({totalItems} artículo{totalItems !== 1 ? 's' : ''})
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar carrito"
            className="rounded-pragmata p-1 text-brand-steel transition hover:bg-slate-100 hover:text-brand-dark dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <PublicIcon name="x" className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {cart.length === 0 ? (
            <div className="px-2 py-16 text-center text-brand-steel">
              <PublicIcon name="cart" className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 font-medium text-brand-dark">Tu carrito está vacío</p>
              <p className="mt-1 text-sm">Agrega productos desde el catálogo</p>
              <a
                href="/productos"
                onClick={() => setOpen(false)}
                className="mt-5 inline-flex rounded-pragmata bg-brand-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-accent-dark"
              >
                Ver catálogo →
              </a>
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 py-2">
              {cart.map(item => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-pragmata border border-transparent px-2 py-3 transition hover:border-brand-border hover:bg-slate-50/80 dark:hover:border-slate-600 dark:hover:bg-slate-800/50"
                >
                  <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-pragmata border border-brand-border bg-brand-surface">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <PublicIcon name="package" className="h-7 w-7 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-brand-dark">{item.name}</p>
                    <p className="m-0 text-xs text-brand-steel">
                      {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
                        item.price,
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateQty(item.id, -1)}
                      className="flex h-8 w-8 items-center justify-center rounded-pragmata border border-brand-border bg-white text-sm text-brand-dark transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
                    >
                      −
                    </button>
                    <span className="w-7 text-center text-sm font-semibold tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQty(item.id, 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-pragmata border border-brand-border bg-white text-sm text-brand-dark transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      aria-label="Eliminar"
                      className="ml-1 flex h-8 w-8 items-center justify-center rounded-pragmata text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                    >
                      <PublicIcon name="x" className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {cart.length > 0 && (
          <div className="shrink-0 border-t border-brand-border bg-white/90 px-5 py-4 dark:border-slate-700 dark:bg-slate-950/95">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-brand-steel">Total estimado</span>
              <span className="text-xl font-bold tabular-nums text-brand-dark">{formatted}</span>
            </div>
            <a
              href="/checkout"
              className="mb-3 block w-full rounded-pragmata bg-brand-accent py-3.5 text-center text-sm font-bold text-white shadow-sm transition hover:bg-brand-accent-dark hover:shadow-psy-glow"
            >
              Ir a pagar →
            </a>
            <button
              type="button"
              onClick={clearCart}
              className="w-full rounded-pragmata border border-brand-border py-2.5 text-xs font-semibold text-brand-steel transition hover:bg-slate-50 hover:text-brand-dark"
            >
              Vaciar carrito
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </>
  );
}
