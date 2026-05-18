/** Nombre de marca en sitio público + ERP (Factory → docs/FACTORY_BRAND.env.snippet → .env). */
export function getPublicBrandName(): string {
  const v = import.meta.env.PUBLIC_BRAND_NAME;
  if (typeof v === 'string' && v.trim()) return v.trim();
  return 'Mi Empresa';
}

/** Ruta pública del logo (misma en `public/` y `astro/public/` tras brand-apply). */
export function getPublicBrandIconUrl(): string {
  const v = import.meta.env.PUBLIC_BRAND_ICON_URL;
  if (typeof v === 'string' && v.trim()) return v.trim();
  return '/favicon.svg';
}

/** True si Factory / `.env` definieron icono de marca (nav y login no fuerzan favicon genérico). */
export function hasCustomBrandIcon(): boolean {
  const v = import.meta.env.PUBLIC_BRAND_ICON_URL;
  return typeof v === 'string' && v.trim().length > 0;
}
