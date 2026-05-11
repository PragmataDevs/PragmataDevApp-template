/**
 * Contrato de auditoría compartido entre ERP (Vite), sitio público (Astro) y cualquier otro consumidor.
 * Sin dependencias de React ni de frameworks.
 */

export type UUID = string;

export type AuditStatus = 'active' | 'deleted';

/**
 * Campos estándar que toda tabla de negocio debe tener (triggers + OCC).
 */
export interface AuditBase {
  id: UUID;
  created_at: string;
  updated_at: string;
  created_by?: UUID | null;
  updated_by?: UUID | null;
  version: number;
  status: AuditStatus;
  deleted_at?: string | null;
}
