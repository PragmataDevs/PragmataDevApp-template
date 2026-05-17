import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { overlayPortalPointerEvents, overlayZIndex, overlayZIndexValue } from './overlayZIndex';

type OverlayPortalProps = {
  children: ReactNode;
  /** Clases del contenedor portaleado (posición, tamaño, etc.) */
  className?: string;
  layer?: keyof typeof overlayZIndex;
  /** Clic en el fondo del portal (p. ej. cerrar panel/modal) */
  onBackdropClick?: () => void;
};

/** Renderiza en `document.body` para escapar del stacking context del header/main. */
export function OverlayPortal({
  children,
  className = '',
  layer = 'modal',
  onBackdropClick,
}: OverlayPortalProps) {
  if (typeof document === 'undefined') return null;

  const zIndex = overlayZIndexValue[layer];

  return createPortal(
    <div
      {...(layer === 'sheet' ? { 'data-overlay-sheet': '' } : {})}
      className={`fixed inset-0 ${overlayPortalPointerEvents(layer)} ${overlayZIndex[layer]} ${className}`.trim()}
      style={{ zIndex }}
      onClick={onBackdropClick}
    >
      {children}
    </div>,
    document.body,
  );
}
