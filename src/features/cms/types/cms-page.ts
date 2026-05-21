import type { AuditBase } from '@/types/core/base';

/** Bloques editables de la landing (`slug = home`). Vacíos → fallback en Astro desde env. */
export interface CmsLandingContent {
  brandName?: string;
  heroBadge?: string;
  heroHeadline?: string;
  heroSubheadline?: string;
  primaryCtaLabel?: string;
  secondaryCtaLabel?: string;
  featuresIntroTitle?: string;
  featuresIntroSubtitle?: string;
  pricingTitle?: string;
  pricingSubtitle?: string;
  footerBar?: string;
  /** Franja bajo el hero */
  socialProofBar?: string;
  secondaryCtaHref?: string;
  /** Cards del grid (icono emoji + textos). `href` relativo opcional (ej. `/productos`). */
  features?: Array<{
    icon: string;
    title: string;
    description: string;
    href?: string | null;
  }>;
}

export type CmsPageKind = 'landing' | 'standard';

/**
 * Página del sitio público — `public.cms_pages`
 * `slug = home` → contenido JSON tipo landing; resto → `body_markdown` en plantilla estándar.
 */
export interface CmsPage extends AuditBase, Record<string, unknown> {
  slug: string;
  internal_title: string;
  page_kind: CmsPageKind;
  is_published: boolean;
  seo_title: string | null;
  seo_description: string | null;
  og_image_url: string | null;
  content: CmsLandingContent & Record<string, unknown>;
  body_markdown: string | null;
}
