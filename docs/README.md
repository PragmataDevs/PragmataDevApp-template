# Documentación PragmataDevApp Template

**Todo el conocimiento operativo del repo está en `docs/`** (este índice).  
Excepciones mínimas: `README.md` raíz (resumen + enlaces aquí), punteros en `src/features/README.md` y `ai/README.md`.

---

## Empieza aquí

| Situación | Documento |
|-----------|-----------|
| Acabas de clonar el repo | [**PARA-INICIAR.md**](./PARA-INICIAR.md) |
| Digitalizar negocio de un **cliente** (workshop, dominios) | [**client-features-playbook.md**](./client-features-playbook.md) |
| **Mapeo con agente IA** (preguntas → árbol → archivos) | [**client-feature-mapping-guide.md**](./client-feature-mapping-guide.md) |
| **System prompt + generador** (pegar en tu IA) | [**feature-specs/agent/**](./feature-specs/agent/README.md) |
| Mapa de carpetas `src/features/` | [**erp-features-structure.md**](./erp-features-structure.md) |
| Implementar módulo (SQL → RBAC) | [**playbook-new-module.md**](./playbook-new-module.md) |
| Arquitectura y convenciones | [**architecture.md**](./architecture.md) |
| Setup completo, flags, Astro | [**SETUP.md**](./SETUP.md) |

**Orden proyecto cliente:** `PARA-INICIAR` → `client-features-playbook` → **`client-feature-mapping-guide`** (+ YAML opcional) → `playbook-new-module` por subfeature.

---

## Código ERP: dos zonas

| Zona | Qué es | Dónde |
|------|--------|--------|
| **Chasis** | Auth, RBAC, god, layouts, `DataTable`, entity/workspace | `src/lib/`, `src/components/`, `src/app/`, features `auth`, `entities`, … |
| **Negocio** | Lo que construyes por cliente | `src/features/<dominio>/` → ver [**erp-features-structure.md**](./erp-features-structure.md) |

**Reglas:** `features/.../pages/` + `features/.../types/` · solo `src/types/core/` (AuditBase, router) · URLs en `routes.config.ts` · **no** `src/pages/` en el ERP.

---

## Catálogo completo (`docs/`)

### Onboarding y arquitectura

| Archivo | Contenido |
|---------|-----------|
| [PARA-INICIAR.md](./PARA-INICIAR.md) | Primeros pasos en castellano |
| [SETUP.md](./SETUP.md) | Instalación, Supabase, módulos, checklist |
| [architecture.md](./architecture.md) | Tres pilares, directorios, modelo, navegación |
| [erp-features-structure.md](./erp-features-structure.md) | Mapa `src/features/`, chasis, subfeatures |
| [template-maintenance.md](./template-maintenance.md) | Cambios recientes del chasis |
| [design-system.md](./design-system.md) | Tokens y UI industrial |

### Desarrollo ERP (playbooks)

| Archivo | Contenido |
|---------|-----------|
| [client-features-playbook.md](./client-features-playbook.md) | Workshop cliente, dominios, imports |
| [client-feature-mapping-guide.md](./client-feature-mapping-guide.md) | Mapeo guiado (IA): preguntas, ficha YAML, kit por subfeature |
| [feature-specs/agent/](./feature-specs/agent/README.md) | System prompt, generador, brief, contrato de salida |
| [feature-specs/MAPPING_RECORD.example.yaml](./feature-specs/MAPPING_RECORD.example.yaml) | Plantilla YAML para rellenar con el agente |
| [playbook-new-module.md](./playbook-new-module.md) | 10 pasos: SQL → page → RBAC |
| [feature-specs/FEATURE_SPEC_TEMPLATE.md](./feature-specs/FEATURE_SPEC_TEMPLATE.md) | Plantilla spec antes de codear |
| [session-hydration-playbook.md](./session-hydration-playbook.md) | Sesión Supabase + hooks |
| [bundle-chunck-strategy.md](./bundle-chunck-strategy.md) | Chunks Vite, lazy por página |

### Base de datos

| Archivo | Contenido |
|---------|-----------|
| [database/README.md](./database/README.md) | Índice de scripts SQL |
| [database/01_security_engine.sql](./database/01_security_engine.sql) | RBAC, `is_god()` |
| [database/02_seed_god_user.sql](./database/02_seed_god_user.sql) | Seed usuario dios |
| [database/03_powersync_publication.sql](./database/03_powersync_publication.sql) | PowerSync |
| [database/04_realtime_publication.sql](./database/04_realtime_publication.sql) | Realtime |
| [database/05_cms_pages_ensure_legacy.sql](./database/05_cms_pages_ensure_legacy.sql) | CMS legacy |
| [powersync/sync-rules.yaml](./powersync/sync-rules.yaml) | Reglas sync PowerSync |

### Seguridad y auth

| Archivo | Contenido |
|---------|-----------|
| [security-god-user-frontend.md](./security-god-user-frontend.md) | `isGod` en React |
| [security-checklist.md](./security-checklist.md) | Checklist seguridad |
| [auth-session-guards.md](./auth-session-guards.md) | Guards de sesión |
| [auth-email-templates-local.md](./auth-email-templates-local.md) | Mailpit / reset password local |

### Despliegue e infra

| Archivo | Contenido |
|---------|-----------|
| [deployment-environments.md](./deployment-environments.md) | Dominios, Vercel ERP + Astro |
| [deployment.md](./deployment.md) | PowerSync y flags |
| [template-handoff-vercel-y-astro.md](./template-handoff-vercel-y-astro.md) | Handoff producción |
| [ci-workflow.md](./ci-workflow.md) | CI |
| [proceso-supabase-studio-local.md](./proceso-supabase-studio-local.md) | Studio + god local |
| [supabase-local-copias-y-studio.md](./supabase-local-copias-y-studio.md) | Varias instancias local |
| [proceso-post-migraciones-scripts-y-funciones-local.md](./proceso-post-migraciones-scripts-y-funciones-local.md) | `db:sync`, functions local |
| [proceso-post-migraciones-scripts-y-funciones.md](./proceso-post-migraciones-scripts-y-funciones.md) | Scripts post-migración (nube) |

### Módulos opcionales

| Archivo | Contenido |
|---------|-----------|
| [ai/setup.md](./ai/setup.md) | IA / Edge Functions / gateway |
| [ecommerce/payments.md](./ecommerce/payments.md) | Stripe / checkout |
| [pwa-service-worker-proposal.md](./pwa-service-worker-proposal.md) | PWA (propuesta) |
| [brand-assets.md](./brand-assets.md) | Marca e iconos |
| [ui-z-index-layers.md](./ui-z-index-layers.md) | Capas z-index UI |

### Otros

| Ruta | Contenido |
|------|-----------|
| [email-templates/](./email-templates/) | Plantillas HTML auth |
| `.cursor/rules/` (repo) | Reglas IDE para agentes |

**Código IA (fuera de `docs/` pero documentado aquí):** prompts en `ai/prompts/` · función en `supabase/functions/ai-gateway/` · resumen rápido en `ai/README.md` → [**ai/setup.md**](./ai/setup.md).

**Astro:** rutas en `astro/src/pages/` — ver SETUP §8 (no mezclar con ERP).

---

## Reglas Cursor (IDE)

En `.cursor/rules/`: manifiesto, modelo de datos, UI, performance, hooks, navegación, god user, pilares.

---

*Si un doc contradice al código, el código manda — actualiza el doc en el mismo PR.*
