# Documentación PragmataDevApp Template

Índice maestro. Usa este archivo para saber **qué leer según lo que estés haciendo**.

---

## Empieza aquí

| Situación | Lee primero |
|-----------|-------------|
| Acabas de clonar el repo | [**PARA-INICIAR.md**](./PARA-INICIAR.md) |
| Vas a digitalizar el negocio de un **cliente** (workshop, dominios, subfeatures) | [**client-features-playbook.md**](./client-features-playbook.md) |
| Ya sabes el módulo y quieres el checklist técnico (SQL → RBAC) | [**playbook-new-module.md**](./playbook-new-module.md) |
| Necesitas detalle de arquitectura o convenciones de código | [**architecture.md**](./architecture.md) |
| Setup largo, flags, Astro, Edge Functions | [**SETUP.md**](./SETUP.md) |

---

## Código ERP: dos zonas

| Zona | Qué incluye | Dónde en el repo |
|------|-------------|------------------|
| **Chasis** (no reinventar por cliente) | Auth, RBAC, god user, layouts, `DataTable`, `useCrudResource`, entity/workspace | `src/lib/`, `src/components/`, `src/app/`, `features/auth`, `features/entities`, migraciones base |
| **Negocio** (lo que construyes) | Pantallas, hooks y UI del dominio del cliente | `src/features/<dominio>/` con `pages/`, `hooks/`, `components/` |

**Regla de rutas:** las pantallas del ERP viven en **`src/features/<dominio>/pages/`**.  
El catálogo de URLs sigue en **`src/app/routes.config.ts`** (lazy import por página).  
**No existe** `src/pages/` en el pilar operativo.

Mapa de carpetas del chasis demo: [**../src/features/README.md**](../src/features/README.md).

---

## Playbooks de desarrollo (ERP)

| Documento | Para quién | Contenido |
|-----------|------------|-----------|
| [**client-features-playbook.md**](./client-features-playbook.md) | Producto / lead dev al iniciar un cliente | Workshop 4 capas, árbol con subfeatures, chasis vs cliente, fronteras de import |
| [**playbook-new-module.md**](./playbook-new-module.md) | Dev implementando un módulo | 10 pasos: SQL → tipo → hook → page en feature → ruta → RBAC → sidebar |
| [**feature-specs/FEATURE_SPEC_TEMPLATE.md**](./feature-specs/FEATURE_SPEC_TEMPLATE.md) | Antes de codear un módulo grande | Spec de negocio + RBAC + rutas (rellenar por feature) |
| [**session-hydration-playbook.md**](./session-hydration-playbook.md) | Hooks que fetchean con sesión | `sessionEpoch`, `withSessionRetry`, gate por `isAuthenticated` |

**Orden recomendado en un proyecto cliente:**  
`PARA-INICIAR` → `client-features-playbook` (workshop) → `FEATURE_SPEC` (opcional) → `playbook-new-module` (por cada pantalla).

---

## Infraestructura y despliegue

| Documento | Tema |
|-----------|------|
| [SETUP.md](./SETUP.md) | Instalación, Supabase local/nube, módulos opcionales |
| [deployment-environments.md](./deployment-environments.md) | Dominios, Vercel ERP + Astro, variables por entorno |
| [deployment.md](./deployment.md) | PowerSync y flags |
| [template-handoff-vercel-y-astro.md](./template-handoff-vercel-y-astro.md) | Handoff producción |
| [proceso-supabase-studio-local.md](./proceso-supabase-studio-local.md) | Studio, god user, SQL local |
| [proceso-post-migraciones-scripts-y-funciones-local.md](./proceso-post-migraciones-scripts-y-funciones-local.md) | `db:sync`, Edge Functions local |
| [ci-workflow.md](./ci-workflow.md) | CI (si aplica en tu fork) |

---

## Seguridad y datos

| Documento | Tema |
|-----------|------|
| [security-god-user-frontend.md](./security-god-user-frontend.md) | `isGod` en React |
| [security-checklist.md](./security-checklist.md) | Checklist seguridad |
| [auth-session-guards.md](./auth-session-guards.md) | Guards de sesión |
| [database/](../docs/database/) | Scripts SQL (schema, seed god, realtime) |

Reglas Cursor (IDE): `.cursor/rules/` — manifiesto, modelo de datos, UI, navegación, hooks.

---

## Pilares y módulos opcionales

| Documento | Pilar |
|-----------|-------|
| [architecture.md](./architecture.md) §0–3 | Tres pilares, entrega web, PWA |
| [bundle-chunck-strategy.md](./bundle-chunck-strategy.md) | Chunks Vite, lazy por página en `features/.../pages/` |
| [ai/setup.md](./ai/setup.md) | Intelligence / Edge Functions IA |
| [ecommerce/payments.md](./ecommerce/payments.md) | Stripe / checkout |
| [pwa-service-worker-proposal.md](./pwa-service-worker-proposal.md) | PWA (propuesta) |
| [design-system.md](./design-system.md) | Tokens y UI |

**Astro (sitio público):** rutas en `astro/src/pages/` — independiente del ERP; ver SETUP §8.

---

## Mantenimiento de la template

| Documento | Tema |
|-----------|------|
| [template-maintenance.md](./template-maintenance.md) | Cambios de chasis, legacy eliminado |
| [template-handoff-vercel-y-astro.md](./template-handoff-vercel-y-astro.md) | Deploy |

---

*Si un doc contradice al código, el código manda — actualiza el doc en el mismo PR.*
