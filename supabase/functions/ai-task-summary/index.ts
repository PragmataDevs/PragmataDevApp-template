/**
 * ai-task-summary — Edge Function
 *
 * Generates an AI summary for all active tasks of an entity using OpenAI.
 * Called from the TasksPage when VITE_ENABLE_AI=true.
 *
 * POST /functions/v1/ai-task-summary
 * Headers: Authorization: Bearer <user_jwt>
 * Body: { entity_id: string }
 * Returns: { summary: string }
 *
 * Environment variables:
 *   OPENAI_API_KEY         — sk-xxx
 *   OPENAI_MODEL           — gpt-4o-mini (default)
 *
 * Deploy: supabase functions deploy ai-task-summary
 */

// `corsHeaders` no se importa aquí a propósito: `jsonResponse`/`errorResponse`
// (../_shared/auth.ts) ya los inyectan en cada respuesta.
import { handleCors } from '../_shared/cors.ts';
import { requireAuth, createSupabaseClient, errorResponse, jsonResponse } from '../_shared/auth.ts';

interface Task {
  id:          string;
  title:       string;
  task_status: string;
  priority:    string;
  description: string | null;
}

const MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  // Auth guard — must be a logged-in user
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(req);
  } catch (response) {
    return response as Response;
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return errorResponse('AI not configured (missing OPENAI_API_KEY)', 503);

  let body: { entity_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  if (!body.entity_id) return errorResponse('entity_id required');

  const supabase = createSupabaseClient(req);

  // Fetch tasks for the entity
  const { data: tasks, error: dbError } = await supabase
    .from('tasks')
    .select('id, title, task_status, priority, description')
    .eq('entity_id', body.entity_id)
    .eq('status', 'active')
    .order('task_status');

  if (dbError) return errorResponse(dbError.message, 500);
  if (!tasks?.length) return jsonResponse({ summary: 'No hay tareas activas para resumir.' });

  // Build prompt
  const taskList = (tasks as Task[]).map((t) =>
    `- [${t.task_status.toUpperCase()}][${t.priority}] ${t.title}${t.description ? `: ${t.description.slice(0, 80)}` : ''}`
  ).join('\n');

  const prompt = `Eres un asistente de gestión de proyectos. Analiza las siguientes tareas y proporciona:
1. Un resumen ejecutivo en 2-3 oraciones del estado general del proyecto.
2. Los 2-3 puntos más críticos o bloqueantes.
3. Una recomendación de prioridad para la próxima sesión de trabajo.

Responde en español, de forma concisa y directa. No uses markdown.

TAREAS:
${taskList}`;

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model:    MODEL,
        messages: [
          { role: 'system', content: 'Eres un asistente experto en gestión de proyectos y metodologías ágiles.' },
          { role: 'user',   content: prompt },
        ],
        max_tokens:   400,
        temperature:  0.3,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('[ai-task-summary] OpenAI error:', errText);
      return errorResponse('OpenAI request failed', 502);
    }

    const result = await openaiRes.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const summary = result.choices?.[0]?.message?.content?.trim() ?? '';
    console.info(`[ai-task-summary] Generated summary for entity ${body.entity_id} by user ${user.id}`);

    return jsonResponse({ summary });

  } catch (err) {
    console.error('[ai-task-summary] fetch error', err);
    return errorResponse('Failed to contact AI service', 502);
  }
});
