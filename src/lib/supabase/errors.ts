/**
 * Normalización de errores de Supabase/PostgREST.
 *
 * POR QUÉ EXISTE: sin `.throwOnError()`, postgrest-js NO devuelve instancias de
 * `Error` — devuelve el JSON crudo del cuerpo de la respuesta (`JSON.parse(body)`
 * en PostgrestBuilder), o sea un objeto plano. Relanzarlo tal cual hace que todo
 * `err instanceof Error` de la UI dé `false`, y la pantalla acabe mostrando su
 * mensaje de reserva ("Unknown error", "Error al guardar") en lugar del motivo
 * real que mandó Postgres.
 *
 * Caso real que originó esto (lawrank-os, 14-ago-2026): un choque contra un
 * índice único devolvía HTTP 409 con un mensaje perfectamente claro, y al usuario
 * le llegaba "Unknown error while saving". El reporte a soporte fue "no me deja
 * editar", y diagnosticarlo costó una investigación entera sobre algo que la
 * propia base ya estaba explicando.
 *
 * Se preservan `code`, `details` y `hint` en el Error resultante para que los
 * detectores por código (42P01 tabla faltante, 42501 RLS, 23505 duplicado…)
 * sigan funcionando aguas arriba.
 */

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

/** Junta message/details/hint/code en una sola línea legible. */
export function formatSupabaseError(err: SupabaseErrorLike): string {
  return [err.message, err.details, err.hint, err.code ? `[${err.code}]` : '']
    .filter(Boolean)
    .join(' — ');
}

/**
 * Convierte cualquier cosa lanzada por supabase-js en un `Error` de verdad.
 * Los `Error` que ya lo son pasan intactos.
 */
export function toSupabaseError(err: unknown, fallbackMessage = 'Unknown error'): Error {
  if (err instanceof Error) return err;
  if (!err || typeof err !== 'object') return new Error(String(err ?? fallbackMessage));

  const e = err as SupabaseErrorLike;
  const error = new Error(formatSupabaseError(e) || fallbackMessage);
  Object.assign(error, { code: e.code, details: e.details, hint: e.hint });
  return error;
}
