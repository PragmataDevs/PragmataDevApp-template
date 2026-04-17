# DOCUMENTO MAESTRO: ARQUITECTURA PRAGMATA v1.2

**Proyecto:** Plantilla Universal Offline-First (SaaS / Enterprise)
**Stack:** React + Vite + Supabase + PowerSync + Tailwind
**Última Actualización:** 16 de Abril 2026

---

## 1. Stack Tecnológico

| Capa | Tecnología | Función Principal |
| :--- | :--- | :--- |
| **Frontend Core** | React + TypeScript + Vite | Lógica de UI y empaquetado rápido. |
| **Estilos** | Tailwind CSS + shadcn/ui | Sistema de diseño, responsividad y componentes base. |
| **Base de Datos (Nube)** | Supabase (PostgreSQL) | Fuente de la verdad, Auth, Storage y Triggers. |
| **Base de Datos (Local)** | SQLite (WASM) | Base de datos en el navegador para funcionamiento Offline. |
| **Sincronización** | PowerSync | Sincroniza Supabase ↔ SQLite automáticamente (Feature Flag). |
| **Navegación** | React Router DOM | Manejo de rutas anidadas y protección de acceso. |
| **Deployment** | Vercel | Hosting con flujo de ramas (Main, Develop, Preview). |
| **Auth** | Supabase Auth | Sistema de autenticación con JWT. |

---

## 2. Estructura de Directorios (Feature-Based)

Seguimos el patrón de "módulos autocontenidos" (similar a Django Apps).

```text
/src
  ├── App.tsx                     # Shell principal (Providers + Router)
  ├── main.tsx                    # Entry point de React
  ├── app/                        # Navegación y routing
  │   ├── navigation.ts           # Tipos de rutas y contratos de navegación
  │   ├── routes.config.ts        # Catálogo de rutas (globales y de proyecto)
  │   └── router.tsx              # Definición del árbol de rutas
  │
  ├── components/                 # UI "Tonta" (Reutilizable y Genérica)
  │   ├── ui/                     # Shadcn primitives (Button, Card, Input)
  │   └── layout/                 # Estructuras (Sidebar, Header, AppLayout)
  │
  ├── features/                   # Lógica de Negocio (El Núcleo)
  │   ├── auth/                   # Login, Logout, Recuperación
  │   │   ├── components/         # RouteGuard (Protección de rutas)
  │   │   ├── hooks/              # useAuth, usePermission
  │   │   └── providers/          # AuthProvider (Context global)
  │   ├── projects/               # Gestión de proyectos (CRUD, miembros, selector)
  │   │   ├── components/         # UI específica del módulo
  │   │   ├── hooks/              # Querys a Supabase (useProjects)
  │   ├── roles/                  # Gestión de roles y permisos
  │   ├── users/                  # Gestión de usuarios y asignaciones
  │   └── settings/               # Componentes compartidos de configuración
  │
  ├── lib/                        # Infraestructura y Motores
  │   ├── db/                     # Configuración PowerSync + Schema Local
  │   │   ├── index.ts            # Inicialización de PowerSync
  │   │   ├── schema.ts           # Definición de tablas SQLite
  │   │   ├── connector.ts        # Integración con Supabase
  │   │   └── PowerSyncProvider.tsx # React Context Provider (con feature flag)
  │   ├── supabase/               # Cliente Supabase (Auth/Storage)
  │   │   └── index.ts            # Cliente configurado con env vars
  │   └── auth/                   # Helpers de autorización/autenticación
  │
  ├── pages/                      # El Pegamento (Rutas)
  │   ├── auth/                   # Login, callback, reset password
  │   ├── dashboard/              # Dashboard global
  │   ├── profile/                # Perfil de usuario
  │   └── settings/               # Roles, Usuarios, Proyectos
  │
  └── types/                      # Definiciones de TypeScript (DB Interfaces)
```

---

## 3. Entornos y Branches

### 3.1 Estrategia de Branches en Supabase

Usamos **1 proyecto Supabase** con **2 Database Branches**:

```
PragmataDevApp (1 Proyecto Supabase)
├── main (Production)
│   └── IPv4 habilitado ($4/mes)
└── develop (Staging/Development)
    └── Copia completa del schema de main
```

**Qué se COMPARTE (a nivel proyecto):**
- `auth.users` — Pool unificado de autenticación
- Storage Buckets
- Edge Functions (1 solo deploy sirve a ambas branches)
- Supabase Auth Config (providers, templates, URLs)
- Secrets / API Keys

**Qué se SEPARA (por branch/database):**
- Tablas de negocio (`profiles`, `teams`, `projects`, etc.)
- RLS Policies y Triggers
- Datos (cada branch tiene su propia data)

