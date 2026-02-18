import { useState, useEffect } from 'react';
import { X, Shield, Loader2, Lock, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import PermissionsPanel from '@/features/settings/components/PermissionsPanel';
import type { GrantedPermissions } from '@/features/settings/components/PermissionsPanel';
import type { AccessLevel } from '@/types/users/profile';
import type {
  UserCreatePayload,
  UserUpdatePayload,
  RoleOption,
  UserWithRole,
  ProjectOption,
} from '../hooks/useUsers';

interface UserFormModalProps {
  user?: UserWithRole | null;
  roles: RoleOption[];
  onClose: () => void;
  onSave: (data: UserCreatePayload | UserUpdatePayload) => Promise<void>;
  saving?: boolean;
  /** Loads the permissions template for a given role */
  onFetchRoleDefinitions: (roleId: string) => Promise<GrantedPermissions>;
  /** Loads the custom permissions for an existing user */
  onFetchUserPermissions: (userId: string) => Promise<GrantedPermissions>;
  /** Loads active projects for assignment */
  onFetchProjects: () => Promise<ProjectOption[]>;
  /** Loads current project assignments for this user */
  onFetchUserProjects: (userId: string) => Promise<string[]>;
}

const ACCESS_LEVELS: { value: AccessLevel; label: string; hint: string }[] = [
  { value: 'god', label: 'God', hint: 'Acceso total a todos los datos de todos los equipos' },
  { value: 'admin', label: 'Admin', hint: 'Acceso total a los datos de su equipo' },
  { value: 'member', label: 'Member', hint: 'Solo sus datos y proyectos asignados' },
];

export default function UserFormModal({
  user,
  roles,
  onClose,
  onSave,
  saving = false,
  onFetchRoleDefinitions,
  onFetchUserPermissions,
  onFetchProjects,
  onFetchUserProjects,
}: UserFormModalProps) {
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [roleId, setRoleId] = useState(user?.role_id || (roles[0]?.id ?? ''));
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(user?.access_level || 'member');
  const [jobTitle, setJobTitle] = useState(user?.job_title || '');
  const [phone, setPhone] = useState(user?.phone || '');

  // ── Permissions state ──
  /** The role's template permissions (from sys_role_definitions) */
  const [rolePermissions, setRolePermissions] = useState<GrantedPermissions>({});
  /** The working copy — either the template or the user's custom set */
  const [customPermissions, setCustomPermissions] = useState<GrantedPermissions>({});
  /** Whether the user is customizing permissions (toggle on) */
  const [isCustomizing, setIsCustomizing] = useState(false);
  /** Loading flag while fetching permissions */
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  // ── Project assignment state ──
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const isEditing = !!user;

  // Derive selectedRole from roles list
  const selectedRole = roles.find((r) => r.id === roleId);
  const canBeCustomized = selectedRole?.can_be_customized ?? false;

  // ── Fetch role definitions when roleId changes ──
  useEffect(() => {
    if (!roleId) return;
    let cancelled = false;
    setLoadingPermissions(true);

    (async () => {
      try {
        const defs = await onFetchRoleDefinitions(roleId);
        if (cancelled) return;
        setRolePermissions(defs);
        // If not customizing, mirror the template
        if (!isCustomizing) setCustomPermissions(defs);
      } catch (err) {
        console.error('Error fetching role definitions:', err);
      } finally {
        if (!cancelled) setLoadingPermissions(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId]);

  // ── On edit: if user has custom permissions (is_role_synced = false), load them ──
  useEffect(() => {
    if (!isEditing || !user) return;
    // If the user is NOT synced with the role → they have custom permissions
    if (user.is_role_synced === false) {
      let cancelled = false;
      setIsCustomizing(true);
      setLoadingPermissions(true);

      (async () => {
        try {
          const perms = await onFetchUserPermissions(user.id);
          if (cancelled) return;
          setCustomPermissions(perms);
        } catch (err) {
          console.error('Error fetching user permissions:', err);
        } finally {
          if (!cancelled) setLoadingPermissions(false);
        }
      })();

      return () => { cancelled = true; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Load project catalog ──
  useEffect(() => {
    let cancelled = false;
    setLoadingProjects(true);

    (async () => {
      try {
        const projectOptions = await onFetchProjects();
        if (cancelled) return;
        setProjects(projectOptions);
      } catch (err) {
        console.error('Error fetching projects:', err);
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onFetchProjects]);

  // ── Load selected projects when editing ──
  useEffect(() => {
    if (!isEditing || !user) return;
    let cancelled = false;

    (async () => {
      try {
        const assignedProjectIds = await onFetchUserProjects(user.id);
        if (cancelled) return;
        setSelectedProjectIds(assignedProjectIds);
      } catch (err) {
        console.error('Error fetching user project assignments:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEditing, onFetchUserProjects, user]);

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
    );
  };

  // ── When toggling customization off → reset to role template ──
  const handleCustomizingToggle = (value: boolean) => {
    setIsCustomizing(value);
    if (!value) {
      // Reset to role template
      setCustomPermissions(rolePermissions);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const permissionsPayload = {
      is_role_synced: !isCustomizing,
      customPermissions: isCustomizing ? customPermissions : undefined,
    };

    if (isEditing) {
      const updatePayload: UserUpdatePayload = {
        full_name: fullName,
        role_id: roleId,
        access_level: accessLevel,
        job_title: jobTitle || undefined,
        phone: phone || undefined,
        project_ids: selectedProjectIds,
        ...permissionsPayload,
      };
      await onSave(updatePayload);
    } else {
      const createPayload: UserCreatePayload = {
        full_name: fullName,
        email,
        role_id: roleId,
        access_level: accessLevel,
        job_title: jobTitle || undefined,
        phone: phone || undefined,
        project_ids: selectedProjectIds,
        ...permissionsPayload,
      };
      await onSave(createPayload);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-[color:var(--pragmata-surface)] rounded-2xl shadow-2xl border border-[color:var(--pragmata-border)] w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[color:var(--pragmata-border)]">
            <h2 className="text-lg font-bold text-[color:var(--pragmata-fg)]">
              {isEditing ? 'Editar Usuario' : 'Crear Usuario'}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-1.5">
                Nombre completo <span className="text-[color:var(--pragmata-danger)]">*</span>
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ej: Carlos Martínez"
                className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-1.5">
                Correo electrónico <span className="text-[color:var(--pragmata-danger)]">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                disabled={isEditing}
                className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {isEditing && (
                <p className="text-xs text-[color:var(--pragmata-muted-2)] mt-1">
                  El correo no se puede modificar.
                </p>
              )}
            </div>

            {/* Two columns: Role + Access Level */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-1.5">
                  Rol <span className="text-[color:var(--pragmata-danger)]">*</span>
                </label>
                <select
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Access Level */}
              <div>
                <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-1.5">
                  Nivel de acceso <span className="text-[color:var(--pragmata-danger)]">*</span>
                </label>
                <select
                  value={accessLevel}
                  onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
                  className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
                >
                  {ACCESS_LEVELS.map((al) => (
                    <option key={al.value} value={al.value}>
                      {al.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[color:var(--pragmata-muted-2)] mt-1">
                  {ACCESS_LEVELS.find((al) => al.value === accessLevel)?.hint}
                </p>
              </div>
            </div>

            {/* Two columns: Job Title + Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Job Title */}
              <div>
                <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-1.5">
                  Puesto
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Ej: Gerente de Obra"
                  className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-1.5">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+52 55 1234 5678"
                  className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* ── Permissions Section ── */}
            {roleId && (
              <div className="space-y-3 pt-2">
                {/* Section header */}
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-[color:var(--pragmata-accent)]" />
                  <span className="text-sm font-semibold text-[color:var(--pragmata-fg)]">
                    Permisos del Rol
                  </span>
                  {!canBeCustomized && (
                    <span className="inline-flex items-center gap-1 text-xs text-[color:var(--pragmata-muted-2)] bg-[color:var(--pragmata-surface-2)] px-2 py-0.5 rounded-full">
                      <Lock className="h-3 w-3" />
                      Estricto
                    </span>
                  )}
                </div>

                {/* Customize toggle (only if role allows it) */}
                {canBeCustomized && (
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={isCustomizing}
                        onChange={(e) => handleCustomizingToggle(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[color:var(--pragmata-border)] rounded-full peer-checked:bg-[color:var(--pragmata-accent)] transition-colors" />
                      <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform" />
                    </div>
                    <span className="text-sm text-[color:var(--pragmata-muted)] group-hover:text-[color:var(--pragmata-fg)] transition-colors">
                      Personalizar permisos para este usuario
                    </span>
                  </label>
                )}

                {/* Permissions panel */}
                {loadingPermissions ? (
                  <div className="flex items-center justify-center py-8 text-[color:var(--pragmata-muted)]">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    <span className="text-sm">Cargando permisos…</span>
                  </div>
                ) : (
                  <div className={!isCustomizing ? 'opacity-60 pointer-events-none' : ''}>
                    <PermissionsPanel
                      selectedPermissions={customPermissions}
                      onChange={setCustomPermissions}
                    />
                  </div>
                )}

                {!canBeCustomized && !loadingPermissions && (
                  <p className="text-xs text-[color:var(--pragmata-muted-2)]">
                    Este rol es estricto — los permisos no pueden personalizarse por usuario.
                  </p>
                )}
              </div>
            )}

            {/* ── Project Assignment Section ── */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-[color:var(--pragmata-accent)]" />
                <span className="text-sm font-semibold text-[color:var(--pragmata-fg)]">
                  Proyectos asignados
                </span>
                <span className="inline-flex items-center text-xs text-[color:var(--pragmata-muted-2)] bg-[color:var(--pragmata-surface-2)] px-2 py-0.5 rounded-full">
                  {selectedProjectIds.length} seleccionados
                </span>
              </div>

              {loadingProjects ? (
                <div className="flex items-center justify-center py-6 text-[color:var(--pragmata-muted)]">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  <span className="text-sm">Cargando proyectos…</span>
                </div>
              ) : projects.length === 0 ? (
                <p className="text-xs text-[color:var(--pragmata-muted-2)]">
                  No hay proyectos activos disponibles para asignar.
                </p>
              ) : (
                <div className="max-h-52 overflow-y-auto rounded-lg border border-[color:var(--pragmata-border)] divide-y divide-[color:var(--pragmata-border)]">
                  {projects.map((project) => {
                    const checked = selectedProjectIds.includes(project.id);
                    return (
                      <label
                        key={project.id}
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[color:var(--pragmata-surface-2)] transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProject(project.id)}
                          className="h-4 w-4 rounded border-[color:var(--pragmata-border)] text-[color:var(--pragmata-accent)] focus:ring-[color:var(--pragmata-accent)]"
                        />
                        <div className="min-w-0">
                          <p className="text-sm text-[color:var(--pragmata-fg)] truncate">
                            {project.name}
                          </p>
                          {project.code && (
                            <p className="text-[11px] text-[color:var(--pragmata-muted-2)] font-mono">
                              {project.code}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-[color:var(--pragmata-border)]">
              <Button variant="secondary" type="button" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                {isEditing ? 'Guardar Cambios' : 'Crear Usuario'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
