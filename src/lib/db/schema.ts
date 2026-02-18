import { Schema, Table, Column, ColumnType, Index } from '@powersync/web';

// Define el esquema local de SQLite que PowerSync descargará desde Supabase
export const AppSchema = new Schema([
  // ============================================================================
  // BUCKET: user (Perfil propio + permisos)
  // ============================================================================
  new Table({
    name: 'profiles',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT }),
      new Column({ name: 'user_id', type: ColumnType.TEXT }),
      new Column({ name: 'email', type: ColumnType.TEXT }),
      new Column({ name: 'full_name', type: ColumnType.TEXT }),
      new Column({ name: 'team_id', type: ColumnType.TEXT }),
      new Column({ name: 'role_id', type: ColumnType.TEXT }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
      new Column({ name: 'updated_at', type: ColumnType.TEXT }),
    ],
    indexes: [
      Index.createAscending({ name: 'profiles_user_id_idx' }, ['user_id'])
    ]
  }),

  new Table({
    name: 'sys_user_preferences',
    columns: [
      new Column({ name: 'user_id', type: ColumnType.TEXT }),
      new Column({ name: 'theme', type: ColumnType.TEXT }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
      new Column({ name: 'updated_at', type: ColumnType.TEXT }),
    ],
  }),

  new Table({
    name: 'sys_user_permissions',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT }),
      new Column({ name: 'user_id', type: ColumnType.TEXT }),
      new Column({ name: 'team_id', type: ColumnType.TEXT }),
      new Column({ name: 'project_id', type: ColumnType.TEXT }),
      new Column({ name: 'resource_code', type: ColumnType.TEXT }),
      new Column({ name: 'granted_actions', type: ColumnType.TEXT }),
      new Column({ name: 'is_customized', type: ColumnType.INTEGER }),
      new Column({ name: 'conditions', type: ColumnType.TEXT }),
    ],
    indexes: [
      Index.createAscending({ name: 'sys_user_permissions_user_id_idx' }, ['user_id'])
    ]
  }),

  // ============================================================================
  // BUCKET: user_team (Team del usuario)
  // ============================================================================
  new Table({
    name: 'teams',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT }),
      new Column({ name: 'name', type: ColumnType.TEXT }),
      new Column({ name: 'slug', type: ColumnType.TEXT }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
      new Column({ name: 'updated_at', type: ColumnType.TEXT }),
    ]
  }),

  // ============================================================================
  // BUCKET: projects (Proyectos autorizados)
  // ============================================================================
  new Table({
    name: 'projects',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT }),
      new Column({ name: 'team_id', type: ColumnType.TEXT }),
      new Column({ name: 'name', type: ColumnType.TEXT }),
      new Column({ name: 'code', type: ColumnType.TEXT }),
      new Column({ name: 'description', type: ColumnType.TEXT }),
      new Column({ name: 'location', type: ColumnType.TEXT }),
      new Column({ name: 'budget', type: ColumnType.REAL }),
      new Column({ name: 'start_date', type: ColumnType.TEXT }),
      new Column({ name: 'end_date', type: ColumnType.TEXT }),
      new Column({ name: 'metadata', type: ColumnType.TEXT }),
      new Column({ name: 'project_status', type: ColumnType.TEXT }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
      new Column({ name: 'updated_at', type: ColumnType.TEXT }),
      new Column({ name: 'status', type: ColumnType.TEXT }),
      new Column({ name: 'created_by', type: ColumnType.TEXT }),
      new Column({ name: 'updated_by', type: ColumnType.TEXT }),
    ],
    indexes: [
      Index.createAscending({ name: 'projects_team_id_idx' }, ['team_id'])
    ]
  }),

  new Table({
    name: 'sys_project_access',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT }),
      new Column({ name: 'user_id', type: ColumnType.TEXT }),
      new Column({ name: 'project_id', type: ColumnType.TEXT }),
      new Column({ name: 'team_id', type: ColumnType.TEXT }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
    ],
    indexes: [
      Index.createAscending({ name: 'sys_project_access_user_project_idx' }, ['user_id', 'project_id'])
    ]
  }),

  // ============================================================================
  // BUCKET: resources (Catálogo del sistema - Global Read-Only)
  // ============================================================================
  new Table({
    name: 'sys_resources',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT }),
      new Column({ name: 'code', type: ColumnType.TEXT }),
      new Column({ name: 'name', type: ColumnType.TEXT }),
      new Column({ name: 'description', type: ColumnType.TEXT }),
      new Column({ name: 'category', type: ColumnType.TEXT }),
      new Column({ name: 'type', type: ColumnType.TEXT }),
      new Column({ name: 'resource_status', type: ColumnType.TEXT }),
      new Column({ name: 'default_actions', type: ColumnType.TEXT }),
      new Column({ name: 'depends_on', type: ColumnType.TEXT }),
    ],
    indexes: [
      Index.createAscending({ name: 'sys_resources_code_idx' }, ['code'])
    ]
  }),

  // ============================================================================
  // BUCKET: roles (Roles y definiciones - Global Read-Only)
  // ============================================================================
  new Table({
    name: 'sys_roles',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT }),
      new Column({ name: 'name', type: ColumnType.TEXT }),
      new Column({ name: 'description', type: ColumnType.TEXT }),
      new Column({ name: 'is_system_role', type: ColumnType.INTEGER }),
      new Column({ name: 'can_be_customized', type: ColumnType.INTEGER }),
      new Column({ name: 'is_dev_role', type: ColumnType.INTEGER }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
      new Column({ name: 'updated_at', type: ColumnType.TEXT }),
    ]
  }),

  new Table({
    name: 'sys_role_definitions',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT }),
      new Column({ name: 'role_id', type: ColumnType.TEXT }),
      new Column({ name: 'resource_code', type: ColumnType.TEXT }),
      new Column({ name: 'granted_actions', type: ColumnType.TEXT }),
      new Column({ name: 'conditions', type: ColumnType.TEXT }),
    ],
    indexes: [
      Index.createAscending({ name: 'sys_role_definitions_role_id_idx' }, ['role_id'])
    ]
  }),

  // ============================================================================
  // BUCKET: notifications (Notificaciones del usuario)
  // ============================================================================
  new Table({
    name: 'notifications',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT }),
      new Column({ name: 'recipient_id', type: ColumnType.TEXT }),
      new Column({ name: 'sender_id', type: ColumnType.TEXT }),
      new Column({ name: 'broadcast_id', type: ColumnType.TEXT }),
      new Column({ name: 'type', type: ColumnType.TEXT }),
      new Column({ name: 'title', type: ColumnType.TEXT }),
      new Column({ name: 'body', type: ColumnType.TEXT }),
      new Column({ name: 'action_url', type: ColumnType.TEXT }),
      new Column({ name: 'is_read', type: ColumnType.INTEGER }),
      new Column({ name: 'is_archived', type: ColumnType.INTEGER }),
      new Column({ name: 'read_at', type: ColumnType.TEXT }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
    ],
    indexes: [
      Index.createAscending({ name: 'notifications_recipient_idx' }, ['recipient_id']),
    ]
  }),

  new Table({
    name: 'notification_attachments',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT }),
      new Column({ name: 'notification_id', type: ColumnType.TEXT }),
      new Column({ name: 'broadcast_id', type: ColumnType.TEXT }),
      new Column({ name: 'file_name', type: ColumnType.TEXT }),
      new Column({ name: 'file_url', type: ColumnType.TEXT }),
      new Column({ name: 'file_type', type: ColumnType.TEXT }),
      new Column({ name: 'file_size', type: ColumnType.INTEGER }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
    ],
  }),

  // ============================================================================
  // BUCKET: chat (Conversaciones del usuario)
  // ============================================================================
  new Table({
    name: 'chat_conversations',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT }),
      new Column({ name: 'type', type: ColumnType.TEXT }),
      new Column({ name: 'name', type: ColumnType.TEXT }),
      new Column({ name: 'created_by', type: ColumnType.TEXT }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
      new Column({ name: 'updated_at', type: ColumnType.TEXT }),
    ],
  }),

  new Table({
    name: 'chat_participants',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT }),
      new Column({ name: 'conversation_id', type: ColumnType.TEXT }),
      new Column({ name: 'user_id', type: ColumnType.TEXT }),
      new Column({ name: 'joined_at', type: ColumnType.TEXT }),
    ],
    indexes: [
      Index.createAscending({ name: 'chat_participants_conv_idx' }, ['conversation_id']),
    ]
  }),

  new Table({
    name: 'chat_messages',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT }),
      new Column({ name: 'conversation_id', type: ColumnType.TEXT }),
      new Column({ name: 'sender_id', type: ColumnType.TEXT }),
      new Column({ name: 'body', type: ColumnType.TEXT }),
      new Column({ name: 'type', type: ColumnType.TEXT }),
      new Column({ name: 'file_url', type: ColumnType.TEXT }),
      new Column({ name: 'file_name', type: ColumnType.TEXT }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
    ],
    indexes: [
      Index.createAscending({ name: 'chat_messages_conv_idx' }, ['conversation_id']),
    ]
  }),

  new Table({
    name: 'chat_message_reads',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT }),
      new Column({ name: 'message_id', type: ColumnType.TEXT }),
      new Column({ name: 'user_id', type: ColumnType.TEXT }),
      new Column({ name: 'read_at', type: ColumnType.TEXT }),
    ],
  }),
]);
