-- ==============================================================================
-- PRAGMATA SECURITY ENGINE (v3.0)
-- "The Master Key Framework" + Chat + Notifications (consolidated)
--
-- GOD USER RULE (immutable):
--   access_level = 'god' + team.is_platform_owner = TRUE → BYPASS TOTAL.
--   El god user NO necesita estar en sys_entity_access.
--   El god user NO necesita tener permisos en sys_user_permissions.
--   Ninguna RLS policy puede bloquear al god user.
--   Implementado via: is_god() → usado como primera condición en todas las policies.
--
-- Includes:
-- 1. Core Extensions
-- 2. Generic AuditBase trigger (set_updated_at)
-- 3. Security Catalogs (sys_resources, sys_roles, sys_role_definitions)
-- 4. Business Tables (teams, profiles, entities)
-- 5. Access Control (sys_entity_access, sys_user_permissions, sys_user_preferences)
-- 6. Notifications (broadcasts, notifications, attachments)
-- 7. Chat (conversations, participants, messages, reads)
-- 8. Tasks (tasks, task_comments), Documents, E-commerce (products, orders, order_items), CMS (cms_pages)
-- 9. Logic Functions & Triggers (security engine + chat/notifications)
-- 10. Indexes
-- 11. RLS Policies (the locks)
--
-- Supabase migration: copia de docs/database/01_security_engine.sql — mantener ambos en sync.
-- Incluye tareas, documentos, ecommerce, CMS y bucket product-images; no hay scripts SQL adicionales en docs/database para eso.
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
-- we expose explicit access tables (sys_entity_access, sys_user_permissions)
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
    -- Enforce server-side timestamp (ignore whatever the client sent)
    NEW.updated_at := NOW();
    -- Optimistic Concurrency Control: increment version on every UPDATE.
    -- The client reads the current version, sends it in .eq('version', v),
    -- and checks that the update affected exactly 1 row. If 0 rows were
    -- affected, another writer committed first → conflict detected.
    NEW.version := COALESCE(OLD.version, 0) + 1;
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

-- 4.3 ENTITIES (Business scope — "Proyecto", "Obra", "Cliente", etc.)
-- The UI label is configurable via VITE_ENTITY_LABEL env var.
CREATE TABLE public.entities (
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

    entity_status TEXT NOT NULL DEFAULT 'planning'
        CHECK (entity_status IN ('planning','active','completed','paused','canceled')),

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

-- 5.1 ENTITY SCOPE (Whitelist)
-- POWERSYNC: Defines the "Workspace Bucket" contents.
CREATE TABLE public.sys_entity_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id),

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT sys_entity_access_user_entity_unique UNIQUE (user_id, entity_id)
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
-- 7.x FEATURE MODULES (tasks, documents, ecommerce, cms)
-- Módulos que antes vivían en scripts separados (tasks, documents, ecommerce, cms) están integrados aquí.
-- ------------------------------------------------------------------------------

-- --- TASKS (Kanban) ---
CREATE TABLE IF NOT EXISTS public.tasks (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    version       INTEGER     NOT NULL DEFAULT 0,
    status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    deleted_at    TIMESTAMPTZ,
    entity_id     UUID        NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    title         TEXT        NOT NULL CHECK (length(trim(title)) > 0),
    description   TEXT,
    assigned_to   UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    due_date      DATE,
    priority      TEXT        NOT NULL DEFAULT 'medium'
                                CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    task_status   TEXT        NOT NULL DEFAULT 'backlog'
                                CHECK (task_status IN ('backlog', 'todo', 'in_progress', 'review', 'done')),
    column_order  FLOAT8      NOT NULL DEFAULT 0,
    tags          TEXT[],
    metadata      JSONB
);

CREATE TABLE IF NOT EXISTS public.task_comments (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    version     INTEGER     NOT NULL DEFAULT 0,
    status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    deleted_at  TIMESTAMPTZ,
    task_id     UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    body        TEXT        NOT NULL CHECK (length(trim(body)) > 0)
);

