import { useState, useEffect } from 'react';
import {
  X, Send, Bell, Check, Archive, CheckCheck, Paperclip, ArrowLeft,
  ChevronDown, Users, UserIcon, Radio, FileText, Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useNotifications, type Notification } from '../hooks/useNotifications';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { NOTIFICATION_TYPES, BROADCAST_TARGETS, type NotificationType, type BroadcastTargetType } from '../config';
import { supabase } from '@/lib/supabase';
import { OverlayPortal } from '@/lib/ui/OverlayPortal';
import { errorMessage } from '@/lib/errors';

// ─── Notification row in modal ───────────────────────────────
function NotificationRow({
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
      className={`flex items-start gap-3 p-4 transition-colors hover:bg-[color:var(--pragmata-surface-2)] ${
        !notification.is_read ? 'bg-[color:var(--pragmata-accent-soft)] border-l-2 border-l-[color:var(--pragmata-accent)]' : ''
      }`}
    >
      <div className={`mt-0.5 flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${config.bgClass}`}>
        <Icon className={`w-4 h-4 ${config.textClass}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${config.bgClass} ${config.textClass}`}>
            {config.label}
          </span>
          <span className="text-[10px] text-[color:var(--pragmata-muted-2)]">
            {new Date(notification.created_at).toLocaleString('es-MX', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </div>
        <p className={`text-sm mt-1 ${!notification.is_read ? 'font-semibold' : 'font-medium'} text-[color:var(--pragmata-fg)]`}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-[color:var(--pragmata-muted)] mt-1">{notification.body}</p>
        )}
        {notification.sender?.full_name && (
          <p className="text-[10px] text-[color:var(--pragmata-muted-2)] mt-1">
            De: {notification.sender.full_name}
          </p>
        )}
        {/* Attachments */}
        {notification.attachments && notification.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {notification.attachments.map((att) => (
              <a
                key={att.id}
                href={att.file_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)] text-[10px] text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] transition-colors"
              >
                {att.file_type?.startsWith('image/') ? (
                  <ImageIcon className="w-3 h-3" />
                ) : (
                  <FileText className="w-3 h-3" />
                )}
                {att.file_name}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {!notification.is_read && (
          <button
            onClick={() => onRead(notification.id)}
            className="p-1.5 rounded-lg hover:bg-[color:var(--pragmata-surface)] text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-accent)]"
            title="Marcar como leída"
          >
            <Check className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => { if (confirm('¿Archivar esta notificación?')) onArchive(notification.id); }}
          className="p-1.5 rounded-lg hover:bg-[color:var(--pragmata-surface)] text-[color:var(--pragmata-muted)]"
          title="Archivar"
        >
          <Archive className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Send Notification Form ──────────────────────────────────
function SendNotificationForm({ onBack, onSent }: { onBack: () => void; onSent: () => void }) {
  const { sendNotification } = useNotifications();
  const [targetType, setTargetType] = useState<BroadcastTargetType>('user');
  const [targetId, setTargetId] = useState('');
  const [type, setType] = useState<NotificationType>('info');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Load users/roles for target selection
  const [users, setUsers] = useState<{ id: string; full_name: string; email: string }[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, email').eq('profile_status', 'active').then(({ data }) => {
      if (data) setUsers(data);
    });
    supabase.from('sys_roles').select('id, name').eq('status', 'active').then(({ data }) => {
      if (data) setRoles(data);
    });
  }, []);

  const handleSubmit = async () => {
    if (!title.trim()) { setError('El título es obligatorio'); return; }
    if (targetType !== 'all' && !targetId) { setError('Selecciona un destinatario'); return; }

    setSending(true);
    setError('');

    try {
      await sendNotification({
        target_type: targetType,
        target_id: targetType !== 'all' ? targetId : undefined,
        type,
        title: title.trim(),
        body: body.trim() || undefined,
        files: files.length > 0 ? files : undefined,
      });

      onSent();
    } catch (err: unknown) {
      setError(errorMessage(err, 'No se pudo enviar la notificación'));
    } finally {
      setSending(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[color:var(--pragmata-border)]">
        <button onClick={onBack} className="p-1 rounded-lg hover:bg-[color:var(--pragmata-surface-2)]">
          <ArrowLeft className="w-5 h-5 text-[color:var(--pragmata-muted)]" />
        </button>
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--pragmata-fg)]">Enviar Notificación</h2>
          <p className="text-xs text-[color:var(--pragmata-muted)]">Envía una notificación a usuarios, roles o todos</p>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Target type */}
        <div>
          <label className="text-xs font-medium text-[color:var(--pragmata-muted)] mb-2 block">Destinatario</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(BROADCAST_TARGETS) as [BroadcastTargetType, { label: string; description: string }][]).map(
              ([key, config]) => (
                <button
                  key={key}
                  onClick={() => { setTargetType(key); setTargetId(''); }}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-center transition-all ${
                    targetType === key
                      ? 'border-[color:var(--pragmata-accent)] bg-[color:var(--pragmata-accent-soft)]'
                      : 'border-[color:var(--pragmata-border)] hover:border-[color:var(--pragmata-border-strong)] bg-[color:var(--pragmata-surface-2)]'
                  }`}
                >
                  {key === 'user' && <UserIcon className="w-4 h-4" />}
                  {key === 'role' && <Users className="w-4 h-4" />}
                  {key === 'all' && <Radio className="w-4 h-4" />}
                  <span className="text-xs font-medium">{config.label}</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Target selector */}
        {targetType === 'user' && (
          <div>
            <label className="text-xs font-medium text-[color:var(--pragmata-muted)] mb-1 block">Usuario</label>
            <div className="relative">
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)] px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)]"
              >
                <option value="">Seleccionar usuario...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--pragmata-muted)] pointer-events-none" />
            </div>
          </div>
        )}
        {targetType === 'role' && (
          <div>
            <label className="text-xs font-medium text-[color:var(--pragmata-muted)] mb-1 block">Rol</label>
            <div className="relative">
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)] px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)]"
              >
                <option value="">Seleccionar rol...</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--pragmata-muted)] pointer-events-none" />
            </div>
          </div>
        )}

        {/* Notification type */}
        <div>
          <label className="text-xs font-medium text-[color:var(--pragmata-muted)] mb-2 block">Tipo</label>
          <div className="flex gap-2">
            {(Object.entries(NOTIFICATION_TYPES) as [NotificationType, typeof NOTIFICATION_TYPES['info']][]).map(
              ([key, config]) => {
                const TypeIcon = config.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setType(key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                      type === key
                        ? `${config.bgClass} ${config.textClass} border-current`
                        : 'border-[color:var(--pragmata-border)] text-[color:var(--pragmata-muted)] hover:border-[color:var(--pragmata-border-strong)]'
                    }`}
                  >
                    <TypeIcon className="w-3.5 h-3.5" />
                    {config.label}
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="text-xs font-medium text-[color:var(--pragmata-muted)] mb-1 block">Título *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título de la notificación"
            className="w-full rounded-lg border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)]"
          />
        </div>

        {/* Body */}
        <div>
          <label className="text-xs font-medium text-[color:var(--pragmata-muted)] mb-1 block">Mensaje</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Cuerpo del mensaje (opcional)"
            rows={3}
            className="w-full rounded-lg border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)]"
          />
        </div>

        {/* Attachments */}
        <div>
          <label className="text-xs font-medium text-[color:var(--pragmata-muted)] mb-1 block">Archivos adjuntos</label>
          <div className="space-y-2">
            {files.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)] text-xs"
              >
                {file.type.startsWith('image/') ? (
                  <ImageIcon className="w-4 h-4 text-[color:var(--pragmata-muted)]" />
                ) : (
                  <FileText className="w-4 h-4 text-[color:var(--pragmata-muted)]" />
                )}
                <span className="flex-1 truncate">{file.name}</span>
                <span className="text-[color:var(--pragmata-muted-2)]">
                  {(file.size / 1024).toFixed(0)} KB
                </span>
                <button
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-red-500 hover:text-red-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[color:var(--pragmata-border)] text-xs text-[color:var(--pragmata-muted)] hover:bg-[color:var(--pragmata-surface-2)] cursor-pointer transition-colors">
              <Paperclip className="w-4 h-4" />
              Agregar archivo
              <input type="file" className="hidden" multiple onChange={handleFileChange} />
            </label>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[color:var(--pragmata-border)]">
        <Button variant="ghost" onClick={onBack}>
          Cancelar
        </Button>
        <Button variant="accent" onClick={handleSubmit} loading={sending}>
          <Send className="w-4 h-4 mr-1" />
          Enviar
        </Button>
      </div>
    </div>
  );
}

