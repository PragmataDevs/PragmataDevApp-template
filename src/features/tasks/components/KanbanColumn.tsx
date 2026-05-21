import { memo } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import { Plus } from 'lucide-react';
import type { Task, TaskStatus, KanbanColumnDef } from '@/features/tasks/types/task';
import { TaskCard } from './TaskCard';

interface KanbanColumnProps {
  column:   KanbanColumnDef;
  tasks:    Task[];
  onAdd:    (status: TaskStatus) => void;
  onEdit:   (task: Task) => void;
  onDelete: (task: Task) => void;
}

export const KanbanColumn = memo(function KanbanColumn({
  column,
  tasks,
  onAdd,
  onEdit,
  onDelete,
}: KanbanColumnProps) {
  return (
    <div className="flex flex-col w-72 min-w-[18rem] flex-shrink-0">
      {/* Column header */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-pragmata border-t-2 ${column.bgColor} ${column.borderColor}`}>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${column.color}`}>
            {column.label}
          </span>
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${column.bgColor} ${column.color} border ${column.borderColor}`}>
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAdd(column.id)}
          className={`p-1 rounded hover:bg-white/70 transition-colors ${column.color}`}
          title={`Agregar tarea en ${column.label}`}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Droppable area */}
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`
              flex-1 min-h-[120px] flex flex-col gap-2 p-2
              rounded-b-pragmata border border-t-0 transition-colors
              ${snapshot.isDraggingOver
                ? `${column.bgColor} ${column.borderColor}`
                : 'bg-slate-50 border-slate-200'}
            `}
          >
            {tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
            {provided.placeholder}

            {/* Empty state */}
            {tasks.length === 0 && !snapshot.isDraggingOver && (
              <div
                onClick={() => onAdd(column.id)}
                className="flex-1 flex items-center justify-center text-xs text-slate-400 cursor-pointer hover:text-slate-500 py-4 border-2 border-dashed border-slate-200 rounded-pragmata transition-colors hover:border-slate-300"
              >
                + Agregar tarea
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
});
