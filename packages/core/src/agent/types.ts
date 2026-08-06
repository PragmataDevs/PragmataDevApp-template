import type { JsonObject } from '../json.ts';

/**
 * La "escalera de 4 niveles" de una acción de agente (ver
 * data/internal/agente-operativo/plan-rollout-2026-08-05.md §3):
 * - query    → lectura pura (vista security_invoker). Auto-ejecutable.
 * - navigate → llevar al usuario a una pantalla (lo que ya hace el CRM hoy).
 * - prefill  → navegar con un borrador precargado; el submit sigue siendo humano.
 * - mutate   → CRUD con OCC/AuditBase (patrón useCrudResource).
 * - rpc      → invocar una RPC de Postgres ya existente (la misma que usa un botón).
 */
export type AgentActionKind = 'query' | 'navigate' | 'prefill' | 'mutate' | 'rpc';

/**
 * Nivel de riesgo declarado por la acción — determina la política de
 * confirmación en `runAction()`. Ver reglas duras en `policy.ts`.
 */
export type AgentRiskLevel = 'safe' | 'write' | 'financial' | 'destructive';

/**
 * Cualquier validador con la forma de un Zod schema (`.parse(input): T`), sin que
 * este paquete dependa de la librería `zod` en sí — evita agregar una dependencia
 * nueva a `@pragmata/core` solo para tipar esto (anti-ruido). Un `z.object({...})`
 * real satisface esta interfaz de forma estructural.
 */
export interface ParamsValidator<T> {
  parse: (input: unknown) => T;
}

/**
 * Contexto mínimo que cada app pasa a `execute()`. Cada app lo extiende con lo
 * que su ejecución necesite (su propio cliente Supabase, `entityId`, etc.) —
 * este paquete no conoce Supabase ni React, solo el contrato.
 */
export interface AgentActionContext {
  /** `auth.uid()` del usuario que está actuando — nunca se ejecuta con service_role. */
  userId: string;
  [key: string]: unknown;
}

/**
 * Definición declarativa de una acción de agente. `resourceCode`/`requiredAction`
 * DEBEN existir en el `APP_RESOURCES` (src/config/security/resources.ts) de la
 * app que la registre — el manifest se filtra contra eso (ver `buildManifest`).
 *
 * `execute` es la única pieza que cada app implementa a mano: necesita su propio
 * cliente Supabase/contexto para correr con la sesión real del usuario (RLS).
 * Este paquete NUNCA ejecuta nada con service_role.
 */
export interface AgentActionDef<
  TParams = unknown,
  TResult = unknown,
  TCtx extends AgentActionContext = AgentActionContext,
> {
  /** Clave estable que usa el LLM/manifest, ej. 'crear-prospecto'. */
  key: string;
  /** Nombre legible (para el usuario y el modelo). */
  title: string;
  /** Cuándo usarla — ayuda al modelo a elegir la acción correcta. */
  description: string;
  /** Debe existir en `APP_RESOURCES` de la app. */
  resourceCode: string;
  /** El `action_*`/verbo (`read`,`create`,`update`,`execute`,...) que el usuario necesita tener concedido. */
  requiredAction: string;
  kind: AgentActionKind;
  riskLevel: AgentRiskLevel;
  /** Validación de params (opcional). Estructuralmente compatible con un Zod schema. */
  paramsSchema?: ParamsValidator<TParams>;
  /**
   * Solo aplica cuando `riskLevel === 'write'`: por default requiere confirmación,
   * pero una acción concreta puede relajarlo (`false`) si de verdad es inofensiva.
   * NUNCA tiene efecto sobre `financial`/`destructive` — esas siempre confirman,
   * lo decide `requiresConfirmation()` en código, no aquí (ver policy.ts).
   */
  requireConfirmation?: boolean;
  /** Ejecuta la acción ya autorizada + (si aplicaba) confirmada. */
  execute: (params: TParams, ctx: TCtx) => Promise<TResult>;
}

/** Fila cruda contra la que se evalúan `conditions` (scoping a nivel de fila). Ver `conditions.ts`. */
export type AgentActionRow = JsonObject;
