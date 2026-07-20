import type { AuditBase, UUID } from '@/types/core/base';

/** Tipo de cliente — ejemplo de enum de dominio fijo (no catálogo editable). */
export type ClientKind = 'desarrolladora' | 'particular';

export const CLIENT_KIND_CONFIG: Record<ClientKind, { label: string; color: string; bgClass: string }> = {
  desarrolladora: { label: 'Desarrolladora', color: 'text-blue-600',    bgClass: 'bg-blue-50'    },
  particular:     { label: 'Particular',     color: 'text-emerald-600', bgClass: 'bg-emerald-50' },
};

/** Cliente canónico — referencia del patrón Model + Form (ver docs/architecture.md §4.1.2). */
export interface Cliente extends AuditBase {
  team_id:           UUID;
  client_kind:       ClientKind;
  nombre:            string;
  contacto_nombre:   string | null;
  contacto_email:    string | null;
  contacto_telefono: string | null;
  notas:             string | null;
  rfc:               string | null;
  razon_social:      string | null;
  regimen_fiscal:    string | null;
  uso_cfdi:          string | null;
  cp_fiscal:         string | null;
  calle_fiscal:      string | null;
  colonia_fiscal:    string | null;
  municipio_fiscal:  string | null;
  estado_fiscal:     string | null;
  pais_fiscal:       string;
  email_facturacion: string | null;
}

export type ClienteInput = Pick<Cliente,
  | 'client_kind'
  | 'nombre'
  | 'contacto_nombre'
  | 'contacto_email'
  | 'contacto_telefono'
  | 'notas'
  | 'rfc'
  | 'razon_social'
  | 'regimen_fiscal'
  | 'uso_cfdi'
  | 'cp_fiscal'
  | 'calle_fiscal'
  | 'colonia_fiscal'
  | 'municipio_fiscal'
  | 'estado_fiscal'
  | 'pais_fiscal'
  | 'email_facturacion'
>;

export function createEmptyCliente(userId: string, teamId: string): Cliente {
  return {
    id:                crypto.randomUUID(),
    created_at:        new Date().toISOString(),
    updated_at:        new Date().toISOString(),
    created_by:        userId,
    updated_by:        userId,
    version:           0,
    status:            'active',
    deleted_at:        null,
    team_id:           teamId,
    client_kind:       'desarrolladora',
    nombre:            '',
    contacto_nombre:   null,
    contacto_email:    null,
    contacto_telefono: null,
    notas:             null,
    rfc:               null,
    razon_social:      null,
    regimen_fiscal:    null,
    uso_cfdi:          null,
    cp_fiscal:         null,
    calle_fiscal:      null,
    colonia_fiscal:    null,
    municipio_fiscal:  null,
    estado_fiscal:     null,
    pais_fiscal:       'México',
    email_facturacion: null,
  };
}
