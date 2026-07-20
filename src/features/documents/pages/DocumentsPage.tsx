import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Upload, FileText, Eye, Trash2, ExternalLink, X, Loader2, FileImage, File, Layers } from 'lucide-react';
import { useDocuments } from '@/features/documents/hooks/useDocuments';
import { useActiveEntity } from '@/features/entities/hooks/useActiveEntity';
import { DOC_STATUS_CONFIG, DOC_TYPE_OPTIONS } from '@/features/documents/types/document';
import type { Document as Doc } from '@/features/documents/types/document';
import { PageHeader } from '@/components/layout/PageHeader';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { ENTITY_LABEL } from '@/features/entities/types/entity';

// ─── Document viewer modal ────────────────────────────────────────────────────

function DocumentViewer({ url, doc, onClose }: { url: string; doc: Doc; onClose: () => void }) {
  const isPdf   = doc.mime_type === 'application/pdf' || doc.storage_path?.endsWith('.pdf');
  const isImage = doc.mime_type?.startsWith('image/');

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-[color:var(--pragmata-surface)] rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[color:var(--pragmata-border)]">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-[color:var(--pragmata-muted)] flex-shrink-0" />
            <span className="text-sm font-medium text-[color:var(--pragmata-fg)] truncate">{doc.name}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[color:var(--pragmata-muted)] border border-[color:var(--pragmata-border)] rounded-lg hover:bg-[color:var(--pragmata-surface-2)] transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir en nueva pestaña
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-danger)] hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-auto min-h-0">
          {isPdf ? (
            <iframe
              src={url}
              title={doc.name}
              className="w-full h-full min-h-[600px]"
            />
          ) : isImage ? (
            <div className="flex items-center justify-center p-6 bg-[color:var(--pragmata-surface-2)] h-full min-h-[400px]">
              <img
                src={url}
                alt={doc.name}
                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
              <File className="w-12 h-12 text-[color:var(--pragmata-muted-2)]" />
              <p className="text-sm text-[color:var(--pragmata-muted)]">
                Vista previa no disponible para este tipo de archivo.
              </p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[color:var(--pragmata-accent)] rounded-lg hover:opacity-90 transition-opacity"
              >
                <ExternalLink className="w-4 h-4" />
                Descargar archivo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

interface UploadModalProps {
  onClose: () => void;
  onUpload: (input: {
    name: string; doc_type: string | null; description: string | null;
    doc_status: Doc['doc_status']; expires_at: string | null; file: File;
  }) => Promise<void>;
}

function UploadModal({ onClose, onUpload }: UploadModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [docType, setDocType] = useState('');
  const [description, setDescription] = useState('');
  const [docStatus, setDocStatus] = useState<Doc['doc_status']>('pending');
  const [expiresAt, setExpiresAt] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File) => {
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name.trim()) return;
    setUploading(true);
    try {
      await onUpload({
        name: name.trim(),
        doc_type: docType || null,
        description: description.trim() || null,
        doc_status: docStatus,
        expires_at: expiresAt || null,
        file,
      });
      onClose();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[color:var(--pragmata-surface)] rounded-xl shadow-2xl w-full max-w-lg border border-[color:var(--pragmata-border)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--pragmata-border)]">
          <h2 className="text-base font-semibold text-[color:var(--pragmata-fg)]">Subir documento</h2>
          <button onClick={onClose} className="p-1.5 text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-danger)] rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-[color:var(--pragmata-accent)] bg-[color:var(--pragmata-accent-soft)]'
                : 'border-[color:var(--pragmata-border)] hover:border-[color:var(--pragmata-accent)]/50 hover:bg-[color:var(--pragmata-surface-2)]'
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-sm text-[color:var(--pragmata-fg)]">
                <FileText className="w-5 h-5 text-[color:var(--pragmata-accent)]" />
                <span className="font-medium">{file.name}</span>
                <span className="text-[color:var(--pragmata-muted)]">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 mx-auto mb-2 text-[color:var(--pragmata-muted-2)]" />
                <p className="text-sm text-[color:var(--pragmata-muted)]">Arrastra un archivo aquí o <span className="text-[color:var(--pragmata-accent)] font-medium">selecciona uno</span></p>
                <p className="text-xs text-[color:var(--pragmata-muted-2)] mt-1">PDF, imágenes, Word, Excel — hasta 50MB</p>
              </>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-[color:var(--pragmata-muted)] mb-1">Nombre del documento *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)] rounded-lg text-[color:var(--pragmata-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent"
            />
          </div>

          {/* Type + Status row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[color:var(--pragmata-muted)] mb-1">Tipo</label>
              <select value={docType} onChange={e => setDocType(e.target.value)} className="w-full px-3 py-2 text-sm bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)] rounded-lg text-[color:var(--pragmata-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)]">
                <option value="">Sin tipo</option>
                {DOC_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[color:var(--pragmata-muted)] mb-1">Estado</label>
              <select value={docStatus} onChange={e => setDocStatus(e.target.value as Doc['doc_status'])} className="w-full px-3 py-2 text-sm bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)] rounded-lg text-[color:var(--pragmata-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)]">
                {(Object.entries(DOC_STATUS_CONFIG) as [Doc['doc_status'], typeof DOC_STATUS_CONFIG[Doc['doc_status']]][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-[color:var(--pragmata-muted)] mb-1">Descripción</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)] rounded-lg text-[color:var(--pragmata-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] resize-none"
            />
          </div>

          {/* Expires */}
          <div>
            <label className="block text-xs font-medium text-[color:var(--pragmata-muted)] mb-1">Fecha de expiración (opcional)</label>
            <input
              type="date"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)] rounded-lg text-[color:var(--pragmata-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)]"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[color:var(--pragmata-muted)] border border-[color:var(--pragmata-border)] rounded-lg hover:bg-[color:var(--pragmata-surface-2)] transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!file || !name.trim() || uploading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[color:var(--pragmata-accent)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Subiendo...' : 'Subir documento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── File type icon ────────────────────────────────────────────────────────────

