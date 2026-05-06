-- ==============================================================================
-- PRAGMATA SECURITY ENGINE (v2.0)
-- "The Master Key Framework" + Chat + Notifications (consolidated)
--
-- Includes:
-- 1. Core Extensions
-- 2. Generic AuditBase trigger (set_updated_at)
-- 3. Security Catalogs (sys_resources, sys_roles, sys_role_definitions)
-- 4. Business Tables (teams, profiles, projects)
-- 5. Access Control (sys_project_access, sys_user_permissions, sys_user_preferences)
-- 6. Notifications (broadcasts, notifications, attachments)
-- 7. Chat (conversations, participants, messages, reads)
-- 8. Logic Functions & Triggers (security engine + chat/notifications)
-- 9. Indexes
-- 10. RLS Policies (the locks)
--
-- DESIGN RULES (see docs/architecture.md §4.1):
-- - Every business table MUST extend AuditBase fully:
--     id, created_at, updated_at, created_by, updated_by, status, deleted_at.
-- - status uses ('active','deleted') and supports logical delete via deleted_at.
-- - updated_at is enforced by the generic trigger `set_updated_at()`.
-- - created_by / updated_by reference public.profiles(id) (NULL for system rows).
-- - Hard DELETE is reserved for cascading housekeeping; business operations
--   must use logical delete (status = 'deleted', deleted_at = now()).
--
-- POWERSYNC COMPATIBILITY:
-- This entire schema is designed for "Offline-First" Sync Rules.
-- Instead of relying purely on dynamic RLS functions (which don't run on SQLite),
-- we expose explicit access tables (sys_project_access, sys_user_permissions)
-- that PowerSync can read to determine WHAT data to download to the device.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ------------------------------------------------------------------------------
-- 2. GENERIC AUDITBASE TRIGGER
-- ------------------------------------------------------------------------------
-- Single trigger function reused by every table. Keeps `updated_at` honest
-- regardless of what the client sends. The client is still expected to set
-- `updated_by` explicitly, since the trigger has no reliable session mapping.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;


-- ------------------------------------------------------------------------------
-- 3. SECURITY CATALOGS
-- ------------------------------------------------------------------------------

-- 3.1 RESOURCES (Code Components)
-- `code` is the public stable identifier used by the application; `id` exists
-- only to satisfy the AuditBase contract (every row has a UUID).
CREATE TABLE public.sys_resources (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    code TEXT PRIMARY KEY, -- 'page_projects', 'btn_approve'

    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    type TEXT, -- 'page', 'widget', 'action'
    default_actions TEXT[] NOT NULL DEFAULT ARRAY['read']::text[],

    resource_status TEXT NOT NULL DEFAULT 'active', -- 'active', 'deprecated'

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ
);

-- 3.2 ROLES (Permission Templates)
CREATE TABLE public.sys_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL UNIQUE,
    description TEXT,

    is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
    is_dev_role BOOLEAN NOT NULL DEFAULT FALSE,

    -- DOUBLE-GATE SECURITY:
    -- TRUE  : Users with this role CAN have custom permissions.
    -- FALSE : Users must STRICTLY follow the role definition.
    can_be_customized BOOLEAN NOT NULL DEFAULT FALSE,

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ
);

-- 3.3 ROLE DEFINITIONS (The Template Rules)
CREATE TABLE public.sys_role_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES public.sys_roles(id) ON DELETE CASCADE,
    resource_code TEXT NOT NULL REFERENCES public.sys_resources(code) ON DELETE CASCADE,
    granted_actions TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    conditions JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT sys_role_definitions_role_resource_unique UNIQUE (role_id, resource_code)
);


-- ------------------------------------------------------------------------------
-- 4. BUSINESS ENTITIES (Simplified 1:1:1 Model)
-- ------------------------------------------------------------------------------

