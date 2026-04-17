import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { uploadFile, CHAT_IMAGE_PRESET } from '@/lib/storage';
import { withSessionRetry } from '@/lib/auth/sessionRetry';
import type { Project } from '@/types/projects/project';

const POWERSYNC_ENABLED = import.meta.env.VITE_ENABLE_POWERSYNC === 'true';

// ─── Types ───────────────────────────────────────────────────

export type ProjectRow = Project;

export interface ProjectMember {
  id: string; // sys_project_access.id
  user_id: string;
  project_id: string;
  created_at: string;
  // Joined
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role_name: string;
}

export interface ProjectWithMembers extends ProjectRow {
  member_count: number;
}

export interface ProjectImageAsset {
  path: string;
  file_name: string;
  mime_type: string;
  size: number;
  uploaded_at: string;
}

export interface ProjectCreatePayload {
  name: string;
  code?: string | null;
  description?: string | null;
  location?: string | null;
  budget?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  project_status?: ProjectRow['project_status'];
  images?: File[];
}

export type ProjectUpdatePayload = ProjectCreatePayload;

// ─── Status Config ───────────────────────────────────────────

export const PROJECT_STATUS_CONFIG: Record<
  ProjectRow['project_status'],
  { label: string; color: string; bgClass: string }
> = {
  planning: { label: 'Planificación', color: 'text-blue-600 dark:text-blue-400', bgClass: 'bg-blue-100 dark:bg-blue-900/30' },
  active: { label: 'Activo', color: 'text-emerald-600 dark:text-emerald-400', bgClass: 'bg-emerald-100 dark:bg-emerald-900/30' },
  completed: { label: 'Completado', color: 'text-gray-600 dark:text-gray-400', bgClass: 'bg-gray-100 dark:bg-gray-800' },
  paused: { label: 'Pausado', color: 'text-amber-600 dark:text-amber-400', bgClass: 'bg-amber-100 dark:bg-amber-900/30' },
  canceled: { label: 'Cancelado', color: 'text-red-600 dark:text-red-400', bgClass: 'bg-red-100 dark:bg-red-900/30' },
};

// ─── Hook ────────────────────────────────────────────────────

