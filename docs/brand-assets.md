# Icono y logo de marca

## Fuente canónica

El icono oficial del monorepo es el SVG:

- **Astro (origen):** [`astro/public/favicon.svg`](../astro/public/favicon.svg)
- **ERP (Vite):** [`public/favicon.svg`](../public/favicon.svg) (copia sincronizada)

Diseño: fondo `#0f172a`, acento `#0ea5e9` (alineado con `brand-accent`).

## Uso en código

| Pilar | Cómo |
|-------|------|
| ERP React | `import { BrandIcon } from '@/components/brand/BrandIcon'` o `src="/favicon.svg"` |
| Astro | `<img src="/favicon.svg" … />` en `PublicNav`, `BaseLayout` ya enlaza favicon |

Componente compartido ERP: [`src/components/brand/BrandIcon.tsx`](../src/components/brand/BrandIcon.tsx).

## Dónde debe aparecer

- Sidebar del ERP
- Login, olvidé contraseña, restablecer contraseña
- Favicon del ERP (`index.html` → `/favicon.svg`)
- Navbar del sitio público Astro (`PublicNav.astro`)
- JSON-LD de la landing (`logo` → `/favicon.svg`)

## Sincronizar icono tras cambiar el SVG

Fuente única: `astro/public/favicon.svg`. Desde la raíz del monorepo:

```bash
pnpm brand:sync
```

Copia a `public/favicon.svg` (Vite) y `src/assets/brand-icon.svg` (import opcional).

## Emails Auth

Las plantillas en `supabase/templates/` usan marca tipográfica + bloque de color (sin depender de URL de imagen externa), coherente con el SVG.
