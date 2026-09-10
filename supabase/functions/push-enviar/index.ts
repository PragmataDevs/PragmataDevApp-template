// ============================================================================
// EDGE FUNCTION: push-enviar
// ============================================================================
// El último metro del aviso: toma un renglón de `push_outbox` y le habla a FCM
// para que el teléfono suene aunque la app esté cerrada.
//
// LO QUE ESTA FUNCIÓN *NO* DECIDE
//   No decide a quién le toca. Eso ya lo resolvió la base cuando `notificar_a`
//   / `notificar_con_permiso` escribieron la fila en `notifications` con su
//   `recipient_id`, y el trigger `push_encolar` la puso en la cola. Aquí solo
//   se obedece. Si esta función tuviera criterio propio, habría dos lugares
//   decidiendo quién ve qué — y con datos de menores de por medio, ese es
//   exactamente el error que no se puede cometer.
//
// POR QUÉ FIREBASE
//   Un push con la app cerrada lo entrega el sistema operativo: Apple solo
//   acepta APNs, Android solo FCM. Ningún backend se los salta. Firebase entra
//   como TRANSPORTE y nada más — sin Firebase Auth, sin Firestore, sin
//   Analytics. Los tokens, las preferencias y la seguridad viven en Supabase.
//
// SE REVALIDA ANTES DE MANDAR
//   `push_debe_enviar` ya corrió al encolar, pero entre encolar y enviar el
//   usuario pudo apagar la categoría o entrar a su horario de silencio. Se
//   vuelve a preguntar a la base — nunca se recalcula aquí (regla 8).
// ============================================================================

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createServiceClient, createSupabaseClient } from '../_shared/auth.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

// ── Access token de la service account ──────────────────────────────────────
// Se firma un JWT RS256 y se cambia por un access token. Se cachea por isolate:
// el token dura una hora y pedir uno por cada push es una llamada de red extra
// por notificación.
let cache: { token: string; expira: number } | null = null;

function pemADer(pem: string): ArrayBuffer {
  const limpio = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(limpio);
  // Se devuelve el ArrayBuffer y no el Uint8Array a propósito: en Deno el tipo
  // de `Uint8Array.from` es `Uint8Array<ArrayBufferLike>`, que incluye
  // SharedArrayBuffer y por eso no encaja en el `BufferSource` que pide
  // importKey. Lo cachó `deno check`, no la lectura.
  const buf = new ArrayBuffer(bin.length);
  const vista = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) vista[i] = bin.charCodeAt(i);
  return buf;
}

const b64url = (data: ArrayBuffer | Uint8Array | string): string => {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : (data instanceof Uint8Array ? data : new Uint8Array(data));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function accessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  // Margen de 5 min: un token que vence a media petición se ve como un 401 raro.
  if (cache && cache.expira > ahora + 300) return cache.token;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: FCM_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: ahora,
    exp: ahora + 3600,
  }));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemADer(sa.private_key.replace(/\\n/g, '\n')),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const firma = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`),
  );
  const jwt = `${header}.${claims}.${b64url(firma)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`oauth ${res.status}: ${await res.text()}`);

  const data = await res.json();
  cache = { token: data.access_token, expira: ahora + (data.expires_in ?? 3600) };
  return cache.token;
}

/**
 * ¿El error dice que este token ya no sirve?
 *
 * Documentado: UNREGISTERED llega como HTTP 404 e INVALID_ARGUMENT como 400,
 * y el segundo solo indica token muerto si el payload era válido — el nuestro
 * lo es porque lo armamos aquí.
 *
 * Se mira el status Y el texto crudo a propósito: la forma exacta del JSON de
 * error (`error.details[].errorCode`) no la verifiqué contra la respuesta real,
 * así que no se depende de ella. Si Google cambia la envoltura, esto sigue
 * funcionando.
 */
