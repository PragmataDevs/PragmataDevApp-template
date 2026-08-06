-- DOWN: revierte 20260805193000_activar_conditions_check_permission.sql
-- check_permission() nunca se tocó en el UP (decisión b: helper separado), así
-- que la reversa es simplemente eliminar la función nueva. Ninguna policy del
-- template la invoca todavía, así que no hay dependientes que romper.
DROP FUNCTION IF EXISTS public.check_row_conditions(JSONB, JSONB, UUID);
