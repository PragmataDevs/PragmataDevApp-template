import { useState, useMemo, useCallback, useRef, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { toast } from 'sonner';
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
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { useRoles, type RoleWithCount } from '@/features/roles/hooks/useRoles';
import { usePermission } from '@/features/auth/hooks/usePermission';
import RoleFormModal from '@/features/roles/components/RoleFormModal';

const ROLE_CSV_FIELDS = [
  'id',
  'name',
  'description',
  'is_system_role',
  'users_count',
  'created_at',
] as const;

function RoleRowMenu({
  role,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
}: {
  role: RoleWithCount;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (r: RoleWithCount) => void;
  onDelete: (id: string) => void;
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
    const menuW = 192;
    const leftCandidate = rect.right + 4;
    const left =
      leftCandidate + menuW > window.innerWidth ? rect.left - menuW - 4 : leftCandidate;
    setPos({ top: rect.bottom + 4, left: Math.max(8, left) });
    setOpen(true);
  };

  if (!canUpdate && !canDelete) return null;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className={`p-1.5 rounded-md text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors ${open ? 'bg-[color:var(--pragmata-surface-2)] text-[color:var(--pragmata-fg)]' : ''}`}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, minWidth: 192 }}
            className="bg-[color:var(--pragmata-surface)] rounded-xl shadow-xl border border-[color:var(--pragmata-border)] py-1 text-sm overflow-hidden"
          >
            {canUpdate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  onEdit(role);
                }}
                disabled={role.is_system_role}
                icon={<Edit2 className="h-4 w-4" />}
                className={`w-full justify-start rounded-none px-4 py-2.5 ${role.is_system_role ? 'text-[color:var(--pragmata-muted-2)]' : 'text-[color:var(--pragmata-fg)]'}`}
              >
                Editar Rol
              </Button>
            )}
            {canUpdate && canDelete && !role.is_system_role && (
              <div className="h-px bg-[color:var(--pragmata-border)] mx-2 my-1" />
            )}
            {canDelete && !role.is_system_role && (
              <Button
                variant="danger-ghost"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  onDelete(role.id);
                }}
                icon={<Trash2 className="h-4 w-4" />}
                className="w-full justify-start rounded-none px-4 py-2.5"
              >
                Eliminar Rol
              </Button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

export default function RolesPage() {
  const { roles, loading, error, createRole, updateRole, deleteRole, fetchRoleDefinitions } = useRoles();
  const { hasPermission } = usePermission();

  const canCreate = hasPermission('page_settings_roles', 'create');
  const canUpdate = hasPermission('page_settings_roles', 'update');
  const canDelete = hasPermission('page_settings_roles', 'delete');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleWithCount | null>(null);
  const [saving, setSaving] = useState(false);

  const handleEdit = useCallback((role: RoleWithCount) => {
    setEditingRole(role);
    setIsModalOpen(true);
  }, []);

  const handleDelete = useCallback(async (roleId: string) => {
    if (!confirm('¿Estás seguro de eliminar este rol? Esta acción no se puede deshacer.')) return;
    try {
      await deleteRole(roleId);
    } catch (err: unknown) {
      toast.error('Error al eliminar: ' + (err instanceof Error ? err.message : String(err)));
    }
  }, [deleteRole]);

  const handleCreateNew = () => {
    setEditingRole(null);
    setIsModalOpen(true);
  };

  const handleSave = async (data: Parameters<typeof createRole>[0]) => {
    setSaving(true);
    try {
      if (editingRole) await updateRole(editingRole.id, data);
      else await createRole(data);
      setIsModalOpen(false);
      setEditingRole(null);
    } catch (err: unknown) {
      toast.error('Error al guardar: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo((): ColumnDef<RoleWithCount>[] => {
    return [
      {
        key: 'name',
        header: 'Nombre del Rol',
        width: 240,
        render: (_v, row) => (
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${row.is_system_role ? 'bg-[color:var(--pragmata-accent-soft)]' : 'bg-slate-100'}`}
            >
              <Shield
                className={`h-4 w-4 ${row.is_system_role ? 'text-[color:var(--pragmata-accent)]' : 'text-slate-500'}`}
              />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-[color:var(--pragmata-fg)] truncate">{row.name}</span>
              {row.is_system_role && (
                <span className="text-[10px] leading-tight font-medium text-[color:var(--pragmata-accent)]">
                  SISTEMA
                </span>
              )}
            </div>
          </div>
        ),
      },
      {
        key: 'description',
        header: 'Descripción',
        width: 280,
        render: (val, row) => (
          <p
            className="text-sm text-[color:var(--pragmata-muted)] line-clamp-2 max-w-md"
            title={row.description ?? undefined}
          >
            {(val as string | null) ?? '—'}
          </p>
        ),
      },
      {
        key: 'users_count',
        header: 'Usuarios',
        width: 110,
        render: (val) => (
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)]">
              <UsersIcon className="h-3.5 w-3.5 text-[color:var(--pragmata-muted)]" />
              <span className="text-xs font-medium text-[color:var(--pragmata-fg)]">{Number(val ?? 0)}</span>
            </div>
          </div>
        ),
      },
      {
        key: 'created_at',
        header: 'Creado el',
        width: 140,
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
    (row: RoleWithCount) => (
      <RoleRowMenu
        role={row}
        canUpdate={canUpdate}
        canDelete={canDelete}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    ),
    [canUpdate, canDelete, handleEdit, handleDelete],
  );

  return (
    <div className="max-w-7xl mx-auto p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-[color:var(--pragmata-accent)]" />
            <h1 className="text-2xl font-bold text-[color:var(--pragmata-fg)]">Roles y Permisos</h1>
          </div>
          <p className="text-[color:var(--pragmata-muted)]">
            Gestiona los roles de usuario y define niveles de acceso granular.
          </p>
        </div>
        {canCreate && (
          <Button onClick={handleCreateNew} icon={<Plus className="h-4 w-4" />}>
            Crear Nuevo Rol
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
          <h3 className="text-lg font-medium text-[color:var(--pragmata-fg)]">Error al cargar roles</h3>
          <p className="text-[color:var(--pragmata-muted)] mt-1 max-w-sm">{error}</p>
        </div>
      ) : (
        <DataTable<RoleWithCount>
          data={roles}
          columns={columns}
          rowKey="id"
          actions={canUpdate || canDelete ? rowActions : undefined}
          csv={{ filename: 'roles', fields: [...ROLE_CSV_FIELDS] }}
          emptyMessage="No hay roles."
          emptyDescription="Crea el primero con «Crear Nuevo Rol»."
        />
      )}

      {isModalOpen && (
        <RoleFormModal
          role={editingRole}
          onClose={() => {
            setIsModalOpen(false);
            setEditingRole(null);
          }}
          onSave={handleSave}
          saving={saving}
          fetchRoleDefinitions={fetchRoleDefinitions}
        />
      )}
    </div>
  );
}
