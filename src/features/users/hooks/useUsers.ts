import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { withSessionRetry } from '@/lib/auth/sessionRetry';
import type { AccessLevel, Profile } from '@/types/users/profile';
import type { GrantedPermissions } from '@/features/settings/components/PermissionsPanel';

// ─── Feature flag ────────────────────────────────────────────
const POWERSYNC_ENABLED = import.meta.env.VITE_ENABLE_POWERSYNC === 'true';

// ─── Types ───────────────────────────────────────────────────

export type UserRow = Pick<
  Profile,
  | 'id'
  | 'email'
  | 'full_name'
  | 'avatar_url'
  | 'phone'
  | 'job_title'
  | 'team_id'
  | 'role_id'
  | 'access_level'
  | 'is_role_synced'
  | 'profile_status'
  | 'created_at'
  | 'updated_at'
>;

/** Extended user with role name for the list view */
export interface UserWithRole extends UserRow {
  role_name: string;
}

/** Payload for creating a new user */
export interface UserCreatePayload {
  full_name: string;
  email: string;
  role_id: string;
  access_level: AccessLevel;
  job_title?: string;
  phone?: string;
  is_role_synced: boolean;
  customPermissions?: GrantedPermissions;
  project_ids?: string[];
}

/** Payload for updating an existing profile */
export interface UserUpdatePayload {
  full_name: string;
  role_id: string;
  access_level: AccessLevel;
  job_title?: string;
  phone?: string;
  is_role_synced: boolean;
  customPermissions?: GrantedPermissions;
  project_ids?: string[];
}

/** Result of creating a user */
export interface CreateUserResult {
  userId: string;
  email: string;
}

/** Role option for selects (includes customization flag) */
export interface RoleOption {
  id: string;
  name: string;
  can_be_customized: boolean;
}

export interface ProjectOption {
  id: string;
  name: string;
  code: string | null;
}

// ─── Hook ────────────────────────────────────────────────────

