// ============================================================================
// EDGE FUNCTION: create-auth-user
// ============================================================================
// Propósito: Crear un usuario en auth.users de Supabase y enviarle un correo
//            nativo de Supabase para que establezca su contraseña.
//            Solo crea el auth user. El profile se crea desde el frontend.
//
// Deploy:
//   1. En Supabase Dashboard → Edge Functions → New Function
//   2. Nombre: "create-auth-user"
//   3. Copiar y pegar este código
//   4. Deploy
//   5. Desactivar "Verify JWT" en el gateway (la auth se valida internamente)
//
// Invocación desde el frontend:
//   const { data, error } = await supabase.functions.invoke('create-auth-user', {
//     body: { email, full_name }
//   });
//
// Retorna: { user: { id, email } } o { error: string }
//
// Flujo:
//   1. Valida sesión del caller
//   2. Crea auth user con contraseña interna aleatoria (el usuario nunca la ve)
//   3. Llama resetPasswordForEmail → Supabase envía email nativo para establecer contraseña
//   4. Retorna { user: { id, email } }
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Genera una contraseña interna aleatoria (el usuario nunca la verá) */
function generateInternalPassword(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*!?';
  return Array.from(
    crypto.getRandomValues(new Uint8Array(length)),
    (byte) => chars[byte % chars.length],
  ).join('');
}

Deno.serve(async (req: Request) => {
  // ── CORS preflight ──
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 1. Validar que quien llama está autenticado ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No autorizado. Falta el header Authorization.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Crear cliente con el token del usuario que llama (para validar su sesión)
    const supabaseCaller = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    // Verificar que el caller tiene sesión válida
    const { data: { user: caller }, error: callerError } = await supabaseCaller.auth.getUser();
    if (callerError || !caller) {
      return new Response(
        JSON.stringify({ error: 'Sesión inválida o expirada.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: mayCreateUser, error: permError } = await supabaseCaller.rpc('check_permission', {
      requested_resource: 'page_settings_usuarios',
      requested_action: 'create',
    });

    if (permError) {
      console.error('[create-auth-user] check_permission error:', permError);
      return new Response(
        JSON.stringify({ error: 'No se pudo validar permisos.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!mayCreateUser) {
      return new Response(
        JSON.stringify({ error: 'No tienes permiso para crear usuarios.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 2. Validar payload ──
    const { email, full_name, redirectTo } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Se requiere email.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 3. Crear usuario con Service Role (admin) ──
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Contraseña interna aleatoria — el usuario nunca la ve, la reemplazará vía reset
    const internalPassword = generateInternalPassword();

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: internalPassword,
      email_confirm: true, // Auto-confirmar email (no necesita verificación)
      user_metadata: {
        full_name: full_name || null,
      },
    });

    if (createError) {
      console.error('[create-auth-user] Error creating user:', createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 4. Enviar email de "Establecer contraseña" vía Supabase Auth ──
    // redirectTo viene del frontend (window.location.origin + '/auth/reset-password')
    // Si no se envía, fallback al site URL del proyecto
    const resetRedirect = redirectTo || `${Deno.env.get('SUPABASE_URL')}/auth/v1/callback`;

    const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: resetRedirect,
    });

    if (resetError) {
      // Log pero no bloquear — el usuario ya fue creado exitosamente
      console.warn('[create-auth-user] Reset password email failed (non-blocking):', resetError);
    }

    // ── 5. Retornar solo lo necesario ──
    return new Response(
      JSON.stringify({
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[create-auth-user] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