-- --- DOCUMENTS ---
CREATE TABLE IF NOT EXISTS public.documents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL    DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL    DEFAULT now(),
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  version     INTEGER     NOT NULL    DEFAULT 0,
  status      TEXT        NOT NULL    DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  deleted_at  TIMESTAMPTZ,
  entity_id   UUID        REFERENCES public.entities(id) ON DELETE SET NULL,
  team_id     UUID        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  doc_type    TEXT,
  bucket      TEXT        NOT NULL DEFAULT 'documents',
  storage_path TEXT,
  mime_type   TEXT,
  file_size   BIGINT,
  doc_status  TEXT        NOT NULL DEFAULT 'pending'
              CHECK (doc_status IN ('pending', 'verified', 'expired', 'rejected')),
  expires_at  TIMESTAMPTZ,
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb
);

-- --- ECOMMERCE ---
CREATE TABLE IF NOT EXISTS public.products (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  version     INTEGER     NOT NULL DEFAULT 0,
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,
  description TEXT,
  category    TEXT,
  tags        TEXT[],
  price       NUMERIC(12,2) NOT NULL DEFAULT 0,
  compare_at_price NUMERIC(12,2),
  currency    TEXT        NOT NULL DEFAULT 'MXN',
  image_url   TEXT,
  images      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  seo_title       TEXT,
  seo_description TEXT,
  seo_image_url   TEXT,
  in_stock    BOOLEAN     NOT NULL DEFAULT true,
  stock_qty   INTEGER,
  status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted', 'draft')),
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.orders (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  version           INTEGER     NOT NULL DEFAULT 0,
  stripe_session_id TEXT        UNIQUE,
  stripe_payment_id TEXT,
  amount_total      NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency          TEXT        NOT NULL DEFAULT 'mxn',
  order_status      TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (order_status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  paid_at           TIMESTAMPTZ,
  customer_email    TEXT        NOT NULL,
  customer_name     TEXT,
  customer_phone    TEXT,
  customer_user_id  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id  UUID        REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT       NOT NULL,
  unit_price  NUMERIC(12,2) NOT NULL,
  quantity    INTEGER     NOT NULL DEFAULT 1,
  subtotal    NUMERIC(12,2) NOT NULL
);

-- --- CMS (sitio público) ---
CREATE TABLE IF NOT EXISTS public.cms_pages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  version     INTEGER     NOT NULL DEFAULT 0,
  status      TEXT        NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'deleted')),
  deleted_at  TIMESTAMPTZ,
  slug        TEXT        NOT NULL UNIQUE,
  internal_title TEXT     NOT NULL DEFAULT '',
  page_kind   TEXT        NOT NULL DEFAULT 'standard'
              CHECK (page_kind IN ('landing', 'standard')),
  is_published BOOLEAN    NOT NULL DEFAULT false,
  seo_title       TEXT,
  seo_description TEXT,
  og_image_url    TEXT,
  content       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  body_markdown TEXT,
  CONSTRAINT cms_pages_slug_home_kind CHECK (
    slug <> 'home' OR page_kind = 'landing'
  ),
  CONSTRAINT cms_pages_slug_pattern CHECK (
    slug = 'home'
    OR slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);

-- ------------------------------------------------------------------------------
-- 7.5 AUDITBASE: version column (Optimistic Concurrency Control)
-- ------------------------------------------------------------------------------
-- Added separately to avoid repeating it in every CREATE TABLE block above.
-- The `set_updated_at` trigger increments this on every UPDATE.
-- The client sends .eq('version', currentVersion) on writes; 0 rows returned = conflict.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'sys_resources', 'sys_roles', 'sys_role_definitions',
        'teams', 'profiles', 'entities',
        'sys_entity_access', 'sys_user_permissions', 'sys_user_preferences',
        'notification_broadcasts', 'notifications', 'notification_attachments',
        'chat_conversations', 'chat_participants', 'chat_messages', 'chat_message_reads',
        'tasks', 'task_comments', 'documents', 'products', 'orders', 'cms_pages'
    ]
    LOOP
        EXECUTE format(
            'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;',
            t
        );
    END LOOP;
END;
$$;


-- ------------------------------------------------------------------------------
-- 8. LOGIC FUNCTIONS & TRIGGERS
-- ------------------------------------------------------------------------------

