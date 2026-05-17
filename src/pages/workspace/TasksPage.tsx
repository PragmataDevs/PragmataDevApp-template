import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Plus, RefreshCw, Layers, Sparkles, X } from 'lucide-react';
import { useTasks } from '@/features/tasks/hooks/useTasks';
import { KanbanBoard } from '@/features/tasks/components/KanbanBoard';
import { TaskFormModal } from '@/features/tasks/components/TaskFormModal';
import { PageHeader } from '@/components/layout/PageHeader';
import { useActiveEntity } from '@/features/entities/hooks/useActiveEntity';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { Task, TaskStatus } from '@/types/tasks/task';
import { parseTagsField } from '@/types/tasks/task.schema';
import type { TaskFormValues } from '@/types/tasks/task.schema';
import { resolveSupabaseUrl } from '@/lib/supabase';

const AI_ENABLED = import.meta.env.VITE_ENABLE_AI === 'true';

export default function TasksPage() {
  const { entityId: rawEntityId } = useParams<{ entityId: string }>();
  const navigate = useNavigate();
  const resolvedEntityId = useActiveEntity();
  const { user } = useAuth();

  // "none" is the fallback slug used when sidebar has no entity yet
  const noEntitySelected = !rawEntityId || rawEntityId === 'none';
  const entityId = noEntitySelected ? undefined : rawEntityId;

  // Auto-navigate once activeEntity resolves
  useEffect(() => {
    if (noEntitySelected && resolvedEntityId) {
      navigate(`/workspace/${resolvedEntityId}/tasks`, { replace: true });
    }
  }, [noEntitySelected, resolvedEntityId, navigate]);

  const hook = useTasks(entityId);

  // AI summary state
  const [aiSummary, setAiSummary]         = useState<string | null>(null);
  const [aiLoading, setAiLoading]         = useState(false);
  const [aiError, setAiError]             = useState<string | null>(null);

  const handleAiSummary = useCallback(async () => {
    if (!entityId || !user) return;
    setAiLoading(true);
    setAiError(null);
    setAiSummary(null);
    try {
      const { data: sessionData } = await import('@/lib/supabase').then(m => m.supabase.auth.getSession());
      const token = sessionData?.session?.access_token;
      const res = await fetch(`${resolveSupabaseUrl()}/functions/v1/ai-task-summary`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ entity_id: entityId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { summary } = await res.json() as { summary: string };
      setAiSummary(summary);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Error al generar resumen');
    } finally {
      setAiLoading(false);
    }
  }, [entityId, user]);

  // Modal state
  const [modalOpen, setModalOpen]     = useState(false);
  const [defaultCol, setDefaultCol]   = useState<TaskStatus>('backlog');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  // Confirm delete
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleAdd = useCallback((status: TaskStatus) => {
    setEditingTask(null);
    setDefaultCol(status);
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback((task: Task) => {
    setEditingTask(task);
    setModalOpen(true);
  }, []);

  const handleDelete = useCallback((task: Task) => {
    setDeletingTask(task);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deletingTask) return;
    await hook.deleteTask(deletingTask.id, deletingTask.version);
    setDeletingTask(null);
  }, [deletingTask, hook]);

  const handleSubmit = useCallback(async (values: TaskFormValues) => {
    if (!entityId) return;
    setSubmitting(true);

    try {
      const tags = parseTagsField(values.tags);

      if (editingTask) {
        await hook.updateTask(editingTask.id, {
          title:       values.title,
          description: values.description || null,
          priority:    values.priority,
          task_status: values.task_status,
          due_date:    values.due_date || null,
          assigned_to: values.assigned_to || null,
          tags,
        }, editingTask.version);
      } else {
        await hook.createTask({
          entity_id:  entityId,
          title:       values.title,
          description: values.description || null,
          priority:    values.priority,
          task_status: values.task_status,
          due_date:    values.due_date || null,
          assigned_to: values.assigned_to || null,
          tags,
        });
      }
      setModalOpen(false);
      setEditingTask(null);
    } finally {
      setSubmitting(false);
    }
  }, [entityId, editingTask, hook]);

  // -------------------------------------------------------------------------
  // No entity selected — show selector state
  // -------------------------------------------------------------------------
  if (noEntitySelected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <div className="p-4 rounded-full bg-[color:var(--pragmata-accent-soft)]">
          <Layers className="w-8 h-8 text-[color:var(--pragmata-accent)]" />
        </div>
        <h2 className="text-lg font-semibold text-[color:var(--pragmata-fg)]">
          Selecciona una entidad
        </h2>
        <p className="text-sm text-[color:var(--pragmata-muted)] max-w-xs">
          Ve a <strong>Configuración → Entidades</strong> y abre una entidad,
          o crea una nueva para empezar a gestionar tareas.
        </p>
        <Link
          to="/settings/entities"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white
            bg-[color:var(--pragmata-accent)] rounded-pragmata hover:opacity-90 transition-opacity"
        >
          <Layers className="w-4 h-4" />
          Ir a Entidades
        </Link>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Totals for subtitle
  // -------------------------------------------------------------------------
  const activeCount = hook.tasks.length;
  const doneCount   = hook.getColumn('done').length;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Entidades', to: '/settings/entities' },
          { label: entityId ?? '…', to: `..` },
          { label: 'Tareas' },
        ]}
        title="Tareas"
        subtitle={`${activeCount} activas · ${doneCount} completadas`}
        actions={
          <>
            <button
              onClick={hook.refreshTasks}
              className="p-2 rounded-pragmata border border-slate-200 hover:bg-slate-50
                text-slate-500 hover:text-slate-700 transition-colors"
              title="Actualizar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {AI_ENABLED && (
              <button
                onClick={handleAiSummary}
                disabled={aiLoading}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium
                  text-[color:var(--pragmata-fg)] border border-[color:var(--pragmata-border)]
                  bg-[color:var(--pragmata-surface)] rounded-pragmata hover:bg-[color:var(--pragmata-surface-2)]
                  transition-colors disabled:opacity-50 shadow-sm"
                title="Resumen IA"
              >
                <Sparkles className={`w-4 h-4 text-[color:var(--pragmata-accent)] ${aiLoading ? 'animate-pulse' : ''}`} />
                <span className="hidden sm:inline">{aiLoading ? 'Analizando...' : 'Resumen IA'}</span>
              </button>
            )}
            <button
              onClick={() => handleAdd('backlog')}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white
                bg-[color:var(--pragmata-accent)] rounded-pragmata hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Nueva tarea
            </button>
          </>
        }
      />

      {/* AI Summary panel */}
      {(aiSummary || aiError) && (
        <div className={`mx-4 sm:mx-6 mb-4 rounded-xl border p-4 relative ${
          aiError
            ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
            : 'bg-[color:var(--pragmata-accent-soft)] border-[color:var(--pragmata-accent)]/30'
        }`}>
          <div className="flex items-start gap-3">
            <Sparkles className={`w-4 h-4 mt-0.5 flex-shrink-0 ${aiError ? 'text-red-500' : 'text-[color:var(--pragmata-accent)]'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold mb-1 text-[color:var(--pragmata-muted)] uppercase tracking-wider">
                {aiError ? 'Error de IA' : 'Resumen IA'}
              </p>
              <p className={`text-sm whitespace-pre-line leading-relaxed ${aiError ? 'text-red-700 dark:text-red-400' : 'text-[color:var(--pragmata-fg)]'}`}>
                {aiSummary ?? aiError}
              </p>
            </div>
            <button
              onClick={() => { setAiSummary(null); setAiError(null); }}
              className="flex-shrink-0 p-1 rounded text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-danger)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex-1 overflow-hidden">
        <KanbanBoard
          hook={hook}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </div>

      {/* Create / Edit modal */}
      <TaskFormModal
        isOpen={modalOpen}
        initialStatus={defaultCol}
        editingTask={editingTask}
        onClose={() => { setModalOpen(false); setEditingTask(null); }}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Delete confirmation */}
      {deletingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-pragmata shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-2">¿Eliminar tarea?</h3>
            <p className="text-sm text-slate-500 mb-6">
              "<span className="font-medium text-slate-700">{deletingTask.title}</span>" será archivada.
              Esta acción puede revertirse desde la base de datos.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingTask(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300
                  rounded-pragmata hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500
                  rounded-pragmata hover:bg-red-600 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
