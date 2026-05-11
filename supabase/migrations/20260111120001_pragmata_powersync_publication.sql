-- ==============================================================================
-- PowerSync — publicación de replicación lógica
-- Ejecutar después de 20260111120000_pragmata_schema.sql.
-- Idempotente: recrea la publicación `powersync` si ya existía.
-- ==============================================================================

DROP PUBLICATION IF EXISTS powersync;

CREATE PUBLICATION powersync FOR TABLE
  public.profiles,
  public.entities,
  public.teams,
  public.sys_resources,
  public.sys_roles,
  public.sys_role_definitions,
  public.sys_user_permissions,
  public.sys_entity_access,
  public.sys_user_preferences,
  public.notification_broadcasts,
  public.notifications,
  public.notification_attachments,
  public.chat_conversations,
  public.chat_participants,
  public.chat_messages,
  public.chat_message_reads,
  public.tasks,
  public.task_comments,
  public.documents,
  public.products,
  public.orders,
  public.order_items,
  public.cms_pages;
