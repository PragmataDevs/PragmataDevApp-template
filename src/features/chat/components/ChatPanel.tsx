import { useState, useRef, useEffect } from 'react';
import {
  MessageCircle, X, Plus, ArrowLeft, Send, Paperclip, Search,
  Users, FileText, Download, Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/hooks/useAuth';
import {
  useConversations,
  useMessages,
  type Conversation,
  type ChatMessage,
} from '../hooks/useChat';
import { supabase } from '@/lib/supabase';
import { useSignedUrl } from '@/lib/storage';
import { OverlayPortal } from '@/lib/ui/OverlayPortal';
import { errorMessage } from '@/lib/errors';

// ─── Helpers ─────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'Ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return new Date(dateStr).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function getInitials(name?: string | null, email?: string): string {
  if (name) return name.substring(0, 2).toUpperCase();
  return email?.substring(0, 2).toUpperCase() || 'U';
}

/** Resolve avatar_url (storage path) to a signed URL */
function useAvatarUrl(avatarPath?: string | null) {
  return useSignedUrl('attachments', avatarPath);
}

/** Reusable avatar circle with image or initials fallback */
function AvatarCircle({
  avatarUrl,
  name,
  email,
  size = 'md',
  isGroup = false,
}: {
  avatarUrl?: string | null;
  name?: string | null;
  email?: string;
  size?: 'sm' | 'md' | 'lg';
  isGroup?: boolean;
}) {
  const resolvedUrl = useAvatarUrl(avatarUrl);
  const sizeClasses = size === 'sm' ? 'w-7 h-7 text-[10px]' : size === 'md' ? 'w-10 h-10 text-xs' : 'w-8 h-8 text-xs';

  return (
    <div className={`${sizeClasses} rounded-full bg-gradient-to-br from-[color:var(--pragmata-accent)] to-[color:var(--pragmata-primary)] flex items-center justify-center text-white font-bold flex-shrink-0 overflow-hidden`}>
      {isGroup ? (
        <Users className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      ) : resolvedUrl ? (
        <img src={resolvedUrl} alt={name || ''} className="w-full h-full object-cover" />
      ) : (
        getInitials(name, email)
      )}
    </div>
  );
}

// ─── Chat Icon (Header) ─────────────────────────────────────

export function ChatIcon() {
  const [isOpen, setIsOpen] = useState(false);
  const { conversations } = useConversations();
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  useEffect(() => {
    if (isOpen) {
      document.body.setAttribute('data-chat-open', '');
    } else {
      document.body.removeAttribute('data-chat-open');
    }
    return () => document.body.removeAttribute('data-chat-open');
  }, [isOpen]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 text-[color:var(--pragmata-muted-2)] hover:text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] rounded-full transition-colors relative"
      >
        <MessageCircle className="w-5 h-5" />
        {totalUnread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 ring-2 ring-[color:var(--pragmata-surface)]">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {isOpen && (
        <OverlayPortal
          layer="sheet"
          className="flex justify-end"
          onBackdropClick={() => setIsOpen(false)}
        >
          <div
            className="absolute inset-0 bg-black/30"
            aria-hidden
            onClick={() => setIsOpen(false)}
          />
          <ChatPanel onClose={() => setIsOpen(false)} />
        </OverlayPortal>
      )}
    </>
  );
}

// ─── Chat Panel (Slide-over) ─────────────────────────────────

