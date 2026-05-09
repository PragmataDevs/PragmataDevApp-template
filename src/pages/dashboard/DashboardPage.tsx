import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, Users, CheckSquare, TrendingUp, ArrowRight, Clock } from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { KPICard } from '@/components/ui/KPICard';
import { ENTITY_LABEL_PLURAL } from '@/types/entities/entity';
import PragmataIcon from '@/assets/pragmata-devs-icon.png';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DashboardKPIs {
  entities: number;
  users: number;
  tasksActive: number;
  tasksDone: number;
}

interface RecentActivity {
  id: string;
  type: 'entity' | 'task';
  label: string;
  sublabel?: string;
  time: string;
  href?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, profile, isAuthenticated, sessionEpoch } = useAuth();

  const [kpis, setKpis]         = useState<DashboardKPIs | null>(null);
  const [activity, setActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading]   = useState(true);

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Bienvenido';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    const fetchDashboard = async () => {
      setLoading(true);
      try {
        // Fetch KPIs in parallel
        const [entitiesRes, usersRes, tasksRes] = await Promise.allSettled([
          supabase
            .from('entities')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active'),
          supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active')
            .eq('profile_status', 'active'),
          supabase
            .from('tasks')
            .select('id, task_status', { count: 'exact' })
            .eq('status', 'active'),
        ]);

        if (cancelled) return;

        const entitiesCount = entitiesRes.status === 'fulfilled' && !entitiesRes.value.error
          ? (entitiesRes.value.count ?? 0)
          : 0;

        const usersCount = usersRes.status === 'fulfilled' && !usersRes.value.error
          ? (usersRes.value.count ?? 0)
          : 0;

        let tasksActive = 0;
        let tasksDone = 0;
        if (tasksRes.status === 'fulfilled' && !tasksRes.value.error) {
          const tasks = tasksRes.value.data ?? [];
          tasksActive = tasks.filter(t => t.task_status !== 'done').length;
          tasksDone   = tasks.filter(t => t.task_status === 'done').length;
        }

        setKpis({ entities: entitiesCount, users: usersCount, tasksActive, tasksDone });

        // Fetch recent activity: last 5 entities + last 5 tasks
        const [recentEntities, recentTasks] = await Promise.allSettled([
          supabase
            .from('entities')
            .select('id, name, updated_at')
            .eq('status', 'active')
            .order('updated_at', { ascending: false })
            .limit(5),
          supabase
            .from('tasks')
            .select('id, title, task_status, entity_id, updated_at')
            .eq('status', 'active')
            .order('updated_at', { ascending: false })
            .limit(5),
        ]);

        if (cancelled) return;

        const items: RecentActivity[] = [];

        if (recentEntities.status === 'fulfilled' && !recentEntities.value.error) {
          for (const e of (recentEntities.value.data ?? [])) {
            items.push({
              id: `entity-${e.id}`,
              type: 'entity',
              label: e.name as string,
              sublabel: ENTITY_LABEL_PLURAL,
              time: e.updated_at as string,
              href: `/workspace/${e.id}/dashboard`,
            });
          }
        }

        if (recentTasks.status === 'fulfilled' && !recentTasks.value.error) {
          for (const t of (recentTasks.value.data ?? [])) {
            items.push({
              id: `task-${t.id}`,
              type: 'task',
              label: t.title as string,
              sublabel: formatTaskStatus(t.task_status as string),
              time: t.updated_at as string,
              href: `/workspace/${t.entity_id}/tasks`,
            });
          }
        }

        // Sort all activity by time desc, take top 8
        items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        setActivity(items.slice(0, 8));

      } catch (err) {
        console.warn('[DashboardPage] fetch error', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchDashboard();
    return () => { cancelled = true; };
  }, [isAuthenticated, sessionEpoch]);

  return (
    <div className="min-h-full bg-[color:var(--pragmata-bg)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-8">

        {/* ── Welcome header ─────────────────────────────────────────── */}
        <div className="rounded-xl border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] p-6 shadow-sm relative overflow-hidden">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[color:var(--pragmata-accent-soft)] opacity-60" />
          <div className="relative z-10 flex items-center gap-4">
            <img
              src={PragmataIcon}
              alt="Pragmata"
              className="h-10 w-10 rounded-xl bg-[color:var(--pragmata-surface-2)] p-2 border border-[color:var(--pragmata-border)] flex-shrink-0"
            />
            <div>
              <h1 className="text-xl font-bold text-[color:var(--pragmata-fg)]">
                {greeting}, {displayName}
              </h1>
              <p className="text-sm text-[color:var(--pragmata-muted)] mt-0.5">
                {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        {/* ── KPI cards ─────────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider mb-3">Resumen general</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              label={ENTITY_LABEL_PLURAL}
              value={kpis?.entities ?? 0}
              icon={<Layers className="w-5 h-5" />}
              color="accent"
              href="/settings/entities"
              loading={loading}
            />
            <KPICard
              label="Usuarios activos"
              value={kpis?.users ?? 0}
              icon={<Users className="w-5 h-5" />}
              color="success"
              href="/settings/usuarios"
              loading={loading}
            />
            <KPICard
              label="Tareas en curso"
              value={kpis?.tasksActive ?? 0}
              icon={<CheckSquare className="w-5 h-5" />}
              color="warning"
              loading={loading}
            />
            <KPICard
              label="Tareas completadas"
              value={kpis?.tasksDone ?? 0}
              icon={<TrendingUp className="w-5 h-5" />}
              color="success"
              loading={loading}
            />
          </div>
        </section>

        {/* ── Activity + Quick actions ───────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Activity feed */}
          <div className="lg:col-span-2 rounded-xl border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--pragmata-border)]">
              <h2 className="text-sm font-semibold text-[color:var(--pragmata-fg)] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[color:var(--pragmata-muted)]" />
                Actividad reciente
              </h2>
            </div>
            <div className="divide-y divide-[color:var(--pragmata-border)]">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="h-8 w-8 rounded-lg animate-pulse bg-[color:var(--pragmata-border)] flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/4 rounded animate-pulse bg-[color:var(--pragmata-border)]" />
                      <div className="h-2.5 w-1/2 rounded animate-pulse bg-[color:var(--pragmata-border)]" />
                    </div>
                  </div>
                ))
              ) : activity.length === 0 ? (
                <div className="py-12 text-center text-sm text-[color:var(--pragmata-muted)]">
                  Sin actividad reciente
                </div>
              ) : (
                activity.map(item => (
                  <ActivityItem key={item.id} item={item} />
                ))
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="rounded-xl border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] shadow-sm overflow-hidden h-fit">
            <div className="px-5 py-4 border-b border-[color:var(--pragmata-border)]">
              <h2 className="text-sm font-semibold text-[color:var(--pragmata-fg)]">Acciones rápidas</h2>
            </div>
            <div className="p-3 space-y-1">
              <QuickLink to="/settings/entities" icon={<Layers className="w-4 h-4" />} label={`Gestionar ${ENTITY_LABEL_PLURAL.toLowerCase()}`} />
              <QuickLink to="/settings/usuarios" icon={<Users className="w-4 h-4" />} label="Gestionar usuarios" />
              <QuickLink to="/settings/roles"    icon={<CheckSquare className="w-4 h-4" />} label="Gestionar roles" />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActivityItem({ item }: { item: RecentActivity }) {
  const isEntity = item.type === 'entity';
  const timeAgo = formatTimeAgo(item.time);

  const inner = (
    <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-[color:var(--pragmata-row-hover)] transition-colors">
      <div className={`flex-shrink-0 p-2 rounded-lg ${isEntity ? 'bg-[color:var(--pragmata-accent-soft)]' : 'bg-amber-50 dark:bg-amber-950/30'}`}>
        {isEntity
          ? <Layers className="w-4 h-4 text-[color:var(--pragmata-accent)]" />
          : <CheckSquare className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[color:var(--pragmata-fg)] truncate">{item.label}</p>
        <p className="text-xs text-[color:var(--pragmata-muted)]">{item.sublabel} · {timeAgo}</p>
      </div>
      {item.href && <ArrowRight className="w-4 h-4 text-[color:var(--pragmata-muted-2)] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />}
    </div>
  );

  if (item.href) return <Link to={item.href} className="group block no-underline">{inner}</Link>;
  return <div className="group">{inner}</div>;
}

function QuickLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors group"
    >
      <span className="text-[color:var(--pragmata-muted)] group-hover:text-[color:var(--pragmata-accent)] transition-colors">{icon}</span>
      {label}
      <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'ahora mismo';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `hace ${days} días`;
  return new Date(isoString).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function formatTaskStatus(status: string): string {
  const map: Record<string, string> = {
    backlog:     'Backlog',
    todo:        'Por hacer',
    in_progress: 'En progreso',
    review:      'En revisión',
    done:        'Completada',
  };
  return `Tarea · ${map[status] ?? status}`;
}
