# `src/features/` — dominios del ERP

Cada carpeta es un **vertical slice**: pantallas, datos y UI del dominio en un solo árbol.

## Estructura canónica

```
<dominio>/
  pages/        ← obligatorio si hay rutas (lazy en src/app/routes.config.ts)
  hooks/
  components/
  providers/    ← opcional
  types/        ← opcional (modelos solo de este dominio; ver docs §5)
  <subfeature>/ ← mismo kit (ej. finanzas/egresos/contratos/)
```

- Carpetas en **minúsculas** (`finanzas`, no `Finanzas`).
- **No uses `src/pages/`** en el ERP — las rutas viven aquí.
- **Chasis** (auth, RBAC, layouts): no lo reescribas por cliente; **extiende** con carpetas nuevas.

## Chasis incluido en la template

| Feature | `pages/` | Rutas URL (ej.) |
|---------|----------|-----------------|
| `shell` | `PublicSiteEntry` | `/` → Astro |
| `auth` | Login, callback, reset, forgot | `/login`, `/auth/*` |
| `dashboard` | Dashboard global | `/dashboard` |
| `profile` | Mi perfil | `/profile` |
| `roles` | Roles | `/settings/roles` |
| `users` | Usuarios, nuevo usuario | `/settings/usuarios` |
| `entities` | Entidades, nueva entidad | `/settings/entities` |
| `tasks` | Kanban | `/workspace/:entityId/tasks` |
| `workspace` | Resumen entity | `.../dashboard` |
| `documents` | Archivos | `.../documents` |
| `ecommerce` | Demo tienda (flag) | `/ecommerce/*` |
| `cms` | Páginas SEO (flag) | `/seo/pages` |

Transversales (sin `pages/` propias): `chat`, `notifications`, `preferences`.

## Cliente nuevo

1. Workshop → dominios y subfeatures: **`docs/client-features-playbook.md`**
2. Implementación técnica: **`docs/playbook-new-module.md`**
3. Índice general: **`docs/README.md`**

## Imports

- ✅ `@/lib`, `@/components/ui`, `@/types`, padre del dominio (`finanzas/egresos` → `finanzas`)
- ❌ Entre dominios hermanos (`finanzas` → `comercial` directo)