-- 4.1 TEAMS (Tenants)
CREATE TABLE public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo_url TEXT,
    is_platform_owner BOOLEAN NOT NULL DEFAULT FALSE,

    -- Business Data
    tax_id TEXT,
    address TEXT,
    contact_email TEXT,
    web_url TEXT,

    owner_id UUID, -- FK added after profiles is created (circular dependency)

    team_status TEXT NOT NULL DEFAULT 'active' CHECK (team_status IN ('active','suspended','delinquent')),

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ
);

-- 4.2 PROFILES (The User + The Employee)
-- POWERSYNC anchor table. Sync Rule: SELECT * FROM profiles WHERE id = auth.uid()
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Identity
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    job_title TEXT,
    phone TEXT,

    -- Security Contract (1 Team, 1 Role)
    team_id UUID NOT NULL REFERENCES public.teams(id),
    role_id UUID NOT NULL REFERENCES public.sys_roles(id),

    access_level TEXT NOT NULL DEFAULT 'member' CHECK (access_level IN ('god','admin','member')),

    -- FLEXIBILITY SWITCH:
    -- TRUE  : Permissions = Mirror of Role.
    -- FALSE : Permissions = Custom (Manual).
    is_role_synced BOOLEAN NOT NULL DEFAULT TRUE,

    role_variables JSONB NOT NULL DEFAULT '{}'::jsonb,

    profile_status TEXT NOT NULL DEFAULT 'active' CHECK (profile_status IN ('active','suspended')),

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ
);

-- Resolve circular FK on teams.owner_id
ALTER TABLE public.teams
    ADD CONSTRAINT fk_teams_owner FOREIGN KEY (owner_id) REFERENCES public.profiles(id);

-- AuditBase FKs that reference profiles (added after profiles exists)
ALTER TABLE public.sys_resources
    ADD CONSTRAINT fk_sys_resources_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_sys_resources_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.sys_roles
    ADD CONSTRAINT fk_sys_roles_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_sys_roles_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.sys_role_definitions
    ADD CONSTRAINT fk_sys_role_definitions_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_sys_role_definitions_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.teams
    ADD CONSTRAINT fk_teams_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_teams_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
    ADD CONSTRAINT fk_profiles_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_profiles_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 4.3 PROJECTS (Scopes)
CREATE TABLE public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    code TEXT,
    description TEXT,

    location TEXT,
    budget DECIMAL(12,2),
    start_date DATE,
    end_date DATE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    project_status TEXT NOT NULL DEFAULT 'planning'
        CHECK (project_status IN ('planning','active','completed','paused','canceled')),

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ
);


-- ------------------------------------------------------------------------------
-- 5. ACCESS CONTROL LISTS (Runtime Data)
-- ------------------------------------------------------------------------------

-- 5.1 PROJECT SCOPE (Whitelist)
-- POWERSYNC: Defines the "Project Bucket" contents.
CREATE TABLE public.sys_project_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id),

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT sys_project_access_user_project_unique UNIQUE (user_id, project_id)
);

-- 5.2 EFFECTIVE PERMISSIONS (Cache)
CREATE TABLE public.sys_user_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id),

    resource_code TEXT NOT NULL REFERENCES public.sys_resources(code) ON DELETE CASCADE,
    granted_actions TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    conditions JSONB NOT NULL DEFAULT '{}'::jsonb,

    is_customized BOOLEAN NOT NULL DEFAULT FALSE,

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ,

    UNIQUE (user_id, resource_code)
);

-- 5.3 USER PREFERENCES (Personal settings)
CREATE TABLE public.sys_user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ
);


-- ------------------------------------------------------------------------------
-- 6. NOTIFICATIONS
-- ------------------------------------------------------------------------------

-- 6.1 NOTIFICATION BROADCASTS (Master "send" record)
CREATE TABLE public.notification_broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    target_type TEXT NOT NULL CHECK (target_type IN ('user','role','all')),
    target_id UUID, -- user_id or role_id (NULL for 'all')

    type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info','action','urgent')),
    title TEXT NOT NULL,
    body TEXT,
    action_url TEXT,

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ
);