**Implicaciones prácticas:**
- Un usuario creado con `auth.admin.createUser()` existe en ambas branches.
- El `INSERT INTO profiles` va a la branch que corresponda según el `VITE_SUPABASE_URL`.
- Las Edge Functions no necesitan configuración por branch — el frontend ya rutea al entorno correcto.
- Las migraciones SQL se ejecutan por branch desde el Dashboard de Supabase.

**Ventajas:**
- Un solo costo base (~$29/mes: Pro + IPv4)
- Migraciones centralizadas
- Edge Functions desplegadas una sola vez

### 3.2 Instancias de PowerSync

**Estrategia Híbrida: Feature Flag**

Por ahora:
- **Production (main)**: PowerSync **ACTIVADO** (`VITE_ENABLE_POWERSYNC=true`)
- **Development/Staging (develop)**: PowerSync **DESACTIVADO** (`VITE_ENABLE_POWERSYNC=false`)

Cuando crezca el proyecto:
- Crear segunda instancia para develop branch
- Cambiar flag a `true` para ambos entornos

| Entorno | Branch | PowerSync | Costo |
|---------|--------|-----------|-------|
| Production | `main` | ✅ Activado | $4/mes (instancia + IPv4) |
| Development | `develop` | ❌ Desactivado | $0 (fallback a Supabase client) |
| Local | `develop` | ❌ Desactivado | $0 |

### 3.3 Variables de Entorno por Entorno

**Production (Vercel + Branch `main`):**
```env
VITE_SUPABASE_URL=https://sujrpevoqzumivxqeuzq.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_POWERSYNC_URL=https://698671bed930100f5017667f.powersync.journeyapps.com
VITE_ENABLE_POWERSYNC=true
```

**Development/Staging (Vercel Preview + Local + Branch `develop`):**
```env
VITE_SUPABASE_URL=https://sujrpevoqzumivxqeuzq.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_POWERSYNC_URL=https://698671bed930100f5017667f.powersync.journeyapps.com
VITE_ENABLE_POWERSYNC=false
```

---

## 4. Arquitectura de Datos

### 4.1 Modelo de Datos Normalizado

Todas las tablas del sistema seguirán un diseño **Relacional Normalizado (3NF)** estricto.

*   Priorizamos integridad referencial (Foreign Keys) sobre flexibilidad JSONB.
*   Cada entidad tiene su propia tabla. Las relaciones M:N usan tablas pivote explícitas.
*   Usamos `AuditBase` para trazabilidad automática:
    - `id` (UUID, PK)
    - `created_at` (Timestamp)
    - `updated_at` (Timestamp)
    - `created_by` (UUID → auth.users)
    - `updated_by` (UUID → auth.users)
  - `status` (`active` | `deleted`) → Estado de auditoría
  - `deleted_at` (Timestamp nullable) → Marca temporal de borrado lógico

### 4.1.1 Contratos de Frontend y Fuente de Verdad

En Frontend, la **fuente de verdad obligatoria** de contratos de datos es `src/types`.

**Reglas obligatorias:**
- Los modelos de dominio (`Project`, `Profile`, `Team`, `Role`, etc.) deben declararse y mantenerse en `src/types`.
- Hooks, componentes y páginas no deben redefinir modelos de dominio completos si ya existen en `src/types`.
- Los tipos locales dentro de features solo se permiten si son **tipos derivados de presentación o agregación**, por ejemplo: conteos, joins o payloads de UI.
- Cuando un hook necesite enriquecer un modelo, debe hacerlo por extensión o composición sobre el tipo canónico, no copiando la estructura base.

**Patrón recomendado:**

```ts
import type { Project } from '@/types/projects/project';

export interface ProjectWithMembers extends Project {
  member_count: number;
}
```

**Objetivo:**
- Evitar drift entre UI, hooks y dominio.
- Reducir duplicación de contratos.
- Mantener una sola capa confiable para cambios de schema.

### 4.1.2 Tipos Derivados Permitidos

Se consideran válidos fuera de `src/types` únicamente estos casos:

- View models para tablas o cards (`ProjectWithMembers`, `UserWithRole`).
- Payloads de formularios o mutaciones (`ProjectCreatePayload`, `RoleSavePayload`).
- Tipos adaptadores entre Supabase/SQLite y UI cuando cambie el formato de un campo.

Incluso en esos casos, el tipo derivado debe partir del contrato base de `src/types` cuando exista.

### 4.2 Flujo de Datos Híbrido (Implementado)

