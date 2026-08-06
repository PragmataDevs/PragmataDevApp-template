/**
 * `Json` — el tipo de una columna `jsonb` de Postgres.
 *
 * Existe para matar los `Record<string, any>` que traíamos en `role_variables`,
 * `conditions` (RBAC) y `metadata` (entities). `any` apaga el compilador en
 * cascada: cualquier cosa que salga de esos campos deja de validarse aunque el
 * resto del modelo esté bien tipado.
 *
 * `Json` conserva la garantía real —lo que Postgres puede guardar y devolver—
 * y obliga a estrechar antes de usar el valor, que es justo lo que queremos:
 * un `role_variables.limite` no es un número hasta que alguien lo compruebe.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json | undefined };

/** Objeto JSON en la raíz — la forma que toman las columnas `jsonb` de configuración. */
export type JsonObject = { [key: string]: Json | undefined };
