# Contrato de salida del agente mapeador

La IA **debe** usar estos formatos en cada mensaje para que puedas **pulir** rápido (buscar `### FASE`, tablas, YAML).

---

## Encabezado obligatorio en cada respuesta

```markdown
### FASE <N> — <título corto>
**Estado:** en curso | esperando aprobación | cerrada
**Subfeature actual:** <id o «—»>
```

---

## FASE 1 — Salida

```markdown
### FASE 1 — Contexto
**Estado:** esperando aprobación

#### Resumen
- Cliente: …
- Entity label: …
- Chasis activo: …

#### Preguntas pendientes (si hay)
1. …

#### Dominios nuevos propuestos
| id (carpeta) | label UI | procesos que agrupa |
|--------------|----------|---------------------|
| finanzas | Finanzas | … |

---
**Siguiente paso:** confirma o corrige. Luego escribe: `APROBADO FASE 1`
```

---

## FASE 2 — Salida

```markdown
### FASE 2 — Árbol de carpetas
**Estado:** esperando aprobación

#### Árbol ASCII
\`\`\`text
src/features/finanzas/
  navigation.ts
  pages/ …
  ingresos/ …
  egresos/
    contratos/ …
\`\`\`

#### Decisiones explicadas
| Elemento | ¿Subfeature? | Motivo |
|----------|--------------|--------|
| Contratos | Sí | menú + permiso propio |

---
**Siguiente paso:** `APROBADO FASE 2` o `CORREGIR: …`
```

---

## FASE 3 — Salida (una subfeature)

Repetir bloque por cada subfeature.

```markdown
### FASE 3 — Subfeature: contratos
**Estado:** esperando aprobación
**Subfeature actual:** contratos

#### Ficha
| Campo | Valor |
|-------|--------|
| path | egresos/contratos |
| ambito | workspace |
| ruta_url | contratos |
| entidad | Contrato |
| tabla_sql | contratos |
| patron_ui | datatable_crud |
| resource_code | page_workspace_contratos |

#### Campos de negocio
| campo | tipo | req | listado | form |
|-------|------|-----|---------|------|
| numero | string | sí | sí | sí |

#### Manifiesto de archivos
| # | Archivo |
|---|---------|
| 1 | src/features/finanzas/egresos/contratos/types/contrato.ts |
| 2 | src/features/finanzas/egresos/contratos/types/contrato.schema.ts |
| 3 | src/features/finanzas/egresos/contratos/hooks/useContratos.ts |
| 4 | src/features/finanzas/egresos/contratos/components/ContratoFormModal.tsx |
| 5 | src/features/finanzas/egresos/contratos/pages/ContratosPage.tsx |

#### Chasis (solo referencia, no editar aún)
- src/app/routes.config.ts
- src/config/security/resources.ts
- supabase/migrations/TIMESTAMP_contratos.sql

---
**Siguiente paso:** `APROBADO FASE 3: contratos` o `CORREGIR: …`
```

---

## FASE 4 — Salida consolidada

```markdown
### FASE 4 — Consolidado
**Estado:** esperando aprobación

#### Tabla global de subfeatures
| id | path | UI | ámbito | ruta | resource_code | ✓ |
|----|------|-----|--------|------|---------------|---|
| contratos | egresos/contratos | Contratos | workspace | contratos | page_workspace_contratos | |

#### YAML para guardar
\`\`\`yaml
# docs/feature-specs/<cliente>-mapping.yaml
cliente: "…"
entity_label: "…"
dominios: [ … ]
estado:
  fase_actual: 4
  aprobado_por_usuario: false
\`\`\`

#### Orden de implementación sugerido
1. contratos — depende de: ninguna
2. …

---
**Siguiente paso:** guarda el YAML. `APROBADO FASE 4` → luego `IMPLEMENTAR <id>` por cada uno.
```

---

## Bloque YAML acumulado (final de cada mensaje)

Después del contenido principal, la IA añade:

```markdown
---
<details>
<summary>YAML acumulado (borrador)</summary>

\`\`\`yaml
# … mismo esquema que MAPPING_RECORD.example.yaml
\`\`\`

</details>
```

Así tú puedes ir copiando sin esperar a FASE 4.

---

## Prohibido en respuestas de mapeo

- Generar archivos `.ts` / `.sql` completos antes de `IMPLEMENTAR`
- Proponer `src/pages/` o `src/types/<dominio>/` para modelos de negocio
- Avanzar dos fases en un mensaje sin `APROBADO`
- Más de **5 preguntas** numeradas en un solo turno (FASE 1)
