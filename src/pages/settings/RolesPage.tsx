import { useState } from 'react';
import { Plus, Search, MoreVertical, Edit2, Trash2, Users as UsersIcon, Shield, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useRoles, type RoleWithCount } from '@/features/roles/hooks/useRoles';
import { usePermission } from '@/features/auth/hooks/usePermission';
import RoleFormModal from '@/features/roles/components/RoleFormModal';

export default function RolesPage() {
  const { roles, loading, error, createRole, updateRole, deleteRole, fetchRoleDefinitions } = useRoles();
  const { hasPermission } = usePermission();

  const canCreate = hasPermission('page_settings_roles', 'create');
  const canUpdate = hasPermission('page_settings_roles', 'update');
  const canDelete = hasPermission('page_settings_roles', 'delete');

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleWithCount | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredRoles = roles.filter((role) =>
    role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    role.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (role: RoleWithCount) => {
    setEditingRole(role);
    setIsModalOpen(true);
    setActiveDropdown(null);
  };

  const handleDelete = async (roleId: string) => {
    setActiveDropdown(null);
    if (!confirm('¿Estás seguro de eliminar este rol? Esta acción no se puede deshacer.')) return;
    try {
      await deleteRole(roleId);
    } catch (err: any) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  const handleCreateNew = () => {
    setEditingRole(null);
    setIsModalOpen(true);
  };

  const handleSave = async (data: Parameters<typeof createRole>[0]) => {
    setSaving(true);
    try {
      if (editingRole) {
        await updateRole(editingRole.id, data);
      } else {
        await createRole(data);
      }
      setIsModalOpen(false);
      setEditingRole(null);
    } catch (err: any) {
      alert('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-8">
      
      {/* Page Header */}
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
          <Button
            onClick={handleCreateNew}
            icon={<Plus className="h-4 w-4" />}
          >
            Crear Nuevo Rol
          </Button>
        )}
      </div>

      {/* Content Card */}
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
      <div className="bg-[color:var(--pragmata-surface)] rounded-xl border border-[color:var(--pragmata-border)] shadow-sm overflow-hidden">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)]/30">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--pragmata-muted)]" />
            <input
              type="text"
              placeholder="Buscar por nombre o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[color:var(--pragmata-surface-2)]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider">
                  Nombre del Rol
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider">
                  Descripción
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider">
                  Usuarios
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider">
                  Creado el
                </th>
                {(canUpdate || canDelete) && (
                  <th className="px-6 py-3 text-right text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider">
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--pragmata-border)]">
              {filteredRoles.map((role) => (
                <tr
                  key={role.id}
                  className="hover:bg-[color:var(--pragmata-row-hover)] transition-colors group"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${role.is_system_role ? 'bg-[color:var(--pragmata-accent-soft)]' : 'bg-slate-100'}`}>
                        <Shield className={`h-4 w-4 ${role.is_system_role ? 'text-[color:var(--pragmata-accent)]' : 'text-slate-500'}`} />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-[color:var(--pragmata-fg)]">
                          {role.name}
                        </span>
                        {role.is_system_role && (
                          <span className="text-[10px] leading-tight font-medium text-[color:var(--pragmata-accent)]">
                            SISTEMA
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-[color:var(--pragmata-muted)] line-clamp-1 max-w-xs" title={role.description ?? undefined}>
                      {role.description}
                    </p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center justify-center">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)]">
                        <UsersIcon className="h-3.5 w-3.5 text-[color:var(--pragmata-muted)]" />
                        <span className="text-xs font-medium text-[color:var(--pragmata-fg)]">{role.users_count}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[color:var(--pragmata-muted)]">
                    {new Date(role.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  {(canUpdate || canDelete) && (
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="relative inline-block">
                      <button
                        onClick={() => setActiveDropdown(activeDropdown === role.id ? null : role.id)}
                        className={`p-1.5 rounded-md text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors ${activeDropdown === role.id ? 'bg-[color:var(--pragmata-surface-2)] text-[color:var(--pragmata-fg)]' : ''}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>

                      {/* Dropdown Menu */}
                      {activeDropdown === role.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setActiveDropdown(null)}
                          />
                          <div className="absolute right-0 mt-2 w-48 bg-[color:var(--pragmata-surface)] rounded-xl shadow-xl border border-[color:var(--pragmata-border)] z-20 py-1 animate-in fade-in zoom-in-95 duration-100">
                            {canUpdate && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(role)}
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
                            {canDelete && (
                              <Button
                                variant="danger-ghost"
                                size="sm"
                                onClick={() => handleDelete(role.id)}
                                icon={<Trash2 className="h-4 w-4" />}
                                className={`w-full justify-start rounded-none px-4 py-2.5 ${role.is_system_role ? 'hidden' : ''}`}
                              >
                                Eliminar Rol
                              </Button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {filteredRoles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-full bg-[color:var(--pragmata-surface-2)] flex items-center justify-center mb-4">
              <Search className="h-6 w-6 text-[color:var(--pragmata-muted)]" />
            </div>
            <h3 className="text-lg font-medium text-[color:var(--pragmata-fg)]">No se encontraron roles</h3>
            <p className="text-[color:var(--pragmata-muted)] mt-1 max-w-sm">
              No hay roles que coincidan con tu búsqueda "{searchTerm}". Intenta con otros términos.
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

      {/* Modal */}
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
