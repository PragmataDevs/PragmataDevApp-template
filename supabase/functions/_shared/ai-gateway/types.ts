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
  /**
   * Feature para cuota y medición (plan_limits 'ia_<feature>_mes', ai_usage.feature).
   * Default: el id del prompt. Solo [a-z_].
   */
  feature?: string;
  /** Override del modelo (debe existir en ai_model_prices con allowed_in_app). Default: platform_settings.ai_default_model */
  model?: string;
  /** Tope duro de salida. Obligatorio en la práctica; default 512. */
  max_tokens?: number;
  temperature?: number;
  /** Si el prompt admite una imagen/PDF en el body (image_base64 + image_mime). */
  accepts_image?: boolean;
  /** Fuerza JSON con esquema (Gemini responseSchema). */
  response_schema?: Record<string, unknown>;
}

/** Metadatos expuestos en GET /ai-gateway (sin system ni plantillas completas). */
export interface AiPromptCatalogEntry {
  id: string;
  label: string;
  description: string;
  variables: AiPromptVariable[];
  accepts_image?: boolean;
}
