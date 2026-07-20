import { useEffect, useState } from 'react';
import { useMatch } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { withSessionRetry } from '@/lib/auth/sessionRetry';
import { useAuth } from '@/features/auth/hooks/useAuth';

const STORAGE_KEY = 'pragmata_last_entity_id';

/**
 * Resolves the "active entity" for the Workspace section using a priority chain:
 *  1. URL params  (/workspace/:entityId/*)  — source of truth when inside workspace
 *  2. localStorage  (last entity the user visited)
 *  3. First entity alphabetically fetched from Supabase
 *  4. null — no entities exist yet
 *
 * Re-runs on sessionEpoch changes so it always reflects the auth state.
 * The hook also keeps localStorage in sync whenever the URL provides an entityId.
 */
export function useActiveEntity(): string | null {
  const { isAuthenticated, sessionEpoch } = useAuth();
  const workspaceMatch = useMatch('/workspace/:entityId/*');
  const urlEntityId = workspaceMatch?.params?.entityId ?? null;

  const [resolvedId, setResolvedId] = useState<string | null>(() => {
    return urlEntityId ?? localStorage.getItem(STORAGE_KEY);
  });

  useEffect(() => {
    if (urlEntityId) {
      localStorage.setItem(STORAGE_KEY, urlEntityId);
      setResolvedId(urlEntityId);
      return;
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setResolvedId(stored);
      return;
    }

    // Only fetch from DB once the user is authenticated
    if (!isAuthenticated) return;

    // withSessionRetry: justo tras el login hay una ventana en la que
    // isAuthenticated ya es true pero el token aún no valida en PostgREST (401
    // transitorio). Se reintenta una vez tras refrescar sesión. Si aun así falla,
    // NO se toca el estado — se conserva el id guardado y se espera el re-fetch
    // que dispara sessionEpoch.
    let cancelled = false;
    void withSessionRetry(async () => {
      const { data, error } = await supabase
        .from('entities')
        .select('id')
        .eq('status', 'active')
        .order('name', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    }, 'useActiveEntity')
      .then((data) => {
        if (cancelled || !data?.id) return;
        localStorage.setItem(STORAGE_KEY, data.id);
        setResolvedId(data.id);
      })
      .catch(() => { /* transitorio: se conserva el estado actual */ });

    return () => { cancelled = true; };
  // sessionEpoch ensures we re-run after token refresh or sign-in
  }, [urlEntityId, isAuthenticated, sessionEpoch]);

  return resolvedId;
}
