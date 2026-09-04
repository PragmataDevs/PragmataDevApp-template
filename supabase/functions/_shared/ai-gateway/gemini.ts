/**
 * Llamada mínima a Gemini (generateContent, REST v1beta, fetch nativo, sin SDK).
 * Regla de la casa: toda IA dentro de las apps usa Gemini (GEMINI_API_KEY).
 * Forma de la request/response verificada en ai.google.dev/api/generate-content (4-sep-2026).
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiImage {
  /** base64 sin prefijo data: */
  data: string;
  mimeType: string; // image/jpeg | image/png | image/webp | application/pdf
}

export interface GeminiUsage {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
}

export type GeminiResult =
  | { ok: true; text: string; usage: GeminiUsage; finishReason: string | null }
  | { ok: false; status: number; body: string };

export async function geminiGenerate(params: {
  apiKey: string;
  model: string;
  system?: string;
  user: string;
  image?: GeminiImage;
  maxOutputTokens: number;
  temperature?: number;
  responseMimeType?: 'text/plain' | 'application/json';
  responseSchema?: Record<string, unknown>;
}): Promise<GeminiResult> {
  const parts: Array<Record<string, unknown>> = [{ text: params.user }];
  if (params.image) {
    parts.push({ inline_data: { mime_type: params.image.mimeType, data: params.image.data } });
  }

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: params.maxOutputTokens,
      temperature: params.temperature ?? 0.2,
      ...(params.responseMimeType ? { responseMimeType: params.responseMimeType } : {}),
      ...(params.responseSchema ? { responseSchema: params.responseSchema } : {}),
    },
  };
  if (params.system) body.systemInstruction = { parts: [{ text: params.system }] };

  const url = `${GEMINI_BASE}/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return { ok: false, status: res.status, body: await res.text() };
  }

  const json = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  };
  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  return {
    ok: true,
    text,
    finishReason: json.candidates?.[0]?.finishReason ?? null,
    usage: {
      promptTokens: json.usageMetadata?.promptTokenCount ?? 0,
      candidatesTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: json.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}
