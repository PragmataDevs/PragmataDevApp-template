# DOCUMENTO MAESTRO: ARQUITECTURA PRAGMATA v2.0

**Proyecto:** Plantilla Universal — Fábrica de Software Industrial (SaaS / Enterprise / Ecommerce / IA)
**Stack:** React + Vite + Astro + Supabase + PowerSync + Tailwind + pgvector
**Última Actualización:** 8 de Mayo 2026

---

## 0. Manifiesto: La Fábrica de Software Industrial

PragmataDevs opera como una **fábrica de software modular**. No construimos aplicaciones aisladas. Construimos un **Chasis Universal** capaz de desplegar tres canales de negocio desde una única fuente de verdad:

| Pilar | Stack | Propósito | Feature Flag |
| :--- | :--- | :--- | :--- |
| **Público** (SEO/Ecommerce) | Astro + Tailwind | Web ultrarrápida, SEO técnico, catálogo, tienda | ERP catálogo admin: `VITE_ENABLE_ECOMMERCE`; sitio público: `PUBLIC_ENABLE_ECOMMERCE` |
| **Operativo** (ERP/Admin) | React + Vite + Supabase | Dashboard ERP, CRUD, permisos, reportes | siempre activo |
| **Intelligence** (IA Core) | Edge Functions + pgvector + LLMs | Búsqueda semántica, resúmenes, extracción de datos | `VITE_ENABLE_AI` |

**Principios de ingeniería industrial aplicados al código:**
- **Estandarización Total:** Una entidad = un solo modelo TypeScript que extiende `AuditBase`. Prohibido crear variaciones.
- **Desacoplamiento de Infraestructura:** Auth, DB y Sync son intercambiables via Provider Pattern.
- **Offline-First / Online-Fit:** PowerSync + SQLite activable por `.env`. Si el cliente no requiere offline → `VITE_ENABLE_POWERSYNC=false`.
- **Módulos Prendibles/Apagables:** Ecommerce, IA y Sync se activan/desactivan via `.env`. No son decisiones arquitectónicas irreversibles.

---

---

## 1. Stack Tecnológico

### 1.1 Pilar Operativo (ERP/Admin) — Core

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

### 1.2 Pilar Público (SEO/Ecommerce)

| Capa | Tecnología | Función Principal |
| :--- | :--- | :--- |
| **Framework Web** | Astro 4+ | SSG/SSR ultrarrápido, 0 JS por defecto, SEO técnico. |
| **Islas React** | `@astrojs/react` | Componentes interactivos (carrito, filtros) como islas hidratadas. |
| **Imágenes** | `<Image>` de Astro | Optimización automática: WebP, lazy load, responsive. |
| **Base de Datos** | Supabase (anon key, solo lectura pública) | Catálogo, precios, stock — RLS `SELECT` público. |
| **Payments** | Stripe / MercadoPago (Edge Function) | Checkout seguro via Edge Function intermedia. |
| **Deployment** | Vercel (SSR) o Netlify (SSG) | CDN global, preview por rama. |

### 1.3 Pilar Intelligence (IA Core)

| Capa | Tecnología | Función Principal |
| :--- | :--- | :--- |
| **Embeddings** | pgvector (PostgreSQL) | Búsqueda semántica sobre datos del negocio. |
| **LLM Gateway** | Supabase Edge Functions | Intermediario seguro entre cliente y APIs de IA. |
| **Modelos** | OpenAI / Anthropic / Gemini | Generación, resúmenes, extracción de datos. |
| **Vectorización** | `text-embedding-3-small` (OpenAI) | Embeddings de documentos y registros. |
| **UI IA** | `src/features/ai/` | Componentes de búsqueda, resumen y asistente. |

---

## 2. Estructura de Directorios (Monorepo Feature-Based)

Seguimos el patrón de "módulos autocontenidos" (similar a Django Apps).

Para añadir un módulo nuevo de forma repetible, usar **`docs/playbook-new-module.md`** (10 pasos: SQL → tipo → hook → rutas → RBAC → sidebar).

### Pilar Operativo (`/src`)

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
  │   ├── entities/               # Gestión de entidades (CRUD, miembros, EntitySelector)
  │   │   ├── hooks/useEntities.ts
  │   │   └── components/EntitySelector.tsx
  │   ├── tasks/                  # Kanban (Workspace module)
  │   ├── roles/                  # Gestión de roles y permisos
  │   ├── users/                  # Gestión de usuarios y asignaciones
  │   ├── settings/               # Componentes compartidos de configuración
  │   └── ai/                     # [VITE_ENABLE_AI] Módulo de IA
  │       ├── components/         # AISearch, AISummaryPanel, AIAssistant
  │       └── hooks/              # useAISearch, useAISummarize
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
  │   ├── settings/               # Roles, Usuarios, Entidades
  │   ├── workspace/              # Contexto Entity: resumen, tareas, documentos, config
  │   └── ecommerce/             # [VITE_ENABLE_ECOMMERCE] Resumen, productos, ventas
  │
  └── types/                      # Definiciones de TypeScript (DB Interfaces)
      ├── core/base.ts            # AuditBase — la raíz de todo modelo
      ├── entities/entity.ts      # Entity (canon). VITE_ENTITY_LABEL define el label en UI
      └── <dominio>/              # Un archivo por entidad de negocio
```

---

## 2b. Navegación y Layouts

### Estructura Visual Canónica

```
┌─ Navbar (Header) ──────────────────────────────────────────┐
│  [≡ Mobile]  [EntitySelector¹]      [Chat][🔔][👤 Perfil] │
└────────────────────────────────────────────────────────────┘
┌─ Sidebar ──────┐  ┌─ Content Area ─────────────────────────┐
│ 🏠 Dashboard   │  │                                         │
│ 👤 Mi Perfil   │  │   <Outlet />  (page content)            │
│ ────────────── │  │                                         │
│ ⚙ Configuración│  └─────────────────────────────────────────┘
│   Roles        │
│   Usuarios     │
│   Entidades    │
│ ────────────── │
│ ▼ Workspace²   │
│   Resumen      │
│   Tareas       │
└────────────────┘

