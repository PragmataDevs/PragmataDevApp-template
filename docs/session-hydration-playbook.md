# Session Hydration Playbook (Supabase + React Hooks)

This document captures the fix we applied to avoid empty/frozen screens caused by protected queries running before Supabase finishes restoring the session.

## Problem We Solved

- On app cold start or wake-from-sleep, auth restoration from storage can take a short time.
- Some data hooks were fetching too early, getting JWT/RLS errors, and not recovering automatically.
- Result: users saw empty states or errors until manual page refresh.

## What We Changed In This Project

### 1) Gate protected fetches by auth state

In protected hooks, we read auth state and stop early while auth is not ready.

Pattern:

```ts
const { loading: authLoading, isAuthenticated } = useAuth();

if (authLoading || !isAuthenticated) {
  setLoading(true);
  return;
}
```

Applied in:

- `src/features/keywords/hooks/useKeywords.ts`
- `src/features/rda/hooks/useRdaAnalyses.ts`
- `src/features/attorneys/hooks/useAttorneys.ts`
- `src/features/seo-accounts/hooks/useSeoAccounts.ts`

### 2) Re-run effects after session hydration

Effects that trigger initial fetch now depend on auth state:

```ts
useEffect(() => {
  if (authLoading || !isAuthenticated) return;
  void fetchData();
}, [fetchData, authLoading, isAuthenticated]);
```

This guarantees a fetch as soon as auth becomes ready.

### 3) Add one-time retry for JWT/session errors

When query fails with auth/session symptoms (`PGRST301`, `PGRST302`, or JWT message):

1. Refresh session via `supabase.auth.getSession()`.
2. Retry the same query exactly once.
3. If retry still fails, surface the error normally.

This prevents frozen states from transient startup races.

### 4) Instrument retry behavior

We added counters and logs in both hooks:

- Counter increments each time a JWT/session error triggers retry.
- Logs for:
  - initial auth error,
  - successful retry,
  - retry skipped due to missing recovered session.

Purpose: validate that retries are happening less often over time and diagnose regressions quickly.

### 5) Lock explicit Supabase auth client options

Supabase client now declares auth options explicitly:

```ts
createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'pragmata-auth-v1',
  },
});
```

Applied in:

- `src/lib/supabase/index.ts`

### 6) Session epoch: refetch data hooks after TOKEN_REFRESHED

Symptom this fixes: user leaves the tab idle for several minutes, returns,
navigates to a page that uses a protected hook (e.g. Client Keywords), and the
list shows up empty WITHOUT any error in the console. Hard refresh (`F5`) is
the only way to recover.

Root cause:

- After idle, the access token in storage is expired.
- `isAuthenticated = !!user` stays `true` because the `user` object is still in
  React state, so the gate `authLoading || !isAuthenticated` does not block.
- The hook’s `useEffect` runs immediately and queries PostgREST with an expired
  JWT. Depending on the client/edge state, PostgREST may respond with
  `200 + []` (RLS strips everything) instead of a proper `401`. The one-shot
  JWT retry never kicks in because there is no error to detect.
- Later, supabase-js fires `TOKEN_REFRESHED`, but nothing triggers a refetch
  because none of the effect dependencies change.

Fix: introduce a monotonic `sessionEpoch` counter in `AuthProvider` that is
incremented every time the session is (re)hydrated successfully. Data hooks
must include `sessionEpoch` in the initial-fetch `useEffect` deps array.

In `AuthProvider`:

```ts
const [sessionEpoch, setSessionEpoch] = useState(0);
const bumpSessionEpoch = () => setSessionEpoch((prev) => prev + 1);

// initAuth → after fetchProfile → bumpSessionEpoch()

supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'TOKEN_REFRESHED' && session?.user) {
    bumpSessionEpoch(); // do NOT refetch profile, just signal data hooks
    return;
  }
  if (session?.user) {
    await fetchProfile(session.user.id);
    bumpSessionEpoch();
  }
});

// On visibilitychange/online: proactively refresh the access token BEFORE
// any revalidation, so the next query goes out with a fresh JWT.
const maybeRevalidate = async () => {
  if (!user) return;
  await supabase.auth.getSession(); // force refresh path
  await refreshProfile();           // bumps epoch on success
};
```

Expose it on the auth context:

```ts
interface AuthContextType {
  ...
  sessionEpoch: number;
}
```

In every protected data hook:

```ts
const { loading: authLoading, isAuthenticated, sessionEpoch } = useAuth();

useEffect(() => {
  if (authLoading || !isAuthenticated) return;
  void fetchData();
  // sessionEpoch in deps: re-run after TOKEN_REFRESHED / wake-from-idle.
}, [fetchData, authLoading, isAuthenticated, sessionEpoch]);
```

Applied in this project:

