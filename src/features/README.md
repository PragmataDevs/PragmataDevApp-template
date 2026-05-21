# `src/features/` — dominios del ERP

Cada carpeta es un **dominio** (chasis de template o negocio del cliente). Estructura canónica:

```
<dominio>/
  pages/        # rutas (import lazy en src/app/routes.config.ts)
  hooks/
  components/
  providers/    # opcional
  types/        # opcional — modelos solo de este dominio
  <subfeature>/ # mismo kit anidado (ej. finanzas/egresos/contratos/)
```

## Chasis (template)

| Carpeta | Descripción |
|---------|-------------|
| `shell` | Redirección `/` al sitio público Astro |
| `auth` | Login, callback, recuperar contraseña |
| `dashboard` | Inicio global |
| `profile` | Mi perfil |
| `roles` | Roles y `PermissionsPanel` compartido |
| `users` | Usuarios del equipo |
| `entities` | Entidades + selector en navbar |
| `tasks` | Kanban workspace |
| `workspace` | Dashboard por entity |
| `documents` | Archivos por entity |
| `ecommerce` | Demo catálogo/ventas (flag) |
| `cms` | Páginas SEO del sitio (flag) |
| `chat`, `notifications`, `preferences` | Transversales |

## Cliente nuevo

Crea `src/features/<dominio-cliente>/` siguiendo el mismo kit. Guía completa: **`docs/client-features-playbook.md`**.

Pasos técnicos (SQL, RBAC): **`docs/playbook-new-module.md`**.

**No uses** `src/pages/` — las pantallas viven aquí en `pages/`.
