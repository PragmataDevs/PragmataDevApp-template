import { useState, useEffect } from 'react';
import { X, CalendarDays, MapPin, FileCode, ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { ProjectRow, ProjectCreatePayload } from '../hooks/useProjects';
import { PROJECT_STATUS_CONFIG } from '../hooks/useProjects';
import { resolveSignedUrls } from '@/lib/storage';

interface ProjectFormModalProps {
  project?: ProjectRow | null;
  onClose: () => void;
  onSave: (data: ProjectCreatePayload) => Promise<void>;
  saving?: boolean;
  totalProjects?: number;
}

/**
 * Genera un código automático: PR-{INICIALES}-{CONSECUTIVO}
 * Ej: "Torre Reforma" con 5 proyectos → PR-TR-006
 */
function generateProjectCode(projectName: string, totalProjects: number): string {
  const words = projectName.trim().split(/\s+/).filter(Boolean);
  const initials = words
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3); // max 3 letras

  const consecutive = String(totalProjects + 1).padStart(3, '0');
  return `PR-${initials || 'XX'}-${consecutive}`;
}

export default function ProjectFormModal({ project, onClose, onSave, saving = false, totalProjects = 0 }: ProjectFormModalProps) {
  const [name, setName] = useState(project?.name || '');
  const [code, setCode] = useState(project?.code || '');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(!!project?.code);
  const [description, setDescription] = useState(project?.description || '');
  const [location, setLocation] = useState(project?.location || '');
  const [startDate, setStartDate] = useState(project?.start_date || '');
  const [endDate, setEndDate] = useState(project?.end_date || '');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [projectStatus, setProjectStatus] = useState<ProjectRow['project_status']>(
    project?.project_status || 'planning'
  );

  const isEditing = !!project;

  // Auto-generate code when name changes (only in create mode)
  useEffect(() => {
    if (!isEditing && !codeManuallyEdited && name.trim()) {
      setCode(generateProjectCode(name, totalProjects));
    }
    if (!isEditing && !name.trim()) {
      setCode('');
    }
  }, [name, isEditing, codeManuallyEdited, totalProjects]);

  // Cleanup preview URLs
  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePreviews]);

  // Load existing project images (edit mode)
  useEffect(() => {
    let cancelled = false;

    const loadExistingImages = async () => {
      if (!project) {
        setExistingImageUrls([]);
        return;
      }

      const rawImages = Array.isArray((project.metadata as any)?.images)
        ? (project.metadata as any).images
        : [];

      if (!rawImages.length) {
        setExistingImageUrls([]);
        return;
      }

      // Support both formats: [{ path: '...' }] and ['...']
      const paths = rawImages
        .map((img: any) => (typeof img === 'string' ? img : img?.path))
        .filter(Boolean) as string[];

      if (!paths.length) {
        setExistingImageUrls([]);
        return;
      }

      try {
        const urls = await resolveSignedUrls('attachments', paths);
        if (!cancelled) setExistingImageUrls(urls);
      } catch (err) {
        console.error('Error resolving project image URLs:', err);
        if (!cancelled) setExistingImageUrls([]);
      }
    };

    loadExistingImages();
    return () => {
      cancelled = true;
    };
  }, [project]);

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
      project_status: projectStatus,
      images,
    });
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-[color:var(--pragmata-surface)] rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden pointer-events-auto flex flex-col border border-[color:var(--pragmata-border)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-[color:var(--pragmata-border)] flex items-center justify-between bg-[color:var(--pragmata-surface)]">
            <div>
              <h2 className="text-xl font-bold text-[color:var(--pragmata-fg)]">
                {isEditing ? 'Editar Proyecto' : 'Crear Nuevo Proyecto'}
              </h2>
              <p className="text-sm text-[color:var(--pragmata-muted)] mt-1">
                {isEditing ? 'Modifica la información del proyecto' : 'Define un nuevo proyecto de trabajo'}
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

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-8">
              {/* Información Básica */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-[color:var(--pragmata-muted)] uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1 h-3 rounded-full bg-[color:var(--pragmata-accent)]"></span>
                  Información Básica
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-2">
                      Nombre del Proyecto <span className="text-[color:var(--pragmata-danger)]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
                      placeholder="Ej: Torre Reforma 505"
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
                        // Si el usuario borra el campo, volver a auto-generar
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
                      value={projectStatus}
                      onChange={(e) => setProjectStatus(e.target.value as ProjectRow['project_status'])}
                      className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
                    >
                      {Object.entries(PROJECT_STATUS_CONFIG).map(([key, cfg]) => (
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
                      placeholder="Describe el alcance del proyecto..."
                    />
                  </div>
                </div>
              </div>

              {/* Ubicación e Imágenes */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-[color:var(--pragmata-muted)] uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1 h-3 rounded-full bg-[color:var(--pragmata-accent)]"></span>
                  Ubicación e Imágenes
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
                      placeholder="Ej: CDMX, Col. Reforma"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-2">
                      <ImagePlus className="inline h-3.5 w-3.5 mr-1 opacity-60" />
                      Imágenes del Proyecto
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
                              alt={`preview-${index}`}
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
                              alt={`project-image-${index}`}
                              className="w-full h-20 object-cover rounded-md border border-[color:var(--pragmata-border)]"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Fechas */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-[color:var(--pragmata-muted)] uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1 h-3 rounded-full bg-[color:var(--pragmata-accent)]"></span>
                  Fechas
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-2">
                      <CalendarDays className="inline h-3.5 w-3.5 mr-1 opacity-60" />
                      Fecha de Inicio
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
                      Fecha de Fin
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

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[color:var(--pragmata-border)] flex items-center justify-end gap-3 bg-[color:var(--pragmata-surface-2)]">
              <Button
                variant="secondary"
                type="button"
                onClick={onClose}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                loading={saving}
              >
                {isEditing ? 'Guardar Cambios' : 'Crear Proyecto'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