export function useUsers() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch users ──────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setUsers([]);
      setRoles([]);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (POWERSYNC_ENABLED) {
        // PowerSync: read from local SQLite
        const { db } = await import('@/lib/db');

        const profileRows = await db.getAll<UserRow & { role_name?: string }>(
          `SELECT p.*, r.name as role_name 
           FROM profiles p 
           LEFT JOIN sys_roles r ON r.id = p.role_id 
           ORDER BY p.created_at DESC`,
        );

        setUsers(
          profileRows.map((row) => ({
            ...row,
            is_role_synced: Boolean(row.is_role_synced),
            role_name: row.role_name ?? 'Sin rol',
          })),
        );

        const roleRows = await db.getAll<RoleOption>(
          `SELECT id, name, can_be_customized FROM sys_roles ORDER BY name`,
        );
        setRoles(roleRows.map((r) => ({ ...r, can_be_customized: Boolean(r.can_be_customized) })));
      } else {
        const { profilesData, rolesData } = await withSessionRetry(async () => {
          const profilesResponse = await supabase
            .from('profiles')
            .select('*, sys_roles(name)')
            .order('created_at', { ascending: false });

          if (profilesResponse.error) throw profilesResponse.error;

          const rolesResponse = await supabase
            .from('sys_roles')
            .select('id, name, can_be_customized')
            .order('name');

          if (rolesResponse.error) throw rolesResponse.error;

          return {
            profilesData: profilesResponse.data ?? [],
            rolesData: rolesResponse.data ?? [],
          };
        }, 'useUsers.fetchUsers');

        setUsers(
          profilesData.map((p: any) => ({
            id: p.id,
            email: p.email,
            full_name: p.full_name,
            avatar_url: p.avatar_url,
            phone: p.phone,
            job_title: p.job_title,
            team_id: p.team_id,
            role_id: p.role_id,
            access_level: p.access_level,
            is_role_synced: p.is_role_synced,
            profile_status: p.profile_status,
            created_at: p.created_at,
            updated_at: p.updated_at,
            role_name: p.sys_roles?.name ?? 'Sin rol',
          })),
        );

        setRoles(rolesData.map((r: any) => ({
          id: r.id,
          name: r.name,
          can_be_customized: r.can_be_customized ?? false,
        })));
      }
    } catch (err: any) {
      console.error('[useUsers] Error fetching users:', err);
      setError(err.message ?? 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (authLoading) return;
    fetchUsers();
  }, [authLoading, isAuthenticated, fetchUsers]);

  // ── Fetch role definitions (permissions of a role) ────────
  // Used by UserFormModal to pre-populate the PermissionsPanel

  const fetchRoleDefinitions = useCallback(
    async (roleId: string): Promise<GrantedPermissions> => {
      if (POWERSYNC_ENABLED) {
        const { db } = await import('@/lib/db');
        const rows = await db.getAll<{ resource_code: string; granted_actions: string }>(
          `SELECT resource_code, granted_actions FROM sys_role_definitions WHERE role_id = ?`,
          [roleId],
        );
        const perms: GrantedPermissions = {};
        for (const row of rows) {
          try {
            perms[row.resource_code] = JSON.parse(row.granted_actions);
          } catch {
            perms[row.resource_code] = [];
          }
        }
        return perms;
      } else {
        const data = await withSessionRetry(async () => {
          const response = await supabase
            .from('sys_role_definitions')
            .select('resource_code, granted_actions')
            .eq('role_id', roleId);

          if (response.error) throw response.error;
          return response.data ?? [];
        }, 'useUsers.fetchRoleDefinitions');

        const perms: GrantedPermissions = {};
        for (const row of data) {
          perms[row.resource_code] = row.granted_actions ?? [];
        }
        return perms;
      }
    },
    [],
  );

  // ── Fetch user's custom permissions ──────────────────────
  // Used when editing a user with is_role_synced = false

  const fetchUserPermissions = useCallback(
    async (userId: string): Promise<GrantedPermissions> => {
      const data = await withSessionRetry(async () => {
        const response = await supabase
          .from('sys_user_permissions')
          .select('resource_code, granted_actions')
          .eq('user_id', userId);

        if (response.error) throw response.error;
        return response.data ?? [];
      }, 'useUsers.fetchUserPermissions');

      const perms: GrantedPermissions = {};
      for (const row of data) {
        perms[row.resource_code] = row.granted_actions ?? [];
      }
      return perms;
    },
    [],
  );

  // ── Upsert custom permissions for a user ─────────────────

  const upsertUserPermissions = useCallback(
    async (userId: string, teamId: string, permissions: GrantedPermissions) => {
      // 1. Delete all existing permissions for this user
      const { error: deleteError } = await supabase
        .from('sys_user_permissions')
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        console.error('[useUsers] Error deleting old permissions:', deleteError);
        throw new Error('Error al limpiar permisos anteriores: ' + deleteError.message);
      }

      // 2. Insert new permissions
      const rows = Object.entries(permissions)
        .filter(([, actions]) => actions.length > 0)
        .map(([resourceCode, actions]) => ({
          user_id: userId,
          team_id: teamId,
          resource_code: resourceCode,
          granted_actions: actions,
          is_customized: true,
        }));

      if (rows.length > 0) {
        const { error: insertError } = await supabase
          .from('sys_user_permissions')
          .insert(rows);

        if (insertError) {
          console.error('[useUsers] Error inserting permissions:', insertError);
          throw new Error('Error al guardar permisos: ' + insertError.message);
        }
      }
    },
    [],
  );

  // ── Project assignments (sys_project_access) ─────────────

  const fetchProjectsForAssignment = useCallback(async (): Promise<ProjectOption[]> => {
    const data = await withSessionRetry(async () => {
      const response = await supabase
        .from('projects')
        .select('id, name, code')
        .eq('status', 'active')
        .order('name');

      if (response.error) throw response.error;
      return response.data ?? [];
    }, 'useUsers.fetchProjectsForAssignment');

    return data as ProjectOption[];
  }, []);

  const fetchUserProjectAssignments = useCallback(async (userId: string): Promise<string[]> => {
    const data = await withSessionRetry(async () => {
      const response = await supabase
        .from('sys_project_access')
        .select('project_id')
        .eq('user_id', userId);

      if (response.error) throw response.error;
      return response.data ?? [];
    }, 'useUsers.fetchUserProjectAssignments');

    return data.map((row: any) => row.project_id as string);
  }, []);

  const syncUserProjectAssignments = useCallback(
    async (userId: string, teamId: string, projectIds: string[] | undefined) => {
      if (!projectIds) return;

      const { error: deleteError } = await supabase
        .from('sys_project_access')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      const uniqueProjectIds = Array.from(new Set(projectIds));
      if (!uniqueProjectIds.length) return;

      const rows = uniqueProjectIds.map((projectId) => ({
        user_id: userId,
        project_id: projectId,
        team_id: teamId,
      }));

      const { error: insertError } = await supabase
        .from('sys_project_access')
        .insert(rows);

      if (insertError) throw insertError;
    },
    [],
  );

  // ── Create user ──────────────────────────────────────────
  // 1. Call Edge Function to create auth user (also triggers reset password email)
  // 2. Insert profile row from frontend
  // 3. Return result

  const createUser = useCallback(
    async (payload: UserCreatePayload): Promise<CreateUserResult> => {
      // Step 1: Create auth user via Edge Function
      // The Edge Function generates an internal password and sends a
      // "reset password" email via Supabase Auth so the user sets their own.
      const { data: authData, error: authError } = await supabase.functions.invoke(
        'create-auth-user',
        {
          body: {
            email: payload.email,
            full_name: payload.full_name,
            redirectTo: `${window.location.origin}/auth/reset-password`,
          },
        },
      );

      if (authError) {
        // supabase-js wraps non-2xx as FunctionsHttpError with a generic message.
        // The real error body is in authError.context (a Response object).
        let detail = authData?.error || authError.message;
        try {
          const response = (authError as any).context as Response | undefined;
          if (response) {
            const body = await response.json();
            detail = body?.error || body?.message || detail;
            console.error('[useUsers] Edge Function response body:', body);
          }
        } catch {
          // context wasn't a parseable response, use default message
        }
        console.error('[useUsers] Edge Function error:', { authError, authData, detail });
        throw new Error(detail ?? 'Error al crear usuario en auth.');
      }

      if (authData?.error) {
        throw new Error(authData.error);
      }

      if (!authData?.user?.id) {
        console.error('[useUsers] Unexpected response:', authData);
        throw new Error('Respuesta inesperada de la Edge Function. Revisa la consola.');
      }

      const newUserId: string = authData.user.id;

      // Step 2: Get caller's team_id (new user belongs to the same team)
      const { data: callerProfile, error: callerError } = await supabase
        .from('profiles')
        .select('team_id')
        .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .single();

      if (callerError || !callerProfile) {
        throw new Error('No se pudo obtener tu equipo. ¿Tu perfil está configurado?');
      }

      // Step 3: Insert profile row
      const { error: profileError } = await supabase.from('profiles').insert({
        id: newUserId,
        email: payload.email,
        full_name: payload.full_name,
        team_id: callerProfile.team_id,
        role_id: payload.role_id,
        access_level: payload.access_level,
        job_title: payload.job_title || null,
        phone: payload.phone || null,
        is_role_synced: payload.is_role_synced,
        profile_status: 'active',
      });

      if (profileError) {
        console.error('[useUsers] Profile insert error:', profileError);
        throw new Error(
          'Usuario creado en auth pero falló al crear el perfil: ' + profileError.message,
        );
      }

      // Step 4: If custom permissions (not synced), insert them manually
      if (!payload.is_role_synced && payload.customPermissions) {
        await upsertUserPermissions(newUserId, callerProfile.team_id, payload.customPermissions);
      }

      // Step 5: Project assignments
      await syncUserProjectAssignments(newUserId, callerProfile.team_id, payload.project_ids);

      // Step 6: Refresh list
      await fetchUsers();

      return {
        userId: newUserId,
        email: payload.email,
      };
    },
    [fetchUsers, syncUserProjectAssignments, upsertUserPermissions],
  );

  // ── Update user profile ──────────────────────────────────
  // Writes directly to profiles table (no Edge Function needed)

  const updateUser = useCallback(
    async (userId: string, payload: UserUpdatePayload) => {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: payload.full_name,
          role_id: payload.role_id,
          access_level: payload.access_level,
          job_title: payload.job_title || null,
          phone: payload.phone || null,
          is_role_synced: payload.is_role_synced,
        })
        .eq('id', userId);

      if (updateError) throw updateError;

      // If custom permissions, upsert them; if synced, the trigger handles it
      if (!payload.is_role_synced && payload.customPermissions) {
        const userProfile = users.find((u) => u.id === userId);
        if (userProfile) {
          await upsertUserPermissions(userId, userProfile.team_id, payload.customPermissions);
        }
      }

      const userProfile = users.find((u) => u.id === userId);
      if (userProfile) {
        await syncUserProjectAssignments(userId, userProfile.team_id, payload.project_ids);
      }

      await fetchUsers();
    },
    [fetchUsers, syncUserProjectAssignments, upsertUserPermissions, users],
  );

  // ── Toggle status (active ↔ suspended) ──────────────────

  const toggleUserStatus = useCallback(
    async (userId: string) => {
      // Get current status first
      const currentUser = users.find((u) => u.id === userId);
      if (!currentUser) throw new Error('Usuario no encontrado');

      const newStatus = currentUser.profile_status === 'active' ? 'suspended' : 'active';

      const { error: statusError } = await supabase
        .from('profiles')
        .update({ profile_status: newStatus })
        .eq('id', userId);

      if (statusError) throw statusError;

      await fetchUsers();
    },
    [users, fetchUsers],
  );

  // ── Delete user ──────────────────────────────────────────
  // Soft delete: marks as deleted in profiles

  const deleteUser = useCallback(
    async (userId: string) => {
      const { error: deleteError } = await supabase
        .from('profiles')
        .update({
          status: 'deleted',
          deleted_at: new Date().toISOString(),
          profile_status: 'suspended',
        })
        .eq('id', userId);

      if (deleteError) throw deleteError;

      await fetchUsers();
    },
    [fetchUsers],
  );

  return {
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
    fetchProjectsForAssignment,
    fetchUserProjectAssignments,
    refetch: fetchUsers,
  };
}
