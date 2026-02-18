-- ==============================================================================
-- PRAGMATA SECURITY ENGINE (v1.0)
-- "The Master Key Framework"
-- 
-- Includes:
-- 1. Core Extensions
-- 2. Security Tables (RBAC)
-- 3. Business Tables (Profile, Team, Project)
-- 4. Logic Functions & Triggers
-- 5. RLS Policies (The Locks)
--
-- POWERSYNC COMPATIBILITY:
-- This entire schema is designed for "Offline-First" Sync Rules.
-- instead of relying purely on dynamic RLS functions (which don't run on SQLite),
-- we expose explicit access tables (sys_project_access, sys_user_permissions)
-- that PowerSync can read to determine WHAT data to download to the device.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS & TYPES
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 2. SECURITY CATALOGS (Metadata)
-- ------------------------------------------------------------------------------

-- 2.1 RESOURCES (Code Components)
CREATE TABLE public.sys_resources (
    code TEXT PRIMARY KEY, -- 'page_projects', 'btn_approve'
    id UUID DEFAULT gen_random_uuid(), -- AuditBase Compliance
    
    name TEXT NOT NULL,
    description TEXT,
    category TEXT, 
    type TEXT, -- 'page', 'widget', 'action'
    default_actions TEXT[] DEFAULT '{read}',
    
    resource_status TEXT DEFAULT 'active', -- 'active', 'deprecated'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'active' -- AuditBase
);

-- 2.2 ROLES (Permission Templates)
CREATE TABLE public.sys_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    name TEXT NOT NULL UNIQUE, -- 'Gerente', 'Contratista'
    description TEXT,
    
    is_system_role BOOLEAN DEFAULT FALSE, -- Predefined?
    is_dev_role BOOLEAN DEFAULT FALSE,    -- For devs only?
    
    -- DOUBLE-GATE SECURITY:
    -- TRUE: Users with this role CAN have custom permissions.
    -- FALSE: Users must STRICTLY follow the role definition.
    can_be_customized BOOLEAN DEFAULT FALSE, 
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'active' -- AuditBase
);

-- 2.3 ROLE DEFINITIONS (The Template Rules)
CREATE TABLE public.sys_role_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES public.sys_roles(id) ON DELETE CASCADE,
    resource_code TEXT NOT NULL REFERENCES public.sys_resources(code) ON DELETE CASCADE,
    granted_actions TEXT[], -- ['read', 'create']
    conditions JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint de unicidad para la combinación role_id + resource_code
    CONSTRAINT sys_role_definitions_role_resource_unique UNIQUE (role_id, resource_code)
);

-- ------------------------------------------------------------------------------
-- 3. BUSINESS ENTITIES (Simplified 1:1:1 Model)
-- ------------------------------------------------------------------------------

-- 3.1 TEAMS (Tenants)
CREATE TABLE public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    logo_url TEXT,
    is_platform_owner BOOLEAN DEFAULT FALSE, -- 'God Mode' Tenant
    
    -- Business Data
    tax_id TEXT,
    address TEXT,
    contact_email TEXT,
    web_url TEXT,
    
    owner_id UUID, -- Circular dependency resolved later or via application logic
    
    team_status TEXT CHECK (team_status IN ('active', 'suspended', 'delinquent')) DEFAULT 'active',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'active', -- AuditBase (active/deleted)
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 3.2 PROFILES (The User + The Employee)
-- POWERSYNC: This is the anchor table. Sync Rule: SELECT * FROM profiles WHERE id = auth.uid()
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Identity
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    job_title TEXT, -- Decorative
    phone TEXT,

    -- Security Contract (1 Team, 1 Role)
    team_id UUID NOT NULL REFERENCES public.teams(id),
    role_id UUID NOT NULL REFERENCES public.sys_roles(id),
    
    access_level TEXT CHECK (access_level IN ('god', 'admin', 'member')) DEFAULT 'member',
    
    -- FLEXIBILITY SWITCH:
    -- TRUE: Permissions = Mirror of Role.
    -- FALSE: Permissions = Custom (Manual).
    is_role_synced BOOLEAN DEFAULT TRUE,
    
    role_variables JSONB DEFAULT '{}'::jsonb, -- {'seniority': 'junior'}

    -- Status
    profile_status TEXT CHECK (profile_status IN ('active', 'suspended')) DEFAULT 'active',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'active', -- AuditBase
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Fix Circular Dependency
ALTER TABLE public.teams ADD CONSTRAINT fk_teams_owner FOREIGN KEY (owner_id) REFERENCES public.profiles(id);

