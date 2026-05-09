import { useState, useEffect } from 'react';
import { X, CalendarDays, MapPin, FileCode, ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { EntityRow, EntityInput } from '@/features/entities/hooks/useEntities';
import { ENTITY_STATUS_CONFIG } from '@/features/entities/hooks/useEntities';
import { ENTITY_LABEL, ENTITY_LABEL_PLURAL } from '@/types/entities/entity';
import { resolveSignedUrls } from '@/lib/storage';

interface EntityFormModalProps {
  entity?: EntityRow | null;
  onClose: () => void;
  onSave: (data: EntityInput) => Promise<void>;
  saving?: boolean;
  /** Count of existing entities (same team) — used to suggest next code on create */
  totalEntities?: number;
}

/** Auto code: EN-{INITIALS}-{NNN} */
function generateEntityCode(name: string, totalEntities: number): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3);

  const consecutive = String(totalEntities + 1).padStart(3, '0');
  return `EN-${initials || 'XX'}-${consecutive}`;
}

export default function EntityFormModal({
  entity,
  onClose,
  onSave,
  saving = false,
  totalEntities = 0,
}: EntityFormModalProps) {
  const [name, setName] = useState(entity?.name || '');
  const [code, setCode] = useState(entity?.code || '');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(!!entity?.code);
  const [description, setDescription] = useState(entity?.description || '');
  const [location, setLocation] = useState(entity?.location || '');
  const [startDate, setStartDate] = useState(entity?.start_date || '');
  const [endDate, setEndDate] = useState(entity?.end_date || '');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [entityStatus, setEntityStatus] = useState<EntityRow['entity_status']>(
    entity?.entity_status || 'planning'
  );

  const isEditing = !!entity;

  useEffect(() => {
    if (!isEditing && !codeManuallyEdited && name.trim()) {
      setCode(generateEntityCode(name, totalEntities));
    }
    if (!isEditing && !name.trim()) {
      setCode('');
    }
  }, [name, isEditing, codeManuallyEdited, totalEntities]);

  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePreviews]);

  useEffect(() => {
    let cancelled = false;

    const loadExistingImages = async () => {
      if (!entity) {
        setExistingImageUrls([]);
        return;
      }

      const rawImages = Array.isArray((entity.metadata as Record<string, unknown> | undefined)?.images)
        ? (entity.metadata as { images?: unknown }).images
        : [];

      if (!Array.isArray(rawImages) || !rawImages.length) {
        setExistingImageUrls([]);
        return;
      }

      const paths = rawImages
        .map((img: unknown) => (typeof img === 'string' ? img : (img as { path?: string })?.path))
        .filter(Boolean) as string[];

      if (!paths.length) {
        setExistingImageUrls([]);
        return;
      }

      try {
        const urls = await resolveSignedUrls('attachments', paths);
        if (!cancelled) setExistingImageUrls(urls);
      } catch (err) {
        console.error('Error resolving entity image URLs:', err);
        if (!cancelled) setExistingImageUrls([]);
      }
    };

    loadExistingImages();
    return () => {
      cancelled = true;
    };
  }, [entity]);

  const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    if (!selected.length) return;

    const nextImages = [...images, ...selected];
    const nextPreviews = [...imagePreviews, ...selected.map((f) => URL.createObjectURL(f))];
    setImages(nextImages);
    setImagePreviews(nextPreviews);
    e.target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    URL.revokeObjectURL(imagePreviews[index]);
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      name,
      code: code || null,
      description: description || null,
      location: location || null,
      start_date: startDate || null,
      end_date: endDate || null,
      entity_status: entityStatus,
      images,
    });
  };

  const labelLower = ENTITY_LABEL.toLowerCase();

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-[color:var(--pragmata-surface)] rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden pointer-events-auto flex flex-col border border-[color:var(--pragmata-border)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-[color:var(--pragmata-border)] flex items-center justify-between bg-[color:var(--pragmata-surface)]">
            <div>
              <h2 className="text-xl font-bold text-[color:var(--pragmata-fg)]">
                {isEditing ? `Editar ${ENTITY_LABEL}` : `Nuevo ${ENTITY_LABEL}`}
              </h2>
              <p className="text-sm text-[color:var(--pragmata-muted)] mt-1">
                {isEditing
                  ? `Actualiza los datos de este ${labelLower}`
                  : `Define un ${labelLower} para agrupar trabajo en el workspace`}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              icon={<X className="h-5 w-5" />}
              className="text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)]"
            />
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-8">
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-[color:var(--pragmata-muted)] uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1 h-3 rounded-full bg-[color:var(--pragmata-accent)]" />
                  Información básica
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-2">
                      Nombre <span className="text-[color:var(--pragmata-danger)]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
                      placeholder={`Nombre del ${labelLower}`}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-2">
                      <FileCode className="inline h-3.5 w-3.5 mr-1 opacity-60" />
                      Código
                      {!isEditing && !codeManuallyEdited && code && (
                        <span className="ml-2 text-[10px] font-normal text-[color:var(--pragmata-accent)]">
                          Auto-generado
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value.toUpperCase());
                        setCodeManuallyEdited(true);
                      }}
                      onBlur={() => {
                        if (!code.trim() && !isEditing) {
                          setCodeManuallyEdited(false);
                        }
                      }}
                      className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all font-mono"
                      placeholder="Se genera automáticamente"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-2">
                      Estado
                    </label>
                    <select
                      value={entityStatus}
                      onChange={(e) =>
                        setEntityStatus(e.target.value as EntityRow['entity_status'])
                      }
                      className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
                    >
                      {Object.entries(ENTITY_STATUS_CONFIG).map(([key, cfg]) => (
                        <option key={key} value={key}>
                          {cfg.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-2">
                      Descripción
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all resize-none"
                      placeholder="Describe el alcance…"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-bold text-[color:var(--pragmata-muted)] uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1 h-3 rounded-full bg-[color:var(--pragmata-accent)]" />
                  Ubicación e imágenes
                </h3>

                <div className="grid grid-cols-1 gap-4">
                  <div className="md:max-w-md">
                    <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-2">
                      <MapPin className="inline h-3.5 w-3.5 mr-1 opacity-60" />
                      Ubicación
                    </label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
                      placeholder="Ej: CDMX"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-2">
                      <ImagePlus className="inline h-3.5 w-3.5 mr-1 opacity-60" />
                      Imágenes
                    </label>
                    <label className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-[color:var(--pragmata-border)] rounded-lg cursor-pointer hover:border-[color:var(--pragmata-accent)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors">
                      <ImagePlus className="h-4 w-4 text-[color:var(--pragmata-muted)]" />
                      <span className="text-sm text-[color:var(--pragmata-muted)]">Seleccionar imágenes</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleAddImages}
                        className="hidden"
                      />
                    </label>

                    {imagePreviews.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {imagePreviews.map((preview, index) => (
                          <div key={`${preview}-${index}`} className="relative group">
                            <img
                              src={preview}
                              alt=""
                              className="w-full h-20 object-cover rounded-md border border-[color:var(--pragmata-border)]"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(index)}
                              className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {existingImageUrls.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs text-[color:var(--pragmata-muted)] mb-2">
                          Imágenes ya cargadas
                        </p>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {existingImageUrls.map((url, index) => (
                            <img
                              key={`${url}-${index}`}
                              src={url}
                              alt=""
                              className="w-full h-20 object-cover rounded-md border border-[color:var(--pragmata-border)]"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-bold text-[color:var(--pragmata-muted)] uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1 h-3 rounded-full bg-[color:var(--pragmata-accent)]" />
                  Fechas
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-2">
                      <CalendarDays className="inline h-3.5 w-3.5 mr-1 opacity-60" />
                      Inicio
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-2">
                      <CalendarDays className="inline h-3.5 w-3.5 mr-1 opacity-60" />
                      Fin
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[color:var(--pragmata-border)] flex items-center justify-end gap-3 bg-[color:var(--pragmata-surface-2)]">
              <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                {isEditing ? 'Guardar cambios' : `Crear ${ENTITY_LABEL}`}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
