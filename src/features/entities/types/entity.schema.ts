import { z } from 'zod';

export const entitySchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  code: z.string().max(50).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  budget: z.number({ message: 'Ingresa un monto válido' }).positive().optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  entity_status: z.enum(['planning', 'active', 'completed', 'paused', 'canceled']),
}).refine(
  (data) => {
    if (data.start_date && data.end_date) {
      return new Date(data.end_date) >= new Date(data.start_date);
    }
    return true;
  },
  { message: 'La fecha de fin debe ser posterior a la de inicio', path: ['end_date'] }
);

export type EntityFormValues = z.output<typeof entitySchema>;
