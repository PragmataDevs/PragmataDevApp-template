/**
 * useCrudResource — Generic Supabase CRUD Hook
 *
 * Drop-in foundation for any ERP list module. Provides:
 *   - Authenticated fetch with sessionEpoch re-trigger
 *   - Optional real-time subscription via postgres_changes
 *   - upsert (insert when no id, update when id present) — { onConflict: 'id' }
 *   - softDelete with Optimistic Concurrency Control (version field)
 *   - withSessionRetry for resilience against stale JWT errors
 *
 * Usage:
 *   const { data, loading, error, upsert, softDelete, refetch } =
 *     useCrudResource<Cliente>({
 *       table: 'clientes',
 *       select: '*, entity:entities(name)',
 *       filter: (q) => q.eq('entity_id', entityId).eq('status', 'active'),
 *       orderBy: { column: 'name', ascending: true },
 *       realtime: true,  // default; requiere migración 04 / supabase_realtime
 *     });
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { withSessionRetry } from '@/lib/auth/sessionRetry';


// ─── Types ───────────────────────────────────────────────────────────────────

/** Any record that supports AuditBase — id, status, version, deleted_at */
export interface AuditRecord {
  id: string;
  version: number;
  status?: string;
}

/**
 * La cadena de PostgREST que recibe un `filter`.
 *
 * Se **deriva del propio cliente** (`ReturnType<...>`) en vez de importar
 * `PostgrestFilterBuilder`: esa clase lleva 7 parámetros genéricos que cambian
 * entre minors de `@supabase/postgrest-js`, y fijarlos a mano es justo lo que
 * obligaba al `any` que había aquí. Derivándolo, el tipo se reajusta solo al
 * actualizar el paquete y el `.eq()/.in()/.gte()` del llamador sigue con
 * autocompletado.
 */
type QueryChain = ReturnType<ReturnType<typeof supabase.from>['select']>;

type FilterFn = (query: QueryChain) => QueryChain;

export interface UseCrudResourceOptions {
  /** Supabase table name */
  table: string;
  /** PostgREST select string (default: '*') */
  select?: string;
  /** Additional filter chain applied to every fetch */
  filter?: FilterFn;
  /** Default ordering */
  orderBy?: { column: string; ascending?: boolean };
  /**
   * Enable real-time subscription via postgres_changes.
   * The subscription refetches the full dataset on any change.
   * @default true
   */
  realtime?: boolean;
  /**
   * Server-side filter for the realtime subscription, as a PostgREST filter
   * string (e.g. `entity_id=eq.<uuid>`). Without it, Postgres pushes EVERY
   * row change of the table to this client, so an edit in another scope would
   * refetch this hook's full dataset. Scope it to the same key the `filter`
   * fn uses to avoid cross-scope refetch storms. Soft-deletes are UPDATEs, so
   * filtering by a non-PK column stays reliable (no DELETE replica-identity
   * caveat).
   */
  realtimeFilter?: string;
  /**
   * Skip fetching when false (e.g. a required foreign key is still undefined).
   * @default true
   */
  enabled?: boolean;
}

