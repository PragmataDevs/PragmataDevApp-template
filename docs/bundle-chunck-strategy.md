# Estrategia de Chunks y Bundle

**Proyecto:** CRM Objetiva Pragmata
**Objetivo:** Evitar regresiones de performance por chunks grandes y documentar una respuesta estandar cada vez que aparezca el warning `> 500 kB`.

> Reglas de implementacion y tabla de chunks actuales: [docs/architecture.md §10](architecture.md)

---

## 1. Cuando aplicar esta estrategia

Aplicar este playbook cuando en build aparezca:

- `Some chunks are larger than 500 kB after minification`

Tambien aplicarlo si:

- Se agrega una libreria pesada (PDF, editores, charts, mapas, etc.).
- El chunk principal (`index`) crece en dos builds consecutivos.
- Una pagina tarda en montar por descarga inicial alta.

---

## 2. Meta tecnica

1. Mantener el `index` lo mas pequeno posible.
2. Aislar dependencias pesadas en chunks cacheables.
3. Cargar codigo costoso solo cuando el usuario lo necesita.
4. Evitar romper UX por sobre-fragmentar chunks.

---

## 3. Chunks actuales del proyecto

Definidos en [vite.config.ts](../vite.config.ts):

| Chunk | Contenido | Razon |
| --- | --- | --- |
| `react-vendor` | `react`, `react-dom`, `react-router-dom` | Core siempre presente |
| `supabase` | `@supabase/*` | Cliente pesado, cambia poco |
| `powersync` | `@powersync/*`, `@journeyapps/wa-sqlite` | Solo cuando `VITE_ENABLE_POWERSYNC=true` |
| `icons` | `lucide-react` | Importado en layouts; aislado para preservar cache de `react-vendor` |

Toda nueva dependencia >50 kB minificada debe evaluarse para chunk propio (ver §4).

---

## 4. Procedimiento estandar (paso a paso)

### Paso 1: Medir

Ejecutar build y registrar salida:

```bash
pnpm build
```

Guardar evidencia de:

- Nombre del chunk grande.
- Tamano minificado.
- Tamano gzip.

### Paso 2: Identificar origen

Revisar que ruta/modulo produce ese chunk. Heuristica:

- Si termina en `index-*.js`, el problema es codigo compartido o imports tempranos en layouts/providers.
- Si pertenece a una libreria especifica, verificar si se importa en un layout/provider (siempre cargado) o solo en una pagina (candidato a lazy).

### Paso 3: Elegir accion (decision tree)

1. Si la libreria es pesada y no se usa en el primer render:
   - Mover a import dinamico (`import()`) o `React.lazy` en la ruta/componente consumidor.

2. Si la libreria se usa en varias rutas:
   - Crear `manualChunks` dedicado para esa familia (ej. `pdf-vendor`, `charts-vendor`).

3. Si el chunk principal crece por utilidades internas:
   - Reubicar imports para que carguen solo dentro de la feature que los usa.

4. Si el warning viene de una dependencia inevitable:
   - Documentar justificacion y aceptar warning temporal con plan de mitigacion.

### Paso 4: Verificar

Tras cambios, volver a correr:

```bash
pnpm build
```

Validar:

- `index` no crece de forma regresiva.
- Chunk pesado queda aislado y no bloquea pantallas no relacionadas.
- No hay errores de TypeScript ni regressions funcionales.

### Paso 5: Documentar

Actualizar:

- [docs/architecture.md §10](architecture.md) (tabla de chunks y linea base de tamaños)
- Este archivo con la decision aplicada (seccion §7)

---

## 5. Reglas de implementacion

1. Code-splitting por ruta siempre (`React.lazy` + `Suspense` en `routes.config.ts`).
2. Librerias pesadas (PDF, charts, mapas, editores) deben vivir en rutas/chunks dedicados, nunca importadas en providers ni layouts.
3. Evitar imports globales de utilidades pesadas en `App.tsx`, `main.tsx`, o cualquier Provider que se monte en el arranque.
4. Mantener `manualChunks` pequeno y explicito (sin reglas opacas ni wildcards amplios).
5. Prohibido subir `chunkSizeWarningLimit` solo para ocultar el warning sin resolver la causa.

---

## 6. Plantilla de decision para PR

Usar este bloque en PRs que toquen performance:

```md
### Bundle / Chunks
- Warning detectado: [si/no]
- Chunk afectado: [nombre]
- Tamano antes: [kB]
- Tamano despues: [kB]
- Estrategia aplicada: [lazy import | manualChunks | ambas]
- Riesgo residual: [bajo/medio/alto]
```

---

## 7. Historial de decisiones