function tokenMuerto(status: number, cuerpo: string): boolean {
  if (status === 404) return true;
  if (status === 400 && /UNREGISTERED|INVALID_ARGUMENT|not.?registered/i.test(cuerpo)) return true;
  return /UNREGISTERED/i.test(cuerpo);
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // ── Autorización: el secreto de pg_net, o alguien con permiso ────────────
  const secretoEsperado = Deno.env.get('PUSH_SHARED_SECRET');
  const secretoRecibido = req.headers.get('x-push-secret');
  let autorizado = !!secretoEsperado && secretoRecibido === secretoEsperado;

  if (!autorizado) {
    const comoUsuario = createSupabaseClient(req);
    const { data: { user } } = await comoUsuario.auth.getUser();
    if (user) {
      const { data: puede } = await comoUsuario.rpc('check_permission', {
        requested_resource: 'feature_notifications_send',
        requested_action: 'create',
      });
      autorizado = puede === true;
    }
  }
  if (!autorizado) return json({ error: 'no_autorizado' }, 403);

  let cuerpo: { envio_id?: string; max?: number };
  try { cuerpo = await req.json(); } catch { cuerpo = {}; }

  const saCrudo = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
  const projectId = Deno.env.get('FCM_PROJECT_ID');
  if (!saCrudo || !projectId) return json({ error: 'fcm_no_configurado' }, 500);

  let sa: { client_email: string; private_key: string };
  try { sa = JSON.parse(saCrudo); } catch { return json({ error: 'fcm_service_account_invalida' }, 500); }

  const db = createServiceClient();

  // Un envío puntual (lo llamó pg_net) o un drenado de la cola (lo llamó el cron).
  const q = db
    .from('push_outbox')
    .select('id, notification_id, recipient_id, category_code, app_slug, intentos')
    .eq('estado', 'pendiente')
    .eq('status', 'active');
  const { data: envios, error: errCola } = cuerpo.envio_id
    ? await q.eq('id', cuerpo.envio_id)
    : await q.lt('intentos', 5).order('created_at').limit(Math.min(cuerpo.max ?? 50, 200));

  if (errCola) return json({ error: 'no_se_pudo_leer_la_cola', detalle: errCola.message }, 500);
  if (!envios?.length) return json({ enviados: 0, omitidos: 0, fallidos: 0 });

  let enviados = 0, omitidos = 0, fallidos = 0;
  const bearer = await accessToken(sa);

  for (const envio of envios) {
    // ¿Sigue queriendo recibirlo? Pudo cambiar entre encolar y enviar.
    const { data: debe } = await db.rpc('push_debe_enviar', {
      p_user: envio.recipient_id,
      p_category: envio.category_code,
      p_type: 'info',
    });

    if (debe !== true) {
      await db.from('push_outbox').update({ estado: 'omitido' }).eq('id', envio.id);
      omitidos++;
      continue;
    }

    const { data: notif } = await db
      .from('notifications')
      .select('title, body, action_url, type, category_code')
      .eq('id', envio.notification_id)
      .maybeSingle();
    if (!notif) {
      await db.from('push_outbox').update({ estado: 'omitido', ultimo_error: 'notificacion_ausente' })
        .eq('id', envio.id);
      omitidos++;
      continue;
    }

    let devQ = db
      .from('push_devices')
      .select('token, platform')
      .eq('user_id', envio.recipient_id)
      .eq('status', 'active')
      .is('disabled_at', null);
    if (envio.app_slug) devQ = devQ.eq('app_slug', envio.app_slug);
    const { data: aparatos } = await devQ;

    if (!aparatos?.length) {
      // No es un fallo: la notificación SIGUE en la bandeja de la app. El push
      // es el toquido en la puerta, no el mensaje.
      await db.from('push_outbox').update({ estado: 'omitido', ultimo_error: 'sin_aparatos' })
        .eq('id', envio.id);
      omitidos++;
      continue;
    }

    let algunoOk = false;
    let ultimoError: string | null = null;

    for (const ap of aparatos) {
      const mensaje = {
        message: {
          token: ap.token,
          notification: { title: notif.title, body: notif.body ?? '' },
          // Todo `data` va como texto: FCM no transporta otra cosa.
          // Este objeto es el contrato que PushPayload.fromData lee del lado
          // de la app (pragmata_core/lib/src/push/push_payload.dart).
          data: {
            notification_id: String(envio.notification_id),
            action_url: notif.action_url ?? '',
            categoria: notif.category_code ?? '',
            tipo: notif.type ?? 'info',
          },
          android: { priority: notif.type === 'urgent' ? 'high' : 'normal' },
          apns: { headers: { 'apns-priority': notif.type === 'urgent' ? '10' : '5' } },
        },
      };

      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(mensaje),
        },
      );

      if (res.ok) { algunoOk = true; continue; }

      const texto = await res.text();
      ultimoError = `${res.status}: ${texto.slice(0, 300)}`;

      if (tokenMuerto(res.status, texto)) {
        // Se limpia en la base, con la misma función que usa la purga.
        await db.rpc('push_token_muerto', { p_token: ap.token });
      }
    }

    if (algunoOk) {
      await db.from('push_outbox')
        .update({ estado: 'enviado', enviado_at: new Date().toISOString() })
        .eq('id', envio.id);
      enviados++;
    } else {
      await db.from('push_outbox')
        .update({ estado: 'fallido', intentos: (envio.intentos ?? 0) + 1, ultimo_error: ultimoError })
        .eq('id', envio.id);
      fallidos++;
    }
  }

  return json({ enviados, omitidos, fallidos });
});
