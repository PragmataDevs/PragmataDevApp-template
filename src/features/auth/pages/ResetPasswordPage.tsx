import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Mail, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { BrandIcon } from '@/components/brand/BrandIcon';
import { getPublicBrandName } from '@/lib/brandEnv';

type ResetLocationState = { email?: string } | null;

export default function ResetPasswordPage() {
  const brandName = getPublicBrandName();
  const navigate = useNavigate();
  const location = useLocation();
  const prefilledEmail = (location.state as ResetLocationState)?.email?.trim() ?? '';

  const [email, setEmail] = useState(prefilledEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reglas de validación de contraseña
  const validations = {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    matches: password.length > 0 && password === confirmPassword,
  };

  const passwordValid = Object.values(validations).every(Boolean);
  const codeValid = /^\d{6}$/.test(code);
  const emailValid = /.+@.+\..+/.test(email.trim());
  const allValid = passwordValid && codeValid && emailValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allValid) return;

    setIsLoading(true);
    setError(null);

    try {
      // 1. Canjea el código de 6 dígitos por una sesión de recuperación.
      //    Los códigos (a diferencia de los enlaces) no los queman los escáneres
      //    de seguridad de correo corporativo.
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'recovery',
      });

      if (verifyError) {
        const msg = verifyError.message.toLowerCase();
        setError(
          msg.includes('expired') || msg.includes('invalid')
            ? 'El código es inválido o expiró. Solicita uno nuevo e intenta de nuevo.'
            : verifyError.message,
        );
        return;
      }

      // 2. Con la sesión de recuperación activa, establece la nueva contraseña.
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al actualizar la contraseña');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="px-8 py-12 text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">¡Contraseña establecida!</h1>
            <p className="text-slate-500 mt-2 text-sm">
              Tu contraseña ha sido configurada exitosamente. Redirigiendo al dashboard...
            </p>
            <div className="mt-6">
              <div className="w-6 h-6 mx-auto rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 text-center">
          <div className="mx-auto mb-6 flex justify-center">
            <BrandIcon className="h-16 w-16" alt={brandName} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Establece tu contraseña</h1>
          <p className="text-slate-500 mt-2 text-sm">
            Ingresa el código de 6 dígitos que te enviamos por correo y elige una contraseña nueva.
          </p>
        </div>

        {/* Form */}
        <div className="px-8 pb-8">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email — chip de solo lectura si viene del paso anterior, editable si no */}
            {prefilledEmail ? (
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm text-slate-600">
                <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="truncate">{prefilledEmail}</span>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 block text-left">Correo</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                  </div>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 placeholder-slate-400"
                    placeholder="nombre@empresa.com"
                  />
                </div>
              </div>
            )}

            {/* Código de 6 dígitos */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 block text-left">Código de verificación</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyRound className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 placeholder-slate-400 tracking-[0.5em] font-mono text-lg"
                  placeholder="000000"
                />
              </div>
            </div>

            {/* Contraseña */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 block text-left">Nueva contraseña</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 placeholder-slate-400 transition-all font-sans"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Confirmar contraseña */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 block text-left">Confirmar contraseña</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 placeholder-slate-400 transition-all font-sans"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Reglas de validación */}
            <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Requisitos de contraseña
              </p>
              <ValidationRule label="Mínimo 8 caracteres" passed={validations.minLength} />
              <ValidationRule label="Al menos una mayúscula" passed={validations.hasUpper} />
              <ValidationRule label="Al menos una minúscula" passed={validations.hasLower} />
              <ValidationRule label="Al menos un número" passed={validations.hasNumber} />
              <ValidationRule label="Las contraseñas coinciden" passed={validations.matches} />
            </div>

            {/* Submit */}
            <Button type="submit" disabled={!allValid || isLoading} className="w-full">
              {isLoading ? 'Guardando...' : 'Establecer Contraseña'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            ¿No recibiste el código?{' '}
            <Link to="/auth/forgot-password" className="font-semibold text-blue-600 hover:text-blue-700">
              Solicita uno nuevo
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Helper Component ────────────────────────────────────────

function ValidationRule({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] font-bold transition-colors ${
          passed ? 'bg-emerald-500' : 'bg-slate-300'
        }`}
      >
        {passed ? '✓' : ''}
      </div>
      <span
        className={`text-sm transition-colors ${passed ? 'text-slate-700' : 'text-slate-400'}`}
      >
        {label}
      </span>
    </div>
  );
}
