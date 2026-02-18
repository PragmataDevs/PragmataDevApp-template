import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { ResourceAction } from '@/types/auth/rbac';
import type { GrantedPermissions } from '@/features/roles/components/PermissionsPanel';

// ─── Feature flag ────────────────────────────────────────────
const POWERSYNC_ENABLED = import.meta.env.VITE_ENABLE_POWERSYNC === 'true';

// ─── Types ───────────────────────────────────────────────────

/** Row shape coming from Supabase / SQLite */
export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  can_be_customized: boolean;
  is_dev_role: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoleDefinitionRow {
  id: string;
  role_id: string;
  resource_code: string;
  granted_actions: string; // JSON string in SQLite, or string[] from Supabase
  conditions: string | null;
}

/** Payload for creating/updating a role */
export interface RoleSavePayload {
  name: string;
  description: string;
  permissions: GrantedPermissions;
}

/** Extended role with user count for the list view */
export interface RoleWithCount extends RoleRow {
  users_count: number;
}

// ─── Hook ────────────────────────────────────────────────────

export function useRoles() {
  const [roles, setRoles] = useState<RoleWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch roles ──────────────────────────────────────────

  const fetchRoles = useCallback(async () => {
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
        // Supabase direct: read from cloud
        const { data: rolesData, error: rolesError } = await supabase
          .from('sys_roles')
          .select('*')
          .order('is_system_role', { ascending: false })
          .order('name');

        if (rolesError) throw rolesError;

        // Count users per role
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('role_id');

        if (profilesError) throw profilesError;

        const countMap = new Map<string, number>();
        for (const p of profilesData ?? []) {
          if (p.role_id) {
            countMap.set(p.role_id, (countMap.get(p.role_id) ?? 0) + 1);
          }
        }

        setRoles(
          (rolesData ?? []).map((role) => ({
            ...role,
            users_count: countMap.get(role.id) ?? 0,
          }))
        );
      }
    } catch (err: any) {
      console.error('[useRoles] Error fetching roles:', err);
      setError(err.message ?? 'Error al cargar roles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

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
          const { data, error } = await supabase
            .from('sys_role_definitions')
            .select('*')
            .eq('role_id', roleId);

          if (error) throw error;

          const permissions: GrantedPermissions = {};
          for (const row of data ?? []) {
            permissions[row.resource_code] = row.granted_actions;
          }
          return permissions;
        }
      } catch (err: any) {
        console.error('[useRoles] Error fetching definitions:', err);
        throw err;
      }
    },
    []
  );

  // ── Create role ──────────────────────────────────────────
  // Writes ALWAYS go to Supabase (cloud). PowerSync syncs down automatically.

  const createRole = useCallback(
    async (payload: RoleSavePayload) => {
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

      return newRole;
    },
    [fetchRoles]
  );

  // ── Update role ──────────────────────────────────────────

  const updateRole = useCallback(
    async (roleId: string, payload: RoleSavePayload) => {
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
