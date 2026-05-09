import { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  Users as UsersIcon,
  Shield,
  Loader2,
  AlertCircle,
  UserCheck,
  UserX,
  Mail,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useUsers, type UserWithRole, type UserCreateInput, type UserUpdateInput } from '@/features/users/hooks/useUsers';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { resolveSignedUrl } from '@/lib/storage';
import UserFormModal from '@/features/users/components/UserFormModal';

// ─── Helpers ─────────────────────────────────────────────────

const ACCESS_BADGE: Record<string, { label: string; classes: string }> = {
  god: {
    label: 'GOD',
    classes:
      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  },
  admin: {
    label: 'ADMIN',
    classes:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  member: {
    label: 'MEMBER',
    classes:
      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
};

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function UserAvatar({ avatarPath, name }: { avatarPath: string | null; name: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (avatarPath) {
      resolveSignedUrl('attachments', avatarPath).then(setUrl);
    } else {
      setUrl(null);
    }
  }, [avatarPath]);

  if (url) {
    return (
      <img
        src={url}
        alt={name ?? ''}
        className="w-9 h-9 rounded-full object-cover ring-2 ring-[color:var(--pragmata-border)]"
      />
    );
  }
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold ring-2 ring-[color:var(--pragmata-border)]">
      {getInitials(name)}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────

export default function UsuariosPage() {
  const {
    users,
    roles,
    loading,
    error,
    createUser,
    updateUser,
    toggleUserStatus,
    deleteUser,
    fetchRoleDefinitions,
    fetchUserPermissions,
    fetchEntitiesForAssignment,
    fetchUserEntityAssignments,
  } =
    useUsers();
  const { hasPermission } = usePermission();

  const canCreate = hasPermission('page_settings_usuarios', 'create');
  const canUpdate = hasPermission('page_settings_usuarios', 'update');
  const canDelete = hasPermission('page_settings_usuarios', 'delete');

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const [saving, setSaving] = useState(false);
  // Success modal after user creation
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  const filteredUsers = users.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role_name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleEdit = (user: UserWithRole) => {
    setEditingUser(user);
    setIsModalOpen(true);
    setActiveDropdown(null);
    setDropdownPosition(null);
  };

  const handleToggleStatus = async (user: UserWithRole) => {
    setActiveDropdown(null);
    setDropdownPosition(null);
    const action = user.profile_status === 'active' ? 'suspender' : 'reactivar';
    if (!confirm(`¿Estás seguro de ${action} a ${user.full_name ?? user.email}?`)) return;
    try {
      await toggleUserStatus(user.id);
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleDelete = async (user: UserWithRole) => {
    setActiveDropdown(null);
    setDropdownPosition(null);
    if (
      !confirm(
        `¿Estás seguro de eliminar a ${user.full_name ?? user.email}? Esta acción no se puede deshacer.`,
      )
    )
      return;
    try {
      await deleteUser(user.id);
    } catch (err: any) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  const handleCreate = () => {
    setEditingUser(null);
    setIsModalOpen(true);
  };

  const handleSave = async (data: UserCreateInput | UserUpdateInput) => {
    setSaving(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.id, data as UserUpdateInput);
      } else {
        const result = await createUser(data as UserCreateInput);
        setCreatedEmail(result.email);
      }
      setIsModalOpen(false);
      setEditingUser(null);
    } catch (err: any) {
      alert('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDropdown = (userId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    if (activeDropdown === userId) {
      setActiveDropdown(null);
      setDropdownPosition(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 208; // w-52
    const estimatedMenuHeight = 190;
    const viewportPadding = 12;

    const canOpenDown = window.innerHeight - rect.bottom > estimatedMenuHeight;
    const top = canOpenDown
      ? rect.bottom + 8
      : Math.max(viewportPadding, rect.top - estimatedMenuHeight - 8);

    const left = Math.max(
      viewportPadding,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding)
    );

    setDropdownPosition({ top, left });
    setActiveDropdown(userId);
  };

  useEffect(() => {
    const close = () => {
      setActiveDropdown(null);
      setDropdownPosition(null);
    };

    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UsersIcon className="w-5 h-5 text-[color:var(--pragmata-accent)]" />
            <h1 className="text-2xl font-bold text-[color:var(--pragmata-fg)]">
              Gestión de Usuarios
            </h1>
          </div>
          <p className="text-[color:var(--pragmata-muted)]">
            Crea cuentas, asigna roles y controla niveles de acceso.
          </p>
        </div>
        {canCreate && (
          <Button onClick={handleCreate} icon={<Plus className="h-4 w-4" />}>
            Crear Usuario
          </Button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[color:var(--pragmata-accent)]" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-10 w-10 text-[color:var(--pragmata-danger)] mb-4" />
          <h3 className="text-lg font-medium text-[color:var(--pragmata-fg)]">
            Error al cargar usuarios
          </h3>
          <p className="text-[color:var(--pragmata-muted)] mt-1 max-w-sm">{error}</p>
        </div>
      ) : (
        <div className="bg-[color:var(--pragmata-surface)] rounded-xl border border-[color:var(--pragmata-border)] shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)]/30">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--pragmata-muted)]" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, correo o rol..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-[color:var(--pragmata-muted)]">
                <UsersIcon className="h-3.5 w-3.5" />
                <span>
                  {filteredUsers.length} de {users.length} usuarios
                </span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[color:var(--pragmata-surface-2)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider">
                    Usuario
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider hidden md:table-cell">
                    Rol
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider hidden sm:table-cell">
                    Acceso
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider hidden lg:table-cell">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider hidden xl:table-cell">
                    Alta
                  </th>
                  {(canUpdate || canDelete) && (
                    <th className="px-6 py-3 text-right text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider">
                      Acciones
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--pragmata-border)]">
                {filteredUsers.map((user) => {
                  const badge = ACCESS_BADGE[user.access_level] ?? ACCESS_BADGE.member;
                  const isActive = user.profile_status === 'active';

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-[color:var(--pragmata-row-hover)] transition-colors group"
                    >
                      {/* User */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <UserAvatar avatarPath={user.avatar_url} name={user.full_name} />
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium text-[color:var(--pragmata-fg)] truncate">
                              {user.full_name ?? '—'}
                            </span>
                            <span className="text-xs text-[color:var(--pragmata-muted)] truncate flex items-center gap-1">
                              <Mail className="h-3 w-3 shrink-0" />
                              {user.email}
                            </span>
                            {user.job_title && (
                              <span className="text-[10px] text-[color:var(--pragmata-muted-2)] truncate">
                                {user.job_title}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <Shield className="h-3.5 w-3.5 text-[color:var(--pragmata-muted)]" />
                          <span className="text-sm text-[color:var(--pragmata-fg)]">
                            {user.role_name}
                          </span>
                        </div>
                      </td>

                      {/* Access Level */}
                      <td className="px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                        <div className="flex justify-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${badge.classes}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                        <div className="flex justify-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              isActive
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            }`}
                          >
                            {isActive ? (
                              <UserCheck className="h-3 w-3" />
                            ) : (
                              <UserX className="h-3 w-3" />
                            )}
                            {isActive ? 'Activo' : 'Suspendido'}
                          </span>
                        </div>
                      </td>

                      {/* Created */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[color:var(--pragmata-muted)] hidden xl:table-cell">
                        {new Date(user.created_at).toLocaleDateString('es-MX', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {/* Actions */}
                      {(canUpdate || canDelete) && (
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="relative inline-block">
                          <button
                            onClick={(e) => handleToggleDropdown(user.id, e)}
                            className={`p-1.5 rounded-md text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors ${
                              activeDropdown === user.id
                                ? 'bg-[color:var(--pragmata-surface-2)] text-[color:var(--pragmata-fg)]'
                                : ''
                            }`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>

                          {/* Dropdown Menu */}
                          {activeDropdown === user.id && (
                            <>
                              <div
                                className="fixed inset-0 z-[190]"
                                onClick={() => {
                                  setActiveDropdown(null);
                                  setDropdownPosition(null);
                                }}
                              />
                              <div
                                className="fixed w-52 bg-[color:var(--pragmata-surface)] rounded-xl shadow-xl border border-[color:var(--pragmata-border)] z-[200] py-1 animate-in fade-in zoom-in-95 duration-100"
                                style={{
                                  top: dropdownPosition?.top ?? 0,
                                  left: dropdownPosition?.left ?? 0,
                                }}
                              >
                                {canUpdate && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEdit(user)}
                                    icon={<Edit2 className="h-4 w-4" />}
                                    className="w-full justify-start rounded-none px-4 py-2.5 text-[color:var(--pragmata-fg)]"
                                  >
                                    Editar Usuario
                                  </Button>
                                )}

                                {canUpdate && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleToggleStatus(user)}
                                    icon={
                                      user.profile_status === 'active' ? (
                                        <UserX className="h-4 w-4" />
                                      ) : (
                                        <UserCheck className="h-4 w-4" />
                                      )
                                    }
                                    className={`w-full justify-start rounded-none px-4 py-2.5 ${
                                      user.profile_status === 'active'
                                        ? 'text-amber-600 hover:text-amber-700'
                                        : 'text-emerald-600 hover:text-emerald-700'
                                    }`}
                                  >
                                    {user.profile_status === 'active'
                                      ? 'Suspender'
                                      : 'Reactivar'}
                                  </Button>
                                )}

                                {canUpdate && canDelete && (
                                  <div className="h-px bg-[color:var(--pragmata-border)] mx-2 my-1" />
                                )}

                                {canDelete && (
                                  <Button
                                    variant="danger-ghost"
                                    size="sm"
                                    onClick={() => handleDelete(user)}
                                    icon={<Trash2 className="h-4 w-4" />}
                                    className="w-full justify-start rounded-none px-4 py-2.5"
                                  >
                                    Eliminar Usuario
                                  </Button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Empty State */}
          {filteredUsers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-[color:var(--pragmata-surface-2)] flex items-center justify-center mb-4">
                <Search className="h-6 w-6 text-[color:var(--pragmata-muted)]" />
              </div>
              <h3 className="text-lg font-medium text-[color:var(--pragmata-fg)]">
                No se encontraron usuarios
              </h3>
              <p className="text-[color:var(--pragmata-muted)] mt-1 max-w-sm">
                No hay usuarios que coincidan con tu búsqueda "{searchTerm}". Intenta con
                otros términos.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchTerm('')}
                className="mt-4 text-[color:var(--pragmata-accent)] hover:text-[color:var(--pragmata-accent-dark)]"
              >
                Limpiar búsqueda
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Create User Modal */}
      {isModalOpen && (
        <UserFormModal
          user={editingUser}
          roles={roles}
          onClose={() => {
            setIsModalOpen(false);
            setEditingUser(null);
          }}
          onSave={handleSave}
          saving={saving}
          onFetchRoleDefinitions={fetchRoleDefinitions}
          onFetchUserPermissions={fetchUserPermissions}
          onFetchEntities={fetchEntitiesForAssignment}
          onFetchUserEntities={fetchUserEntityAssignments}
        />
      )}

      {/* Success Modal: User created */}
      {createdEmail && (
        <>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-in fade-in duration-200"
            onClick={() => setCreatedEmail(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-[color:var(--pragmata-surface)] rounded-2xl shadow-2xl border border-[color:var(--pragmata-border)] w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h2 className="text-lg font-bold text-[color:var(--pragmata-fg)]">
                  Usuario Creado Exitosamente
                </h2>
                <p className="text-sm text-[color:var(--pragmata-muted)] mt-2">
                  Se envió un correo a <strong>{createdEmail}</strong> con un enlace para que establezca su contraseña.
                </p>
              </div>

              {/* Info + Close */}
              <div className="p-6 pt-0 space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-xs text-blue-800 dark:text-blue-300">
                    📧 El usuario recibirá un correo de Supabase con un enlace seguro para establecer su contraseña. El enlace expira en 24 horas.
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => setCreatedEmail(null)}>
                    Cerrar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
