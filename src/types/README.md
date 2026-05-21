# `src/types/` — solo núcleo compartido

Los **modelos de negocio** viven en **`src/features/<dominio>/types/`** (y en cada subfeature).

Esta carpeta queda para lo que **varios features** o el router necesitan sin acoplar dominios:

| Archivo | Contenido |
|---------|-----------|
| `core/base.ts` | Re-export `AuditBase` desde `@pragmata/core` + tipos de rutas (`AppRoute`, `RouteLayoutType`) |

**Importar modelos de negocio:**

```ts
import type { Entity } from '@/features/entities/types/entity';
import type { Task } from '@/features/tasks/types/task';
```

Documentación: **`docs/erp-features-structure.md`**.
