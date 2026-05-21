import { useCrudResource } from '@/lib/hooks/useCrudResource';
import type { Product } from '@/features/products/types/product';

export function useProducts() {
  return useCrudResource<Product>({
    table:   'products',
    select:  '*',
    filter:  (q) => q.eq('status', 'active'),
    orderBy: { column: 'name', ascending: true },
    realtime: true,
  });
}
