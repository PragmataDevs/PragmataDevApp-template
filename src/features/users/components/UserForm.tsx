import { useState, useEffect } from 'react';
import { Shield, Loader2, Lock, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/hooks/useAuth';
import PermissionsPanel from '@/features/roles/components/PermissionsPanel';
import type { GrantedPermissions } from '@/features/roles/components/PermissionsPanel';
import type { AccessLevel } from '@/features/users/types/profile';
import type {
  UserCreateInput,
  UserUpdateInput,
  RoleOption,
  UserWithRole,
  EntityOption,
} from '../hooks/useUsers';
import { ENTITY_LABEL_PLURAL } from '@/features/entities/types/entity';

export interface UserFormProps {
  user?: UserWithRole | null;
  roles: RoleOption[];
  onCancel: () => void;
  onSave: (data: UserCreateInput | UserUpdateInput) => Promise<void>;
  saving?: boolean;
  onFetchRoleDefinitions: (roleId: string) => Promise<GrantedPermissions>;
  onFetchUserPermissions: (userId: string) => Promise<GrantedPermissions>;
  onFetchEntities: () => Promise<EntityOption[]>;
  onFetchUserEntities: (userId: string) => Promise<string[]>;
}

const ACCESS_LEVELS: { value: AccessLevel; label: string; hint: string }[] = [
  { value: 'god', label: 'God', hint: 'Acceso total a todos los datos de todos los equipos' },
  { value: 'admin', label: 'Admin', hint: 'Acceso total a los datos de su equipo' },
  { value: 'member', label: 'Member', hint: `Solo sus datos y ${ENTITY_LABEL_PLURAL.toLowerCase()} asignados (sys_entity_access)` },
];

export default function UserForm({
  user,
  roles,
  onCancel,
  onSave,
  saving = false,
  onFetchRoleDefinitions,
  onFetchUserPermissions,
  onFetchEntities,
  onFetchUserEntities,
}: UserFormProps) {
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [roleId, setRoleId] = useState(user?.role_id || (roles[0]?.id ?? ''));
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(user?.access_level || 'member');
  const [jobTitle, setJobTitle] = useState(user?.job_title || '');
  const [phone, setPhone] = useState(user?.phone || '');

  const [rolePermissions, setRolePermissions] = useState<GrantedPermissions>({});
  const [customPermissions, setCustomPermissions] = useState<GrantedPermissions>({});
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);

  const isEditing = !!user;

  const selectedRole = roles.find((r) => r.id === roleId);
  const canBeCustomized = selectedRole?.can_be_customized ?? false;

  // Tope de privilegio: nunca ofrecer un nivel de acceso que el actor no pueda
  // otorgar. Espeja el guard a nivel DB: solo un god puede otorgar god, solo
  // admin/god puede otorgar admin. Un member no puede otorgar nada arriba de member.
  const { profile: actor, isGod } = useAuth();
  const grantableLevels: AccessLevel[] = isGod
    ? ['god', 'admin', 'member']
    : actor?.access_level === 'admin'
      ? ['admin', 'member']
      : ['member'];
  // Si se edita a alguien cuyo nivel actual el actor no puede otorgar, bloquea el campo.
  const canEditAccessLevel = grantableLevels.includes(accessLevel);
  const visibleAccessLevels = ACCESS_LEVELS.filter(
    (al) => grantableLevels.includes(al.value) || al.value === accessLevel,
  );

  useEffect(() => {
    if (!roleId) return;
    let cancelled = false;
    setLoadingPermissions(true);

    (async () => {
      try {
        const defs = await onFetchRoleDefinitions(roleId);
        if (cancelled) return;
        setRolePermissions(defs);
        if (!isCustomizing) setCustomPermissions(defs);
      } catch (err) {
        console.error('Error fetching role definitions:', err);
      } finally {
        if (!cancelled) setLoadingPermissions(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId]);

  useEffect(() => {
    if (!isEditing || !user) return;
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

      return () => {
        cancelled = true;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    setLoadingEntities(true);

    (async () => {
      try {
        const list = await onFetchEntities();
        if (cancelled) return;
        setEntities(list);
      } catch (err) {
        console.error('Error fetching entities:', err);
      } finally {
        if (!cancelled) setLoadingEntities(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onFetchEntities]);

  useEffect(() => {
    if (!isEditing || !user) return;
    let cancelled = false;

    (async () => {
      try {
        const assigned = await onFetchUserEntities(user.id);
        if (cancelled) return;
        setSelectedEntityIds(assigned);
      } catch (err) {
        console.error('Error fetching user entity assignments:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEditing, onFetchUserEntities, user]);

  const toggleEntity = (entityId: string) => {
    setSelectedEntityIds((prev) =>
      prev.includes(entityId) ? prev.filter((id) => id !== entityId) : [...prev, entityId],
    );
  };

  const handleCustomizingToggle = (value: boolean) => {
    setIsCustomizing(value);
    if (!value) {
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
      const updatePayload: UserUpdateInput = {
        full_name: fullName,
        role_id: roleId,
        access_level: accessLevel,
        job_title: jobTitle || undefined,
        phone: phone || undefined,
        entity_ids: selectedEntityIds,
        ...permissionsPayload,
      };
      await onSave(updatePayload);
    } else {
      const createPayload: UserCreateInput = {
        full_name: fullName,
        email,
        role_id: roleId,
        access_level: accessLevel,
        job_title: jobTitle || undefined,
        phone: phone || undefined,
        entity_ids: selectedEntityIds,
        ...permissionsPayload,
      };
      await onSave(createPayload);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
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
          <p className="text-xs text-[color:var(--pragmata-muted-2)] mt-1">El correo no se puede modificar.</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        <div>
          <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-1.5">
            Nivel de acceso <span className="text-[color:var(--pragmata-danger)]">*</span>
          </label>
          <select
            value={accessLevel}
            onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
            disabled={!canEditAccessLevel}
            className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {visibleAccessLevels.map((al) => (
              <option key={al.value} value={al.value} disabled={!grantableLevels.includes(al.value)}>
                {al.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-[color:var(--pragmata-muted-2)] mt-1">
            {!canEditAccessLevel
              ? 'No puedes cambiar este nivel de acceso — es superior al tuyo.'
              : ACCESS_LEVELS.find((al) => al.value === accessLevel)?.hint}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-1.5">Puesto</label>
          <input
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="Ej: Gerente de Obra"
            className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[color:var(--pragmata-fg)] mb-1.5">Teléfono</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+52 55 1234 5678"
            className="w-full px-4 py-2.5 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
          />
        </div>
      </div>

      {roleId && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[color:var(--pragmata-accent)]" />
            <span className="text-sm font-semibold text-[color:var(--pragmata-fg)]">Permisos del Rol</span>
            {!canBeCustomized && (
              <span className="inline-flex items-center gap-1 text-xs text-[color:var(--pragmata-muted-2)] bg-[color:var(--pragmata-surface-2)] px-2 py-0.5 rounded-full">
                <Lock className="h-3 w-3" />
                Estricto
              </span>
            )}
          </div>

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

          {loadingPermissions ? (
            <div className="flex items-center justify-center py-8 text-[color:var(--pragmata-muted)]">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Cargando permisos…</span>
            </div>
          ) : (
            <div className={!isCustomizing ? 'opacity-60 pointer-events-none' : ''}>
              <PermissionsPanel selectedPermissions={customPermissions} onChange={setCustomPermissions} />
            </div>
          )}

          {!canBeCustomized && !loadingPermissions && (
            <p className="text-xs text-[color:var(--pragmata-muted-2)]">
              Este rol es estricto — los permisos no pueden personalizarse por usuario.
            </p>
          )}
        </div>
      )}

      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-[color:var(--pragmata-accent)]" />
          <span className="text-sm font-semibold text-[color:var(--pragmata-fg)]">{ENTITY_LABEL_PLURAL} (workspace)</span>
          <span className="inline-flex items-center text-xs text-[color:var(--pragmata-muted-2)] bg-[color:var(--pragmata-surface-2)] px-2 py-0.5 rounded-full">
            {selectedEntityIds.length} seleccionados
          </span>
        </div>
        <p className="text-[11px] text-[color:var(--pragmata-muted-2)]">
          Define qué <strong>{ENTITY_LABEL_PLURAL.toLowerCase()}</strong> aparecen para este usuario en{' '}
          <code className="rounded bg-[color:var(--pragmata-surface-2)] px-1">/workspace/:entityId</code> (
          <code className="rounded bg-[color:var(--pragmata-surface-2)] px-1">sys_entity_access</code>).
        </p>

        {loadingEntities ? (
          <div className="flex items-center justify-center py-6 text-[color:var(--pragmata-muted)]">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">Cargando…</span>
          </div>
        ) : entities.length === 0 ? (
          <p className="text-xs text-[color:var(--pragmata-muted-2)]">
            No hay {ENTITY_LABEL_PLURAL.toLowerCase()} activos para asignar.
          </p>
        ) : (
          <div className="max-h-52 overflow-y-auto rounded-lg border border-[color:var(--pragmata-border)] divide-y divide-[color:var(--pragmata-border)]">
            {entities.map((ent) => {
              const checked = selectedEntityIds.includes(ent.id);
              return (
                <label
                  key={ent.id}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[color:var(--pragmata-surface-2)] transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleEntity(ent.id)}
                    className="h-4 w-4 rounded border-[color:var(--pragmata-border)] text-[color:var(--pragmata-accent)] focus:ring-[color:var(--pragmata-accent)]"
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-[color:var(--pragmata-fg)] truncate">{ent.name}</p>
                    {ent.code && (
                      <p className="text-[11px] text-[color:var(--pragmata-muted-2)] font-mono">{ent.code}</p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-[color:var(--pragmata-border)]">
        <Button variant="secondary" type="button" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving}>
          {isEditing ? 'Guardar Cambios' : 'Crear Usuario'}
        </Button>
      </div>
    </form>
  );
}
