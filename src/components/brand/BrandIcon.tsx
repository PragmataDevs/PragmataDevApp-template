/** Icono de marca canónico (mismo SVG que `astro/public/favicon.svg`). */
export const BRAND_ICON_SRC = '/favicon.svg';

type BrandIconProps = {
  className?: string;
  alt?: string;
};

export function BrandIcon({ className = 'h-8 w-8', alt = 'Pragmata' }: BrandIconProps) {
  return (
    <img
      src={BRAND_ICON_SRC}
      alt={alt}
      className={className}
      width={32}
      height={32}
      decoding="async"
    />
  );
}
