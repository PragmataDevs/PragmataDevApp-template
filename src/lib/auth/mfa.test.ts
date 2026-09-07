import { describe, it, expect } from 'vitest';
import type { Factor } from '@supabase/supabase-js';
import { mfaChallengeUrl, needsMfaChallenge, pickVerifiedTotp, resolveSafeNext } from './mfa';

describe('needsMfaChallenge', () => {
  it('aal1 con nextLevel aal2 → falta el segundo paso', () => {
    expect(needsMfaChallenge({ currentLevel: 'aal1', nextLevel: 'aal2' })).toBe(true);
  });

  it('sin factor verificado (aal1 → aal1) no bloquea', () => {
    expect(needsMfaChallenge({ currentLevel: 'aal1', nextLevel: 'aal1' })).toBe(false);
  });

  it('sesión ya en aal2 no vuelve a pedir código', () => {
    expect(needsMfaChallenge({ currentLevel: 'aal2', nextLevel: 'aal2' })).toBe(false);
  });

  it('sin sesión (null) no bloquea', () => {
    expect(needsMfaChallenge({ currentLevel: null, nextLevel: null })).toBe(false);
    expect(needsMfaChallenge(null)).toBe(false);
    expect(needsMfaChallenge(undefined)).toBe(false);
  });
});

describe('pickVerifiedTotp', () => {
  const base = { created_at: '', updated_at: '' };
  const factors: Factor[] = [
    { ...base, id: 'u1', factor_type: 'totp', status: 'unverified' },
    { ...base, id: 'p1', factor_type: 'phone', status: 'verified' },
    { ...base, id: 't1', factor_type: 'totp', status: 'verified' },
    { ...base, id: 't2', factor_type: 'totp', status: 'verified' },
  ];

  it('regresa el primer TOTP verificado, ignorando unverified y otros tipos', () => {
    expect(pickVerifiedTotp(factors)?.id).toBe('t1');
  });

  it('null si no hay ninguno', () => {
    expect(pickVerifiedTotp([])).toBeNull();
    expect(pickVerifiedTotp([factors[0]])).toBeNull();
  });
});

describe('resolveSafeNext', () => {
  it('acepta un path relativo propio', () => {
    expect(resolveSafeNext('/settings/usuarios?x=1')).toBe('/settings/usuarios?x=1');
  });

  it('rechaza protocol-relative, URL absoluta y vacío', () => {
    expect(resolveSafeNext('//evil.com')).toBe('/dashboard');
    expect(resolveSafeNext('https://evil.com/x')).toBe('/dashboard');
    expect(resolveSafeNext('')).toBe('/dashboard');
    expect(resolveSafeNext(null)).toBe('/dashboard');
  });

  it('no regresa a /mfa (evita loop)', () => {
    expect(resolveSafeNext('/mfa')).toBe('/dashboard');
    expect(resolveSafeNext('/mfa?next=%2Fx')).toBe('/dashboard');
  });
});

describe('mfaChallengeUrl', () => {
  it('conserva a dónde iba el usuario', () => {
    expect(mfaChallengeUrl('/workspace/abc/tasks')).toBe('/mfa?next=%2Fworkspace%2Fabc%2Ftasks');
  });

  it('sin next cuando el destino es el default', () => {
    expect(mfaChallengeUrl('/dashboard')).toBe('/mfa');
    expect(mfaChallengeUrl('//evil.com')).toBe('/mfa');
  });
});
