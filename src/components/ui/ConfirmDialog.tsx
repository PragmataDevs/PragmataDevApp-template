import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

/**
 * ConfirmDialog — diálogo de confirmación de marca (dark, rounded-pragmata) que
 * reemplaza a `window.confirm()`. Se consume de forma imperativa:
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: '¿Eliminar contrato?', destructive: true })) { … }
 *
 * Monta `<ConfirmProvider>` una sola vez en la raíz de la app.
 */

export interface ConfirmOptions {
  /** Título / pregunta principal. */
  title: string;
  /** Detalle opcional bajo el título. */
  description?: ReactNode;
  /** Texto del botón de confirmar. @default 'Confirmar' */
  confirmLabel?: string;
  /** Texto del botón de cancelar. @default 'Cancelar' */
  cancelLabel?: string;
  /** Acción destructiva → botón rojo + icono de advertencia. @default false */
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Hook para pedir confirmación al usuario. Devuelve `Promise<boolean>`. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>');
  return ctx;
}

interface DialogState extends ConfirmOptions {
  open: boolean;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({ ...opts, open: true });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setState(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state?.open && (
        <ConfirmDialog
          options={state}
          onConfirm={() => close(true)}
          onCancel={() => close(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

interface ConfirmDialogProps {
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ options, onConfirm, onCancel }: ConfirmDialogProps) {
  const { title, description, confirmLabel, cancelLabel, destructive } = options;
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Enfoca el botón de confirmar al abrir y cierra con Escape.
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm rounded-pragmata border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] p-6 shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {destructive && (
            <span className="mt-0.5 flex-shrink-0 text-[color:var(--pragmata-danger)]">
              <AlertTriangle className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 space-y-1">
            <h3
              id="confirm-title"
              className="font-semibold text-[color:var(--pragmata-fg)]"
            >
              {title}
            </h3>
            {description && (
              <p className="text-sm text-[color:var(--pragmata-muted)]">{description}</p>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {cancelLabel ?? 'Cancelar'}
          </Button>
          <Button
            ref={confirmRef}
            variant={destructive ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel ?? 'Confirmar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
