import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/* ─── Variants ─────────────────────────────────────────────── */

const variantStyles = {
  primary: [
    'bg-[color:var(--pragmata-accent)] text-white',
    'hover:bg-[color:var(--pragmata-accent-dark)]',
    'shadow-sm',
  ].join(' '),

  accent: [
    'bg-[color:var(--pragmata-accent)] text-white',
    'hover:bg-[color:var(--pragmata-accent-dark)]',
    'shadow-sm',
  ].join(' '),

  secondary: [
    'bg-[color:var(--pragmata-surface)] text-[color:var(--pragmata-fg)]',
    'border border-[color:var(--pragmata-border)]',
    'hover:bg-[color:var(--pragmata-surface-2)]',
    'shadow-sm',
  ].join(' '),

  ghost: [
    'text-[color:var(--pragmata-muted)]',
    'hover:text-[color:var(--pragmata-fg)]',
    'hover:bg-[color:var(--pragmata-surface-2)]',
  ].join(' '),

  danger: [
    'bg-[color:var(--pragmata-danger)] text-white',
    'hover:opacity-90',
    'shadow-sm',
  ].join(' '),

  'danger-ghost': [
    'text-[color:var(--pragmata-danger)]',
    'hover:bg-red-50 dark:hover:bg-red-950/30',
  ].join(' '),
} as const;

/* ─── Sizes ────────────────────────────────────────────────── */

const sizeStyles = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-2.5 text-sm gap-2',
} as const;

/* ─── Types ────────────────────────────────────────────────── */

export type ButtonVariant = keyof typeof variantStyles;
export type ButtonSize = keyof typeof sizeStyles;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Estilo visual del botón */
  variant?: ButtonVariant;
  /** Tamaño */
  size?: ButtonSize;
  /** Muestra un spinner y deshabilita el botón */
  loading?: boolean;
  /** Ícono a la izquierda (componente de Lucide) */
  icon?: ReactNode;
  /** Ícono a la derecha */
  iconRight?: ReactNode;
  /** Ocupa todo el ancho disponible */
  fullWidth?: boolean;
}

/* ─── Component ────────────────────────────────────────────── */

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconRight,
      fullWidth = false,
      disabled,
      className = '',
      children,
      ...rest
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    const classes = [
      // Base
      'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--pragmata-accent)] focus-visible:ring-offset-1',
      // Variant + Size
      variantStyles[variant],
      sizeStyles[size],
      // State
      isDisabled && 'opacity-50 cursor-not-allowed pointer-events-none',
      fullWidth && 'w-full',
      // Custom overrides
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={classes}
        {...rest}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}

        {children}

        {iconRight && !loading && (
          <span className="shrink-0">{iconRight}</span>
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';