- `src/features/auth/providers/AuthProvider.tsx`
- `src/features/keywords/hooks/useKeywords.ts`
- `src/features/rda/hooks/useRdaAnalyses.ts`
- `src/features/attorneys/hooks/useAttorneys.ts`
- `src/features/seo-accounts/hooks/useSeoAccounts.ts`

### 7) NEVER block the Supabase auth lock from inside `onAuthStateChange`

**This is the most expensive lesson learned in this codebase. Do not skip.**

Supabase v2 uses `navigator.locks` to serialize all auth-sensitive
operations. Every PostgREST query (`supabase.from(...).select(...)`) needs
the lock briefly to attach the current JWT. The `onAuthStateChange`
callback runs WHILE that lock is held.

**If you `await` any `supabase.from(...)` (or `supabase.auth.refreshSession()`)
inside the `onAuthStateChange` callback you will deadlock against any other
component firing a query at the same time.**

Observed symptoms:

- `AbortError: signal is aborted without reason` in console.
- After navigating to a page, its data hook is stuck on `loading=true`
  forever; only a hard refresh fixes it.
- `Permissions loaded: 0 resources` for an admin user (the query returned
  before the JWT was attached, RLS stripped everything).
- Multiple `Auth Event: SIGNED_IN` followed by `fetchProfile already in
  progress, skipping.` and then nothing else.

**Correct pattern:**

```ts
// Callback MUST be synchronous. No async, no awaits on DB queries.
supabase.auth.onAuthStateChange((event, session) => {
  const currentUser = session?.user ?? null;
  setUser(currentUser);                 // sync

  if (event === 'TOKEN_REFRESHED' && currentUser) {
    bumpSessionEpoch();                  // sync
    return;
  }
  if (!currentUser) {
    setProfile(null);
    setPermissions({});
    return;
  }
  if (event === 'PASSWORD_RECOVERY') {
    queueMicrotask(() => window.location.replace('/auth/reset-password'));
  }
});

// Profile + permissions are fetched in a SEPARATE effect that reacts to
// user.id. This runs after the auth lock is released.
const lastProfileUserIdRef = useRef<string | null>(null);
useEffect(() => {
  const userId = user?.id ?? null;
  if (!userId || lastProfileUserIdRef.current === userId) return;
  lastProfileUserIdRef.current = userId;
  void (async () => {
    await fetchProfile(userId); // safe — outside the lock callback
    bumpSessionEpoch();
  })();
}, [user?.id]);
```

**Also: do NOT proactively call `supabase.auth.refreshSession()` from your
own code on the main path.** It also takes the lock and competes with the
automatic refresh that `autoRefreshToken: true` already does. Trust the
client and rely on `TOKEN_REFRESHED` + `sessionEpoch` to react.

The one-shot JWT retry inside data hooks (PGRST301/PGRST302/JWT) is enough
to recover from transient stale-JWT cases that slip through.

Applied in:

- `src/features/auth/providers/AuthProvider.tsx`

## Copy/Paste Checklist For New Template Projects

- Add auth guard (`authLoading` + `isAuthenticated`) to each protected data hook.
- Include auth deps in initial-fetch `useEffect`.
- Implement one-time retry on `PGRST301`/`PGRST302`/JWT errors.
- Add logging counters for auth retry events.
- Set explicit Supabase auth client options (persist, refresh, detect URL, storage key).
- Keep the `onAuthStateChange` callback strictly synchronous. NEVER await
  `supabase.from(...)` queries or `supabase.auth.refreshSession()` inside
  it (it holds `navigator.locks` and will deadlock other queries).
- Drive `fetchProfile` from a `useEffect` that watches `user?.id` so it
  runs OUTSIDE the auth lock callback.
- Do NOT call `supabase.auth.refreshSession()` proactively on the main
  path. Rely on `autoRefreshToken: true` and on `TOKEN_REFRESHED` events.
- Expose `sessionEpoch` from `AuthProvider` and bump it on initial load,
  `SIGNED_IN`, `TOKEN_REFRESHED`, and successful background revalidation.
- Add `sessionEpoch` to the deps of every protected data hook’s initial-fetch
  `useEffect`.
- Call `supabase.auth.getSession()` proactively at the start of the
  `visibilitychange` / `online` revalidation path to force token refresh.
- Validate with clean browser session and wake-from-sleep scenario.

## Validation Steps

1. Open app in clean browser profile.
2. Sign in and hard-reload once.
3. Keep tab idle for a few minutes (or sleep/wake laptop).
4. Return to app and navigate to pages with protected data hooks.
5. Confirm data loads without manual refresh.
6. Check logs to confirm retries are rare and successful when triggered.

## Notes

- Keep retry to one attempt only. Avoid loops.
- Keep existing domain/table errors unchanged (do not hide real failures).
- Apply this pattern only to protected queries that depend on authenticated Supabase access.