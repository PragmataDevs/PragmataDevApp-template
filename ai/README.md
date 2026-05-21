# AI Gateway — Pragmata Template

> **Documentación completa:** [`docs/ai/setup.md`](../docs/ai/setup.md) · índice general: [`docs/README.md`](../docs/README.md)

Capa única entre tu app (React, Astro, móvil) y el proveedor LLM. **La API key nunca vive en el navegador**: solo en secrets de Supabase Edge Functions.

## Qué resuelve

| Problema | Cómo lo resuelve el gateway |
|----------|-----------------------------|
| Exponer `sk-...` en el cliente | Imposible: solo Deno en Edge tiene `OPENAI_API_KEY`. |
| Repetir CORS/auth en cada feature | Un solo endpoint + `requireAuth` compartido. |
| Prompts dispersos en código | Catálogo versionado en `ai/prompts/*.json` + sync a `_shared`. |
| Cliente pide “meter IA” | Activas secret, despliegas función, llamas con `prompt_id` + variables. |

## Arquitectura

```text
Browser / App  →  POST /functions/v1/ai-gateway  →  OpenAI
                      ↑ JWT (usuario logueado)
                      ↑ prompt_id + variables
```

- **Definiciones de prompts (fuente canónica):** `ai/prompts/*.json`
- **Copia consumida por Deno en deploy:** `supabase/functions/_shared/ai-gateway/prompts/` (generada con `pnpm ai:sync-prompts`)
- **Edge Function:** `supabase/functions/ai-gateway/index.ts`

> **PDF / binarios:** este gateway acepta **texto** (`variables.text`). Para “analizar PDF” subes el archivo a Storage, extraes texto en cliente o con un job, y envías el texto aquí. Análisis directo de PDF con visión (multimodal) es una extensión opcional futura.

## Setup rápido (para ti o el cliente)

### 1. Secret en Supabase

```bash
supabase secrets set OPENAI_API_KEY=sk-proj-...
# opcional:
supabase secrets set OPENAI_MODEL=gpt-4o-mini
```

### 2. Sincronizar prompts y desplegar

```bash
pnpm ai:sync-prompts
supabase functions deploy ai-gateway
```

### 3. Activar IA en el ERP (UI existente + nuevas llamadas)

En `.env`:

```env
VITE_ENABLE_AI=true
```

El flag controla la UI de features de IA; el gateway **siempre** exige JWT válido aunque el flag esté en `false` (no uses el endpoint desde cliente público sin auth).

### 4. Probar con curl

Catálogo (metadatos, sin system prompt completo):

```bash
curl -s "https://<PROJECT_REF>.supabase.co/functions/v1/ai-gateway" \
  -H "Authorization: Bearer <USER_JWT>"
```

Ejecutar un prompt:

```bash
curl -s -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/ai-gateway" \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"prompt_id":"invoice_text","variables":{"text":"RFC ABC...\nTotal $1,234.56"}}'
```

Respuesta típica:

```json
{ "prompt_id": "invoice_text", "text": "..." }
```

## API del gateway

| Método | Descripción |
|--------|-------------|
| `GET` | Lista `id`, `label`, `description`, `variables` de cada prompt registrado. |
| `POST` | Cuerpo: `{ "prompt_id": string, "variables": Record<string, string> }`. Sustituye `{{nombre}}` en plantillas y llama al modelo. |

Límites defensivos: tamaño total del mensaje de usuario sustituido acotado (ver código en `index.ts`).

## Añadir un prompt nuevo

1. Crea `ai/prompts/mi-prompt.json` siguiendo el esquema de los ejemplos (`id`, `label`, `system`, `userTemplate`, `variables`, opcionalmente `max_tokens`, `temperature`).
2. Ejecuta `pnpm ai:sync-prompts`.
3. Registra el import en `supabase/functions/_shared/ai-gateway/registry.ts` (mapa `PROMPTS`).
4. `supabase functions deploy ai-gateway`.

## Relación con `ai-task-summary`

`ai-task-summary` sigue siendo un endpoint dedicado (lee tareas en Postgres). El **gateway** es genérico: prompts declarados + variables. Puedes migrar resúmenes al gateway más adelante si quieres unificar.

## Documentación extendida

Ver también `docs/ai/setup.md` (flag `VITE_ENABLE_AI`, despliegue, costos).
