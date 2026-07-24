---
name: auditbase-occ
description: >-
  El patrón AuditBase + control de concurrencia (OCC) de PragmataDevApp: las
  columnas base que TODA tabla hereda, el trigger set_updated_at, el soft-delete,
  y cómo se escribe un UPDATE seguro. Úsala al crear/modificar entidades, tablas,
  modelos TypeScript o queries de Supabase. Es la Tríada Sagrada en acción.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# AuditBase + OCC — el contrato de datos de PragmataDevs

Toda tabla de negocio **hereda AuditBase**. Sin excepción. Si creas una tabla sin estas columnas, rompiste el contrato (es un bug, no una opción).

> Detalle vivo en el repo: `src/types/core/base.ts` (interface), `.cursor/rules/01-data-model.mdc` (reglas), `supabase/migrations/20260111120000_pragmata_schema.sql` (trigger + tablas), `src/lib/hooks/useCrudResource.ts` (OCC en acción). Ejemplo canónico: `src/features/clients/types/`.

## 1. La interface AuditBase

```typescript
export type AuditStatus = 'active' | 'deleted';
export interface AuditBase {
  id: UUID;                    // gen_random_uuid()
  created_at: string;          // ISO, set por DB en INSERT
  updated_at: string;          // ISO, lo PISA el trigger en cada UPDATE
  created_by?: UUID | null;    // profiles(id) — lo pone el cliente
  updated_by?: UUID | null;    // profiles(id) — lo pone el cliente (el trigger NO)
  version: number;             // contador OCC, lo incrementa el trigger
  status: AuditStatus;         // 'active' | 'deleted' (borrado lógico)
  deleted_at?: string | null;  // ISO, se setea al borrar
}
```
> 📦 El tipo canónico vive en **`@pragmata/core`** (paquete isomórfico compartido ERP+Astro+scripts); `src/types/core/base.ts` solo lo **re-exporta** para React. Importa desde `@/types/core/base`.

## 2. El trigger `set_updated_at()` (lo automático)

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();                       -- timestamp server-side (ignora al cliente)
    NEW.version := COALESCE(OLD.version, 0) + 1;   -- OCC: +1 en cada UPDATE
    RETURN NEW;
END; $$;
```
Se ataca `BEFORE UPDATE` a cada tabla AuditBase (hay un `DO $$` con el array `audit_tables` en el schema — al crear tabla nueva, **agrégala a ese array**). En INSERT version queda 0; el primer UPDATE la sube a 1.

## 3. OCC — cómo se escribe un UPDATE (obligatorio)

Todo UPDATE manda `.eq('version', versionActual)`. Si 0 filas cambiaron = otro ganó = conflicto.

```typescript
const { data } = await supabase
  .from('clientes')
  .update({ nombre: 'Nuevo', updated_by: userId })  // NO setees updated_at ni version (trigger)
  .eq('id', id)
  .eq('version', cliente.version)                    // ← OBLIGATORIO
  .select().single();

if (!data) {                  // .single() NO tira error con 0 filas: revisa !data a mano
  await reload(id);           // alguien editó primero → recarga y muestra diff
  throw new Error('Conflicto: alguien más editó. Recarga.');
}
```

## 4. Soft-delete (nunca DELETE duro desde la app)

```typescript
// ✅ borrado lógico
.update({ status: 'deleted', deleted_at: new Date().toISOString(), updated_by: userId })
  .eq('id', id).eq('version', version)
// ❌ prohibido: .delete().eq('id', id)
```
Las queries de lista filtran `.eq('status', 'active')`. El DELETE duro se reserva para limpieza/cascada de sistema.

## 5. El lado TypeScript: interface + Zod + factory

Dos archivos por entidad con formulario:
- `types/<entidad>.ts` → `interface X extends AuditBase`, `type XInput = Pick<X, ...>` (campos editables), `createEmptyX(userId, ...)`.
- `types/<entidad>.schema.ts` → `export const xSchema = z.object({...})`, `export type XFormValues = z.output<typeof xSchema>`.

**Prohibido:** DTOs, FormState, validación suelta en JSX. Un modelo, una verdad.

## Reglas de oro 🔒
1. Toda tabla de negocio extiende AuditBase (las 8 columnas).
2. OCC obligatorio en TODO UPDATE (`.eq('version', v)`); maneja el conflicto (`if(!data)`).
3. Nunca DELETE duro desde la app — soft-delete (`status`+`deleted_at`).
4. El trigger pone `updated_at` y `version`; **el cliente DEBE poner `updated_by`**.
5. Un modelo por concepto, en `types/<entidad>.ts`. Schema en `.schema.ts`, no en componentes.
6. Para CRUD usa `useCrudResource` (trae OCC + soft-delete + session retry); custom solo si hay lógica multi-tabla.
