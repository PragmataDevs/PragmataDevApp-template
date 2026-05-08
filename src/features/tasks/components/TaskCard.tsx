import { memo } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { Calendar, User, Tag, Pencil, Trash2 } from 'lucide-react';
import type { Task } from '@/types/tasks/task';
import { PRIORITY_META } from '@/types/tasks/task';

interface TaskCardProps {
  task:     Task;
  index:    number;
  onEdit:   (task: Task) => void;
  onDelete: (task: Task) => void;
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
}

export const TaskCard = memo(function TaskCard({
  task,
  index,
  onEdit,
  onDelete,
}: TaskCardProps) {
  const priority   = PRIORITY_META[task.priority];
  const overdue    = isOverdue(task.due_date);

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`
            group bg-white rounded-pragmata border p-3 shadow-sm
            transition-shadow cursor-grab active:cursor-grabbing
            ${snapshot.isDragging
              ? 'shadow-lg border-[color:var(--pragmata-accent)] rotate-1'
              : 'border-slate-200 hover:border-slate-300 hover:shadow-md'}
          `}
        >
          {/* Title + actions */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-sm font-medium text-slate-900 leading-snug flex-1 min-w-0">
              {task.title}
            </p>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button
                onClick={() => onEdit(task)}
                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                title="Editar"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(task)}
                className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                title="Eliminar"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Description snippet */}
          {task.description && (
            <p className="text-xs text-slate-500 mb-2 line-clamp-2 leading-relaxed">
              {task.description}
            </p>
          )}

          {/* Tags */}
          {task.tags && task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {task.tags.slice(0, 3).map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-medium"
                >
                  <Tag className="w-2.5 h-2.5" />
                  {tag}
                </span>
              ))}
              {task.tags.length > 3 && (
                <span className="inline-flex items-center px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded text-[10px]">
                  +{task.tags.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Footer: priority + assigned + due date */}
          <div className="flex items-center justify-between gap-2 mt-1">
            {/* Priority badge */}
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase ${priority.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priority.dot}`} />
              {priority.label}
            </span>

            <div className="flex items-center gap-2">
              {/* Assignee */}
              {task.assigned_to && (
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  <User className="w-3 h-3" />
                </span>
              )}

              {/* Due date */}
              {task.due_date && (
                <span className={`flex items-center gap-1 text-[10px] font-medium
                  ${overdue ? 'text-red-500' : 'text-slate-400'}`}
                >
                  <Calendar className="w-3 h-3" />
                  {formatDate(task.due_date)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
});
