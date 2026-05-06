import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { withSessionRetry } from '@/lib/auth/sessionRetry';
import { uploadFile, resolveSignedUrl, CHAT_IMAGE_PRESET } from '@/lib/storage';

// ─── Types ───────────────────────────────────────────────────

export interface Conversation {
  id: string;
  type: 'individual' | 'group';
  name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Computed client-side
  participants?: Participant[];
  last_message?: ChatMessage | null;
  unread_count?: number;
}

export interface Participant {
  id: string;
  conversation_id: string;
  user_id: string;
  joined_at: string;
  // Joined
  profile?: { full_name: string | null; email: string; avatar_url: string | null };
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  type: 'text' | 'image' | 'file';
  file_url: string | null;
  file_name: string | null;
  created_at: string;
  // Joined
  sender?: { full_name: string | null; email: string; avatar_url: string | null };
}

// ─── useConversations ────────────────────────────────────────

export function useConversations() {
  const { profile, loading: authLoading, isAuthenticated, sessionEpoch } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    if (authLoading || !isAuthenticated) {
      setLoading(true);
      return;
    }
    if (!profile) return;
    setLoading(true);

    try {
      const conversationsWithLastMessage = await withSessionRetry(async () => {
        // Get conversation IDs where user is participant
        const { data: participantRows, error: pError } = await supabase
          .from('chat_participants')
          .select('conversation_id')
          .eq('user_id', profile.id);

        if (pError) throw pError;
        if (!participantRows || participantRows.length === 0) {
          return [] as Conversation[];
        }

        const convIds = participantRows.map((p) => p.conversation_id);

        // Get conversations with participants
        const { data: convos, error: cError } = await supabase
          .from('chat_conversations')
          .select(`
            *,
            participants:chat_participants(
              id, user_id, joined_at,
              profile:profiles(full_name, email, avatar_url)
            )
          `)
          .in('id', convIds)
          .order('updated_at', { ascending: false });

        if (cError) throw cError;

        // Get last message + unread count per conversation
        return Promise.all(
          (convos || []).map(async (conv) => {
            const { data: msgs } = await supabase
              .from('chat_messages')
              .select('id, body, type, sender_id, created_at')
              .eq('conversation_id', conv.id)
              .order('created_at', { ascending: false })
              .limit(1);

            const { data: readData } = await supabase
              .from('chat_message_reads')
              .select('message_id')
              .eq('user_id', profile.id);

            const readMessageIds = (readData || []).map((r) => r.message_id);

            let unreadQuery = supabase
              .from('chat_messages')
              .select('id', { count: 'exact', head: true })
              .eq('conversation_id', conv.id)
              .neq('sender_id', profile.id);

            if (readMessageIds.length > 0) {
              unreadQuery = unreadQuery.not('id', 'in', `(${readMessageIds.join(',')})`);
            }

            const { count } = await unreadQuery;

            return {
              ...conv,
              last_message: msgs?.[0] || null,
              unread_count: count || 0,
            } as Conversation;
          })
        );
      }, 'useConversations.fetchConversations');

      setConversations(conversationsWithLastMessage);
    } catch (err: any) {
      console.error('Error fetching conversations:', err.message);
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated, profile]);

          const readMessageIds = (readData || []).map((r) => r.message_id);

          let unreadQuery = supabase
            .from('chat_messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .neq('sender_id', profile.id);

          if (readMessageIds.length > 0) {
            unreadQuery = unreadQuery.not('id', 'in', `(${readMessageIds.join(',')})`);
          }

          const { count } = await unreadQuery;

          return {
            ...conv,
            last_message: msgs?.[0] || null,
            unread_count: count || 0,
          } as Conversation;
        })
      );

      setConversations(conversationsWithLastMessage);
    } catch (err: any) {
      console.error('Error fetching conversations:', err.message);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  // Create a new conversation
  const createConversation = useCallback(
    async (participantIds: string[], name?: string) => {
      if (!profile) throw new Error('No profile');

      const type = participantIds.length > 1 ? 'group' : 'individual';

      // For individual chats, check if conversation already exists
      if (type === 'individual') {
        const otherUserId = participantIds[0];
        const existing = conversations.find(
          (c) =>
            c.type === 'individual' &&
            c.participants?.some((p) => p.user_id === otherUserId)
        );
        if (existing) return existing;
      }

      // Create conversation
      const { data: conv, error: convError } = await supabase
        .from('chat_conversations')
        .insert({
          type,
          name: type === 'group' ? name || 'Grupo' : null,
          created_by: profile.id,
        })
        .select()
        .single();

      if (convError) throw convError;

      // Add all participants (including creator)
      const allParticipants = [...new Set([profile.id, ...participantIds])];
      const { error: partError } = await supabase
        .from('chat_participants')
        .insert(
          allParticipants.map((userId) => ({
            conversation_id: conv.id,
            user_id: userId,
          }))
        );

      if (partError) throw partError;

      await fetchConversations();
      return conv;
    },
    [profile, conversations, fetchConversations]
  );

  // Initial load
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    fetchConversations();
    // sessionEpoch in deps: re-run after TOKEN_REFRESHED / wake-from-idle.
  }, [authLoading, isAuthenticated, fetchConversations, sessionEpoch]);

  return {
    conversations,
    loading,
    fetchConversations,
    createConversation,
  };
}

