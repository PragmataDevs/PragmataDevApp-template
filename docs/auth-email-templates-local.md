# Correos de Auth en Supabase local

Plantillas HTML de **recuperación de contraseña** e **invitación** (establecer contraseña) cargadas automáticamente al levantar el stack local.

## Archivos

| Plantilla Auth | Archivo | Uso |
|----------------|---------|-----|
| `recovery` | [`supabase/templates/recovery.html`](../supabase/templates/recovery.html) | «Olvidé mi contraseña» (`resetPasswordForEmail`) |
| `invite` | [`supabase/templates/invite.html`](../supabase/templates/invite.html) | Alta de usuario vía Edge Function `create-auth-user` |

Configuración en [`supabase/config.toml`](../supabase/config.toml) → `[auth.email.template.*]`.

Copia de referencia para producción (Dashboard Supabase): [`docs/email-templates/reset-password.html`](./email-templates/reset-password.html).

## Flujo local — olvidé mi contraseña

1. ERP en http://localhost:7070/login → **Forgot password?**
2. Introduce el correo (usuario existente en Auth).
3. Abre **Mailpit**: http://127.0.0.1:54324
4. Abre el correo «Restablece tu contraseña — PragmataDevs» y pulsa el enlace.
5. Debe abrir http://localhost:7070/auth/reset-password (o `127.0.0.1:7070` si usas esa URL en `.env`).

`site_url` y `additional_redirect_urls` en `config.toml` deben incluir el origen del ERP (`:7070`).

## Aplicar cambios en plantillas

Tras editar HTML o `config.toml`:

```bash
supabase stop
supabase start
```

No basta con reiniciar solo el contenedor de Auth; el CLI vuelve a inyectar las plantillas en el arranque.

## Variables disponibles en HTML

| Variable | Descripción |
|----------|-------------|
| `{{ .ConfirmationURL }}` | Enlace con token (reset / invite) |
| `{{ .Email }}` | Correo del destinatario |
| `{{ .SiteURL }}` | `site_url` del proyecto |

Documentación oficial: [Customizing email templates](https://supabase.com/docs/guides/local-development/customizing-email-templates).

## Producción

En el proyecto cloud: **Authentication → Email Templates** → pegar el HTML de `recovery.html` / `invite.html` o subir vía Management API. Ajusta `site_url` del proyecto a la URL pública del ERP.