*   **Lectura (READ):** 
    - Si PowerSync **activo**: Consulta a SQLite Local (instantáneo, offline)
    - Si PowerSync **inactivo**: Consulta directo a Supabase (online)
*   **Escritura (WRITE):** Siempre a Supabase Nube. PowerSync (si activo) detecta el cambio y lo descarga al local automáticamente.

### 4.3 Esquema Multi-Entidad (Abstracto)

Para reutilizar la plantilla, usamos nombres genéricos en la BD y específicos en el Frontend.

*   `teams`: Agrupa personas (Empresa Dueña, Contratistas, Clientes).
*   `projects`: La unidad de trabajo (Obra, Campaña, Caso Legal).
*   `sys_project_access`: Tabla pivote que define quién tiene acceso a qué proyecto.

### 4.4 Seguridad Data-Driven (RBAC Implementado)

Sistema de permisos completamente funcional con RLS y función maestra `check_permission()`.

**Tablas de Seguridad:**
- `sys_resources`: Catálogo inmutable de qué se puede proteger (Páginas, Botones).
- `sys_roles`: Plantillas de permisos (ej: Gerente, Supervisor).
- `sys_role_definitions`: Qué acciones tiene cada rol sobre qué recursos.
- `sys_user_permissions`: La tabla final donde el frontend lee los permisos (aplanados).

**Funciones de Seguridad:**
- `check_permission(resource, action, project_id)`: Valida acceso con double-gate (God/Admin bypass).
- `get_my_team_id()`: Helper SECURITY DEFINER para evitar recursión infinita en RLS.
- `handle_permission_sync()`: Trigger que mantiene `sys_user_permissions` sincronizado.

**RLS Policies Activos:**
- **Profiles**: View Self + View Teammates (sin recursión)
- **Projects**: Double-gate (whitelist + permission check)
- **Teams**: Own team only
- **Permisos**: Sync Own Permissions (para PowerSync)

---

## 5. Estrategia de Rutas y Seguridad (La Cebolla)

La seguridad se aplica en capas concéntricas mediante Layouts y Guards.

### 5.1 Jerarquía de Providers

```tsx
<PowerSyncProvider>          # Feature flag: inicia SQLite si VITE_ENABLE_POWERSYNC=true
  <AuthProvider>             # Carga sesión + perfil desde Supabase
    <RouterProvider>         # Rutas de React Router
      <RouteGuard>           # Valida permisos por ruta
        <AppLayout>          # UI (Header + Sidebar)
          <Outlet />
```

**Optimización aplicada (2026-02):**
- Las páginas se cargan con `React.lazy` y `Suspense` (code-splitting por ruta).
- El fallback visual de carga de rutas está unificado con `RouteLoader`.

### 5.2 Capas de Validación

1. **Capa Pública:** Rutas sin restricción (`/login`, `/`).
2. **Capa AuthProvider:**
   - *Validación:* ¿Existe sesión de Supabase?
   - *Acción:* Si no, el `RouteGuard` redirige a Login. Si sí, carga el perfil desde la DB.
3. **Capa RouteGuard:**
   - *Validación:* ¿El usuario tiene permiso para el `resourceCode` de la ruta?
   - *Acción:* Si no, muestra spinner (loading) o redirige a `/` (forbidden).
4. **Capa ProjectLayout (futuro):**
   - *Validación:* ¿El usuario tiene registro en `sys_project_access` para este projectId?
   - *Acción:* Si no, muestra 403 Forbidden. Si sí, permite módulos internos del proyecto.

### 5.2.1 Ciclo de Vida de Sesión

La sesión se centraliza en `AuthProvider` y sigue este flujo:

1. **Bootstrap inicial**
  - Al montar la app, `AuthProvider` llama `supabase.auth.getSession()`.
  - Si existe usuario autenticado, carga `profile` desde `profiles` y luego permisos desde `sys_user_permissions`.

2. **Suscripción a cambios de auth**
  - `AuthProvider` escucha `supabase.auth.onAuthStateChange(...)`.
  - Ante `SIGNED_IN`, `SIGNED_OUT`, `PASSWORD_RECOVERY` u otros eventos, sincroniza `user`, `profile`, `permissions` y `loading`.

3. **Consumo desacoplado**
  - `useAuth()` expone el estado autenticado (`user`, `profile`, `permissions`, `loading`, `isAuthenticated`).
  - `usePermission()` resuelve permisos sobre el snapshot cargado por `AuthProvider`, sin volver a consultar por cada render.

**Regla operativa:**
- Ningún hook de datos protegido debe asumir que la sesión ya está hidratada en el primer render.

### 5.2.2 Resiliencia de `fetchProfile`

