import { useEffect, useMemo, useState } from 'react';
import { ShoppingCart, CreditCard, AlertTriangle, Package } from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { supabase } from '@/lib/supabase';
import type { Order } from '@/features/ecommerce/types/order';

const ECOMMERCE_ENABLED = import.meta.env.VITE_ENABLE_ECOMMERCE === 'true';

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: currency.toUpperCase() }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export default function EcommerceDashboardPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  // Arranca en `false` cuando el módulo está apagado: no hay nada que cargar, así
  // que no hay por qué pintar un spinner y apagarlo con un setState dentro del
  // efecto. El estado inicial ya sabe la respuesta.
  const [loading, setLoading] = useState(ECOMMERCE_ENABLED);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!ECOMMERCE_ENABLED) return;
    (async () => {
      const { data, error: err } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(250);
      if (cancelled) return;
      if (err) setError(err.message);
      setOrders((data ?? []) as Order[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const kpis = useMemo(() => {
    const paid = orders.filter(o => o.order_status === 'paid');
    const pending = orders.filter(o => o.order_status === 'pending');
    const failed = orders.filter(o => o.order_status === 'failed');
    const revenue = paid.reduce((sum, o) => sum + Number(o.amount_total ?? 0), 0);
    const currency = paid[0]?.currency ?? orders[0]?.currency ?? 'mxn';
    return {
      totalOrders: orders.length,
      paidCount: paid.length,
      pendingCount: pending.length,
      failedCount: failed.length,
      revenueFormatted: formatMoney(revenue, currency),
    };
  }, [orders]);

  if (!ECOMMERCE_ENABLED) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="rounded-pragmata border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] p-6">
          <div className="flex items-center gap-2 text-[color:var(--pragmata-fg)] font-semibold">
            <ShoppingCart className="w-5 h-5 text-[color:var(--pragmata-accent)]" />
            Ecommerce desactivado
          </div>
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
          <h1 className="text-2xl font-extrabold tracking-tight text-[color:var(--pragmata-fg)]">Ecommerce</h1>
          <p className="text-sm text-[color:var(--pragmata-muted)]">Resumen operativo de ventas y pedidos.</p>
        </div>
      </div>

      {error && (
        <div className="rounded-pragmata border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Error cargando pedidos: {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Pedidos (total)"
          value={kpis.totalOrders}
          icon={<ShoppingCart className="w-5 h-5" />}
          href="/ecommerce/sales"
          loading={loading}
        />
        <KPICard
          label="Pagados"
          value={kpis.paidCount}
          icon={<CreditCard className="w-5 h-5" />}
          color="success"
          href="/ecommerce/sales"
          loading={loading}
        />
        <KPICard
          label="Pendientes"
          value={kpis.pendingCount}
          icon={<Package className="w-5 h-5" />}
          color="warning"
          href="/ecommerce/sales"
          loading={loading}
        />
        <KPICard
          label="Ingresos (pagados)"
          value={kpis.revenueFormatted}
          icon={<AlertTriangle className="w-5 h-5" />}
          href="/ecommerce/sales"
          loading={loading}
        />
      </div>
    </div>
  );
}

