--
-- PostgreSQL database dump
--

-- Dumped from database version 15.8
-- Dumped by pg_dump version 15.8

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: check_permission(text, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_permission(requested_resource text, requested_action text, context_project_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


ALTER FUNCTION public.check_permission(requested_resource text, requested_action text, context_project_id uuid) OWNER TO postgres;

--
-- Name: get_my_entity_ids(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_my_entity_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid();
$$;


ALTER FUNCTION public.get_my_entity_ids() OWNER TO postgres;

--
-- Name: get_my_project_ids(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_my_project_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid();
$$;


ALTER FUNCTION public.get_my_project_ids() OWNER TO postgres;

--
-- Name: get_my_team_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_my_team_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT team_id FROM public.profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION public.get_my_team_id() OWNER TO postgres;

--
-- Name: handle_chat_message_insert(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_chat_message_insert() RETURNS trigger
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


ALTER FUNCTION public.handle_chat_message_insert() OWNER TO postgres;

--
-- Name: handle_notification_broadcast(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_notification_broadcast() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
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


ALTER FUNCTION public.handle_notification_broadcast() OWNER TO postgres;

--
-- Name: handle_permission_sync(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_permission_sync() RETURNS trigger
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


ALTER FUNCTION public.handle_permission_sync() OWNER TO postgres;

--
-- Name: is_chat_participant(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_chat_participant(conv_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.chat_participants
        WHERE conversation_id = conv_id AND user_id = auth.uid()
    );
$$;


ALTER FUNCTION public.is_chat_participant(conv_id uuid) OWNER TO postgres;

--
-- Name: is_god(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_god() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


ALTER FUNCTION public.is_god() OWNER TO postgres;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
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


ALTER FUNCTION public.set_updated_at() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: chat_conversations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text DEFAULT 'individual'::text NOT NULL,
    name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL,
    updated_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT chat_conversations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text]))),
    CONSTRAINT chat_conversations_type_check CHECK ((type = ANY (ARRAY['individual'::text, 'group'::text])))
);

ALTER TABLE ONLY public.chat_conversations REPLICA IDENTITY FULL;


ALTER TABLE public.chat_conversations OWNER TO postgres;

--
-- Name: chat_message_reads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_message_reads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT chat_message_reads_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text])))
);

ALTER TABLE ONLY public.chat_message_reads REPLICA IDENTITY FULL;


ALTER TABLE public.chat_message_reads OWNER TO postgres;

--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    body text,
    type text DEFAULT 'text'::text NOT NULL,
    file_url text,
    file_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT chat_messages_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text]))),
    CONSTRAINT chat_messages_type_check CHECK ((type = ANY (ARRAY['text'::text, 'image'::text, 'file'::text])))
);

ALTER TABLE ONLY public.chat_messages REPLICA IDENTITY FULL;


ALTER TABLE public.chat_messages OWNER TO postgres;

--
-- Name: chat_participants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT chat_participants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text])))
);

ALTER TABLE ONLY public.chat_participants REPLICA IDENTITY FULL;


ALTER TABLE public.chat_participants OWNER TO postgres;

--
-- Name: cms_pages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cms_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    version integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    slug text NOT NULL,
    internal_title text DEFAULT ''::text NOT NULL,
    page_kind text DEFAULT 'standard'::text NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    seo_title text,
    seo_description text,
    og_image_url text,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    body_markdown text,
    CONSTRAINT cms_pages_page_kind_check CHECK ((page_kind = ANY (ARRAY['landing'::text, 'standard'::text]))),
    CONSTRAINT cms_pages_slug_home_kind CHECK (((slug <> 'home'::text) OR (page_kind = 'landing'::text))),
    CONSTRAINT cms_pages_slug_pattern CHECK (((slug = 'home'::text) OR (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text))),
    CONSTRAINT cms_pages_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text])))
);

ALTER TABLE ONLY public.cms_pages REPLICA IDENTITY FULL;


ALTER TABLE public.cms_pages OWNER TO postgres;

--
-- Name: documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    version integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    entity_id uuid,
    team_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    doc_type text,
    bucket text DEFAULT 'documents'::text NOT NULL,
    storage_path text,
    mime_type text,
    file_size bigint,
    doc_status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT documents_doc_status_check CHECK ((doc_status = ANY (ARRAY['pending'::text, 'verified'::text, 'expired'::text, 'rejected'::text]))),
    CONSTRAINT documents_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text])))
);

ALTER TABLE ONLY public.documents REPLICA IDENTITY FULL;


ALTER TABLE public.documents OWNER TO postgres;

--
-- Name: entities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    name text NOT NULL,
    code text,
    description text,
    location text,
    budget numeric(12,2),
    start_date date,
    end_date date,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    entity_status text DEFAULT 'planning'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT entities_entity_status_check CHECK ((entity_status = ANY (ARRAY['planning'::text, 'active'::text, 'completed'::text, 'paused'::text, 'canceled'::text]))),
    CONSTRAINT entities_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text])))
);

ALTER TABLE ONLY public.entities REPLICA IDENTITY FULL;


ALTER TABLE public.entities OWNER TO postgres;

--
-- Name: notification_attachments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notification_id uuid,
    broadcast_id uuid,
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_type text,
    file_size integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT attachment_has_parent CHECK (((notification_id IS NOT NULL) OR (broadcast_id IS NOT NULL))),
    CONSTRAINT notification_attachments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text])))
);

ALTER TABLE ONLY public.notification_attachments REPLICA IDENTITY FULL;


ALTER TABLE public.notification_attachments OWNER TO postgres;

--
-- Name: notification_broadcasts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_broadcasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    type text DEFAULT 'info'::text NOT NULL,
    title text NOT NULL,
    body text,
    action_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT notification_broadcasts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text]))),
    CONSTRAINT notification_broadcasts_target_type_check CHECK ((target_type = ANY (ARRAY['user'::text, 'role'::text, 'all'::text]))),
    CONSTRAINT notification_broadcasts_type_check CHECK ((type = ANY (ARRAY['info'::text, 'action'::text, 'urgent'::text])))
);

ALTER TABLE ONLY public.notification_broadcasts REPLICA IDENTITY FULL;


ALTER TABLE public.notification_broadcasts OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_id uuid NOT NULL,
    sender_id uuid,
    broadcast_id uuid,
    type text DEFAULT 'info'::text NOT NULL,
    title text NOT NULL,
    body text,
    action_url text,
    is_read boolean DEFAULT false NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT notifications_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text]))),
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['info'::text, 'action'::text, 'urgent'::text])))
);

ALTER TABLE ONLY public.notifications REPLICA IDENTITY FULL;


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid,
    product_name text NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    subtotal numeric(12,2) NOT NULL
);

ALTER TABLE ONLY public.order_items REPLICA IDENTITY FULL;


ALTER TABLE public.order_items OWNER TO postgres;

--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    stripe_session_id text,
    stripe_payment_id text,
    amount_total numeric(12,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'mxn'::text NOT NULL,
    order_status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone,
    customer_email text NOT NULL,
    customer_name text,
    customer_phone text,
    customer_user_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT orders_order_status_check CHECK ((order_status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY public.orders REPLICA IDENTITY FULL;


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    version integer DEFAULT 0 NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    category text,
    tags text[],
    price numeric(12,2) DEFAULT 0 NOT NULL,
    compare_at_price numeric(12,2),
    currency text DEFAULT 'MXN'::text NOT NULL,
    image_url text,
    images jsonb DEFAULT '[]'::jsonb NOT NULL,
    seo_title text,
    seo_description text,
    seo_image_url text,
    in_stock boolean DEFAULT true NOT NULL,
    stock_qty integer,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT products_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text, 'draft'::text])))
);

