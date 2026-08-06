/**
 * PrintButton — One-click print/PDF button using usePrint.
 *
 * Usage (simple HTML table):
 *   <PrintButton
 *     title="Reporte de Tareas"
 *     buildHtml={() => buildPrintTable({ columns, rows: tasks })}
 *   />
 *
 * Usage (capture a DOM element):
 *   <div id="report-area">...</div>
 *   <PrintButton title="Reporte" elementId="report-area" />
 */

import { Printer } from 'lucide-react';
import { usePrint } from '@/lib/pdf/usePrint';
import type { PrintOptions } from '@/lib/pdf/usePrint';

export interface PrintButtonProps {
  /** PDF / print dialog title */
  title: string;
  /** Either provide buildHtml OR elementId */
  buildHtml?: () => string;
  elementId?: string;
  extraCss?: string;
  label?: string;
  variant?: 'default' | 'ghost' | 'icon';
  className?: string;
}

export function PrintButton({
  title,
  buildHtml,
  elementId,
  extraCss,
  label = 'Imprimir',
  variant = 'default',
  className = '',
}: PrintButtonProps) {
  const { print, printing } = usePrint();

  const handleClick = async () => {
    const options: PrintOptions = {
      title,
      extraCss,
      ...(buildHtml ? { html: buildHtml() } : {}),
      ...(elementId ? { elementId } : {}),
    };
    await print(options);
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleClick}
        disabled={printing}
        title={label}
        className={`p-2 rounded-lg border border-[color:var(--pragmata-border)] text-[color:var(--pragmata-muted)] hover:bg-[color:var(--pragmata-surface-2)] hover:text-[color:var(--pragmata-fg)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      >
        <Printer className={`w-4 h-4 ${printing ? 'animate-pulse' : ''}`} />
      </button>
    );
  }

  if (variant === 'ghost') {
    return (
      <button
        onClick={handleClick}
        disabled={printing}
        className={`flex items-center gap-2 px-3 py-2 text-sm text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      >
        <Printer className={`w-4 h-4 flex-shrink-0 ${printing ? 'animate-pulse' : ''}`} />
        {printing ? 'Preparando...' : label}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={printing}
      className={`flex items-center gap-2 px-3 py-2 text-sm font-medium text-[color:var(--pragmata-muted)] bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg hover:bg-[color:var(--pragmata-surface-2)] transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      <Printer className={`w-4 h-4 flex-shrink-0 ${printing ? 'animate-pulse' : ''}`} />
      {printing ? 'Preparando...' : label}
    </button>
  );
}

// `buildPrintTable` NO se re-exporta desde aquí: vive en `@/lib/pdf/usePrint` y
// ese es el import que deben usar los consumidores. El re-export ahorraba una
// línea al llamador y a cambio rompía el fast-refresh de todo este archivo
// (react-refresh exige que un módulo de componente exporte solo componentes).
