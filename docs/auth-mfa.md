# Verificación en dos pasos (2FA / TOTP)

Cierra el hallazgo **A5 de Cancerbero** (MFA en las cuentas de PragmataDevs). Usa el MFA nativo de Supabase Auth (`supabase.auth.mfa.*`, factor `totp`), sin librerías nuevas: el QR ya lo renderiza GoTrue y llega como data-URI SVG.

> Front en `src/`: `src/lib/auth/mfa.ts` (helpers puros), `src/features/profile/{hooks/useMfaFactors.ts,components/MfaSection.tsx}`, `src/features/auth/pages/MfaChallengePage.tsx`, `AuthProvider.mfaRequired` + `RouteGuard`. Todas las firmas de `auth.mfa` están verificadas contra `@supabase/auth-js@2.94.1` (`dist/module/lib/types.d.ts`) y citadas con número de línea en cada archivo.
> SQL en `supabase/`: `public.session_mfa_ok()` y `platform_settings.require_mfa_platform_owner` (los mantiene Praxia; aquí solo se describe el contrato).

## Cómo se activa (usuario)

1. **Mi Perfil → Seguridad → "Activar verificación en dos pasos"**.
2. Aparece un **QR** y la **clave en texto** (por si no puede escanear). Lo escanea con su app autenticadora (Google Authenticator, Authy, 1Password, Microsoft Authenticator…).
3. Escribe el **código de 6 dígitos** que muestra la app → "Confirmar código".
4. Queda **"2FA activo"**. Desde ese momento, al iniciar sesión (contraseña o Google) se le pide el código antes de entrar a la app.

Detalles de comportamiento:

- Solo se permite **un** TOTP activo por cuenta (la UI no ofrece "Activar" si ya hay uno verificado).
- Los enrolamientos a medias (factor `unverified`: cerró la pestaña sin confirmar) se **limpian solos** al abrir la sección y al pulsar "Cancelar". GoTrue rechaza dos factores con el mismo nombre; por eso importa.
- Al verificar el factor, Supabase **cierra las demás sesiones** del usuario y la actual sube a `aal2` (documentado en `GoTrueMFAApi.enroll`, types.d.ts l. 988).
- **Quitar** (con confirmación) llama `mfa.unenroll`. Quitar un factor verificado exige sesión `aal2`, que es la que tiene quien entró con código.

## Qué pasa al iniciar sesión

`AuthProvider`, tras cargar perfil y permisos, llama `mfa.getAuthenticatorAssuranceLevel()` (decodifica el JWT local, sin red) y fija `mfaRequired = currentLevel === 'aal1' && nextLevel === 'aal2'`. `loading` no se suelta hasta tener ese dato, así que la app **no renderiza ni un frame** con sesión a medias.

- `RouteGuard` (toda ruta `app` y `workspace`) manda a **`/mfa?next=<a dónde iba>`** mientras `mfaRequired` sea `true`. El `next` se sanea con `resolveSafeNext` (solo paths relativos propios; nunca `//host` ni URL absoluta; nunca `/mfa`).
- `/mfa` (`MfaChallengePage`, layout `public`) toma el primer TOTP verificado de `listFactors()`, hace `challenge` + `verify`, y al pasar llama `refreshAal()` → `mfaRequired=false` → redirige al `next`. Tiene botón **"Cerrar sesión"** para quien no pueda continuar.
- `MFA_CHALLENGE_VERIFIED` (evento de `onAuthStateChange`) se trata como `TOKEN_REFRESHED`: sube `sessionEpoch` para que los hooks de datos refetcheen con el JWT `aal2`.
- Quien **no** tiene TOTP no nota nada: `nextLevel` se queda en `aal1`.

## Qué exige la base (`session_mfa_ok()`)

El front es UX; la barrera real está en SQL. `public.session_mfa_ok()` devuelve `true` si el usuario **no** tiene factor TOTP verificado, o si lo tiene **y** la sesión es `aal2` (claim `aal` del JWT). Se compone con `AND` en las policies de **lecturas cruzadas de PragmataDevs** (lo que ve el team platform owner sobre los demás tenants) y en lo que dicte `platform_settings.require_mfa_platform_owner` (fuerza el 2FA a los admins del team platform owner). Resultado: una sesión `aal1` con TOTP pendiente no puede leer esos datos aunque salte el front. La definición exacta vive en `supabase/migrations/` (ver la migración que crea `session_mfa_ok`).

## Si el usuario pierde el teléfono

Hoy **no hay códigos de respaldo** ni segundo factor alternativo. Recuperación = soporte:

1. Verificar identidad del usuario por un canal distinto (correo registrado + confirmación con quien administra su team).
2. Con **god** (acceso con bitácora `god_access_log`), en SQL sobre la base del proyecto:

   ```sql
   -- 1) Ver los factores del usuario
   SELECT id, friendly_name, factor_type, status, created_at
   FROM auth.mfa_factors
   WHERE user_id = '<uuid del usuario>';

   -- 2) Desenrolar (borra el factor; auth.mfa_challenges cuelga con FK a factores)
   DELETE FROM auth.mfa_factors WHERE user_id = '<uuid del usuario>';

   -- 3) Cerrar sus sesiones para que el próximo login arranque limpio en aal1
   DELETE FROM auth.sessions WHERE user_id = '<uuid del usuario>';
   ```

   Probar el procedimiento en local (`supabase start` + god local) antes de correrlo en nube; `auth.*` es esquema de GoTrue y sus FK/cascadas pueden cambiar entre versiones.
3. El usuario entra solo con contraseña y vuelve a activar el 2FA desde su perfil.

La alternativa oficial vía API es `supabase.auth.admin.mfa.deleteFactor({ id, userId })` (service role; types.d.ts l. 1057-1096) — mismo efecto, útil si se automatiza desde una edge function de soporte.

## Pendientes conocidos

- Códigos de respaldo (recovery codes): no existen en Supabase Auth hoy; si se necesitan, se diseñan aparte (tabla propia + hash) y se auditan con Cancerbero.
- Forzar el 2FA a **todos** los admins (no solo platform owner) es una decisión de producto por cliente; el mecanismo ya está (`require_mfa_platform_owner` es el ejemplo).