ALTER TABLE ONLY public.products REPLICA IDENTITY FULL;


ALTER TABLE public.products OWNER TO postgres;

--
-- Name: COLUMN products.seo_title; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.products.seo_title IS 'Meta title (opcional).';


--
-- Name: COLUMN products.seo_description; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.products.seo_description IS 'Meta description / OG description (opcional).';


--
-- Name: COLUMN products.seo_image_url; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.products.seo_image_url IS 'OG/Twitter image absoluta https (opcional).';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    avatar_url text,
    job_title text,
    phone text,
    team_id uuid NOT NULL,
    role_id uuid NOT NULL,
    access_level text DEFAULT 'member'::text NOT NULL,
    is_role_synced boolean DEFAULT true NOT NULL,
    role_variables jsonb DEFAULT '{}'::jsonb NOT NULL,
    profile_status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT profiles_access_level_check CHECK ((access_level = ANY (ARRAY['god'::text, 'admin'::text, 'member'::text]))),
    CONSTRAINT profiles_profile_status_check CHECK ((profile_status = ANY (ARRAY['active'::text, 'suspended'::text]))),
    CONSTRAINT profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text])))
);

ALTER TABLE ONLY public.profiles REPLICA IDENTITY FULL;


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: sys_entity_access; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sys_entity_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    team_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT sys_entity_access_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text])))
);

ALTER TABLE ONLY public.sys_entity_access REPLICA IDENTITY FULL;


ALTER TABLE public.sys_entity_access OWNER TO postgres;

--
-- Name: sys_resources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sys_resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    category text,
    type text,
    default_actions text[] DEFAULT ARRAY['read'::text] NOT NULL,
    resource_status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT sys_resources_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text])))
);

ALTER TABLE ONLY public.sys_resources REPLICA IDENTITY FULL;


ALTER TABLE public.sys_resources OWNER TO postgres;

--
-- Name: sys_role_definitions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sys_role_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    resource_code text NOT NULL,
    granted_actions text[] DEFAULT ARRAY[]::text[] NOT NULL,
    conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT sys_role_definitions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text])))
);

ALTER TABLE ONLY public.sys_role_definitions REPLICA IDENTITY FULL;


ALTER TABLE public.sys_role_definitions OWNER TO postgres;

--
-- Name: sys_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sys_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    is_system_role boolean DEFAULT false NOT NULL,
    is_dev_role boolean DEFAULT false NOT NULL,
    can_be_customized boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT sys_roles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text])))
);

ALTER TABLE ONLY public.sys_roles REPLICA IDENTITY FULL;


ALTER TABLE public.sys_roles OWNER TO postgres;

--
-- Name: sys_user_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sys_user_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    team_id uuid NOT NULL,
    resource_code text NOT NULL,
    granted_actions text[] DEFAULT ARRAY[]::text[] NOT NULL,
    conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_customized boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT sys_user_permissions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text])))
);

ALTER TABLE ONLY public.sys_user_permissions REPLICA IDENTITY FULL;


ALTER TABLE public.sys_user_permissions OWNER TO postgres;

--
-- Name: sys_user_preferences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sys_user_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    theme text DEFAULT 'system'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT sys_user_preferences_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text]))),
    CONSTRAINT sys_user_preferences_theme_check CHECK ((theme = ANY (ARRAY['light'::text, 'dark'::text, 'system'::text])))
);

ALTER TABLE ONLY public.sys_user_preferences REPLICA IDENTITY FULL;


ALTER TABLE public.sys_user_preferences OWNER TO postgres;

--
-- Name: task_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    version integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    task_id uuid NOT NULL,
    body text NOT NULL,
    CONSTRAINT task_comments_body_check CHECK ((length(TRIM(BOTH FROM body)) > 0)),
    CONSTRAINT task_comments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text])))
);

ALTER TABLE ONLY public.task_comments REPLICA IDENTITY FULL;


ALTER TABLE public.task_comments OWNER TO postgres;

--
-- Name: tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    version integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    entity_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    assigned_to uuid,
    due_date date,
    priority text DEFAULT 'medium'::text NOT NULL,
    task_status text DEFAULT 'backlog'::text NOT NULL,
    column_order double precision DEFAULT 0 NOT NULL,
    tags text[],
    metadata jsonb,
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text]))),
    CONSTRAINT tasks_task_status_check CHECK ((task_status = ANY (ARRAY['backlog'::text, 'todo'::text, 'in_progress'::text, 'review'::text, 'done'::text]))),
    CONSTRAINT tasks_title_check CHECK ((length(TRIM(BOTH FROM title)) > 0))
);

ALTER TABLE ONLY public.tasks REPLICA IDENTITY FULL;


ALTER TABLE public.tasks OWNER TO postgres;

--
-- Name: teams; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo_url text,
    is_platform_owner boolean DEFAULT false NOT NULL,
    tax_id text,
    address text,
    contact_email text,
    web_url text,
    owner_id uuid,
    team_status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT teams_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text]))),
    CONSTRAINT teams_team_status_check CHECK ((team_status = ANY (ARRAY['active'::text, 'suspended'::text, 'delinquent'::text])))
);

ALTER TABLE ONLY public.teams REPLICA IDENTITY FULL;


ALTER TABLE public.teams OWNER TO postgres;

--
-- Data for Name: chat_conversations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.chat_conversations (id, type, name, created_at, updated_at, created_by, updated_by, status, deleted_at, version) FROM stdin;
\.


--
-- Data for Name: chat_message_reads; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.chat_message_reads (id, message_id, user_id, read_at, created_at, updated_at, created_by, updated_by, status, deleted_at, version) FROM stdin;
\.


--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.chat_messages (id, conversation_id, sender_id, body, type, file_url, file_name, created_at, updated_at, created_by, updated_by, status, deleted_at, version) FROM stdin;
\.


--
-- Data for Name: chat_participants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.chat_participants (id, conversation_id, user_id, joined_at, created_at, updated_at, created_by, updated_by, status, deleted_at, version) FROM stdin;
\.


--
-- Data for Name: cms_pages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cms_pages (id, created_at, updated_at, created_by, updated_by, version, status, deleted_at, slug, internal_title, page_kind, is_published, seo_title, seo_description, og_image_url, content, body_markdown) FROM stdin;
bea1d688-9205-4399-ad2b-4118f28698b8	2026-05-17 20:29:14.305107+00	2026-05-17 20:29:14.305107+00	\N	\N	0	active	\N	home	Landing principal	landing	f	\N	\N	\N	{}	\N
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.documents (id, created_at, updated_at, created_by, updated_by, version, status, deleted_at, entity_id, team_id, name, description, doc_type, bucket, storage_path, mime_type, file_size, doc_status, expires_at, metadata) FROM stdin;
\.


--
-- Data for Name: entities; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.entities (id, team_id, name, code, description, location, budget, start_date, end_date, metadata, entity_status, created_at, updated_at, created_by, updated_by, status, deleted_at, version) FROM stdin;
\.


--
-- Data for Name: notification_attachments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_attachments (id, notification_id, broadcast_id, file_name, file_url, file_type, file_size, created_at, updated_at, created_by, updated_by, status, deleted_at, version) FROM stdin;
\.


