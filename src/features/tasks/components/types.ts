import type { Task, TaskStatus } from '@/features/tasks/types/task';

/** Shape of useTasks return that KanbanBoard needs */
export interface UseTasks {
  tasks:        Task[];
  loading:      boolean;
  error:        string | null;
  getColumn:    (status: TaskStatus) => Task[];
  moveTask:     (taskId: string, toStatus: TaskStatus, position: number) => Promise<void>;
  refreshTasks: () => Promise<void>;
}
