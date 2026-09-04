-- ROLLBACK de 20260904094000_ai_usage.sql
BEGIN;
DROP FUNCTION IF EXISTS public.ai_can_run(TEXT);
DROP FUNCTION IF EXISTS public.ai_estimate_cost(TEXT, INTEGER, INTEGER);
DROP TABLE IF EXISTS public.ai_usage;
DROP TABLE IF EXISTS public.ai_model_prices;
ALTER TABLE public.platform_settings
  DROP COLUMN IF EXISTS ai_enabled,
  DROP COLUMN IF EXISTS ai_daily_budget_usd,
  DROP COLUMN IF EXISTS ai_default_model;
COMMIT;
