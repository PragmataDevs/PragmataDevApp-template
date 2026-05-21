/**
 * TasksReport — Ejemplo canónico del patrón PDF de Pragmata.
 *
 * Usa PrintButton + buildPrintTable para generar un reporte imprimible
 * de las tareas de una entidad. Sin dependencias extra.
 *
 * Cómo integrarlo en TasksPage:
 *   import { TasksReport } from './TasksReport';
 *   <TasksReport tasks={hook.tasks} entityName="Obra Centro" />
 *
 * Para PDFs programáticos (facturas con logo, etc.) ver:
 *   docs/ai/setup.md — sección @react-pdf/renderer
 */

import { PrintButton, buildPrintTable } from '@/components/ui/PrintButton';
import type { Task } from '@/features/tasks/types/task';

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Crítica',
  high:     'Alta',
  medium:   'Media',
  low:      'Baja',
};

const STATUS_LABELS: Record<string, string> = {
  backlog:     'Backlog',
  todo:        'Por hacer',
  in_progress: 'En progreso',
  review:      'En revisión',
  done:        'Completada',
};

interface TasksReportProps {
  tasks: Task[];
  entityName?: string;
  variant?: 'default' | 'ghost' | 'icon';
}

export function TasksReport({ tasks, entityName, variant = 'ghost' }: TasksReportProps) {
  const buildHtml = () => {
    const activeTasks   = tasks.filter(t => t.task_status !== 'done');
    const doneTasks     = tasks.filter(t => t.task_status === 'done');

    const columns = [
      {
        key: 'title',
        header: 'Tarea',
      },
      {
        key: 'task_status',
        header: 'Estado',
        format: (val: unknown) => STATUS_LABELS[val as string] ?? String(val),
      },
      {
        key: 'priority',
        header: 'Prioridad',
        format: (val: unknown) => PRIORITY_LABELS[val as string] ?? String(val),
      },
      {
        key: 'due_date',
        header: 'Vencimiento',
        format: (val: unknown) => {
          if (!val) return '—';
          return new Date(val as string).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
        },
      },
    ];

    let html = '';

    if (activeTasks.length > 0) {
      html += '<h2 style="font-size:13px;font-weight:600;color:#0B1220;margin:0 0 8px;">Tareas activas</h2>';
      html += buildPrintTable({
        columns,
        rows: activeTasks as unknown as Record<string, unknown>[],
        summary: `${activeTasks.length} tareas activas`,
      });
    }

    if (doneTasks.length > 0) {
      html += '<h2 style="font-size:13px;font-weight:600;color:#0B1220;margin:20px 0 8px;">Completadas</h2>';
      html += buildPrintTable({
        columns,
        rows: doneTasks as unknown as Record<string, unknown>[],
        summary: `${doneTasks.length} tareas completadas`,
      });
    }

    if (!html) {
      html = '<p style="color:#5A6B85;font-size:13px;">Sin tareas registradas.</p>';
    }

    return html;
  };

  return (
    <PrintButton
      title={entityName ? `Reporte de Tareas — ${entityName}` : 'Reporte de Tareas'}
      buildHtml={buildHtml}
      label="Exportar PDF"
      variant={variant}
    />
  );
}
