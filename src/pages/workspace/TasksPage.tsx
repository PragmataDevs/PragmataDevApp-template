import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { useTasks } from '@/features/tasks/hooks/useTasks';
import { KanbanBoard } from '@/features/tasks/components/KanbanBoard';
import { TaskFormModal } from '@/features/tasks/components/TaskFormModal';
import { PageHeader } from '@/components/layout/PageHeader';
import type { Task, TaskStatus } from '@/types/tasks/task';
import { parseTagsField } from '@/types/tasks/task.schema';
import type { TaskFormValues } from '@/types/tasks/task.schema';

export default function TasksPage() {
  const { entityId } = useParams<{ entityId: string }>();
  const hook = useTasks(entityId);

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