-- 8.1 THE MASTER KEY: public.check_permission()
CREATE OR REPLACE FUNCTION public.check_permission(
    requested_resource TEXT,
    requested_action   TEXT,
    context_project_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    current_uid  UUID := auth.uid();
    user_profile public.profiles%ROWTYPE;
    has_action   BOOLEAN;
BEGIN
    IF current_uid IS NULL THEN RETURN FALSE; END IF;

    SELECT * INTO user_profile FROM public.profiles WHERE id = current_uid;
    IF NOT FOUND THEN RETURN FALSE; END IF;

    IF user_profile.profile_status <> 'active' OR user_profile.status <> 'active' THEN
        RETURN FALSE;
    END IF;

    -- GOD: bypass total — ninguna otra regla aplica
    IF user_profile.access_level = 'god' THEN
        IF EXISTS (
            SELECT 1 FROM public.teams
            WHERE id = user_profile.team_id AND is_platform_owner = TRUE
        ) THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- ADMIN: acceso total en su propio equipo
    IF user_profile.access_level = 'admin' THEN
        IF context_project_id IS NOT NULL THEN
            IF EXISTS (
                SELECT 1 FROM public.entities
                WHERE id = context_project_id AND team_id = user_profile.team_id
            ) THEN
                RETURN TRUE;
            END IF;
        ELSE
            RETURN TRUE;
        END IF;
    END IF;

    -- MEMBER: whitelist de entidad + permisos granulares
    IF context_project_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.sys_entity_access
            WHERE user_id = current_uid AND entity_id = context_project_id
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

-- 8.1b HELPER: is_god() — cortocircuito explícito para políticas RLS
-- Usar como PRIMERA condición en todas las policies:  public.is_god() OR ...
-- El god user NUNCA debe ser bloqueado por una política RLS.
CREATE OR REPLACE FUNCTION public.is_god()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.teams t ON t.id = p.team_id
        WHERE p.id    = auth.uid()
          AND p.access_level = 'god'
          AND t.is_platform_owner = TRUE
    );
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

CREATE OR REPLACE FUNCTION public.get_my_entity_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid();
$$;

-- Alias kept for compatibility during migration
CREATE OR REPLACE FUNCTION public.get_my_project_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid();
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
        'entities',
        'sys_entity_access',
        'sys_user_permissions',
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
        'cms_pages'
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
CREATE INDEX idx_profiles_team                  ON public.profiles(team_id);
CREATE INDEX idx_entities_team                  ON public.entities(team_id);
CREATE INDEX idx_permissions_user               ON public.sys_user_permissions(user_id);
CREATE INDEX idx_entity_access_user             ON public.sys_entity_access(user_id);
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

-- Tasks & documents & ecommerce & CMS
CREATE INDEX idx_tasks_entity_status        ON public.tasks(entity_id, task_status);
CREATE INDEX idx_tasks_entity_order         ON public.tasks(entity_id, column_order);
CREATE INDEX idx_tasks_assigned             ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_due_date             ON public.tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_task_comments_task         ON public.task_comments(task_id);

CREATE INDEX idx_documents_entity_id  ON public.documents(entity_id)
  WHERE status = 'active';
CREATE INDEX idx_documents_team_id    ON public.documents(team_id)
  WHERE status = 'active';
CREATE INDEX idx_documents_doc_status ON public.documents(doc_status)
  WHERE status = 'active';

CREATE INDEX idx_products_slug   ON public.products(slug);
CREATE INDEX idx_products_status ON public.products(status);
CREATE INDEX idx_products_cat    ON public.products(category) WHERE status = 'active';

CREATE INDEX idx_orders_status        ON public.orders(order_status);
CREATE INDEX idx_orders_customer_email ON public.orders(customer_email);
CREATE INDEX idx_orders_stripe_session ON public.orders(stripe_session_id) WHERE stripe_session_id IS NOT NULL;

CREATE INDEX idx_cms_pages_slug_live
  ON public.cms_pages (slug)
  WHERE status = 'active';


-- ------------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY
-- ------------------------------------------------------------------------------

-- 10.1 Enable RLS on ALL tables (default deny)
ALTER TABLE public.sys_resources           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_roles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_role_definitions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_entity_access       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_user_permissions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_user_preferences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_reads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_pages               ENABLE ROW LEVEL SECURITY;

-- 10.2 SYSTEM CATALOG POLICIES
CREATE POLICY "Public Read Resources" ON public.sys_resources FOR SELECT USING (true);
CREATE POLICY "Admin Write Resources" ON public.sys_resources FOR ALL USING (
    public.is_god() OR public.check_permission('page_settings_roles', 'update')
);

