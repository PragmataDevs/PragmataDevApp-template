# Feature Spec — <DOMINIO> / <FEATURE>

ID: <ej. FIN-ING-VENTAS-PROGRAMACION-PAGOS>  
Owner: <tu nombre>  
Fecha: YYYY-MM-DD  
Prioridad: P0 | P1 | P2  
Tipo: Nueva feature | Mejora | Bugfix | Refactor  
Flag: <VITE_ENABLE_...> (si aplica) | none  

**Playbooks:** workshop → [`client-features-playbook.md`](../client-features-playbook.md) · implementación → [`playbook-new-module.md`](../playbook-new-module.md)

---

## 0) Contexto (1-2 párrafos)

- ¿Qué problema resolvemos? ¿por qué ahora?

---

## 1) Alcance

### Incluye (Must)

- [ ] ...
- [ ] ...

### No incluye (Won’t)

- ...

---

## 2) Usuarios y permisos (RBAC)

- **Quién lo usa**: god | admin | member | roles específicos
- **ResourceCode**: `page_...` (propuesto)
- **Acciones**: read | create | update | delete | export | import (elige)
- **God user**: siempre acceso total (inmutable)

---

## 3) Navegación

- **Ubicación en sidebar**: settings | workspace | ecommerce | seo | global | grupo nuevo (ej. `finanzas`)
- **Ruta(s)** (URL pública):
  - `/workspace/:entityId/...`
  - `/settings/...`
  - `/finanzas/...` (dominio cliente)
- **Layout**: AppLayout | WorkspaceLayout | PublicLayout
- **Multi-entity**: ¿depende de entity? sí/no
- **Carpeta de código**: `src/features/<dominio>/pages/<NombrePage>.tsx` (subfeature: `.../<subfeature>/pages/`)
- **Registro lazy**: `src/app/routes.config.ts` → `lazy(() => import('@/features/...'))`

---

## 4) Datos (Modelo canónico)

### Entidad principal

- **Nombre**: `PaymentSchedule` (ejemplo)
- **Archivo tipo**: `src/types/<dominio>/<entidad>.ts` **o** `src/features/<dominio>/types/<entidad>.ts` (una sola verdad; ver `docs/client-features-playbook.md` §5)
- **Tabla**: `public.<tabla>`
- **Extiende AuditBase**: sí/no (si no, justificar)

### Campos (de negocio)

| campo | tipo | requerido | ejemplo | notas |
|------|------|-----------|---------|------|
| ...  | ...  | ...       | ...     | ...  |

### Reglas de negocio (invariantes)

- ...

---

## 5) UX / Pantallas

### Listado (DataTable)

- **Columnas**:
  - key: ..., header: ...
- **Filtros**:
- **Orden default**:
- **CSV**: export sí/no, import sí/no (y modo: replace_all | insert_only | upsert)

### Formulario

- **Campos editables** (mismos nombres que el modelo)
- **Validación**: reglas clave (texto)
- **Estados**: empty | loading | error | data

---

## 6) Integraciones

- Supabase Storage: sí/no (bucket, path)
- Edge Functions: sí/no (nombre)
- PowerSync: sí/no (si afecta sync rules)

---

## 7) SQL / RLS

- Migración: `docs/database/XX_....sql` o `supabase/migrations/...`
- RLS: incluir `public.is_god()` primero (siempre)
- Índices/triggers necesarios:

---

## 8) Criterios de aceptación (checklist)

- [ ] Como <rol> puedo ...
- [ ] Permisos correctos (incluye god)
- [ ] No hay deletes duros
- [ ] `pnpm exec tsc -b` pasa

---

## 9) Notas / Referencias

- Links, screenshots, ejemplos, csv de muestra, etc.

