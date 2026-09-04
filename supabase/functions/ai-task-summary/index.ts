/**
 * ai-task-summary — Edge Function (Gemini)
 *
 * Resumen ejecutivo de las tareas activas de una entity. Se llama desde TasksPage
 * cuando VITE_ENABLE_AI=true.
 *
 * POST /functions/v1/ai-task-summary   (JWT del usuario)
 * Body: { entity_id: string } → { summary: string }
 *
 * Control de costo: ai_can_run('task_summary') antes; ai_usage después.
 * Secrets: GEMINI_API_KEY (el modelo lo manda platform_settings.ai_default_model).
 */

import { handleCors } from '../_shared/cors.ts';
import { requireAuth, createSupabaseClient, createServiceClient, errorResponse, jsonResponse } from '../_shared/auth.ts';
import { geminiGenerate } from '../_shared/ai-gateway/gemini.ts';
import { aiGate, aiLog, gateStatus, userTeamId } from '../_shared/ai-gateway/metering.ts';

interface Task {
  id:          string;
  title:       string;
  task_status: string;
  priority:    string;
  description: string | null;
}

const FEATURE = 'task_summary';

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(req);
  } catch (response) {
    return response as Response;
  }

  let body: { entity_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }
  if (!body.entity_id) return errorResponse('entity_id required');

  const supabase = createSupabaseClient(req);

  const gate = await aiGate(supabase, FEATURE);
  if (!gate.allowed) return errorResponse(`ai_not_allowed:${gate.reason ?? 'unknown'}`, gateStatus(gate.reason));

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return errorResponse('AI not configured (missing GEMINI_API_KEY)', 503);

  // Tareas de la entity (RLS del usuario decide qué ve)
  const { data: tasks, error: dbError } = await supabase
    .from('tasks')
    .select('id, title, task_status, priority, description')
    .eq('entity_id', body.entity_id)
    .eq('status', 'active')
    .order('task_status');

  if (dbError) return errorResponse(dbError.message, 500);
  if (!tasks?.length) return jsonResponse({ summary: 'No hay tareas activas para resumir.' });

  const taskList = (tasks as Task[]).map((t) =>
    `- [${t.task_status.toUpperCase()}][${t.priority}] ${t.title}${t.description ? `: ${t.description.slice(0, 80)}` : ''}`
  ).join('\n');

  const prompt = `Analiza las siguientes tareas y da:
1. Un resumen ejecutivo en 2-3 oraciones del estado general.
2. Los 2-3 puntos más críticos o bloqueantes.
3. Una recomendación de prioridad para la próxima sesión de trabajo.

Responde en español, conciso y directo. Sin markdown.

TAREAS:
${taskList}`;

  const service = createServiceClient();
  const model = gate.model ?? 'gemini-2.5-flash-lite';
  const teamId = await userTeamId(supabase, user.id);
  const t0 = Date.now();
  const result = await geminiGenerate({
    apiKey,
    model,
    system: 'Eres un asistente experto en gestión de proyectos. Respondes en español.',
    user: prompt,
    maxOutputTokens: 400,
    temperature: 0.3,
  });
  const latencyMs = Date.now() - t0;

  if (!result.ok) {
    console.error('[ai-task-summary] Gemini error:', result.status, result.body.slice(0, 300));
    await aiLog(service, { teamId, entityId: body.entity_id, userId: user.id, feature: FEATURE, model, latencyMs, ok: false, error: `gemini_${result.status}` });
    return errorResponse('Gemini request failed', 502);
  }
  await aiLog(service, { teamId, entityId: body.entity_id, userId: user.id, feature: FEATURE, model, usage: result.usage, latencyMs, ok: true });

  return jsonResponse({ summary: result.text });
});
