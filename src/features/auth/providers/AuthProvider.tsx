import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { isGodUser } from '@/lib/auth/isGodUser';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '@/types/users/profile';

/** Permissions map: resource_code → granted_actions[] */
export type UserPermissionsMap = Record<string, string[]>;

/** Pages where we should redirect to /dashboard after OAuth sign in */
const PUBLIC_PATHS = ['/', '/login', '/auth/callback'];

/** Pages that should NOT redirect on auth events */
const NO_REDIRECT_PATHS = ['/auth/reset-password'];

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  /** Equipo del perfil: `teams.is_platform_owner` (requerido para usuario dios). */
  teamIsPlatformOwner: boolean | null;
  /** `access_level === 'god'` y equipo platform owner — alineado con `public.is_god()`. */
  isGod: boolean;
  permissions: UserPermissionsMap;
  loading: boolean;
  isAuthenticated: boolean;
  /**
   * Monotonic counter that increments every time the session is (re)hydrated.
   * Data hooks should include it in their initial-fetch `useEffect` deps so
   * they refetch after `TOKEN_REFRESHED`, wake-from-idle, etc.
   */
  sessionEpoch: number;
  /** Re-fetch the profile from the database (e.g. after avatar update) */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teamIsPlatformOwner, setTeamIsPlatformOwner] = useState<boolean | null>(null);
  const [permissions, setPermissions] = useState<UserPermissionsMap>({});
  // loading stays true until BOTH session AND profile are resolved.
  // This prevents the RouteGuard / useCrudResource flash where loading=false
  // but profile=null causes hasPermission to return false for every resource.
  const [loading, setLoading] = useState(true);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const fetchingProfileRef = useRef(false);
  const lastProfileUserIdRef = useRef<string | null>(null);

  const bumpSessionEpoch = () => setSessionEpoch((prev) => prev + 1);

  const fetchPermissions = async (userId: string): Promise<UserPermissionsMap> => {
    try {
      const { data, error } = await supabase
        .from('sys_user_permissions')
        .select('resource_code, granted_actions')
        .eq('user_id', userId);

      if (error) {
        console.error('[AuthProvider] Error fetching permissions:', error);
        return {};
      }

      const permMap: UserPermissionsMap = {};
      for (const row of data ?? []) {
        permMap[row.resource_code] = row.granted_actions ?? [];
      }
      console.log('[AuthProvider] Permissions loaded:', Object.keys(permMap).length, 'resources');
      return permMap;
    } catch (err) {
      console.error('[AuthProvider] Unexpected error fetching permissions:', err);
      return {};
    }
  };

  const fetchProfile = async (userId: string) => {
    if (fetchingProfileRef.current) {
      console.warn('[AuthProvider] fetchProfile skipped. Another request is already in progress.');
      return;
    }

    fetchingProfileRef.current = true;
    console.log('[AuthProvider] Fetching profile for:', userId);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, team:teams(is_platform_owner)')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('[AuthProvider] Error fetching profile - RLS or Schema issue?', error);
        return;
      }

      const row = data as Profile & {
        team?: { is_platform_owner: boolean } | null;
      };
      const { team, ...profileRow } = row;

      const nextPermissions = await fetchPermissions(userId);
      console.log('[AuthProvider] Profile loaded:', profileRow);
      setProfile(profileRow as Profile);
      setTeamIsPlatformOwner(team?.is_platform_owner ?? null);
      setPermissions(nextPermissions);
    } catch (err: any) {
      if (err?.name === 'AbortError' || /aborted/i.test(err?.message || '')) {
        console.warn('[AuthProvider] fetchProfile aborted, ignoring.');
        return;
      }

      console.error('[AuthProvider] Unexpected error fetching profile:', err);
    } finally {
      fetchingProfileRef.current = false;
    }
  };

  // ── Bootstrap + auth subscription ──
  // IMPORTANT: `onAuthStateChange` callback MUST stay synchronous. Awaiting
  // any `supabase.from(...)` query or `supabase.auth.refreshSession()` inside
  // it deadlocks against `navigator.locks`. Profile loading happens in a
  // separate effect that watches `user?.id`.
  useEffect(() => {
    let mounted = true;
    console.log('[AuthProvider] Mounting...');

    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) console.error('[AuthProvider] getSession error:', error);

        const currentUser = session?.user ?? null;
        console.log('[AuthProvider] Initial Session User:', currentUser?.id);
        if (mounted) {
          setUser(currentUser);
          // No user → fully done loading now.
          // User exists → keep loading=true; the profile effect will call
          // setLoading(false) once profile + permissions are ready.
          // This prevents the flash where loading=false but profile=null
          // causes hasPermission to return false for every resource.
          if (!currentUser) {
            setLoading(false);
          }
        }
      } catch (e) {
        console.error('[AuthProvider] Init Error:', e);
        if (mounted) setLoading(false);
      }
    };

    void initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthProvider] Auth Event:', event);
      if (!mounted) return;

      const currentUser = session?.user ?? null;
      setUser(currentUser);

      // TOKEN_REFRESHED: do NOT re-fetch profile, just signal data hooks.
      if (event === 'TOKEN_REFRESHED' && currentUser) {
        bumpSessionEpoch();
        return;
      }

      if (!currentUser) {
        setProfile(null);
        setTeamIsPlatformOwner(null);
        setPermissions({});
        lastProfileUserIdRef.current = null;
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        queueMicrotask(() => window.location.replace('/auth/reset-password'));
        return;
      }

      if (event === 'SIGNED_IN') {
        const currentPath = window.location.pathname;
        if (PUBLIC_PATHS.includes(currentPath) && !NO_REDIRECT_PATHS.includes(currentPath)) {
          console.log('[AuthProvider] OAuth sign-in detected on public path, redirecting to /dashboard');
          queueMicrotask(() => window.location.replace('/dashboard'));
        }
      }
    });

    return () => {
      console.log('[AuthProvider] Unmounting');
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ── Profile + permissions: runs OUTSIDE the auth lock callback ──
  useEffect(() => {
    const userId = user?.id ?? null;
    if (!userId) return;

    if (lastProfileUserIdRef.current === userId) {
      // Profile already loaded from a prior run (React StrictMode remount).
      // Profile is in state, just ensure loading is cleared so consumers unblock.
      setLoading(false);
      return;
    }

    lastProfileUserIdRef.current = userId;

    void (async () => {
      await fetchProfile(userId);
      bumpSessionEpoch();
      // Only after profile + permissions are fully loaded do we unlock.
      // This is the single authoritative place for authenticated users.
      setLoading(false);
    })();
  }, [user?.id]);

  // ── Revalidate on tab visibility / network reconnection ──
  useEffect(() => {
    const maybeRevalidate = async () => {
      if (!user) return;
      try {
        // Force the auth client to surface a fresh JWT before any refetch.
        await supabase.auth.getSession();
        bumpSessionEpoch();
      } catch (err) {
        console.warn('[AuthProvider] Revalidation skipped:', err);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void maybeRevalidate();
    };
    const onOnline = () => void maybeRevalidate();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [user]);

  const refreshProfile = async () => {
    if (!user) return;
    // Force a fresh fetch even if the cached id matches.
    lastProfileUserIdRef.current = null;
    await fetchProfile(user.id);
    bumpSessionEpoch();
    lastProfileUserIdRef.current = user.id;
  };

  const isGod = useMemo(
    () => isGodUser(profile, teamIsPlatformOwner),
    [profile, teamIsPlatformOwner],
  );

  const value = {
    user,
    profile,
    teamIsPlatformOwner,
    isGod,
    permissions,
    loading,
    isAuthenticated: !!user,
    sessionEpoch,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
