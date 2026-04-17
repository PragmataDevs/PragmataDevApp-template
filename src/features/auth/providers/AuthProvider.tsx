import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
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
  permissions: UserPermissionsMap;
  loading: boolean;
  isAuthenticated: boolean;
  /** Re-fetch the profile from the database (e.g. after avatar update) */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<UserPermissionsMap>({});
  const [loading, setLoading] = useState(true);
  const fetchingProfileRef = useRef(false);

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
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('[AuthProvider] Error fetching profile - RLS or Schema issue?', error);
        return;
      }

      const nextPermissions = await fetchPermissions(userId);
      console.log('[AuthProvider] Profile loaded:', data);
      setProfile(data as Profile);
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

  useEffect(() => {
    let mounted = true;
    console.log('[AuthProvider] Mounting...');

    const initAuth = async () => {
      // 1. Get initial session
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) console.error('[AuthProvider] getSession error:', error);
        
        const currentUser = session?.user ?? null;
        console.log('[AuthProvider] Initial Session User:', currentUser?.id);
        setUser(currentUser);
        
        if (currentUser) {
          await fetchProfile(currentUser.id);
        }
      } catch (e) {
        console.error('[AuthProvider] Init Error:', e);
      } finally {
        if (mounted) {
           console.log('[AuthProvider] Setting loading = false');
           setLoading(false);
        }
      }
    };

    initAuth();

    // 2. Listen for changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthProvider] Auth Event:', event);
      if (!mounted) return;

      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      if (currentUser) {
        await fetchProfile(currentUser.id);

        // Handle PASSWORD_RECOVERY: redirect to reset-password page
        if (event === 'PASSWORD_RECOVERY') {
          console.log('[AuthProvider] PASSWORD_RECOVERY event, redirecting to /auth/reset-password');
          window.location.replace('/auth/reset-password');
          return;
        }

        // OAuth redirect: if user just signed in and we're on a public page,
        // navigate to /dashboard. This handles the case where Supabase
        // processes the OAuth hash before the CallbackPage mounts.
        if (event === 'SIGNED_IN') {
          const currentPath = window.location.pathname;
          if (PUBLIC_PATHS.includes(currentPath) && !NO_REDIRECT_PATHS.includes(currentPath)) {
            console.log('[AuthProvider] OAuth sign-in detected on public path, redirecting to /dashboard');
            window.location.replace('/dashboard');
          }
        }
      } else {
        setProfile(null);
        setPermissions({});
      }
      setLoading(false);
    });

    return () => {
      console.log('[AuthProvider] Unmounting');
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const value = {
    user,
    profile,
    permissions,
    loading,
    isAuthenticated: !!user,
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