export interface UseCrudResourceReturn<T extends AuditRecord> {
  data: T[];
  loading: boolean;
  error: string | null;
  /**
   * Insert or update a record.
   *   - No `id` → INSERT
   *   - Has `id` → UPDATE via upsert({ onConflict: 'id' })
   *   - Automatically sets `updated_by` to the current user's id.
   */
  upsert: (record: Partial<T> & Record<string, unknown>) => Promise<T | null>;
  /**
   * Logical delete with Optimistic Concurrency Control.
   * Sets status='deleted' and deleted_at=now().
   * Passes version to detect mid-air conflicts (returns false on conflict).
   */
  softDelete: (id: string, version: number) => Promise<boolean>;
  /** Manually re-fetch (e.g. after a modal close). */
  refetch: () => Promise<void>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCrudResource<T extends AuditRecord>({
  table,
  select = '*',
  filter,
  orderBy,
  realtime = true,
  realtimeFilter,
  enabled = true,
}: UseCrudResourceOptions): UseCrudResourceReturn<T> {
  const { user, isAuthenticated, loading: authLoading, sessionEpoch } = useAuth();

  const [data, setData]       = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Keep latest filter/orderBy in refs so they never invalidate fetchData.
  // Inline arrow functions (e.g. filter={(q) => q.eq(...)}) are a new reference
  // on every render — putting them in deps would abort+restart the fetch on
  // every state change, creating an infinite loading loop.
  const filterRef  = useRef(filter);
  const orderByRef = useRef(orderBy);
  filterRef.current  = filter;
  orderByRef.current = orderBy;

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    // While auth is still bootstrapping (session + profile loading), stay in
    // loading state rather than flashing empty content then re-fetching.
    if (authLoading) return;

    if (!isAuthenticated || !enabled) {
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);

    try {
      const result = await withSessionRetry(async () => {
        let query: QueryChain = supabase.from(table).select(select);

        // Use refs so unstable inline functions don't re-trigger this effect.
        if (filterRef.current)  query = filterRef.current(query);
        if (orderByRef.current) query = query.order(orderByRef.current.column, {
          ascending: orderByRef.current.ascending ?? true,
        });

        const { data: rows, error: qErr } = await query;
        if (qErr) throw qErr;
        return rows as T[];
      }, `useCrudResource[${table}].fetch`);

      if (!ac.signal.aborted) {
        setData(result ?? []);
      }
    } catch (err: unknown) {
      if (!ac.signal.aborted) {
        const msg = err instanceof Error ? err.message : `Error al cargar ${table}`;
        setError(msg);
        console.error(`[useCrudResource:${table}]`, err);
      }
    } finally {
      if (!ac.signal.aborted) {
        setLoading(false);
      }
    }
  // filter and orderBy are intentionally excluded — they live in refs above.
  // (Ya no lleva `eslint-disable`: la regla dejó de reclamarlos al leerse por ref.)
  }, [authLoading, isAuthenticated, enabled, table, select]);

  // Initial fetch + re-fetch on auth change / token refresh
  useEffect(() => {
    void fetchData();
    return () => { abortRef.current?.abort(); };
  // sessionEpoch ensures we re-fetch after TOKEN_REFRESHED or wake-from-idle
  }, [fetchData, sessionEpoch]);

  // ── Real-time subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!realtime || !isAuthenticated || !enabled) return;

    const channel = supabase
      .channel(`crud:${table}:${realtimeFilter ?? 'all'}:${user?.id ?? 'anon'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          ...(realtimeFilter ? { filter: realtimeFilter } : {}),
        },
        () => { void fetchData(); }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [realtime, realtimeFilter, isAuthenticated, enabled, table, user?.id, fetchData]);

  // ── Upsert ───────────────────────────────────────────────────────────────
  const upsert = useCallback(async (
    record: Partial<T> & Record<string, unknown>
  ): Promise<T | null> => {
    if (!user?.id) return null;

    const payload = {
      ...record,
      updated_by: user.id,
      ...(record.id ? {} : { created_by: user.id }),
    };

    try {
      const { data: result, error: upsertErr } = await supabase
        .from(table)
        .upsert(payload, { onConflict: 'id' })
        .select(select)
        .single();

      if (upsertErr) throw upsertErr;

      const row = result as unknown as T;

      // Optimistic update: replace if exists, append if new
      setData(prev => {
        const exists = prev.some(r => r.id === row.id);
        return exists
          ? prev.map(r => r.id === row.id ? row : r)
          : [...prev, row];
      });

      toast.success(record.id ? 'Actualizado exitosamente' : 'Creado exitosamente');

      return row;
    } catch (err: unknown) {
      console.error(`[useCrudResource:${table}] upsert failed`, err);
      toast.error(`Error al guardar. Intenta de nuevo.`);
      return null;
    }
  }, [user, table, select]);

  // ── Soft delete ──────────────────────────────────────────────────────────
  const softDelete = useCallback(async (id: string, version: number): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const { data: result, error: delErr } = await supabase
        .from(table)
        .update({
          status:     'deleted',
          deleted_at: new Date().toISOString(),
          updated_by: user.id,
        })
        .eq('id', id)
        .eq('version', version)   // OCC: reject if someone else updated first
        .select('id')
        .single();

      if (delErr || !result) {
        if (!delErr) console.warn(`[useCrudResource:${table}] OCC conflict on softDelete ${id}`);
        else console.error(`[useCrudResource:${table}] softDelete failed`, delErr);
        return false;
      }

      // Remove from local state immediately (optimistic)
      setData(prev => prev.filter(r => r.id !== id));
      toast.success('Eliminado exitosamente');
      return true;
    } catch (err: unknown) {
      console.error(`[useCrudResource:${table}] softDelete error`, err);
      toast.error('Error al eliminar. Intenta de nuevo.');
      return false;
    }
  }, [user, table]);

  // ── Return ───────────────────────────────────────────────────────────────
  return { data, loading, error, upsert, softDelete, refetch: fetchData };
}
