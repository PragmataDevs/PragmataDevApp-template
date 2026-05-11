import type { AuditBase } from './audit.ts';

/** Fila `public.products` — misma forma en catálogo admin (ERP) y páginas Astro. */
export interface Product extends AuditBase {
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  price: number;
  compare_at_price: number | null;
  currency: string;
  image_url: string | null;
  images: string[];
  in_stock: boolean;
  stock_qty: number | null;
  metadata: Record<string, unknown>;
  seo_title: string | null;
  seo_description: string | null;
  seo_image_url: string | null;
}

export type ProductInput = Omit<Product, keyof AuditBase>;