// ─── Main Modal ──────────────────────────────────────────────
export function NotificationModal({ onClose }: { onClose: () => void }) {
  const { notifications, loading, unreadCount, fetchNotifications, markAsRead, markAllAsRead, archiveNotification } =
    useNotifications();
  const { hasPermission } = usePermission();
  const [view, setView] = useState<'list' | 'send'>('list');
  const [showArchived, setShowArchived] = useState(false);

  const canSend = hasPermission('feature_notifications_send', 'create');

  // Load all notifications (not just 10)
  useEffect(() => {
    fetchNotifications(100, showArchived);
  }, [fetchNotifications, showArchived]);

  if (view === 'send') {
    return (
      <OverlayPortal
        layer="modal"
        className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
        onBackdropClick={onClose}
      >
        <div
          className="bg-[color:var(--pragmata-surface)] rounded-2xl shadow-2xl border border-[color:var(--pragmata-border)] w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <SendNotificationForm
            onBack={() => setView('list')}
            onSent={() => {
              setView('list');
              fetchNotifications(100, showArchived);
            }}
          />
        </div>
      </OverlayPortal>
    );
  }

  return (
    <OverlayPortal
      layer="modal"
      className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
      onBackdropClick={onClose}
    >
      <div
        className="bg-[color:var(--pragmata-surface)] rounded-2xl shadow-2xl border border-[color:var(--pragmata-border)] w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--pragmata-border)]">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-[color:var(--pragmata-accent)]" />
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--pragmata-fg)]">Notificaciones</h2>
              <p className="text-xs text-[color:var(--pragmata-muted)]">
                {unreadCount > 0 ? `${unreadCount} sin leer` : 'Al día'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-[color:var(--pragmata-accent)] hover:bg-[color:var(--pragmata-surface-2)]"
              >
                <CheckCheck className="w-3 h-3" />
                Leer todo
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[color:var(--pragmata-surface-2)]">
              <X className="w-5 h-5 text-[color:var(--pragmata-muted)]" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between px-6 py-2 border-b border-[color:var(--pragmata-border)]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowArchived(false)}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                !showArchived
                  ? 'bg-[color:var(--pragmata-accent-soft)] text-[color:var(--pragmata-accent)]'
                  : 'text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)]'
              }`}
            >
              Activas
            </button>
            <button
              onClick={() => setShowArchived(true)}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                showArchived
                  ? 'bg-[color:var(--pragmata-accent-soft)] text-[color:var(--pragmata-accent)]'
                  : 'text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)]'
              }`}
            >
              Archivadas
            </button>
          </div>
          {canSend && (
            <Button variant="accent" size="sm" onClick={() => setView('send')}>
              <Send className="w-3.5 h-3.5 mr-1" />
              Enviar
            </Button>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[color:var(--pragmata-border)]">
          {loading ? (
            <div className="py-12 text-center">
              <div className="w-6 h-6 border-2 border-[color:var(--pragmata-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-[color:var(--pragmata-muted)] mt-2">Cargando...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center">
              <Bell className="w-10 h-10 mx-auto text-[color:var(--pragmata-muted-2)] mb-2" />
              <p className="text-sm text-[color:var(--pragmata-muted)]">
                {showArchived ? 'Sin notificaciones archivadas' : 'Sin notificaciones'}
              </p>
            </div>
          ) : (
            notifications.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onRead={markAsRead}
                onArchive={archiveNotification}
              />
            ))
          )}
        </div>
      </div>
    </OverlayPortal>
  );
}