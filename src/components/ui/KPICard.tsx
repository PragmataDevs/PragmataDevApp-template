/**
 * KPICard — Metric summary card for dashboards.
 *
 * Usage:
 *   <KPICard
 *     label="Entidades activas"
 *     value={12}
 *     icon={<Layers className="w-5 h-5" />}
 *     trend={{ value: 2, direction: 'up', label: 'este mes' }}
 *     href="/settings/entities"
 *   />
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';

export interface KPITrend {
  /** Numeric change (e.g. +3 or -1) */
  value: number;
  direction: 'up' | 'down' | 'neutral';
  label?: string;
}

export interface KPICardProps {
  label: string;
  value: number | string;
  icon?: ReactNode;
  /** Accent color CSS variable suffix or hex (default: accent) */
  color?: 'accent' | 'success' | 'warning' | 'danger';
  trend?: KPITrend;
  /** If provided, the card becomes clickable and links to this path */
  href?: string;
  loading?: boolean;
  className?: string;
}

const colorMap = {
  accent:  { icon: 'bg-[color:var(--pragmata-accent-soft)]',   text: 'text-[color:var(--pragmata-accent)]' },
  success: { icon: 'bg-[color:var(--pragmata-success)]/15',    text: 'text-[color:var(--pragmata-success)]' },
  warning: { icon: 'bg-[color:var(--pragmata-warning)]/15',    text: 'text-[color:var(--pragmata-warning)]' },
  danger:  { icon: 'bg-[color:var(--pragmata-danger)]/15',     text: 'text-[color:var(--pragmata-danger)]' },
};

const trendColors = {
  up:      'text-[color:var(--pragmata-success)]',
  down:    'text-[color:var(--pragmata-danger)]',
  neutral: 'text-[color:var(--pragmata-muted)]',
};

const TrendIcon = ({ direction }: { direction: 'up' | 'down' | 'neutral' }) => {
  if (direction === 'up')      return <TrendingUp className="w-3.5 h-3.5" />;
  if (direction === 'down')    return <TrendingDown className="w-3.5 h-3.5" />;
  return <Minus className="w-3.5 h-3.5" />;
};

export function KPICard({
  label,
  value,
  icon,
  color = 'accent',
  trend,
  href,
  loading = false,
  className = '',
}: KPICardProps) {
  const { icon: iconBg, text: iconText } = colorMap[color];

  const content = (
    <div className={[
      'group flex flex-col gap-3 rounded-pragmata border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] p-5 shadow-sm transition-shadow',
      href ? 'hover:shadow-md hover:border-[color:var(--pragmata-accent)]/30 cursor-pointer' : '',
      className,
    ].join(' ')}>
      {/* Header: icon + label */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[color:var(--pragmata-muted)] truncate">{label}</span>
        {icon && (
          <div className={`flex-shrink-0 p-2 rounded-pragmata ${iconBg}`}>
            <span className={iconText}>{icon}</span>
          </div>
        )}
      </div>

      {/* Value */}
      {loading ? (
        <div className="flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[color:var(--pragmata-muted)]" />
          <div className="h-8 w-16 rounded animate-pulse bg-[color:var(--pragmata-border)]" />
        </div>
      ) : (
        <span className="font-mono tabular-nums text-3xl font-bold tracking-tight text-[color:var(--pragmata-fg)]">
          {typeof value === 'number' ? value.toLocaleString('es-MX') : value}
        </span>
      )}

      {/* Trend */}
      {trend && !loading && (
        <div className={`flex items-center gap-1 text-xs font-medium ${trendColors[trend.direction]}`}>
          <TrendIcon direction={trend.direction} />
          <span>
            {trend.direction !== 'neutral' && (trend.value > 0 ? '+' : '')}{trend.value}
            {trend.label && <span className="text-[color:var(--pragmata-muted)] font-normal ml-1">{trend.label}</span>}
          </span>
        </div>
      )}
    </div>
  );

  if (href) return <Link to={href} className="block no-underline">{content}</Link>;
  return content;
}
