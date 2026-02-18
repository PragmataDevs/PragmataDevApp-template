-- ==============================================================================
-- SCRIPT: CREACIÓN USUARIO DIOS (Manual Seed)
-- ==============================================================================

-- INSTRUCCIONES:
-- 1. Ve a tu App (Localhost) y regístrate en el Login Page (Sign Up).
-- 2. Ve a Supabase Dashboard -> Authentication -> Users.
-- 3. Copia el "User UID" de tu usuario recién creado.
-- 4. Reemplaza 'TU_UUID_AQUI' en el script de abajo.
-- 5. Ejecuta este script en el SQL Editor de Supabase.

-- A. Crear el Equipo "Pragmata Devs"
WITH new_team AS (
  INSERT INTO public.teams (name, slug, is_platform_owner)
  VALUES ('Pragmata Devs', 'pragmata-devs', TRUE)
  RETURNING id
),

-- B. Crear el Rol "Super Admin"
new_role AS (
  INSERT INTO public.sys_roles (name, description, can_be_customized)
  VALUES ('Super Admin', 'Rol con acceso total al sistema', TRUE)
  RETURNING id
)

-- C. Crear tu Perfil de Dios
INSERT INTO public.profiles (
  id,              -- La vinculación con Auth
  email,
  full_name,
  team_id,
  role_id,
  access_level,    -- 'god' = Bypass de seguridad (El verdadero poder)
  is_role_synced
)
SELECT 
  'e9d4c63f-bb11-4fef-89a0-908beaf8e053'::uuid,  -- <=== ⚠️ PEGA TU UUID AQUÍ
  'ltorres@pragmatadevs.com',                  -- (Opcional) Tu email real
  'System Admin',
  new_team.id,
  new_role.id,
  'god',           -- ACTIVANDO MODO DIOS
  FALSE
FROM new_team, new_role;
