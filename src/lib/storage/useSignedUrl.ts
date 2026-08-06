/**
 * useSignedUrl — resuelve un path de Storage a URL firmada, para pintarlo.
 *
 * Existe porque el mismo hook estaba copiado cuatro veces (`Header`,
 * `UsuariosPage`, `ChatPanel`, `EntityMembersPanel`), las cuatro con la misma
 * forma y el mismo defecto:
 *
 *     useEffect(() => {
 *       if (path) resolveSignedUrl(bucket, path).then(setUrl);
 *       else      setUrl(null);              // ← setState síncrono en efecto
 *     }, [path]);
 *
 * Dos problemas que esta versión corrige:
 *
 *  1. **Race condition real.** No se cancelaba nada. Si `path` cambiaba dos
 *     veces seguidas (cambias de avatar, o la lista se re-ordena), la respuesta
 *     de la petición VIEJA podía llegar al final y pisar a la nueva: se quedaba
 *     pintado el avatar de otro. Aquí la URL sólo se acepta si corresponde al
 *     path que se está pidiendo en este render — el desfase se descarta solo.
 *
 *  2. **`setUrl(null)` síncrono** para el caso "no hay path". Eso es estado
 *     derivable, no estado: se calcula al vuelo en el `return`.
 *
 * El efecto queda con una sola responsabilidad —ir por la URL— y nunca escribe
 * estado de forma síncrona.
 */
import { useEffect, useState } from 'react';
import { resolveSignedUrl } from './resolveUrl';

interface ResolvedUrl {
  /** El path que originó esta URL — la llave para saber si sigue vigente. */
  path: string;
  url:  string;
}

export function useSignedUrl(
  bucket: string,
  path: string | null | undefined,
): string | null {
  const [resolved, setResolved] = useState<ResolvedUrl | null>(null);

  useEffect(() => {
    if (!path) return;

    let cancelled = false;
    resolveSignedUrl(bucket, path)
      .then((url) => {
        if (!cancelled) setResolved({ path, url });
      })
      .catch(() => {
        // Un fallo al firmar (objeto borrado, permiso denegado) no es motivo
        // para romper la pantalla: se cae al fallback de iniciales del llamador.
      });

    return () => {
      cancelled = true;
    };
  }, [bucket, path]);

  // Derivado, no estado: si no hay path —o la URL resuelta es de un path
  // anterior— no hay nada que pintar todavía.
  return path && resolved?.path === path ? resolved.url : null;
}
