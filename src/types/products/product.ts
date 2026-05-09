import type { AuditBase } from '@/types/core/base';

// ─── Product entity (maps to public.products table) ──────────────────────────

export interface Product extends AuditBase {
  name:              string;
  slug:              string;
  description:       string | null;
  category:          string | null;
  price:             number;
  compare_at_price:  number | null;
  currency:          string;
  image_url:         string | null;
  images:            string[];
  in_stock:          boolean;
  stock_qty:         number | null;
  metadata:          Record<string, unknown>;

  /** Meta title en ficha pública (BaseLayout añade sufijo de marca). Vacío → `name`. */
  seo_title:         string | null;
  /** Meta / OG description. Vacío → `description` o fallback. */
  seo_description:   string | null;
  /** Imagen OG absoluta (https). Vacío → `image_url`. */
  seo_image_url:     string | null;
}

export type ProductInput = Omit<Product,
  keyof AuditBase
>;

export const PRODUCT_CATEGORY_OPTIONS = [
  'General',
  'Servicios',
  'Productos físicos',
  'Digital',
  'Suscripción',
] as const;

/** Generates a URL-safe slug from a product name */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
