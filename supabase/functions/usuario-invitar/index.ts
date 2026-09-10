// ============================================================================
// EDGE FUNCTION: usuario-invitar
// ============================================================================
// Da de alta a una persona del equipo: usuario en GoTrue + su perfil + correo
// para que ponga su contraseña.
//
// POR QUÉ NO BASTA `create-auth-user`
//   Esa función existe y funciona, pero su propia cabecera lo admite: "solo
//   crea el auth user, el profile se crea desde el frontend". Si el segundo
//   paso falla —se cae la red, RLS rechaza, el usuario cierra la pestaña—
//   queda un usuario huérfano en `auth.users` sin perfil: no puede entrar, no
//   aparece en ninguna lista, y nadie lo va a reclamar. Al siguiente intento
//   con el mismo correo, GoTrue responde "ya existe" y el alta se atora sin
//   que se vea por qué.
//
//   Aquí los dos pasos viven del mismo lado y, si el segundo truena, se borra
//   el usuario recién creado. O queda todo, o no queda nada.
//
// POR QUÉ UNA FUNCIÓN Y NO UN INSERT DESDE EL FRONT
//   Crear en `auth.users` requiere la API de admin, que necesita la service
//   key, que jamás debe salir del servidor.
//
// QUIÉN PUEDE LLAMARLA
//   Quien tenga `page_settings_usuarios:create` en su RBAC. NO se comprueba
//   contra una lista de roles escrita aquí: si mañana cambia quién da de alta
//   gente, cambia el permiso y esto sigue solo.
// ============================================================================

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createServiceClient, createSupabaseClient } from '../_shared/auth.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface Payload {
  email?: string;
  full_name?: string;
  role_id?: string;
  job_title?: string;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let cuerpo: Payload;
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: 'json_invalido' }, 400);
  }

  const email = cuerpo.email?.trim().toLowerCase();
  const fullName = cuerpo.full_name?.trim();
  const roleId = cuerpo.role_id?.trim();

  if (!email || !email.includes('@')) return json({ error: 'email_invalido' }, 400);
  if (!fullName) return json({ error: 'nombre_requerido' }, 400);
  if (!roleId) return json({ error: 'rol_requerido' }, 400);

  // ── 1. Quién llama, y si puede ───────────────────────────────────────────
  const comoUsuario = createSupabaseClient(req);
  const { data: { user: actor }, error: errAuth } = await comoUsuario.auth.getUser();
  if (errAuth || !actor) return json({ error: 'no_autenticado' }, 401);

  // El permiso lo evalúa la BASE, con la sesión del que llama.
  const { data: puede, error: errPerm } = await comoUsuario.rpc('check_permission', {
    requested_resource: 'page_settings_usuarios',
    requested_action: 'create',
  });
  if (errPerm) return json({ error: 'no_se_pudo_validar_permiso' }, 500);
  if (puede !== true) return json({ error: 'sin_permiso' }, 403);

  // El equipo sale del perfil de quien invita: nadie da de alta gente en un
  // equipo ajeno, ni aunque lo mande en el cuerpo de la petición.
  const { data: perfilActor } = await comoUsuario
    .from('profiles')
    .select('team_id')
    .eq('id', actor.id)
    .maybeSingle();

  const teamId = perfilActor?.team_id;
  if (!teamId) return json({ error: 'invitador_sin_equipo' }, 400);

  // ── 2. El alta, con limpieza si algo se rompe a medio camino ─────────────
  const admin = createServiceClient();
  let nuevoUserId: string | null = null;

  try {
    const { data: creado, error: errUser } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
    });
    if (errUser || !creado?.user) {
      const msg = errUser?.message ?? '';
      const yaExiste = /already|registered|exists/i.test(msg);
      return json({ error: yaExiste ? 'correo_ya_registrado' : 'no_se_pudo_crear_usuario' },
                  yaExiste ? 409 : 500);
    }
    nuevoUserId = creado.user.id;

    const { error: errPerfil } = await admin.from('profiles').insert({
      id: nuevoUserId,
      email,
      full_name: fullName,
      team_id: teamId,
      role_id: roleId,
      job_title: cuerpo.job_title?.trim() ?? null,
      access_level: 'member',   // nunca se invita a alguien como admin de entrada
      is_role_synced: true,     // el trigger de sync arma sus permisos desde el rol
      created_by: actor.id,
      updated_by: actor.id,
    });

    if (errPerfil) {
      // Aquí está el punto de todo: sin este rollback queda el huérfano.
      await admin.auth.admin.deleteUser(nuevoUserId);
      return json({ error: 'no_se_pudo_crear_perfil', detalle: errPerfil.message }, 500);
    }

    // El correo va al final: si falla, el usuario ya existe bien y se le puede
    // reenviar. Al revés no — no se puede "des-mandar" un correo.
    const { error: errMail } = await admin.auth.resetPasswordForEmail(email);

    return json({
      user: { id: nuevoUserId, email },
      correo_enviado: !errMail,
    });
  } catch (e) {
    if (nuevoUserId) {
      try { await admin.auth.admin.deleteUser(nuevoUserId); } catch { /* ya no hay más que hacer */ }
    }
    return json({ error: 'error_inesperado', detalle: String(e) }, 500);
  }
});
