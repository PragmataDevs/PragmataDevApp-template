# Auth SMTP — Resend (producción)

Los correos de Supabase Auth (reset de password, invite, alta de usuario) **no pueden salir por
el SMTP default de Supabase en producción**. Ese SMTP compartido está limitado a **2 correos por
hora por proyecto** y cae en spam.

No es teórico: en `objetiva-ops` el correo de "establecer contraseña" no le llegaba a nadie, y en
IndPack hubo que asignar passwords a mano porque no había forma de que llegara un reset.

**Regla: todo proyecto que salga a producción configura SMTP propio antes de que el cliente entre.**

---

## Qué está montado (infra compartida de PragmataDevs)

| Pieza | Valor | Estado |
|---|---|---|
| Proveedor | Resend — free tier 3000/mes, **tope 100/día** | activo |
| Dominio remitente | `mail.pragmatadevs.com` | verificado 14-jul-2026 |
| Registros DNS | DKIM + SPF + MX de feedback, en Squarespace | puestos y funcionando |

⚠️ **No toques el DNS.** Ya está resuelto. Y **jamás toques el dominio raíz** `pragmatadevs.com`:
ahí viven el MX y el SPF de Google Workspace — moverlos rompe el correo empresarial. Por eso el
remitente es un **subdominio** (`mail.`), que aísla por completo del correo de negocio.

⚠️ **El tope de 100/día es de TODA la cuenta**, compartido entre todos los clientes. Si un
proyecto empieza a mandar campañas o notificaciones masivas, se puede comer el cupo y dejar sin
reset a otro cliente. Si ves volumen raro, dilo — el fix es subir de tier, no repartir a mano.

---

## Aplicarlo a un proyecto

La `RESEND_API_KEY` vive en `ops/secrets/env` (chmod 600, fuera de git). **Nunca** la pegues en el
repo, en un commit, ni en un chat.

```bash
# dry-run primero: te dice qué cambiaría sin tocar nada
tsx scripts/cloud/configure-smtp.ts --ref <projectRef> --sender "Nombre Del Cliente" --dry-run

# aplicar
tsx scripts/cloud/configure-smtp.ts --ref <projectRef> --sender "Nombre Del Cliente"

# aplicar + verificar de verdad que el correo llega
tsx scripts/cloud/configure-smtp.ts --ref <ref> --sender "Cliente" --verify-email tu@correo.com
```

El script es **idempotente**: lee la config actual y solo hace PATCH si algo difiere. Re-correrlo
no cuesta nada. Sirve igual para un cliente nuevo que para uno que ya está en producción.

**`sender_name` va con el nombre DEL CLIENTE, no "PragmataDevs".** El usuario final recibe el
correo del sistema que usa, no del taller que lo construyó.

### Config que aplica

| Campo | Valor |
|---|---|
| `smtp_host` | `smtp.resend.com` |
| `smtp_port` | `465` |
| `smtp_user` | `resend` |
| `smtp_pass` | `RESEND_API_KEY` (de `ops/secrets/env`) |
| `smtp_sender_name` | **nombre del cliente** |
| `smtp_admin_email` | `no-reply@mail.pragmatadevs.com` |
| `smtp_max_frequency` | `1` |
| `rate_limit_email_sent` | `30` (default es 2) |

---

## Verificación end-to-end — obligatoria

**Un PATCH con HTTP 200 no prueba nada.** Solo dice que Supabase guardó la config; no que el
correo salga, ni que llegue. Hay que dispararlo de verdad:

```bash
tsx scripts/cloud/configure-smtp.ts --ref <ref> --sender "Cliente" --verify-email tu@correo.com
```

Eso hace un `POST /auth/v1/recover` real contra una cuenta de prueba y luego consulta la API de
Resend hasta confirmar el `last_event`. Solo cuenta como hecho si sale **`delivered`** (o `sent`).

Si no puedes confirmar la entrega, **repórtalo como pendiente, no como hecho.**

A mano, si lo necesitas:

```bash
export RESEND_KEY=...   # de ops/secrets/env
curl -s -H "Authorization: Bearer $RESEND_KEY" https://api.resend.com/domains
curl -s -H "Authorization: Bearer $RESEND_KEY" https://api.resend.com/emails/<email_id>
```

---

## Gotchas que te van a morder

1. **Cloudflare 1010.** El PATCH a `https://api.supabase.com/v1/projects/<ref>/config/auth`
   necesita un header `User-Agent` de navegador. Sin él responde `403 error code: 1010`, que no
   dice nada útil. Ya está resuelto en `scripts/cloud/configure-smtp.ts` y en `configure-auth.ts`.
2. **`smtp_pass` no se puede leer.** La Management API nunca lo devuelve (Supabase guarda solo un
   hash). Por eso el script no lo compara: si rotaste la key, corre con `--force`.
3. **Token de la Management API.** Sale de `SUPABASE_ACCESS_TOKEN` o de `~/.supabase/access-token`.
4. **Varias cuentas y organizaciones.** Los proyectos de PragmataDevs están repartidos en más de
   una cuenta de Supabase. Un token solo ve los suyos: si un proyecto "no existe", casi siempre es
   que estás usando el token de la otra cuenta, no que esté borrado. El mapa repo→cuenta→ref vive
   en `~/.praxia/supabase/projects.json` (`sb --list`).
5. **Proyectos pausados.** Un proyecto `INACTIVE` sí devuelve su config por GET, así que el
   `--dry-run` se ve normal y no te avisa de nada. Si el PATCH aguanta o no en ese estado **no
   está verificado** — antes de configurar uno pausado, confirmá si sigue vivo. Casi siempre la
   respuesta correcta es no tocarlo: si está pausado, es legacy.

---

## Local vs prod

Esto es **solo cloud** (se configura por Management API). En local, Supabase CLI sigue usando
Mailpit/Inbucket y no manda correo real — los templates branded viven en `supabase/templates/`
(ver `docs/auth-email-templates-local.md`).
