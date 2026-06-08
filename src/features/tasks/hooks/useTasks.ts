import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { Task, TaskInput, TaskUpdateInput, TaskStatus } from '@/features/tasks/types/task';

// ---------------------------------------------------------------------------
// Fractional index helpers (midpoint algorithm)
// ---------------------------------------------------------------------------

function orderBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return 1000;
  if (prev === null) return (next as number) / 2;
  if (next === null) return prev + 1000;
  return (prev + next) / 2;
}

function getTasksForColumn(tasks: Task[], columnId: TaskStatus): Task[] {
  return tasks
    .filter(t => t.task_status === columnId && t.status === 'active')
    .sort((a, b) => a.column_order - b.column_order);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseTasksState {
  tasks:     Task[];
  loading:   boolean;
  error:     string | null;
}

interface UseTasksReturn extends UseTasksState {
  createTask:    (input: TaskInput) => Promise<Task | null>;
  updateTask:    (id: string, input: TaskUpdateInput, currentVersion: number) => Promise<boolean>;
  deleteTask:    (id: string, currentVersion: number) => Promise<boolean>;
  moveTask:      (taskId: string, toStatus: TaskStatus, position: number) => Promise<void>;
  refreshTasks:  () => Promise<void>;
  getColumn:     (status: TaskStatus) => Task[];
}

export function useTasks(entityId: string | undefined): UseTasksReturn {
  const { user, sessionEpoch } = useAuth();
  const [state, setState] = useState<UseTasksState>({
    tasks:   [],
    loading: false,
    error:   null,
  });

  const abortRef = useRef<AbortController | null>(null);

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------

  const fetchTasks = useCallback(async () => {
    if (!entityId || !user) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setState(s => ({ ...s, loading: true, error: null }));

    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('entity_id', entityId)
        .eq('status', 'active')
        .order('column_order', { ascending: true });

      if (ac.signal.aborted) return;
      if (error) throw error;

      setState({ tasks: data as Task[], loading: false, error: null });
    } catch (err: unknown) {
      if (ac.signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'Error al cargar tareas';
      setState(s => ({ ...s, loading: false, error: msg }));
    }
  }, [entityId, user]);

  useEffect(() => {
    fetchTasks();
    return () => { abortRef.current?.abort(); };
  }, [fetchTasks, sessionEpoch]);

  // Realtime subscription
  useEffect(() => {
    if (!entityId || !user) return;

    const channel = supabase
      .channel(`tasks:${entityId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `entity_id=eq.${entityId}`,
      }, () => {
        fetchTasks();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [entityId, user, fetchTasks]);

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  const createTask = useCallback(async (input: TaskInput): Promise<Task | null> => {
    if (!user?.id) return null;

    const tasksInColumn = getTasksForColumn(state.tasks, input.task_status);
    const lastOrder = tasksInColumn.at(-1)?.column_order ?? null;
    const column_order = orderBetween(lastOrder, null);

    const payload = {
      ...input,
      description:  input.description || null,
      assigned_to:  input.assigned_to  || null,
      due_date:     input.due_date     || null,
      tags:         input.tags         || null,
      column_order,
      created_by:   user.id,
      updated_by:   user.id,
    };

    const { data, error } = await supabase
      .from('tasks')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[useTasks] createTask:', error);
      toast.error('Error al crear la tarea');
      return null;
    }

    setState(s => ({ ...s, tasks: [...s.tasks, data as Task] }));
    toast.success('Tarea creada exitosamente');
    return data as Task;
  }, [user, state.tasks]);

  const updateTask = useCallback(async (
    id: string,
    input: TaskUpdateInput,
    currentVersion: number,
  ): Promise<boolean> => {
    if (!user?.id) return false;

    const { data, error } = await supabase
      .from('tasks')
      .update({ ...input, updated_by: user.id })
      .eq('id', id)
      .eq('version', currentVersion)   // OCC
      .select()
      .single();

    if (error || !data) {
      if (!error) console.warn('[useTasks] OCC conflict on task', id);
      else console.error('[useTasks] updateTask:', error);
      toast.error('Error al actualizar la tarea');
      return false;
    }

    setState(s => ({
      ...s,
      tasks: s.tasks.map(t => t.id === id ? (data as Task) : t),
    }));
    return true;
  }, [user]);

  const deleteTask = useCallback(async (
    id: string,
    currentVersion: number,
  ): Promise<boolean> => {
    if (!user?.id) return false;

    const { data, error } = await supabase
      .from('tasks')
      .update({
        status:     'deleted',
        deleted_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq('id', id)
      .eq('version', currentVersion)
      .select()
      .single();

    if (error || !data) return false;

    setState(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== id) }));
    toast.success('Tarea eliminada exitosamente');
    return true;
  }, [user]);

  // -------------------------------------------------------------------------
  // Kanban Move (drag & drop)
  //   position: index dentro de la columna destino
  // -------------------------------------------------------------------------

  const moveTask = useCallback(async (
    taskId: string,
    toStatus: TaskStatus,
    position: number,
  ): Promise<void> => {
    if (!user?.id) return;

    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const colTasks = getTasksForColumn(state.tasks, toStatus).filter(t => t.id !== taskId);
    const prev = colTasks[position - 1]?.column_order ?? null;
    const next = colTasks[position]?.column_order ?? null;
    const column_order = orderBetween(prev, next);

    // Optimistic update
    setState(s => ({
      ...s,
      tasks: s.tasks.map(t =>
        t.id === taskId ? { ...t, task_status: toStatus, column_order } : t
      ),
    }));

    const { error } = await supabase
      .from('tasks')
      .update({
        task_status:  toStatus,
        column_order,
        updated_by:   user.id,
      })
      .eq('id', taskId)
      .eq('version', task.version);

    if (error) {
      console.error('[useTasks] moveTask:', error);
      toast.error('Error al mover la tarea. Reintentando...');
      await fetchTasks(); // revert to server state
    }
  }, [user, state.tasks, fetchTasks]);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const getColumn = useCallback(
    (status: TaskStatus) => getTasksForColumn(state.tasks, status),
    [state.tasks],
  );

  return {
    ...state,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    refreshTasks: fetchTasks,
    getColumn,
  };
}
