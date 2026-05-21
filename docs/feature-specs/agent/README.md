# Agente de mapeo Pragmata — system prompt + generador

Kit para que una **IA haga preguntas**, proponga el árbol `src/features/` y genere el **YAML + manifiesto de archivos** — **tú apruebas cada fase** antes de que escriba código.

---

## Archivos (en orden de uso)

| Paso | Archivo | Quién lo usa |
|------|---------|--------------|
| 1 | [**CLIENT_BRIEF.template.md**](./CLIENT_BRIEF.template.md) | Tú: 5 min de contexto del cliente |
| 2 | [**PROMPT_COMPOSER.md**](./PROMPT_COMPOSER.md) | Tú: arma el prompt final para pegar en la IA |
| 3 | [**SYSTEM_PROMPT.md**](./SYSTEM_PROMPT.md) | Copiar al **system prompt** del agente |
| 4 | [**OUTPUT_CONTRACT.md**](./OUTPUT_CONTRACT.md) | La IA debe responder así (tú lo pulís) |
| 5 | [../MAPPING_RECORD.example.yaml](../MAPPING_RECORD.example.yaml) | Salida acumulada del mapeo |

**Guía larga (preguntas por fase):** [../../client-feature-mapping-guide.md](../../client-feature-mapping-guide.md)

**Implementar tras aprobar:** [../../playbook-new-module.md](../../playbook-new-module.md)

---

## Comandos en el repo

```bash
pnpm mapping:init <cliente>    # brief desde plantilla
pnpm mapping:prompt <cliente>  # prompts en docs/feature-specs/generated/<cliente>/
```

Detalle: [PROMPT_COMPOSER.md](./PROMPT_COMPOSER.md).

---

## Flujo en 3 minutos

```
CLIENT_BRIEF (tú rellenas o mapping:init)
       ↓
PROMPT_COMPOSER / mapping:prompt (pegas en la IA)
       ↓
IA pregunta por Fases 1→4 (tú respondes / corriges)
       ↓
Tú: «APROBADO FASE 4» → guardas <cliente>-mapping.yaml
       ↓
Otra sesión o mismo agente: playbook-new-module (código)
```

---

## Regla de oro

> **La IA mapea y propone. Tú pulsas «aprobado». La IA no implementa SQL/React hasta tu OK explícito.**

Comandos que tú usas:

| Comando | Efecto |
|---------|--------|
| `APROBADO FASE 1` | Pasa a dominios |
| `APROBADO FASE 2` | Pasa a detalle por subfeature |
| `APROBADO FASE 3: contratos` | Cierra esa subfeature |
| `APROBADO FASE 4` | Puede generar YAML final; aún sin código |
| `IMPLEMENTAR contratos` | Recién ahí: SQL + archivos (playbook) |
| `CORREGIR: …` | La IA ajusta solo lo indicado |