¹ EntitySelector: visible en navbar cuando VITE_ENABLE_MULTI_ENTITY=true
² Workspace: links SIEMPRE clickeables — nunca griseados ni deshabilitados
```

### Orden del Sidebar (FIJO e INMUTABLE)

1. Rutas globales sin grupo → Dashboard, Mi Perfil
2. `────` separador
3. **Configuración** (grupo `settings`) → Roles, Usuarios, Entidades
4. `────` separador
5. **Workspace** (sección dinámica) → rutas del contexto de Entity activo

> ❌ **Prohibido** poner Workspace antes de Configuración.
> ❌ **Prohibido** mover el EntitySelector al sidebar.

### Layouts

| Layout | Archivo | Propósito |
|---|---|---|
| `AppLayout` | `components/layout/AppLayout.tsx` | Shell universal (Sidebar + Header + Outlet). Envuelve **todas** las rutas autenticadas, incluyendo workspace. |
| `WorkspaceLayout` | `components/layout/WorkspaceLayout.tsx` | Solo renderiza `<Outlet />`. Provee contexto de Entity. **Sin sidebar propio.** |
| `PublicLayout` | `components/layout/PublicLayout.tsx` | Rutas sin autenticación (login, landing). |

### Árbol de Rutas

```
/ (PublicLayout)
  /login, /auth/callback, /auth/reset-password

/ (AppLayout — TODAS las rutas autenticadas)
  /dashboard
  /profile
  /settings/roles
  /settings/usuarios
  /settings/entities

  /workspace/:entityId  (WorkspaceLayout — Outlet only)
    /dashboard
    /tasks
    /config            (hideInMenu: true)

  /workspace/none/:ruta  ← fallback cuando entityId aún no está resuelto.
                           La página hace auto-redirect o muestra empty state.