-- 3.3 PROJECTS (Scopes)
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
    metadata JSONB DEFAULT '{}'::jsonb,

    project_status TEXT CHECK (project_status IN ('planning', 'active', 'completed', 'paused', 'canceled')) DEFAULT 'planning',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'active', -- AuditBase
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    created_by UUID REFERENCES public.profiles(id),
    updated_by UUID REFERENCES public.profiles(id)
);

-- ------------------------------------------------------------------------------
-- 4. ACCESS CONTROL LISTS (The Runtime Data)
-- ------------------------------------------------------------------------------

-- 4.1 PROJECT SCOPE (Whitelist)
-- POWERSYNC: This table DEFINES the "Project Bucket" contents. 
-- Sync Rule: Download projects WHERE id IN (SELECT project_id FROM sys_project_access WHERE user_id = auth.uid())
CREATE TABLE public.sys_project_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id), -- Denormalized for speed
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4.2 EFFECTIVE PERMISSIONS (The Cache)
-- Logic: If is_role_synced=TRUE, this is a copy of RoleDefinitions.
--        If is_role_synced=FALSE, this is managed manually.
-- POWERSYNC: Replicate this table for the logged-in user so the UI can hide/show buttons offline.
CREATE TABLE public.sys_user_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id),
    
    resource_code TEXT NOT NULL REFERENCES public.sys_resources(code) ON DELETE CASCADE,
    granted_actions TEXT[], -- ['read', 'write']
    conditions JSONB,
    
    is_customized BOOLEAN DEFAULT FALSE, -- Audit trail
    
    UNIQUE(user_id, resource_code)
);

-- 4.3 USER PREFERENCES (Personal settings: theme, locale, etc.)
CREATE TABLE public.sys_user_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    theme TEXT CHECK (theme IN ('light', 'dark', 'system')) DEFAULT 'system',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 5. THE SECURITY ENGINE (Functions)
-- ------------------------------------------------------------------------------

-- 5.1 THE MASTER KEY: public.check_permission()
CREATE OR REPLACE FUNCTION public.check_permission(
    requested_resource TEXT,
    requested_action TEXT,
    context_project_id UUID DEFAULT NULL
) 
RETURNS BOOLEAN 
LANGUAGE plpgsql 
SECURITY DEFINER -- Runs with elevated privileges
AS $$
DECLARE
    current_uid UUID;
    user_profile RECORD;
    has_action BOOLEAN;
BEGIN
    current_uid := auth.uid();
    
    -- 1. Check Authentication
    IF current_uid IS NULL THEN 
        RETURN FALSE; 
    END IF;

    -- 2. Get Profile & Security Context (Fast Lookup)
    SELECT * INTO user_profile FROM public.profiles WHERE id = current_uid;
    
    -- Not found or Suspended? Block.
    IF user_profile IS NULL OR user_profile.profile_status != 'active' OR user_profile.status != 'active' THEN
        RETURN FALSE;
    END IF;

    -- 3. GOD MODE / ADMIN MODE
    -- If user is 'god' (and team is owner), allow everything.
    IF user_profile.access_level = 'god' THEN
        -- Verify team is platform owner (Double check)
        IF EXISTS (SELECT 1 FROM public.teams WHERE id = user_profile.team_id AND is_platform_owner = TRUE) THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- If user is 'admin', allow everything STRICTLY WITHIN their team.
    IF user_profile.access_level = 'admin' THEN
        -- If project context is provided, ensure it belongs to their team
        IF context_project_id IS NOT NULL THEN
             IF EXISTS (SELECT 1 FROM public.projects WHERE id = context_project_id AND team_id = user_profile.team_id) THEN
                RETURN TRUE;
             END IF;
        ELSE
            -- Global team action? Yes.
            RETURN TRUE;
        END IF;
    END IF;

    -- 4. MEMBER LEVEL CHECKS
    
    -- 4.1 Project Scope Check (If context is specific)
    IF context_project_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.sys_project_access WHERE user_id = current_uid AND project_id = context_project_id) THEN
            RETURN FALSE; -- Not in the project whitelist
        END IF;
    END IF;

    -- 4.2 Resource Permission Check (The Granular Part)
    SELECT TRUE INTO has_action 
    FROM public.sys_user_permissions 
    WHERE user_id = current_uid 
      AND resource_code = requested_resource
      AND granted_actions @> ARRAY[requested_action]::text[]; -- Contains action?

    RETURN COALESCE(has_action, FALSE);
