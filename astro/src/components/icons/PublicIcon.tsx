/**
 * Iconos de trazo sobrios (paths derivados de Lucide ISC — lucide-static).
 * Sustituyen emojis en el pilar público; `resolvePublicIconKey` mantiene compat con CMS legacy.
 */

import type { SVGProps } from 'react';

export type PublicIconKey =
  | 'cart'
  | 'package'
  | 'layout-grid'
  | 'users'
  | 'file-text'
  | 'sparkles'
  | 'shopping-cart'
  | 'chart-column'
  | 'circle'
  | 'check'
  | 'lock'
  | 'truck'
  | 'message-circle'
  | 'x'
  | 'sun'
  | 'moon';

const LEGACY_EMOJI: Record<string, PublicIconKey> = {
  '📋': 'layout-grid',
  '👥': 'users',
  '📄': 'file-text',
  '🤖': 'sparkles',
  '🛒': 'shopping-cart',
  '📊': 'chart-column',
  '🛍️': 'package',
  '📌': 'circle',
};

/** Normaliza `icon` desde CMS (emoji, kebab-case o nombre Lucide). */
export function resolvePublicIconKey(raw: string): PublicIconKey {
  const t = raw.trim();
  if (!t) return 'circle';
  if (LEGACY_EMOJI[t]) return LEGACY_EMOJI[t];
  const lower = t.toLowerCase();
  const aliases: Record<string, PublicIconKey> = {
    layout: 'layout-grid',
    grid: 'layout-grid',
    'layout-grid': 'layout-grid',
    users: 'users',
    'file-text': 'file-text',
    document: 'file-text',
    documents: 'file-text',
    sparkles: 'sparkles',
    ai: 'sparkles',
    'shopping-cart': 'shopping-cart',
    ecommerce: 'shopping-cart',
    cart: 'cart',
    package: 'package',
    'chart-column': 'chart-column',
    chart: 'chart-column',
    dashboard: 'chart-column',
    circle: 'circle',
    check: 'check',
    lock: 'lock',
    truck: 'truck',
    'message-circle': 'message-circle',
    support: 'message-circle',
    x: 'x',
    close: 'x',
    sun: 'sun',
    moon: 'moon',
  };
  if (aliases[lower]) return aliases[lower];
  return 'circle';
}

type IconProps = SVGProps<SVGSVGElement> & { name: PublicIconKey | string };

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function PublicIcon({ name, className, ...rest }: IconProps) {
  const key = resolvePublicIconKey(String(name));
  const cn = className ?? 'h-6 w-6';

  switch (key) {
    case 'cart':
    case 'shopping-cart':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={cn} aria-hidden {...stroke} {...rest}>
          <circle cx="8" cy="21" r="1" />
          <circle cx="19" cy="21" r="1" />
          <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
        </svg>
      );
    case 'package':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={cn} aria-hidden {...stroke} {...rest}>
          <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
          <path d="M12 22V12" />
          <path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7" />
          <path d="m7.5 4.27 9 5.15" />
        </svg>
      );
    case 'layout-grid':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={cn} aria-hidden {...stroke} {...rest}>
          <rect width="7" height="7" x="3" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="14" rx="1" />
          <rect width="7" height="7" x="3" y="14" rx="1" />
        </svg>
      );
    case 'users':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={cn} aria-hidden {...stroke} {...rest}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'file-text':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={cn} aria-hidden {...stroke} {...rest}>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M10 9H8" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </svg>
      );
    case 'sparkles':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={cn} aria-hidden {...stroke} {...rest}>
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
          <path d="M20 3v4" />
          <path d="M22 5h-4" />
          <path d="M4 17v2" />
          <path d="M5 18H3" />
        </svg>
      );
    case 'chart-column':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={cn} aria-hidden {...stroke} {...rest}>
          <path d="M3 3v16a2 2 0 0 0 2 2h16" />
          <path d="M18 17V9" />
          <path d="M13 17V5" />
          <path d="M8 17v-3" />
        </svg>
      );
    case 'check':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={cn} aria-hidden {...stroke} {...rest}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case 'lock':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={cn} aria-hidden {...stroke} {...rest}>
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case 'truck':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={cn} aria-hidden {...stroke} {...rest}>
          <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
          <path d="M15 18H9" />
          <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
          <circle cx="17" cy="18" r="2" />
          <circle cx="7" cy="18" r="2" />
        </svg>
      );
    case 'message-circle':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={cn} aria-hidden {...stroke} {...rest}>
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
      );
    case 'x':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={cn} aria-hidden {...stroke} {...rest}>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      );
    case 'sun':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={cn} aria-hidden {...stroke} {...rest}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      );
    case 'moon':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={cn} aria-hidden {...stroke} {...rest}>
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      );
    case 'circle':
    default:
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={cn} aria-hidden {...stroke} {...rest}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}
