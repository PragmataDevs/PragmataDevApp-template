import { useCrudResource } from '@/lib/hooks/useCrudResource';
import type { Product } from '@/types/products/product';

export function useProducts() {
  return useCrudResource<Product>({
    table:   'products',
    select:  '*',
    filter:  (q) => q.eq('status', 'active'),
    orderBy: { column: 'name', ascending: true },
    realtime: true,
  });
}
