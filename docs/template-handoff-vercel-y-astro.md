# Handoff: Vercel + Astro (template PragmataDevApp)

Resumen operativo de los cambios alineados con **PragmataDevApp** probados en producción: dos proyectos en Vercel, adapter serverless, runtime Node, Supabase en SSR, favicon y entrada pública del ERP.

**Relacionado:** [SETUP.md](./SETUP.md) sección 8 · [deployment-environments.md](./deployment-environments.md).

---

## 1. Dos proyectos en Vercel

| Proyecto Vercel | Raíz del build | Dominio típico |
|-----------------|----------------|----------------|
| **Sitio público** | `astro/` (`Root Directory` = `astro`) | `https://www.cliente.com` |
| **ERP** | raíz del monorepo | `https://app.cliente.com` |

Variables cruzadas (resumen):

- En **Astro:** `PUBLIC_SITE_URL`, `PUBLIC_APP_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (o `PUBLIC_SUPABASE_*`), flags públicos (`PUBLIC_ENABLE_ECOMMERCE`, etc.).
- En **ERP:** `VITE_PUBLIC_SITE_URL` = origen del sitio Astro (no el del ERP).

---

## 2. Adapter `@astrojs/vercel` (evitar 404 en producción)

- **Quitar** `@astrojs/node` del sitio Astro.
- **Añadir** `@astrojs/vercel` en rango **^7.8.2** (compatible con **Astro 4**; no subir a `@astrojs/vercel@8+` sin subir Astro).
- En `astro/astro.config.mjs`:

```js
import vercel from '@astrojs/vercel/serverless';
// ...
export default defineConfig({
  output: 'hybrid',
  adapter: vercel(),
  // ...
});
```

- Salida de build: **`astro/.vercel/output/`** (Build Output API de Vercel).

---

## 3. `pnpm start` en `astro/` → `vercel dev`

Con hybrid + adapter Vercel, **`astro preview`** no reproduce el entorno serverless. En **`astro/package.json`**:

```json
"scripts": {
  "start": "vercel dev"
}
```

Añadir **`vercel`** en `devDependencies` del paquete Astro (p. ej. `^39`) para ejecutar `vercel dev` tras el build.

---

## 4. Parche runtime: nunca `nodejs18.x` (Vercel 2026)

`@astrojs/vercel@7.8.2` puede seguir emitiendo **`nodejs18.x`** en fallback; Vercel ya no lo acepta en despliegues nuevos.

En la **raíz** del monorepo (`**pnpm-workspace.yaml**`):

```yaml
patchedDependencies:
  '@astrojs/vercel@7.8.2': patches/@astrojs__vercel@7.8.2.patch
```
- El parche sustituye **`getRuntime()`** en `dist/serverless/adapter.js` del paquete para que:
  - Node del builder **≥ 22** → `nodejs22.x`
  - Node **≥ 20** → `nodejs20.x`
  - Resto (incl. 18 “retiring”) → **`nodejs20.x`**, nunca `nodejs18.x` como runtime final.

Tras `pnpm install` y `cd astro && pnpm build`, inspeccionar:

`astro/.vercel/output/functions/_render.func/.vc-config.json` → **`runtime`** debe ser **`nodejs20.x`** o **`nodejs22.x`**.

### Astro 5+

Cuando la template suba a Astro 5 y `@astrojs/vercel` nuevo corrija `getRuntime()` sin fallback a 18, **eliminar** el parche y la entrada `patchedDependencies` en **`pnpm-workspace.yaml`**.

---

## 5. Supabase en Astro sin romper el SSR

`astro/src/lib/supabase.ts`:

- Lee `PUBLIC_SUPABASE_*` y **`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`** (coherente con `define` en `astro.config.mjs`).
- **No** hace `throw` en top-level.
- Exporta **`isSupabaseConfigured`** y **`supabase: SupabaseClient | null`**.

Las páginas que consultan la base comprueban `if (supabase)` o redirigen / 404 si no hay cliente (build en Vercel sin env aún configurados).

---

## 6. Favicon y assets

- **`astro/vercel.json`:** rewrite ` /favicon.ico` → `/favicon.svg` (en `public/` suele existir solo `favicon.svg`).
- **`BaseLayout.astro`:** solo `<link rel="icon" href="/favicon.svg" type="image/svg+xml" />` mientras no existan `apple-touch-icon.png` ni `site.webmanifest` en `public/`.

---

## 7. ERP — `PublicSiteEntry` y bucle www / `VITE_PUBLIC_SITE_URL`

Si **`window.location.origin`** coincide con el origen resuelto de **`VITE_PUBLIC_SITE_URL`** (mismo host para “público” y ERP), **no** se hace `replace` a la misma URL: se muestra UI estática explicando hosts distintos (Astro en `www`, ERP en `app`) y enlace a **`/login`**.

Si los orígenes difieren y hay base configurada → `replace` a `${base}/`. Si no hay base → `/login`.

---

## 8. Checklist de archivos (template)

| Archivo | Cambio |
|---------|--------|
| `astro/package.json` | `@astrojs/vercel`, sin `@astrojs/node`; `vercel` devDep; `start` = `vercel dev` |
| `astro/astro.config.mjs` | `import vercel from '@astrojs/vercel/serverless'`; `adapter: vercel()` |
| `pnpm-workspace.yaml` (raíz) | `patchedDependencies` → parche `@astrojs/vercel@7.8.2` |
| `patches/@astrojs__vercel@7.8.2.patch` | Diff `getRuntime()` |
| `astro/vercel.json` | Rewrite favicon |
| `astro/src/lib/supabase.ts` | Cliente nullable + env mixtos |
| `astro/src/pages/index.astro`, `productos/*`, `[slug].astro` | Guards `supabase` |
| `astro/src/layouts/BaseLayout.astro` | Favicon solo SVG |
| `src/features/shell/pages/PublicSiteEntry.tsx` | Mismo host → mensaje + `/login` |

---

## 9. Verificación antes de merge

```bash
pnpm install          # raíz — aplica el parche
cd astro && pnpm run build
```

Opcional: `pnpm run check` en `astro/` si está en scripts.

Comprobar **`.vc-config.json`** del render function (runtime ≠ `nodejs18.x`).
