import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CLIENT_KIND_CONFIG, type Cliente, type ClienteInput } from '@/features/clients/types/cliente';
import { clienteSchema, type ClienteFormValues } from '@/features/clients/types/cliente.schema';

const inputClass =
  'w-full px-3 py-2 text-sm bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)] rounded-pragmata text-[color:var(--pragmata-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)]';

const labelClass = 'block text-xs font-medium text-[color:var(--pragmata-muted)] mb-1';

function toFormValues(cliente: Cliente | null): ClienteFormValues {
  if (!cliente) {
    return {
      client_kind: 'desarrolladora',
      nombre: '',
      contacto_nombre: '',
      contacto_email: '',
      contacto_telefono: '',
      notas: '',
      rfc: '',
      razon_social: '',
      regimen_fiscal: '',
      uso_cfdi: '',
      cp_fiscal: '',
      calle_fiscal: '',
      colonia_fiscal: '',
      municipio_fiscal: '',
      estado_fiscal: '',
      pais_fiscal: 'México',
      email_facturacion: '',
    };
  }
  return {
    client_kind:       cliente.client_kind,
    nombre:            cliente.nombre,
    contacto_nombre:   cliente.contacto_nombre ?? '',
    contacto_email:    cliente.contacto_email ?? '',
    contacto_telefono: cliente.contacto_telefono ?? '',
    notas:             cliente.notas ?? '',
    rfc:               cliente.rfc ?? '',
    razon_social:      cliente.razon_social ?? '',
    regimen_fiscal:    cliente.regimen_fiscal ?? '',
    uso_cfdi:          cliente.uso_cfdi ?? '',
    cp_fiscal:         cliente.cp_fiscal ?? '',
    calle_fiscal:      cliente.calle_fiscal ?? '',
    colonia_fiscal:    cliente.colonia_fiscal ?? '',
    municipio_fiscal:  cliente.municipio_fiscal ?? '',
    estado_fiscal:     cliente.estado_fiscal ?? '',
    pais_fiscal:       cliente.pais_fiscal,
    email_facturacion: cliente.email_facturacion ?? '',
  };
}

function toClienteInput(values: ClienteFormValues): ClienteInput {
  return {
    client_kind:       values.client_kind,
    nombre:            values.nombre,
    contacto_nombre:   values.contacto_nombre || null,
    contacto_email:    values.contacto_email || null,
    contacto_telefono: values.contacto_telefono || null,
    notas:             values.notas || null,
    rfc:               values.rfc || null,
    razon_social:      values.razon_social || null,
    regimen_fiscal:    values.regimen_fiscal || null,
    uso_cfdi:          values.uso_cfdi || null,
    cp_fiscal:         values.cp_fiscal || null,
    calle_fiscal:      values.calle_fiscal || null,
    colonia_fiscal:    values.colonia_fiscal || null,
    municipio_fiscal:  values.municipio_fiscal || null,
    estado_fiscal:     values.estado_fiscal || null,
    pais_fiscal:       values.pais_fiscal,
    email_facturacion: values.email_facturacion || null,
  };
}

export interface ClientFormProps {
  cliente?: Cliente | null;
  onCancel: () => void;
  onSave: (data: ClienteInput) => Promise<void>;
  saving?: boolean;
}

