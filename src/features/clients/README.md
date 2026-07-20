# `clients` — referencia canónica (Model + Form)

Este feature **no está cableado a rutas** en la plantilla base. Sirve como **plantilla viva** al crear el siguiente módulo con formulario.

## Regla rápida

Cada entidad con formulario = **dos archivos** en `types/`:

| Archivo | Contenido |
|---------|-----------|
| `<entidad>.ts` | `interface` canónica (`AuditBase`), `Pick` → `*Input`, `createEmpty*()` |
| `<entidad>.schema.ts` | Zod + `export type *FormValues = z.output<typeof schema>` |

**Prohibido:** `*DTO`, `*FormState`, `*Payload`, validación repartida en el JSX.

## Archivos de referencia

```
types/cliente.ts          → Cliente, ClienteInput, createEmptyCliente()
types/cliente.schema.ts   → clienteSchema, ClienteFormValues
components/ClientForm.tsx → react-hook-form + zodResolver + mapeo a ClienteInput
```

Documentación completa: **`docs/architecture.md`** §4.1.2 · checklist: **`docs/playbook-new-module.md`** §2.

Al implementar el módulo en un cliente: migración SQL, hook (`useCrudResource` o dedicado), páginas y rutas siguiendo el playbook.
