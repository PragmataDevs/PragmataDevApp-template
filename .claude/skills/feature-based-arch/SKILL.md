---
name: feature-based-arch
description: >-
  La arquitectura feature-based de PragmataDevApp: cada dominio es un slice
  vertical autónomo en src/features/, con kit recursivo (pages/hooks/components/
  types), rutas centralizadas, y CERO src/pages/. Úsala al crear features, decidir
  estructura de carpetas, partir un dominio en subfeatures, o revisar organización.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Arquitectura feature-based — slices verticales autónomos

Cada dominio se organiza igual, recursivamente. Es un slice vertical: trae sus propios types, hooks y componentes.

> Fuente viva: `src/features/README.md`, `.cursor/rules/03-pillars-architecture.mdc`, `.cursor/rules/06-navigation-layout.mdc`, `src/app/routes.config.ts`. Ejemplos: `src/features/clients/` (form entity), `src/features/tasks/` (subfeatures).

## 1. El kit canónico (en cada nivel)

```
src/features/<dominio>/
├── pages/          # solo si tiene ruta URL (lazy en routes.config.ts)
├── components/     # UI del dominio (compartida entre subfeatures)
├── hooks/          # hooks del dominio (la lógica vive aquí)
├── types/          # modelos canónicos (NO DTOs)
├── providers/      # opcional: solo si hay un Context
└── <subfeature>/   # mismo kit, recursivo
    ├── components/
    ├── hooks/
    └── types/
```

## 2. Regla recursiva
Cada subfeature a cualquier profundidad tiene su `components/ hooks/ types/`. Lo compartido entre subfeatures hermanas sube al `components/`/`hooks/` del padre. Profundidad práctica máx: **3-4 niveles** (dominio → subfeature → sub-subfeature → helpers). Solo features con **ruta URL** tienen `pages/`.

**¿Cuándo partir en subfeature?** Cuando una sección tiene **ruta propia** que el usuario navega aparte. Si solo son 2-3 páginas con types/hooks compartidos, déjalo plano. Regla: **una subfeature por sección navegable.**

## 3. Reglas duras
1. **Todo en `src/features/<modulo>/`** — pages, hooks, components, types. **CERO `src/pages/`.**
2. **Rutas centralizadas** en `src/app/routes.config.ts` (`lazy()` + objeto `AppRoute`).
3. **Slices autónomos**: imports fluyen hacia abajo (hijo ← padre), nunca hijo → hermano. El core compartido (`src/lib/`, `src/types/core/`, `src/components/ui/`) fluye a todos.
4. **Types en el `types/` de cada feature**, no en `src/types/global/`. `src/types/` solo guarda `core/base.ts` (AuditBase).
5. **Patrón de dos archivos** para entidades con form: `types/<e>.ts` + `types/<e>.schema.ts` (→ skill `auditbase-occ`).
6. **Antipatrones prohibidos:** sufijos `*DTO`/`*FormState`/`*Payload` (usa `*Input`/`*FormValues`); validación en JSX; `providers/` sin Context real.

## 4. Layouts y navegación
Tres layouts (`src/components/layout/`): **PublicLayout** (login), **AppLayout** (shell autenticado: sidebar+header+outlet), **WorkspaceLayout** (contexto de entidad, solo `<Outlet/>`).

Orden del sidebar (inmutable): `Global (Dashboard, Perfil)` → sep → `Settings (Roles, Usuarios, Entidades)` → sep → `Workspace (dinámico por entidad)`. ❌ Settings SIEMPRE antes que Workspace.

**EntitySelector** (en navbar): aparece solo si `VITE_ENABLE_MULTI_ENTITY=true` Y la ruta es `/workspace/:entityId/*`. Resuelto por `useActiveEntity()` (URL → localStorage → primera entidad → null).

## 5. Ejemplo real (tasks con subfeature)
```
src/features/tasks/
├── pages/TasksPage.tsx          # ruta /workspace/:entityId/tasks
├── components/TaskCard.tsx      # compartido tasks ↔ backlog
├── hooks/useTasks.ts
├── types/task.ts
└── backlog/                     # subfeature (sin pages/ si no tiene ruta)
    ├── components/ hooks/ types/
```

## Reglas de oro 🔒
1. Cada feature es autónoma; **cero `src/pages/`**; rutas en `routes.config.ts` con `lazy()`.
2. El kit (pages/hooks/components/types) se repite igual en cada nivel.
3. Lógica en hooks, páginas solo componen.
4. Imports fluyen hacia abajo; lo compartido sube al padre o al core.
5. Una subfeature por sección navegable; no sobre-anides (máx 3-4).