`fetchProfile` puede dispararse desde múltiples fuentes casi al mismo tiempo: bootstrap inicial, eventos de auth, recuperación de password, reconexión o refresco manual. Para evitar requests paralelos y estados inconsistentes, el patrón obligatorio es:

1. **Guard de concurrencia**
  - Mantener un `fetchingProfileRef` en `AuthProvider`.
  - Si ya existe un fetch en curso, salir inmediatamente sin lanzar un segundo request.

2. **Manejo explícito de aborts**
  - Si el error es `AbortError` o su mensaje contiene `aborted`, tratarlo como cancelación esperada.
  - Un abort no debe marcar la sesión como inválida ni dejar el provider en estado `stale`.

3. **Reset garantizado**
  - El guard debe resetearse siempre en `finally`, incluso si falla el request.

```ts
const fetchingProfileRef = useRef(false);

const fetchProfile = async (userId: string) => {
  if (fetchingProfileRef.current) return;
  fetchingProfileRef.current = true;

  try {
   // cargar profile y permissions
  } catch (err: any) {
   if (err?.name === 'AbortError' || /aborted/i.test(err?.message || '')) {
    console.warn('[AuthProvider] fetchProfile aborted, ignoring.');
   } else {
    throw err;
   }
  } finally {
   fetchingProfileRef.current = false;
  }
};
```

### 5.3 Hooks de Seguridad Implementados

- `useAuth()`: Consume AuthContext (user, profile, loading, isAuthenticated)
- `usePermission()`: Valida permisos (`hasPermission(code)`, `isAdmin()`)

### 5.4 Patrón Obligatorio para Hooks Protegidos por Sesión

Todo hook que consulte tablas protegidas por RLS o dependientes del JWT debe seguir este patrón:

1. **Gate por Auth antes del fetch**
  - Leer `loading` e `isAuthenticated` desde `useAuth()`.
  - No ejecutar queries mientras `loading === true`.
  - Si `isAuthenticated === false`, salir temprano y limpiar estados derivados si aplica.

2. **Dependencias correctas del efecto**
  - El `useEffect` inicial debe depender de `loading` e `isAuthenticated`, además de sus dependencias funcionales.
  - El fetch solo corre cuando Auth ya terminó de hidratar.

3. **Retry único ante error de sesión**
  - Si el query falla con errores equivalentes a JWT ausente o sesión no lista (`PGRST301`, `PGRST302`, errores de JWT), intentar `supabase.auth.getSession()` una sola vez.
  - Si la sesión se recupera, reintentar una vez.
  - Si vuelve a fallar, exponer error normal sin loops.

4. **Instrumentación mínima**
  - Loggear retry ejecutado, retry omitido o error definitivo.
  - Mantener la traza suficientemente clara para distinguir error de sesión contra error real de negocio.

**Objetivo:**
- Evitar pantallas vacías por carrera entre render inicial e hidratación de sesión.
- Reducir fallos intermitentes en tablas protegidas por RLS.
- Unificar el comportamiento de hooks online y offline-first.

---

## 6. UI/UX y Responsividad

### 6.1 Mobile First

Todo el CSS de Tailwind se escribe pensando primero en celular.

*   **Móvil:** Elementos apilados (`flex-col`), menú de hamburguesa (`Sheet`), textos legibles.
*   **Desktop (`md:`):** Elementos laterales (`flex-row`), Sidebar fijo, tablas expandidas.

### 6.2 Layout Moderno Implementado

**Componentes:**
- `Header.tsx`: Navbar con hamburger, project selector, avatar dropdown (Mi Perfil, Sign Out)
- `Sidebar.tsx`: Navegación vertical con filtrado de rutas por permisos (`hasPermission`)
- `AppLayout.tsx`: Contenedor que orquesta Header + Sidebar + Outlet

**Características:**
- Gradientes modernos (indigo/purple en avatar)
- Animaciones suaves (fade-in, zoom-in en dropdowns)
- Estado activo visual en rutas (ring + shadow)
- Responsive: Drawer en móvil, sidebar fijo en desktop

### 6.3 Shadcn/ui

No diseñamos componentes desde cero. Usamos la librería `/components/ui` para mantener consistencia visual profesional.

---

## 7. PowerSync: Sincronización Offline-First (Condicional)

### 7.1 Arquitectura de Sync

```
Frontend (React)
    ↓ lee (si VITE_ENABLE_POWERSYNC=true)
SQLite Local (WASM en navegador)
    ↕ sincroniza (WebSocket)
PowerSync Cloud Instance
    ↕ replica (Logical Replication)
Supabase PostgreSQL

Frontend (React)
    ↓ lee (si VITE_ENABLE_POWERSYNC=false)
Supabase Client (Online only)
```

