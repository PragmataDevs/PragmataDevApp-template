/**
 * Sustituye {{clave}} en plantillas por valores de variables.
 */

export function interpolateTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => variables[key] ?? '');
}