-- 6.2 NOTIFICATIONS (Per-user instance)
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    broadcast_id UUID REFERENCES public.notification_broadcasts(id) ON DELETE CASCADE,

    type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info','action','urgent')),
    title TEXT NOT NULL,
    body TEXT,
    action_url TEXT,

    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ
);

-- 6.3 NOTIFICATION ATTACHMENTS
CREATE TABLE public.notification_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES public.notifications(id) ON DELETE CASCADE,
    broadcast_id UUID REFERENCES public.notification_broadcasts(id) ON DELETE CASCADE,

    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER,

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT attachment_has_parent CHECK (notification_id IS NOT NULL OR broadcast_id IS NOT NULL)
);


-- ------------------------------------------------------------------------------
-- 7. CHAT
-- ------------------------------------------------------------------------------

-- 7.1 CONVERSATIONS
CREATE TABLE public.chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL DEFAULT 'individual' CHECK (type IN ('individual','group')),
    name TEXT, -- only for group chats

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ
);

-- 7.2 PARTICIPANTS
CREATE TABLE public.chat_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ,

    UNIQUE (conversation_id, user_id)
);

-- 7.3 MESSAGES
CREATE TABLE public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    body TEXT,
    type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text','image','file')),
    file_url TEXT,
    file_name TEXT,

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ
);

-- 7.4 MESSAGE READS
CREATE TABLE public.chat_message_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ,

    UNIQUE (message_id, user_id)
);


-- ------------------------------------------------------------------------------
-- 8. LOGIC FUNCTIONS & TRIGGERS
-- ------------------------------------------------------------------------------

-- 8.1 THE MASTER KEY: public.check_permission()
CREATE OR REPLACE FUNCTION public.check_permission(
    requested_resource TEXT,
    requested_action TEXT,
    context_project_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_uid UUID;
    user_profile RECORD;
    has_action BOOLEAN;
BEGIN
    current_uid := auth.uid();

    IF current_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT * INTO user_profile FROM public.profiles WHERE id = current_uid;

    IF user_profile IS NULL
       OR user_profile.profile_status <> 'active'
       OR user_profile.status <> 'active' THEN
        RETURN FALSE;
    END IF;

    -- GOD: full access if team is platform owner
    IF user_profile.access_level = 'god' THEN
        IF EXISTS (SELECT 1 FROM public.teams WHERE id = user_profile.team_id AND is_platform_owner = TRUE) THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- ADMIN: full access scoped to own team
    IF user_profile.access_level = 'admin' THEN
        IF context_project_id IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM public.projects WHERE id = context_project_id AND team_id = user_profile.team_id) THEN
                RETURN TRUE;
            END IF;
        ELSE
            RETURN TRUE;
        END IF;
    END IF;

    -- MEMBER: project whitelist + granular permissions
    IF context_project_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.sys_project_access
            WHERE user_id = current_uid AND project_id = context_project_id
        ) THEN
            RETURN FALSE;
        END IF;
    END IF;

    SELECT TRUE INTO has_action
    FROM public.sys_user_permissions
    WHERE user_id = current_uid
      AND resource_code = requested_resource
      AND granted_actions @> ARRAY[requested_action]::text[];

    RETURN COALESCE(has_action, FALSE);
END;
$$;

-- 8.2 HELPERS for RLS (avoid recursion)
CREATE OR REPLACE FUNCTION public.get_my_team_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT team_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_project_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT project_id FROM public.sys_project_access WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_chat_participant(conv_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.chat_participants
        WHERE conversation_id = conv_id AND user_id = auth.uid()
    );
$$;