END;
$$;

-- 5.1.B HELPER: public.get_my_team_id()
-- Prevents RLS infinite recursion by bypassing security for team_id lookup.
CREATE OR REPLACE FUNCTION public.get_my_team_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT team_id FROM public.profiles WHERE id = auth.uid();
$$;

-- 5.1.C HELPER: public.get_my_project_ids()
-- Prevents RLS infinite recursion on sys_project_access self-referencing policies.
CREATE OR REPLACE FUNCTION public.get_my_project_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT project_id FROM public.sys_project_access WHERE user_id = auth.uid();
$$;


-- 5.2 THE SYNC ENGINE: handle_role_sync()
-- Refreshes permissions when Role Definitions change OR Profile changes.
CREATE OR REPLACE FUNCTION public.handle_permission_sync()
RETURNS TRIGGER AS $$
BEGIN
    -- Scenario A: A Role Definition Changed (Refresh all synced users of that role)
    IF (TG_TABLE_NAME = 'sys_role_definitions') THEN
        -- Delete old permissions for synced users
        DELETE FROM public.sys_user_permissions
        WHERE user_id IN (SELECT id FROM public.profiles WHERE role_id = OLD.role_id AND is_role_synced = TRUE)
          AND resource_code = OLD.resource_code;
          
        -- Insert new permissions (Logic handled by application or separate bulk insert? 
        -- Better: Just nuke and rebuild for safety in simple architecture).
        -- NOTE: For robust systems, usually the App calls a "Refresh Permissions" RPC.
        -- But here is a lightweight DB approach:
        INSERT INTO public.sys_user_permissions (user_id, team_id, resource_code, granted_actions, conditions)
        SELECT p.id, p.team_id, NEW.resource_code, NEW.granted_actions, NEW.conditions
        FROM public.profiles p
        WHERE p.role_id = NEW.role_id AND p.is_role_synced = TRUE
        ON CONFLICT (user_id, resource_code) DO UPDATE 
        SET granted_actions = EXCLUDED.granted_actions, conditions = EXCLUDED.conditions;
        
        RETURN NEW;
    END IF;

    -- Scenario B: A User Profile Changed (Role or Sync Status)
    IF (TG_TABLE_NAME = 'profiles') THEN
        -- Only if role changed or sync was turned ON
        IF (OLD.role_id IS DISTINCT FROM NEW.role_id) OR (OLD.is_role_synced = FALSE AND NEW.is_role_synced = TRUE) THEN
            
            -- 1. Nuke current permissions
            DELETE FROM public.sys_user_permissions WHERE user_id = NEW.id;

            -- 2. If Synced, Copy from Role
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
$$ LANGUAGE plpgsql;


-- 5.3 ATTACH TRIGGERS
-- Trigger on Role Definitions
DROP TRIGGER IF EXISTS trigger_sync_role_def ON public.sys_role_definitions;
CREATE TRIGGER trigger_sync_role_def
AFTER INSERT OR UPDATE OR DELETE ON public.sys_role_definitions
FOR EACH ROW EXECUTE FUNCTION public.handle_permission_sync();

-- Trigger on Profiles
DROP TRIGGER IF EXISTS trigger_sync_profile_role ON public.profiles;
CREATE TRIGGER trigger_sync_profile_role
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_permission_sync();

-- ------------------------------------------------------------------------------
-- 6. INDEXES (Speed)
-- ------------------------------------------------------------------------------
CREATE INDEX idx_profiles_team ON public.profiles(team_id);
CREATE INDEX idx_projects_team ON public.projects(team_id);
CREATE INDEX idx_permissions_user ON public.sys_user_permissions(user_id);
CREATE INDEX idx_project_access_user ON public.sys_project_access(user_id);
CREATE INDEX idx_role_definitions_role_resource ON public.sys_role_definitions(role_id, resource_code);


