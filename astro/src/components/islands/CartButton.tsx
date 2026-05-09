/**
 * CartButton — React island for the product detail page.
 *
 * This component runs entirely in the browser (client:load).
 * It communicates with the CartDrawer via localStorage + custom events.
 *
 * Cart state lives in localStorage under 'pragmata_cart'.
 * A custom event 'cart:updated' is dispatched after every change
 * so the CartDrawer can react without a shared React context.
 */

import { useState, useEffect } from 'react';

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
  /** Disable the button when the product is out of stock */
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
  const [inCart, setInCart]   = useState(false);
  const [quantity, setQty]    = useState(1);
  const [added, setAdded]     = useState(false);

  // Check if already in cart on mount
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Quantity selector */}
      {!inCart && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--brand-muted)' }}>Cantidad:</span>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--brand-border)', borderRadius: '8px', overflow: 'hidden' }}>
            <button
              onClick={() => setQty(q => Math.max(1, q - 1))}
              style={{ padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.125rem', color: 'var(--brand-fg)' }}
            >−</button>
            <span style={{ padding: '0 12px', fontWeight: 600, minWidth: '2rem', textAlign: 'center' }}>{quantity}</span>
            <button
              onClick={() => setQty(q => q + 1)}
              style={{ padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.125rem', color: 'var(--brand-fg)' }}
            >+</button>
          </div>
        </div>
      )}

      {/* Add / Remove button */}
      <div style={{ display: 'flex', gap: '12px' }}>
        {inCart ? (
          <>
            <button
              onClick={() => (window.location.href = '/checkout')}
              style={{
                flex: 1, padding: '14px 24px', fontSize: '0.9375rem', fontWeight: 600,
                color: '#fff', background: 'var(--brand-accent)',
                border: 'none', borderRadius: '10px', cursor: 'pointer',
              }}
            >
              {added ? '¡Agregado! →' : 'Ir al carrito →'}
            </button>
            <button
              onClick={handleRemoveFromCart}
              style={{
                padding: '14px 16px', fontSize: '0.875rem',
                color: '#dc2626', background: '#fff',
                border: '1px solid #fecaca', borderRadius: '10px', cursor: 'pointer',
              }}
            >
              Quitar
            </button>
          </>
        ) : (
          <button
            onClick={handleAddToCart}
            disabled={disabled}
            style={{
              flex: 1, padding: '14px 24px', fontSize: '0.9375rem', fontWeight: 600,
              color: '#fff',
              background: disabled ? '#d1d5db' : added ? '#10b981' : 'var(--brand-accent)',
              border: 'none', borderRadius: '10px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {disabled ? 'Sin stock' : added ? '✓ Agregado al carrito' : 'Agregar al carrito'}
          </button>
        )}
      </div>
    </div>
  );
}
