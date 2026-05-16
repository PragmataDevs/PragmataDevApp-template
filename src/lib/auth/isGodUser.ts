import type { Profile } from '@/types/users/profile';

/**
 * Espejo de `public.is_god()` en Postgres.
 * Requiere access_level = 'god' Y equipo con is_platform_owner = TRUE.
 * @see docs/security-god-user-frontend.md
 */
export function isGodUser(
  profile: Profile | null | undefined,
  teamIsPlatformOwner: boolean | null | undefined,
): boolean {
  if (!profile || profile.access_level !== 'god') return false;
  return teamIsPlatformOwner === true;
}