// ─── useMessages ─────────────────────────────────────────────

// Thin wrappers over the centralized storage module
async function resolveFileUrl(msg: ChatMessage): Promise<ChatMessage> {
  if (!msg.file_url || msg.type === 'text') return msg;
  const signedUrl = await resolveSignedUrl('attachments', msg.file_url);
  return { ...msg, file_url: signedUrl };
}

async function resolveFileUrls(msgs: ChatMessage[]): Promise<ChatMessage[]> {
  return Promise.all(msgs.map(resolveFileUrl));
}

export function useMessages(conversationId: string | null) {
  const { profile, loading: authLoading, isAuthenticated, sessionEpoch } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMessages = useCallback(
    async (limit = 50) => {
      if (authLoading || !isAuthenticated) return;
      if (!conversationId || !profile) return;
      setLoading(true);

      try {
        const data = await withSessionRetry(async () => {
          const response = await supabase
            .from('chat_messages')
            .select(`
              *,
              sender:profiles!chat_messages_sender_id_fkey(full_name, email, avatar_url)
            `)
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true })
            .limit(limit);

          if (response.error) throw response.error;
          return response.data;
        }, 'useMessages.fetchMessages');

        // Resolve storage paths to signed URLs
        const resolved = await resolveFileUrls((data as unknown as ChatMessage[]) || []);
        setMessages(resolved);

        // Mark messages as read
        if (data && data.length > 0) {
          const unreadIds = data
            .filter((m: any) => m.sender_id !== profile.id)
            .map((m: any) => m.id);

          if (unreadIds.length > 0) {
            // Get already-read message IDs
            const { data: alreadyRead } = await supabase
              .from('chat_message_reads')
              .select('message_id')
              .eq('user_id', profile.id)
              .in('message_id', unreadIds);

            const alreadyReadIds = new Set((alreadyRead || []).map((r) => r.message_id));
            const toMark = unreadIds.filter((id: string) => !alreadyReadIds.has(id));

            if (toMark.length > 0) {
              await supabase.from('chat_message_reads').upsert(
                toMark.map((message_id: string) => ({
                  message_id,
                  user_id: profile.id,
                })),
                { onConflict: 'message_id,user_id', ignoreDuplicates: true }
              );
            }
          }
        }
      } catch (err: any) {
        console.error('Error fetching messages:', err.message);
      } finally {
        setLoading(false);
      }
    },
    [authLoading, isAuthenticated, conversationId, profile]
  );

  // Send a text message
  const sendMessage = useCallback(
    async (body: string) => {
      if (!conversationId || !profile) throw new Error('Missing context');

      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: profile.id,
          body,
          type: 'text',
        })
        .select(`
          *,
          sender:profiles!chat_messages_sender_id_fkey(full_name, email, avatar_url)
        `)
        .single();

      if (error) throw error;
      // Realtime will add it, but add immediately for UX
      if (data) {
        setMessages((prev) => [...prev, data as unknown as ChatMessage]);
      }
      return data;
    },
    [conversationId, profile]
  );

  // Send file message (uses centralized uploadFile with image optimization)
  const sendFileMessage = useCallback(
    async (file: File) => {
      if (!conversationId || !profile) throw new Error('Missing context');

      const path = `chat/${conversationId}/${Date.now()}_${file.name}`;
      const msgType = file.type.startsWith('image/') ? 'image' : 'file';

      // Upload with optimization (images get resized/WebP, files pass through)
      const { storagePath, signedUrl } = await uploadFile(
        'attachments',
        path,
        file,
        { optimize: msgType === 'image' ? CHAT_IMAGE_PRESET : false }
      );

      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: profile.id,
          body: null,
          type: msgType,
          file_url: storagePath,
          file_name: file.name,
        })
        .select(`
          *,
          sender:profiles!chat_messages_sender_id_fkey(full_name, email, avatar_url)
        `)
        .single();

      if (error) throw error;

      // Use the signed URL we already got from upload for immediate display
      if (data) {
        const withUrl = { ...(data as unknown as ChatMessage), file_url: signedUrl };
        setMessages((prev) => [...prev, withUrl]);
      }
      return data;
    },
    [conversationId, profile]
  );

  // Realtime subscription for new messages
  useEffect(() => {
    if (!conversationId || !profile) return;

    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMsg = payload.new as ChatMessage;
          // Avoid duplicates (we already optimistically add our own)
          if (newMsg.sender_id !== profile.id) {
            const resolved = await resolveFileUrl(newMsg);
            setMessages((prev) => {
              if (prev.some((m) => m.id === resolved.id)) return prev;
              return [...prev, resolved];
            });

            // Mark as read automatically since user is viewing
            supabase.from('chat_message_reads').upsert(
              { message_id: newMsg.id, user_id: profile.id },
              { onConflict: 'message_id,user_id', ignoreDuplicates: true }
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, profile]);

  // Load messages when conversation changes
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    if (conversationId) {
      fetchMessages();
    } else {
      setMessages([]);
    }
    // sessionEpoch in deps: re-run after TOKEN_REFRESHED / wake-from-idle.
  }, [authLoading, isAuthenticated, conversationId, fetchMessages, sessionEpoch]);

  return {
    messages,
    loading,
    fetchMessages,
    sendMessage,
    sendFileMessage,
  };
}