CREATE POLICY "Public Read Roles" ON public.sys_roles FOR SELECT USING (true);
CREATE POLICY "Admin Write Roles" ON public.sys_roles FOR ALL USING (
    public.is_god() OR public.check_permission('page_settings_roles', 'update')
);

CREATE POLICY "Public Read RoleDefs" ON public.sys_role_definitions FOR SELECT USING (true);
CREATE POLICY "Admin Write RoleDefs" ON public.sys_role_definitions FOR ALL USING (
    public.is_god() OR public.check_permission('page_settings_roles', 'update')
);

-- 10.3 BUSINESS ENTITIES POLICIES
CREATE POLICY "View Own Team" ON public.teams FOR SELECT USING (
    public.is_god()
    OR id IN (SELECT team_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Admin Edit Team" ON public.teams FOR UPDATE USING (
    public.is_god() OR public.check_permission('page_settings_usuarios', 'update')
);

CREATE POLICY "View Self" ON public.profiles FOR SELECT USING (
    public.is_god() OR id = auth.uid()
);
CREATE POLICY "View Teammates" ON public.profiles FOR SELECT USING (
    public.is_god() OR team_id = public.get_my_team_id()
);
CREATE POLICY "Edit Self" ON public.profiles FOR UPDATE USING (
    public.is_god() OR id = auth.uid()
);
CREATE POLICY "Admin Manage Profiles" ON public.profiles FOR ALL USING (
    public.is_god()
    OR id = auth.uid()
    OR public.check_permission('page_settings_usuarios', 'update')
);

-- GOD ve TODAS las entidades sin necesitar sys_entity_access
CREATE POLICY "View Authorized Entities" ON public.entities FOR SELECT USING (
    public.is_god()
    OR id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
    OR public.check_permission('page_settings_entities', 'read')
);
CREATE POLICY "Manage Entities" ON public.entities FOR ALL USING (
    public.is_god() OR public.check_permission('page_settings_entities', 'update', id)
);

-- 10.4 SYNC TABLES (PowerSync specific)
CREATE POLICY "Sync Own Permissions" ON public.sys_user_permissions FOR SELECT USING (
    public.is_god() OR user_id = auth.uid()
);
CREATE POLICY "Admin Manage Permissions" ON public.sys_user_permissions FOR ALL USING (
    public.is_god() OR public.check_permission('page_settings_usuarios', 'update')
);

CREATE POLICY "Sync Own Entity Access" ON public.sys_entity_access FOR SELECT USING (
    public.is_god() OR user_id = auth.uid()
);
CREATE POLICY "View Entity Access" ON public.sys_entity_access FOR SELECT USING (
    public.is_god() OR entity_id IN (SELECT public.get_my_entity_ids())
);
CREATE POLICY "Admin Manage Entity Access" ON public.sys_entity_access FOR ALL USING (
    public.is_god() OR public.check_permission('page_settings_entities', 'update')
);

-- 10.5 USER PREFERENCES
CREATE POLICY "Manage Own Preferences" ON public.sys_user_preferences FOR ALL USING (
    public.is_god() OR user_id = auth.uid()
);

-- 10.6 NOTIFICATIONS
CREATE POLICY "View Own Notifications" ON public.notifications
    FOR SELECT USING (public.is_god() OR recipient_id = auth.uid());

CREATE POLICY "Update Own Notifications" ON public.notifications
    FOR UPDATE USING (public.is_god() OR recipient_id = auth.uid());

CREATE POLICY "Send Direct Notification" ON public.notifications
    FOR INSERT WITH CHECK (
        public.is_god()
        OR (sender_id = auth.uid() AND public.check_permission('feature_notifications_send', 'create'))
    );

CREATE POLICY "Send Broadcast" ON public.notification_broadcasts
    FOR INSERT WITH CHECK (
        public.is_god() OR public.check_permission('feature_notifications_send', 'broadcast')
    );

CREATE POLICY "View Own Broadcasts" ON public.notification_broadcasts
    FOR SELECT USING (
        public.is_god()
        OR sender_id = auth.uid()
        OR id IN (SELECT broadcast_id FROM public.notifications WHERE recipient_id = auth.uid())
    );

CREATE POLICY "View Notification Attachments" ON public.notification_attachments
    FOR SELECT USING (
        public.is_god()
        OR notification_id IN (SELECT id FROM public.notifications WHERE recipient_id = auth.uid())
        OR broadcast_id IN (SELECT broadcast_id FROM public.notifications WHERE recipient_id = auth.uid())
    );

CREATE POLICY "Insert Notification Attachments" ON public.notification_attachments
    FOR INSERT WITH CHECK (
        public.is_god() OR public.check_permission('feature_notifications_send', 'create')
    );

-- 10.7 CHAT
CREATE POLICY "View My Conversations" ON public.chat_conversations
    FOR SELECT USING (
        public.is_god() OR created_by = auth.uid() OR public.is_chat_participant(id)
    );

CREATE POLICY "Create Conversation" ON public.chat_conversations
    FOR INSERT WITH CHECK (public.is_god() OR created_by = auth.uid());

CREATE POLICY "View Conversation Participants" ON public.chat_participants
    FOR SELECT USING (public.is_god() OR public.is_chat_participant(conversation_id));

CREATE POLICY "Add Participant" ON public.chat_participants
    FOR INSERT WITH CHECK (
        public.is_god()
        OR user_id = auth.uid()
        OR public.is_chat_participant(conversation_id)
        OR EXISTS (
            SELECT 1 FROM public.chat_conversations
            WHERE id = conversation_id AND created_by = auth.uid()
        )
    );

CREATE POLICY "View Conversation Messages" ON public.chat_messages
    FOR SELECT USING (public.is_god() OR public.is_chat_participant(conversation_id));

CREATE POLICY "Send Message" ON public.chat_messages
    FOR INSERT WITH CHECK (
        public.is_god()
        OR (sender_id = auth.uid() AND public.is_chat_participant(conversation_id))
    );

CREATE POLICY "Manage Own Read Receipts" ON public.chat_message_reads
    FOR ALL USING (public.is_god() OR user_id = auth.uid());

-- 10.8 TASKS & TASK COMMENTS
CREATE POLICY "tasks_select" ON public.tasks
    FOR SELECT USING (
        public.is_god()
        OR (status = 'active' AND (
            entity_id IN (
                SELECT entity_id FROM public.sys_entity_access
                WHERE user_id = auth.uid()
            )
            OR public.check_permission('page_workspace_tasks', 'read')
        ))
    );

CREATE POLICY "tasks_insert" ON public.tasks
    FOR INSERT WITH CHECK (
        public.is_god()
        OR (created_by = auth.uid() AND (
            entity_id IN (
                SELECT entity_id FROM public.sys_entity_access
                WHERE user_id = auth.uid()
            )
            OR public.check_permission('page_workspace_tasks', 'create')
        ))
    );

CREATE POLICY "tasks_update" ON public.tasks
    FOR UPDATE USING (
        public.is_god()
        OR (created_by = auth.uid() OR assigned_to = auth.uid())
        OR public.check_permission('page_workspace_tasks', 'update', entity_id)
    );

CREATE POLICY "tasks_delete" ON public.tasks
    FOR DELETE USING (
        public.is_god()
        OR public.check_permission('page_workspace_tasks', 'delete', entity_id)
    );

CREATE POLICY "task_comments_select" ON public.task_comments
    FOR SELECT USING (
        public.is_god()
        OR (status = 'active' AND task_id IN (
            SELECT id FROM public.tasks
            WHERE entity_id IN (
                SELECT entity_id FROM public.sys_entity_access
                WHERE user_id = auth.uid()
            )
        ))
    );

CREATE POLICY "task_comments_insert" ON public.task_comments
    FOR INSERT WITH CHECK (
        public.is_god()
        OR (created_by = auth.uid() AND task_id IN (
            SELECT id FROM public.tasks
            WHERE entity_id IN (
                SELECT entity_id FROM public.sys_entity_access
                WHERE user_id = auth.uid()
            )
        ))
    );

CREATE POLICY "task_comments_update" ON public.task_comments
    FOR UPDATE USING (public.is_god() OR created_by = auth.uid());

CREATE POLICY "task_comments_delete" ON public.task_comments
    FOR DELETE USING (
        public.is_god()
        OR created_by = auth.uid()
        OR public.check_permission('page_workspace_tasks', 'delete')
    );

-- 10.9 DOCUMENTS
CREATE POLICY "documents_select" ON public.documents
  FOR SELECT USING (
    public.is_god()
    OR (
      team_id = (SELECT team_id FROM public.profiles WHERE id = auth.uid())
      AND (
        entity_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.sys_entity_access
          WHERE user_id = auth.uid() AND entity_id = documents.entity_id
        )
      )
    )
  );

