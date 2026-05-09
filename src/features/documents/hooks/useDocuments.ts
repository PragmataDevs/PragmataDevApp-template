/**
 * useDocuments — CRUD hook for the documents module.
 *
 * Wraps useCrudResource with document-specific logic:
 *   - Upload via uploadFile() → stores the storage_path in DB
 *   - Generates a fresh signed URL on-demand via getSignedUrl()
 *
 * Usage:
 *   const { data, loading, error, uploadDocument, softDelete } = useDocuments(entityId);
 */

import { useCallback } from 'react';
import { useCrudResource } from '@/lib/hooks/useCrudResource';
import { supabase } from '@/lib/supabase';
import { uploadFile } from '@/lib/storage/uploadFile';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { Document, DocumentInput } from '@/types/documents/document';

interface UploadDocumentInput {
  name: string;
  doc_type?: string | null;
  description?: string | null;
  doc_status?: Document['doc_status'];
  expires_at?: string | null;
  file: File;
}

export function useDocuments(entityId: string | undefined) {
  const { user, profile } = useAuth();

  const crud = useCrudResource<Document>({
    table: 'documents',
    select: '*',
    filter: (q) => {
      let query = q.eq('status', 'active');
      if (entityId) query = query.eq('entity_id', entityId);
      return query;
    },
    orderBy: { column: 'created_at', ascending: false },
    realtime: true,
    enabled: !!entityId,
  });

  /**
   * Upload a file to storage and create the document record.
   * Returns the created Document or null on failure.
   */
  const uploadDocument = useCallback(async (input: UploadDocumentInput): Promise<Document | null> => {
    if (!user?.id || !profile?.team_id) return null;

    const ext    = input.file.name.split('.').pop() ?? 'bin';
    const path   = `${profile.team_id}/${entityId ?? 'global'}/${crypto.randomUUID()}.${ext}`;
    const bucket = 'documents';

    let storagePath: string;
    try {
      const { storagePath: sp } = await uploadFile(bucket, path, input.file, { optimize: false });
      storagePath = sp;
    } catch (err) {
      console.error('[useDocuments] uploadFile failed', err);
      return null;
    }

    const docInput: Partial<DocumentInput> & Record<string, unknown> = {
      entity_id:    entityId ?? null,
      team_id:      profile.team_id,
      name:         input.name,
      description:  input.description ?? null,
      doc_type:     input.doc_type ?? null,
      bucket,
      storage_path: storagePath,
      mime_type:    input.file.type || null,
      file_size:    input.file.size,
      doc_status:   input.doc_status ?? 'pending',
      expires_at:   input.expires_at ?? null,
      metadata:     {},
    };

    return crud.upsert(docInput);
  }, [user, profile, entityId, crud]);

  /**
   * Generate a fresh signed URL for a document (60 min expiry).
   * Returns null if the document has no storage_path.
   */
  const getSignedUrl = useCallback(async (doc: Document): Promise<string | null> => {
    if (!doc.storage_path) return null;
    const { data, error } = await supabase.storage
      .from(doc.bucket)
      .createSignedUrl(doc.storage_path, 3600);
    if (error || !data?.signedUrl) {
      console.error('[useDocuments] getSignedUrl failed', error);
      return null;
    }
    return data.signedUrl;
  }, []);

  return {
    ...crud,
    uploadDocument,
    getSignedUrl,
  };
}
