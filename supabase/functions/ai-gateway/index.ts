/**
 * ai-gateway — Edge Function (Gemini)
 *
 * Gateway único de prompts: catálogo (GET) y ejecución (POST) con control de costo.
 * Los prompts viven en ai/prompts/*.json y se sincronizan con pnpm ai:sync-prompts.
 *
 * GET  /functions/v1/ai-gateway  → { prompts: AiPromptCatalogEntry[] }
 * POST /functions/v1/ai-gateway  → { prompt_id, text, json?, usage }
 *   Body: { prompt_id, variables?: Record<string,string>, image_base64?, image_mime?, entity_id? }
 *
 * Flujo: JWT → ai_can_run(feature) → Gemini (modelo de la DB, tope de salida fijo)
 *        → INSERT ai_usage (service_role) → respuesta.
 * Secrets: GEMINI_API_KEY. El modelo NO viene del body ni de env: platform_settings.ai_default_model.
 *
 * Deploy: pnpm ai:sync-prompts && supabase functions deploy ai-gateway
 */

import { handleCors } from '../_shared/cors.ts';
import { requireAuth, createSupabaseClient, createServiceClient, errorResponse, jsonResponse } from '../_shared/auth.ts';
import { getPrompt, listPromptCatalog } from '../_shared/ai-gateway/registry.ts';
import { interpolateTemplate } from '../_shared/ai-gateway/substitute.ts';
import { geminiGenerate } from '../_shared/ai-gateway/gemini.ts';
import { aiGate, aiLog, gateStatus, userTeamId } from '../_shared/ai-gateway/metering.ts';

/** Límite defensivo del mensaje de usuario ya interpolado (caracteres). */
const MAX_USER_CHARS = 100_000;
/** Imagen máxima aceptada (base64 ≈ 4/3 del binario): ~6 MB binarios. */
const MAX_IMAGE_B64 = 8_000_000;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const DEFAULT_MAX_TOKENS = 512;
const HARD_MAX_TOKENS = 8192;

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(req);
  } catch (response) {
    return response as Response;
  }

  if (req.method === 'GET') {
    return jsonResponse({ prompts: listPromptCatalog() });
  }
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  let body: { prompt_id?: string; variables?: Record<string, string>; image_base64?: string; image_mime?: string; entity_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const promptId = body.prompt_id;
  if (!promptId || typeof promptId !== 'string') return errorResponse('prompt_id required');
  const def = getPrompt(promptId);
  if (!def) return errorResponse(`Unknown prompt_id: ${promptId}`, 404);

  const feature = (def.feature ?? def.id).replace(/[^a-z_]/g, '_');

  // ── Gate de costo/cuota con el JWT del usuario ────────────────────────────
  const userClient = createSupabaseClient(req);
  const gate = await aiGate(userClient, feature);
  if (!gate.allowed) {
    return errorResponse(`ai_not_allowed:${gate.reason ?? 'unknown'}`, gateStatus(gate.reason));
  }

  // ── Variables e imagen ────────────────────────────────────────────────────
  const variables: Record<string, string> = {};
  for (const v of def.variables ?? []) {
    const raw = body.variables?.[v.name];
    if (v.required !== false && (raw === undefined || raw === null || String(raw).trim() === '')) {
      return errorResponse(`Missing required variable: ${v.name}`);
    }
    if (raw !== undefined && raw !== null) variables[v.name] = String(raw);
  }

  let image: { data: string; mimeType: string } | undefined;
  if (body.image_base64) {
    if (!def.accepts_image) return errorResponse('Este prompt no acepta imagen', 400);
    const mime = (body.image_mime ?? '').toLowerCase();
    if (!IMAGE_MIMES.has(mime)) return errorResponse('image_mime no permitido', 400);
    const data = body.image_base64.replace(/^data:[^;]+;base64,/, '');
    if (data.length > MAX_IMAGE_B64) return errorResponse('Imagen demasiado grande (máx ~6 MB)', 413);
    image = { data, mimeType: mime };
  } else if (def.accepts_image) {
    return errorResponse('Este prompt requiere image_base64', 400);
  }

  const systemContent = interpolateTemplate(def.system, variables);
  const userContent = interpolateTemplate(def.userTemplate, variables);
  if (userContent.length > MAX_USER_CHARS) {
    return errorResponse(`Interpolated user message exceeds ${MAX_USER_CHARS} characters`, 413);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return errorResponse('AI not configured (missing GEMINI_API_KEY)', 503);

  // ── Modelo: lo manda la DB; el prompt puede pedir otro solo si está permitido ─
  const service = createServiceClient();
  let model = gate.model ?? 'gemini-2.5-flash-lite';
  if (def.model && def.model !== model) {
    const { data: allowed } = await service.from('ai_model_prices').select('model').eq('model', def.model).eq('allowed_in_app', true).eq('status', 'active').maybeSingle();
    if (allowed) model = def.model;
  }
  const maxOutputTokens = Math.min(def.max_tokens ?? DEFAULT_MAX_TOKENS, HARD_MAX_TOKENS);

  // ── Gemini ────────────────────────────────────────────────────────────────
  const teamId = await userTeamId(userClient, user.id);
  const t0 = Date.now();
  const result = await geminiGenerate({
    apiKey,
    model,
    system: systemContent,
    user: userContent,
    image,
    maxOutputTokens,
    temperature: def.temperature,
    responseMimeType: def.response_schema ? 'application/json' : undefined,
    responseSchema: def.response_schema,
  });
  const latencyMs = Date.now() - t0;

  if (!result.ok) {
    console.error('[ai-gateway] Gemini error:', result.status, result.body.slice(0, 500));
    await aiLog(service, { teamId, entityId: body.entity_id ?? null, userId: user.id, feature, model, latencyMs, ok: false, error: `gemini_${result.status}` });
    return errorResponse('Gemini request failed', 502);
  }

  await aiLog(service, { teamId, entityId: body.entity_id ?? null, userId: user.id, feature, model, usage: result.usage, latencyMs, ok: true });

  let parsed: unknown = undefined;
  if (def.response_schema) {
    try { parsed = JSON.parse(result.text); } catch { parsed = undefined; }
  }

  console.info(`[ai-gateway] prompt=${promptId} feature=${feature} user=${user.id} model=${model} tokens=${result.usage.totalTokens} ms=${latencyMs}`);
  return jsonResponse({
    prompt_id: promptId,
    text: result.text,
    json: parsed,
    usage: result.usage,
    finish_reason: result.finishReason,
  });
});
