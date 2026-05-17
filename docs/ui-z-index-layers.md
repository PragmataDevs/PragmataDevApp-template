# Capas de z-index (ERP)

Tokens en [`src/index.css`](../src/index.css) y utilidades Tailwind (`z-sidebar`, `z-floating`, …). Los menús del header que deben quedar **por encima del sidebar y del header sticky** usan `OverlayPortal` con `layer="floating"`.

## Orden (de menor a mayor)

| Token | Valor | Uso |
|-------|-------|-----|
| `z-sidebar-backdrop` | 40 | Overlay móvil detrás del sidebar |
| `z-sidebar` | 50 | Sidebar |
| `z-header` | 60 | Navbar sticky |
| `z-header-dropdown` | 110 | Reservado / legacy |
| `z-overlay` | 200 | Panel lateral de chat |
| `z-modal` | 300 | Modal de notificaciones (ver todas) |
| `z-modal-elevated` | 310 | Modal nueva conversación (encima del chat) |
| **`z-floating`** | **11000** | **Dropdown notificaciones y menú perfil** |
| **`z-sheet`** | **12000** | **Panel lateral de chat** (encima del header; `body[data-chat-open]` desactiva clics en navbar) |
| `z-datatable` | 10000 | Cabeceras fijas de tablas |

## Regla

Cualquier UI anclada al header que deba verse sobre el layout (sidebar incluido) → `OverlayPortal` + `layer="floating"`, no `z-50` dentro del `<header>`.

**Sidebar expandido (desktop):** clic fuera del `<aside>` colapsa a modo iconos (`w-20`). Móvil: clic fuera cierra el drawer. Lógica en [`AppLayout.tsx`](../src/components/layout/AppLayout.tsx).

Implementación: [`src/lib/ui/OverlayPortal.tsx`](../src/lib/ui/OverlayPortal.tsx), [`src/lib/ui/overlayZIndex.ts`](../src/lib/ui/overlayZIndex.ts).
