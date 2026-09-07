import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { BrandIcon } from '@/components/brand/BrandIcon';
import { getPublicBrandName } from '@/lib/brandEnv';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { pickVerifiedTotp, resolveSafeNext } from '@/lib/auth/mfa';
import { useAuth } from '../hooks/useAuth';

/**
 * Segundo paso al iniciar sesión (TOTP). Llega aquí quien ya tiene sesión
 * (`aal1`) y un autenticador verificado; `RouteGuard` no lo deja entrar a la
 * app hasta que `AuthProvider.mfaRequired` sea `false`.
 *
 * Firmas (auth-js 2.94.1, `dist/module/lib/types.d.ts`):
 *  - `mfa.listFactors()` → `{ data: { all: Factor[], totp: Factor<'totp','verified'>[] , ... } }` (l. 948-953, 1028)
 *  - `mfa.challenge({ factorId })` → `{ data: { id, type, expires_at } }` (l. 834-840, 892-901, 998)
 *  - `mfa.verify({ factorId, challengeId, code })` → sesión nueva `aal2` (l. 793-803, 870-886, 1006)
 */
export default function MfaChallengePage() {
  const brandName = getPublicBrandName();
  const { user, loading, mfaRequired, refreshAal } = useAuth();
  const [searchParams] = useSearchParams();
  const target = resolveSafeNext(searchParams.get('next'));

  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Primer TOTP verificado: es el que se reta.
  useEffect(() => {
    if (loading || !user || !mfaRequired) return;
    let cancelled = false;
    void (async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (listError) {
        setError(errorMessage(listError, 'No pudimos leer tus métodos de verificación.'));
        return;
      }
      const totp = pickVerifiedTotp(data.all);
      if (!totp) {
        setError('No encontramos un autenticador verificado en tu cuenta. Cierra sesión y vuelve a entrar.');
        return;
      }
      setFactorId(totp.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user, mfaRequired]);

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-white" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  // Ya es aal2 (o nunca hizo falta): a donde iba.
  if (!mfaRequired) return <Navigate to={target} replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!factorId || code.length !== 6) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;
      // La sesión ya es aal2: recalcular → mfaRequired=false → el <Navigate> de
      // arriba nos lleva a `target`. No navegamos a mano para no chocar con el
      // RouteGuard antes de que el provider se entere.
      await refreshAal();
    } catch (err) {
      console.warn('[MfaChallengePage] verify failed:', err);
      setError('Código incorrecto o vencido. Revisa la hora de tu teléfono e inténtalo de nuevo.');
      setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setSigningOut(false);
      setError(errorMessage(signOutError, 'No se pudo cerrar sesión.'));
    }
    // Con éxito, SIGNED_OUT deja `user` en null y el <Navigate to="/login"> hace lo suyo.
  };

  return (
    <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="px-6 pt-8 pb-6 text-center sm:px-8">
          <div className="mx-auto mb-6 flex justify-center">
            <BrandIcon className="h-16 w-16 rounded-pragmata" alt={brandName} />
          </div>
          <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Verificación en dos pasos</h1>
          <p className="text-slate-500 mt-2 text-sm">
            Escribe el código de 6 dígitos de tu app autenticadora para continuar como{' '}
            <span className="font-medium text-slate-700">{user.email}</span>.
          </p>
        </div>

        <div className="px-6 pb-8 sm:px-8">
          {error && (
            <div role="alert" className="mb-4 p-3 rounded bg-red-50 text-red-600 text-sm border border-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="mfa-code" className="text-sm font-medium text-slate-700 block text-left">
                Código de tu app autenticadora
              </label>
              <input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={!factorId || submitting}
                className="block w-full py-3 text-center text-2xl font-semibold tracking-[0.5em] border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 placeholder-slate-300 transition-all font-sans disabled:bg-slate-50"
                placeholder="000000"
              />
            </div>

            <Button
              type="submit"
              variant="accent"
              loading={submitting}
              disabled={!factorId || code.length !== 6}
              fullWidth
              className="py-2.5"
            >
              Verificar y entrar
            </Button>
          </form>

          <div className="mt-6 flex flex-col items-center gap-3 text-sm text-slate-500">
            <p className="text-center text-xs">
              ¿Perdiste el acceso a tu app autenticadora? Escríbenos a soporte para recuperar tu cuenta.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              loading={signingOut}
              icon={<LogOut className="h-4 w-4" />}
            >
              Cerrar sesión
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
