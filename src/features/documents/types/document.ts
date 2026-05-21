export type { DocumentStatus, DocumentW } from '@/types/core/base';
import type { AuditBase } from '@/types/core/base';

// ─── Document entity (maps to public.documents table) ────────────────────────

export type DocStatus = 'pending' | 'verified' | 'expired' | 'rejected';

export interface Document extends AuditBase {
  entity_id: string | null;
  team_id: string;
  name: string;
  description: string | null;
  doc_type: string | null;
  bucket: string;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  doc_status: DocStatus;
  expires_at: string | null;
  metadata: Record<string, unknown>;
}

export type DocumentInput = Pick<Document,
  'entity_id' | 'name' | 'description' | 'doc_type' | 'bucket' | 'storage_path' | 'mime_type' | 'file_size' | 'doc_status' | 'expires_at' | 'metadata'
>;

export const DOC_STATUS_CONFIG: Record<DocStatus, { label: string; className: string }> = {
  pending:  { label: 'Pendiente',  className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  verified: { label: 'Verificado', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
  expired:  { label: 'Expirado',   className: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' },
  rejected: { label: 'Rechazado',  className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
};

export const DOC_TYPE_OPTIONS = [
  'Contrato', 'Factura', 'Reporte', 'Presupuesto', 'Propuesta',
  'Manual', 'Certificado', 'Acta', 'Otro',
] as const;
