import { useMemo } from 'react';
import type { BacklogItem } from '../types/backlog';
import { useTasks } from '../../hooks/useTasks';

/**
 * Backlog = tareas de la entidad con task_status 'backlog'.
 * Campos de refinamiento (estimated_effort, business_value, notes) viven en
 * task.metadata hasta que se promuevan a columnas propias.
 */
export function useBacklog(entityId: string | undefined) {
  const { tasks } = useTasks(entityId);

  const backlogItems: BacklogItem[] = useMemo(() => {
    return tasks
      .filter((t) => t.task_status === 'backlog' && t.status === 'active')
      .map((t) => ({
        id: t.id,
        task_id: t.id,
        priority: t.priority,
        estimated_effort: typeof t.metadata?.estimated_effort === 'number' ? t.metadata.estimated_effort : null,
        business_value: typeof t.metadata?.business_value === 'number' ? t.metadata.business_value : null,
        notes: typeof t.metadata?.notes === 'string' ? t.metadata.notes : null,
        created_at: t.created_at,
      }));
  }, [tasks]);

  return { backlogItems };
}
