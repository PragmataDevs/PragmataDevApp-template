import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { toast } from 'sonner';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  Plus,
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
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { useUsers, type UserCreateInput, type UserWithRole, type UserUpdateInput } from '@/features/users/hooks/useUsers';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { useSignedUrl } from '@/lib/storage';
import UserFormModal from '@/features/users/components/UserFormModal';

const USER_CSV_FIELDS = [
  'id',
  'email',
  'full_name',
  'role_name',
  'access_level',
  'profile_status',
  'created_at',
  'job_title',
] as const;

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
  const url = useSignedUrl('attachments', avatarPath);

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

function UserRowMenu({
  user,
  canUpdate,
  canDelete,
  onEdit,
  onToggleStatus,
  onDelete,
}: {
  user: UserWithRole;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (u: UserWithRole) => void;
  onToggleStatus: (u: UserWithRole) => void;
  onDelete: (u: UserWithRole) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 208;
    const estimatedMenuHeight = 190;
    const viewportPadding = 12;
    const canOpenDown = window.innerHeight - rect.bottom > estimatedMenuHeight;
    const top = canOpenDown
      ? rect.bottom + 8
      : Math.max(viewportPadding, rect.top - estimatedMenuHeight - 8);
    const left = Math.max(
      viewportPadding,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding),
    );
    setPos({ top, left });
    setOpen(true);
  };

  if (!canUpdate && !canDelete) return null;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className={`p-1.5 rounded-md text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors ${
          open ? 'bg-[color:var(--pragmata-surface-2)] text-[color:var(--pragmata-fg)]' : ''
        }`}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
            className="w-52 bg-[color:var(--pragmata-surface)] rounded-xl shadow-xl border border-[color:var(--pragmata-border)] py-1"
          >
            {canUpdate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  onEdit(user);
                }}
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
                onClick={() => {
                  setOpen(false);
                  onToggleStatus(user);
                }}
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
                {user.profile_status === 'active' ? 'Suspender' : 'Reactivar'}
              </Button>
            )}
            {canUpdate && canDelete && <div className="h-px bg-[color:var(--pragmata-border)] mx-2 my-1" />}
            {canDelete && (
              <Button
                variant="danger-ghost"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  onDelete(user);
                }}
                icon={<Trash2 className="h-4 w-4" />}
                className="w-full justify-start rounded-none px-4 py-2.5"
              >
                Eliminar Usuario
              </Button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

