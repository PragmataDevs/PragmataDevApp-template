import { Info, AlertTriangle, AlertOctagon, type LucideIcon } from 'lucide-react';

/**
 * TIPOS DE NOTIFICACIÓN
 * ─────────────────────
 * Hardcodeados y fáciles de modificar.
 * Agregar un nuevo tipo: solo agrega una entrada aquí.
 */

export type NotificationType = 'info' | 'action' | 'urgent';

export interface NotificationTypeConfig {
  label: string;
  color: string;        // Tailwind color name (blue, amber, red)
  bgClass: string;      // Background for badge/pill
  textClass: string;    // Text color for badge/pill
  dotClass: string;     // Dot indicator color
  icon: LucideIcon;
}

export const NOTIFICATION_TYPES: Record<NotificationType, NotificationTypeConfig> = {
  info: {
    label: 'Informativa',
    color: 'blue',
    bgClass: 'bg-blue-100 dark:bg-blue-900/30',
    textClass: 'text-blue-700 dark:text-blue-300',
    dotClass: 'bg-blue-500',
    icon: Info,
  },
  action: {
    label: 'Acción requerida',
    color: 'amber',
    bgClass: 'bg-amber-100 dark:bg-amber-900/30',
    textClass: 'text-amber-700 dark:text-amber-300',
    dotClass: 'bg-amber-500',
    icon: AlertTriangle,
  },
  urgent: {
    label: 'Urgente',
    color: 'red',
    bgClass: 'bg-red-100 dark:bg-red-900/30',
    textClass: 'text-red-700 dark:text-red-300',
    dotClass: 'bg-red-500',
    icon: AlertOctagon,
  },
};

/**
 * TARGET TYPES para broadcasts
 */
export type BroadcastTargetType = 'user' | 'role' | 'all';

export const BROADCAST_TARGETS: Record<BroadcastTargetType, { label: string; description: string }> = {
  user: { label: 'Usuario específico', description: 'Enviar a un usuario individual' },
  role: { label: 'Rol completo', description: 'Enviar a todos los usuarios con un rol' },
  all: { label: 'Todos', description: 'Enviar a todos los usuarios activos' },
};