```

### Entity vs "Proyecto" — Terminología

| Nivel | Nombre canónico | Ejemplo de label por cliente |
|---|---|---|
| Código / DB | `Entity` / `entities` | — (no cambia) |
| URL params | `:entityId` | — (no cambia) |
| UI / Frontend | `VITE_ENTITY_LABEL` | `"Proyecto"`, `"Obra"`, `"Cliente"`, `"Caso"` |

### Resolución del Entity Activo — `useActiveEntity`

El sidebar nunca bloquea el acceso al Workspace. El hook `useActiveEntity` resuelve el entityId automáticamente. Depende de `isAuthenticated` y `sessionEpoch` de `useAuth()` para re-ejecutarse cuando la sesión cambia.

```
Prioridad:
  1. URL params   /workspace/:entityId/*   ← fuente de verdad dentro del workspace
  2. localStorage  pragmata_last_entity_id  ← última entity visitada
  3. Primera entity activa (orden alfabético) ← fetch automático a Supabase
                                               Solo se ejecuta si isAuthenticated=true
  4. null — no existen entities todavía
```

**Comportamiento del botón "Workspace" en el sidebar:**
- Dentro de `/workspace/*`: toggle del submenú.
- Fuera de workspace: navega directo a `/workspace/:resolvedId/dashboard`.

**Comportamiento de los links del submenú (Resumen, Tareas, etc.):**
- **Siempre son `<NavLink>` clickeables**, nunca `<div>` deshabilitados.
- Con `activeEntityId` resuelto → `/workspace/:entityId/:ruta`.
- Sin resolver → `/workspace/none/:ruta`.
- La página en `/workspace/none/*` espera al hook y hace auto-redirect cuando llega el ID, o muestra empty state si no hay entities en DB.

> ❌ **Prohibido** griseado o `cursor-default` en links del submenú Workspace.
> ❌ **Prohibido** requerir interacción con EntitySelector para acceder al Workspace.

### EntitySelector — Reglas de Visibilidad

El `EntitySelector` vive en el **Navbar (Header)**, no en el sidebar.  
Se renderiza **únicamente** cuando se cumplen las dos condiciones simultáneamente:

1. `VITE_ENABLE_MULTI_ENTITY=true`
2. La ruta activa está dentro de `/workspace/:entityId/*`

En cualquier otra ruta (Dashboard, Configuración, Perfil) el selector **no aparece**.

```tsx
// Implementación canónica en Header.tsx
const isInWorkspace = !!useMatch('/workspace/:entityId/*');
{MULTI_ENTITY_ENABLED && isInWorkspace && <EntitySelector />}
```

> ❌ **Prohibido** mostrar el EntitySelector fuera de rutas `/workspace/*`.  
> ❌ **Prohibido** mover el EntitySelector al sidebar.

### Feature Flags de Navegación

| Variable | Default | Efecto |
|---|---|---|
| `VITE_ENTITY_LABEL` | `"Entidad"` | Label visible en UI para el concepto de Entity |
| `VITE_ENABLE_MULTI_ENTITY` | `true` | Habilita el EntitySelector (solo visible en rutas `/workspace/*`) |

### Pilar Público (`astro/`) — Astro

```text
astro/
  src/
    pages/                 # .astro — landing, catálogo, checkout (hybrid SSR donde aplica)
    components/islands/    # React (carrito, checkout)
    layouts/
      BaseLayout.astro     # SEO base (<title>, OG, JSON-LD)
    lib/
      supabase.ts          # Cliente público (anon)
  astro.config.mjs         # hybrid + @astrojs/node; env desde raíz del monorepo
  tailwind.config.mjs      # Extiende tailwind raíz; content apunta a astro/src
```

### Pilar Intelligence (`supabase/functions`) — Edge Functions

```text
supabase/functions/
  ai-task-summary/        # Resumen de tareas (OpenAI) — plantilla actual
  stripe-checkout/
  stripe-webhook/
  _shared/
    auth.ts
    cors.ts
```

*(Roadmap típico: `ai-search`, extracción de documentos, etc.; siguen el mismo patrón `_shared` + secrets en Dashboard.)*

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
- Tablas de negocio (`profiles`, `teams`, `entities`, …)
- RLS Policies y Triggers
- Datos (cada branch tiene su propia data)

**Implicaciones prácticas:**
- Un usuario creado con `auth.admin.createUser()` existe en ambas branches.
- El `INSERT INTO profiles` va a la branch que corresponda según el `VITE_SUPABASE_URL`.
- Las Edge Functions no necesitan configuración por branch — el frontend ya rutea al entorno correcto.
- El schema por branch debe mantenerse alineado: flujo **industrial** = SQL versionado en `supabase/migrations/` y aplicación con **`supabase db push`** tras `supabase link` al proyecto/ref correcto (staging vs prod). Los scripts de referencia siguen en `docs/database/*.sql` (véase `docs/SETUP.md` §3). El SQL Editor del Dashboard sigue siendo válido para prototipos o parches puntuales, pero la fuente de verdad del factory template es el repo + CLI.

**Ventajas:**
- Un solo costo base (~$29/mes: Pro + IPv4)
- Migraciones centralizadas y repetibles (CLI + Git)
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
*   **`AuditBase` es OBLIGATORIO.** Toda tabla de negocio (y por tanto todo modelo de dominio en `src/types`) **debe** extender `AuditBase`. No hay excepciones para entidades de negocio. Las únicas excepciones permitidas son tablas puramente sistémicas/inmutables (catálogos como `sys_resources`) y vistas/proyecciones materializadas. Si una tabla nueva no puede extender `AuditBase`, requiere justificación explícita en el PR.
*   `AuditBase` provee:
    - `id` (UUID, PK)
    - `created_at` (Timestamp)
    - `updated_at` (Timestamp)
    - `created_by` (UUID → auth.users)
    - `updated_by` (UUID → auth.users)
    - `status` (`active` | `deleted`) → Estado de auditoría
    - `deleted_at` (Timestamp nullable) → Marca temporal de borrado lógico

### 4.1.1 Modelo Único como Fuente de Verdad

> **Regla de oro: una entidad → un modelo canónico → un único archivo en `src/types`.**
> Este modelo es lo único que existe para representar esa entidad en todo el sistema: tipo TS, estado del form, payload a Supabase. No hay transformaciones, no hay copies, no hay wrappers.

#### Definición del modelo

Cada entidad nueva se define así y nada más:

```ts
// src/types/contratos/contrato.ts
import type { AuditBase } from '@/types/core/base';

export interface Contrato extends AuditBase {
  numero:        string;
  nombre:        string;
  monto_total:   number;
  proyecto_id:   string;
  fecha_inicio:  string;       // ISO 8601
  fecha_fin:     string | null;
  notas:         string | null;
  // …los campos que necesite el negocio
}
```

Eso es todo. No hay `ContratoCreatePayload`, no hay `ContratoFormState`, no hay `ContratoDTO`. **Un solo tipo.**

- La definición vive en `src/types/<dominio>/<entidad>.ts` y **siempre** extiende `AuditBase`.
- **PROHIBIDO** redeclarar el modelo en hooks, componentes, páginas o servicios. Quien lo necesite lo importa.
- **PROHIBIDO** mantener "casi-copias" con campos sueltos para "lo que necesita esa pantalla".
- Cuando hay desfase entre lo que devuelve la query y el modelo, **se ajusta la query**, no se inventa un tipo paralelo.

#### Función `createEmpty<Entidad>()`

Para crear una instancia en blanco se usa un helper que vive junto al tipo:

```ts
// src/types/contratos/contrato.ts  (mismo archivo)
export function createEmptyContrato(userId: string): Contrato {
  return {
    id:           crypto.randomUUID(),
    created_at:   new Date().toISOString(),
    updated_at:   new Date().toISOString(),
    created_by:   userId,
    updated_by:   userId,
    version:      0,   // El trigger lo incrementa a 1 en el primer UPDATE
    status:       'active',
    deleted_at:   null,
    // campos de negocio en blanco:
    numero:       '',
    nombre:       '',
    monto_total:  0,
    proyecto_id:  '',
    fecha_inicio: new Date().toISOString(),
    fecha_fin:    null,
    notas:        null,
  };
}
```

#### Patrón obligatorio: ciclo de vida completo en un hook/componente

```ts
// ✅ Correcto — el modelo canónico es el único estado, desde el blank hasta Supabase
const { profile } = useAuth();
const [contrato, setContrato] = useState<Contrato>(() =>
  createEmptyContrato(profile.id)
);

// Inputs mutan directamente el modelo canónico:
<Input
  value={contrato.nombre}
  onChange={(e) => setContrato((c) => ({ ...c, nombre: e.target.value }))}
/>

// Persistir: se refresca AuditBase y se manda el objeto COMPLETO tal cual
// El .eq('version', ...) activa el Optimistic Concurrency Control (ver §4.1.3)
async function guardar() {
  const toPersist: Contrato = {
    ...contrato,
    updated_at: new Date().toISOString(),
    updated_by: profile.id,
  };

  const isNew = contrato.version === 0;

  if (isNew) {
    const { data, error } = await supabase.from('contratos').insert(toPersist).select().single();
    if (error) throw error;
    setContrato(data as Contrato); // version sigue en 0; el trigger la sube en el primer UPDATE
  } else {
    // UPDATE con optimistic lock: falla silenciosamente si version cambió
    const { data, error } = await supabase
      .from('contratos')
      .update(toPersist)
      .eq('id', toPersist.id)
      .eq('version', toPersist.version) // <-- lock clave
      .select()
      .single();
    if (error) throw error;
    if (!data) {
      // Conflicto: otro usuario grabó antes — recargar y notificar al usuario
      await cargar(toPersist.id);
      throw new Error('conflict'); // el componente muestra un aviso
    }
    setContrato(data as Contrato); // contiene la version incrementada por el trigger
  }
}

// Editar: se carga desde Supabase/SQLite tal cual, con auditoría intacta
async function cargar(id: string) {
  const { data } = await supabase.from('contratos').select('*').eq('id', id).single();
  setContrato(data as Contrato);
}

// Borrado lógico: nunca DELETE, siempre mutar status
async function eliminar() {
  const deleted: Contrato = {
    ...contrato,
    status:     'deleted',
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: profile.id,
  };
  await supabase.from('contratos').upsert(deleted);
}
```

```ts
// ❌ Prohibido: estado paralelo separado del modelo canónico
interface ContratoFormState { nombre: string; monto: number; }
const [form, setForm] = useState<ContratoFormState>({ nombre: '', monto: 0 });

// ❌ Prohibido: wrapper / payload que descarta AuditBase
type ContratoPayload = Omit<Contrato, keyof AuditBase>;
const payload: ContratoPayload = { numero: '001', nombre: '...', ... };
await supabase.from('contratos').insert(payload); // pierde toda la trazabilidad

// ❌ Prohibido: redeclarar el modelo dentro de un hook o componente
interface Contrato { nombre: string; monto: number; } // NO — va en src/types/
```

#### Por qué AuditBase NUNCA se omite al persistir

Los campos de auditoría son la razón de ser del modelo:

- `created_by` / `updated_by` → quién hizo el cambio
- `created_at` / `updated_at` → cuándo lo hizo
- `status` / `deleted_at` → si sigue activo o fue borrado lógicamente

Sin ellos, la tabla en Supabase y en PowerSync pierde trazabilidad completa. Por eso **el objeto canónico se manda completo**, sin filtros, sin Omit.

#### Responsabilidades de auditoría

| Campo | Quién lo setea | Cuándo |
| --- | --- | --- |
| `id` | Cliente (`crypto.randomUUID()`) o trigger Postgres | Al crear |
| `created_at` | Cliente (`new Date().toISOString()`) | Solo al crear |
| `updated_at` | Cliente + trigger Postgres (`BEFORE UPDATE`) | Cada upsert |
| `created_by` | Cliente (`profile.id`) | Solo al crear |
| `updated_by` | Cliente (`profile.id`) | Cada upsert |
| `status` | Cliente (`'active'` \| `'deleted'`) | Al crear y al borrar lógico |
| `deleted_at` | Cliente (`new Date().toISOString()`) | Solo al borrar lógico |

El trigger de Postgres en `updated_at` es la red de seguridad, pero el cliente siempre lo envía también para consistencia en PowerSync/SQLite local.

### 4.1.2 Tipos Derivados Permitidos

Los únicos tipos que pueden vivir **fuera** de `src/types` son **derivaciones explícitas** del modelo canónico, con un único propósito de presentación o agregación. Toda derivación debe partir del tipo base por **extensión, intersección, `Pick` o `Partial`** — nunca por copia manual de campos, y **nunca** descartando los campos de `AuditBase`.

Casos válidos:

| Caso | Patrón | Ejemplo |
| --- | --- | --- |
| View model con joins/conteos | `extends` (mantiene `AuditBase`) | `interface ProjectWithMembers extends Project { member_count: number }` |
| Selector / opción de combo (solo lectura) | `Pick` | `type RoleOption = Pick<Role, 'id' \| 'name' \| 'can_be_customized'>` |
| Update parcial dentro de un mismo objeto canónico | `Partial<Entidad>` aplicado a un setter | `setProject((p) => ({ ...p, ...partial }))` |

Reglas para los derivados:

- Viven junto al hook o componente que los usa, nunca duplicados en otro lugar.
- Su nombre debe reflejar la derivación (`*WithX`, `*Option`, `*View`).
- **No** se permiten tipos `*CreatePayload` / `*UpdatePayload` que recorten el modelo canónico. Para crear o actualizar se usa la entidad completa (ver §4.1.1). Si el endpoint exige menos campos, eso lo resuelve la capa de persistencia con un `Pick` local **al momento de la query**, no con un tipo paralelo en el dominio.
- Si el derivado deja de usar el tipo base canónico, es señal de que el modelo canónico está mal diseñado: corregir el modelo, no abandonar la regla.

### 4.1.3 Resolución de Conflictos Offline (Optimistic Concurrency Control)

En un sistema offline-first (PowerSync + SQLite), dos usuarios pueden editar el mismo registro mientras uno o ambos están sin conexión. Sin un mecanismo explícito, el último en reconectar sobreescribe silenciosamente los cambios del otro. `AuditBase` incluye el campo `version: number` para detectar y exponer estos conflictos.

#### Cómo funciona

1. **El cliente lee** un registro con `version = N`.
2. **El usuario edita** offline. El objeto en `useState` sigue teniendo `version = N`.
3. **Al guardar**, el cliente hace `UPDATE ... WHERE id = $id AND version = N`.
4. **Si otro usuario ya guardó antes**, el registro en Supabase tiene `version = N+1`. La condición `AND version = N` no coincide → la query retorna **0 filas** → conflicto detectado.
5. **Si no hay conflicto**, el trigger `set_updated_at` incrementa `version` a `N+1`. El cliente actualiza su estado con el objeto retornado (que ya tiene `version = N+1`).
6. **PowerSync** sincroniza la `version` actualizada al resto de clientes como cualquier otro campo.

#### Trigger en Postgres (implementado en `01_security_engine.sql`)

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    NEW.version    := COALESCE(OLD.version, 0) + 1;  -- OCC
    RETURN NEW;
END;
$$;
```

El trigger es la fuente de verdad. El cliente **nunca** incrementa `version` manualmente; solo la lee y la usa como condición de escritura.

#### Patrón de escritura (INSERT vs UPDATE)

```ts
// INSERT (registro nuevo, version = 0)
await supabase.from('contratos').insert(toPersist).select().single();
// El trigger NO se dispara en INSERT → version sigue en 0 hasta el primer UPDATE.

// UPDATE con optimistic lock
const { data } = await supabase
  .from('contratos')
  .update(toPersist)
  .eq('id', toPersist.id)
  .eq('version', toPersist.version)  // lock
  .select()
  .single();

if (!data) {
  // Conflicto: version ya no coincide
  // 1. Recargar el registro más reciente desde Supabase
  // 2. Mostrar aviso al usuario con opción de "sobrescribir" o "descartar"
}
// Si data existe → contiene version incrementada por el trigger
setEntidad(data as Entidad);
```

#### Estrategia de resolución en el cliente

Esta plantilla usa **"notificar y dejar decidir al usuario"** como estrategia por defecto:

| Escenario | Acción recomendada |
| --- | --- |
| Conflicto en campo crítico (monto, estado) | Recargar + modal con diff lado a lado |
| Conflicto en campo secundario (notas) | Recargar + aviso tipo toast, mantener cambio local como sugerencia |
| Entidad append-only (mensajes, logs) | No aplica OCC — siempre INSERT, nunca UPDATE del mismo registro |

**Nota sobre PowerSync offline:** PowerSync encola las escrituras cuando no hay red. Cuando reconecta, las envía en orden. El OCC sigue aplicando: si el registro remoto cambió mientras la escritura estaba en cola, el error de conflicto se propaga al hook y debe manejarse igual.

#### Inicialización obligatoria en `createEmpty`

```ts
export function createEmptyEntidad(userId: string): Entidad {
  return {
    // …AuditBase
    version: 0,  // SIEMPRE 0 para registros nuevos
    // …campos de negocio
  };
}
```

### 4.2 Flujo de Datos Híbrido (Implementado)

*   **Lectura (READ):** 
    - Si PowerSync **activo**: Consulta a SQLite Local (instantáneo, offline)
    - Si PowerSync **inactivo**: Consulta directo a Supabase (online)
*   **Escritura (WRITE):** Siempre a Supabase Nube. PowerSync (si activo) detecta el cambio y lo descarga al local automáticamente.

### 4.3 Esquema Multi-Entidad

*   `teams`: Agrupa personas (empresa dueña, etc.).
*   `entities`: Unidad de trabajo canónica en BD (en UI el nombre viene de `VITE_ENTITY_LABEL`: Proyecto, Obra, Caso…).
*   `sys_entity_access`: Tabla pivote — **qué usuarios pueden ver qué entity** en rutas `/workspace/:entityId/*`. Complementa al RBAC de páginas (`sys_user_permissions`). El usuario **god** no depende de estas filas.

### 4.4 Seguridad Data-Driven (RBAC Implementado)

Sistema de permisos completamente funcional con RLS y función maestra `check_permission()`.

**Tablas de Seguridad:**
- `sys_resources`: Catálogo inmutable de qué se puede proteger (Páginas, Botones).
- `sys_roles`: Plantillas de permisos (ej: Gerente, Supervisor).
- `sys_role_definitions`: Qué acciones tiene cada rol sobre qué recursos.
- `sys_user_permissions`: La tabla final donde el frontend lee los permisos (aplanados).

**Funciones de Seguridad:**
- `is_god()`: **Helper primario**. Retorna TRUE si `profiles.access_level = 'god'` y `teams.is_platform_owner = TRUE`. Siempre se evalúa **primero** en toda policy RLS.
- `check_permission(resource, action, entity_id?)`: Triple-gate (God bypass → Admin bypass → Granular).
- `get_my_team_id()`: Helper SECURITY DEFINER para evitar recursión infinita en RLS.
- `get_my_entity_ids()`: Helper para listar las entidades accesibles del usuario actual.
- `handle_permission_sync()`: Trigger que mantiene `sys_user_permissions` sincronizado.

---

### 4.4.1 El Usuario Dios — Regla Inmutable

> **El god user siempre puede ver y hacer todo. Sin excepción.**

El god user es quien tiene `access_level = 'god'` en `profiles` y cuyo equipo tiene `is_platform_owner = TRUE`.

**Por qué existe este nivel:**
Un instalador, el equipo de PragmataDevs, o el super-admin del cliente necesita poder diagnosticar, configurar y operar el sistema sin barreras. Ningún error de configuración de permisos debe dejarlo fuera.

**Qué no necesita el god user:**
- Registros en `sys_entity_access` para ver entidades.
- Registros en `sys_user_permissions` para ejecutar acciones.
- Pertenecer a ningún workspace o equipo específico más allá del suyo.

**Implementación:**
```sql
-- Función helper (debe existir en toda instalación)
public.is_god() → BOOLEAN

-- Patrón obligatorio en TODA policy RLS nueva:
CREATE POLICY "nombre" ON public.tabla
    FOR SELECT USING (
        public.is_god()    ← PRIMERA CONDICIÓN, siempre
        OR <regla_normal>
    );
```

**Invariantes que nunca deben romperse:**
1. `is_god()` es siempre la primera condición en cada policy RLS.
2. `check_permission()` retorna TRUE para god antes de evaluar cualquier recurso/acción.
3. Toda tabla nueva con RLS debe incluir `is_god()` de entrada.
4. El seed del god user vive en `02_seed_god_user.sql` — es la única vía oficial.

**Parche para DBs existentes:** ejecutar `06_god_bypass.sql`.

---

**RLS Policies Activos (patrón resumido):**
- **Todas las tablas**: `public.is_god() OR <condición_normal>` (god siempre primero).
- **Entities**: god ve todas; miembros solo las de `sys_entity_access`.
- **Tasks**: god ve todas; otros requieren `sys_entity_access` y permisos.
- **Profiles**: god ve todos; otros ven solo propio equipo.
- **Chat/Notificaciones**: god lo ve todo; otros solo lo suyo.

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
4. **Capa WorkspaceLayout (`/workspace/:entityId/*`):**
   - *Validación:* RLS y/o membresía vía `sys_entity_access` (y políticas por tabla); el usuario **god** no queda bloqueado (`public.is_god()` primero en policies).
   - *Acción:* Las páginas del workspace filtran por `entity_id`; si no hay entity resuelta, el hook `useActiveEntity` y las rutas `none` cubren el empty state (véase reglas de navegación).

### 5.2.1 Ciclo de Vida de Sesión

La sesión se centraliza en `AuthProvider` y sigue este flujo:

1. **Bootstrap inicial**
  - Al montar la app, `AuthProvider` llama `supabase.auth.getSession()`.
  - Si existe usuario autenticado, carga `profile` desde `profiles` y luego permisos desde `sys_user_permissions`.

2. **Suscripción a cambios de auth**
  - `AuthProvider` escucha `supabase.auth.onAuthStateChange(...)`.
  - Ante `SIGNED_IN`, `SIGNED_OUT`, `PASSWORD_RECOVERY` u otros eventos, sincroniza `user`, `profile`, `permissions` y `loading`.

3. **Consumo desacoplado**
  - `useAuth()` expone el estado autenticado (`user`, `profile`, `permissions`, `loading`, `isAuthenticated`, `sessionEpoch`).
  - `usePermission()` resuelve permisos sobre el snapshot cargado por `AuthProvider`, sin volver a consultar por cada render.

**Reglas operativas:**
- Ningún hook de datos protegido debe asumir que la sesión ya está hidratada en el primer render.
- El callback de `supabase.auth.onAuthStateChange` es **estrictamente síncrono**. No se permite `await` de `supabase.from(...)`, `supabase.auth.refreshSession()` ni cargas de perfil/permisos dentro del callback. Supabase v2 mantiene `navigator.locks` mientras el callback corre y cualquier `await` a una query produce deadlock contra otros componentes que disparan queries simultáneas.
- La carga de `profile` y `permissions` vive en un `useEffect` separado que observa `user?.id` (con `lastProfileUserIdRef` para evitar reentradas). De esta forma se ejecuta **fuera** del lock de auth.
- No se llama `supabase.auth.refreshSession()` proactivamente en el camino principal. Confiamos en `autoRefreshToken: true` y reaccionamos al evento `TOKEN_REFRESHED`.

### 5.2.3 `sessionEpoch` y revalidación tras idle

Para evitar pantallas vacías cuando el usuario regresa después de varios minutos (token expirado pero `user` aún en estado React → el gate `!isAuthenticated` no bloquea, la query sale con JWT viejo y RLS responde `200 + []` sin error visible), `AuthProvider` expone un contador monotónico `sessionEpoch`:

- Se incrementa en: bootstrap exitoso, evento `SIGNED_IN`, evento `TOKEN_REFRESHED`, y revalidación proactiva en `visibilitychange` / `online`.
- En `visibilitychange === 'visible'` y `online`, `AuthProvider` llama `supabase.auth.getSession()` (fuerza el path de refresh del cliente) y luego bumpea el epoch.
- Todo hook protegido **debe** incluir `sessionEpoch` en las dependencias del `useEffect` de fetch inicial. Esto garantiza un refetch inmediato cuando la sesión se renueva en background.

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
  - Leer `loading`, `isAuthenticated` y `sessionEpoch` desde `useAuth()`.
  - No ejecutar queries mientras `loading === true`.
  - Si `isAuthenticated === false`, salir temprano y limpiar estados derivados si aplica.

2. **Dependencias correctas del efecto**
  - El `useEffect` inicial debe depender de `loading`, `isAuthenticated` y `sessionEpoch`, además de sus dependencias funcionales.
  - El fetch corre cuando Auth ya hidrató y se vuelve a ejecutar tras `TOKEN_REFRESHED` o revalidación por `visibilitychange` / `online`.

3. **Retry único ante error de sesión (`withSessionRetry`)**
  - Envolver las queries protegidas en el helper `withSessionRetry` (`src/lib/auth/sessionRetry.ts`).
  - El helper detecta `PGRST301`, `PGRST302` o mensajes de JWT, llama `supabase.auth.getSession()` una sola vez y reintenta.
  - Si el retry vuelve a fallar, propaga el error sin loops.

4. **Instrumentación mínima**
  - `withSessionRetry` ya loggea retry ejecutado, retry omitido y error definitivo.
  - No agregar lógica adicional de retry fuera de este helper.

**Plantilla mínima:**

```ts
const { profile, loading: authLoading, isAuthenticated, sessionEpoch } = useAuth();

const fetchData = useCallback(async () => {
  if (authLoading || !isAuthenticated) {
    setLoading(true);
    return;
  }
  // ... fetch protegido
  const data = await withSessionRetry(async () => {
    const res = await supabase.from('tabla').select('*');
    if (res.error) throw res.error;
    return res.data;
  }, 'useFoo.fetchData');
}, [authLoading, isAuthenticated, profile]);

useEffect(() => {
  if (authLoading) return;
  void fetchData();
  // sessionEpoch en deps: re-run tras TOKEN_REFRESHED / wake-from-idle.
}, [authLoading, isAuthenticated, fetchData, sessionEpoch]);
```

**Checklist obligatorio para nuevos hooks protegidos:**
- [ ] Inyecta `loading`, `isAuthenticated` y `sessionEpoch` desde `useAuth()`.
- [ ] Gate `authLoading || !isAuthenticated` al inicio del fetch.
- [ ] Queries envueltas en `withSessionRetry`.
- [ ] `useEffect` de fetch inicial incluye `sessionEpoch` en sus deps.
- [ ] No `await` de queries dentro de `onAuthStateChange` ni llamadas a `refreshSession()` en el camino principal.

**Objetivo:**
- Evitar pantallas vacías por carrera entre render inicial e hidratación de sesión.
- Reducir fallos intermitentes en tablas protegidas por RLS.
- Recuperar datos automáticamente tras wake-from-idle sin requerir hard refresh.
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
- `workspace` / entities: filas de `entities` + `sys_entity_access` autorizadas para el usuario
- `resources`: Catálogo de recursos del sistema
- `roles`: Roles y definiciones disponibles

**Importante:** Actualizar `sync-rules.yaml` cada vez que se agregue una tabla nueva que deba estar offline.

### 7.5 Scripts de Base de Datos

Orden de ejecución en cada branch:
1. `01_security_engine.sql` - Schema completo: tablas, AuditBase, funciones, triggers y RLS (incluye chat + notifications)
2. `02_seed_god_user.sql` - Crear primer usuario administrador
3. `03_powersync_publication.sql` - Habilitar replicación lógica (PowerSync)

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
- [ ] Ejecutar `03_powersync_publication.sql` en branch(es) que usen PowerSync
- [ ] Deployar Sync Rules en PowerSync Instance (main)
- [ ] Configurar variables en Vercel (Production: VITE_ENABLE_POWERSYNC=true)
- [ ] Probar login y sincronización en staging antes de mergear

### Cuando vayas a Staging+Offline (futuro)
- [ ] Crear segunda instancia PowerSync para branch `develop`
- [ ] Deployar Sync Rules a nueva instancia
- [ ] Cambiar VITE_ENABLE_POWERSYNC=false → true en Vercel Preview
- [ ] Actualizar variable VITE_POWERSYNC_URL para Preview si es diferente

---

## 10. Performance de Bundle

> Referencia operativa completa: [docs/bundle-chunck-strategy.md](bundle-chunck-strategy.md)

### 10.1 Estrategia Implementada

**Tres técnicas en capas:**

1. **Code-splitting por ruta** — todas las páginas usan `React.lazy` + `Suspense` en `routes.config.ts`. El fallback visual está centralizado en `RouteLoader`.
2. **Carga condicional de PowerSync** — `PowerSyncProvider.tsx` usa imports dinámicos condicionales. `@powersync/*` y `@journeyapps/wa-sqlite` no se cargan en el arranque si `VITE_ENABLE_POWERSYNC=false`.
3. **Manual chunking en build** — `vite.config.ts` separa los vendors en chunks cacheables independientes.

### 10.2 Chunks Definidos (vite.config.ts)

| Chunk | Contenido | Razón |
| --- | --- | --- |
| `react-vendor` | `react`, `react-dom`, `react-router-dom` | Core siempre presente; se cachea por separado |
| `supabase` | `@supabase/*` | Cliente pesado; cambia poco |
| `powersync` | `@powersync/*`, `@journeyapps/wa-sqlite` | Solo se descarga cuando `VITE_ENABLE_POWERSYNC=true` |
| `icons` | `lucide-react` | Importado en layouts siempre activos; aislado para no contaminar el caché de `react-vendor` |

**Regla:** cada nueva dependencia `node_modules` que supere ~50 kB minificada **debe** evaluarse para chunk propio. Ver procedimiento en [bundle-chunck-strategy.md](bundle-chunck-strategy.md).

### 10.3 Resultado de Build (Línea Base)

| Chunk | Tamaño aprox. |
| --- | --- |
| `index` | ~183 kB |
| `react-vendor` | ~190 kB |
| `supabase` | ~163 kB |
| `icons` | ~70 kB |

Antes del chunking manual el chunk principal era ~536 kB (warning `>500 kB`). La línea base se actualiza en cada sprint cuando cambia una dependencia mayor.

### 10.4 Reglas de Implementación Obligatorias

1. **Toda nueva página** se importa con `React.lazy` en `routes.config.ts`. Prohibido el import estático de páginas.
2. **Toda librería pesada** (PDF, charts, editores, mapas) va en un chunk `manualChunks` dedicado y se carga con import dinámico en la ruta que la consume.
3. **Prohibido** subir `chunkSizeWarningLimit` para silenciar un warning sin resolver la causa.
4. **Al agregar una dependencia**, ejecutar `pnpm build` y registrar el delta de tamaño en el PR usando la plantilla del [bundle-chunck-strategy.md §6](bundle-chunck-strategy.md).
5. No importar librerías de vendor en `providers/`, `App.tsx` ni `main.tsx` de forma estática si se puede diferir a la ruta consumidora.

---

## 11. Pilar Público: SEO / Ecommerce (Astro)

### 11.0 Landings, dominio público y login al ERP

Hay **dos** superficies de portada en el monorepo; no son mutuamente excluyentes:

| Superficie | Stack | Ejemplo en dev | Función |
| :--- | :--- | :--- | :--- |
| **Sitio público (SEO)** | Astro (`astro/`) | `http://localhost:4321/` | Landing indexable, Schema.org, catálogo si `PUBLIC_ENABLE_ECOMMERCE=true` |
| **ERP / app** | React (`src/`) | `http://localhost:7070/` | Auth (`/login`), dashboard, Workspace |

**Enlace "Iniciar sesión" desde Astro:** los CTAs de `astro/src/pages/index.astro` usan `PUBLIC_APP_URL` + `/login` (p. ej. en desarrollo `PUBLIC_APP_URL=http://localhost:7070`). Así el visitante del dominio público entra al operativo en el dominio/subdominio correcto.

**Landing React** (eliminada en plantilla): la ruta `/` del ERP (`PublicSiteEntry`) **redirige** al origen Astro (`VITE_PUBLIC_SITE_URL`, o `http://localhost:4321` en dev). El login del operativo sigue en `/login` en el host del ERP.

**Producción típica:** `www.cliente.com` → build Astro · `app.cliente.com` → build React. El operativo **no** sustituye la landing SEO en el dominio público; Astro es la cabecera de marca y conversión; el ERP es la consola autenticada.

**Deploy Astro (hybrid + `@astrojs/node`):** después de `pnpm build` en `astro/`, el servidor es `node ./dist/server/entry.mjs` (en plantilla: `pnpm start`). Para **desarrollo local**, `pnpm dev:all` en la raíz levanta ERP (`:7070`) y Astro (`:4321`) — detalle en **`docs/SETUP.md` §8.0 y §8.3**. Variables de build, VPS/hosting y sitemap: **§8.4–8.8**.

### 11.0.1 Desactivar ecommerce (cliente sin tienda)

| Capa | Acción |
| :--- | :--- |
| **ERP** | `VITE_ENABLE_ECOMMERCE=false` u omitir en `.env` → **no** se registra la ruta workspace `products` ni el menú "Productos" (`routes.config.ts`). |
| **Astro** | `PUBLIC_ENABLE_ECOMMERCE=false` → sin enlaces a catálogo ni carrito flotante en el layout. |
| **SQL (opcional)** | En instancias sin tienda, puedes **no** aplicar `docs/database/08_ecommerce.sql` / `08b_*`; si ya existen tablas, no se usan con flags apagados. |
| **RBAC** | Recursos `page_ecommerce_*` pueden quedar definidos; sin ruta activa no impactan la UX. |

El código del módulo (`ProductsPage`, `useProducts`, tipos `product`) permanece en el repo como **referencia de plantilla**; el bundle no incluye la página si la ruta no está en el router (lazy import sin referencia).

### 11.1 Filosofía

El Pilar Público es la **cara pública del negocio**. Su objetivo es captar tráfico orgánico (SEO técnico) y convertir visitantes en clientes (Ecommerce). Astro es la herramienta ideal: genera HTML estático o SSR con 0 JS por defecto, lo que garantiza Core Web Vitals perfectos.

**Principio clave:** el Pilar Público **solo lee** de Supabase (anon key con RLS `SELECT` público). Toda escritura (pedidos, registros, pagos) pasa por Edge Functions del Pilar Operativo o Intelligence.

### 11.2 Arquitectura SEO

```astro
---
// layouts/BaseLayout.astro
interface Props {
  title: string;
  description: string;
  ogImage?: string;
  canonical?: string;
}
const { title, description, ogImage, canonical } = Astro.props;
---
<html lang="es">
  <head>
    <title>{title} | PragmataDevs</title>
    <meta name="description" content={description} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    {ogImage && <meta property="og:image" content={ogImage} />}
    {canonical && <link rel="canonical" href={canonical} />}
    <meta name="robots" content="index, follow" />
  </head>
  <body>
    <slot />
  </body>
</html>
```

**Reglas SEO:**
- Toda página exporta `title` único y `description` entre 120–160 caracteres.
- Rutas dinámicas usan `getStaticPaths()` para generar URLs en build time (SSG).
- Imágenes siempre con `<Image>` de Astro (convierte a WebP + `width`/`height` obligatorios para evitar CLS).
- Sitemap / robots en Astro: endpoints SSR **`/sitemap.xml`** y **`/robots.txt`** (`astro/src/pages/*.ts`), sin `@astrojs/sitemap`. Detalle en **`docs/SETUP.md` §8.8**.
- Structured Data (JSON-LD) en páginas de producto y landing.

### 11.3 Arquitectura Ecommerce

```
Catálogo          →  tabla `productos` (Supabase, RLS SELECT público)
Carrito           →  localStorage / sessionStorage (isla React)
Checkout          →  Edge Function `create-order` (valida stock, crea pedido)
Pago              →  Edge Function `create-payment` (Stripe/MercadoPago webhook)
Confirmación      →  página /pedido/[id] (SSR con datos del pedido)
```

**Tabla mínima de catálogo:**

```sql
CREATE TABLE productos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL,
  descripcion   TEXT,
  precio        NUMERIC(10,2) NOT NULL,
  stock         INTEGER NOT NULL DEFAULT 0,
  imagenes      TEXT[],           -- URLs de Supabase Storage
  slug          TEXT UNIQUE NOT NULL,
  categoria_id  UUID REFERENCES categorias(id),
  status        TEXT NOT NULL DEFAULT 'active',
  -- AuditBase fields...
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES auth.users(id),
  updated_by    UUID REFERENCES auth.users(id),
  deleted_at    TIMESTAMPTZ,
  version       INTEGER NOT NULL DEFAULT 0
);

-- RLS: lectura pública para productos activos
CREATE POLICY "productos_public_read" ON productos
  FOR SELECT USING (status = 'active');
```

### 11.4 Integración con el Pilar Operativo

El administrador gestiona el catálogo desde el Pilar Operativo (ERP). El Pilar Público lee los mismos datos via Supabase anon key. No hay sincronización manual: comparten la misma base de datos.

```
ERP (Operativo) → CRUD productos → Supabase PostgreSQL ← lectura → Astro (Público)
```

---

## 12. Pilar Intelligence: IA Core

### 12.1 Filosofía

El Pilar Intelligence convierte los datos del negocio en **inteligencia accionable**. Los LLMs nunca son llamados directamente desde el cliente — siempre pasan por Edge Functions que validan permisos, limitan costos y registran el uso.

**Principio:** la IA lee los mismos datos que el ERP (tablas con AuditBase). Los embeddings son una capa adicional sobre los registros existentes, no un nuevo silo de datos.

### 12.2 Arquitectura de Embeddings

```sql
-- Tabla de embeddings (extender por entidad)
CREATE TABLE embeddings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad      TEXT NOT NULL,        -- 'contratos', 'proyectos', etc.
  entidad_id   UUID NOT NULL,
  content      TEXT NOT NULL,        -- texto embebido
  embedding    vector(1536),         -- OpenAI text-embedding-3-small
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda aproximada (HNSW)
CREATE INDEX ON embeddings USING hnsw (embedding vector_cosine_ops);
```

**Flujo de vectorización:**
1. Trigger Postgres o Edge Function `embed-on-change` escucha `INSERT`/`UPDATE` en tablas relevantes.
2. Genera embedding via OpenAI y guarda en `embeddings`.
3. El cliente invoca `ai-search` con la query del usuario.
4. `ai-search` vectoriza la query y hace `SELECT ... ORDER BY embedding <=> $1 LIMIT 10`.

### 12.3 Edge Functions IA

```typescript
// supabase/functions/ai-search/index.ts
import { serve } from 'https://deno.land/std/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

serve(async (req) => {
  const { query, project_id } = await req.json();
  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

  // 1. Vectorizar query
  const { data: [{ embedding }] } = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });

  // 2. Buscar registros similares (RLS garantiza scope del proyecto)
  const supabase = createClient(/* ... */);
  const { data } = await supabase.rpc('match_embeddings', {
    query_embedding: embedding,
    project_id,
    match_count: 10,
  });

  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
});
```

### 12.4 Feature Flag y Guard en el Cliente

```typescript
// Activar en .env
VITE_ENABLE_AI=true

