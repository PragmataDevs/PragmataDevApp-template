import type { AgentActionContext, AgentActionDef } from './types.ts';

/** Espejo de `usePermission().hasPermission` — la misma firma que ya usa el front. */
export type PermissionChecker = (resourceCode?: string, action?: string) => boolean;

/**
 * Identidad tipada: solo existe para que TS infiera `TParams`/`TResult` al
 * declarar una acción sin tener que anotar el genérico a mano. No transforma
 * nada — es el mismo patrón que `defineConfig()` de Vite/Astro.
 */
export function defineAction<
  TParams,
  TResult,
  TCtx extends AgentActionContext = AgentActionContext,
>(def: AgentActionDef<TParams, TResult, TCtx>): AgentActionDef<TParams, TResult, TCtx> {
  return def;
}

/**
 * Generaliza `buildAssistantActions()` del CRM Objetiva: filtra el catálogo
 * declarativo de acciones por lo que el usuario actual puede hacer de verdad.
 * Esto es lo que se manda al manifest del LLM (F1) — nunca el catálogo completo.
 */
export function buildManifest<TCtx extends AgentActionContext = AgentActionContext>(
  defs: ReadonlyArray<AgentActionDef<unknown, unknown, TCtx>>,
  hasPermission: PermissionChecker,
): AgentActionDef<unknown, unknown, TCtx>[] {
  return defs.filter((def) => hasPermission(def.resourceCode, def.requiredAction));
}
