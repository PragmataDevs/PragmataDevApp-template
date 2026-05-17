/** Capas de apilamiento — sincronizado con `--z-*` en `src/index.css` */
export const overlayZIndex = {
  sidebarBackdrop: 'z-sidebar-backdrop',
  sidebar: 'z-sidebar',
  header: 'z-header',
  headerDropdown: 'z-header-dropdown',
  /** Menús del header (notificaciones, perfil) — por encima de sidebar, header sticky y tablas */
  floating: 'z-floating',
  overlay: 'z-overlay',
  modal: 'z-modal',
  modalElevated: 'z-modal-elevated',
  /** Paneles laterales (chat) — por encima de dropdowns del header */
  sheet: 'z-sheet',
  datatable: 'z-datatable',
} as const;

/** Valores numéricos para `style.zIndex` (más fiable que solo clases Tailwind en portales). */
export const overlayZIndexValue: Record<keyof typeof overlayZIndex, number> = {
  sidebarBackdrop: 40,
  sidebar: 50,
  header: 60,
  headerDropdown: 110,
  overlay: 200,
  modal: 300,
  modalElevated: 310,
  floating: 11000,
  sheet: 12000,
  datatable: 10000,
};

const POINTER_BLOCKING_LAYERS = new Set<keyof typeof overlayZIndex>([
  'overlay',
  'modal',
  'modalElevated',
  'sheet',
]);

export function overlayPortalPointerEvents(layer: keyof typeof overlayZIndex): string {
  return POINTER_BLOCKING_LAYERS.has(layer) ? 'pointer-events-auto' : 'pointer-events-none';
}
