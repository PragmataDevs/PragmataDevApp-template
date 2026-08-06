import type { Json, JsonObject } from '../json.ts';

/**
 * Espejo en TypeScript de `public.check_row_conditions()` (ver migración
 * `20260805193000_activar_conditions_check_permission.sql`). Sirve para checks
 * explícitos del FRONT antes de mostrar/ofrecer una acción sobre una fila
 * concreta (ej. "¿le muestro al agente el botón de editar ESTE prospecto?").
 *
 * ⚠️ Esto NO reemplaza RLS. La fila real solo queda protegida por la policy de
 * Postgres que invoque `check_row_conditions()` (o el equivalente bespoke de la
 * app). Este helper es puramente para UX/UI — fail-closed igual que el SQL,
 * pero un bug aquí nunca expone una fila que RLS no permita.
 *
 * Vocabulario mínimo (idéntico al SQL):
 * - `{}` (sin llaves)                    → TRUE, sin scoping (comportamiento de hoy).
 * - `{ "<col>": "$me" }`                 → `row[col] === currentUserId`.
 * - `{ "<col>": { "in": "$my_entities" } }` → `row[col]` está en `myEntityIds`.
 * - `{ "<col>": "$<role_variable>" }`    → `row[col] === roleVariables[role_variable]`.
 * - `{ "<col>": <literal> }`             → comparación literal.
 * Todas las condiciones del objeto se combinan con AND.
 */
export interface RowConditionContext {
  currentUserId: string;
  roleVariables: JsonObject;
  myEntityIds: string[];
}

export function evaluateRowConditions(
  conditions: JsonObject,
  row: JsonObject,
  ctx: RowConditionContext,
): boolean {
  const keys = Object.keys(conditions);
  if (keys.length === 0) return true; // '{}' = sin scoping, igual que hoy en TODAS las filas.

  return keys.every((column) => evaluateCondition(conditions[column], row[column], ctx));
}

function evaluateCondition(
  expected: Json | undefined,
  actual: Json | undefined,
  ctx: RowConditionContext,
): boolean {
  if (expected === undefined) return true;

  if (typeof expected === 'string') {
    if (expected === '$me') return actual === ctx.currentUserId;
    if (expected.startsWith('$')) {
      const varName = expected.slice(1);
      const varValue = ctx.roleVariables[varName];
      return varValue !== undefined && actual === varValue;
    }
    return actual === expected; // literal
  }

  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    const ref = expected['in'];
    if (ref === '$my_entities') {
      return typeof actual === 'string' && ctx.myEntityIds.includes(actual);
    }
    return false; // forma de "in" desconocida — fail-closed
  }

  return actual === expected; // número/boolean literal
}
