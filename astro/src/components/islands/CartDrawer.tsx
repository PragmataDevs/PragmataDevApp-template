/**
 * CartDrawer — Floating cart icon + slide-in drawer.
 *
 * Mounts once in BaseLayout (client:load).
 * Listens to the 'cart:updated' custom event dispatched by CartButton.
 * Cart state lives in localStorage under 'pragmata_cart'.
 *
 * No shared context needed — event-based communication across React islands.
 */

import { useState, useEffect, useCallback } from 'react';
import type { CartItem } from './CartButton';

const CART_KEY = 'pragmata_cart';

function getCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('cart:updated', { detail: items }));
}

export default function CartDrawer() {
  const [cart, setCart]         = useState<CartItem[]>([]);
  const [open, setOpen]         = useState(false);
  const [mounted, setMounted]   = useState(false);

  // ── Init cart from localStorage ──────────────────────────────────────────
  useEffect(() => {
    setCart(getCart());
    setMounted(true);

    const handler = (e: Event) => {
      setCart((e as CustomEvent<CartItem[]>).detail ?? getCart());
    };

    window.addEventListener('cart:updated', handler);
    return () => window.removeEventListener('cart:updated', handler);
  }, []);

  // ── Close on Escape ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ── Mutation helpers ──────────────────────────────────────────────────────
  const updateQty = useCallback((id: string, delta: number) => {
    const updated = getCart()
      .map(item => item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item);
    saveCart(updated);
  }, []);

  const removeItem = useCallback((id: string) => {
    saveCart(getCart().filter(item => item.id !== id));
  }, []);

  const clearCart = useCallback(() => saveCart([]), []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const formatted  = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalPrice);

  if (!mounted) return null;

  return (
    <>
      {/* ── Floating trigger button ──────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        aria-label={`Carrito — ${totalItems} producto${totalItems !== 1 ? 's' : ''}`}
        style={{
          position: 'fixed',
          bottom: '28px',
          right: '28px',
          zIndex: 40,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--brand-accent, #7c3aed)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          transition: 'transform 0.15s',
          fontSize: '1.5rem',
        }}
        onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)'; }}
        onMouseOut={(e)  => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
      >
        🛒
        {totalItems > 0 && (
          <span style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            background: '#ef4444',
            color: '#fff',
            fontSize: '0.6875rem',
            fontWeight: 700,
            minWidth: '20px',
            height: '20px',
            borderRadius: '999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 5px',
            border: '2px solid #fff',
          }}>
            {totalItems > 99 ? '99+' : totalItems}
          </span>
        )}
      </button>

      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 49,
            animation: 'fadeIn 0.2s ease',
          }}
        />
      )}

      {/* ── Drawer panel ─────────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-label="Carrito de compras"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(400px, 100vw)',
          background: '#fff',
          zIndex: 50,
          boxShadow: '-4px 0 40px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(110%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
            Tu carrito
            {totalItems > 0 && <span style={{ marginLeft: 8, fontSize: '0.8125rem', fontWeight: 400, color: '#6b7280' }}>({totalItems} artículo{totalItems !== 1 ? 's' : ''})</span>}
          </h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar carrito"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '1.5rem', lineHeight: 1, padding: 4 }}
          >×</button>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>🛒</div>
              <p style={{ margin: '0 0 4px', fontWeight: 500, color: '#374151' }}>Tu carrito está vacío</p>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>Agrega productos desde el catálogo</p>
              <a
                href="/productos"
                onClick={() => setOpen(false)}
                style={{ display: 'inline-block', marginTop: 16, padding: '8px 20px', background: 'var(--brand-accent, #7c3aed)', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600 }}
              >
                Ver catálogo →
              </a>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: '8px 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cart.map(item => (
                <li key={item.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 8px', borderBottom: '1px solid #f3f4f6' }}>
                  {/* Thumbnail */}
                  <div style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', background: '#f3f4f6', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {item.image
                      ? <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                      : <span style={{ fontSize: '1.5rem' }}>🛍️</span>
                    }
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 4px', fontWeight: 500, fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</p>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: '#6b7280' }}>
                      {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.price)}
                    </p>
                  </div>

                  {/* Qty controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => updateQty(item.id, -1)}
                      style={{ width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 6, background: '#f9fafb', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', color: '#374151' }}
                    >−</button>
                    <span style={{ width: 24, textAlign: 'center', fontSize: '0.875rem', fontWeight: 600 }}>{item.quantity}</span>
                    <button
                      onClick={() => updateQty(item.id, 1)}
                      style={{ width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 6, background: '#f9fafb', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', color: '#374151' }}
                    >+</button>
                    <button
                      onClick={() => removeItem(item.id)}
                      aria-label="Eliminar"
                      style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', color: '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}
                    >✕</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Total estimado</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>{formatted}</span>
            </div>

            <a
              href="/checkout"
              style={{
                display: 'block',
                width: '100%',
                padding: '14px',
                background: 'var(--brand-accent, #7c3aed)',
                color: '#fff',
                textAlign: 'center',
                borderRadius: '10px',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.9375rem',
                marginBottom: 10,
              }}
            >
              Ir a pagar →
            </a>

            <button
              onClick={clearCart}
              style={{ width: '100%', padding: '10px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8125rem', color: '#6b7280' }}
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
