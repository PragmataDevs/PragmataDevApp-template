-- ==============================================================================
-- Supabase Realtime — publicación supabase_realtime
-- Ejecutar después de 20260111120000_pragmata_schema.sql.
-- Idempotente: solo ADD TABLE si la tabla aún no está en la publicación.
-- REPLICA IDENTITY FULL en todas las tablas de negocio (UPDATE/DELETE completos).
-- Mantener sincronizado con docs/database/04_realtime_publication.sql
-- ==============================================================================

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
