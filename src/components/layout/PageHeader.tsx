import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface Breadcrumb {
  label: string;
  to?:   string;
}

interface PageHeaderProps {
  breadcrumbs?: Breadcrumb[];
  title:        string;
  subtitle?:    string;
  actions?:     ReactNode;
  className?:   string;
}

/**
 * PageHeader — componente transversal para encabezados de página.
 * Incluye breadcrumb, título, subtítulo y slot de acciones a la derecha.
 */
export function PageHeader({
  breadcrumbs,
  title,
  subtitle,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <div className={`mb-6 ${className}`}>
      {/* Breadcrumb */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-slate-400 mb-2">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3 flex-shrink-0" />}
              {crumb.to ? (
                <Link
                  to={crumb.to}
                  className="hover:text-slate-600 transition-colors"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className={i === breadcrumbs.length - 1 ? 'text-slate-600 font-medium' : ''}>
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 truncate">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