### 7.2 Feature Flag: VITE_ENABLE_POWERSYNC

**En `PowerSyncProvider.tsx`:**
- Si `VITE_ENABLE_POWERSYNC=true`: Inicializa PowerSync, proporciona SQLite local
- Si `VITE_ENABLE_POWERSYNC=false`: Saltea inicialización, fallback a Supabase client directo

**Optimización aplicada (2026-02):**
- La inicialización de PowerSync usa imports dinámicos condicionales.
- `@powersync/*` y `@journeyapps/wa-sqlite` no se cargan en el arranque cuando el flag está en `false`.

**Beneficios:**
- Una sola instancia PowerSync en Production (ahorra $4/mes)
- Development/Staging sin complejidad offline
- Escalable: cambiar flag cuando crezca

### 7.3 Archivos Clave

- `src/lib/db/schema.ts`: Define tablas locales (deben coincidir con Supabase)
- `src/lib/db/connector.ts`: Integración Supabase ↔ PowerSync (uploadData)
- `src/lib/db/index.ts`: Singleton de PowerSyncDatabase
- `src/lib/db/PowerSyncProvider.tsx`: React Context Provider (con feature flag)
- `docs/powersync/sync-rules.yaml`: Define QUÉ datos baja cada usuario

### 7.4 Sync Rules (YAML)

Las reglas se definen en **buckets**:
- `user`: Perfil propio + permisos
- `user_team`: Team del usuario
- `projects`: Proyectos autorizados (vía `sys_project_access`)
- `resources`: Catálogo de recursos del sistema
- `roles`: Roles y definiciones disponibles

**Importante:** Actualizar `sync-rules.yaml` cada vez que se agregue una tabla nueva que deba estar offline.

### 7.5 Scripts de Base de Datos

Orden de ejecución en cada branch:
1. `01_security_engine.sql` - Schema completo (tablas, funciones, RLS)
2. `02_seed_god_user.sql` - Crear primer usuario administrador
3. `03_chat_notifications.sql` - Objetos de chat/notificaciones del sistema
4. `04_powersync_publication.sql` - Habilitar replicación lógica (PowerSync)

---

## 8. Configuración y Feature Flags

La configuración operativa actual se controla por variables de entorno (Vite), especialmente:

- `VITE_ENABLE_POWERSYNC`: activa/desactiva capa offline (SQLite + PowerSync)
- Variables de Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- Variables de PowerSync (`VITE_POWERSYNC_URL`) cuando aplica

No existe actualmente un archivo `src/app/app.config.ts` en esta plantilla.

---

## 9. Checklist de Deployments

### Primer Deploy a Production
- [ ] Ejecutar `01_security_engine.sql` en branch `main` de Supabase
- [ ] Ejecutar `02_seed_god_user.sql` en branch `main` (solo bootstrap inicial)
- [ ] Ejecutar `03_chat_notifications.sql` en branch `main`
- [ ] Ejecutar `04_powersync_publication.sql` en branch(es) que usen PowerSync
- [ ] Deployar Sync Rules en PowerSync Instance (main)
- [ ] Configurar variables en Vercel (Production: VITE_ENABLE_POWERSYNC=true)
- [ ] Probar login y sincronización en staging antes de mergear

### Cuando vayas a Staging+Offline (futuro)
- [ ] Crear segunda instancia PowerSync para branch `develop`
- [ ] Deployar Sync Rules a nueva instancia
- [ ] Cambiar VITE_ENABLE_POWERSYNC=false → true en Vercel Preview
- [ ] Actualizar variable VITE_POWERSYNC_URL para Preview si es diferente

---

## 10. Performance de Bundle (Implementado)

### Estrategia

- **Code-splitting por rutas** con `React.lazy` + `Suspense`.
- **Carga condicional de PowerSync** mediante import dinámico (solo cuando `VITE_ENABLE_POWERSYNC=true`).
- **Manual chunking en build** (`vite.config.ts`) para separar:
  - `react-vendor` (`react`, `react-dom`, `react-router-dom`)
  - `supabase` (`@supabase/*`)
  - `powersync` (`@powersync/*`, `@journeyapps/wa-sqlite`) cuando aplique

### Resultado observado en build

- Antes de chunking manual (post lazy + conditional PowerSync): chunk principal ~`536 kB`.
- Después de chunking manual:
  - `index` ~`183 kB`
  - `react-vendor` ~`190 kB`
  - `supabase` ~`163 kB`
- Se elimina el warning de chunk único `>500 kB` y mejora la estrategia de caché.
