import type { AuditBase } from '@/types/core/base';

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';

/**
 * Order — canonical model for public.orders
 * Notes:
 * - This table doesn't implement full AuditBase (no status/deleted_at/created_by),
 *   but we keep the canonical type here for UI consistency.
 */
export interface Order extends Pick<AuditBase, 'id' | 'created_at' | 'updated_at' | 'version'> {
  stripe_session_id: string | null;
  stripe_payment_id: string | null;
  amount_total: number;
  currency: string;
  order_status: OrderStatus;
  paid_at: string | null;
  customer_email: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_user_id: string | null;
  metadata: Record<string, unknown>;
}

