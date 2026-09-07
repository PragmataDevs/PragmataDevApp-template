import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, ShieldOff, Copy, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { errorMessage } from '@/lib/errors';
import { useMfaFactors, type TotpEnrollment } from '../hooks/useMfaFactors';

/**
 * Bloque "Verificación en dos pasos" de la tarjeta Seguridad del perfil.
 * Enrolar (QR + clave) → código de 6 dígitos → activo. Quitar con confirmación.
 * La lógica de `supabase.auth.mfa` está en `useMfaFactors`.
 */
export function MfaSection() {
  const { factors, loading, error, enroll, verify, unenroll } = useMfaFactors();
  const confirm = useConfirm();

  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const active = factors.length > 0;

  const handleStart = async () => {
    setBusy(true);
    try {
      setEnrollment(await enroll());
      setCode('');
    } catch (err) {
      toast.error('No se pudo iniciar la activación: ' + errorMessage(err, 'error desconocido'));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!enrollment) return;
    setBusy(true);
    try {
      // Sin verificar es un factor `unverified`: se limpia para no dejar basura.
      await unenroll(enrollment.factorId);
    } catch (err) {
      console.warn('[MfaSection] no se pudo limpiar el factor sin verificar:', err);
    } finally {
      setEnrollment(null);
      setCode('');
      setBusy(false);
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!enrollment || code.length !== 6) return;
    setBusy(true);
    try {
      await verify(enrollment.factorId, code);
      setEnrollment(null);
      setCode('');
      toast.success('Verificación en dos pasos activada. Te pediremos el código al iniciar sesión.');
    } catch (err) {
      console.warn('[MfaSection] verify failed:', err);
      toast.error('Código incorrecto o vencido. Revisa la hora de tu teléfono e inténtalo de nuevo.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (factorId: string) => {
    const ok = await confirm({
      title: '¿Quitar la verificación en dos pasos?',
      description:
        'Tu cuenta volverá a entrar solo con contraseña. Puedes activarla de nuevo cuando quieras.',
      confirmLabel: 'Quitar',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await unenroll(factorId);
      toast.success('Verificación en dos pasos desactivada.');
    } catch (err) {
      toast.error('No se pudo quitar: ' + errorMessage(err, 'error desconocido'));
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('No se pudo copiar. Selecciona la clave y cópiala a mano.');
    }
  };

  return (
    <div className="rounded-lg bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          {active ? (
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <ShieldOff className="h-4 w-4 mt-0.5 shrink-0 text-[color:var(--pragmata-muted)]" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium">Verificación en dos pasos</p>
            <p className="text-xs text-[color:var(--pragmata-muted)] mt-1">
              Un código de tu app autenticadora además de tu contraseña al iniciar sesión.
            </p>
          </div>
        </div>
        {!loading && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              active
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-[color:var(--pragmata-surface)] text-[color:var(--pragmata-muted)] border border-[color:var(--pragmata-border)]'
            }`}
          >
            {active ? '2FA activo' : 'Inactivo'}
          </span>
        )}
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-xs text-[color:var(--pragmata-muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Consultando…
        </div>
      )}

      {!loading && error && (
        <p role="alert" className="mt-4 text-xs text-[color:var(--pragmata-danger)]">
          {error}
        </p>
      )}

      {/* Sin factor y sin enrolamiento en curso → activar */}
      {!loading && !error && !active && !enrollment && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={handleStart} loading={busy}>
          Activar verificación en dos pasos
        </Button>
      )}

      {/* Enrolamiento en curso: QR + clave + código */}
      {enrollment && (
        <form onSubmit={handleVerify} className="mt-4 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium">
              1. Escanea este código con tu app autenticadora (Google Authenticator, Authy, 1Password…)
            </p>
            <img
              src={enrollment.qrCode}
              alt="Código QR para tu app autenticadora"
              className="mx-auto h-44 w-44 rounded-lg bg-white p-2 border border-[color:var(--pragmata-border)]"
            />
            <p className="text-xs text-[color:var(--pragmata-muted)]">¿No puedes escanear? Escribe esta clave en la app:</p>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 min-w-0 select-all break-all rounded-lg border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] px-3 py-2 text-xs font-mono"
                data-testid="mfa-secret"
              >
                {enrollment.secret}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                aria-label="Copiar clave"
              >
                {copied ? 'Copiada' : 'Copiar'}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="mfa-enroll-code" className="text-xs font-medium block">
              2. Código de tu app autenticadora
            </label>
            <input
              id="mfa-enroll-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full rounded-lg border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] px-3 py-2 text-center text-lg font-semibold tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)]"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" variant="accent" size="sm" loading={busy} disabled={code.length !== 6}>
              Confirmar código
            </Button>
          </div>
        </form>
      )}

      {/* Activo: lista de factores + quitar */}
      {!loading && active && !enrollment && (
        <ul className="mt-4 space-y-2">
          {factors.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{f.friendly_name || 'App autenticadora'}</p>
                <p className="text-[10px] text-[color:var(--pragmata-muted)]">
                  Activa desde {new Date(f.created_at).toLocaleDateString('es-MX')}
                </p>
              </div>
              <Button
                type="button"
                variant="danger-ghost"
                size="sm"
                onClick={() => handleRemove(f.id)}
                disabled={busy}
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
