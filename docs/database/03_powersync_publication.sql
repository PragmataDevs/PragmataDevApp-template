-- PowerSync Replication Setup
-- Ejecuta este script en el SQL Editor de Supabase (Dashboard > SQL Editor)

-- 1. Crear la publicación de replicación lógica
-- Esto le dice a PostgreSQL qué tablas PowerSync puede "escuchar"
CREATE PUBLICATION powersync FOR TABLE 
  -- Core (01_security_engine.sql)
  public.profiles,
  public.entities,
  public.teams,
  public.sys_resources,
  public.sys_roles,
  public.sys_role_definitions,
  public.sys_user_permissions,
  public.sys_entity_access,
  public.sys_user_preferences,
  -- Chat & Notifications (also part of 01_security_engine.sql)
  public.notification_broadcasts,
  public.notifications,
  public.notification_attachments,
  public.chat_conversations,
  public.chat_participants,
  public.chat_messages,
  public.chat_message_reads;

-- 2. Verificar que se creó correctamente
SELECT * FROM pg_publication WHERE pubname = 'powersync';

-- 3. Ver qué tablas están incluidas
SELECT * FROM pg_publication_tables WHERE pubname = 'powersync';
