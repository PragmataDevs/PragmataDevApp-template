/**
 * `crypto.randomUUID` solo existe en secure context (HTTPS o localhost).
 * En dev remoto entramos por IP de Tailscale sobre HTTP plano, donde el browser
 * no lo expone y cualquier `crypto.randomUUID()` truena.
 *
 * `crypto.getRandomValues` SÍ está disponible en contexto inseguro, así que el
 * fallback conserva entropía criptográfica (nada de Math.random).
 */

function randomUUIDFallback(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)

  // RFC 4122 v4: versión en el nibble alto del byte 6, variante en el del byte 8.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Parcha `crypto.randomUUID` si el browser no lo expone. Idempotente. */
export function installUUIDPolyfill(): void {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID === 'function') return

  Object.defineProperty(crypto, 'randomUUID', {
    value: randomUUIDFallback,
    configurable: true,
    writable: true,
  })
}
