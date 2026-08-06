import type { PermissionChecker } from './manifest.ts';
import type { AgentActionContext, AgentActionDef, AgentRiskLevel } from './types.ts';

/**
 * Política dura de confirmación (decisión de Wicho, 2026-07-30 — no se reabre):
 * - `financial` / `destructive` ⇒ SIEMPRE confirmación explícita antes de ejecutar,
 *   sin excepción de rol (ni god se lo salta). No hay override posible.
 * - `write` ⇒ confirmación por default; una acción concreta puede relajarla con
 *   `requireConfirmation: false` si de verdad es inofensiva.
 * - `safe` / (implícitamente `query`) ⇒ auto-ejecutable, nunca confirma.
 *
 * Esto vive en CÓDIGO, no en un prompt de LLM — el modelo nunca decide si algo
 * necesita confirmación, solo la política determinista de acá.
 */
export function requiresConfirmation(
  action: Pick<AgentActionDef, 'riskLevel' | 'requireConfirmation'>,
): boolean {
  const hardConfirm: AgentRiskLevel[] = ['financial', 'destructive'];
  if (hardConfirm.includes(action.riskLevel)) return true;
  if (action.riskLevel === 'write') return action.requireConfirmation ?? true;
  return false; // 'safe'
}

export type AgentActionOutcome<TResult> =
  | { status: 'executed'; result: TResult }
  | { status: 'needs_confirmation'; reason: string }
  | { status: 'denied'; reason: string };

export interface RunActionOptions<TCtx extends AgentActionContext> {
  /** Gate de recurso/acción — SIEMPRE se vuelve a checar aquí, nunca solo en el manifest. */
  hasPermission: PermissionChecker;
  /** El usuario ya confirmó explícitamente ejecutar esta acción con estos params. */
  confirmed?: boolean;
  ctx: TCtx;
}

/**
 * Runner genérico de política — NO ejecuta contra Postgres, solo aplica las
 * reglas duras (permiso + confirmación) antes de invocar `action.execute()`.
 * Diseñado para poder correr tanto en el front (antes de mostrar/ejecutar un
 * botón) como en una Edge Function (F1, `agent-gateway`) sin duplicar la regla.
 */
export async function runAction<TParams, TResult, TCtx extends AgentActionContext>(
  action: AgentActionDef<TParams, TResult, TCtx>,
  rawParams: unknown,
  opts: RunActionOptions<TCtx>,
): Promise<AgentActionOutcome<TResult>> {
  if (!opts.hasPermission(action.resourceCode, action.requiredAction)) {
    return {
      status: 'denied',
      reason: `Falta el permiso "${action.requiredAction}" sobre "${action.resourceCode}".`,
    };
  }

  if (requiresConfirmation(action) && !opts.confirmed) {
    return {
      status: 'needs_confirmation',
      reason: `"${action.title}" es riesgo "${action.riskLevel}" — requiere confirmación explícita del usuario.`,
    };
  }

  const params = action.paramsSchema ? action.paramsSchema.parse(rawParams) : (rawParams as TParams);
  const result = await action.execute(params, opts.ctx);
  return { status: 'executed', result };
}
