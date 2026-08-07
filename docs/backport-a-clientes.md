# Backport de fixes del template a clientes

> Cómo hacer que un fix del template **llegue de verdad** a los clientes que ya existen.
> Esta doctrina nace de un caso real: un fix crítico de escalada de privilegios vivió un mes
> en el template sin llegar a 2 de 5 clientes, y nadie se enteró.

---

## El problema (léelo antes de "arreglar" algo en el template)

Un cliente **no hereda** del template. Es una **copia congelada** hecha el día que se instanció.
Cada uno lleva su propia carpeta `supabase/migrations/` que diverge desde el minuto uno.

Y aquí está la trampa:

```
❌ Editar el fix DENTRO de supabase/migrations/20260111120000_pragmata_schema.sql
```

Todo cliente ya tiene la versión `20260111120000` registrada en `supabase_migrations.schema_migrations`.
**El CLI la considera aplicada y jamás la vuelve a correr.** Tu fix queda perfecto en el template
y no llega a un solo cliente. El build pasa, los tests pasan, nadie ve nada — y el hoyo sigue
abierto en producción.

Editar el schema base solo sirve para clientes **nuevos**, y aun así solo si su repo se copia
después del cambio.

---

## La regla

**Todo cambio de esquema o de seguridad va en una migración NUEVA con timestamp propio.**
El schema base es historia: se lee, no se edita.

```
✅ supabase/migrations/20260807140000_fix_lo_que_sea.sql
✅ supabase/migrations/down_20260807140000_fix_lo_que_sea.sql
```

Escríbela **idempotente** (`CREATE OR REPLACE`, `DROP ... IF EXISTS`, `IF NOT EXISTS`) para que
re-aplicarla nunca truene. Y con su reversa, que la Tríada no se negocia.

---

## Los 4 pasos para cerrar un fix

1. **Migración nueva en el template**, con su `down_`.
2. **Copiarla a cada cliente vivo** — a su `supabase/migrations/`, no solo a su nube.
   ⚠️ **Fusionar, no pisar.** Un `CREATE OR REPLACE FUNCTION` traído del template puede borrar
   en silencio la lógica propia que ese cliente le agregó encima. Revisa qué hay antes.
3. **Registrar el check** en `ops/backport-checks.json` del workspace. Una entrada con el SQL
   que responde "¿este cliente lo tiene?".
4. **Correr la auditoría** y dejarla en verde:
   ```bash
   ops/backport-audit.sh
   ```

**El paso 3 no es opcional.** Es el único que convierte "se me olvidó un cliente" de invisible
a visible. Sin él, el paso 2 depende de tu memoria — y ya sabemos cómo acabó eso.

---

## Aplicar a la nube ≠ dejarlo hecho

Parchar la nube con SQL directo (Management API, Studio, `sb sqlfile`) arregla el síntoma **hoy**
y deja una bomba: el repo no lo tiene, así que un `db reset` o un rebuild desde migraciones
**pierde el fix sin avisar**. Pasó con este mismo guard.

Si parchas en caliente por urgencia, está bien — pero no está cerrado hasta que la migración
exista en el repo. La auditoría lo marca con `⚠️` precisamente para cazar ese estado.

---

## Qué audita hoy

`ops/backport-audit.sh` lee el vault (`~/.praxia/supabase/projects.json`) para saber qué
proyectos hay, con qué cuenta se entra y dónde vive cada repo — no duplica ese registro.
Devuelve exit ≠ 0 si algo falta, así que sirve tal cual en un pre-commit o en CI.

```bash
ops/backport-audit.sh                      # matriz completa
ops/backport-audit.sh --check guard-profiles
ops/backport-audit.sh --solo-fallas
```

| Símbolo | Significa |
|---|---|
| ✅ | el cliente lo tiene |
| 🚨 | le falta |
| ⚠️ | la nube lo tiene pero el repo **no** — un rebuild lo pierde |
| ❓ | no se pudo determinar (no cuenta como OK) |
