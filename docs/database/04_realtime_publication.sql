-- Supabase Realtime — todas las tablas de negocio en `supabase_realtime`
-- Referencia manual (Studio). En CLI va integrado al final de
-- supabase/migrations/20260111120000_pragmata_schema.sql (sección 10. REALTIME).
--
-- Cuándo: después de 01 y 02 (local Studio :54323 o nube). Siempre, con o sin PowerSync.
-- Verificación al final de este archivo.

DO $realtime$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'profiles',
    'entities',
    'teams',
    'sys_resources',
    'sys_roles',
    'sys_role_definitions',
    'sys_user_permissions',
    'sys_entity_access',
    'sys_user_preferences',
    'notification_broadcasts',
    'notifications',
    'notification_attachments',
    'chat_conversations',
    'chat_participants',
    'chat_messages',
    'chat_message_reads',
    'tasks',
    'task_comments',
    'documents',
    'products',
    'orders',
    'order_items',
    'cms_pages'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF to_regclass(format('public.%I', tbl)) IS NULL THEN
      RAISE NOTICE 'Skipping % — table does not exist', tbl;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', tbl);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      RAISE NOTICE 'Realtime enabled: public.%', tbl;
    END IF;
  END LOOP;
END $realtime$;

-- Verificación
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
ORDER BY tablename;