--
-- Data for Name: notification_broadcasts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_broadcasts (id, sender_id, target_type, target_id, type, title, body, action_url, created_at, updated_at, created_by, updated_by, status, deleted_at, version) FROM stdin;
da45a906-4542-4e96-bd35-dacd65ef095d	64e40e15-7421-41b5-af97-d9edf2e26e40	all	\N	info	Prueba	P para todos	\N	2026-05-17 21:30:33.173389+00	2026-05-17 21:30:33.173389+00	\N	\N	active	\N	0
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, recipient_id, sender_id, broadcast_id, type, title, body, action_url, is_read, is_archived, read_at, created_at, updated_at, created_by, updated_by, status, deleted_at, version) FROM stdin;
01b3e05c-eba5-466f-b7d0-ecbf1a152338	64e40e15-7421-41b5-af97-d9edf2e26e40	64e40e15-7421-41b5-af97-d9edf2e26e40	da45a906-4542-4e96-bd35-dacd65ef095d	info	Prueba	P para todos	\N	t	t	2026-05-17 21:31:07.915+00	2026-05-17 21:30:33.173389+00	2026-05-18 03:18:23.465571+00	64e40e15-7421-41b5-af97-d9edf2e26e40	\N	active	\N	3
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_items (id, order_id, product_id, product_name, unit_price, quantity, subtotal) FROM stdin;
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, created_at, updated_at, version, stripe_session_id, stripe_payment_id, amount_total, currency, order_status, paid_at, customer_email, customer_name, customer_phone, customer_user_id, metadata) FROM stdin;
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.products (id, created_at, updated_at, created_by, updated_by, version, name, slug, description, category, tags, price, compare_at_price, currency, image_url, images, seo_title, seo_description, seo_image_url, in_stock, stock_qty, status, metadata) FROM stdin;
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.profiles (id, email, full_name, avatar_url, job_title, phone, team_id, role_id, access_level, is_role_synced, role_variables, profile_status, created_at, updated_at, created_by, updated_by, status, deleted_at, version) FROM stdin;
64e40e15-7421-41b5-af97-d9edf2e26e40	ltorres@pragmatadevs.com	System Admin	\N	\N	\N	07c15eb4-99d9-4777-a548-16c865d7dde8	e610fade-020a-4565-96a7-b8a918a33892	god	f	{}	active	2026-05-17 21:22:37.387294+00	2026-05-17 21:22:37.387294+00	\N	\N	active	\N	0
bd72a4bd-77fa-4bc2-98f8-4d701db29143	lotorresm10@gmail.com	luis pruebas	\N	\N	\N	07c15eb4-99d9-4777-a548-16c865d7dde8	a5a6f429-a762-48f4-885d-78e910d37e02	member	t	{}	active	2026-05-17 21:36:26.661754+00	2026-05-17 21:36:26.661754+00	\N	\N	active	\N	0
\.


--
-- Data for Name: sys_entity_access; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sys_entity_access (id, user_id, entity_id, team_id, created_at, updated_at, created_by, updated_by, status, deleted_at, version) FROM stdin;
\.


--
-- Data for Name: sys_resources; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sys_resources (id, code, name, description, category, type, default_actions, resource_status, created_at, updated_at, created_by, updated_by, status, deleted_at, version) FROM stdin;
c8cf4f3e-2210-4ba0-9795-008a5ba237c0	page_settings_roles	Gestión de Roles	Crear, editar y eliminar roles del sistema	Settings	page	{read,create,update,delete}	active	2026-05-17 21:22:47.455715+00	2026-05-17 21:22:47.307+00	\N	\N	active	\N	0
fa6b22fc-3e9d-4bfe-9aaa-8149c5fcbbd4	page_settings_usuarios	Gestión de Usuarios	Crear, editar y administrar usuarios del equipo	Settings	page	{read,create,update,delete}	active	2026-05-17 21:22:47.586567+00	2026-05-17 21:22:47.51+00	\N	\N	active	\N	0
2a67b4f1-db2b-44a2-8ce5-9f6bd27c4911	page_settings_entities	Gestión de Entidades	Crear y administrar entidades (proyectos, obras, clientes, etc.)	Settings	page	{read,create,update,delete}	active	2026-05-17 21:22:47.621719+00	2026-05-17 21:22:47.609+00	\N	\N	active	\N	0
e77371c3-2812-4247-8692-ebf04cf74828	page_workspace_dashboard	Resumen de Workspace	\N	Workspace	page	{read}	active	2026-05-17 21:22:47.641694+00	2026-05-17 21:22:47.632+00	\N	\N	active	\N	0
d3c8c002-895a-486e-835c-2fe9a66660d9	page_workspace_tasks	Tareas (Kanban)	\N	Workspace	page	{read,create,update,delete}	active	2026-05-17 21:22:47.661799+00	2026-05-17 21:22:47.651+00	\N	\N	active	\N	0
7fe98aa8-1753-474a-b925-e02b070eff4c	page_workspace_documents	Documentos	Gestión de documentos de la entidad: contratos, reportes, facturas, etc.	Workspace	page	{read,create,update,delete}	active	2026-05-17 21:22:47.683011+00	2026-05-17 21:22:47.674+00	\N	\N	active	\N	0
cde56627-aae9-4ed9-910b-d467ffed4c5a	page_workspace_config	Configuración del Workspace	\N	Workspace	page	{read,update}	active	2026-05-17 21:22:47.702217+00	2026-05-17 21:22:47.694+00	\N	\N	active	\N	0
9cbd19ea-e7c4-45c3-a322-2047bdd40d55	page_ecommerce_dashboard	Ecommerce — Resumen	KPIs y estado general de ventas y pedidos	Ecommerce	page	{read}	active	2026-05-17 21:22:47.722853+00	2026-05-17 21:22:47.713+00	\N	\N	active	\N	0
c91eac11-d8f2-4dfc-9aee-ff14ae4c4cd6	page_ecommerce_products	Catálogo de Productos	Crear, editar y eliminar productos del catálogo público	Ecommerce	page	{read,create,update,delete}	active	2026-05-17 21:22:47.749195+00	2026-05-17 21:22:47.733+00	\N	\N	active	\N	0
4df07858-eb93-43c5-83dc-2fd78a8bcb26	page_ecommerce_orders	Pedidos	Ver y gestionar los pedidos recibidos	Ecommerce	page	{read,update}	active	2026-05-17 21:22:47.775866+00	2026-05-17 21:22:47.764+00	\N	\N	active	\N	0
08349ee5-e615-47a9-b5f6-494fe0469fa3	action_entity_archive	Archivar Entidad	\N	Actions	action	{execute}	active	2026-05-17 21:22:47.809049+00	2026-05-17 21:22:47.803+00	\N	\N	active	\N	0
90134bcd-d83e-45f2-a52c-d847909f44aa	btn_export_entity_report	Exportar Excel/PDF	\N	Actions	action	{execute}	active	2026-05-17 21:22:47.827547+00	2026-05-17 21:22:47.819+00	\N	\N	active	\N	0
6c933eb5-ab23-4a23-bed7-ae66753c0a6e	feature_chat	Chat	Acceso al sistema de chat (individual y grupal)	Features	action	{read,create}	active	2026-05-17 21:22:47.844967+00	2026-05-17 21:22:47.837+00	\N	\N	active	\N	0
ff947993-dbbb-4d8b-bcd7-0da0601a3fc7	feature_notifications_send	Enviar Notificaciones	Permiso para enviar notificaciones a usuarios, roles o todos	Features	action	{create,broadcast}	active	2026-05-17 21:22:47.859955+00	2026-05-17 21:22:47.854+00	\N	\N	active	\N	0
7a4e0c6e-2d4b-40e2-971f-c75b627a37f9	page_seo_site_pages	Páginas del sitio (CMS)	Editar landing y páginas públicas Markdown	SEO	page	{read,create,update,delete}	active	2026-05-17 21:22:47.794053+00	2026-05-17 22:05:23.466457+00	\N	\N	active	\N	1
\.


