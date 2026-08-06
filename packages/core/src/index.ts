/**
 * @pragmata/core — modelos y tipos isomórficos (ERP + Astro + scripts).
 * Prohibido importar React u otras libs de UI aquí.
 */

export type { UUID, AuditStatus, AuditBase } from './audit.ts';
export type { Json, JsonObject } from './json.ts';
export type { DocumentStatus, DocumentW } from './document-work.ts';
export type { Product, ProductInput } from './product.ts';
export {
  isLoopbackHostname,
  isLoopbackSupabaseUrl,
  extractPort,
  supabaseApiPort,
  resolveSupabaseUrlForBrowser,
} from './supabase-url.ts';
export type {
  AgentActionKind,
  AgentRiskLevel,
  ParamsValidator,
  AgentActionContext,
  AgentActionDef,
  AgentActionRow,
  PermissionChecker,
  AgentActionOutcome,
  RunActionOptions,
  RowConditionContext,
} from './agent/index.ts';
export {
  defineAction,
  buildManifest,
  requiresConfirmation,
  runAction,
  evaluateRowConditions,
} from './agent/index.ts';