-- 8.3 PERMISSION SYNC ENGINE
CREATE OR REPLACE FUNCTION public.handle_permission_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Scenario A: a Role Definition changed → refresh all synced users of that role
    IF (TG_TABLE_NAME = 'sys_role_definitions') THEN
        DELETE FROM public.sys_user_permissions
        WHERE user_id IN (
            SELECT id FROM public.profiles WHERE role_id = OLD.role_id AND is_role_synced = TRUE
        )
          AND resource_code = OLD.resource_code;

        INSERT INTO public.sys_user_permissions (user_id, team_id, resource_code, granted_actions, conditions)
        SELECT p.id, p.team_id, NEW.resource_code, NEW.granted_actions, NEW.conditions
        FROM public.profiles p
        WHERE p.role_id = NEW.role_id AND p.is_role_synced = TRUE
        ON CONFLICT (user_id, resource_code) DO UPDATE
        SET granted_actions = EXCLUDED.granted_actions,
            conditions      = EXCLUDED.conditions,
            updated_at      = NOW();

        RETURN NEW;
    END IF;

    -- Scenario B: a profile's role/sync flag changed → rebuild its permissions
    IF (TG_TABLE_NAME = 'profiles') THEN
        IF (OLD.role_id IS DISTINCT FROM NEW.role_id)
           OR (OLD.is_role_synced = FALSE AND NEW.is_role_synced = TRUE) THEN

            DELETE FROM public.sys_user_permissions WHERE user_id = NEW.id;

            IF (NEW.is_role_synced = TRUE) THEN
                INSERT INTO public.sys_user_permissions (user_id, team_id, resource_code, granted_actions, conditions)
                SELECT NEW.id, NEW.team_id, rd.resource_code, rd.granted_actions, rd.conditions
                FROM public.sys_role_definitions rd
                WHERE rd.role_id = NEW.role_id;
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_role_def ON public.sys_role_definitions;
CREATE TRIGGER trigger_sync_role_def
AFTER INSERT OR UPDATE OR DELETE ON public.sys_role_definitions
FOR EACH ROW EXECUTE FUNCTION public.handle_permission_sync();

DROP TRIGGER IF EXISTS trigger_sync_profile_role ON public.profiles;
CREATE TRIGGER trigger_sync_profile_role
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_permission_sync();

-- 8.4 NOTIFICATION BROADCAST FAN-OUT
CREATE OR REPLACE FUNCTION public.handle_notification_broadcast()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.target_type = 'user' THEN
        INSERT INTO public.notifications (recipient_id, sender_id, broadcast_id, type, title, body, action_url, created_by)
        VALUES (NEW.target_id, NEW.sender_id, NEW.id, NEW.type, NEW.title, NEW.body, NEW.action_url, NEW.sender_id);

    ELSIF NEW.target_type = 'role' THEN
        INSERT INTO public.notifications (recipient_id, sender_id, broadcast_id, type, title, body, action_url, created_by)
        SELECT p.id, NEW.sender_id, NEW.id, NEW.type, NEW.title, NEW.body, NEW.action_url, NEW.sender_id
        FROM public.profiles p
        WHERE p.role_id = NEW.target_id
          AND p.profile_status = 'active'
          AND p.status = 'active';

    ELSIF NEW.target_type = 'all' THEN
        INSERT INTO public.notifications (recipient_id, sender_id, broadcast_id, type, title, body, action_url, created_by)
        SELECT p.id, NEW.sender_id, NEW.id, NEW.type, NEW.title, NEW.body, NEW.action_url, NEW.sender_id
        FROM public.profiles p
        WHERE p.profile_status = 'active'
          AND p.status = 'active';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notification_broadcast ON public.notification_broadcasts;
CREATE TRIGGER trigger_notification_broadcast
AFTER INSERT ON public.notification_broadcasts
FOR EACH ROW EXECUTE FUNCTION public.handle_notification_broadcast();

-- 8.5 CHAT MESSAGE → bump conversation.updated_at
CREATE OR REPLACE FUNCTION public.handle_chat_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.chat_conversations
    SET updated_at = NOW(),
        updated_by = NEW.sender_id
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_chat_message_insert ON public.chat_messages;
CREATE TRIGGER trigger_chat_message_insert
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.handle_chat_message_insert();

-- 8.6 GENERIC `set_updated_at` TRIGGERS (one per AuditBase table)
DO $$
DECLARE
    t TEXT;
    audit_tables TEXT[] := ARRAY[
        'sys_resources',
        'sys_roles',
        'sys_role_definitions',
        'teams',
        'profiles',
        'projects',
        'sys_project_access',
        'sys_user_permissions',
        'sys_user_preferences',
        'notification_broadcasts',
        'notifications',
        'notification_attachments',
        'chat_conversations',
        'chat_participants',
        'chat_messages',
        'chat_message_reads'
    ];
