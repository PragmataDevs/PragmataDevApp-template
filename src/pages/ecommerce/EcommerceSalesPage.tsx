import { useEffect, useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { supabase } from '@/lib/supabase';
import type { Order } from '@/types/ecommerce/order';

const ECOMMERCE_ENABLED = import.meta.env.VITE_ENABLE_ECOMMERCE === 'true';

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: currency.toUpperCase() }).format(amount);
  } catch {
    return `${Number(amount ?? 0).toFixed(2)} ${currency}`;
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-MX', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function EcommerceSalesPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!ECOMMERCE_ENABLED) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (err) setError(err.message);
      setOrders((data ?? []) as Order[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const columns = useMemo<ColumnDef<Order>[]>(() => ([
    {
      key: 'created_at',
      header: 'Fecha',
      width: 190,
      render: (val) => val ? formatDate(String(val)) : '—',
    },
    {
      key: 'customer_email',
      header: 'Cliente',
      width: 240,
    },
    {
      key: 'amount_total',
      header: 'Total',
      width: 140,
      render: (val, row) => formatMoney(Number(val ?? 0), row.currency ?? 'mxn'),
    },
    {
      key: 'order_status',
      header: 'Estado',
      width: 120,
      render: (val) => {
        const s = String(val ?? '');
        const map: Record<string, string> = {
          pending: 'Pendiente',
          paid: 'Pagado',
          failed: 'Fallido',
          refunded: 'Reembolsado',
          cancelled: 'Cancelado',
        };
        return map[s] ?? s;
      },
    },
    {
      key: 'stripe_session_id',
      header: 'Stripe Session',
      width: 220,
      render: (val) => val ? String(val).slice(0, 18) + '…' : '—',
    },
  ]), []);

  if (!ECOMMERCE_ENABLED) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="rounded-pragmata border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] p-6">
          <div className="text-[color:var(--pragmata-fg)] font-semibold">Ecommerce desactivado</div>
          <p className="mt-2 text-sm text-[color:var(--pragmata-muted)]">
            Activa <code className="rounded bg-[color:var(--pragmata-surface-2)] px-1">VITE_ENABLE_ECOMMERCE=true</code> en tu <code>.env</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[color:var(--pragmata-fg)] flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[color:var(--pragmata-accent)]" />
            Ventas
          </h1>
          <p className="text-sm text-[color:var(--pragmata-muted)]">Listado de pedidos (últimos 500).</p>
        </div>
      </div>

      {error && (
        <div className="rounded-pragmata border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Error cargando ventas: {error}
        </div>
      )}

      <DataTable<Order>
        data={orders}
        columns={columns}
        rowKey="id"
        loading={loading}
        stickyColumns={0}
        emptyMessage="Sin ventas aún."
        emptyDescription="Cuando entren pedidos (Stripe webhook), aparecerán aquí."
      />
    </div>
  );
}

