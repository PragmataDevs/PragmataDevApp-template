/**
 * Store del carrito del pilar público.
 *
 * El carrito vive en `localStorage` y se avisa por un evento de `window`. Ese
 * "store externo" estaba reimplementado en cada island (`CartButton`,
 * `CartDrawer`, `CartCheckout` traían su propio `getCart`/`saveCart`), y cada uno
 * lo copiaba a estado de React con un `setCart(getCart())` dentro de un efecto.
 *
 * Aquí se expone con el contrato que React tiene para justamente esto —
 * `useSyncExternalStore`— y el estado deja de duplicarse: los islands LEEN del
 * store, no se quedan con una copia que hay que resincronizar a mano.
 *
 * ── Por qué la caché del snapshot ───────────────────────────────────────────
 * `useSyncExternalStore` compara el snapshot por identidad (`Object.is`) en cada
 * render. Un `JSON.parse` devuelve un array NUEVO cada vez, así que devolverlo
 * directo haría que React viera un cambio en cada render → bucle infinito. Por
 * eso se cachea contra el string crudo: mientras `localStorage` no cambie, se
 * devuelve exactamente el mismo array.
 */

export interface CartItem {
  id:       string;
  name:     string;
  price:    number;
  slug:     string;
  image?:   string;
  quantity: number;
}

const CART_KEY = 'pragmata_cart';
const CART_EVENT = 'cart:updated';

/** Referencia estable para "carrito vacío" — no crear `[]` nuevos al vuelo. */
const EMPTY: readonly CartItem[] = Object.freeze([]);

let cachedRaw: string | null = null;
let cachedItems: readonly CartItem[] = EMPTY;

/** El carrito de este momento. Identidad estable si nada cambió. */
export function getCartSnapshot(): readonly CartItem[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(CART_KEY);
  } catch {
    raw = null;
  }

  if (raw === cachedRaw) return cachedItems;

  cachedRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as CartItem[]) : null;
    cachedItems = Array.isArray(parsed) && parsed.length ? parsed : EMPTY;
  } catch {
    cachedItems = EMPTY;
  }
  return cachedItems;
}

/**
 * Snapshot para el HTML que genera Astro en el servidor: ahí no hay
 * `localStorage`, y el carrito es por definición vacío. React usa este valor
 * para la primera pintura y se sincroniza al hidratar, sin mismatch.
 */
export function getCartServerSnapshot(): readonly CartItem[] {
  return EMPTY;
}

/** Se notifica al guardar (misma pestaña) y por `storage` (otras pestañas). */
export function subscribeToCart(onStoreChange: () => void): () => void {
  window.addEventListener(CART_EVENT, onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener(CART_EVENT, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

/** Persiste y avisa a todos los islands suscritos. */
export function saveCart(items: CartItem[]): void {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent<CartItem[]>(CART_EVENT, { detail: items }));
}

/** Lectura puntual fuera de React (handlers de click). */
export function readCart(): CartItem[] {
  return [...getCartSnapshot()];
}
