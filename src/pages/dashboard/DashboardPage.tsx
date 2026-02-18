import { useAuth } from '@/features/auth/hooks/useAuth';
import PragmataIcon from '@/assets/pragmata-devs-icon.png';

export default function DashboardPage() {
  const { user, profile, loading } = useAuth();

  if (loading) {
     return <div className="p-8 text-slate-500">Cargando perfil...</div>;
  }

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Bienvenido';

  return (
    <div className="min-h-full bg-[color:var(--pragmata-bg)] text-[color:var(--pragmata-fg)]">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="rounded-3xl border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] p-10 shadow-sm relative overflow-hidden">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[color:var(--pragmata-accent-soft)]"></div>
          <div className="absolute -left-12 -bottom-12 h-48 w-48 rounded-full bg-[color:var(--pragmata-surface-2)]"></div>

          <div className="relative z-10 flex flex-col items-start gap-6">
            <div className="flex items-center gap-3">
              <img
                src={PragmataIcon}
                alt="Pragmata"
                className="h-10 w-10 rounded-xl bg-[color:var(--pragmata-surface)] p-2 border border-[color:var(--pragmata-border)]"
              />
              <span className="text-sm uppercase tracking-widest text-[color:var(--pragmata-muted)]">Pragmata Workspace</span>
            </div>

            <div>
              <h1 className="text-4xl font-bold tracking-tight">Bienvenido, {displayName}</h1>
              <p className="mt-3 text-base text-[color:var(--pragmata-muted)] max-w-2xl">
                Este es tu centro de control. Muy pronto tendrás métricas, reportes y atajos inteligentes.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)] px-4 py-2 text-xs text-[color:var(--pragmata-muted)]">
              Todo listo para comenzar — Dashboard en construcción
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
