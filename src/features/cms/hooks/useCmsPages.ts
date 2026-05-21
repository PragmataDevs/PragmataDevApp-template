import { useCrudResource } from '@/lib/hooks/useCrudResource';
import type { CmsPage } from '@/features/cms/types/cms-page';

export function useCmsPages(enabled = true) {
  return useCrudResource<CmsPage>({
    table:    'cms_pages',
    select:   '*',
    filter:   (q) => q.eq('status', 'active'),
    orderBy:  { column: 'slug', ascending: true },
    realtime: true,
    enabled,
  });
}
