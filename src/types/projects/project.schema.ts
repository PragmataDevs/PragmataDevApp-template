import { z } from 'zod';

/**
 * Schema Zod para el formulario de proyecto.
 * Derivado de los campos editables de Project.
 */
export const projectSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  code: z.string().max(50).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  budget: z.number({ message: 'Ingresa un monto válido' }).positive().optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  project_status: z.enum(['planning', 'active', 'completed', 'paused', 'canceled']),
}).refine(
  (data) => {
    if (data.start_date && data.end_date) {
      return new Date(data.end_date) >= new Date(data.start_date);
    }
    return true;
  },
  { message: 'La fecha de fin debe ser posterior a la de inicio', path: ['end_date'] }
);

export type ProjectFormValues = z.infer<typeof projectSchema>;