-- ------------------------------------------------------------------------------
-- 7. LOCKING THE DOORS (RLS Policies)
-- ------------------------------------------------------------------------------

-- 7.1 Enable RLS on ALL Tables (Default Deny)
ALTER TABLE public.sys_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_role_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_project_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_user_preferences ENABLE ROW LEVEL SECURITY;

-- 7.2 SYSTEM CATALOG POLICIES (Resources & Roles)
-- Everyone can READ (needed for App to load), only GOD/ADMIN can WRITE.

-- Resources
CREATE POLICY "Public Read Resources" ON public.sys_resources FOR SELECT USING (true);
CREATE POLICY "Admin Write Resources" ON public.sys_resources FOR ALL USING (
    public.check_permission('page_settings_roles', 'update')
);

-- Roles
CREATE POLICY "Public Read Roles" ON public.sys_roles FOR SELECT USING (true);
CREATE POLICY "Admin Write Roles" ON public.sys_roles FOR ALL USING (
    public.check_permission('page_settings_roles', 'update')
);

-- Role Definitions
CREATE POLICY "Public Read RoleDefs" ON public.sys_role_definitions FOR SELECT USING (true);
CREATE POLICY "Admin Write RoleDefs" ON public.sys_role_definitions FOR ALL USING (
    public.check_permission('page_settings_roles', 'update')
);

-- 7.3 BUSINESS ENTITIES POLICIES

-- Teams (See own team only)
CREATE POLICY "View Own Team" ON public.teams FOR SELECT USING (
    id IN (SELECT team_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Admin Edit Team" ON public.teams FOR UPDATE USING (
    public.check_permission('page_settings_usuarios', 'update')
);

-- Profiles (See teammates, Edit self)
-- Fix: We need a "View Self" policy first to avoid infinite recursion when querying team_id in "View Teammates"
CREATE POLICY "View Self" ON public.profiles FOR SELECT USING (
    id = auth.uid()
);

-- Fix: Use SECURITY DEFINER function to avoid RLS loop on team_id lookup
CREATE POLICY "View Teammates" ON public.profiles FOR SELECT USING (
    team_id = public.get_my_team_id()
);

CREATE POLICY "Edit Self" ON public.profiles FOR UPDATE USING (
    id = auth.uid()
);
CREATE POLICY "Admin Manage Profiles" ON public.profiles FOR ALL USING (
    public.check_permission('page_settings_usuarios', 'update')
);

-- Projects (The Double Gate: Whitelist + Permission)
-- Read: Must be in sys_project_access OR have Global Admin rights
CREATE POLICY "View Authorized Projects" ON public.projects FOR SELECT USING (
    id IN (SELECT project_id FROM public.sys_project_access WHERE user_id = auth.uid())
    OR 
    public.check_permission('page_settings_proyectos', 'read') -- Admin Override
);

-- Write: Must pass strict permission check
CREATE POLICY "Manage Projects" ON public.projects FOR ALL USING (
    public.check_permission('page_settings_proyectos', 'update', id)
);

-- 7.4 SYNC TABLES (PowerSync specific)
-- Users must be able to sync their OWN permission rows to local device.

CREATE POLICY "Sync Own Permissions" ON public.sys_user_permissions FOR SELECT USING (
    user_id = auth.uid()
);
CREATE POLICY "Admin Manage Permissions" ON public.sys_user_permissions FOR ALL USING (
    public.check_permission('page_settings_usuarios', 'update')
);

CREATE POLICY "Sync Own Project Access" ON public.sys_project_access FOR SELECT USING (
    user_id = auth.uid()
);

-- View access rows for projects you belong to (see teammates)
-- Uses SECURITY DEFINER function to avoid infinite recursion
CREATE POLICY "View Project Access" ON public.sys_project_access FOR SELECT USING (
    project_id IN (SELECT public.get_my_project_ids())
);

-- Admins can add/remove project members
CREATE POLICY "Admin Manage Project Access" ON public.sys_project_access FOR ALL USING (
    public.check_permission('page_settings_proyectos', 'update')
);

-- 7.5 USER PREFERENCES (Each user manages their own)
CREATE POLICY "Manage Own Preferences" ON public.sys_user_preferences FOR ALL USING (
    user_id = auth.uid()
);
