# Generador de prompt — 2 minutos

Arma el **prompt completo** para tu IA: system + contexto del cliente.

---

## Paso 1 — Rellena el brief

```bash
cp docs/feature-specs/agent/CLIENT_BRIEF.template.md docs/feature-specs/mi-cliente-brief.md
# Edita mi-cliente-brief.md
```

---

## Paso 2 — Copia al agente

### A) System prompt (fijo)

Abre [**SYSTEM_PROMPT.md**](./SYSTEM_PROMPT.md) → copia el bloque entre `## Bloque para copiar (inicio)` y `(fin)` → pégalo en el **System prompt** / **Instructions** de tu herramienta.

### B) Contexto de sesión (variable)

Pega esto como **primer mensaje del usuario** (o sección «Project rules»), reemplazando con tu brief:

```markdown
## Contexto de sesión — mapeo Pragmata

Modo: solo mapeo (sin código hasta que yo diga IMPLEMENTAR).

Brief del cliente:
---
<PEGA AQUÍ el contenido de docs/feature-specs/mi-cliente-brief.md>
---

Instrucciones extra:
- Sigue docs/feature-specs/agent/OUTPUT_CONTRACT.md en cada respuesta.
- Al cerrar FASE 4, el YAML final debe poder guardarse como:
  docs/feature-specs/mi-cliente-mapping.yaml
- Empieza por FASE 1.
```

### C) Variante todo-en-uno (un solo pegado)

Si tu IA no separa system / user, concatena:

1. Contenido de `SYSTEM_PROMPT.md` (bloque)
2. Línea en blanco
3. Bloque «Contexto de sesión» de arriba con tu brief

---

## Paso 3 — Arrancar la conversación

**Tu primer mensaje** (después del contexto):

```text
Empezamos mapeo. Lee el brief. FASE 1: hazme las preguntas que falten (máximo 5).
```

---

## Paso 4 — Pulir y aprobar

Usa solo estos comandos (la IA debe obedecerlos):

| Tú escribes | Qué pasa |
|-------------|----------|
| `APROBADO FASE 1` | Sigue al árbol de dominios |
| `APROBADO FASE 2` | Baja a subfeatures |
| `APROBADO FASE 3: contratos` | Cierra esa ficha |
| `CORREGIR FASE 3 contratos: la ruta es global no workspace` | Solo corrige eso |
| `APROBADO FASE 4` | Entrega YAML final |
| `IMPLEMENTAR contratos` | Nueva tarea: código según playbook |

Guarda el YAML final que te entregue la IA en `docs/feature-specs/<cliente>-mapping.yaml`.

---

## Paso 5 — Implementación (otra sesión recomendada)

Nuevo chat con prompt de **implementación** (resumen):

```text
Implementa la subfeature «contratos» según docs/feature-specs/mi-cliente-mapping.yaml
y docs/playbook-new-module.md. Respeta src/features/finanzas/egresos/contratos/.
No toques chasis salvo routes.config y resources.ts.
```

---

## Checklist tú (revisor humano)

Antes de `APROBADO FASE 4`:

- [ ] Cada subfeature tiene `pages/ hooks/ components/ types/`
- [ ] `types/<entidad>.ts` está en la subfeature correcta (no en src/types/)
- [ ] workspace vs global es coherente con el negocio
- [ ] `resource_code` únicos y con prefijo correcto
- [ ] Nada duplicado (mismo proceso en dos subfeatures)
- [ ] Tabs/detalle no están inflados como subfeatures
