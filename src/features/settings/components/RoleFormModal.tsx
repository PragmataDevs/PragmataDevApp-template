import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import PermissionsPanel from './PermissionsPanel';
import type { GrantedPermissions } from './PermissionsPanel';
import type { RoleInput } from '@/features/roles/hooks/useRoles';

interface RoleFormModalProps {
  role?: {
    id: string;
    name: string;
    description?: string | null;
  } | null;
  onClose: () => void;
  onSave: (data: RoleInput) => Promise<void>;
  saving?: boolean;
  fetchRoleDefinitions?: (roleId: string) => Promise<GrantedPermissions>;
}

export default function RoleFormModal({ role, onClose, onSave, saving = false, fetchRoleDefinitions }: RoleFormModalProps) {
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [selectedPermissions, setSelectedPermissions] = useState<GrantedPermissions>({});
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  const isEditing = !!role;

  // Load existing permissions when editing a role
  useEffect(() => {
    if (role && fetchRoleDefinitions) {
      setLoadingPermissions(true);
      fetchRoleDefinitions(role.id)
        .then((perms) => setSelectedPermissions(perms))
        .catch((err) => console.error('Error loading permissions:', err))
        .finally(() => setLoadingPermissions(false));
    }
  }, [role, fetchRoleDefinitions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      name,
      description,
      permissions: selectedPermissions,
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
          className="bg-[color:var(--pragmata-surface)] rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden pointer-events-auto flex flex-col border border-[color:var(--pragmata-border)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-[color:var(--pragmata-border)] flex items-center justify-between bg-[color:var(--pragmata-surface)]">
            <div>
              <h2 className="text-xl font-bold text-[color:var(--pragmata-fg)]">
                {isEditing ? 'Editar Rol' : 'Crear Nuevo Rol'}
              </h2>
              <p className="text-sm text-[color:var(--pragmata-muted)] mt-1">
                {isEditing ? 'Modifica la información del rol' : 'Define un nuevo rol con sus permisos'}
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

                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-2">
                      Nombre del Rol <span className="text-[color:var(--pragmata-danger)]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
                      placeholder="Ej: Project Manager"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-2">
                      Descripción
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all resize-none"
                      placeholder="Describe las responsabilidades y alcance del rol..."
                    />
                  </div>
                </div>
              </div>

              {/* Permisos */}
              <div>
                <h3 className="text-xs font-bold text-[color:var(--pragmata-muted)] uppercase tracking-wider flex items-center gap-2 mb-4">
                  <span className="w-1 h-3 rounded-full bg-[color:var(--pragmata-accent)]"></span>
                  Permisos del Sistema
                </h3>
                <PermissionsPanel
                  selectedPermissions={selectedPermissions}
                  onChange={setSelectedPermissions}
                />
                {loadingPermissions && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-[color:var(--pragmata-accent)]" />
                  </div>
                )}
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
                {isEditing ? 'Guardar Cambios' : 'Crear Rol'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
