import { z } from 'zod';

/**
 * Schema Zod para el formulario de creación de usuario.
 * Derivado de los campos de Profile que el formulario edita.
 * Usar con react-hook-form + @hookform/resolvers/zod.
 */
export const userCreateSchema = z.object({
  full_name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  role_id: z.string().uuid('Selecciona un rol'),
  access_level: z.enum(['god', 'admin', 'member']),
  job_title: z.string().max(100).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  is_role_synced: z.boolean(),
});

export const userUpdateSchema = userCreateSchema.omit({ email: true });

export type UserCreateFormValues = z.infer<typeof userCreateSchema>;
export type UserUpdateFormValues = z.infer<typeof userUpdateSchema>;