// Guard en rutas (routes.config.ts)
const AI_ENABLED = import.meta.env.VITE_ENABLE_AI === 'true';
{ path: 'ai', element: AI_ENABLED ? <AISearchPage /> : <Navigate to="/" /> }

// Hook de invocación
export function useAISearch() {
  const { isAuthenticated } = useAuth();

  const search = useCallback(async (query: string, projectId: string) => {
    if (!isAuthenticated) return [];
    const { data, error } = await supabase.functions.invoke('ai-search', {
      body: { query, project_id: projectId },
    });
    if (error) throw error;
    return data as SearchResult[];
  }, [isAuthenticated]);

  return { search };
}
```

### 12.5 Costos y Límites

| Servicio | Modelo | Costo aprox. | Límite recomendado |
| :--- | :--- | :--- | :--- |
| Embeddings | `text-embedding-3-small` | $0.02 / 1M tokens | Sin límite en vectorización batch |
| Búsqueda semántica | pgvector | $0 (PostgreSQL) | HNSW soporta millones de vectores |
| Resúmenes | `gpt-4o-mini` | $0.15 / 1M tokens | Máx. 3 resúmenes/min por usuario |
| Extracción | `gpt-4o` | $2.5 / 1M tokens | Solo en features premium |

Registrar cada llamada en tabla `ai_usage` (entidad, operación, tokens, usuario, costo_estimado) para control de gastos.

---

## 13. Sistema de Diseño Pragmata (UI Industrial)

> Referencia completa de componentes: `.cursor/rules/02-ui-components.mdc`

### 13.1 Principios de Diseño de Autoridad

**Estética Stripe/Linear:** sobria, limpia, funcional. El diseño jamás compite con los datos.

| Token | Valor | Uso |
| :--- | :--- | :--- |
| `rounded-pragmata` | 4px | Todos los contenedores, botones, inputs |
| `brand-accent` | #0EA5E9 | Única acción primaria por sección |
| `brand-dark` | #0F172A | Headings y texto crítico |
| `brand-steel` | #334155 | Cuerpo de texto y labels |
| `brand-surface` | #F8FAFC | Fondos de cards e inputs |
| Spacing base | `p-6` cards, `gap-4` elementos | Nunca `p-2` en contenedores principales |

### 13.2 Anatomía de una Vista (Page Layout)

Toda vista interior sigue esta estructura:

```
┌─ PageHeader ──────────────────────────────────────────────────┐
│  Breadcrumb: Dashboard > Módulo > Sub-item                     │
│  Título: h1 font-extrabold                    [Acciones]       │
└───────────────────────────────────────────────────────────────┘
┌─ Contenido Principal ─────────────────────────────────────────┐
│  grid grid-cols-1 lg:grid-cols-3 gap-6                         │
│  ┌─ Panel Principal ─────────┐  ┌─ Panel Lateral ────────────┐│
│  │  Tabla / Formulario / etc │  │  Stats, Acciones rápidas   ││
│  └───────────────────────────┘  └────────────────────────────┘│
└───────────────────────────────────────────────────────────────┘
```

### 13.3 Jerarquía de Modales

| Tipo | `max-w` | Uso |
| :--- | :--- | :--- |
| Confirmación destructiva | `max-w-sm` | "¿Eliminar este registro?" |
| Formulario simple | `max-w-lg` | Crear/Editar entidades simples |
| Formulario complejo | `max-w-2xl` | Formularios con múltiples secciones |
| Vista previa / Detalle | `max-w-4xl` | PDF, galería, detalle expandido |
| Wizard / Multi-paso | `max-w-3xl` | Onboarding, configuración guiada |

**Regla de footer:** siempre "Cancelar" a la izquierda, acción principal a la derecha. El botón principal refleja el verbo de la acción: "Guardar", "Confirmar", "Eliminar".

### 13.4 PDF Previewer

El visor de PDF usa un `<iframe>` liviano por defecto (sin dependencias extra). Solo instalar `react-pdf` si el cliente necesita anotaciones o control página a página.

```
Caso de uso          │ Solución
─────────────────────┼──────────────────────────────────
Solo ver             │ <iframe src={url}> (0 deps)
Descargar            │ <a href={url} download>
Múltiples páginas    │ react-pdf (chunk dedicado)
Anotaciones          │ react-pdf + pdfjs-dist (chunk dedicado)
```

### 13.5 Carrusel de Imágenes

`embla-carousel-react` como dependencia estándar (ligera, sin opiniones). Chunk dedicado en `vite.config.ts`.

**Variantes:**
- **Producto:** autoplay desactivado, miniaturas debajo, zoom en click.
- **Galería:** lightbox en click, controles teclado (←/→), contador "3 / 12".
- **Onboarding:** autoplay 4s, puntos de navegación, sin controles laterales.

### 13.6 Jerarquía de Botones

Máximo **1 botón `primary`** por sección visual. El resto son `outline`, `ghost` o `destructive`.

```
Primary    → Acción principal de la pantalla (Guardar, Crear, Confirmar)
Outline    → Acción secundaria (Cancelar, Exportar, Ver detalle)
Ghost      → Acciones en listas/tablas (Editar, Menú de opciones)
Destructive → Solo para confirmación de eliminación
Link       → Navegación sin peso visual
```

**Estado de carga:** siempre mostrar `<Loader2 className="animate-spin" />` + texto descriptivo. Nunca deshabilitar sin feedback visual.

### 13.7 Estados de la UI

Toda lista/tabla/sección debe manejar los 4 estados:

| Estado | Componente | Descripción |
| :--- | :--- | :--- |
| `loading` | Skeleton (no spinner de página) | Placeholders del mismo shape que el contenido |
| `empty` | EmptyState con icono + CTA | Mensaje específico del contexto, botón para crear el primero |
| `error` | ErrorState con retry | Mensaje de error + botón "Reintentar" |
| `data` | El componente real | Siempre con paginación si >20 registros |
