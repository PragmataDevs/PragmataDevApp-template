import { getPublicBrandIconUrl, getPublicBrandName, hasCustomBrandIcon } from '@/lib/brandEnv';

type BrandIconProps = {
  className?: string;
  alt?: string;
  /** Si es true, no renderiza nada cuando no hay `PUBLIC_BRAND_ICON_URL`. */
  onlyIfCustom?: boolean;
};

export function BrandIcon({ className = 'h-8 w-8', alt, onlyIfCustom = false }: BrandIconProps) {
  if (onlyIfCustom && !hasCustomBrandIcon()) return null;
  const src = getPublicBrandIconUrl();
  return (
    <img
      src={src}
      alt={alt ?? getPublicBrandName()}
      className={className}
      width={32}
      height={32}
      decoding="async"
    />
  );
}
