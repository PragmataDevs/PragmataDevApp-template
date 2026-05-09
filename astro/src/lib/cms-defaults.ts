/**
 * Merge de copy de la landing: CMS (`slug = home`) + fallbacks desde env (template).
 */

export interface LandingFeature {
  icon: string;
  title: string;
  description: string;
  href?: string | null;
}

export interface MergedLanding {
  brand: string;
  /** Texto del <h1> hero */
  heroHeadline: string;
  heroBadge: string;
  heroSubheadline: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  featuresIntroTitle: string;
  featuresIntroSubtitle: string;
  pricingTitle: string;
  pricingSubtitle: string;
  footerNote: string;
  /** Franja bajo el hero (“Construido con…”). */
  socialProofBar: string;
  features: LandingFeature[];
  /** Pasar a BaseLayout `title` (el layout añade ` — marca`). */
  metaTitleBase: string;
  metaDescription: string;
  ogImage?: string;
}

function pickStr(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const t = v.trim();
  return t || fallback;
}

function defaultFeatures(ecommerceEnabled: boolean): LandingFeature[] {
  return [
    {
      icon: '📋',
      title: 'Gestión de Proyectos',
      description:
        'Organiza tareas en tableros Kanban, asigna responsables y haz seguimiento en tiempo real.',
      href: null,
    },
    {
      icon: '👥',
      title: 'Equipos y Roles',
      description: 'Control de acceso granular por rol. Define permisos exactos para cada miembro del equipo.',
      href: null,
    },
    {
      icon: '📄',
      title: 'Documentos',
      description: 'Centraliza contratos, facturas y reportes. Acceso seguro con URLs firmadas de Supabase.',
      href: null,
    },
    {
      icon: '🤖',
      title: 'Inteligencia Artificial',
      description: 'Resúmenes automáticos, búsqueda semántica y asistente contextual para tu negocio.',
      href: null,
    },
    {
      icon: '🛒',
      title: 'E-Commerce',
      description: 'Catálogo de productos, carrito de compras y pagos integrados con Stripe o MercadoPago.',
      href: ecommerceEnabled ? '/productos' : null,
    },
    {
      icon: '📊',
      title: 'Dashboard y KPIs',
      description: 'Métricas clave de tu negocio en tiempo real: usuarios, entidades, tareas y más.',
      href: null,
    },
  ];
}

function normalizeFeatures(raw: unknown, ecommerceEnabled: boolean): LandingFeature[] {
  if (!Array.isArray(raw) || raw.length === 0) return defaultFeatures(ecommerceEnabled);
  const out: LandingFeature[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const icon = typeof o.icon === 'string' ? o.icon : '📌';
    const title = typeof o.title === 'string' ? o.title : '';
    const description = typeof o.description === 'string' ? o.description : '';
    if (!title || !description) continue;
    const href = o.href === null || o.href === undefined || o.href === ''
      ? null
      : String(o.href);
    out.push({ icon, title, description, href });
  }
  return out.length ? out : defaultFeatures(ecommerceEnabled);
}

const DEFAULT_HERO_SUB =
  'Una plataforma modular para gestionar proyectos, equipos, documentos y ventas — todo en un solo lugar, adaptable a tu negocio.';

const DEFAULT_SOCIAL_BAR =
  'Construido con Supabase · React · Astro · Tailwind CSS · Listo para producción';

export function mergeLandingFromCms(opts: {
  brandEnv: string;
  taglineEnv: string;
  ecommerceEnabled: boolean;
  cms: {
    seo_title: string | null;
    seo_description: string | null;
    og_image_url: string | null;
    content: Record<string, unknown>;
    is_published: boolean;
  } | null;
}): MergedLanding {
  const useCms = !!opts.cms?.is_published;
  const c = useCms ? opts.cms!.content : {};

  const brand = pickStr(c.brandName, opts.brandEnv);
  const heroHeadline = pickStr(c.heroHeadline, opts.taglineEnv);
  const heroBadge = pickStr(c.heroBadge, 'Plataforma de gestión empresarial');
  const heroSubheadline = pickStr(c.heroSubheadline, DEFAULT_HERO_SUB);

  const primaryCtaLabel = pickStr(c.primaryCtaLabel, 'Comenzar gratis →');
  const secondaryCtaLabel = opts.ecommerceEnabled
    ? pickStr(c.secondaryCtaLabel, '🛍️ Ver catálogo')
    : pickStr(c.secondaryCtaLabel, 'Ver características');
  const secondaryCtaHref = opts.ecommerceEnabled
    ? typeof c.secondaryCtaHref === 'string' && c.secondaryCtaHref.trim()
      ? c.secondaryCtaHref.trim()
      : '/productos'
    : typeof c.secondaryCtaHref === 'string' && c.secondaryCtaHref.trim()
      ? c.secondaryCtaHref.trim()
      : '#features';

  const featuresIntroTitle = pickStr(
    c.featuresIntroTitle,
    'Todo lo que necesitas para gestionar tu negocio',
  );
  const featuresIntroSubtitle = pickStr(
    c.featuresIntroSubtitle,
    'Módulos independientes que trabajan juntos. Activa solo lo que necesitas.',
  );

  const pricingTitle = pickStr(c.pricingTitle, '¿Listo para digitalizar tu negocio?');
  const pricingSubtitle = pickStr(
    c.pricingSubtitle,
    'Configura tu plataforma en minutos. Sin tarjeta de crédito.',
  );

  const year = new Date().getFullYear();
  const defaultFooter = `© ${year} ${brand}. Todos los derechos reservados.`;
  const footerNote = pickStr(c.footerBar, defaultFooter);

  const socialProofBar = pickStr(c.socialProofBar, DEFAULT_SOCIAL_BAR);

  const features = normalizeFeatures(c.features, opts.ecommerceEnabled);

  const metaTitleBase =
    useCms && opts.cms!.seo_title?.trim()
      ? opts.cms!.seo_title!.trim()
      : heroHeadline;

  const defaultMetaDesc = `${brand} — ${opts.taglineEnv}. Gestiona tu negocio de forma eficiente con nuestra plataforma todo-en-uno.`;
  const metaDescription =
    useCms && opts.cms!.seo_description?.trim()
      ? opts.cms!.seo_description!.trim()
      : defaultMetaDesc;

  let ogImage: string | undefined;
  if (useCms && opts.cms!.og_image_url?.trim()) {
    const u = opts.cms!.og_image_url!.trim();
    if (/^https?:\/\//i.test(u)) ogImage = u;
  }

  return {
    brand,
    heroHeadline,
    heroBadge,
    heroSubheadline,
    primaryCtaLabel,
    secondaryCtaLabel,
    secondaryCtaHref,
    featuresIntroTitle,
    featuresIntroSubtitle,
    pricingTitle,
    pricingSubtitle,
    footerNote,
    socialProofBar,
    features,
    metaTitleBase,
    metaDescription,
    ogImage,
  };
}
