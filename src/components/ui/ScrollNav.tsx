/**
 * ScrollNav — flechitas flotantes para irse HASTA ARRIBA o HASTA ABAJO del
 * contenedor con scroll (pedido de Wicho 2026-07-30, portado desde objetiva-ops).
 *
 * Discretas: viven pegadas al borde derecho, centradas verticalmente (no
 * chocan con las burbujas de las esquinas), y cada flecha solo aparece
 * cuando hay hacia dónde ir (>300px en esa dirección).
 */
import { useEffect, useState, type RefObject } from 'react';
import { ChevronsDown, ChevronsUp } from 'lucide-react';

interface Props {
  /** Contenedor con overflow-auto que scrollea (el <main> del layout). */
  targetRef: RefObject<HTMLElement | null>;
}

const UMBRAL = 300;

export function ScrollNav({ targetRef }: Props) {
  const [arriba, setArriba] = useState(false);
  const [abajo, setAbajo] = useState(false);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    const calc = () => {
      setArriba(el.scrollTop > UMBRAL);
      setAbajo(el.scrollHeight - el.clientHeight - el.scrollTop > UMBRAL);
    };
    calc();
    el.addEventListener('scroll', calc, { passive: true });
    // El contenido cambia de alto sin scrollear (tabs, cargas async).
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', calc);
      ro.disconnect();
    };
  }, [targetRef]);

  if (!arriba && !abajo) return null;

  const btn = 'w-8 h-8 rounded-full flex items-center justify-center bg-[color:var(--pragmata-surface)]/90 backdrop-blur border border-[color:var(--pragmata-border-strong)] text-[color:var(--pragmata-muted)] shadow-md hover:text-[color:var(--pragmata-accent)] hover:border-[color:var(--pragmata-accent)]/60 hover:scale-105 transition-all';

  return (
    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1.5">
      {arriba && (
        <button
          onClick={() => targetRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          className={btn}
          title="Hasta arriba"
          aria-label="Ir hasta arriba"
        >
          <ChevronsUp className="w-4 h-4" />
        </button>
      )}
      {abajo && (
        <button
          onClick={() => targetRef.current?.scrollTo({ top: targetRef.current.scrollHeight, behavior: 'smooth' })}
          className={btn}
          title="Hasta abajo"
          aria-label="Ir hasta abajo"
        >
          <ChevronsDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
