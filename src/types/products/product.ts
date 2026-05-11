export type { Product, ProductInput } from '@pragmata/core';

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
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
