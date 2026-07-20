import { z } from 'zod';

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: 'Email inválido' });

const optionalRfc = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine(
    (v) => !v || /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(v.replace(/\s/g, '')),
    { message: 'RFC inválido' },
  );

export const clienteSchema = z.object({
  client_kind: z.enum(['desarrolladora', 'particular'], {
    message: 'Selecciona el tipo de cliente',
  }),
  nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(200),
  contacto_nombre: z.string().max(120).optional().nullable(),
  contacto_email: optionalEmail,
  contacto_telefono: z.string().max(30).optional().nullable(),
  notas: z.string().max(2000).optional().nullable(),
  rfc: optionalRfc,
  razon_social: z.string().max(200).optional().nullable(),
  regimen_fiscal: z.string().max(120).optional().nullable(),
  uso_cfdi: z.string().max(80).optional().nullable(),
  cp_fiscal: z.string().max(10).optional().nullable(),
  calle_fiscal: z.string().max(200).optional().nullable(),
  colonia_fiscal: z.string().max(120).optional().nullable(),
  municipio_fiscal: z.string().max(120).optional().nullable(),
  estado_fiscal: z.string().max(80).optional().nullable(),
  pais_fiscal: z.string().trim().min(1, 'País requerido').max(80),
  email_facturacion: optionalEmail,
}).superRefine((data, ctx) => {
  if (data.client_kind === 'desarrolladora' && !data.rfc?.trim()) {
    ctx.addIssue({
      code: 'custom',
      message: 'El RFC es obligatorio para desarrolladoras',
      path: ['rfc'],
    });
  }
});

export type ClienteFormValues = z.output<typeof clienteSchema>;
