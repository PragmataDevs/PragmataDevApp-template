/**
 * ProductsPage — Admin UI for managing the public product catalog.
 *
 * Guards: requires VITE_ENABLE_ECOMMERCE=true and `page_ecommerce_products` permission.
 * Uses DataTable + useCrudResource for the full CRUD pattern.
 *
 * Columns: image, name, category, price, compare_at_price, stock, status, actions
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Package, Plus, Edit2, Trash2, ExternalLink, Upload, X, MoreHorizontal } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';

import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { useProducts }  from '@/features/products/hooks/useProducts';
import { slugify }      from '@/types/products/product';
import type { Product } from '@/types/products/product';

// ─── Feature flag guard ───────────────────────────────────────────────────────

const ECOMMERCE_ENABLED = import.meta.env.VITE_ENABLE_ECOMMERCE === 'true';

// ─── Zod schema ───────────────────────────────────────────────────────────────

const productSchema = z.object({
  name:             z.string().min(2, 'El nombre es obligatorio'),
  slug:             z.string().min(2, 'El slug es obligatorio'),
  description:      z.string().optional(),
  category:         z.string().optional(),
  price:            z.coerce.number().min(0, 'El precio debe ser ≥ 0'),
  compare_at_price: z.coerce.number().min(0).optional().nullable(),
  currency:         z.string().default('MXN'),
  in_stock:         z.boolean().default(true),
  stock_qty:        z.coerce.number().int().min(0).optional().nullable(),
});

const IMAGE_BUCKET = 'product-images';

async function uploadProductImage(file: File): Promise<string> {
  const ext  = file.name.split('.').pop() ?? 'jpg';
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(`Error al subir imagen: ${error.message}`);
  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

type ProductFormValues = z.infer<typeof productSchema>;

/**
 * URL absoluta del sitio público (Astro), sin `/` final.
 * Sin variable de entorno, en desarrollo se usa `http://localhost:4321` (`astro dev`).
 * Una ruta relativa como `/productos/...` se abriría en el host del ERP (Vite, p. ej. :7070) y daría 404.
 */
function resolvePublicCatalogOrigin(): string {
  const raw =
    typeof import.meta.env.VITE_PUBLIC_SITE_URL === 'string'
      ? import.meta.env.VITE_PUBLIC_SITE_URL.trim().replace(/\/+$/, '')
      : '';
  if (raw) return raw;
  if (import.meta.env.DEV) return 'http://localhost:4321';
  return '';
}

const PUBLIC_CATALOG_ORIGIN = resolvePublicCatalogOrigin();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(price: number, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(price);
}

// ─── Row action kebab menu ────────────────────────────────────────────────────

interface RowMenuProps {
  row:         Product;
  onEdit:      (row: Product) => void;
  onDelete:    (row: Product) => void;
  publicUrl?:  string;
}

function RowMenu({ row, onEdit, onDelete, publicUrl }: RowMenuProps) {
  const [open, setOpen]   = useState(false);
  const [pos,  setPos]    = useState<{ top: number; left: number } | null>(null);
  const menuRef           = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (open) { setOpen(false); return; }
    const rect    = e.currentTarget.getBoundingClientRect();
    const menuW   = 192;
    // prefer opening to the right; fall back to the left if near viewport edge
    const leftCandidate = rect.right + 4;
    const left = leftCandidate + menuW > window.innerWidth
      ? rect.left - menuW - 4
      : leftCandidate;
    setPos({ top: rect.bottom + 4, left: Math.max(8, left) });
    setOpen(true);
  };

  const itemCls = 'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors hover:bg-[color:var(--pragmata-surface-2)]';

  return (
    <>
      <button
        onClick={toggle}
        className="flex items-center justify-center w-8 h-8 rounded-md text-[color:var(--pragmata-muted)] hover:bg-[color:var(--pragmata-surface-2)] hover:text-[color:var(--pragmata-fg)] transition-colors"
        title="Acciones"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && pos && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, minWidth: 192 }}
          className="bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg shadow-xl py-1 text-sm overflow-hidden"
        >
          <button
            onClick={() => { setOpen(false); onEdit(row); }}
            className={`${itemCls} text-[color:var(--pragmata-fg)]`}
          >
            <Edit2 className="w-4 h-4 text-[color:var(--pragmata-muted)]" />
            Editar
          </button>
          {publicUrl && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className={`${itemCls} text-[color:var(--pragmata-fg)] no-underline`}
            >
              <ExternalLink className="w-4 h-4 text-[color:var(--pragmata-muted)]" />
              Ver en sitio público
            </a>
          )}
          <div className="my-1 border-t border-[color:var(--pragmata-border)]" />
          <button
            onClick={() => { setOpen(false); onDelete(row); }}
            className={`${itemCls} text-[color:var(--pragmata-danger,#ef4444)]`}
          >
            <Trash2 className="w-4 h-4" />
            Eliminar
          </button>
        </div>
      )}
    </>
  );
}

// ─── Product Form Modal ───────────────────────────────────────────────────────

interface ProductFormModalProps {
  product:   Product | null;
  onSave:    (values: Partial<Product>) => Promise<void>;
  onClose:   () => void;
  saving:    boolean;
}

