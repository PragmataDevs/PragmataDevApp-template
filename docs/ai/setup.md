# IA — Guía de Setup e Integración

El Pilar Intelligence de Pragmata usa **Supabase Edge Functions** (Deno) como capa intermedia
entre el cliente React y los LLMs (OpenAI, Anthropic). Nunca se llama directamente a la API desde el browser.

---

## Feature Flag

```env
# .env (React app)
VITE_ENABLE_AI=true
```

Cuando está en `false` (default), todos los botones de IA se ocultan automáticamente en la UI.
No hay costo ni error si la API key no está configurada.

---

## Edge Functions disponibles

### `ai-task-summary`

Genera un resumen ejecutivo de todas las tareas activas de una entidad.

**Input:**
```json
{ "entity_id": "uuid-de-la-entidad" }
```

**Output:**
```json
{ "summary": "Texto del resumen generado por GPT-4o-mini..." }
```

**Uso en UI:**  
Botón "Resumen IA" en `TasksPage` → panel con el resumen → se descarta con X.

---

## Setup Inicial

### 1. Obtener API Key de OpenAI

- [platform.openai.com](https://platform.openai.com) → API Keys → Create new secret key
- Guardar como secret de Supabase (nunca en `.env` del repo):

```bash
supabase secrets set OPENAI_API_KEY=sk-proj-xxx
supabase secrets set OPENAI_MODEL=gpt-4o-mini   # opcional, default es gpt-4o-mini
```

### 2. Desplegar la función

```bash
# Desde la raíz del proyecto
supabase login
supabase link --project-ref <tu_project_ref>
supabase functions deploy ai-task-summary
```

### 3. Activar en `.env`

```env
VITE_ENABLE_AI=true
```

### 4. Probar

```bash
# Test manual con curl
curl -X POST https://<project>.supabase.co/functions/v1/ai-task-summary \
  -H "Authorization: Bearer <user_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "uuid-de-entidad-con-tareas"}'
```

---

## Agregar nuevas funciones de IA

Todo el boilerplate (CORS, auth, error handling) vive en `supabase/functions/_shared/`.
Para una función nueva:

```bash
mkdir supabase/functions/ai-mi-funcion
```

```typescript
// supabase/functions/ai-mi-funcion/index.ts
import { handleCors } from '../_shared/cors.ts';
import { requireAuth, jsonResponse, errorResponse } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const user = await requireAuth(req);  // lanza 401 si no autenticado
    const body = await req.json();

    // ... lógica de IA ...

    return jsonResponse({ result: '...' });
  } catch (err) {
    if (err instanceof Response) return err;  // 401 de requireAuth
    return errorResponse('Error interno', 500);
  }
});
```

---

## Roadmap de IA (futuro)

| Feature | Descripción | Dependencia |
|---------|-------------|-------------|
| `ai-task-summary` | Resumen de tareas por entidad | ✅ Implementado |
| `ai-document-extract` | Extrae datos de PDFs (facturas, contratos) | `pgvector` + Storage |
| `ai-search` | Búsqueda semántica sobre documentos | `pgvector` en Supabase |
| `ai-chat` | Chat contextual sobre la entidad activa | `pgvector` + historial |

### pgvector para búsqueda semántica

```sql
-- Habilitar extensión (una vez por proyecto)
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabla de embeddings
CREATE TABLE embeddings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   UUID REFERENCES entities(id),
  source_type TEXT,          -- 'task', 'document', 'comment'
  source_id   UUID,
  content     TEXT,
  embedding   vector(1536),  -- OpenAI text-embedding-3-small
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

---

## Costos estimados (OpenAI)

| Modelo | Costo aprox. | Usar para |
|--------|-------------|-----------|
| `gpt-4o-mini` | ~$0.0001/resumen | Resúmenes, clasificación |
| `gpt-4o` | ~$0.005/resumen | Análisis complejo, extracción |
| `text-embedding-3-small` | ~$0.00002/doc | Embeddings para búsqueda |

**Recomendación:** `gpt-4o-mini` para el 95% de los casos. Solo escalar a `gpt-4o` cuando sea necesario.
