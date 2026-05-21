import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { CheckSquare, Users, TrendingUp, Layers, ArrowRight, Clock, Plus } from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { KPICard } from '@/components/ui/KPICard';
import { useActiveEntity } from '@/features/entities/hooks/useActiveEntity';
import { ENTITY_LABEL } from '@/types/entities/entity';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EntityInfo {
  id: string;
  name: string;
  code?: string;
  location?: string;
  entity_status: string;
}

interface WorkspaceKPIs {
  tasksBacklog: number;
  tasksInProgress: number;
  tasksDone: number;
  members: number;
}

interface RecentTask {
  id: string;
  title: string;
  task_status: string;
  priority: string;
  updated_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  backlog:     'Backlog',
  todo:        'Por hacer',
  in_progress: 'En progreso',
  review:      'En revisión',
  done:        'Completada',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  high:     'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
  medium:   'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  low:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkspaceDashboardPage() {
  const { entityId: rawEntityId } = useParams<{ entityId: string }>();
  const navigate = useNavigate();
  const resolvedEntityId = useActiveEntity();
  const { isAuthenticated, user, sessionEpoch } = useAuth();

  const noEntity = !rawEntityId || rawEntityId === 'none';
  const entityId = noEntity ? undefined : rawEntityId;

  // Auto-redirect if no entityId in URL but one is resolved
  useEffect(() => {
    if (noEntity && resolvedEntityId) {
      navigate(`/workspace/${resolvedEntityId}/dashboard`, { replace: true });
    }
  }, [noEntity, resolvedEntityId, navigate]);

