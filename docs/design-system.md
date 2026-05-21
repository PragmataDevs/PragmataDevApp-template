# PragmataDevs Design System

> **Sistema unificado con el resto del ecosistema Pragmata.**
> Fuente única de verdad: [`pragmata-business-info/design/tokens/tokens.json`](../../pragmata-business-info/design/tokens/tokens.json) y [`pragmata-business-info/design/css/pragmata.css`](../../pragmata-business-info/design/css/pragmata.css).
> Cualquier cambio empieza en `pragmata-business-info/design/` y se espeja aquí — nunca al revés.

Este template **espeja** los tokens del hub central en:
- `tailwind.config.js` → `colors.pg.*` (canónico) + `colors.brand.*` (alias legacy con mismos valores).
- `src/index.css` → variables `--pragmata-*` con valores del portal vivo.

El sistema es **dark-first** (igual que `pragmata-factory/web/portal.html`). La paleta clara se conserva sólo como `.light` para el sitio público Astro y emails.

---

## 1. Tipografía

| Familia | Variable Tailwind | Cuándo |
|---|---|---|
| **Syne** (400/600/700/800) | `font-sans` / `font-display` | Display, marca "PRAGMATA", headings, botones |
| **JetBrains Mono** (400/500/600) | `font-mono` | Datos, métricas, labels técnicos, código |

La marca se escribe siempre en **Syne uppercase con `tracking-brand` (0.32em) y `text-pg-accent`** (cian).

### Escala
| Uso | Tailwind |
|---|---|
| Heading 1 | `font-display font-extrabold tracking-tighter text-5xl` |
| Heading 2 | `font-display font-bold tracking-tight text-4xl` |
| Heading 3 | `font-display font-semibold text-2xl` |
| Label técnico | `font-mono text-xs uppercase tracking-label text-pg-muted` |
| Métrica numérica | `font-mono font-semibold` |

---

## 2. Paleta (espejada del portal vivo)

### Canónicos (`pg.*`) — usar en código nuevo
| Token Tailwind | Hex | Uso |
|---|---|---|
| `bg-pg-bg` | `#05080f` | Fondo base |
| `bg-pg-bg2` | `#080d18` | Paneles |
| `bg-pg-surface` | `#0b1120` | Sidebar / topbar |
| `bg-pg-card` | `#0d1525` | Cards |
| `border-pg-border` | `#162033` | Bordes sutiles |
| `border-pg-border2` | `#1e2f48` | Separadores |
| `text-pg-fg` | `#ddeaf8` | Texto principal |
| `text-pg-fg2` | `#8badc8` | Texto secundario |
| `text-pg-muted` | `#3d5a78` | Labels |
| **`bg-pg-accent` / `text-pg-accent`** | **`#00b8e6`** | **CTA primaria / marca** |
| `text-pg-accent-2` | `#7c5cbf` | Acento violeta |
| `text-pg-green` | `#00d98b` | OK / online |
| `text-pg-yellow` | `#f0c040` | Warning |
| `text-pg-red` | `#f04060` | Error |

### Aliases legacy (`brand.*`)
Conservados con los mismos nombres pero ahora apuntan a la paleta dark canónica. No introducir más usos; preferir `pg.*`.

| Alias | Apunta a |
|---|---|
| `brand-dark` | `#05080f` (era `#0F172A`) |
| `brand-accent` | `#00b8e6` (era `#0EA5E9`) |
| `brand-surface` | `#0b1120` (era `#F8FAFC`) |
| `brand-border` | `#162033` (era `#E2E8F0`) |
| `brand-steel` | `#8badc8` (era `#334155`) |

---

## 3. Componentes Base

### Botones
```tsx
// Primary
className="px-6 py-2.5 bg-pg-accent text-pg-bg font-display font-bold rounded-pragmata hover:bg-[#0099c2] tracking-tight"

// Ghost
className="px-6 py-2.5 bg-transparent border border-pg-border2 text-pg-fg font-display font-bold rounded-pragmata hover:border-pg-accent hover:text-pg-accent"
```

### Card
```tsx
<div className="p-5 bg-pg-card border border-pg-border rounded-pragmata hover:border-pg-border2 transition-colors">
  <div className="font-mono text-xs uppercase tracking-label text-pg-muted mb-2">label</div>
  <h3 className="font-display font-semibold text-lg text-pg-fg mb-1">Title</h3>
  <p className="text-pg-fg2 text-sm leading-relaxed">…</p>
</div>
```

### Marca / Wordmark
```tsx
<span className="font-mono text-xs font-bold tracking-brand uppercase text-pg-accent">
  PRAGMATA
</span>
```

---

## 4. Reglas de oro

1. **Cambios al sistema empiezan en `pragmata-business-info/design/`**, nunca en este template.
2. **No introducir nuevas fuentes.** Solo Syne + JetBrains Mono.
3. **Un solo cian (`#00b8e6`).** No multiplicar acentos primarios.
4. **Mono para datos, sans (Syne) para marca.** No mezclar.
5. **Dark por default.** Light solo para Astro público y emails (`<html class="light">`).
6. Preferir tokens `pg.*` sobre los aliases `brand.*` legacy en código nuevo.
