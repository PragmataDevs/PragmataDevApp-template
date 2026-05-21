import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import UserForm from '@/features/users/components/UserForm';
import { useUsers, type UserCreateInput, type UserUpdateInput } from '@/features/users/hooks/useUsers';
import { usePermission } from '@/features/auth/hooks/usePermission';

export default function UsuarioNewPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('page_settings_usuarios', 'create');

  const {
    roles,
    loading,
    createUser,
    fetchRoleDefinitions,
    fetchUserPermissions,
    fetchEntitiesForAssignment,
    fetchUserEntityAssignments,
  } = useUsers();

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canCreate) {
      navigate('/settings/usuarios', { replace: true });
    }
  }, [canCreate, navigate]);

  const handleSave = async (data: UserCreateInput | UserUpdateInput) => {
    setSaving(true);
    try {
      const result = await createUser(data as UserCreateInput);
      navigate('/settings/usuarios', { replace: true, state: { createdEmail: result.email } });
    } catch (err: unknown) {
      alert('Error al guardar: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  if (!canCreate) {
    return null;
  }

  if (loading && roles.length === 0) {
    return (
      <div className="flex items-center justify-center py-24 max-w-3xl mx-auto p-6">
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--pragmata-accent)]" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Usuarios', to: '/settings/usuarios' },
          { label: 'Nuevo usuario' },
        ]}
        title="Nuevo usuario"
        subtitle="Completa los datos, rol y permisos. Se enviará un correo para que establezca su contraseña."
      />

      <div className="rounded-pragmata border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] shadow-sm overflow-hidden">
        <UserForm
          user={null}
          roles={roles}
          onCancel={() => navigate('/settings/usuarios')}
          onSave={handleSave}
          saving={saving}
          onFetchRoleDefinitions={fetchRoleDefinitions}
          onFetchUserPermissions={fetchUserPermissions}
          onFetchEntities={fetchEntitiesForAssignment}
          onFetchUserEntities={fetchUserEntityAssignments}
        />
      </div>
    </div>
  );
}
