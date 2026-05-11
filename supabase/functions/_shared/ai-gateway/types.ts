/**
 * Tipos compartidos del AI Gateway (Edge Functions / Deno).
 */

export interface AiPromptVariable {
  name: string;
  required?: boolean;
  description?: string;
}

export interface AiPromptDefinition {
  id: string;
  label: string;
  description: string;
  system: string;
  /** Plantilla con placeholders {{nombre_variable}} */
  userTemplate: string;
  variables: AiPromptVariable[];
  /** Override del modelo global (OPENAI_MODEL) */
  model?: string;
  max_tokens?: number;
  temperature?: number;
}

/** Metadatos expuestos en GET /ai-gateway (sin system ni plantillas completas). */
export interface AiPromptCatalogEntry {
  id: string;
  label: string;
  description: string;
  variables: AiPromptVariable[];
}
