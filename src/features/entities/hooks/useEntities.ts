import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { uploadFile, CHAT_IMAGE_PRESET } from '@/lib/storage';
import { withSessionRetry } from '@/lib/auth/sessionRetry';
import { errorMessage } from '@/lib/errors';
import type { Entity } from '@/features/entities/types/entity';
import { ENTITY_STATUS_CONFIG } from '@/features/entities/types/entity';

const POWERSYNC_ENABLED = import.meta.env.VITE_ENABLE_POWERSYNC === 'true';

// ─── Types ───────────────────────────────────────────────────

export type EntityRow = Entity;

export interface EntityMember {
  id:         string; // sys_entity_access.id
  user_id:    string;
  entity_id:  string;
  created_at: string;
  // Joined
  full_name:  string | null;
  email:      string;
  avatar_url: string | null;
  role_name:  string;
}

export interface EntityWithMembers extends EntityRow {
  member_count: number;
}

/**
 * Fila cruda de `sys_entity_access` con el doble embed del select de
 * `fetchEntityMembers` (`profiles(... sys_roles(name))`). PostgREST la entrega
 * anidada; el hook la aplana a `EntityMember`. Los embeds son nullables porque
 * el perfil o el rol pueden no existir (o quedar fuera por RLS).
 */
type EntityAccessRowWithProfile = Pick<EntityMember, 'id' | 'user_id' | 'entity_id' | 'created_at'> & {
  profiles: {
    full_name:  string | null;
    email:      string | null;
    avatar_url: string | null;
    role_id:    string | null;
    sys_roles:  { name: string } | null;
  } | null;
};

export interface EntityImageAsset {
  path:        string;
  file_name:   string;
  mime_type:   string;
  size:        number;
  uploaded_at: string;
}

/** Input form for create/update — derived from Entity fields */
export type EntityInput = Pick<Entity, 'name' | 'entity_status'> &
  Partial<Pick<Entity, 'code' | 'description' | 'location' | 'budget' | 'start_date' | 'end_date'>> & {
    images?: File[];
  };

export { ENTITY_STATUS_CONFIG };

// ─── Hook ────────────────────────────────────────────────────

