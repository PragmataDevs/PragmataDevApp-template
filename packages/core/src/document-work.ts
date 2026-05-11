import type { UUID } from './audit.ts';

export type DocumentStatus = 'pending' | 'verified' | 'expired' | 'rejected';

/**
 * Documento genérico de trabajo (formularios, uploads).
 * Distinto de la entidad `Document` de `public.documents` en el ERP.
 */
export interface DocumentW {
  id: UUID;
  nombre: string;
  type?: string;
  description?: string;
  bucket?: string;
  path?: string;
  url?: string;
  file?: File;
  mime_type?: string;
  size?: number;
  created_at?: string;
  updated_at?: string;
  uploaded_by?: UUID;
  status?: DocumentStatus;
  expires_at?: string;
  metadata?: Record<string, unknown>;
}
