import { z } from 'zod';

/**
 * Schema Zod para el formulario de rol.
 * Derivado de los campos editables de Role.
 */
export const roleSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
  description: z.string().max(300, 'La descripción no puede superar 300 caracteres').nullable(),
});

export type RoleFormValues = z.infer<typeof roleSchema>;
