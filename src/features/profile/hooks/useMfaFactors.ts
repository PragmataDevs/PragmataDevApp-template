import { useCallback, useEffect, useState } from 'react';
import type { Factor } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';

/**
 * Estado y acciones del 2FA (TOTP) del usuario actual. Lógica pura de
 * `supabase.auth.mfa`; la UI vive en `components/MfaSection.tsx`.
 *
 * Firmas verificadas en `@supabase/auth-js@2.94.1` (`dist/module/lib/types.d.ts`):
 *  - `enroll({ factorType: 'totp', friendlyName?, issuer? })` →
 *    `{ data: { id, type, friendly_name?, totp: { qr_code, secret, uri } } }`
 *    (l. 1142-1152, 1165-1189, 990). `qr_code` ya viene como data-URI SVG:
 *    el cliente le antepone `data:image/svg+xml;utf-8,` (GoTrueClient.js l. 2383).
 *  - `challenge({ factorId })` → `{ data: { id, type, expires_at } }` (l. 834-840, 892-901).
 *  - `verify({ factorId, challengeId, code })` → sesión nueva `aal2` (l. 793-803, 870-886).
 *  - `unenroll({ factorId })` → `{ data: { id } }` (l. 789-792, 888-891). Un factor
 *    `verified` solo se quita con sesión `aal2` (l. 1011-1014).
 *  - `listFactors()` → `{ data: { all: Factor[], totp: Factor<'totp','verified'>[], ... } }`
 *    (l. 948-953): `totp` trae SOLO los verificados.
 */

export interface TotpEnrollment {
  factorId: string;
  /** data-URI SVG listo para `<img src>`. */
  qrCode: string;
  /** Clave en texto por si no puede escanear. No loguearla. */
  secret: string;
}

/**
 * Nombre fijo: la UI permite un solo TOTP activo. GoTrue rechaza dos factores
 * con el mismo `friendly_name`, por eso los `unverified` abandonados se
 * limpian al abrir y al cancelar.
 */
const FRIENDLY_NAME = 'App autenticadora';

export function useMfaFactors() {
  /** Solo TOTP verificados (lo que ve el usuario como "activo"). */
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) throw listError;
    setFactors(data.totp);
  }, []);

  // Al abrir: limpiar enrolamientos a medias (status 'unverified') y cargar.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, error: listError } = await supabase.auth.mfa.listFactors();
        if (listError) throw listError;
        const stale = data.all.filter((f) => f.status === 'unverified');
        await Promise.all(stale.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })));
        if (!cancelled) setFactors(data.totp);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'No se pudo leer el estado de la verificación en dos pasos.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enroll = useCallback(async (): Promise<TotpEnrollment> => {
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: FRIENDLY_NAME,
    });
    if (enrollError) throw enrollError;
    return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
  }, []);

  /** challenge + verify del factor recién enrolado; al pasar queda `verified` y la sesión sube a aal2. */
  const verify = useCallback(
    async (factorId: string, code: string) => {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;
      await reload();
    },
    [reload],
  );

  const unenroll = useCallback(
    async (factorId: string) => {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
      if (unenrollError) throw unenrollError;
      await reload();
    },
    [reload],
  );

  return { factors, loading, error, enroll, verify, unenroll };
}
