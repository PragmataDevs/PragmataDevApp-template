import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { NotificationType, BroadcastTargetType } from '../config';

// ─── Types ───────────────────────────────────────────────────

export interface Notification {
  id: string;
  recipient_id: string;
  sender_id: string | null;
  broadcast_id: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  action_url: string | null;
  is_read: boolean;
  is_archived: boolean;
  read_at: string | null;
  created_at: string;
  // Joined data
  sender?: { full_name: string | null; email: string };
  attachments?: NotificationAttachment[];
}

export interface NotificationAttachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
}

export interface SendNotificationPayload {
  target_type: BroadcastTargetType;
  target_id?: string; // user_id or role_id (null for 'all')
  type: NotificationType;
  title: string;
  body?: string;
  action_url?: string;
  files?: File[];
}

// ─── Hook ────────────────────────────────────────────────────

export function useNotifications() {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // ── Fetch recent notifications ──
  const fetchNotifications = useCallback(
    async (limit = 20, includeArchived = false) => {
      if (!profile) return;
      setLoading(true);

      try {
        let query = supabase
          .from('notifications')
          .select(`
            *,
            sender:profiles!notifications_sender_id_fkey(full_name, email),
            attachments:notification_attachments(id, file_name, file_url, file_type, file_size)
          `)
          .eq('recipient_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!includeArchived) {
          query = query.eq('is_archived', false);
        }

        const { data, error } = await query;
        if (error) throw error;

        setNotifications((data as unknown as Notification[]) || []);
      } catch (err: any) {
        console.error('Error fetching notifications:', err.message);
      } finally {
        setLoading(false);
      }
    },
    [profile]
  );

  // ── Fetch unread count ──
  const fetchUnreadCount = useCallback(async () => {
    if (!profile) return;

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', profile.id)
      .eq('is_read', false)
      .eq('is_archived', false);

    if (!error && count !== null) {
      setUnreadCount(count);
    }
  }, [profile]);

  // ── Mark as read ──
  const markAsRead = useCallback(
    async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (!error) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    },
    []
  );

  // ── Mark all as read ──
  const markAllAsRead = useCallback(async () => {
    if (!profile) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('recipient_id', profile.id)
      .eq('is_read', false);

    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() })));
      setUnreadCount(0);
    }
  }, [profile]);

  // ── Archive ──
  const archiveNotification = useCallback(
    async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_archived: true })
        .eq('id', notificationId);

      if (!error) {
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
        // If it was unread, decrement counter
        const wasUnread = notifications.find((n) => n.id === notificationId && !n.is_read);
        if (wasUnread) setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    },
    [notifications]
  );

  // ── Send notification (direct or broadcast) ──
  const sendNotification = useCallback(
    async (payload: SendNotificationPayload) => {
      if (!profile) throw new Error('No profile');

      // 1. If target is a single user → direct insert
      if (payload.target_type === 'user' && payload.target_id) {
        const { data: notif, error } = await supabase
          .from('notifications')
          .insert({
            recipient_id: payload.target_id,
            sender_id: profile.id,
            type: payload.type,
            title: payload.title,
            body: payload.body || null,
            action_url: payload.action_url || null,
          })
          .select()
          .single();

        if (error) throw error;

        // Upload attachments if any
        if (payload.files && payload.files.length > 0 && notif) {
          await uploadAttachments(payload.files, { notification_id: notif.id });
        }

        return notif;
      }

      // 2. Broadcast (role or all) → insert into notification_broadcasts
      const { data: broadcast, error } = await supabase
        .from('notification_broadcasts')
        .insert({
          sender_id: profile.id,
          target_type: payload.target_type,
          target_id: payload.target_id || null,
          type: payload.type,
          title: payload.title,
          body: payload.body || null,
          action_url: payload.action_url || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Upload attachments linked to broadcast
      if (payload.files && payload.files.length > 0 && broadcast) {
        await uploadAttachments(payload.files, { broadcast_id: broadcast.id });
      }

      return broadcast;
    },
    [profile]
  );

  // ── Upload attachments to Storage ──
  const uploadAttachments = async (
    files: File[],
    parent: { notification_id?: string; broadcast_id?: string }
  ) => {
    for (const file of files) {
      const path = parent.broadcast_id
        ? `notifications/broadcasts/${parent.broadcast_id}/${file.name}`
        : `notifications/${parent.notification_id}/${file.name}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(path, file);

      if (uploadError) {
        console.error('Upload error:', uploadError.message);
        continue;
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);

      // Insert attachment record
      await supabase.from('notification_attachments').insert({
        ...parent,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
      });
    }
  };

  // ── Realtime subscription ──
  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${profile.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          setNotifications((prev) => [newNotification, ...prev]);
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  // ── Initial load ──
  useEffect(() => {
    fetchNotifications(10);
    fetchUnreadCount();
  }, [fetchNotifications, fetchUnreadCount]);

  return {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    archiveNotification,
    sendNotification,
  };
}