function ProductFormModal({ product, onSave, onClose, saving }: ProductFormModalProps) {
  const isEditing = !!product;

  // Image upload state
  const [imagePreview, setImagePreview]     = useState<string | null>(product?.image_url ?? null);
  const [imageFile, setImageFile]           = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name:             product?.name             ?? '',
      slug:             product?.slug             ?? '',
      description:      product?.description      ?? '',
      category:         product?.category         ?? '',
      price:            product?.price            ?? 0,
      compare_at_price: product?.compare_at_price ?? null,
      currency:         product?.currency         ?? 'MXN',
      in_stock:         product?.in_stock         ?? true,
      stock_qty:        product?.stock_qty        ?? null,
    },
  });

  const nameValue = watch('name');

  const autoSlug = useCallback(() => {
    if (!isEditing) setValue('slug', slugify(nameValue));
  }, [isEditing, nameValue, setValue]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onSubmit = handleSubmit(async (values) => {
    let image_url = imagePreview && !imageFile ? imagePreview : null;

    if (imageFile) {
      setUploadingImage(true);
      try {
        image_url = await uploadProductImage(imageFile);
      } catch (err) {
        console.error(err);
        setUploadingImage(false);
        return;
      }
      setUploadingImage(false);
    }

    const payload: Partial<Product> = {
      ...(product?.id ? { id: product.id, version: product.version } : {}),
      ...values,
      image_url,
      compare_at_price: values.compare_at_price ?? null,
      stock_qty:        values.stock_qty ?? null,
    };
    await onSave(payload);
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
            {isEditing ? 'Editar producto' : 'Nuevo producto'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '1.25rem', lineHeight: 1 }}>×</button>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Name */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: 4 }}>
              Nombre del producto <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              {...register('name')}
              onBlur={autoSlug}
              placeholder="Ej: Consultoría Premium"
              style={inputStyle}
            />
            {errors.name && <p style={errorStyle}>{errors.name.message}</p>}
          </div>

          {/* Slug */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: 4 }}>
              Slug (URL) <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input {...register('slug')} placeholder="consultoria-premium" style={inputStyle} />
            {errors.slug && <p style={errorStyle}>{errors.slug.message}</p>}
          </div>

          {/* Category */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: 4 }}>Categoría</label>
            <input {...register('category')} placeholder="Servicios" style={inputStyle} />
          </div>

          {/* Price + Compare */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                Precio <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input {...register('price')} type="number" step="0.01" placeholder="299.00" style={inputStyle} />
              {errors.price && <p style={errorStyle}>{errors.price.message}</p>}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: 4 }}>Precio anterior</label>
              <input {...register('compare_at_price')} type="number" step="0.01" placeholder="399.00" style={inputStyle} />
            </div>
          </div>

          {/* Currency */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: 4 }}>Moneda</label>
            <select {...register('currency')} style={inputStyle}>
              <option value="MXN">MXN — Peso mexicano</option>
              <option value="USD">USD — Dólar</option>
              <option value="EUR">EUR — Euro</option>
            </select>
          </div>

          {/* Stock */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input {...register('in_stock')} type="checkbox" style={{ width: 16, height: 16 }} />
                <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#374151' }}>En stock</span>
              </label>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: 4 }}>Cantidad en stock</label>
              <input {...register('stock_qty')} type="number" placeholder="∞" style={inputStyle} />
            </div>
          </div>

          {/* Image upload */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: 8 }}>
              Imagen del producto
            </label>

            {imagePreview ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img
                  src={imagePreview}
                  alt="Vista previa"
                  style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb', display: 'block' }}
                />
                <button
                  type="button"
                  onClick={removeImage}
                  style={{ position: 'absolute', top: 6, right: 6, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '50%', width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
                >
                  <X size={13} style={{ color: '#6b7280' }} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{ width: '100%', padding: '24px 0', border: '2px dashed #d1d5db', borderRadius: 8, background: '#f9fafb', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#6b7280' }}
              >
                <Upload size={22} />
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Subir imagen</span>
                <span style={{ fontSize: '0.75rem' }}>JPG, PNG, WebP · máx. 5 MB</span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />

            {imagePreview && !imageFile && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{ marginTop: 8, fontSize: '0.8125rem', color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Cambiar imagen
              </button>
            )}
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: 4 }}>Descripción</label>
            <textarea
              {...register('description')}
              rows={3}
              placeholder="Describe el producto: beneficios, características, garantías..."
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>Cancelar</button>
            <button type="submit" disabled={saving || uploadingImage} style={saveBtnStyle}>
              {uploadingImage ? 'Subiendo imagen...' : saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ product, onConfirm, onClose }: { product: Product; onConfirm: () => void; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '28px', maxWidth: '400px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 8px' }}>¿Eliminar producto?</h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0 0 24px' }}>
          Se eliminará <strong>{product.name}</strong>. Esta acción no se puede deshacer.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancelar</button>
          <button onClick={onConfirm} style={{ ...saveBtnStyle, background: '#ef4444' }}>Eliminar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  if (!ECOMMERCE_ENABLED) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', color: '#6b7280' }}>
        <Package size={48} style={{ marginBottom: 16, opacity: 0.4 }} />
        <h2 style={{ margin: '0 0 8px', fontSize: '1.125rem', fontWeight: 600, color: '#111' }}>E-commerce desactivado</h2>
        <p style={{ margin: 0, fontSize: '0.875rem' }}>
          Activa <code>VITE_ENABLE_ECOMMERCE=true</code> en tu <code>.env</code> para gestionar productos.
        </p>
      </div>
    );
  }

  const { data: products, loading, error, upsert, softDelete } = useProducts();
  const [formProduct, setFormProduct] = useState<Product | null | 'new'>('new' as unknown as null);
  const [showForm, setShowForm]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [saving, setSaving]           = useState(false);

  const openCreate = () => { setFormProduct(null); setShowForm(true); };
  const openEdit   = (p: Product) => { setFormProduct(p); setShowForm(true); };
  const closeForm  = () => { setFormProduct(null); setShowForm(false); };

  const handleSave = useCallback(async (values: Partial<Product>) => {
    setSaving(true);
    await upsert(values as Partial<Product> & Record<string, unknown>);
    setSaving(false);
    closeForm();
  }, [upsert]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await softDelete(deleteTarget.id, deleteTarget.version);
    setDeleteTarget(null);
  }, [deleteTarget, softDelete]);

  // ── DataTable columns ──────────────────────────────────────────────────────
  // Rules:
  //   - Use `header` (not `label`) for the column title
  //   - render signature: (cellValue, fullRow) — always use the 2nd arg when you need the full row
  //   - Action buttons go in the `actions` prop of DataTable, NOT as a column
  const columns = useMemo((): ColumnDef<Product>[] => [
    {
      key:      'image_url',
      header:   'Imagen',
      sortable: false,
      filterable: false,
      width:    72,
      render: (_val, row) =>
        row.image_url
          ? <img src={row.image_url} alt={row.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }} />
          : <div style={{ width: 40, height: 40, background: '#f3f4f6', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>🛍️</div>,
    },
    {
      key:    'name',
      header: 'Nombre',
      width:  200,
      render: (_val, row) => (
        <div>
          <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{row.name}</span>
          <br />
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{row.slug}</span>
        </div>
      ),
    },
    { key: 'category', header: 'Categoría', width: 140 },
    {
      key:    'price',
      header: 'Precio',
      width:  160,
      render: (_val, row) => (
        <div>
          <span style={{ fontWeight: 600 }}>{formatPrice(row.price, row.currency)}</span>
          {row.compare_at_price && (
            <span style={{ fontSize: '0.75rem', color: '#9ca3af', textDecoration: 'line-through', marginLeft: 4 }}>
              {formatPrice(row.compare_at_price, row.currency)}
            </span>
          )}
        </div>
      ),
    },
    {
      key:    'in_stock',
      header: 'Stock',
      width:  140,
      render: (_val, row) => (
        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: row.in_stock ? '#d1fae5' : '#fee2e2', color: row.in_stock ? '#065f46' : '#991b1b' }}>
          {row.in_stock ? (row.stock_qty != null ? `${row.stock_qty} unid.` : 'En stock') : 'Sin stock'}
        </span>
      ),
    },
    {
      key:    'status',
      header: 'Estado',
      width:  110,
      render: (_val, row) => (
        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: row.status === 'active' ? '#ede9fe' : '#f3f4f6', color: row.status === 'active' ? '#5b21b6' : '#6b7280' }}>
          {row.status === 'active' ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
  ], []);

  // ── Row actions (3-dot menu) ───────────────────────────────────────────────
  const rowActions = useCallback((row: Product) => (
    <RowMenu
      row={row}
      onEdit={openEdit}
      onDelete={setDeleteTarget}
      publicUrl={
        PUBLIC_CATALOG_ORIGIN
          ? `${PUBLIC_CATALOG_ORIGIN}/productos/${encodeURIComponent(row.slug)}`
          : undefined
      }
    />
  ), [openEdit]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Package size={22} style={{ color: '#7c3aed' }} />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Catálogo de productos</h1>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#6b7280' }}>
              {products.length} producto{products.length !== 1 ? 's' : ''} · Los cambios se reflejan en el sitio público
            </p>
          </div>
        </div>
        <button onClick={openCreate} style={saveBtnStyle}>
          <Plus size={16} /> Nuevo producto
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#991b1b', fontSize: '0.875rem', marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>Cargando productos...</div>
      ) : (
        <DataTable<Product>
          data={products}
          columns={columns}
          rowKey="id"
          actions={rowActions}
          emptyMessage="No hay productos aún."
          emptyDescription="Crea tu primer producto con el botón '+ Nuevo producto'."
        />
      )}

      {/* Form modal */}
      {showForm && (
        <ProductFormModal
          product={formProduct as Product | null}
          onSave={handleSave}
          onClose={closeForm}
          saving={saving}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <DeleteConfirm
          product={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

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
  gap: 6,
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
  gap: 6,
  padding: '8px 18px',
  background: '#f3f4f6',
  color: '#374151',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
};
