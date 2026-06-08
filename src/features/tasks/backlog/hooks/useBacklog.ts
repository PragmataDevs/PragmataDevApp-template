import { useMemo } from 'react';
import type { BacklogItem } from '../types/backlog';
import { useTasks } from '../../hooks/useTasks';

export function useBacklog() {
  const { tasks } = useTasks();

  const backlogItems: BacklogItem[] = useMemo(() => {
    return tasks
      .filter((t) => t.status === 'backlog')
      .map((t) => ({
        id: t.id,
        task_id: t.id,
        priority: (t as any).priority ?? 'medium',
        estimated_effort: (t as any).estimated_effort ?? null,
        business_value: (t as any).business_value ?? null,
        notes: (t as any).notes ?? null,
        created_at: t.created_at,
      }));
  }, [tasks]);

  return { backlogItems };
}
