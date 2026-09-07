import type { AuthenticatorAssuranceLevels, Factor } from '@supabase/supabase-js';

/**
 * Helpers puros del 2FA (TOTP). Sin React ni red: lo que decide "¿falta el
 * segundo paso?" vive aquí para poder probarlo solo.
 *
 * Firmas verificadas en `@supabase/auth-js@2.94.1`
 * (`dist/module/lib/types.d.ts`):
 *  - `AuthenticatorAssuranceLevels = 'aal1' | 'aal2'` (l. 954)
 *  - `getAuthenticatorAssuranceLevel()` devuelve `{ currentLevel, nextLevel,
 *    currentAuthenticationMethods }` (l. 955-975); si `nextLevel` es mayor que
 *    `currentLevel`, el usuario debe pasar por `challenge` + `verify`.
 *  - `Factor = { id, friendly_name?, factor_type, status: 'verified' |
 *    'unverified', ... }` (l. 307-323).
 */

/** Ruta pública donde se pide el código al iniciar sesión. */
export const MFA_CHALLENGE_PATH = '/mfa';

export interface AalSnapshot {
  currentLevel: AuthenticatorAssuranceLevels | null;
  nextLevel: AuthenticatorAssuranceLevels | null;
}

/**
 * `aal1` con `nextLevel === 'aal2'` = tiene un TOTP verificado y todavía no lo
 * presentó en esta sesión. Sin factor verificado `nextLevel` se queda en `aal1`
 * (los `unverified` abandonados no cuentan), así que no bloquea a nadie que no
 * haya activado el 2FA.
 */
export function needsMfaChallenge(aal: AalSnapshot | null | undefined): boolean {
  return aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2';
}

/** Primer TOTP verificado: es el que se reta al iniciar sesión. */
export function pickVerifiedTotp(factors: readonly Factor[]): Factor | null {
  return factors.find((f) => f.factor_type === 'totp' && f.status === 'verified') ?? null;
}

/**
 * Sanea un `?next=`: solo se acepta un path relativo propio. Nunca
 * protocol-relative (`//host`) ni URL absoluta, para no abrir un open-redirect.
 * Misma regla que usa `AuthProvider` en el `SIGNED_IN` del callback OAuth.
 */
export function resolveSafeNext(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  // Que el propio /mfa no sea el destino: sería un loop.
  if (raw === MFA_CHALLENGE_PATH || raw.startsWith(`${MFA_CHALLENGE_PATH}?`)) return fallback;
  return raw;
}

/** Arma la URL de la pantalla de código conservando a dónde iba el usuario. */
export function mfaChallengeUrl(returnTo: string): string {
  const next = resolveSafeNext(returnTo);
  return next === '/dashboard'
    ? MFA_CHALLENGE_PATH
    : `${MFA_CHALLENGE_PATH}?next=${encodeURIComponent(next)}`;
}
