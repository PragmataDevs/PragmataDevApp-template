/**
 * Registro de prompts sincronizados desde ai/prompts/ (pnpm ai:sync-prompts).
 * Al añadir un JSON nuevo: importar aquí y agregarlo al mapa PROMPTS.
 */

import type { AiPromptCatalogEntry, AiPromptDefinition } from './types.ts';
import invoiceText from './prompts/invoice-text.json' with { type: 'json' };
import accountStatement from './prompts/account-statement.json' with { type: 'json' };

const PROMPTS: Record<string, AiPromptDefinition> = {
  [invoiceText.id]: invoiceText as AiPromptDefinition,
  [accountStatement.id]: accountStatement as AiPromptDefinition,
};

export function getPrompt(id: string): AiPromptDefinition | undefined {
  return PROMPTS[id];
}

export function listPromptCatalog(): AiPromptCatalogEntry[] {
  return Object.values(PROMPTS).map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    variables: p.variables,
  }));
}
