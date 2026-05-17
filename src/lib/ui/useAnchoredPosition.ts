import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import { overlayZIndexValue } from './overlayZIndex';

type Options = {
  isOpen: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  width?: number;
  align?: 'right' | 'left';
  offsetY?: number;
  zIndex?: number;
};

/** Posición `fixed` para menús anclados al header (portal en body). */
export function useAnchoredPosition({
  isOpen,
  anchorRef,
  width = 384,
  align = 'right',
  offsetY = 8,
  zIndex = overlayZIndexValue.floating,
}: Options): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });

  useEffect(() => {
    if (!isOpen) return;

    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setStyle({
        position: 'fixed',
        top: rect.bottom + offsetY,
        width,
        zIndex,
        pointerEvents: 'auto',
        ...(align === 'right'
          ? { right: Math.max(8, window.innerWidth - rect.right) }
          : { left: Math.max(8, rect.left) }),
        visibility: 'visible',
      });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isOpen, anchorRef, width, align, offsetY, zIndex]);

  return style;
}