| Version | Cambio | Resultado |
| --- | --- | --- |
| Inicial | Code-splitting con `React.lazy` por ruta | chunk principal bajo de ~1+ MB |
| v1 | `manualChunks` para `react-vendor`, `supabase`, `powersync` | `index` ~183 kB, warning eliminado |
| v2 | Agrego chunk `icons` para `lucide-react` (importado en layouts) | `icons` ~70 kB aislado, caché de `react-vendor` protegido |

---

## 8. Checklist rapido para futuras ocasiones

- [ ] Identifique chunk y peso exacto.
- [ ] Confirme si bloquea ruta critica (layout/provider = siempre; pagina = solo esa ruta).
- [ ] Aplique lazy import o chunk dedicado segun decision tree §4.
- [ ] Corra `pnpm build` y compare salida.
- [ ] Documente resultado en §7 de este archivo + actualice tabla en architecture.md §10.


---

## 1. Cuando aplicar esta estrategia

Aplicar este playbook cuando en build aparezca:

- `Some chunks are larger than 500 kB after minification`

Tambien aplicarlo si:

- Se agrega una libreria pesada (PDF, editores, charts, mapas, etc.).
- El chunk principal (`index`) crece en dos builds consecutivos.
- Una pagina tarda en montar por descarga inicial alta.

---

## 2. Meta tecnica

1. Mantener el `index` lo mas pequeno posible.
2. Aislar dependencias pesadas en chunks cacheables.
3. Cargar codigo costoso solo cuando el usuario lo necesita.
4. Evitar romper UX por sobre-fragmentar chunks.

---

## 3. Regla base de este proyecto

La configuracion actual en [vite.config.ts](../vite.config.ts) ya separa:

- `react-vendor`
- `supabase`
- `powersync`

La estrategia futura parte de esa base y agrega chunking especifico por dominio cuando sea necesario.

---

## 4. Procedimiento estandar (paso a paso)

### Paso 1: Medir

Ejecutar build y registrar salida:

```powershell
pnpm build
```

Guardar evidencia de:

- Nombre del chunk grande.
- Tamano minificado.
- Tamano gzip.

### Paso 2: Identificar origen

Revisar que ruta/modulo produce ese chunk. Heuristica:

- Si termina en `react-pdf.browser-*.js`, el origen es `@react-pdf/renderer`.
- Si termina en `index-*.js`, el problema es codigo compartido o imports tempranos.

### Paso 3: Elegir accion (decision tree)

1. Si la libreria es pesada y no se usa en el primer render:
- Mover a import dinamico (`import()`) o `React.lazy` en la ruta/componente consumidor.

2. Si la libreria se usa en varias rutas:
- Crear `manualChunks` dedicado para esa familia (ej. `pdf-vendor`, `charts-vendor`).

3. Si el chunk principal crece por utilidades internas:
- Reubicar imports para que carguen solo dentro de la feature que los usa.

4. Si el warning viene de una dependencia inevitable:
- Documentar justificacion y aceptar warning temporal con plan de mitigacion.

### Paso 4: Verificar

Tras cambios, volver a correr:

```powershell
pnpm build
```

Validar:

- `index` no crece de forma regresiva.
- Chunk pesado queda aislado y no bloquea pantallas no relacionadas.
- No hay errores de TypeScript ni regressions funcionales.

### Paso 5: Documentar

Actualizar:

- [docs/architecture.md](architecture.md) (seccion de performance)
- Este archivo con la decision aplicada

---

## 5. Reglas de implementacion recomendadas

1. Code-splitting por ruta siempre (`React.lazy` + `Suspense`).
2. Librerias de PDF deben vivir en rutas/chunks dedicados.
3. Evitar imports globales de utilidades pesadas en providers/layouts.
4. Mantener `manualChunks` pequeno y explicito (sin reglas opacas).
5. Evitar subir `chunkSizeWarningLimit` solo para ocultar el problema.

---

## 6. Plantilla de decision para PR

Usar este bloque en PRs que toquen performance:

```md
### Bundle / Chunks
- Warning detectado: [si/no]
- Chunk afectado: [nombre]
- Tamano antes: [kB]
- Tamano despues: [kB]
- Estrategia aplicada: [lazy import | manualChunks | ambas]
- Riesgo residual: [bajo/medio/alto]
```

---

## 7. Caso actual (referencia)

Estado observado recientemente:

- Build exitoso.
- Warning residual por chunk de `react-pdf.browser` (~1.4 MB minificado).
- Decision: mantener funcionalidad actual de PDF, y aplicar chunking por consumo cuando se priorice optimizacion de carga inicial.

---

## 8. Checklist rapido para futuras ocasiones

- [ ] Identifique chunk y peso exacto.
- [ ] Confirme si bloquea ruta critica.
- [ ] Aplique lazy import o chunk dedicado.
- [ ] Corra `pnpm build` y compare salida.
- [ ] Documente resultado en arquitectura + PR.