export function useEntities() {
  const { profile, loading: authLoading, isAuthenticated, sessionEpoch } = useAuth();
  const [entities, setEntities] = useState<EntityWithMembers[]>([]);
  const [totalEntityCount, setTotalEntityCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch entities ─────────────────────────────────────

  const fetchEntities = useCallback(async () => {
    if (authLoading) return;
    if (!isAuthenticated || !profile) {
      setEntities([]);
      setTotalEntityCount(0);
      setError(null);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);

    try {
      let entitiesData: Entity[] = [];

      if (POWERSYNC_ENABLED) {
        const { db } = await import('@/lib/db');

        const countRows = await db.getAll<{ count: number }>(
          `SELECT COUNT(*) as count FROM entities WHERE team_id = ?`,
          [profile.team_id],
        );
        if (ac.signal.aborted) return;
        setTotalEntityCount(countRows[0]?.count ?? 0);

        entitiesData = await db.getAll<Entity>(
          `SELECT * FROM entities WHERE status = 'active' ORDER BY updated_at DESC`,
        );
      } else {
        const { count, data } = await withSessionRetry(async () => {
          const countResponse = await supabase
            .from('entities')
            .select('*', { count: 'exact', head: true })
            .eq('team_id', profile.team_id);

          if (countResponse.error) throw countResponse.error;

          const entitiesResponse = await supabase
            .from('entities')
            .select('*')
            .eq('status', 'active')
            .order('updated_at', { ascending: false });

          if (entitiesResponse.error) throw entitiesResponse.error;

          return {
            count: countResponse.count,
            data: entitiesResponse.data ?? [],
          };
        }, 'useEntities.fetchEntities');

        if (ac.signal.aborted) return;

        setTotalEntityCount(count ?? 0);
        entitiesData = data;
      }

      // Get member counts via sys_entity_access
      const entityIds = (entitiesData || []).map((e) => e.id);
      const memberCounts: Record<string, number> = {};

      if (entityIds.length > 0) {
        if (POWERSYNC_ENABLED) {
          const { db } = await import('@/lib/db');
          const placeholders = entityIds.map(() => '?').join(',');
          const accessRows = await db.getAll<{ entity_id: string }>(
            `SELECT entity_id FROM sys_entity_access WHERE entity_id IN (${placeholders})`,
            entityIds,
          );

          for (const row of accessRows || []) {
            memberCounts[row.entity_id] = (memberCounts[row.entity_id] || 0) + 1;
          }
        } else {
          const accessData = await withSessionRetry(async () => {
            const response = await supabase
              .from('sys_entity_access')
              .select('entity_id')
              .in('entity_id', entityIds);

            if (response.error) throw response.error;
            return response.data ?? [];
          }, 'useEntities.fetchEntityAccess');

          for (const row of accessData) {
            memberCounts[row.entity_id] = (memberCounts[row.entity_id] || 0) + 1;
          }
        }
      }

      const enriched: EntityWithMembers[] = (entitiesData || []).map((e) => ({
        ...e,
        member_count: memberCounts[e.id] || 0,
      }));

      setEntities(enriched);
    } catch (err: unknown) {
      if (ac.signal.aborted) return;
      const message = errorMessage(err, 'Error al cargar las entidades');
      console.error('Error fetching entities:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated, profile]);

  // ── Create entity ─────────────────────────────────────

  const uploadEntityImages = useCallback(async (entityId: string, files: File[]): Promise<EntityImageAsset[]> => {
    if (!files.length) return [];

    const uploads = files.map(async (file, index) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
      const safeBase = file.name
        .replace(/\.[^.]+$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      const storagePath = `entities/${entityId}/${Date.now()}-${index}-${safeBase || 'image'}.${ext}`;

      const result = await uploadFile('attachments', storagePath, file, {
        optimize: CHAT_IMAGE_PRESET,
      });

      return {
        path:        result.storagePath,
        file_name:   file.name,
        mime_type:   file.type,
        size:        file.size,
        uploaded_at: new Date().toISOString(),
      };
    });

    return Promise.all(uploads);
  }, []);

  const createEntity = useCallback(
    async (data: EntityInput) => {
      if (!profile) throw new Error('No profile');

      const { data: entity, error: insertErr } = await supabase
        .from('entities')
        .insert({
          team_id:       profile.team_id,
          name:          data.name,
          code:          data.code || null,
          description:   data.description || null,
          location:      data.location || null,
          budget:        data.budget || null,
          start_date:    data.start_date || null,
          end_date:      data.end_date || null,
          entity_status: data.entity_status || 'planning',
          created_by:    profile.id,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      if (data.images && data.images.length > 0) {
        const uploadedImages = await uploadEntityImages(entity.id, data.images);
        const metadata = { ...(entity.metadata || {}), images: uploadedImages };

        const { error: metadataErr } = await supabase
          .from('entities')
          .update({ metadata })
          .eq('id', entity.id);

        if (metadataErr) throw metadataErr;
      }

      // Auto-add creator to entity access
      const { error: accessErr } = await supabase
        .from('sys_entity_access')
        .insert({
          user_id:   profile.id,
          entity_id: entity.id,
          team_id:   profile.team_id,
        });

      if (accessErr) console.error('Error adding creator access:', accessErr.message);

      await fetchEntities();
      toast.success('Entidad creada exitosamente');
      return entity;
    },
    [profile, fetchEntities, uploadEntityImages]
  );

  // ── Update entity ─────────────────────────────────────

  const updateEntity = useCallback(
    async (entityId: string, data: EntityInput) => {
      let nextMetadata: Record<string, unknown> | undefined;

      if (data.images && data.images.length > 0) {
        const { data: existing, error: existingErr } = await supabase
          .from('entities')
          .select('metadata')
          .eq('id', entityId)
          .single();

        if (existingErr) throw existingErr;

        const uploadedImages = await uploadEntityImages(entityId, data.images);
        const currentImages = Array.isArray(existing?.metadata?.images) ? existing.metadata.images : [];

        nextMetadata = {
          ...(existing?.metadata || {}),
          images: [...currentImages, ...uploadedImages],
        };
      }

      const { error } = await supabase
        .from('entities')
        .update({
          name:          data.name,
          code:          data.code || null,
          description:   data.description || null,
          location:      data.location || null,
          budget:        data.budget || null,
          start_date:    data.start_date || null,
          end_date:      data.end_date || null,
          entity_status: data.entity_status,
          ...(nextMetadata ? { metadata: nextMetadata } : {}),
          updated_at:    new Date().toISOString(),
        })
        .eq('id', entityId);

      if (error) throw error;
      await fetchEntities();
      toast.success('Entidad actualizada exitosamente');
    },
    [fetchEntities, uploadEntityImages]
  );

  // ── Archive entity (soft delete) ──────────────────────

  const archiveEntity = useCallback(
    async (entityId: string) => {
      const { error } = await supabase
        .from('entities')
        .update({ status: 'deleted', deleted_at: new Date().toISOString() })
        .eq('id', entityId);

      if (error) throw error;
      await fetchEntities();
      toast.success('Entidad archivada exitosamente');
    },
    [fetchEntities]
  );

  // ── Fetch entity members ──────────────────────────────

  const fetchEntityMembers = useCallback(async (entityId: string): Promise<EntityMember[]> => {
    const data = await withSessionRetry(async () => {
      const response = await supabase
        .from('sys_entity_access')
        .select(`
          id,
          user_id,
          entity_id,
          created_at,
          profiles!sys_entity_access_user_id_fkey(full_name, email, avatar_url, role_id, sys_roles!profiles_role_id_fkey(name))
        `)
        .eq('entity_id', entityId);

      if (response.error) throw response.error;
      return response.data ?? [];
    }, 'useEntities.fetchEntityMembers');

    return (data as unknown as EntityAccessRowWithProfile[]).map((row) => ({
      id:         row.id,
      user_id:    row.user_id,
      entity_id:  row.entity_id,
      created_at: row.created_at,
      // `?? null` y no a secas: sin el embed (perfil borrado o filtrado por RLS)
      // el optional chaining da `undefined`, y `EntityMember` promete `| null`.
      full_name:  row.profiles?.full_name ?? null,
      email:      row.profiles?.email || '',
      avatar_url: row.profiles?.avatar_url ?? null,
      role_name:  row.profiles?.sys_roles?.name || 'Sin rol',
    }));
  }, []);

  // ── Add / Remove member ────────────────────────────────

  const addEntityMember = useCallback(
    async (entityId: string, userId: string) => {
      if (!profile) throw new Error('No profile');

      const { error } = await supabase
        .from('sys_entity_access')
        .insert({
          user_id:   userId,
          entity_id: entityId,
          team_id:   profile.team_id,
        });

      if (error) throw error;
      toast.success('Miembro agregado exitosamente');
    },
    [profile]
  );

  const removeEntityMember = useCallback(
    async (entityId: string, userId: string) => {
      const { error } = await supabase
        .from('sys_entity_access')
        .delete()
        .eq('entity_id', entityId)
        .eq('user_id', userId);

      if (error) throw error;
      toast.success('Acceso revocado exitosamente');
    },
    []
  );

  // ── Initial load ───────────────────────────────────────

  useEffect(() => {
    if (authLoading) return;
    fetchEntities();
    return () => { abortRef.current?.abort(); };
  }, [authLoading, isAuthenticated, fetchEntities, sessionEpoch]);

  return {
    entities,
    totalEntityCount,
    loading,
    error,
    fetchEntities,
    createEntity,
    updateEntity,
    archiveEntity,
    fetchEntityMembers,
    addEntityMember,
    removeEntityMember,
  };
}
