/**
 * ai-gateway — Edge Function
 *
 * Gateway genérico de prompts: catálogo (GET) y ejecución (POST).
 * Los prompts viven en ai/prompts/*.json y se sincronizan con pnpm ai:sync-prompts.
 *
 * GET  /functions/v1/ai-gateway  → { prompts: AiPromptCatalogEntry[] }
 * POST /functions/v1/ai-gateway  → { prompt_id, text }  (texto generado)
 *
 * Body POST: { prompt_id: string, variables?: Record<string, string> }
 *
 * Secrets: OPENAI_API_KEY, OPENAI_MODEL (opcional, default gpt-4o-mini)
 *
 * Deploy: pnpm ai:sync-prompts && supabase functions deploy ai-gateway
 */

import { handleCors } from '../_shared/cors.ts';
import { requireAuth, errorResponse, jsonResponse } from '../_shared/auth.ts';
import { getPrompt, listPromptCatalog } from '../_shared/ai-gateway/registry.ts';
import { interpolateTemplate } from '../_shared/ai-gateway/substitute.ts';
import { openaiChatCompletion } from '../_shared/ai-gateway/openai.ts';

const DEFAULT_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';
/** Límite defensivo del mensaje de usuario ya interpolado (caracteres). */
const MAX_USER_CHARS = 100_000;

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(req);
  } catch (response) {
    return response as Response;
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return errorResponse('AI not configured (missing OPENAI_API_KEY)', 503);

  if (req.method === 'GET') {
    console.info(`[ai-gateway] catalog for user ${user.id}`);
    return jsonResponse({ prompts: listPromptCatalog() });
  }

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  let body: { prompt_id?: string; variables?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const promptId = body.prompt_id;
  if (!promptId || typeof promptId !== 'string') return errorResponse('prompt_id required');

  const def = getPrompt(promptId);
  if (!def) return errorResponse(`Unknown prompt_id: ${promptId}`, 404);

  const variables: Record<string, string> = {};
  for (const v of def.variables ?? []) {
    const raw = body.variables?.[v.name];
    if (v.required !== false && (raw === undefined || raw === null || String(raw).trim() === '')) {
      return errorResponse(`Missing required variable: ${v.name}`);
    }
    if (raw !== undefined && raw !== null) variables[v.name] = String(raw);
  }

  const systemContent = interpolateTemplate(def.system, variables);
  const userContent = interpolateTemplate(def.userTemplate, variables);

  if (userContent.length > MAX_USER_CHARS) {
    return errorResponse(`Interpolated user message exceeds ${MAX_USER_CHARS} characters`, 413);
  }

  const model = def.model ?? DEFAULT_MODEL;
  const result = await openaiChatCompletion({
    apiKey: openaiKey,
    model,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
    max_tokens: def.max_tokens,
    temperature: def.temperature,
  });

  if (!result.ok) {
    console.error('[ai-gateway] OpenAI error:', result.status, result.body);
    return errorResponse('OpenAI request failed', 502);
  }

  console.info(`[ai-gateway] prompt=${promptId} user=${user.id} chars=${userContent.length}`);
  return jsonResponse({ prompt_id: promptId, text: result.text });
});
