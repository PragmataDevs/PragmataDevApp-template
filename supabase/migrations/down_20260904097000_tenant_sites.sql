BEGIN;
DROP FUNCTION IF EXISTS public.get_public_site(TEXT);
DROP TRIGGER IF EXISTS zzz_teams_propagate_slug ON public.teams;
DROP FUNCTION IF EXISTS public.teams_propagate_slug();
DROP TABLE IF EXISTS public.tenant_sites;
DROP FUNCTION IF EXISTS public.tenant_sites_mirror_slug();
COMMIT;