CREATE POLICY "documents_insert" ON public.documents
  FOR INSERT WITH CHECK (
    public.is_god()
    OR (
      auth.uid() IS NOT NULL
      AND team_id = (SELECT team_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "documents_update" ON public.documents
  FOR UPDATE USING (
    public.is_god()
    OR (
      team_id = (SELECT team_id FROM public.profiles WHERE id = auth.uid())
      AND public.check_permission('page_workspace_documents', 'update', entity_id)
    )
  );

CREATE POLICY "documents_delete" ON public.documents
  FOR DELETE USING (
    public.is_god()
    OR public.check_permission('page_workspace_documents', 'delete', entity_id)
  );

-- 10.10 ECOMMERCE
CREATE POLICY "products_select_public" ON public.products
  FOR SELECT USING (status = 'active');

CREATE POLICY "products_write_admin" ON public.products
  FOR ALL USING (public.is_god() OR (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND access_level IN ('god', 'admin')
    )
  ));

CREATE POLICY "orders_select" ON public.orders
  FOR SELECT USING (
    public.is_god()
    OR customer_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_level = 'admin')
  );

CREATE POLICY "orders_insert_service" ON public.orders
  FOR INSERT WITH CHECK (public.is_god());

CREATE POLICY "orders_update_service" ON public.orders
  FOR UPDATE USING (public.is_god());

CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT USING (
    public.is_god()
    OR EXISTS (
      SELECT 1 FROM public.orders
      WHERE id = order_items.order_id AND (
        customer_user_id = auth.uid()
        OR public.is_god()
      )
    )
  );

CREATE POLICY "order_items_insert_service" ON public.order_items
  FOR INSERT WITH CHECK (public.is_god());

-- 10.11 CMS (sitio público)
CREATE POLICY "cms_pages_public_select_published" ON public.cms_pages
  FOR SELECT USING (status = 'active' AND is_published = true);

CREATE POLICY "cms_pages_staff_select" ON public.cms_pages
  FOR SELECT USING (
    public.is_god()
    OR public.check_permission('page_seo_site_pages', 'read')
  );

CREATE POLICY "cms_pages_staff_insert" ON public.cms_pages
  FOR INSERT WITH CHECK (
    public.is_god()
    OR public.check_permission('page_seo_site_pages', 'create')
  );

CREATE POLICY "cms_pages_staff_update" ON public.cms_pages
  FOR UPDATE USING (
    public.is_god()
    OR public.check_permission('page_seo_site_pages', 'update')
  )
  WITH CHECK (
    public.is_god()
    OR public.check_permission('page_seo_site_pages', 'update')
  );

-- Storage: bucket product-images (catálogo)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "product_images_select" ON storage.objects;
CREATE POLICY "product_images_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_insert" ON storage.objects;
CREATE POLICY "product_images_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "product_images_update" ON storage.objects;
CREATE POLICY "product_images_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "product_images_delete" ON storage.objects;
CREATE POLICY "product_images_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
  );

-- Documents storage bucket RLS
DROP POLICY IF EXISTS "documents_select" ON storage.objects;
CREATE POLICY "documents_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "documents_insert" ON storage.objects;
CREATE POLICY "documents_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "documents_update" ON storage.objects;
CREATE POLICY "documents_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "documents_delete" ON storage.objects;
CREATE POLICY "documents_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
  );

COMMENT ON COLUMN public.products.seo_title IS 'Meta title (opcional).';
COMMENT ON COLUMN public.products.seo_description IS 'Meta description / OG description (opcional).';
COMMENT ON COLUMN public.products.seo_image_url IS 'OG/Twitter image absoluta https (opcional).';

INSERT INTO public.cms_pages (
  slug,
  internal_title,
  page_kind,
  is_published,
  content,
  status
)
VALUES (
  'home',
  'Landing principal',
  'landing',
  false,
  '{}'::jsonb,
  'active'
)
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 10. REALTIME (supabase_realtime) — antes en 20260111120002; idempotente
-- Mantener sincronizado con docs/database/04_realtime_publication.sql
-- ------------------------------------------------------------------------------
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

NOTIFY pgrst, 'reload schema';
