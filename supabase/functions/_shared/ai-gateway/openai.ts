/**
 * Llamada mínima a OpenAI Chat Completions (sin SDK, fetch nativo).
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function openaiChatCompletion(params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
}): Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }> {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      max_tokens: params.max_tokens ?? 512,
      temperature: params.temperature ?? 0.2,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, body };
  }

  const result = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = result.choices?.[0]?.message?.content?.trim() ?? '';
  return { ok: true, text };
}
