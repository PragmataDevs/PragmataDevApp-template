import { useState, useRef, useEffect } from 'react';
import { Bell, Eye, Check, Archive, CheckCheck } from 'lucide-react';
import { useNotifications, type Notification } from '../hooks/useNotifications';
import { NOTIFICATION_TYPES, type NotificationType } from '../config';
import { NotificationModal } from './NotificationModal';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'Ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(dateStr).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

// ─── Single notification item ────────────────────────────────
function NotificationItem({
  notification,
  onRead,
  onArchive,
}: {
  notification: Notification;
  onRead: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const config = NOTIFICATION_TYPES[notification.type as NotificationType] || NOTIFICATION_TYPES.info;
  const Icon = config.icon;

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[color:var(--pragmata-surface-2)] ${
        !notification.is_read ? 'bg-[color:var(--pragmata-accent-soft)]' : ''
      }`}
    >
      {/* Type icon */}
      <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${config.bgClass}`}>
        <Icon className={`w-4 h-4 ${config.textClass}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-tight ${!notification.is_read ? 'font-semibold' : 'font-medium'} text-[color:var(--pragmata-fg)]`}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-[color:var(--pragmata-muted)] mt-0.5 line-clamp-2">
            {notification.body}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-[color:var(--pragmata-muted-2)]">
            {timeAgo(notification.created_at)}
          </span>
          {notification.sender?.full_name && (
            <span className="text-[10px] text-[color:var(--pragmata-muted-2)]">
              · {notification.sender.full_name}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {!notification.is_read && (
          <button
            onClick={(e) => { e.stopPropagation(); onRead(notification.id); }}
            className="p-1 rounded hover:bg-[color:var(--pragmata-surface)] text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-accent)]"
            title="Marcar como leída"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onArchive(notification.id); }}
          className="p-1 rounded hover:bg-[color:var(--pragmata-surface)] text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-muted)]"
          title="Archivar"
        >
          <Archive className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Bell + Dropdown ────────────────────────────────────
export function NotificationBell() {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    archiveNotification,
  } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const recentNotifications = notifications.slice(0, 10);

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {/* Bell button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 text-[color:var(--pragmata-muted-2)] hover:text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] rounded-full transition-colors relative"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 ring-2 ring-[color:var(--pragmata-surface)]">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute right-0 mt-2 w-96 bg-[color:var(--pragmata-surface)] rounded-xl shadow-lg border border-[color:var(--pragmata-border)] origin-top-right animate-in fade-in zoom-in-95 duration-200 z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--pragmata-border)]">
              <h3 className="text-sm font-semibold text-[color:var(--pragmata-fg)]">Notificaciones</h3>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="flex items-center gap-1 text-[10px] text-[color:var(--pragmata-accent)] hover:underline"
                >
                  <CheckCheck className="w-3 h-3" />
                  Marcar todas leídas
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[400px] overflow-y-auto divide-y divide-[color:var(--pragmata-border)]">
              {recentNotifications.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell className="w-8 h-8 mx-auto text-[color:var(--pragmata-muted-2)] mb-2" />
                  <p className="text-sm text-[color:var(--pragmata-muted)]">Sin notificaciones</p>
                </div>
              ) : (
                recentNotifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onRead={markAsRead}
                    onArchive={archiveNotification}
                  />
                ))
              )}
            </div>

            {/* Footer: "Ver todas" */}
            <div className="border-t border-[color:var(--pragmata-border)] p-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setShowModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-[color:var(--pragmata-accent)] hover:bg-[color:var(--pragmata-surface-2)] rounded-lg transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                Ver todas las notificaciones
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full modal */}
      {showModal && <NotificationModal onClose={() => setShowModal(false)} />}
    </>
  );
}
