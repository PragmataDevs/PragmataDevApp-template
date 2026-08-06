/**
 * errorMessage — el mensaje legible de cualquier cosa que caiga en un `catch`.
 *
 * Nació dentro de `useTasks.ts` (F4) y vive aquí desde que se limpiaron los
 * `catch (err: any)` del chasis: era el mismo narrowing repetido en 12 archivos.
 *
 * El motivo de que exista en vez de un `err instanceof Error` pelón: los errores
 * de PostgREST y de supabase-js son **objetos planos** (`{ message, code, hint }`),
 * no instancias de `Error`. Con `instanceof` se pierde el motivo real
 * ("permission denied for table policies") y el usuario ve un genérico inútil —
 * que es exactamente el error que más queremos leer cuando una policy de RLS
 * está mal.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const { message } = err as { message?: unknown };
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}
