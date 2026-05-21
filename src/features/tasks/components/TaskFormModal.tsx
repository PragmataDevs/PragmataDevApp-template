import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, Loader2 } from 'lucide-react';
import type { Task, TaskStatus } from '@/features/tasks/types/task';
import { KANBAN_COLUMNS, PRIORITY_META } from '@/features/tasks/types/task';
import { taskSchema, type TaskFormValues } from '@/features/tasks/types/task.schema';

interface TaskFormModalProps {
  isOpen:       boolean;
  initialStatus?: TaskStatus;
  editingTask?: Task | null;
  onClose:      () => void;
  onSubmit:     (values: TaskFormValues) => Promise<void>;
  isSubmitting: boolean;
}

export function TaskFormModal({
  isOpen,
  initialStatus = 'backlog',
  editingTask,
  onClose,
  onSubmit,
  isSubmitting,
}: TaskFormModalProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title:       '',
      description: '',
      priority:    'medium',
      task_status: initialStatus,
      assigned_to: '',
      due_date:    '',
      tags:        '',
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (editingTask) {
      reset({
        title:       editingTask.title,
        description: editingTask.description ?? '',
        priority:    editingTask.priority,
        task_status: editingTask.task_status,
        assigned_to: editingTask.assigned_to ?? '',
        due_date:    editingTask.due_date ?? '',
        tags:        editingTask.tags?.join(', ') ?? '',
      });
    } else {
      reset({
        title:       '',
        description: '',
        priority:    'medium',
        task_status: initialStatus,
        assigned_to: '',
        due_date:    '',
        tags:        '',
      });
    }
  }, [editingTask, initialStatus, reset]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-pragmata shadow-xl w-full max-w-lg flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-semibold text-slate-900">
            {editingTask ? 'Editar Tarea' : 'Nueva Tarea'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 px-6 py-5 overflow-y-auto">

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Título <span className="text-red-500">*</span>
            </label>
            <input
              {...register('title')}
              placeholder="¿Qué hay que hacer?"
              autoFocus
              className="w-full px-3 py-2 border border-slate-300 rounded-pragmata text-sm
                focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent
                placeholder:text-slate-400"
            />
            {errors.title && (
              <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Descripción
            </label>
            <textarea
              {...register('description')}
              rows={3}
              placeholder="Contexto adicional, criterios de aceptación…"
              className="w-full px-3 py-2 border border-slate-300 rounded-pragmata text-sm
                focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent
                placeholder:text-slate-400 resize-none"
            />
            {errors.description && (
              <p className="mt-1 text-xs text-red-500">{errors.description.message}</p>
            )}
          </div>

          {/* Priority + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Prioridad</label>
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <select
                    {...field}
                    className="w-full px-3 py-2 border border-slate-300 rounded-pragmata text-sm
                      focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent bg-white"
                  >
                    {(Object.entries(PRIORITY_META) as [string, { label: string }][]).map(([key, meta]) => (
                      <option key={key} value={key}>{meta.label}</option>
                    ))}
                  </select>
                )}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Columna</label>
              <Controller
                control={control}
                name="task_status"
                render={({ field }) => (
                  <select
                    {...field}
                    className="w-full px-3 py-2 border border-slate-300 rounded-pragmata text-sm
                      focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent bg-white"
                  >
                    {KANBAN_COLUMNS.map(col => (
                      <option key={col.id} value={col.id}>{col.label}</option>
                    ))}
                  </select>
                )}
              />
            </div>
          </div>

          {/* Due date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Fecha límite</label>
            <input
              {...register('due_date')}
              type="date"
              className="w-full px-3 py-2 border border-slate-300 rounded-pragmata text-sm
                focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent"
            />
            {errors.due_date && (
              <p className="mt-1 text-xs text-red-500">{errors.due_date.message}</p>
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Etiquetas
              <span className="ml-1 text-xs text-slate-400">(separadas por coma)</span>
            </label>
            <input
              {...register('tags')}
              placeholder="frontend, bugfix, bloqueado"
              className="w-full px-3 py-2 border border-slate-300 rounded-pragmata text-sm
                focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent
                placeholder:text-slate-400"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-pragmata">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300
              rounded-pragmata hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white
              bg-[color:var(--pragmata-accent)] rounded-pragmata hover:opacity-90
              disabled:opacity-50 transition-opacity"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {editingTask ? 'Guardar cambios' : 'Crear tarea'}
          </button>
        </div>
      </div>
    </div>
  );
}
