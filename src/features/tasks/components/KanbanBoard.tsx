import { useCallback, useState } from 'react';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import type { Task, TaskStatus } from '@/types/tasks/task';
import { KANBAN_COLUMNS } from '@/types/tasks/task';
import { KanbanColumn } from './KanbanColumn';
import type { UseTasks } from './types';

interface KanbanBoardProps {
  hook:      UseTasks;
  onAdd:     (status: TaskStatus) => void;
  onEdit:    (task: Task) => void;
  onDelete:  (task: Task) => void;
}

export function KanbanBoard({ hook, onAdd, onEdit, onDelete }: KanbanBoardProps) {
  const { loading, error, getColumn, moveTask, refreshTasks } = hook;
  const [isMoving, setMoving] = useState(false);

  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    setMoving(true);
    await moveTask(draggableId, destination.droppableId as TaskStatus, destination.index);
    setMoving(false);
  }, [moveTask]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span className="text-sm">Cargando tareas…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-red-500">
        <AlertCircle className="w-8 h-8" />
        <p className="text-sm font-medium">{error}</p>
        <button
          onClick={refreshTasks}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {isMoving && (
        <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] z-10 rounded-pragmata pointer-events-none" />
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[calc(100vh-240px)]">
          {KANBAN_COLUMNS.map(col => (
            <KanbanColumn
              key={col.id}
              column={col}
              tasks={getColumn(col.id)}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