--
-- Data for Name: sys_role_definitions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sys_role_definitions (id, role_id, resource_code, granted_actions, conditions, created_at, updated_at, created_by, updated_by, status, deleted_at, version) FROM stdin;
340b5053-abb9-45cf-a30e-7bfb0fdaea18	a5a6f429-a762-48f4-885d-78e910d37e02	page_workspace_dashboard	{read}	{}	2026-05-17 21:31:42.422927+00	2026-05-17 21:31:42.422927+00	\N	\N	active	\N	0
\.


--
-- Data for Name: sys_roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sys_roles (id, name, description, is_system_role, is_dev_role, can_be_customized, created_at, updated_at, created_by, updated_by, status, deleted_at, version) FROM stdin;
e610fade-020a-4565-96a7-b8a918a33892	Super Admin	Rol con acceso total al sistema	f	f	t	2026-05-17 21:22:37.387294+00	2026-05-17 21:22:37.387294+00	\N	\N	active	\N	0
a5a6f429-a762-48f4-885d-78e910d37e02	Rol p	ROL PRUEBA	f	f	t	2026-05-17 21:31:42.368361+00	2026-05-17 21:31:42.368361+00	\N	\N	active	\N	0
\.


--
-- Data for Name: sys_user_permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sys_user_permissions (id, user_id, team_id, resource_code, granted_actions, conditions, is_customized, created_at, updated_at, created_by, updated_by, status, deleted_at, version) FROM stdin;
\.


--
-- Data for Name: sys_user_preferences; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sys_user_preferences (id, user_id, theme, created_at, updated_at, created_by, updated_by, status, deleted_at, version) FROM stdin;
\.


--
-- Data for Name: task_comments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.task_comments (id, created_at, updated_at, created_by, updated_by, version, status, deleted_at, task_id, body) FROM stdin;
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tasks (id, created_at, updated_at, created_by, updated_by, version, status, deleted_at, entity_id, title, description, assigned_to, due_date, priority, task_status, column_order, tags, metadata) FROM stdin;
\.


--
-- Data for Name: teams; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.teams (id, name, slug, logo_url, is_platform_owner, tax_id, address, contact_email, web_url, owner_id, team_status, created_at, updated_at, created_by, updated_by, status, deleted_at, version) FROM stdin;
07c15eb4-99d9-4777-a548-16c865d7dde8	Pragmata Devs	pragmata-devs	\N	t	\N	\N	\N	\N	\N	active	2026-05-17 21:22:37.387294+00	2026-05-17 21:22:37.387294+00	\N	\N	active	\N	0
\.


--
-- Name: chat_conversations chat_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_pkey PRIMARY KEY (id);


--
-- Name: chat_message_reads chat_message_reads_message_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_message_reads
    ADD CONSTRAINT chat_message_reads_message_id_user_id_key UNIQUE (message_id, user_id);


--
-- Name: chat_message_reads chat_message_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_message_reads
    ADD CONSTRAINT chat_message_reads_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_participants chat_participants_conversation_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_participants
    ADD CONSTRAINT chat_participants_conversation_id_user_id_key UNIQUE (conversation_id, user_id);


--
-- Name: chat_participants chat_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_participants
    ADD CONSTRAINT chat_participants_pkey PRIMARY KEY (id);


--
-- Name: cms_pages cms_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cms_pages
    ADD CONSTRAINT cms_pages_pkey PRIMARY KEY (id);


--
-- Name: cms_pages cms_pages_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cms_pages
    ADD CONSTRAINT cms_pages_slug_key UNIQUE (slug);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: entities entities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_pkey PRIMARY KEY (id);


--
-- Name: notification_attachments notification_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_attachments
    ADD CONSTRAINT notification_attachments_pkey PRIMARY KEY (id);