export default function UsuariosPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    users,
    roles,
    loading,
    error,
    updateUser,
    toggleUserStatus,
    deleteUser,
    fetchRoleDefinitions,
    fetchUserPermissions,
    fetchEntitiesForAssignment,
    fetchUserEntityAssignments,
  } = useUsers();
  const { hasPermission } = usePermission();

  const canCreate = hasPermission('page_settings_usuarios', 'create');
  const canUpdate = hasPermission('page_settings_usuarios', 'update');
  const canDelete = hasPermission('page_settings_usuarios', 'delete');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  useEffect(() => {
    const email = (location.state as { createdEmail?: string } | null)?.createdEmail;
    if (!email) return;
    setCreatedEmail(email);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  const handleEdit = useCallback((user: UserWithRole) => {
    setEditingUser(user);
    setIsModalOpen(true);
  }, []);

  const handleToggleStatus = useCallback(
    async (user: UserWithRole) => {
      const action = user.profile_status === 'active' ? 'suspender' : 'reactivar';
      if (!confirm(`¿Estás seguro de ${action} a ${user.full_name ?? user.email}?`)) return;
      try {
        await toggleUserStatus(user.id);
      } catch (err: unknown) {
        toast.error('Error: ' + (err instanceof Error ? err.message : String(err)));
      }
    },
    [toggleUserStatus],
  );

  const handleDelete = useCallback(
    async (user: UserWithRole) => {
      if (
        !confirm(
          `¿Estás seguro de eliminar a ${user.full_name ?? user.email}? Esta acción no se puede deshacer.`,
        )
      )
        return;
      try {
        await deleteUser(user.id);
      } catch (err: unknown) {
        toast.error('Error al eliminar: ' + (err instanceof Error ? err.message : String(err)));
      }
    },
    [deleteUser],
  );

  const handleSave = async (data: UserCreateInput | UserUpdateInput) => {
    setSaving(true);
    try {
      if (editingUser) await updateUser(editingUser.id, data as UserUpdateInput);
      setIsModalOpen(false);
      setEditingUser(null);
    } catch (err: unknown) {
      toast.error('Error al guardar: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo((): ColumnDef<UserWithRole>[] => {
    return [
      {
        key: 'full_name',
        header: 'Usuario',
        width: 280,
        render: (_v, row) => (
          <div className="flex items-center gap-3 min-w-0">
            <UserAvatar avatarPath={row.avatar_url} name={row.full_name} />
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-[color:var(--pragmata-fg)] truncate">
                {row.full_name ?? '—'}
              </span>
              <span className="text-xs text-[color:var(--pragmata-muted)] truncate flex items-center gap-1">
                <Mail className="h-3 w-3 shrink-0" />
                {row.email}
              </span>
              {row.job_title && (
                <span className="text-[10px] text-[color:var(--pragmata-muted-2)] truncate">{row.job_title}</span>
              )}
            </div>
          </div>
        ),
      },
      {
        key: 'role_name',
        header: 'Rol',
        width: 160,
        render: (val) => (
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-[color:var(--pragmata-muted)] shrink-0" />
            <span className="text-sm text-[color:var(--pragmata-fg)] truncate">{String(val ?? '—')}</span>
          </div>
        ),
      },
      {
        key: 'access_level',
        header: 'Acceso',
        width: 100,
        render: (_v, row) => {
          const badge = ACCESS_BADGE[row.access_level] ?? ACCESS_BADGE.member;
          return (
            <div className="flex justify-center">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${badge.classes}`}
              >
                {badge.label}
              </span>
            </div>
          );
        },
      },
      {
        key: 'profile_status',
        header: 'Estado',
        width: 120,
        render: (_v, row) => {
          const isActive = row.profile_status === 'active';
          return (
            <div className="flex justify-center">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  isActive
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                }`}
              >
                {isActive ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                {isActive ? 'Activo' : 'Suspendido'}
              </span>
            </div>
          );
        },
      },
      {
        key: 'created_at',
        header: 'Alta',
        width: 130,
        render: (val) =>
          val
            ? new Date(String(val)).toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })
            : '—',
      },
    ];
  }, []);

  const rowActions = useCallback(
    (row: UserWithRole) => (
      <UserRowMenu
        user={row}
        canUpdate={canUpdate}
        canDelete={canDelete}
        onEdit={handleEdit}
        onToggleStatus={handleToggleStatus}
        onDelete={handleDelete}
      />
    ),
    [canUpdate, canDelete, handleEdit, handleToggleStatus, handleDelete],
  );

  return (
    <div className="max-w-7xl mx-auto p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UsersIcon className="w-5 h-5 text-[color:var(--pragmata-accent)]" />
            <h1 className="text-2xl font-bold text-[color:var(--pragmata-fg)]">Gestión de Usuarios</h1>
          </div>
          <p className="text-[color:var(--pragmata-muted)]">
            Crea cuentas, asigna roles y controla niveles de acceso.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => navigate('/settings/usuarios/nuevo')} icon={<Plus className="h-4 w-4" />}>
            Crear Usuario
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[color:var(--pragmata-accent)]" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-10 w-10 text-[color:var(--pragmata-danger)] mb-4" />
          <h3 className="text-lg font-medium text-[color:var(--pragmata-fg)]">Error al cargar usuarios</h3>
          <p className="text-[color:var(--pragmata-muted)] mt-1 max-w-sm">{error}</p>
        </div>
      ) : (
        <DataTable<UserWithRole>
          data={users}
          columns={columns}
          rowKey="id"
          actions={canUpdate || canDelete ? rowActions : undefined}
          csv={{ filename: 'usuarios', fields: [...USER_CSV_FIELDS] }}
          emptyMessage="No hay usuarios."
          emptyDescription="Crea el primero con «Crear Usuario»."
        />
      )}

      {isModalOpen && editingUser && (
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

      {createdEmail && (
        <>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-in fade-in duration-200"
            onClick={() => setCreatedEmail(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-[color:var(--pragmata-surface)] rounded-2xl shadow-2xl border border-[color:var(--pragmata-border)] w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
              <div className="p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h2 className="text-lg font-bold text-[color:var(--pragmata-fg)]">Usuario Creado Exitosamente</h2>
                <p className="text-sm text-[color:var(--pragmata-muted)] mt-2">
                  Se envió un correo a <strong>{createdEmail}</strong> con un enlace para que establezca su contraseña.
                </p>
              </div>

              <div className="p-6 pt-0 space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-xs text-blue-800 dark:text-blue-300">
                    El usuario recibirá un correo de Supabase con un enlace seguro para establecer su contraseña. El
                    enlace expira en 24 horas.
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => setCreatedEmail(null)}>Cerrar</Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
