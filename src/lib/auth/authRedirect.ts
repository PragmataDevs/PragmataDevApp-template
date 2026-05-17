/** Origen del ERP para redirects de Supabase Auth (reset password, OAuth). */
export function authAppOrigin(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return (import.meta.env.PUBLIC_APP_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:7070';
}

export function authRedirectUrl(path: string): string {
  const base = authAppOrigin();
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}