--
-- Name: notification_broadcasts notification_broadcasts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_broadcasts
    ADD CONSTRAINT notification_broadcasts_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: orders orders_stripe_session_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_stripe_session_id_key UNIQUE (stripe_session_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_slug_key UNIQUE (slug);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: sys_entity_access sys_entity_access_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_entity_access
    ADD CONSTRAINT sys_entity_access_pkey PRIMARY KEY (id);


--
-- Name: sys_entity_access sys_entity_access_user_entity_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_entity_access
    ADD CONSTRAINT sys_entity_access_user_entity_unique UNIQUE (user_id, entity_id);


--
-- Name: sys_resources sys_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_resources
    ADD CONSTRAINT sys_resources_pkey PRIMARY KEY (code);


--
-- Name: sys_role_definitions sys_role_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_role_definitions
    ADD CONSTRAINT sys_role_definitions_pkey PRIMARY KEY (id);


--
-- Name: sys_role_definitions sys_role_definitions_role_resource_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_role_definitions
    ADD CONSTRAINT sys_role_definitions_role_resource_unique UNIQUE (role_id, resource_code);


--
-- Name: sys_roles sys_roles_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_roles
    ADD CONSTRAINT sys_roles_name_key UNIQUE (name);


--
-- Name: sys_roles sys_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_roles
    ADD CONSTRAINT sys_roles_pkey PRIMARY KEY (id);


--
-- Name: sys_user_permissions sys_user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_user_permissions
    ADD CONSTRAINT sys_user_permissions_pkey PRIMARY KEY (id);


--
-- Name: sys_user_permissions sys_user_permissions_user_id_resource_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_user_permissions
    ADD CONSTRAINT sys_user_permissions_user_id_resource_code_key UNIQUE (user_id, resource_code);


--
-- Name: sys_user_preferences sys_user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_user_preferences
    ADD CONSTRAINT sys_user_preferences_pkey PRIMARY KEY (id);


--
-- Name: sys_user_preferences sys_user_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_user_preferences
    ADD CONSTRAINT sys_user_preferences_user_id_key UNIQUE (user_id);


--
-- Name: task_comments task_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: teams teams_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_slug_key UNIQUE (slug);


--
-- Name: idx_chat_message_reads_message; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_message_reads_message ON public.chat_message_reads USING btree (message_id);


--
-- Name: idx_chat_message_reads_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_message_reads_user ON public.chat_message_reads USING btree (user_id);


--
-- Name: idx_chat_messages_conv; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_messages_conv ON public.chat_messages USING btree (conversation_id);


--
-- Name: idx_chat_messages_conv_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_messages_conv_created ON public.chat_messages USING btree (conversation_id, created_at DESC);


--
-- Name: idx_chat_participants_conv; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_participants_conv ON public.chat_participants USING btree (conversation_id);


--
-- Name: idx_chat_participants_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_participants_user ON public.chat_participants USING btree (user_id);


--
-- Name: idx_cms_pages_slug_live; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cms_pages_slug_live ON public.cms_pages USING btree (slug) WHERE (status = 'active'::text);


--
-- Name: idx_documents_doc_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_doc_status ON public.documents USING btree (doc_status) WHERE (status = 'active'::text);


--
-- Name: idx_documents_entity_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_entity_id ON public.documents USING btree (entity_id) WHERE (status = 'active'::text);


--
-- Name: idx_documents_team_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_team_id ON public.documents USING btree (team_id) WHERE (status = 'active'::text);


--
-- Name: idx_entities_team; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_entities_team ON public.entities USING btree (team_id);


--
-- Name: idx_entity_access_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_entity_access_user ON public.sys_entity_access USING btree (user_id);


--
-- Name: idx_notification_attachments_broadcast; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notification_attachments_broadcast ON public.notification_attachments USING btree (broadcast_id);


--
-- Name: idx_notification_attachments_notification; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notification_attachments_notification ON public.notification_attachments USING btree (notification_id);


--
-- Name: idx_notifications_broadcast; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_broadcast ON public.notifications USING btree (broadcast_id);


--
-- Name: idx_notifications_recipient; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_recipient ON public.notifications USING btree (recipient_id);


--
-- Name: idx_notifications_recipient_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_recipient_unread ON public.notifications USING btree (recipient_id) WHERE (is_read = false);


--
-- Name: idx_orders_customer_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_customer_email ON public.orders USING btree (customer_email);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_status ON public.orders USING btree (order_status);


--
-- Name: idx_orders_stripe_session; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_stripe_session ON public.orders USING btree (stripe_session_id) WHERE (stripe_session_id IS NOT NULL);


--
-- Name: idx_permissions_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_permissions_user ON public.sys_user_permissions USING btree (user_id);


--
-- Name: idx_products_cat; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_products_cat ON public.products USING btree (category) WHERE (status = 'active'::text);


--
-- Name: idx_products_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_products_slug ON public.products USING btree (slug);


--
-- Name: idx_products_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_products_status ON public.products USING btree (status);


--
-- Name: idx_profiles_team; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_profiles_team ON public.profiles USING btree (team_id);


--
-- Name: idx_role_definitions_role_resource; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_role_definitions_role_resource ON public.sys_role_definitions USING btree (role_id, resource_code);


--
-- Name: idx_task_comments_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_comments_task ON public.task_comments USING btree (task_id);


--
-- Name: idx_tasks_assigned; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_assigned ON public.tasks USING btree (assigned_to);


--
-- Name: idx_tasks_due_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_due_date ON public.tasks USING btree (due_date) WHERE (due_date IS NOT NULL);


--
-- Name: idx_tasks_entity_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_entity_order ON public.tasks USING btree (entity_id, column_order);


--
-- Name: idx_tasks_entity_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_entity_status ON public.tasks USING btree (entity_id, task_status);


--
-- Name: chat_conversations trg_chat_conversations_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_chat_conversations_set_updated_at BEFORE UPDATE ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: chat_message_reads trg_chat_message_reads_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_chat_message_reads_set_updated_at BEFORE UPDATE ON public.chat_message_reads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: chat_messages trg_chat_messages_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_chat_messages_set_updated_at BEFORE UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: chat_participants trg_chat_participants_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_chat_participants_set_updated_at BEFORE UPDATE ON public.chat_participants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: cms_pages trg_cms_pages_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_cms_pages_set_updated_at BEFORE UPDATE ON public.cms_pages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: documents trg_documents_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_documents_set_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: entities trg_entities_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_entities_set_updated_at BEFORE UPDATE ON public.entities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: notification_attachments trg_notification_attachments_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_notification_attachments_set_updated_at BEFORE UPDATE ON public.notification_attachments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: notification_broadcasts trg_notification_broadcasts_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_notification_broadcasts_set_updated_at BEFORE UPDATE ON public.notification_broadcasts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: notifications trg_notifications_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_notifications_set_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: orders trg_orders_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_orders_set_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: products trg_products_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles trg_profiles_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sys_entity_access trg_sys_entity_access_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sys_entity_access_set_updated_at BEFORE UPDATE ON public.sys_entity_access FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sys_resources trg_sys_resources_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sys_resources_set_updated_at BEFORE UPDATE ON public.sys_resources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sys_role_definitions trg_sys_role_definitions_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sys_role_definitions_set_updated_at BEFORE UPDATE ON public.sys_role_definitions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sys_roles trg_sys_roles_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sys_roles_set_updated_at BEFORE UPDATE ON public.sys_roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sys_user_permissions trg_sys_user_permissions_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sys_user_permissions_set_updated_at BEFORE UPDATE ON public.sys_user_permissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sys_user_preferences trg_sys_user_preferences_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sys_user_preferences_set_updated_at BEFORE UPDATE ON public.sys_user_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: task_comments trg_task_comments_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_task_comments_set_updated_at BEFORE UPDATE ON public.task_comments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tasks trg_tasks_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_tasks_set_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: teams trg_teams_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_teams_set_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: chat_messages trigger_chat_message_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_chat_message_insert AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.handle_chat_message_insert();


--
-- Name: notification_broadcasts trigger_notification_broadcast; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_notification_broadcast AFTER INSERT ON public.notification_broadcasts FOR EACH ROW EXECUTE FUNCTION public.handle_notification_broadcast();


--
-- Name: profiles trigger_sync_profile_role; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_sync_profile_role AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_permission_sync();


--
-- Name: sys_role_definitions trigger_sync_role_def; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_sync_role_def AFTER INSERT OR DELETE OR UPDATE ON public.sys_role_definitions FOR EACH ROW EXECUTE FUNCTION public.handle_permission_sync();


--
-- Name: chat_conversations chat_conversations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: chat_conversations chat_conversations_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: chat_message_reads chat_message_reads_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_message_reads
    ADD CONSTRAINT chat_message_reads_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: chat_message_reads chat_message_reads_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_message_reads
    ADD CONSTRAINT chat_message_reads_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_message_reads chat_message_reads_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_message_reads
    ADD CONSTRAINT chat_message_reads_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: chat_message_reads chat_message_reads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_message_reads
    ADD CONSTRAINT chat_message_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: chat_participants chat_participants_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_participants
    ADD CONSTRAINT chat_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chat_participants chat_participants_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_participants
    ADD CONSTRAINT chat_participants_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: chat_participants chat_participants_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_participants
    ADD CONSTRAINT chat_participants_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: chat_participants chat_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_participants
    ADD CONSTRAINT chat_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: cms_pages cms_pages_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cms_pages
    ADD CONSTRAINT cms_pages_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: cms_pages cms_pages_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cms_pages
    ADD CONSTRAINT cms_pages_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: documents documents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: documents documents_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE SET NULL;


--
-- Name: documents documents_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: documents documents_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: entities entities_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: entities entities_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: entities entities_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profiles fk_profiles_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT fk_profiles_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profiles fk_profiles_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT fk_profiles_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sys_resources fk_sys_resources_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_resources
    ADD CONSTRAINT fk_sys_resources_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sys_resources fk_sys_resources_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_resources
    ADD CONSTRAINT fk_sys_resources_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sys_role_definitions fk_sys_role_definitions_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_role_definitions
    ADD CONSTRAINT fk_sys_role_definitions_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sys_role_definitions fk_sys_role_definitions_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_role_definitions
    ADD CONSTRAINT fk_sys_role_definitions_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sys_roles fk_sys_roles_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_roles
    ADD CONSTRAINT fk_sys_roles_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sys_roles fk_sys_roles_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_roles
    ADD CONSTRAINT fk_sys_roles_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: teams fk_teams_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT fk_teams_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: teams fk_teams_owner; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT fk_teams_owner FOREIGN KEY (owner_id) REFERENCES public.profiles(id);


--
-- Name: teams fk_teams_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT fk_teams_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notification_attachments notification_attachments_broadcast_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_attachments
    ADD CONSTRAINT notification_attachments_broadcast_id_fkey FOREIGN KEY (broadcast_id) REFERENCES public.notification_broadcasts(id) ON DELETE CASCADE;


--
-- Name: notification_attachments notification_attachments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_attachments
    ADD CONSTRAINT notification_attachments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notification_attachments notification_attachments_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_attachments
    ADD CONSTRAINT notification_attachments_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE;


--
-- Name: notification_attachments notification_attachments_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_attachments
    ADD CONSTRAINT notification_attachments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notification_broadcasts notification_broadcasts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_broadcasts
    ADD CONSTRAINT notification_broadcasts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notification_broadcasts notification_broadcasts_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_broadcasts
    ADD CONSTRAINT notification_broadcasts_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notification_broadcasts notification_broadcasts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_broadcasts
    ADD CONSTRAINT notification_broadcasts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_broadcast_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_broadcast_id_fkey FOREIGN KEY (broadcast_id) REFERENCES public.notification_broadcasts(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: orders orders_customer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_user_id_fkey FOREIGN KEY (customer_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: products products_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: products products_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.sys_roles(id);


--
-- Name: profiles profiles_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- Name: sys_entity_access sys_entity_access_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_entity_access
    ADD CONSTRAINT sys_entity_access_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sys_entity_access sys_entity_access_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_entity_access
    ADD CONSTRAINT sys_entity_access_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;


--
-- Name: sys_entity_access sys_entity_access_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_entity_access
    ADD CONSTRAINT sys_entity_access_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- Name: sys_entity_access sys_entity_access_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_entity_access
    ADD CONSTRAINT sys_entity_access_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sys_entity_access sys_entity_access_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_entity_access
    ADD CONSTRAINT sys_entity_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: sys_role_definitions sys_role_definitions_resource_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_role_definitions
    ADD CONSTRAINT sys_role_definitions_resource_code_fkey FOREIGN KEY (resource_code) REFERENCES public.sys_resources(code) ON DELETE CASCADE;


--
-- Name: sys_role_definitions sys_role_definitions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_role_definitions
    ADD CONSTRAINT sys_role_definitions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.sys_roles(id) ON DELETE CASCADE;


--
-- Name: sys_user_permissions sys_user_permissions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_user_permissions
    ADD CONSTRAINT sys_user_permissions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sys_user_permissions sys_user_permissions_resource_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_user_permissions
    ADD CONSTRAINT sys_user_permissions_resource_code_fkey FOREIGN KEY (resource_code) REFERENCES public.sys_resources(code) ON DELETE CASCADE;


--
-- Name: sys_user_permissions sys_user_permissions_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_user_permissions
    ADD CONSTRAINT sys_user_permissions_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- Name: sys_user_permissions sys_user_permissions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_user_permissions
    ADD CONSTRAINT sys_user_permissions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sys_user_permissions sys_user_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_user_permissions
    ADD CONSTRAINT sys_user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: sys_user_preferences sys_user_preferences_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_user_preferences
    ADD CONSTRAINT sys_user_preferences_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sys_user_preferences sys_user_preferences_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_user_preferences
    ADD CONSTRAINT sys_user_preferences_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sys_user_preferences sys_user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sys_user_preferences
    ADD CONSTRAINT sys_user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: task_comments task_comments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: task_comments task_comments_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_comments task_comments_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: chat_participants Add Participant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Add Participant" ON public.chat_participants FOR INSERT WITH CHECK ((public.is_god() OR (user_id = auth.uid()) OR public.is_chat_participant(conversation_id) OR (EXISTS ( SELECT 1
   FROM public.chat_conversations
  WHERE ((chat_conversations.id = chat_participants.conversation_id) AND (chat_conversations.created_by = auth.uid()))))));


