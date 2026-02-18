import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';

export type ThemeOption = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: ThemeOption;
  /** The actually applied mode (resolved 'system' → 'light' or 'dark') */
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeOption) => Promise<void>;
  loading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** Detect OS preference */
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Apply or remove `.dark` class on <html> */
function applyThemeClass(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [theme, setThemeState] = useState<ThemeOption>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(getSystemTheme());
  const [loading, setLoading] = useState(true);

  // Resolve and apply theme
  const resolve = useCallback((t: ThemeOption) => {
    const resolved = t === 'system' ? getSystemTheme() : t;
    setResolvedTheme(resolved);
    applyThemeClass(resolved);
  }, []);

  // Load preference from Supabase when profile is available
  useEffect(() => {
    if (!profile) {
      // Not logged in — use system default
      resolve('system');
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase
          .from('sys_user_preferences')
          .select('theme')
          .eq('user_id', profile.id)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.error('[ThemeProvider] Error loading preferences:', error);
        }

        const savedTheme = (data?.theme as ThemeOption) ?? 'system';
        setThemeState(savedTheme);
        resolve(savedTheme);
      } catch (err) {
        console.error('[ThemeProvider] Unexpected error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [profile?.id, resolve]);

  // Listen for OS theme changes when theme is 'system'
  useEffect(() => {
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => resolve('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme, resolve]);

  // Save to Supabase and apply immediately
  const setTheme = useCallback(async (newTheme: ThemeOption) => {
    setThemeState(newTheme);
    resolve(newTheme);

    if (!profile) return;

    const { error } = await supabase
      .from('sys_user_preferences')
      .upsert(
        {
          user_id: profile.id,
          theme: newTheme,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (error) {
      console.error('[ThemeProvider] Error saving theme:', error);
    }
  }, [profile, resolve]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, loading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
