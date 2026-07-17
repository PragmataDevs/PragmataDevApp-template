import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { authRedirectUrl } from '@/lib/auth/authRedirect';
import { BrandIcon } from '@/components/brand/BrandIcon';
import { getPublicBrandName } from '@/lib/brandEnv';

export default function ForgotPasswordPage() {
  const brandName = getPublicBrandName();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setError('Introduce tu correo electrónico.');
      setIsLoading(false);
      return;
    }

    // Envía un código de 6 dígitos por correo (ver supabase/templates/recovery.html).
    // redirectTo se conserva por compatibilidad, pero el correo ya no lleva enlace.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: authRedirectUrl('/auth/reset-password'),
    });

    setIsLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    // Pasa a la pantalla de reset con el correo para que solo teclee el código.
    navigate('/auth/reset-password', { state: { email: trimmed } });
  };

  return (
    <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="px-8 pt-8 pb-6 text-center">
          <div className="mx-auto mb-6 flex justify-center">
            <BrandIcon className="h-16 w-16" alt={brandName} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">¿Olvidaste tu contraseña?</h1>
          <p className="text-slate-500 mt-2 text-sm">
            Te enviaremos un código de 6 dígitos para establecer una contraseña nueva.
          </p>
        </div>

        <div className="px-8 pb-8">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2 text-left">
              <label className="text-sm font-medium text-slate-700 block">Email</label>
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
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <Button type="submit" variant="accent" loading={isLoading} fullWidth className="py-2.5">
              Enviar código
            </Button>
          </form>

          <Link
            to="/login"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