--
-- Name: teams Admin Edit Team; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin Edit Team" ON public.teams FOR UPDATE USING ((public.is_god() OR public.check_permission('page_settings_usuarios'::text, 'update'::text)));


--
-- Name: sys_entity_access Admin Manage Entity Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin Manage Entity Access" ON public.sys_entity_access USING ((public.is_god() OR public.check_permission('page_settings_entities'::text, 'update'::text)));


--
-- Name: sys_user_permissions Admin Manage Permissions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin Manage Permissions" ON public.sys_user_permissions USING ((public.is_god() OR public.check_permission('page_settings_usuarios'::text, 'update'::text)));


--
-- Name: profiles Admin Manage Profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin Manage Profiles" ON public.profiles USING ((public.is_god() OR (id = auth.uid()) OR public.check_permission('page_settings_usuarios'::text, 'update'::text)));


--
-- Name: sys_resources Admin Write Resources; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin Write Resources" ON public.sys_resources USING ((public.is_god() OR public.check_permission('page_settings_roles'::text, 'update'::text)));


--
-- Name: sys_role_definitions Admin Write RoleDefs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin Write RoleDefs" ON public.sys_role_definitions USING ((public.is_god() OR public.check_permission('page_settings_roles'::text, 'update'::text)));


--
-- Name: sys_roles Admin Write Roles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin Write Roles" ON public.sys_roles USING ((public.is_god() OR public.check_permission('page_settings_roles'::text, 'update'::text)));


--
-- Name: chat_conversations Create Conversation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Create Conversation" ON public.chat_conversations FOR INSERT WITH CHECK ((public.is_god() OR (created_by = auth.uid())));


--
-- Name: profiles Edit Self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Edit Self" ON public.profiles FOR UPDATE USING ((public.is_god() OR (id = auth.uid())));


--
-- Name: notification_attachments Insert Notification Attachments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Insert Notification Attachments" ON public.notification_attachments FOR INSERT WITH CHECK ((public.is_god() OR public.check_permission('feature_notifications_send'::text, 'create'::text)));


--
-- Name: entities Manage Entities; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Manage Entities" ON public.entities USING ((public.is_god() OR public.check_permission('page_settings_entities'::text, 'update'::text, id)));


--
-- Name: sys_user_preferences Manage Own Preferences; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Manage Own Preferences" ON public.sys_user_preferences USING ((public.is_god() OR (user_id = auth.uid())));


--
-- Name: chat_message_reads Manage Own Read Receipts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Manage Own Read Receipts" ON public.chat_message_reads USING ((public.is_god() OR (user_id = auth.uid())));


--
-- Name: sys_resources Public Read Resources; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public Read Resources" ON public.sys_resources FOR SELECT USING (true);


--
-- Name: sys_role_definitions Public Read RoleDefs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public Read RoleDefs" ON public.sys_role_definitions FOR SELECT USING (true);


--
-- Name: sys_roles Public Read Roles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public Read Roles" ON public.sys_roles FOR SELECT USING (true);


--
-- Name: notification_broadcasts Send Broadcast; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Send Broadcast" ON public.notification_broadcasts FOR INSERT WITH CHECK ((public.is_god() OR public.check_permission('feature_notifications_send'::text, 'broadcast'::text)));


--
-- Name: notifications Send Direct Notification; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Send Direct Notification" ON public.notifications FOR INSERT WITH CHECK ((public.is_god() OR ((sender_id = auth.uid()) AND public.check_permission('feature_notifications_send'::text, 'create'::text))));


--
-- Name: chat_messages Send Message; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Send Message" ON public.chat_messages FOR INSERT WITH CHECK ((public.is_god() OR ((sender_id = auth.uid()) AND public.is_chat_participant(conversation_id))));


--
-- Name: sys_entity_access Sync Own Entity Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Sync Own Entity Access" ON public.sys_entity_access FOR SELECT USING ((public.is_god() OR (user_id = auth.uid())));