BEGIN
    FOREACH t IN ARRAY audit_tables LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_set_updated_at ON public.%I;', t, t);
        EXECUTE format(
            'CREATE TRIGGER trg_%I_set_updated_at
             BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
            t, t
        );
    END LOOP;
END
$$;


-- ------------------------------------------------------------------------------
-- 9. INDEXES
-- ------------------------------------------------------------------------------

-- Core
CREATE INDEX idx_profiles_team                 ON public.profiles(team_id);
CREATE INDEX idx_projects_team                 ON public.projects(team_id);
CREATE INDEX idx_permissions_user              ON public.sys_user_permissions(user_id);
CREATE INDEX idx_project_access_user           ON public.sys_project_access(user_id);
CREATE INDEX idx_role_definitions_role_resource ON public.sys_role_definitions(role_id, resource_code);

-- Notifications
CREATE INDEX idx_notifications_recipient                ON public.notifications(recipient_id);
CREATE INDEX idx_notifications_recipient_unread         ON public.notifications(recipient_id) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_broadcast                ON public.notifications(broadcast_id);
CREATE INDEX idx_notification_attachments_notification  ON public.notification_attachments(notification_id);
CREATE INDEX idx_notification_attachments_broadcast     ON public.notification_attachments(broadcast_id);

-- Chat
CREATE INDEX idx_chat_participants_user        ON public.chat_participants(user_id);
CREATE INDEX idx_chat_participants_conv        ON public.chat_participants(conversation_id);
CREATE INDEX idx_chat_messages_conv            ON public.chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_conv_created    ON public.chat_messages(conversation_id, created_at DESC);
CREATE INDEX idx_chat_message_reads_message    ON public.chat_message_reads(message_id);
CREATE INDEX idx_chat_message_reads_user       ON public.chat_message_reads(user_id);


-- ------------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY
-- ------------------------------------------------------------------------------

-- 10.1 Enable RLS on ALL tables (default deny)
ALTER TABLE public.sys_resources           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_roles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_role_definitions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_project_access      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_user_permissions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_user_preferences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_reads      ENABLE ROW LEVEL SECURITY;

-- 10.2 SYSTEM CATALOG POLICIES
CREATE POLICY "Public Read Resources" ON public.sys_resources FOR SELECT USING (true);
CREATE POLICY "Admin Write Resources" ON public.sys_resources FOR ALL USING (
    public.check_permission('page_settings_roles', 'update')
);

CREATE POLICY "Public Read Roles" ON public.sys_roles FOR SELECT USING (true);
CREATE POLICY "Admin Write Roles" ON public.sys_roles FOR ALL USING (
    public.check_permission('page_settings_roles', 'update')
);

CREATE POLICY "Public Read RoleDefs" ON public.sys_role_definitions FOR SELECT USING (true);
CREATE POLICY "Admin Write RoleDefs" ON public.sys_role_definitions FOR ALL USING (
    public.check_permission('page_settings_roles', 'update')
);

