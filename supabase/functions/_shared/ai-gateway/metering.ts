/**
 * Medición y control de costo de IA (docs/estrategia-costos-ia.md).
 *   aiGate()  → consulta ai_can_run(feature) CON el JWT del usuario, ANTES de llamar a Gemini.
 *   aiLog()   → registra la llamada en ai_usage con service_role, DESPUÉS.
 * La edge function nunca confía en el body para modelo ni feature libre.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { GeminiUsage } from './gemini.ts';

export interface AiGateResult {
  allowed: boolean;
  reason?: string;
  model?: string;
  used?: number;
  limit?: number;
  remaining?: number;
}

export async function aiGate(userClient: SupabaseClient, feature: string): Promise<AiGateResult> {
  const { data, error } = await userClient.rpc('ai_can_run', { p_feature: feature });
  if (error) {
    console.error('[ai] ai_can_run error', error);
    return { allowed: false, reason: 'gate_error' };
  }
  return (data ?? { allowed: false, reason: 'gate_empty' }) as AiGateResult;
}

/** HTTP status para cada motivo de rechazo del gate. */
export function gateStatus(reason?: string): number {
  switch (reason) {
    case 'not_authenticated':
    case 'anonymous_not_allowed':
      return 401;
    case 'plan_quota_exhausted':
    case 'team_cannot_write':
    case 'feature_not_in_plan':
      return 402;
    case 'global_budget_exhausted':
    case 'team_budget_exhausted':
      return 429;
    case 'ai_disabled':
      return 503;
    default:
      return 403;
  }
}

export async function aiLog(service: SupabaseClient, entry: {
  teamId: string | null;
  entityId?: string | null;
  userId: string;
  feature: string;
  model: string;
  usage?: GeminiUsage;
  latencyMs: number;
  ok: boolean;
  error?: string;
}): Promise<void> {
  if (!entry.teamId) return; // sin team no hay a quién cargarle el costo; el gate ya lo habría negado
  const tokensIn = entry.usage?.promptTokens ?? 0;
  const tokensOut = entry.usage?.candidatesTokens ?? 0;
  let cost = 0;
  const { data } = await service.rpc('ai_estimate_cost', { p_model: entry.model, p_tokens_in: tokensIn, p_tokens_out: tokensOut });
  if (typeof data === 'number') cost = data;
  else if (typeof data === 'string') cost = Number(data) || 0;

  const { error } = await service.from('ai_usage').insert({
    team_id: entry.teamId,
    entity_id: entry.entityId ?? null,
    user_id: entry.userId,
    feature: entry.feature,
    model: entry.model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: cost,
    latency_ms: entry.latencyMs,
    ok: entry.ok,
    error_detail: entry.error ?? null,
  });
  if (error) console.error('[ai] no se pudo registrar ai_usage', error);
}

/** team_id del usuario (para cargar el costo). */
export async function userTeamId(userClient: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await userClient.from('profiles').select('team_id').eq('id', userId).maybeSingle();
  return (data?.team_id as string | undefined) ?? null;
}