--
-- Name: sys_user_permissions Sync Own Permissions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Sync Own Permissions" ON public.sys_user_permissions FOR SELECT USING ((public.is_god() OR (user_id = auth.uid())));


--
-- Name: notifications Update Own Notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Update Own Notifications" ON public.notifications FOR UPDATE USING ((public.is_god() OR (recipient_id = auth.uid())));


--
-- Name: entities View Authorized Entities; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "View Authorized Entities" ON public.entities FOR SELECT USING ((public.is_god() OR (id IN ( SELECT sys_entity_access.entity_id
   FROM public.sys_entity_access
  WHERE (sys_entity_access.user_id = auth.uid()))) OR public.check_permission('page_settings_entities'::text, 'read'::text)));


--
-- Name: chat_messages View Conversation Messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "View Conversation Messages" ON public.chat_messages FOR SELECT USING ((public.is_god() OR public.is_chat_participant(conversation_id)));


--
-- Name: chat_participants View Conversation Participants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "View Conversation Participants" ON public.chat_participants FOR SELECT USING ((public.is_god() OR public.is_chat_participant(conversation_id)));


--
-- Name: sys_entity_access View Entity Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "View Entity Access" ON public.sys_entity_access FOR SELECT USING ((public.is_god() OR (entity_id IN ( SELECT public.get_my_entity_ids() AS get_my_entity_ids))));


--
-- Name: chat_conversations View My Conversations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "View My Conversations" ON public.chat_conversations FOR SELECT USING ((public.is_god() OR (created_by = auth.uid()) OR public.is_chat_participant(id)));


--
-- Name: notification_attachments View Notification Attachments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "View Notification Attachments" ON public.notification_attachments FOR SELECT USING ((public.is_god() OR (notification_id IN ( SELECT notifications.id
   FROM public.notifications
  WHERE (notifications.recipient_id = auth.uid()))) OR (broadcast_id IN ( SELECT notifications.broadcast_id
   FROM public.notifications
  WHERE (notifications.recipient_id = auth.uid())))));


--
-- Name: notification_broadcasts View Own Broadcasts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "View Own Broadcasts" ON public.notification_broadcasts FOR SELECT USING ((public.is_god() OR (sender_id = auth.uid()) OR (id IN ( SELECT notifications.broadcast_id
   FROM public.notifications
  WHERE (notifications.recipient_id = auth.uid())))));


--
-- Name: notifications View Own Notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "View Own Notifications" ON public.notifications FOR SELECT USING ((public.is_god() OR (recipient_id = auth.uid())));


--
-- Name: teams View Own Team; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "View Own Team" ON public.teams FOR SELECT USING ((public.is_god() OR (id IN ( SELECT profiles.team_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));


--
-- Name: profiles View Self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "View Self" ON public.profiles FOR SELECT USING ((public.is_god() OR (id = auth.uid())));


--
-- Name: profiles View Teammates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "View Teammates" ON public.profiles FOR SELECT USING ((public.is_god() OR (team_id = public.get_my_team_id())));


--
-- Name: chat_conversations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_message_reads; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_message_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_participants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: cms_pages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: cms_pages cms_pages_public_select_published; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY cms_pages_public_select_published ON public.cms_pages FOR SELECT USING (((status = 'active'::text) AND (is_published = true)));


--
-- Name: cms_pages cms_pages_staff_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY cms_pages_staff_insert ON public.cms_pages FOR INSERT WITH CHECK ((public.is_god() OR public.check_permission('page_seo_site_pages'::text, 'create'::text)));


--
-- Name: cms_pages cms_pages_staff_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY cms_pages_staff_select ON public.cms_pages FOR SELECT USING ((public.is_god() OR public.check_permission('page_seo_site_pages'::text, 'read'::text)));


--
-- Name: cms_pages cms_pages_staff_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY cms_pages_staff_update ON public.cms_pages FOR UPDATE USING ((public.is_god() OR public.check_permission('page_seo_site_pages'::text, 'update'::text))) WITH CHECK ((public.is_god() OR public.check_permission('page_seo_site_pages'::text, 'update'::text)));


--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: documents documents_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY documents_delete ON public.documents FOR DELETE USING (public.is_god());


--
-- Name: documents documents_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY documents_insert ON public.documents FOR INSERT WITH CHECK ((public.is_god() OR ((auth.uid() IS NOT NULL) AND (team_id = ( SELECT profiles.team_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))))));


--
-- Name: documents documents_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY documents_select ON public.documents FOR SELECT USING ((public.is_god() OR ((team_id = ( SELECT profiles.team_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND ((entity_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.sys_entity_access
  WHERE ((sys_entity_access.user_id = auth.uid()) AND (sys_entity_access.entity_id = documents.entity_id))))))));


--
-- Name: documents documents_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY documents_update ON public.documents FOR UPDATE USING ((public.is_god() OR ((team_id = ( SELECT profiles.team_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND public.check_permission('documents'::text, 'update'::text, entity_id))));


--
-- Name: entities; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_attachments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notification_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_broadcasts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notification_broadcasts ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items order_items_insert_service; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY order_items_insert_service ON public.order_items FOR INSERT WITH CHECK (public.is_god());


--
-- Name: order_items order_items_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY order_items_select ON public.order_items FOR SELECT USING ((public.is_god() OR (EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = order_items.order_id) AND ((orders.customer_user_id = auth.uid()) OR public.is_god()))))));


--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders_insert_service; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY orders_insert_service ON public.orders FOR INSERT WITH CHECK (public.is_god());


--
-- Name: orders orders_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY orders_select ON public.orders FOR SELECT USING ((public.is_god() OR (customer_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.access_level = 'admin'::text))))));


--
-- Name: orders orders_update_service; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY orders_update_service ON public.orders FOR UPDATE USING (public.is_god());


--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: products products_select_public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY products_select_public ON public.products FOR SELECT USING ((status = 'active'::text));


--
-- Name: products products_write_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY products_write_admin ON public.products USING ((public.is_god() OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.access_level = ANY (ARRAY['god'::text, 'admin'::text])))))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: sys_entity_access; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.sys_entity_access ENABLE ROW LEVEL SECURITY;

--
-- Name: sys_resources; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.sys_resources ENABLE ROW LEVEL SECURITY;

--
-- Name: sys_role_definitions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.sys_role_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: sys_roles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.sys_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: sys_user_permissions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.sys_user_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: sys_user_preferences; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.sys_user_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: task_comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: task_comments task_comments_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_comments_delete ON public.task_comments FOR DELETE USING ((public.is_god() OR (created_by = auth.uid()) OR public.check_permission('page_workspace_tasks'::text, 'delete'::text)));


--
-- Name: task_comments task_comments_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_comments_insert ON public.task_comments FOR INSERT WITH CHECK ((public.is_god() OR ((created_by = auth.uid()) AND (task_id IN ( SELECT tasks.id
   FROM public.tasks
  WHERE (tasks.entity_id IN ( SELECT sys_entity_access.entity_id
           FROM public.sys_entity_access
          WHERE (sys_entity_access.user_id = auth.uid()))))))));


--
-- Name: task_comments task_comments_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_comments_select ON public.task_comments FOR SELECT USING ((public.is_god() OR ((status = 'active'::text) AND (task_id IN ( SELECT tasks.id
   FROM public.tasks
  WHERE (tasks.entity_id IN ( SELECT sys_entity_access.entity_id
           FROM public.sys_entity_access
          WHERE (sys_entity_access.user_id = auth.uid()))))))));


