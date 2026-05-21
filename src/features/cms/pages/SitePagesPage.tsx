/**
 * CMS ligero — landing (`home`) + páginas Markdown públicas.
 * Activo salvo `VITE_ENABLE_SITE_CMS=false`. Recurso RBAC: `page_seo_site_pages`.
 */

import { useCallback, useMemo, useState } from 'react';
import { ExternalLink, Globe, Plus, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { RichMarkdownEditor } from '@/components/cms/RichMarkdownEditor';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { useCmsPages } from '@/features/cms/hooks/useCmsPages';
import type { CmsLandingContent, CmsPage } from '@/features/cms/types/cms-page';

const SITE_CMS_ENABLED = import.meta.env.VITE_ENABLE_SITE_CMS !== 'false';

const FORBIDDEN_SLUGS = new Set([
  'productos',
  'checkout',
  'gracias',
  'login',
  'auth',
  'api',
  'home',
  'none',
  'robots',
  'sitemap',
]);

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolvePublicSiteOrigin(): string {
  const raw =
    typeof import.meta.env.VITE_PUBLIC_SITE_URL === 'string'
      ? import.meta.env.VITE_PUBLIC_SITE_URL.trim().replace(/\/+$/, '')
      : '';
  if (raw) return raw;
  if (import.meta.env.DEV) return 'http://localhost:4321';
  return '';
}

const PUBLIC_SITE_ORIGIN = resolvePublicSiteOrigin();

const formSchema = z
  .object({
    internal_title: z.string().min(1, 'Título interno obligatorio'),
    slugInput:      z.string().optional(),
    is_published:   z.boolean(),
    seo_title:      z.string().optional(),
    seo_description: z.string().optional(),
    og_image_url:   z.string().optional(),
    body_markdown:  z.string().optional(),
    brandName:      z.string().optional(),
    heroBadge:      z.string().optional(),
    heroHeadline:   z.string().optional(),
    heroSubheadline: z.string().optional(),
    primaryCtaLabel: z.string().optional(),
    secondaryCtaLabel: z.string().optional(),
    secondaryCtaHref: z.string().optional(),
    featuresIntroTitle: z.string().optional(),
    featuresIntroSubtitle: z.string().optional(),
    pricingTitle:   z.string().optional(),
    pricingSubtitle: z.string().optional(),
    footerBar:      z.string().optional(),
    socialProofBar: z.string().optional(),
    featuresJson:   z.string().optional(),
  })
  .refine(
    (d) => {
      const u = d.og_image_url?.trim();
      return !u || /^https?:\/\/.+/i.test(u);
    },
    { message: 'OG imagen debe ser URL http(s)', path: ['og_image_url'] },
  );

type FormValues = z.infer<typeof formSchema>;

function contentFromForm(values: FormValues): Record<string, unknown> {
  const c: CmsLandingContent & Record<string, unknown> = {};
  const set = (k: keyof CmsLandingContent, v: string | undefined) => {
    const t = v?.trim();
    if (t) (c as Record<string, unknown>)[k] = t;
  };
  set('brandName', values.brandName);
  set('heroBadge', values.heroBadge);
  set('heroHeadline', values.heroHeadline);
  set('heroSubheadline', values.heroSubheadline);
  set('primaryCtaLabel', values.primaryCtaLabel);
  set('secondaryCtaLabel', values.secondaryCtaLabel);
  set('secondaryCtaHref', values.secondaryCtaHref);
  set('featuresIntroTitle', values.featuresIntroTitle);
  set('featuresIntroSubtitle', values.featuresIntroSubtitle);
  set('pricingTitle', values.pricingTitle);
  set('pricingSubtitle', values.pricingSubtitle);
  set('footerBar', values.footerBar);
  set('socialProofBar', values.socialProofBar);

  const fj = values.featuresJson?.trim();
  if (fj) {
    try {
      const parsed = JSON.parse(fj) as unknown;
      if (Array.isArray(parsed)) c.features = parsed as CmsLandingContent['features'];
    } catch {
      /* omit invalid JSON — validated before submit */
    }
  }
  return c;
}

interface ModalProps {
  mode:    'new' | 'edit';
  page:    CmsPage | null;
  onClose: () => void;
  onSave:  (payload: Partial<CmsPage> & Record<string, unknown>) => Promise<boolean>;
  saving:  boolean;
}

function CmsPageModal({ mode, page, onClose, onSave, saving }: ModalProps) {
  const isHome = page?.slug === 'home';
  const isStandard = !isHome && (mode === 'new' || page?.page_kind === 'standard');

  const defaultFeaturesJson = useMemo(() => {
    const f = page?.content?.features;
    if (Array.isArray(f) && f.length) return JSON.stringify(f, null, 2);
    return '[\n  {\n    "icon": "📋",\n    "title": "Ejemplo",\n    "description": "Descripción breve.",\n    "href": null\n  }\n]';
  }, [page]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      internal_title: page?.internal_title ?? '',
      slugInput: mode === 'new' ? '' : undefined,
      is_published: page?.is_published ?? false,
      seo_title: page?.seo_title ?? '',
      seo_description: page?.seo_description ?? '',
      og_image_url: page?.og_image_url ?? '',
      body_markdown: page?.body_markdown ?? '',
      brandName: typeof page?.content?.brandName === 'string' ? page.content.brandName : '',
      heroBadge: typeof page?.content?.heroBadge === 'string' ? page.content.heroBadge : '',
      heroHeadline: typeof page?.content?.heroHeadline === 'string' ? page.content.heroHeadline : '',
      heroSubheadline:
        typeof page?.content?.heroSubheadline === 'string' ? page.content.heroSubheadline : '',
      primaryCtaLabel:
        typeof page?.content?.primaryCtaLabel === 'string' ? page.content.primaryCtaLabel : '',
      secondaryCtaLabel:
        typeof page?.content?.secondaryCtaLabel === 'string' ? page.content.secondaryCtaLabel : '',
      secondaryCtaHref:
        typeof page?.content?.secondaryCtaHref === 'string' ? page.content.secondaryCtaHref : '',
      featuresIntroTitle:
        typeof page?.content?.featuresIntroTitle === 'string'
          ? page.content.featuresIntroTitle
          : '',
      featuresIntroSubtitle:
        typeof page?.content?.featuresIntroSubtitle === 'string'
          ? page.content.featuresIntroSubtitle
          : '',
      pricingTitle: typeof page?.content?.pricingTitle === 'string' ? page.content.pricingTitle : '',
      pricingSubtitle:
        typeof page?.content?.pricingSubtitle === 'string' ? page.content.pricingSubtitle : '',
      footerBar: typeof page?.content?.footerBar === 'string' ? page.content.footerBar : '',
      socialProofBar:
        typeof page?.content?.socialProofBar === 'string' ? page.content.socialProofBar : '',
      featuresJson: defaultFeaturesJson,
    },
  });

  const titleDraft = watch('internal_title');

  const autoSlug = useCallback(() => {
    if (mode !== 'new') return;
    const s = slugify(titleDraft ?? '');
    if (s) setValue('slugInput', s);
  }, [mode, titleDraft, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    let slug = page?.slug;
    if (mode === 'new') {
      const raw = values.slugInput?.trim() || slugify(values.internal_title);
      if (!raw || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw)) {
        alert('Slug inválido: solo minúsculas, números y guiones.');
        return false;
      }
      if (FORBIDDEN_SLUGS.has(raw)) {
        alert(`El slug «${raw}» está reservado para rutas del sitio.`);
        return false;
      }
      slug = raw;
    }

    if (values.featuresJson?.trim() && isHome) {
      try {
        JSON.parse(values.featuresJson);
      } catch {
        alert('JSON de características inválido.');
        return false;
      }
    }

    const publish = values.is_published;
    if (publish && isStandard) {
      const md = values.body_markdown?.trim() ?? '';
      if (!md) {
        alert('Para publicar una página estándar necesitas cuerpo Markdown.');
        return false;
      }
    }

    const content = isHome ? contentFromForm(values) : {};

    const payload: Partial<CmsPage> & Record<string, unknown> = {
      ...(page?.id ? { id: page.id, version: page.version } : {}),
      slug: slug!,
      internal_title: values.internal_title.trim(),
      page_kind: isHome ? 'landing' : 'standard',
      is_published: publish,
      seo_title: values.seo_title?.trim() || null,
      seo_description: values.seo_description?.trim() || null,
      og_image_url: values.og_image_url?.trim() || null,
      content,
      body_markdown: isHome ? null : values.body_markdown?.trim() || null,
    };

    const ok = await onSave(payload);
    return ok;
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
            {mode === 'new'
              ? 'Nueva página'
              : isHome
                ? 'Landing (inicio)'
                : `Editar «${page?.slug}»`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6b7280',
              fontSize: '1.25rem',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Título interno *</label>
            <input {...register('internal_title')} onBlur={autoSlug} style={inputStyle} />
            {errors.internal_title && <p style={errorStyle}>{errors.internal_title.message}</p>}
          </div>

          {mode === 'new' && (
            <div>
              <label style={labelStyle}>Slug (URL) *</label>
              <input {...register('slugInput')} placeholder="privacidad" style={inputStyle} />
              <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                URL pública: /slug — solo minúsculas y guiones.
              </p>
            </div>
          )}

          {mode === 'edit' && page && (
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#6b7280' }}>
              Slug: <strong>{page.slug}</strong>
              {isHome ? ' · tipo landing' : ' · Markdown'}
            </p>
          )}

          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <Controller
              name="is_published"
              control={control}
              render={({ field }) => (
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
              )}
            />
            Publicada en el sitio público
          </label>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
            <p style={sectionLabel}>SEO</p>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Meta título</label>
              <input {...register('seo_title')} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Meta descripción</label>
              <textarea {...register('seo_description')} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div>
              <label style={labelStyle}>Imagen OG (URL https)</label>
              <input {...register('og_image_url')} type="url" style={inputStyle} />
              {errors.og_image_url && <p style={errorStyle}>{errors.og_image_url.message}</p>}
            </div>
          </div>

          {isHome && (
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
              <p style={sectionLabel}>Contenido — landing</p>
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Marca (navbar)</label>
                  <input {...register('brandName')} placeholder="Vacío = PUBLIC_BRAND_NAME" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Hero — badge</label>
                  <input {...register('heroBadge')} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Hero — titular (H1)</label>
                  <input {...register('heroHeadline')} placeholder="Vacío = PUBLIC_BRAND_TAGLINE" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Hero — subtítulo</label>
                  <p style={{ margin: '0 0 8px', fontSize: '0.75rem', color: '#9ca3af' }}>
                    Editor visual (se guarda como Markdown en el sitio público).
                  </p>
                  <Controller
                    name="heroSubheadline"
                    control={control}
                    render={({ field }) => (
                      <RichMarkdownEditor
                        key={`home-hero-${page?.id ?? 'new'}`}
                        markdown={field.value ?? ''}
                        onMarkdownChange={field.onChange}
                        placeholder="Párrafo principal bajo el titular…"
                        minHeightPx={200}
                      />
                    )}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>CTA primario (texto)</label>
                    <input {...register('primaryCtaLabel')} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>CTA secundario (texto)</label>
                    <input {...register('secondaryCtaLabel')} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>CTA secundario — href</label>
                  <input {...register('secondaryCtaHref')} placeholder="/productos o #features" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Bloque características — título</label>
                  <input {...register('featuresIntroTitle')} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Bloque características — subtítulo</label>
                  <input {...register('featuresIntroSubtitle')} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Pricing — título</label>
                  <input {...register('pricingTitle')} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Pricing — subtítulo</label>
                  <input {...register('pricingSubtitle')} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Pie — texto copyright</label>
                  <input {...register('footerBar')} placeholder="Vacío = © año marca…" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Franja bajo hero</label>
                  <input {...register('socialProofBar')} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Tarjetas (JSON array)</label>
                  <textarea {...register('featuresJson')} rows={10} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: '0.8125rem' }} />
                </div>
              </div>
            </div>
          )}

          {isStandard && (
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
              <p style={sectionLabel}>Contenido</p>
              <p style={{ margin: '0 0 10px', fontSize: '0.75rem', color: '#9ca3af' }}>
                Páginas como /privacidad o /terminos (tipo Markdown). La landing usa el bloque anterior.
              </p>
              <Controller
                name="body_markdown"
                control={control}
                render={({ field }) => (
                  <RichMarkdownEditor
                    key={page?.id ?? (mode === 'new' ? 'new-standard-page' : 'standard')}
                    markdown={field.value ?? ''}
                    onMarkdownChange={field.onChange}
                  />
                )}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>
              Cerrar
            </button>
            <button type="submit" disabled={saving} style={saveBtnStyle}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirm({
  page,
  onConfirm,
  onClose,
}: {
  page: CmsPage;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 28,
          maxWidth: 400,
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 8px' }}>¿Archivar página?</h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0 0 24px' }}>
          Se marcará como eliminada <strong>{page.slug}</strong>. El sitio público dejará de servirla.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={cancelBtnStyle}>
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} style={{ ...saveBtnStyle, background: '#ef4444' }}>
            Archivar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SitePagesPage() {
  const { data: pages, loading, error, upsert, softDelete } = useCmsPages(SITE_CMS_ENABLED);
  const [modal, setModal] = useState<'new' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<CmsPage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CmsPage | null>(null);
  const [saving, setSaving] = useState(false);

  const closeModal = () => {
    setModal(null);
    setEditTarget(null);
  };

  const handleSave = useCallback(
    async (payload: Partial<CmsPage> & Record<string, unknown>): Promise<boolean> => {
      setSaving(true);
      const row = await upsert(payload);
      setSaving(false);
      if (!row) {
        alert('No se pudo guardar (permisos, slug duplicado o conflicto de versión).');
        return false;
      }
      closeModal();
      return true;
    },
    [upsert],
  );

  const columns = useMemo((): ColumnDef<CmsPage>[] => {
    return [
      {
        key: 'slug',
        header: 'Slug',
        width: 140,
        render: (_v, row) => (
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{row.slug}</span>
        ),
      },
      {
        key: 'internal_title',
        header: 'Título interno',
        width: 220,
      },
      {
        key: 'page_kind',
        header: 'Tipo',
        width: 100,
        render: (_v, row) => (
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
            {row.page_kind === 'landing' ? 'Landing' : 'Markdown'}
          </span>
        ),
      },
      {
        key: 'is_published',
        header: 'Estado',
        width: 110,
        render: (_v, row) => (
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 999,
              background: row.is_published ? '#d1fae5' : '#f3f4f6',
              color: row.is_published ? '#065f46' : '#6b7280',
            }}
          >
            {row.is_published ? 'Publicada' : 'Borrador'}
          </span>
        ),
      },
    ];
  }, []);

  const rowActions = useCallback(
    (row: CmsPage) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => {
            setEditTarget(row);
            setModal('edit');
          }}
          style={{
            padding: '6px 10px',
            fontSize: '0.8125rem',
            fontWeight: 600,
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          Editar
        </button>
        {PUBLIC_SITE_ORIGIN && row.is_published && row.page_kind === 'standard' && (
          <a
            href={`${PUBLIC_SITE_ORIGIN}/${encodeURIComponent(row.slug)}`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              fontSize: '0.8125rem',
              color: '#7c3aed',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            <ExternalLink size={14} /> Ver
          </a>
        )}
        {PUBLIC_SITE_ORIGIN && row.is_published && row.slug === 'home' && (
          <a
            href={`${PUBLIC_SITE_ORIGIN}/`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              fontSize: '0.8125rem',
              color: '#7c3aed',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            <ExternalLink size={14} /> Ver inicio
          </a>
        )}
        {row.slug !== 'home' && (
          <button
            type="button"
            onClick={() => setDeleteTarget(row)}
            style={{
              padding: '6px 10px',
              fontSize: '0.8125rem',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: '#ef4444',
              cursor: 'pointer',
            }}
            title="Archivar"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    ),
    [],
  );

  if (!SITE_CMS_ENABLED) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', color: '#6b7280' }}>
        <Globe size={48} style={{ marginBottom: 16, opacity: 0.4 }} />
        <h2 style={{ margin: '0 0 8px', fontSize: '1.125rem', fontWeight: 600, color: '#111' }}>
          CMS del sitio desactivado
        </h2>
        <p style={{ margin: 0, fontSize: '0.875rem' }}>
          Este módulo está desactivado (<code>VITE_ENABLE_SITE_CMS=false</code>). Quita esa línea o ponla en <code>true</code>.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Globe size={22} style={{ color: '#7c3aed' }} />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Páginas del sitio (SEO)</h1>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#6b7280' }}>
              Landing en <code>home</code> · Páginas legales o landing secundarias en Markdown.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditTarget(null);
            setModal('new');
          }}
          style={saveBtnStyle}
        >
          <Plus size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
          Nueva página
        </button>
      </div>

      {error && (
        <div
          style={{
            background: '#fee2e2',
            border: '1px solid #fca5a5',
            borderRadius: 8,
            padding: '12px 16px',
            color: '#991b1b',
            fontSize: '0.875rem',
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>Cargando…</div>
      ) : (
        <DataTable<CmsPage>
          data={pages}
          columns={columns}
          rowKey="id"
          actions={rowActions}
          emptyMessage="Sin páginas."
          emptyDescription="Crea una página Markdown o edita la landing «home» cuando exista en la base."
        />
      )}

      {modal === 'new' && (
        <CmsPageModal key="cms-modal-new" mode="new" page={null} onClose={closeModal} onSave={handleSave} saving={saving} />
      )}
      {modal === 'edit' && editTarget && (
        <CmsPageModal key={editTarget.id} mode="edit" page={editTarget} onClose={closeModal} onSave={handleSave} saving={saving} />
      )}

      {deleteTarget && (
        <DeleteConfirm
          page={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            await softDelete(deleteTarget.id, deleteTarget.version);
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: '#374151',
  marginBottom: 4,
};

const sectionLabel: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: '0.75rem',
  fontWeight: 700,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontSize: '0.875rem',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const errorStyle: React.CSSProperties = {
  color: '#ef4444',
  fontSize: '0.75rem',
  marginTop: 4,
};

const saveBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '8px 18px',
  background: '#7c3aed',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const cancelBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '8px 18px',
  background: '#f3f4f6',
  color: '#374151',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
};
