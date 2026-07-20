import { z } from 'zod';

/**
 * taskSchema: schema para el formulario de tareas.
 * Los campos se reciben como strings del form y se validan.
 * El transform de `tags` es opcional (el parent decide cómo parsear).
 */
export const taskSchema = z.object({
  title: z
    .string()
    .min(1, 'El título es requerido')
    .max(200, 'Máximo 200 caracteres'),

  description: z
    .string()
    .max(4000, 'Máximo 4000 caracteres')
    .optional(),

  priority: z.enum(['low', 'medium', 'high', 'critical'], {
    message: 'Prioridad inválida',
  }),

  task_status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done'], {
    message: 'Estado inválido',
  }),

  assigned_to: z
    .string()
    .optional()
    .nullable(),

  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .optional()
    .nullable()
    .or(z.literal('')),

  tags: z
    .string()
    .optional(),
});

/**
 * TaskFormValues: lo que el form entrega, antes de cualquier transformación.
 * `tags` es un string CSV: "frontend, bugfix, bloqueado"
 */
export type TaskFormValues = z.output<typeof taskSchema>;

/**
 * Helper para parsear las tags del string CSV a array.
 */
export function parseTagsField(raw: string | undefined | null): string[] | null {
  if (!raw) return null;
  const parsed = raw.split(',').map(t => t.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : null;
}