--
-- Name: task_comments task_comments_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_comments_update ON public.task_comments FOR UPDATE USING ((public.is_god() OR (created_by = auth.uid())));


--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks tasks_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tasks_delete ON public.tasks FOR DELETE USING ((public.is_god() OR public.check_permission('page_workspace_tasks'::text, 'delete'::text, entity_id)));


--
-- Name: tasks tasks_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tasks_insert ON public.tasks FOR INSERT WITH CHECK ((public.is_god() OR ((created_by = auth.uid()) AND ((entity_id IN ( SELECT sys_entity_access.entity_id
   FROM public.sys_entity_access
  WHERE (sys_entity_access.user_id = auth.uid()))) OR public.check_permission('page_workspace_tasks'::text, 'create'::text)))));


--
-- Name: tasks tasks_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tasks_select ON public.tasks FOR SELECT USING ((public.is_god() OR ((status = 'active'::text) AND ((entity_id IN ( SELECT sys_entity_access.entity_id
   FROM public.sys_entity_access
  WHERE (sys_entity_access.user_id = auth.uid()))) OR public.check_permission('page_workspace_tasks'::text, 'read'::text)))));


--
-- Name: tasks tasks_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tasks_update ON public.tasks FOR UPDATE USING ((public.is_god() OR ((created_by = auth.uid()) OR (assigned_to = auth.uid())) OR public.check_permission('page_workspace_tasks'::text, 'update'::text, entity_id)));


--
-- Name: teams; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION check_permission(requested_resource text, requested_action text, context_project_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.check_permission(requested_resource text, requested_action text, context_project_id uuid) TO anon;
GRANT ALL ON FUNCTION public.check_permission(requested_resource text, requested_action text, context_project_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.check_permission(requested_resource text, requested_action text, context_project_id uuid) TO service_role;


--
-- Name: FUNCTION get_my_entity_ids(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_my_entity_ids() TO anon;
GRANT ALL ON FUNCTION public.get_my_entity_ids() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_entity_ids() TO service_role;


--
-- Name: FUNCTION get_my_project_ids(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_my_project_ids() TO anon;
GRANT ALL ON FUNCTION public.get_my_project_ids() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_project_ids() TO service_role;


--
-- Name: FUNCTION get_my_team_id(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_my_team_id() TO anon;
GRANT ALL ON FUNCTION public.get_my_team_id() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_team_id() TO service_role;


--
-- Name: FUNCTION handle_chat_message_insert(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_chat_message_insert() TO anon;
GRANT ALL ON FUNCTION public.handle_chat_message_insert() TO authenticated;
GRANT ALL ON FUNCTION public.handle_chat_message_insert() TO service_role;


--
-- Name: FUNCTION handle_notification_broadcast(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_notification_broadcast() TO anon;
GRANT ALL ON FUNCTION public.handle_notification_broadcast() TO authenticated;
GRANT ALL ON FUNCTION public.handle_notification_broadcast() TO service_role;


--
-- Name: FUNCTION handle_permission_sync(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_permission_sync() TO anon;
GRANT ALL ON FUNCTION public.handle_permission_sync() TO authenticated;
GRANT ALL ON FUNCTION public.handle_permission_sync() TO service_role;


--
-- Name: FUNCTION is_chat_participant(conv_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_chat_participant(conv_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_chat_participant(conv_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_chat_participant(conv_id uuid) TO service_role;


--
-- Name: FUNCTION is_god(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_god() TO anon;
GRANT ALL ON FUNCTION public.is_god() TO authenticated;
GRANT ALL ON FUNCTION public.is_god() TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: TABLE chat_conversations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.chat_conversations TO anon;
GRANT ALL ON TABLE public.chat_conversations TO authenticated;
GRANT ALL ON TABLE public.chat_conversations TO service_role;


--
-- Name: TABLE chat_message_reads; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.chat_message_reads TO anon;
GRANT ALL ON TABLE public.chat_message_reads TO authenticated;
GRANT ALL ON TABLE public.chat_message_reads TO service_role;


--
-- Name: TABLE chat_messages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.chat_messages TO anon;
GRANT ALL ON TABLE public.chat_messages TO authenticated;
GRANT ALL ON TABLE public.chat_messages TO service_role;


--
-- Name: TABLE chat_participants; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.chat_participants TO anon;
GRANT ALL ON TABLE public.chat_participants TO authenticated;
GRANT ALL ON TABLE public.chat_participants TO service_role;


--
-- Name: TABLE cms_pages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.cms_pages TO anon;
GRANT ALL ON TABLE public.cms_pages TO authenticated;
GRANT ALL ON TABLE public.cms_pages TO service_role;


--
-- Name: TABLE documents; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.documents TO anon;
GRANT ALL ON TABLE public.documents TO authenticated;
GRANT ALL ON TABLE public.documents TO service_role;


--
-- Name: TABLE entities; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.entities TO anon;
GRANT ALL ON TABLE public.entities TO authenticated;
GRANT ALL ON TABLE public.entities TO service_role;


--
-- Name: TABLE notification_attachments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notification_attachments TO anon;
GRANT ALL ON TABLE public.notification_attachments TO authenticated;
GRANT ALL ON TABLE public.notification_attachments TO service_role;


--
-- Name: TABLE notification_broadcasts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notification_broadcasts TO anon;
GRANT ALL ON TABLE public.notification_broadcasts TO authenticated;
GRANT ALL ON TABLE public.notification_broadcasts TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE order_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.order_items TO anon;
GRANT ALL ON TABLE public.order_items TO authenticated;
GRANT ALL ON TABLE public.order_items TO service_role;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.orders TO anon;
GRANT ALL ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.products TO anon;
GRANT ALL ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE sys_entity_access; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.sys_entity_access TO anon;
GRANT ALL ON TABLE public.sys_entity_access TO authenticated;
GRANT ALL ON TABLE public.sys_entity_access TO service_role;


--
-- Name: TABLE sys_resources; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.sys_resources TO anon;
GRANT ALL ON TABLE public.sys_resources TO authenticated;
GRANT ALL ON TABLE public.sys_resources TO service_role;


--
-- Name: TABLE sys_role_definitions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.sys_role_definitions TO anon;
GRANT ALL ON TABLE public.sys_role_definitions TO authenticated;
GRANT ALL ON TABLE public.sys_role_definitions TO service_role;


--
-- Name: TABLE sys_roles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.sys_roles TO anon;
GRANT ALL ON TABLE public.sys_roles TO authenticated;
GRANT ALL ON TABLE public.sys_roles TO service_role;


--
-- Name: TABLE sys_user_permissions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.sys_user_permissions TO anon;
GRANT ALL ON TABLE public.sys_user_permissions TO authenticated;
GRANT ALL ON TABLE public.sys_user_permissions TO service_role;


--
-- Name: TABLE sys_user_preferences; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.sys_user_preferences TO anon;
GRANT ALL ON TABLE public.sys_user_preferences TO authenticated;
GRANT ALL ON TABLE public.sys_user_preferences TO service_role;


--
-- Name: TABLE task_comments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.task_comments TO anon;
GRANT ALL ON TABLE public.task_comments TO authenticated;
GRANT ALL ON TABLE public.task_comments TO service_role;


--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tasks TO anon;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;


--
-- Name: TABLE teams; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.teams TO anon;
GRANT ALL ON TABLE public.teams TO authenticated;
GRANT ALL ON TABLE public.teams TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO service_role;


--
-- PostgreSQL database dump complete
--

