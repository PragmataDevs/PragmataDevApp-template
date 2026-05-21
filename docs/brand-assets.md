# Icono y logo de marca

## Fuente canónica

El icono oficial PragmataDevs (template y réplicas) es el SVG:

- **ERP (origen versionado):** [`public/pragmatadevs-icon.svg`](../public/pragmatadevs-icon.svg)
- **Astro / favicon:** copias sincronizadas con `pnpm brand:sync`

Por defecto el ERP usa `/pragmatadevs-icon.svg` (sidebar, login, dashboard). Los clientes pueden sobrescribir con `PUBLIC_BRAND_ICON_URL` en `.env`.

## Uso en código

| Pilar | Cómo |
|-------|------|
| ERP React | `import { BrandIcon } from '@/components/brand/BrandIcon'` o `PRAGMATA_DEVS_ICON_URL` desde `@/lib/brandEnv` |
| Astro | `<img src="/pragmatadevs-icon.svg" … />` o `PUBLIC_BRAND_ICON_URL` |

Componente compartido ERP: [`src/components/brand/BrandIcon.tsx`](../src/components/brand/BrandIcon.tsx).

## Dónde debe aparecer

- Sidebar del ERP
- Login, olvidé contraseña, restablecer contraseña
- Favicon del ERP (`index.html` → `/favicon.svg`)
- Navbar del sitio público Astro (`PublicNav.astro`)
- JSON-LD de la landing (`logo` → `/favicon.svg`)

## Sincronizar icono tras cambiar el SVG

Fuente única: `public/pragmatadevs-icon.svg`. Desde la raíz del monorepo:

```bash
pnpm brand:sync
```

Copia a `astro/public/`, `public/favicon.svg`, `astro/public/favicon.svg` y `src/assets/brand-icon.svg`.

## Emails Auth

Las plantillas en `supabase/templates/` usan marca tipográfica + bloque de color (sin depender de URL de imagen externa), coherente con el SVG.
