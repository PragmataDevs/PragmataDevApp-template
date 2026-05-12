# Propuesta: PWA y service worker (ERP + sitio público)

Documento de **diseño** para la plantilla: qué habilitar, en qué orden y con qué riesgos. **No** sustituye la implementación hasta que un proyecto decida activarla y la pruebe en Preview/Production.

**Relacionado:** [architecture.md](./architecture.md) secciones **0.1**–**0.3** (naturaleza web, datos, separación SW vs PowerSync).

---

## 1. Objetivo

- Ofrecer una **ruta clara** cuando un cliente pida: “instalable”, “funciona sin red tras la primera visita”, o “icono en el escritorio”.
- Mantener **PowerSync** como capa de **datos** offline-first; el **service worker** como capa opcional de **activos** (shell SPA, caché estática, manifest).

**Fuera de alcance de esta propuesta (hasta acordarlo por proyecto):** sustituir PowerSync por SW para datos; cachear agresivamente respuestas de PostgREST/Auth; un único SW compartido entre ERP (`:7070`) y Astro (`:4321`) en local sin coordinación.

---

## 2. Estado actual de la template

| Pieza | ERP (Vite, `src/`) | Sitio público (Astro, `astro/`) |
|--------|-------------------|-----------------------------------|
| `manifest.webmanifest` | No | No |
| Registro de service worker | No | No |
| `vite-plugin-pwa` / Workbox | No | No |
| Offline de **datos** | Opcional: `VITE_ENABLE_POWERSYNC=true` + SQLite | Lectura vía Supabase anon; carrito en `localStorage` según módulo |

---

## 3. Principios (invariantes)

1. **SW no se activa solo** porque `VITE_ENABLE_POWERSYNC=true`. Son decisiones independientes; combinarlas requiere prueba explícita (WebSocket PowerSync, actualización de bundles).
2. **Nunca** aplicar estrategia “cache first” a rutas de **Auth** (`/auth/v1/*`) ni a **API** mutables sin política de invalidación; riesgo de sesiones rotas o datos obsoletos.
3. **Chunks con hash** (`assets/index-*.js`): el SW debe precachear o actualizar según el **manifest generado en build** (p. ej. Workbox injectManifest / lista de `globPatterns` del plugin), no rutas frágiles a mano.
4. **Actualizaciones:** definir UX “nueva versión disponible” (recarga forzada o `skipWaiting` + `clients.claim()` con criterio de producto).

---

## 4. Fases recomendadas

### Fase A — Solo manifest (sin SW)

- `manifest.webmanifest` + `<link rel="manifest">` + iconos.
- Mejora “añadir a inicio” en móviles; **no** cambia offline del shell.
- Bajo riesgo; buen primer paso.

### Fase B — SW mínimo (ERP)

- Integrar **`vite-plugin-pwa`** (o Workbox manual) **solo en el build del ERP**.
- Estrategia inicial conservadora:
  - **Precache:** `index.html` + assets estáticos del build (JS/CSS con hash).
  - **Network-only** (o no interceptar) para orígenes de Supabase, PowerSync y Edge Functions.
- Tras validar, valorar **runtime cache** solo para recursos estáticos propios (fuentes, imágenes bajo `/` si existen).

### Fase C — Flag de producto (recomendado antes de producción)

- Introducir algo equivalente a **`VITE_ENABLE_PWA=true`** en build de Vercel solo donde se haya probado; en `false`, el build **no** registra SW (evita sorpresas en Preview).

### Fase D — Sitio público (Astro)

- **Separado del ERP:** Astro puede ser SSR/hybrid; un SW global debe alinearse con rutas cacheables vs dinámicas y con `@astrojs/*`.
- Tratar como **segundo entregable** con su propio manifest/SW si el cliente lo pide (SEO + PWA tienen tensiones; muchos sitios se quedan en Fase A o sin SW).

---

## 5. Comprobaciones antes de mergear SW a `main`

- [ ] Login / refresh token / logout en red lenta y tras deploy nuevo.
- [ ] `VITE_ENABLE_POWERSYNC=true`: conexión y re-sync tras cortar y restaurar red.
- [ ] Preview de Vercel: no servir un SW que cachee otro entorno (mismo path, distinto `VITE_*`).
- [ ] Tamaño del precache vs primera visita móvil.

---

## 6. Referencias técnicas

- [Vite PWA plugin](https://vite-pwa-org.netlify.app/) — integración habitual con Vite + React.
- [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Workbox](https://developer.chrome.com/docs/workbox) — si se prefiere control fino frente al plugin.

---

## 7. Resumen ejecutivo

La template **propone** activar PWA/SW por **fases**, primero manifest, luego SW solo en ERP con reglas seguras y flag de build, y Astro aparte. Hasta implementarlo, el código sigue sin SW; esta hoja es la **propuesta oficial** a la que enlazan arquitectura y reglas del repo.