export function useProjects() {
  const { profile, loading: authLoading, isAuthenticated } = useAuth();
  const [projects, setProjects] = useState<ProjectWithMembers[]>([]);
  const [totalProjectCount, setTotalProjectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch projects ─────────────────────────────────────

  const fetchProjects = useCallback(async () => {
    if (authLoading) return;
    if (!isAuthenticated || !profile) {
      setProjects([]);
      setTotalProjectCount(0);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let projectsData: any[] = [];

      if (POWERSYNC_ENABLED) {
        const { db } = await import('@/lib/db');

        const countRows = await db.getAll<{ count: number }>(
          `SELECT COUNT(*) as count FROM projects WHERE team_id = ?`,
          [profile.team_id],
        );
        setTotalProjectCount(countRows[0]?.count ?? 0);

        projectsData = await db.getAll<any>(
          `SELECT * FROM projects WHERE status = 'active' ORDER BY updated_at DESC`,
        );
      } else {
        const { count, data } = await withSessionRetry(async () => {
          const countResponse = await supabase
            .from('projects')
            .select('*', { count: 'exact', head: true })
            .eq('team_id', profile.team_id);

          if (countResponse.error) throw countResponse.error;

          const projectsResponse = await supabase
            .from('projects')
            .select('*')
            .eq('status', 'active')
            .order('updated_at', { ascending: false });

          if (projectsResponse.error) throw projectsResponse.error;

          return {
            count: countResponse.count,
            data: projectsResponse.data ?? [],
          };
        }, 'useProjects.fetchProjects');

        setTotalProjectCount(count ?? 0);
        projectsData = data;
      }

      // Get member counts via sys_project_access
      const projectIds = (projectsData || []).map((p: any) => p.id);
      let memberCounts: Record<string, number> = {};

      if (projectIds.length > 0) {
        if (POWERSYNC_ENABLED) {
          const { db } = await import('@/lib/db');
          const placeholders = projectIds.map(() => '?').join(',');
          const accessRows = await db.getAll<{ project_id: string }>(
            `SELECT project_id FROM sys_project_access WHERE project_id IN (${placeholders})`,
            projectIds,
          );

          for (const row of accessRows || []) {
            memberCounts[row.project_id] = (memberCounts[row.project_id] || 0) + 1;
          }
        } else {
          const accessData = await withSessionRetry(async () => {
            const response = await supabase
              .from('sys_project_access')
              .select('project_id')
              .in('project_id', projectIds);

            if (response.error) throw response.error;
            return response.data ?? [];
          }, 'useProjects.fetchProjectsAccess');

          for (const row of accessData) {
            memberCounts[row.project_id] = (memberCounts[row.project_id] || 0) + 1;
          }
        }
      }

      const enriched: ProjectWithMembers[] = (projectsData || []).map((p: any) => ({
        ...p,
        member_count: memberCounts[p.id] || 0,
      }));

      setProjects(enriched);
    } catch (err: any) {
      console.error('Error fetching projects:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated, profile]);

  // ── Create project ─────────────────────────────────────

  const uploadProjectImages = useCallback(async (projectId: string, files: File[]): Promise<ProjectImageAsset[]> => {
    if (!files.length) return [];

    const uploads = files.map(async (file, index) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
      const safeBase = file.name
        .replace(/\.[^.]+$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      const storagePath = `projects/${projectId}/${Date.now()}-${index}-${safeBase || 'image'}.${ext}`;

      const result = await uploadFile('attachments', storagePath, file, {
        optimize: CHAT_IMAGE_PRESET,
      });

      return {
        path: result.storagePath,
        file_name: file.name,
        mime_type: file.type,
        size: file.size,
        uploaded_at: new Date().toISOString(),
      };
    });

    return Promise.all(uploads);
  }, []);

  const createProject = useCallback(
    async (data: ProjectCreatePayload) => {
      if (!profile) throw new Error('No profile');

      const { data: project, error: insertErr } = await supabase
        .from('projects')
        .insert({
          team_id: profile.team_id,
          name: data.name,
          code: data.code || null,
          description: data.description || null,
          location: data.location || null,
          budget: data.budget || null,
          start_date: data.start_date || null,
          end_date: data.end_date || null,
          project_status: data.project_status || 'planning',
          created_by: profile.id,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Upload images and save in metadata.images
      if (data.images && data.images.length > 0) {
        const uploadedImages = await uploadProjectImages(project.id, data.images);
        const metadata = {
          ...(project.metadata || {}),
          images: uploadedImages,
        };

        const { error: metadataErr } = await supabase
          .from('projects')
          .update({ metadata })
          .eq('id', project.id);

        if (metadataErr) throw metadataErr;
      }

      // Auto-add creator to project access
      const { error: accessErr } = await supabase
        .from('sys_project_access')
        .insert({
          user_id: profile.id,
          project_id: project.id,
          team_id: profile.team_id,
        });

      if (accessErr) console.error('Error adding creator access:', accessErr.message);

      await fetchProjects();
      return project;
    },
    [profile, fetchProjects, uploadProjectImages]
  );

  // ── Update project ─────────────────────────────────────

  const updateProject = useCallback(
    async (projectId: string, data: ProjectUpdatePayload) => {
      let nextMetadata: Record<string, any> | undefined;

      if (data.images && data.images.length > 0) {
        const { data: existingProject, error: existingErr } = await supabase
          .from('projects')
          .select('metadata')
          .eq('id', projectId)
          .single();

        if (existingErr) throw existingErr;

        const uploadedImages = await uploadProjectImages(projectId, data.images);
        const currentImages = Array.isArray(existingProject?.metadata?.images)
          ? existingProject.metadata.images
          : [];

        nextMetadata = {
          ...(existingProject?.metadata || {}),
          images: [...currentImages, ...uploadedImages],
        };
      }

      const { error } = await supabase
        .from('projects')
        .update({
          name: data.name,
          code: data.code || null,
          description: data.description || null,
          location: data.location || null,
          budget: data.budget || null,
          start_date: data.start_date || null,
          end_date: data.end_date || null,
          project_status: data.project_status,
          ...(nextMetadata ? { metadata: nextMetadata } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);

      if (error) throw error;
      await fetchProjects();
    },
    [fetchProjects, uploadProjectImages]
  );

  // ── Archive project (soft delete) ──────────────────────

  const archiveProject = useCallback(
    async (projectId: string) => {
      const { error } = await supabase
        .from('projects')
        .update({ status: 'deleted', deleted_at: new Date().toISOString() })
        .eq('id', projectId);

      if (error) throw error;
      await fetchProjects();
    },
    [fetchProjects]
  );

  // ── Fetch project members ──────────────────────────────

  const fetchProjectMembers = useCallback(async (projectId: string): Promise<ProjectMember[]> => {
    const data = await withSessionRetry(async () => {
      const response = await supabase
        .from('sys_project_access')
        .select(`
          id,
          user_id,
          project_id,
          created_at,
          profiles!sys_project_access_user_id_fkey(full_name, email, avatar_url, role_id, sys_roles(name))
        `)
        .eq('project_id', projectId);

      if (response.error) throw response.error;
      return response.data ?? [];
    }, 'useProjects.fetchProjectMembers');

    return data.map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      project_id: row.project_id,
      created_at: row.created_at,
      full_name: row.profiles?.full_name,
      email: row.profiles?.email || '',
      avatar_url: row.profiles?.avatar_url,
      role_name: row.profiles?.sys_roles?.name || 'Sin rol',
    }));
  }, []);

  // ── Add member ─────────────────────────────────────────

  const addProjectMember = useCallback(
    async (projectId: string, userId: string) => {
      if (!profile) throw new Error('No profile');

      const { error } = await supabase
        .from('sys_project_access')
        .insert({
          user_id: userId,
          project_id: projectId,
          team_id: profile.team_id,
        });

      if (error) throw error;
    },
    [profile]
  );

  // ── Remove member ──────────────────────────────────────

  const removeProjectMember = useCallback(
    async (projectId: string, userId: string) => {
      const { error } = await supabase
        .from('sys_project_access')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    []
  );

  // ── Initial load ───────────────────────────────────────

  useEffect(() => {
    if (authLoading) return;
    fetchProjects();
  }, [authLoading, isAuthenticated, fetchProjects]);

  return {
    projects,
    totalProjectCount,
    loading,
    error,
    fetchProjects,
    createProject,
    updateProject,
    archiveProject,
    fetchProjectMembers,
    addProjectMember,
    removeProjectMember,
  };
}