-- 10.3 BUSINESS ENTITIES POLICIES
CREATE POLICY "View Own Team" ON public.teams FOR SELECT USING (
    id IN (SELECT team_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Admin Edit Team" ON public.teams FOR UPDATE USING (
    public.check_permission('page_settings_usuarios', 'update')
);

CREATE POLICY "View Self" ON public.profiles FOR SELECT USING (
    id = auth.uid()
);
CREATE POLICY "View Teammates" ON public.profiles FOR SELECT USING (
    team_id = public.get_my_team_id()
);
CREATE POLICY "Edit Self" ON public.profiles FOR UPDATE USING (
    id = auth.uid()
);
CREATE POLICY "Admin Manage Profiles" ON public.profiles FOR ALL USING (
    public.check_permission('page_settings_usuarios', 'update')
);

CREATE POLICY "View Authorized Projects" ON public.projects FOR SELECT USING (
    id IN (SELECT project_id FROM public.sys_project_access WHERE user_id = auth.uid())
    OR public.check_permission('page_settings_proyectos', 'read')
);
CREATE POLICY "Manage Projects" ON public.projects FOR ALL USING (
    public.check_permission('page_settings_proyectos', 'update', id)
);

-- 10.4 SYNC TABLES (PowerSync specific)
CREATE POLICY "Sync Own Permissions" ON public.sys_user_permissions FOR SELECT USING (
    user_id = auth.uid()
);
CREATE POLICY "Admin Manage Permissions" ON public.sys_user_permissions FOR ALL USING (
    public.check_permission('page_settings_usuarios', 'update')
);

CREATE POLICY "Sync Own Project Access" ON public.sys_project_access FOR SELECT USING (
    user_id = auth.uid()
);
CREATE POLICY "View Project Access" ON public.sys_project_access FOR SELECT USING (
    project_id IN (SELECT public.get_my_project_ids())
);
CREATE POLICY "Admin Manage Project Access" ON public.sys_project_access FOR ALL USING (
    public.check_permission('page_settings_proyectos', 'update')
);

-- 10.5 USER PREFERENCES
CREATE POLICY "Manage Own Preferences" ON public.sys_user_preferences FOR ALL USING (
    user_id = auth.uid()
);

-- 10.6 NOTIFICATIONS
CREATE POLICY "View Own Notifications" ON public.notifications
    FOR SELECT USING (recipient_id = auth.uid());

CREATE POLICY "Update Own Notifications" ON public.notifications
    FOR UPDATE USING (recipient_id = auth.uid());

CREATE POLICY "Send Direct Notification" ON public.notifications
    FOR INSERT WITH CHECK (
        sender_id = auth.uid()
        AND public.check_permission('feature_notifications_send', 'create')
    );

CREATE POLICY "Send Broadcast" ON public.notification_broadcasts
    FOR INSERT WITH CHECK (
        public.check_permission('feature_notifications_send', 'broadcast')
    );

CREATE POLICY "View Own Broadcasts" ON public.notification_broadcasts
    FOR SELECT USING (
        sender_id = auth.uid()
        OR id IN (SELECT broadcast_id FROM public.notifications WHERE recipient_id = auth.uid())
    );

CREATE POLICY "View Notification Attachments" ON public.notification_attachments
    FOR SELECT USING (
        notification_id IN (SELECT id FROM public.notifications WHERE recipient_id = auth.uid())
        OR broadcast_id IN (SELECT broadcast_id FROM public.notifications WHERE recipient_id = auth.uid())
    );

CREATE POLICY "Insert Notification Attachments" ON public.notification_attachments
    FOR INSERT WITH CHECK (
        public.check_permission('feature_notifications_send', 'create')
    );

-- 10.7 CHAT
CREATE POLICY "View My Conversations" ON public.chat_conversations
    FOR SELECT USING (created_by = auth.uid() OR public.is_chat_participant(id));

CREATE POLICY "Create Conversation" ON public.chat_conversations
    FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "View Conversation Participants" ON public.chat_participants
    FOR SELECT USING (public.is_chat_participant(conversation_id));

CREATE POLICY "Add Participant" ON public.chat_participants
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        OR public.is_chat_participant(conversation_id)
        OR EXISTS (
            SELECT 1 FROM public.chat_conversations
            WHERE id = conversation_id AND created_by = auth.uid()
        )
    );

CREATE POLICY "View Conversation Messages" ON public.chat_messages
    FOR SELECT USING (public.is_chat_participant(conversation_id));

CREATE POLICY "Send Message" ON public.chat_messages
    FOR INSERT WITH CHECK (
        sender_id = auth.uid()
        AND public.is_chat_participant(conversation_id)
    );

CREATE POLICY "Manage Own Read Receipts" ON public.chat_message_reads
    FOR ALL USING (user_id = auth.uid());
