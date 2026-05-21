import type { AuditBase, UUID } from '@/types/core/base';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type TaskStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'review'
  | 'done';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

// ---------------------------------------------------------------------------
// Kanban column metadata (UI-only, no va a DB)
// ---------------------------------------------------------------------------

export interface KanbanColumnDef {
  id: TaskStatus;
  label: string;
  color: string;       // Tailwind text-* class
  bgColor: string;     // Tailwind bg-* class
  borderColor: string; // Tailwind border-* class
}

export const KANBAN_COLUMNS: KanbanColumnDef[] = [
  { id: 'backlog',     label: 'Backlog',      color: 'text-slate-600',  bgColor: 'bg-slate-100',  borderColor: 'border-slate-200' },
  { id: 'todo',        label: 'Por Hacer',    color: 'text-blue-600',   bgColor: 'bg-blue-50',    borderColor: 'border-blue-200'  },
  { id: 'in_progress', label: 'En Progreso',  color: 'text-amber-600',  bgColor: 'bg-amber-50',   borderColor: 'border-amber-200' },
  { id: 'review',      label: 'En Revisión',  color: 'text-purple-600', bgColor: 'bg-purple-50',  borderColor: 'border-purple-200'},
  { id: 'done',        label: 'Listo',        color: 'text-emerald-600',bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200'},
];

export const PRIORITY_META: Record<TaskPriority, { label: string; color: string; dot: string }> = {
  low:      { label: 'Baja',     color: 'text-slate-500',  dot: 'bg-slate-400'   },
  medium:   { label: 'Media',    color: 'text-blue-500',   dot: 'bg-blue-400'    },
  high:     { label: 'Alta',     color: 'text-amber-500',  dot: 'bg-amber-400'   },
  critical: { label: 'Crítica',  color: 'text-red-500',    dot: 'bg-red-500'     },
};

// ---------------------------------------------------------------------------
// Task model
// ---------------------------------------------------------------------------

export interface Task extends AuditBase {
  entity_id:    UUID;
  title:        string;
  description:  string | null;
  assigned_to:  UUID | null;
  due_date:     string | null;     // ISO date 'YYYY-MM-DD'
  priority:     TaskPriority;
  task_status:  TaskStatus;
  column_order: number;            // fractional index (float)
  tags:         string[] | null;
  metadata:     Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// TaskComment model
// ---------------------------------------------------------------------------

export interface TaskComment extends AuditBase {
  task_id: UUID;
  body:    string;
}

// ---------------------------------------------------------------------------
// Input types (derivados del modelo, sin AuditBase fields)
// ---------------------------------------------------------------------------

export type TaskInput = Pick<Task,
  | 'title'
  | 'description'
  | 'priority'
  | 'task_status'
  | 'due_date'
  | 'assigned_to'
  | 'tags'
> & { entity_id: UUID };

export type TaskUpdateInput = Partial<TaskInput>;

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

export function createEmptyTask(
  entityId: UUID,
  userId: UUID,
  columnStatus: TaskStatus = 'backlog',
  baseOrder = 0,
): Task {
  return {
    id:           crypto.randomUUID(),
    created_at:   new Date().toISOString(),
    updated_at:   new Date().toISOString(),
    created_by:   userId,
    updated_by:   userId,
    version:      0,
    status:       'active',
    deleted_at:   null,
    entity_id:    entityId,
    title:        '',
    description:  null,
    assigned_to:  null,
    due_date:     null,
    priority:     'medium',
    task_status:  columnStatus,
    column_order: baseOrder,
    tags:         null,
    metadata:     null,
  };
}