function FileIcon({ mimeType }: { mimeType: string | null }) {
  if (!mimeType) return <File className="w-5 h-5 text-[color:var(--pragmata-muted-2)]" />;
  if (mimeType === 'application/pdf') return <FileText className="w-5 h-5 text-red-500" />;
  if (mimeType.startsWith('image/')) return <FileImage className="w-5 h-5 text-blue-500" />;
  return <File className="w-5 h-5 text-[color:var(--pragmata-muted-2)]" />;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { entityId: rawEntityId } = useParams<{ entityId: string }>();
  const navigate = useNavigate();
  const resolvedEntityId = useActiveEntity();

  const noEntity = !rawEntityId || rawEntityId === 'none';
  const entityId = noEntity ? undefined : rawEntityId;

  useEffect(() => {
    if (noEntity && resolvedEntityId) {
      navigate(`/workspace/${resolvedEntityId}/documents`, { replace: true });
    }
  }, [noEntity, resolvedEntityId, navigate]);

  const { data: documents, loading, error, uploadDocument, softDelete, getSignedUrl } = useDocuments(entityId);
  const [showUpload, setShowUpload] = useState(false);
  const [viewer, setViewer] = useState<{ doc: Doc; url: string } | null>(null);
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
  const confirm = useConfirm();

  const handleOpen = useCallback(async (doc: Doc) => {
    setLoadingUrl(doc.id);
    try {
      const url = await getSignedUrl(doc);
      if (url) setViewer({ doc, url });
    } finally {
      setLoadingUrl(null);
    }
  }, [getSignedUrl]);

  const handleUpload = useCallback(async (input: Parameters<typeof uploadDocument>[0]) => {
    await uploadDocument(input);
  }, [uploadDocument]);

  const handleDelete = useCallback(async (doc: Doc) => {
    if (!(await confirm({ title: `¿Eliminar "${doc.name}"?`, description: 'Esta acción no se puede deshacer.', destructive: true }))) return;
    await softDelete(doc.id, doc.version);
  }, [softDelete, confirm]);

  // ── No entity ──────────────────────────────────────────────────────────
  if (noEntity) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <div className="p-4 rounded-full bg-[color:var(--pragmata-accent-soft)]">
          <Layers className="w-8 h-8 text-[color:var(--pragmata-accent)]" />
        </div>
        <h2 className="text-lg font-semibold text-[color:var(--pragmata-fg)]">Selecciona una {ENTITY_LABEL.toLowerCase()}</h2>
        <Link to="/settings/entities" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[color:var(--pragmata-accent)] rounded-lg hover:opacity-90 transition-opacity">
          <Layers className="w-4 h-4" />
          Ir a {ENTITY_LABEL}s
        </Link>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Documentos"
        breadcrumbs={[{ label: ENTITY_LABEL }, { label: 'Documentos' }]}
        actions={
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[color:var(--pragmata-accent)] rounded-lg hover:opacity-90 transition-opacity shadow-sm"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Subir documento</span>
          </button>
        }
      />

      <div className="flex-1 overflow-auto px-4 sm:px-6 py-4">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl animate-pulse bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)]" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="p-4 rounded-full bg-[color:var(--pragmata-surface-2)]">
              <FileText className="w-8 h-8 text-[color:var(--pragmata-muted-2)]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[color:var(--pragmata-fg)]">Sin documentos</p>
              <p className="text-xs text-[color:var(--pragmata-muted)] mt-0.5">Sube el primer documento para esta entidad</p>
            </div>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[color:var(--pragmata-accent)] rounded-lg hover:opacity-90 transition-opacity"
            >
              <Upload className="w-4 h-4" />
              Subir documento
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map(doc => {
              const statusCfg = DOC_STATUS_CONFIG[doc.doc_status];
              return (
                <div
                  key={doc.id}
                  className="group flex flex-col gap-2 p-4 rounded-xl border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] hover:shadow-md hover:border-[color:var(--pragmata-accent)]/30 transition-all"
                >
                  {/* Top row: icon + name + actions */}
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-[color:var(--pragmata-surface-2)] flex-shrink-0">
                      <FileIcon mimeType={doc.mime_type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[color:var(--pragmata-fg)] truncate">{doc.name}</p>
                      {doc.doc_type && <p className="text-xs text-[color:var(--pragmata-muted)]">{doc.doc_type}</p>}
                    </div>
                    <div className="flex-shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleOpen(doc)}
                        disabled={loadingUrl === doc.id || !doc.storage_path}
                        title="Ver documento"
                        className="p-1.5 rounded-lg text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-accent)] hover:bg-[color:var(--pragmata-accent-soft)] transition-colors disabled:opacity-40"
                      >
                        {loadingUrl === doc.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleDelete(doc)}
                        title="Eliminar"
                        className="p-1.5 rounded-lg text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-danger)] hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  {doc.description && (
                    <p className="text-xs text-[color:var(--pragmata-muted)] line-clamp-2">{doc.description}</p>
                  )}

                  {/* Footer: status + size */}
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.className}`}>
                      {statusCfg.label}
                    </span>
                    <span className="text-xs text-[color:var(--pragmata-muted-2)]">{formatBytes(doc.file_size)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUpload={handleUpload} />}
      {viewer && <DocumentViewer url={viewer.url} doc={viewer.doc} onClose={() => setViewer(null)} />}
    </div>
  );
}
