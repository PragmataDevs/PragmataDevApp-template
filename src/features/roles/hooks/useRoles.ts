import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { withSessionRetry } from '@/lib/auth/sessionRetry';
import type { ResourceAction } from '@/features/auth/types/rbac';
import type { Role, RoleDefinition } from '@/features/roles/types/role';
import type { GrantedPermissions } from '@/features/roles/components/PermissionsPanel';
import { errorMessage } from '@/lib/errors';

// ─── Feature flag ────────────────────────────────────────────
const POWERSYNC_ENABLED = import.meta.env.VITE_ENABLE_POWERSYNC === 'true';

// ─── Types ───────────────────────────────────────────────────

export type RoleRow = Role;

export type RoleDefinitionRow = Omit<RoleDefinition, 'granted_actions'> & {
  granted_actions: string | ResourceAction[];
};

/** Input para crear/actualizar un rol — campos editables derivados de Role */
export type RoleInput = Pick<Role, 'name' | 'description'> & {
  permissions: GrantedPermissions;
};

/** Extended role with user count for the list view */
export interface RoleWithCount extends RoleRow {
  users_count: number;
}

// ─── Hook ────────────────────────────────────────────────────

export function useRoles() {
  const { loading: authLoading, isAuthenticated, sessionEpoch } = useAuth();
  const [roles, setRoles] = useState<RoleWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch roles ──────────────────────────────────────────

  const fetchRoles = useCallback(async () => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setRoles([]);
      setError(null);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      setLoading(true);
      setError(null);

      if (POWERSYNC_ENABLED) {
        // PowerSync: read from local SQLite via the powersync instance
        const { db } = await import('@/lib/db');

        const rolesResult = await db.getAll<RoleRow>(
          `SELECT * FROM sys_roles ORDER BY is_system_role DESC, name ASC`
        );

        // Count users per role from profiles table
        const countsResult = await db.getAll<{ role_id: string; count: number }>(
          `SELECT role_id, COUNT(*) as count FROM profiles WHERE role_id IS NOT NULL GROUP BY role_id`
        );

        const countMap = new Map(countsResult.map((r) => [r.role_id, r.count]));

        setRoles(
          rolesResult.map((role) => ({
            ...role,
            is_system_role: Boolean(role.is_system_role),
            can_be_customized: Boolean(role.can_be_customized),
            is_dev_role: Boolean(role.is_dev_role),
            users_count: countMap.get(role.id) ?? 0,
          }))
        );
      } else {
        const { rolesData, profilesData } = await withSessionRetry(async () => {
          const rolesResponse = await supabase
            .from('sys_roles')
            .select('*')
            .order('is_system_role', { ascending: false })
            .order('name');

          if (rolesResponse.error) throw rolesResponse.error;

          const profilesResponse = await supabase
            .from('profiles')
            .select('role_id');

          if (profilesResponse.error) throw profilesResponse.error;

          return {
            rolesData: rolesResponse.data ?? [],
            profilesData: profilesResponse.data ?? [],
          };
        }, 'useRoles.fetchRoles');

        if (ac.signal.aborted) return;

        const countMap = new Map<string, number>();
        for (const p of profilesData) {
          if (p.role_id) {
            countMap.set(p.role_id, (countMap.get(p.role_id) ?? 0) + 1);
          }
        }

        setRoles(
          rolesData.map((role) => ({
            ...role,
            users_count: countMap.get(role.id) ?? 0,
          }))
        );
      }
    } catch (err: unknown) {
      if (ac.signal.aborted) return;
      console.error('[useRoles] Error fetching roles:', err);
      setError(errorMessage(err, 'Error al cargar roles'));
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (authLoading) return;
    fetchRoles();
    return () => { abortRef.current?.abort(); };
    // sessionEpoch in deps: re-run after TOKEN_REFRESHED / wake-from-idle.
  }, [authLoading, isAuthenticated, fetchRoles, sessionEpoch]);

  // ── Fetch role definitions (permissions) for a single role ──

  const fetchRoleDefinitions = useCallback(
    async (roleId: string): Promise<GrantedPermissions> => {
      try {
        if (POWERSYNC_ENABLED) {
          const { db } = await import('@/lib/db');

          const rows = await db.getAll<RoleDefinitionRow>(
            `SELECT * FROM sys_role_definitions WHERE role_id = ?`,
            [roleId]
          );

          const permissions: GrantedPermissions = {};
          for (const row of rows) {
            const actions: ResourceAction[] =
              typeof row.granted_actions === 'string'
                ? JSON.parse(row.granted_actions)
                : row.granted_actions;
            permissions[row.resource_code] = actions;
          }
          return permissions;
        } else {
          const data = await withSessionRetry(async () => {
            const response = await supabase
              .from('sys_role_definitions')
              .select('*')
              .eq('role_id', roleId);

            if (response.error) throw response.error;
            return response.data ?? [];
          }, 'useRoles.fetchRoleDefinitions');

          const permissions: GrantedPermissions = {};
          for (const row of data) {
            permissions[row.resource_code] = row.granted_actions;
          }
          return permissions;
        }
      } catch (err: unknown) {
        console.error('[useRoles] Error fetching definitions:', err);
        throw err;
      }
    },
    []
  );

  // ── Create role ──────────────────────────────────────────
  // Writes ALWAYS go to Supabase (cloud). PowerSync syncs down automatically.

  const createRole = useCallback(
    async (payload: RoleInput) => {
      // 1. Insert the role
      const { data: newRole, error: roleError } = await supabase
        .from('sys_roles')
        .insert({
          name: payload.name,
          description: payload.description || null,
          is_system_role: false,
          can_be_customized: true,
          is_dev_role: false,
        })
        .select()
        .single();

      if (roleError) throw roleError;

      // 2. Insert role definitions (permissions)
      const definitions = Object.entries(payload.permissions)
        .filter(([, actions]) => (actions as string[]).length > 0)
        .map(([resource_code, granted_actions]) => ({
          role_id: newRole.id,
          resource_code,
          granted_actions,
        }));

      if (definitions.length > 0) {
        const { error: defsError } = await supabase
          .from('sys_role_definitions')
          .insert(definitions);

        if (defsError) throw defsError;
      }

      // 3. Refresh local list
      await fetchRoles();
      toast.success('Rol creado exitosamente');

      return newRole;
    },
    [fetchRoles]
  );

  // ── Update role ──────────────────────────────────────────

  const updateRole = useCallback(
    async (roleId: string, payload: RoleInput) => {
      // 1. Update role metadata
      const { error: roleError } = await supabase
        .from('sys_roles')
        .update({
          name: payload.name,
          description: payload.description || null,
        })
        .eq('id', roleId);

      if (roleError) throw roleError;

      // 2. Replace all role definitions (delete old + insert new)
      const { error: deleteError } = await supabase
        .from('sys_role_definitions')
        .delete()
        .eq('role_id', roleId);

      if (deleteError) throw deleteError;

      const definitions = Object.entries(payload.permissions)
        .filter(([, actions]) => (actions as string[]).length > 0)
        .map(([resource_code, granted_actions]) => ({
          role_id: roleId,
          resource_code,
          granted_actions,
        }));

      if (definitions.length > 0) {
        const { error: defsError } = await supabase
          .from('sys_role_definitions')
          .insert(definitions);

        if (defsError) throw defsError;
      }

      // 3. Refresh local list
      await fetchRoles();
      toast.success('Rol actualizado exitosamente');
    },
    [fetchRoles]
  );

  // ── Delete role ──────────────────────────────────────────

  const deleteRole = useCallback(
    async (roleId: string) => {
      // Delete definitions first (FK), then the role
      const { error: defsError } = await supabase
        .from('sys_role_definitions')
        .delete()
        .eq('role_id', roleId);

      if (defsError) throw defsError;

      const { error: roleError } = await supabase
        .from('sys_roles')
        .delete()
        .eq('id', roleId);

      if (roleError) throw roleError;

      // Refresh local list
      await fetchRoles();
      toast.success('Rol eliminado exitosamente');
    },
    [fetchRoles]
  );

  return {
    roles,
    loading,
    error,
    refetch: fetchRoles,
    fetchRoleDefinitions,
    createRole,
    updateRole,
    deleteRole,
  };
}