function ChatPanel({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const { conversations, loading, fetchConversations, createConversation } = useConversations();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);

  const activeConversation = conversations.find((c) => c.id === activeConvId) || null;

  const getConversationName = (conv: Conversation) => {
    if (conv.type === 'group') return conv.name || 'Grupo';
    const other = conv.participants?.find((p) => p.user_id !== profile?.id);
    return other?.profile?.full_name || other?.profile?.email || 'Chat';
  };

  return (
    <div
      className="relative z-10 w-full max-w-md bg-[color:var(--pragmata-surface)] shadow-2xl border-l border-[color:var(--pragmata-border)] flex flex-col animate-in slide-in-from-right duration-300 h-full ml-auto pointer-events-auto"
      onClick={(e) => e.stopPropagation()}
    >
        {/* New Chat Modal */}
        {showNewChat && (
          <OverlayPortal
            layer="modalElevated"
            className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
            onBackdropClick={() => setShowNewChat(false)}
          >
            <NewConversationModal
              onClose={() => setShowNewChat(false)}
              onCreate={async (participantIds, name) => {
                const conv = await createConversation(participantIds, name);
                if (conv) setActiveConvId(conv.id);
                setShowNewChat(false);
              }}
            />
          </OverlayPortal>
        )}

        {/* Message View */}
        {activeConvId && activeConversation ? (
          <MessageView
            conversation={activeConversation}
            conversationName={getConversationName(activeConversation)}
            onBack={() => { setActiveConvId(null); fetchConversations(); }}
          />
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--pragmata-border)]">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-[color:var(--pragmata-accent)]" />
                <h2 className="text-base font-semibold text-[color:var(--pragmata-fg)]">Chat</h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowNewChat(true)}
                  className="p-2 rounded-lg hover:bg-[color:var(--pragmata-surface-2)] text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)]"
                >
                  <Plus className="w-5 h-5" />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-[color:var(--pragmata-surface-2)] text-[color:var(--pragmata-muted)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="py-12 text-center">
                  <div className="w-5 h-5 border-2 border-[color:var(--pragmata-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="py-12 text-center">
                  <MessageCircle className="w-10 h-10 mx-auto text-[color:var(--pragmata-muted-2)] mb-2" />
                  <p className="text-sm text-[color:var(--pragmata-muted)]">Sin conversaciones</p>
                  <Button
                    variant="accent"
                    size="sm"
                    className="mt-3"
                    onClick={() => setShowNewChat(true)}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Nuevo chat
                  </Button>
                </div>
              ) : (
                conversations.map((conv) => {
                  const name = getConversationName(conv);
                  const lastMsg = conv.last_message;

                  return (
                    <button
                      key={conv.id}
                      onClick={() => setActiveConvId(conv.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[color:var(--pragmata-surface-2)] transition-colors border-b border-[color:var(--pragmata-border)] text-left"
                    >
                      {/* Avatar */}
                      {(() => {
                        const other = conv.type === 'individual'
                          ? conv.participants?.find((p) => p.user_id !== profile?.id)
                          : null;
                        return (
                          <AvatarCircle
                            avatarUrl={other?.profile?.avatar_url}
                            name={name}
                            isGroup={conv.type === 'group'}
                          />
                        );
                      })()}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-[color:var(--pragmata-fg)] truncate">{name}</p>
                          {lastMsg && (
                            <span className="text-[10px] text-[color:var(--pragmata-muted-2)] flex-shrink-0">
                              {timeAgo(lastMsg.created_at)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-[color:var(--pragmata-muted)] truncate">
                            {lastMsg?.body || (lastMsg?.type === 'image' ? '📷 Imagen' : lastMsg?.type === 'file' ? '📎 Archivo' : 'Sin mensajes')}
                          </p>
                          {(conv.unread_count ?? 0) > 0 && (
                            <span className="min-w-[18px] h-[18px] flex items-center justify-center bg-blue-500 text-white text-[10px] font-bold rounded-full px-1 flex-shrink-0 ml-2">
                              {conv.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
    </div>
  );
}

// ─── Message View ────────────────────────────────────────────

function MessageView({
  conversation,
  conversationName,
  onBack,
}: {
  conversation: Conversation;
  conversationName: string;
  onBack: () => void;
}) {
  const { profile } = useAuth();
  const { messages, loading, sendMessage, sendFileMessage } = useMessages(conversation.id);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage(input.trim());
      setInput('');
    } catch (err: unknown) {
      console.error('Send error:', errorMessage(err, 'No se pudo enviar el mensaje'));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    for (const file of Array.from(e.target.files)) {
      await sendFileMessage(file);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[color:var(--pragmata-border)]">
        <button onClick={onBack} className="p-1 rounded-lg hover:bg-[color:var(--pragmata-surface-2)]">
          <ArrowLeft className="w-5 h-5 text-[color:var(--pragmata-muted)]" />
        </button>
        {(() => {
          const other = conversation.type === 'individual'
            ? conversation.participants?.find((p) => p.user_id !== profile?.id)
            : null;
          return (
            <AvatarCircle
              avatarUrl={other?.profile?.avatar_url}
              name={conversationName}
              size="lg"
              isGroup={conversation.type === 'group'}
            />
          );
        })()}
        <div>
          <p className="text-sm font-semibold text-[color:var(--pragmata-fg)]">{conversationName}</p>
          {conversation.type === 'group' && (
            <p className="text-[10px] text-[color:var(--pragmata-muted)]">
              {conversation.participants?.length} participantes
            </p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="py-12 text-center">
            <div className="w-5 h-5 border-2 border-[color:var(--pragmata-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : messages.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-[color:var(--pragmata-muted)]">Sin mensajes aún. ¡Envía el primero!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} isOwn={msg.sender_id === profile?.id} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[color:var(--pragmata-border)] p-3">
        <div className="flex items-end gap-2">
          <label className="p-2 rounded-lg hover:bg-[color:var(--pragmata-surface-2)] text-[color:var(--pragmata-muted)] cursor-pointer flex-shrink-0">
            <Paperclip className="w-5 h-5" />
            <input type="file" className="hidden" multiple onChange={handleFileUpload} />
          </label>
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe un mensaje..."
              rows={1}
              className="w-full rounded-xl border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)] px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] max-h-24"
              style={{ minHeight: '40px' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="p-2.5 rounded-xl bg-[color:var(--pragmata-accent)] text-white hover:opacity-90 disabled:opacity-50 flex-shrink-0 transition-opacity"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Message Bubble ──────────────────────────────────────────

function getFileIcon(fileName: string | null) {
  const ext = fileName?.split('.').pop()?.toLowerCase();
  if (!ext) return { icon: FileText, label: 'Archivo', color: 'text-gray-400' };
  if (['pdf'].includes(ext)) return { icon: FileText, label: 'PDF', color: 'text-red-400' };
  if (['doc', 'docx'].includes(ext)) return { icon: FileText, label: 'Word', color: 'text-blue-400' };
  if (['xls', 'xlsx'].includes(ext)) return { icon: FileText, label: 'Excel', color: 'text-green-400' };
  if (['ppt', 'pptx'].includes(ext)) return { icon: FileText, label: 'PowerPoint', color: 'text-orange-400' };
  if (['zip', 'rar', '7z'].includes(ext)) return { icon: FileText, label: 'Comprimido', color: 'text-yellow-400' };
  return { icon: FileText, label: ext.toUpperCase(), color: 'text-gray-400' };
}

function MessageBubble({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} gap-2`}>
      {/* Sender avatar (only for other people's messages) */}
      {!isOwn && (
        <div className="flex-shrink-0 self-end">
          <AvatarCircle
            avatarUrl={message.sender?.avatar_url}
            name={message.sender?.full_name}
            email={message.sender?.email}
            size="sm"
          />
        </div>
      )}

      <div className={`max-w-[75%] ${isOwn ? 'order-2' : 'order-1'}`}>
        {/* Sender name (group chats) */}
        {!isOwn && message.sender?.full_name && (
          <p className="text-[10px] text-[color:var(--pragmata-muted)] mb-0.5 ml-3">
            {message.sender.full_name}
          </p>
        )}

        <div
          className={`rounded-2xl overflow-hidden ${
            isOwn
              ? 'bg-[color:var(--pragmata-accent)] text-white rounded-br-md'
              : 'bg-[color:var(--pragmata-surface-2)] text-[color:var(--pragmata-fg)] border border-[color:var(--pragmata-border)] rounded-bl-md'
          } ${message.type === 'image' && !imgError ? '' : 'px-4 py-2.5'}`}
        >
          {/* Text */}
          {message.type === 'text' && message.body && (
            <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>
          )}

          {/* Image */}
          {message.type === 'image' && message.file_url && !imgError && (
            <a href={message.file_url} target="_blank" rel="noreferrer" className="block">
              {imgLoading && (
                <div className="w-48 h-32 flex items-center justify-center bg-black/10">
                  <div className="w-5 h-5 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <img
                src={message.file_url}
                alt={message.file_name || 'imagen'}
                className={`max-w-full max-h-64 object-cover ${imgLoading ? 'hidden' : 'block'}`}
                onLoad={() => setImgLoading(false)}
                onError={() => { setImgError(true); setImgLoading(false); }}
              />
            </a>
          )}

          {/* Image error fallback → show as file download */}
          {message.type === 'image' && message.file_url && imgError && (
            <a
              href={message.file_url}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center gap-3 text-sm ${
                isOwn ? 'text-white/90' : 'text-[color:var(--pragmata-fg)]'
              } hover:opacity-80`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                isOwn ? 'bg-white/15' : 'bg-[color:var(--pragmata-surface)]'
              }`}>
                <ImageIcon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{message.file_name || 'Imagen'}</p>
                <p className={`text-[10px] ${isOwn ? 'text-white/60' : 'text-[color:var(--pragmata-muted)]'}`}>
                  No se pudo previsualizar
                </p>
              </div>
              <Download className="w-4 h-4 flex-shrink-0 opacity-60" />
            </a>
          )}

          {/* File (PDF, docs, etc.) */}
          {message.type === 'file' && message.file_url && (() => {
            const fileInfo = getFileIcon(message.file_name);
            const IconComponent = fileInfo.icon;
            return (
              <a
                href={message.file_url}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center gap-3 text-sm ${
                  isOwn ? 'text-white/90' : 'text-[color:var(--pragmata-fg)]'
                } hover:opacity-80 transition-opacity`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isOwn ? 'bg-white/15' : 'bg-[color:var(--pragmata-surface)]'
                }`}>
                  <IconComponent className={`w-5 h-5 ${isOwn ? 'text-white' : fileInfo.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{message.file_name || 'Archivo'}</p>
                  <p className={`text-[10px] ${isOwn ? 'text-white/60' : 'text-[color:var(--pragmata-muted)]'}`}>
                    {fileInfo.label}
                  </p>
                </div>
                <Download className="w-4 h-4 flex-shrink-0 opacity-60" />
              </a>
            );
          })()}
        </div>

        <p className={`text-[10px] mt-0.5 ${isOwn ? 'text-right mr-2' : 'ml-3'} text-[color:var(--pragmata-muted-2)]`}>
          {new Date(message.created_at).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}

// ─── New Conversation Modal ──────────────────────────────────

type ChatType = 'individual' | 'group';
type ModalStep = 'type' | 'select';

function NewConversationModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (participantIds: string[], name?: string) => void;
}) {
  const { profile } = useAuth();
  const [step, setStep] = useState<ModalStep>('type');
  const [chatType, setChatType] = useState<ChatType | null>(null);
  const [users, setUsers] = useState<{ id: string; full_name: string | null; email: string; avatar_url: string | null }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Load users when entering the select step
  const goToSelect = (type: ChatType) => {
    setChatType(type);
    setStep('select');
    setSelectedIds([]);
    setGroupName('');
    setSearch('');
    setLoadingUsers(true);
    supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .eq('profile_status', 'active')
      .neq('id', profile?.id || '')
      .order('full_name')
      .then(({ data }) => {
        if (data) setUsers(data);
        setLoadingUsers(false);
      });
  };

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    return u.full_name?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const toggleUser = (userId: string) => {
    if (chatType === 'individual') {
      // Individual: select one and create immediately
      onCreate([userId]);
      return;
    }
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const canCreate = chatType === 'group' && selectedIds.length >= 2 && groupName.trim().length > 0;

  return (
    <div
      className="w-full max-w-md mx-4 bg-[color:var(--pragmata-surface)] rounded-2xl shadow-2xl border border-[color:var(--pragmata-border)] flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200"
      onClick={(e) => e.stopPropagation()}
    >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[color:var(--pragmata-border)]">
          {step === 'select' ? (
            <button
              onClick={() => { setStep('type'); setChatType(null); }}
              className="p-1 rounded-lg hover:bg-[color:var(--pragmata-surface-2)]"
            >
              <ArrowLeft className="w-5 h-5 text-[color:var(--pragmata-muted)]" />
            </button>
          ) : (
            <MessageCircle className="w-5 h-5 text-[color:var(--pragmata-accent)]" />
          )}
          <h2 className="text-sm font-semibold text-[color:var(--pragmata-fg)] flex-1">
            {step === 'type' && 'Nueva Conversación'}
            {step === 'select' && chatType === 'individual' && 'Seleccionar Usuario'}
            {step === 'select' && chatType === 'group' && 'Crear Grupo'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[color:var(--pragmata-surface-2)] text-[color:var(--pragmata-muted)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Step 1: Choose Type ── */}
        {step === 'type' && (
          <div className="p-5 space-y-3">
            <p className="text-xs text-[color:var(--pragmata-muted)] mb-1">¿Qué tipo de conversación deseas iniciar?</p>

            {/* Individual card */}
            <button
              onClick={() => goToSelect('individual')}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-[color:var(--pragmata-border)] hover:border-[color:var(--pragmata-accent)] hover:bg-[color:var(--pragmata-accent-soft)] transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/20 transition-colors">
                <MessageCircle className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[color:var(--pragmata-fg)]">Chat Individual</p>
                <p className="text-xs text-[color:var(--pragmata-muted)] mt-0.5">Conversación privada con un usuario</p>
              </div>
            </button>

            {/* Group card */}
            <button
              onClick={() => goToSelect('group')}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-[color:var(--pragmata-border)] hover:border-[color:var(--pragmata-accent)] hover:bg-[color:var(--pragmata-accent-soft)] transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                <Users className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[color:var(--pragmata-fg)]">Chat Grupal</p>
                <p className="text-xs text-[color:var(--pragmata-muted)] mt-0.5">Crea un grupo con varios participantes</p>
              </div>
            </button>
          </div>
        )}

        {/* ── Step 2: Select Users ── */}
        {step === 'select' && (
          <>
            {/* Group name input (only for group) */}
            {chatType === 'group' && (
              <div className="px-5 pt-4 pb-2">
                <label className="text-xs font-medium text-[color:var(--pragmata-muted)] mb-1.5 block">
                  Nombre del grupo <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Ej: Equipo Construcción Norte"
                  className="w-full rounded-lg border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] placeholder:text-[color:var(--pragmata-muted-2)]"
                  autoFocus
                />
              </div>
            )}

            {/* Selected chips (group only) */}
            {chatType === 'group' && selectedIds.length > 0 && (
              <div className="px-5 pb-2">
                <p className="text-xs text-[color:var(--pragmata-muted)] mb-1.5">
                  Participantes ({selectedIds.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedIds.map((id) => {
                    const u = users.find((usr) => usr.id === id);
                    return (
                      <span
                        key={id}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[color:var(--pragmata-accent-soft)] text-[color:var(--pragmata-accent)] text-[11px] font-medium"
                      >
                        {u?.full_name || u?.email}
                        <button onClick={() => toggleUser(id)} className="hover:opacity-70">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Search */}
            <div className="px-5 py-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--pragmata-muted)]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar usuario..."
                  autoFocus={chatType === 'individual'}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)] text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] placeholder:text-[color:var(--pragmata-muted-2)]"
                />
              </div>
            </div>

            {/* User list */}
            <div className="flex-1 overflow-y-auto min-h-0 border-t border-[color:var(--pragmata-border)]">
              {loadingUsers ? (
                <div className="py-10 text-center">
                  <div className="w-5 h-5 border-2 border-[color:var(--pragmata-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-[color:var(--pragmata-muted)]">No se encontraron usuarios</p>
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const isSelected = selectedIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggleUser(u.id)}
                      className={`w-full flex items-center gap-3 px-5 py-3 hover:bg-[color:var(--pragmata-surface-2)] transition-colors text-left ${
                        isSelected ? 'bg-[color:var(--pragmata-accent-soft)]' : ''
                      }`}
                    >
                      <AvatarCircle
                        avatarUrl={u.avatar_url}
                        name={u.full_name}
                        email={u.email}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[color:var(--pragmata-fg)] truncate">
                          {u.full_name || u.email}
                        </p>
                        {u.full_name && (
                          <p className="text-[10px] text-[color:var(--pragmata-muted)] truncate">{u.email}</p>
                        )}
                      </div>
                      {/* Checkbox visual for group / arrow for individual */}
                      {chatType === 'group' ? (
                        <div
                          className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${
                            isSelected
                              ? 'bg-[color:var(--pragmata-accent)] border-[color:var(--pragmata-accent)]'
                              : 'border-[color:var(--pragmata-muted-2)]'
                          }`}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      ) : (
                        <ArrowLeft className="w-4 h-4 text-[color:var(--pragmata-muted-2)] rotate-180 flex-shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer (group only) */}
            {chatType === 'group' && (
              <div className="border-t border-[color:var(--pragmata-border)] p-4">
                <Button
                  variant="accent"
                  className="w-full"
                  onClick={() => onCreate(selectedIds, groupName.trim())}
                  disabled={!canCreate}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Crear grupo ({selectedIds.length} participantes)
                </Button>
                {selectedIds.length < 2 && (
                  <p className="text-[10px] text-[color:var(--pragmata-muted)] text-center mt-2">
                    Selecciona al menos 2 participantes
                  </p>
                )}
              </div>
            )}
          </>
        )}
    </div>
  );
}