export default function ClientForm({
  cliente = null,
  onCancel,
  onSave,
  saving = false,
}: ClientFormProps) {
  const isEditing = !!cliente;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ClienteFormValues>({
    resolver: zodResolver(clienteSchema),
    defaultValues: toFormValues(cliente),
  });

  const clientKind = watch('client_kind');

  const onSubmit = async (values: ClienteFormValues) => {
    await onSave(toClienteInput(values));
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <section className="space-y-4">
          <h3 className="text-xs font-bold text-[color:var(--pragmata-muted)] uppercase tracking-wider">
            Datos generales
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="client_kind">Tipo de cliente *</label>
              <select id="client_kind" className={inputClass} {...register('client_kind')}>
                {Object.entries(CLIENT_KIND_CONFIG).map(([value, cfg]) => (
                  <option key={value} value={value}>{cfg.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="nombre">
                {clientKind === 'desarrolladora' ? 'Nombre comercial *' : 'Nombre completo *'}
              </label>
              <input id="nombre" className={inputClass} {...register('nombre')} />
              {errors.nombre && (
                <p className="mt-1 text-xs text-[color:var(--pragmata-danger)]">{errors.nombre.message}</p>
              )}
            </div>
            <div>
              <label className={labelClass} htmlFor="contacto_nombre">Contacto</label>
              <input id="contacto_nombre" className={inputClass} {...register('contacto_nombre')} />
            </div>
            <div>
              <label className={labelClass} htmlFor="contacto_telefono">Teléfono</label>
              <input id="contacto_telefono" className={inputClass} {...register('contacto_telefono')} />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass} htmlFor="contacto_email">Email de contacto</label>
              <input id="contacto_email" type="email" className={inputClass} {...register('contacto_email')} />
              {errors.contacto_email && (
                <p className="mt-1 text-xs text-[color:var(--pragmata-danger)]">{errors.contacto_email.message}</p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className={labelClass} htmlFor="notas">Notas</label>
              <textarea id="notas" rows={2} className={inputClass} {...register('notas')} />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-bold text-[color:var(--pragmata-muted)] uppercase tracking-wider">
            Datos de facturación
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="rfc">
                RFC {clientKind === 'desarrolladora' ? '*' : ''}
              </label>
              <input id="rfc" className={`${inputClass} uppercase`} {...register('rfc')} />
              {errors.rfc && (
                <p className="mt-1 text-xs text-[color:var(--pragmata-danger)]">{errors.rfc.message}</p>
              )}
            </div>
            <div>
              <label className={labelClass} htmlFor="razon_social">Razón social</label>
              <input id="razon_social" className={inputClass} {...register('razon_social')} />
            </div>
            <div>
              <label className={labelClass} htmlFor="regimen_fiscal">Régimen fiscal</label>
              <input id="regimen_fiscal" className={inputClass} {...register('regimen_fiscal')} />
            </div>
            <div>
              <label className={labelClass} htmlFor="uso_cfdi">Uso CFDI</label>
              <input id="uso_cfdi" className={inputClass} {...register('uso_cfdi')} placeholder="G03, P01…" />
            </div>
            <div>
              <label className={labelClass} htmlFor="email_facturacion">Email facturación</label>
              <input id="email_facturacion" type="email" className={inputClass} {...register('email_facturacion')} />
              {errors.email_facturacion && (
                <p className="mt-1 text-xs text-[color:var(--pragmata-danger)]">{errors.email_facturacion.message}</p>
              )}
            </div>
            <div>
              <label className={labelClass} htmlFor="cp_fiscal">C.P. fiscal</label>
              <input id="cp_fiscal" className={inputClass} {...register('cp_fiscal')} />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass} htmlFor="calle_fiscal">Calle y número</label>
              <input id="calle_fiscal" className={inputClass} {...register('calle_fiscal')} />
            </div>
            <div>
              <label className={labelClass} htmlFor="colonia_fiscal">Colonia</label>
              <input id="colonia_fiscal" className={inputClass} {...register('colonia_fiscal')} />
            </div>
            <div>
              <label className={labelClass} htmlFor="municipio_fiscal">Municipio / ciudad</label>
              <input id="municipio_fiscal" className={inputClass} {...register('municipio_fiscal')} />
            </div>
            <div>
              <label className={labelClass} htmlFor="estado_fiscal">Estado</label>
              <input id="estado_fiscal" className={inputClass} {...register('estado_fiscal')} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pais_fiscal">País</label>
              <input id="pais_fiscal" className={inputClass} {...register('pais_fiscal')} />
            </div>
          </div>
        </section>
      </div>

      <div className="flex justify-end gap-3 px-6 py-4 border-t border-[color:var(--pragmata-border)]">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          {isEditing ? 'Guardar cambios' : 'Crear cliente'}
        </Button>
      </div>
    </form>
  );
}