  const [entity, setEntity]   = useState<EntityInfo | null>(null);
  const [kpis, setKpis]       = useState<WorkspaceKPIs | null>(null);
  const [tasks, setTasks]     = useState<RecentTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !entityId) return;
    let cancelled = false;

    const fetchWorkspace = async () => {
      setLoading(true);
      try {
        const [entityRes, tasksRes, membersRes] = await Promise.allSettled([
          supabase
            .from('entities')
            .select('id, name, code, location, entity_status')
            .eq('id', entityId)
            .single(),
          supabase
            .from('tasks')
            .select('id, title, task_status, priority, updated_at')
            .eq('entity_id', entityId)
            .eq('status', 'active')
            .order('updated_at', { ascending: false })
            .limit(20),
          supabase
            .from('sys_entity_access')
            .select('id', { count: 'exact', head: true })
            .eq('entity_id', entityId),
        ]);

        if (cancelled) return;

        if (entityRes.status === 'fulfilled' && !entityRes.value.error) {
          setEntity(entityRes.value.data as EntityInfo);
        }

        if (tasksRes.status === 'fulfilled' && !tasksRes.value.error) {
          const allTasks = (tasksRes.value.data ?? []) as RecentTask[];
          setTasks(allTasks.slice(0, 6));
          setKpis({
            tasksBacklog:    allTasks.filter(t => t.task_status === 'backlog' || t.task_status === 'todo').length,
            tasksInProgress: allTasks.filter(t => t.task_status === 'in_progress' || t.task_status === 'review').length,
            tasksDone:       allTasks.filter(t => t.task_status === 'done').length,
            members: membersRes.status === 'fulfilled' && !('error' in membersRes.value && membersRes.value.error)
              ? ((membersRes as PromiseFulfilledResult<{ count: number | null }>).value.count ?? 0)
              : 0,
          });
        }
      } catch (err) {
        console.warn('[WorkspaceDashboard] fetch error', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchWorkspace();
    return () => { cancelled = true; };
  }, [isAuthenticated, entityId, sessionEpoch, user]);

  // ── Empty state ─────────────────────────────────────────────────────────
  if (noEntity) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <div className="p-4 rounded-full bg-[color:var(--pragmata-accent-soft)]">
          <Layers className="w-8 h-8 text-[color:var(--pragmata-accent)]" />
        </div>
        <h2 className="text-lg font-semibold text-[color:var(--pragmata-fg)]">Selecciona una {ENTITY_LABEL.toLowerCase()}</h2>
        <p className="text-sm text-[color:var(--pragmata-muted)] max-w-xs">
          Abre una {ENTITY_LABEL.toLowerCase()} desde Configuración para ver su resumen.
        </p>
        <Link
          to="/settings/entities"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[color:var(--pragmata-accent)] rounded-lg hover:opacity-90 transition-opacity"
        >
          <Layers className="w-4 h-4" />
          Ir a {ENTITY_LABEL}s
        </Link>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-[color:var(--pragmata-bg)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-6">

        {/* Entity header */}
        <div className="rounded-xl border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] p-5 shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[color:var(--pragmata-accent-soft)] opacity-50" />
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div>
              {loading ? (
                <div className="space-y-2">
                  <div className="h-6 w-48 rounded animate-pulse bg-[color:var(--pragmata-border)]" />
                  <div className="h-4 w-32 rounded animate-pulse bg-[color:var(--pragmata-border)]" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-[color:var(--pragmata-muted)] uppercase tracking-wider">{ENTITY_LABEL}</span>
                    {entity?.code && (
                      <span className="text-xs font-mono bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)] px-1.5 py-0.5 rounded text-[color:var(--pragmata-muted)]">
                        {entity.code}
                      </span>
                    )}
                  </div>
                  <h1 className="text-2xl font-bold text-[color:var(--pragmata-fg)]">{entity?.name ?? '—'}</h1>
                  {entity?.location && (
                    <p className="text-sm text-[color:var(--pragmata-muted)] mt-0.5">{entity.location}</p>
                  )}
                </>
              )}
            </div>
            <Link
              to={`/workspace/${entityId}/tasks`}
              className="flex-shrink-0 flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[color:var(--pragmata-accent)] rounded-lg hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nueva tarea</span>
            </Link>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Pendientes"    value={kpis?.tasksBacklog ?? 0}    icon={<CheckSquare className="w-5 h-5" />} color="accent"   loading={loading} />
          <KPICard label="En progreso"   value={kpis?.tasksInProgress ?? 0} icon={<TrendingUp className="w-5 h-5" />} color="warning"  loading={loading} />
          <KPICard label="Completadas"   value={kpis?.tasksDone ?? 0}       icon={<TrendingUp className="w-5 h-5" />} color="success"  loading={loading} />
          <KPICard label="Miembros"      value={kpis?.members ?? 0}         icon={<Users className="w-5 h-5" />}      color="accent"   loading={loading} />
        </div>

        {/* Recent tasks */}
        <div className="rounded-xl border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--pragmata-border)]">
            <h2 className="text-sm font-semibold text-[color:var(--pragmata-fg)] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[color:var(--pragmata-muted)]" />
              Tareas recientes
            </h2>
            <Link
              to={`/workspace/${entityId}/tasks`}
              className="text-xs text-[color:var(--pragmata-accent)] hover:underline flex items-center gap-1"
            >
              Ver todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-[color:var(--pragmata-border)]">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="h-4 flex-1 rounded animate-pulse bg-[color:var(--pragmata-border)]" />
                  <div className="h-5 w-20 rounded-full animate-pulse bg-[color:var(--pragmata-border)]" />
                </div>
              ))
            ) : tasks.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-[color:var(--pragmata-muted)]">Sin tareas aún</p>
                <Link
                  to={`/workspace/${entityId}/tasks`}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-[color:var(--pragmata-accent)] hover:underline"
                >
                  <Plus className="w-3 h-3" /> Crear primera tarea
                </Link>
              </div>
            ) : (
              tasks.map(task => (
                <Link
                  key={task.id}
                  to={`/workspace/${entityId}/tasks`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-[color:var(--pragmata-row-hover)] transition-colors group"
                >
                  <span className="flex-1 text-sm text-[color:var(--pragmata-fg)] truncate">{task.title}</span>
                  <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.low}`}>
                    {task.priority}
                  </span>
                  <span className="flex-shrink-0 text-xs text-[color:var(--pragmata-muted)] hidden sm:block">
                    {STATUS_LABELS[task.task_status] ?? task.task_status}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-[color:var(--pragmata-muted-2)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
