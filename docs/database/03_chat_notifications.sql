-- ==============================================================================
-- CHAT & NOTIFICATIONS SYSTEM (v1.0)
-- 
-- Includes:
-- 1. Notification Tables (notifications, broadcasts, attachments)
-- 2. Chat Tables (conversations, participants, messages, reads)
-- 3. Broadcast Trigger (auto-generates individual notifications)
-- 4. RLS Policies
-- 5. Indexes
--
-- Dependencies: 01_security_engine.sql (profiles, sys_roles, check_permission)
-- ==============================================================================

-- ══════════════════════════════════════════════════════════════
-- 1. NOTIFICATION TABLES
-- ══════════════════════════════════════════════════════════════

-- 1.1 NOTIFICATION BROADCASTS (The "send" record)
-- When an admin sends a notification to a role or "all", this is the master record.
-- A trigger then generates individual rows in `notifications`.
CREATE TABLE public.notification_broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Target
    target_type TEXT NOT NULL CHECK (target_type IN ('user', 'role', 'all')),
    target_id UUID, -- user_id or role_id depending on target_type (NULL for 'all')
    
    -- Content
    type TEXT NOT NULL CHECK (type IN ('info', 'action', 'urgent')) DEFAULT 'info',
    title TEXT NOT NULL,
    body TEXT,
    action_url TEXT, -- Internal link (ej: /projects/abc-123)
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.2 NOTIFICATIONS (Individual notification per user)
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- NULL = system notification
    broadcast_id UUID REFERENCES public.notification_broadcasts(id) ON DELETE CASCADE,
    
    -- Content
    type TEXT NOT NULL CHECK (type IN ('info', 'action', 'urgent')) DEFAULT 'info',
    title TEXT NOT NULL,
    body TEXT,
    action_url TEXT,
    
    -- State
    is_read BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' -- AuditBase
);

-- 1.3 NOTIFICATION ATTACHMENTS
CREATE TABLE public.notification_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES public.notifications(id) ON DELETE CASCADE,
    broadcast_id UUID REFERENCES public.notification_broadcasts(id) ON DELETE CASCADE,
    
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL, -- Supabase Storage URL
    file_type TEXT, -- MIME type (application/pdf, image/png, etc.)
    file_size INTEGER, -- bytes
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- At least one reference must exist
    CONSTRAINT attachment_has_parent CHECK (notification_id IS NOT NULL OR broadcast_id IS NOT NULL)
);


-- ══════════════════════════════════════════════════════════════
-- 2. CHAT TABLES
-- ══════════════════════════════════════════════════════════════

-- 2.1 CONVERSATIONS
CREATE TABLE public.chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('individual', 'group')) DEFAULT 'individual',
    name TEXT, -- Only for group chats
    
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 PARTICIPANTS (M:N between conversations and users)
CREATE TABLE public.chat_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(conversation_id, user_id)
);

-- 2.3 MESSAGES
CREATE TABLE public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    body TEXT,
    type TEXT NOT NULL CHECK (type IN ('text', 'image', 'file')) DEFAULT 'text',
    file_url TEXT,   -- Supabase Storage URL (for image/file types)
    file_name TEXT,  -- Original filename
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.4 MESSAGE READS (Track who read what)
CREATE TABLE public.chat_message_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    read_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(message_id, user_id)
);


-- ══════════════════════════════════════════════════════════════
-- 3. BROADCAST TRIGGER
-- ══════════════════════════════════════════════════════════════

-- Generates individual notification rows when a broadcast is inserted
CREATE OR REPLACE FUNCTION public.handle_notification_broadcast()
RETURNS TRIGGER AS $$
BEGIN
    -- Target: specific user
    IF NEW.target_type = 'user' THEN
        INSERT INTO public.notifications (recipient_id, sender_id, broadcast_id, type, title, body, action_url)
        VALUES (NEW.target_id, NEW.sender_id, NEW.id, NEW.type, NEW.title, NEW.body, NEW.action_url);
    
    -- Target: all users with a specific role
    ELSIF NEW.target_type = 'role' THEN
        INSERT INTO public.notifications (recipient_id, sender_id, broadcast_id, type, title, body, action_url)
        SELECT p.id, NEW.sender_id, NEW.id, NEW.type, NEW.title, NEW.body, NEW.action_url
        FROM public.profiles p
        WHERE p.role_id = NEW.target_id
          AND p.profile_status = 'active'
          AND p.status = 'active';
    
    -- Target: ALL active users
    ELSIF NEW.target_type = 'all' THEN
        INSERT INTO public.notifications (recipient_id, sender_id, broadcast_id, type, title, body, action_url)
        SELECT p.id, NEW.sender_id, NEW.id, NEW.type, NEW.title, NEW.body, NEW.action_url
        FROM public.profiles p
        WHERE p.profile_status = 'active'
          AND p.status = 'active';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notification_broadcast ON public.notification_broadcasts;
CREATE TRIGGER trigger_notification_broadcast
AFTER INSERT ON public.notification_broadcasts
FOR EACH ROW EXECUTE FUNCTION public.handle_notification_broadcast();

-- Update conversation.updated_at when a new message is sent
CREATE OR REPLACE FUNCTION public.handle_chat_message_insert()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.chat_conversations 
    SET updated_at = NOW() 
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_chat_message_insert ON public.chat_messages;
CREATE TRIGGER trigger_chat_message_insert
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.handle_chat_message_insert();


-- ══════════════════════════════════════════════════════════════
-- 4. INDEXES
-- ══════════════════════════════════════════════════════════════

-- Notifications
CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_id);
CREATE INDEX idx_notifications_recipient_unread ON public.notifications(recipient_id) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_broadcast ON public.notifications(broadcast_id);
CREATE INDEX idx_notification_attachments_notification ON public.notification_attachments(notification_id);
CREATE INDEX idx_notification_attachments_broadcast ON public.notification_attachments(broadcast_id);

-- Chat
CREATE INDEX idx_chat_participants_user ON public.chat_participants(user_id);
CREATE INDEX idx_chat_participants_conv ON public.chat_participants(conversation_id);
CREATE INDEX idx_chat_messages_conv ON public.chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_conv_created ON public.chat_messages(conversation_id, created_at DESC);
CREATE INDEX idx_chat_message_reads_message ON public.chat_message_reads(message_id);
CREATE INDEX idx_chat_message_reads_user ON public.chat_message_reads(user_id);


-- ══════════════════════════════════════════════════════════════
-- 5. RLS POLICIES
-- ══════════════════════════════════════════════════════════════

-- Enable RLS on ALL new tables
ALTER TABLE public.notification_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_reads ENABLE ROW LEVEL SECURITY;

-- ── Notifications ──

-- Users see only their own notifications
CREATE POLICY "View Own Notifications" ON public.notifications 
    FOR SELECT USING (recipient_id = auth.uid());

-- Users can update only their own notifications (mark read/archive)
CREATE POLICY "Update Own Notifications" ON public.notifications 
    FOR UPDATE USING (recipient_id = auth.uid());

-- Broadcasts: only users with permission can insert
CREATE POLICY "Send Broadcast" ON public.notification_broadcasts 
    FOR INSERT WITH CHECK (
        public.check_permission('feature_notifications_send', 'broadcast')
    );

-- Anyone can read broadcasts they're part of (via their notifications)
CREATE POLICY "View Own Broadcasts" ON public.notification_broadcasts 
    FOR SELECT USING (
        sender_id = auth.uid() 
        OR id IN (SELECT broadcast_id FROM public.notifications WHERE recipient_id = auth.uid())
    );

-- Direct notifications (user-to-user): sender must have permission
CREATE POLICY "Send Direct Notification" ON public.notifications 
    FOR INSERT WITH CHECK (
        sender_id = auth.uid() 
        AND public.check_permission('feature_notifications_send', 'create')
    );

-- Attachments: viewable if you can see the notification or broadcast
CREATE POLICY "View Notification Attachments" ON public.notification_attachments 
    FOR SELECT USING (
        notification_id IN (SELECT id FROM public.notifications WHERE recipient_id = auth.uid())
        OR broadcast_id IN (SELECT broadcast_id FROM public.notifications WHERE recipient_id = auth.uid())
    );

-- Attachments: insertable by notification senders
CREATE POLICY "Insert Notification Attachments" ON public.notification_attachments 
    FOR INSERT WITH CHECK (
        public.check_permission('feature_notifications_send', 'create')
    );

-- ── Chat ──

-- Helper function: Check if user is participant of a conversation
CREATE OR REPLACE FUNCTION public.is_chat_participant(conv_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.chat_participants 
        WHERE conversation_id = conv_id AND user_id = auth.uid()
    );
$$;

-- Conversations: see only those you participate in (or created — needed for INSERT...RETURNING)
CREATE POLICY "View My Conversations" ON public.chat_conversations 
    FOR SELECT USING (created_by = auth.uid() OR public.is_chat_participant(id));

-- Conversations: anyone authenticated can create
CREATE POLICY "Create Conversation" ON public.chat_conversations 
    FOR INSERT WITH CHECK (created_by = auth.uid());

-- Participants: see participants of your conversations
CREATE POLICY "View Conversation Participants" ON public.chat_participants 
    FOR SELECT USING (public.is_chat_participant(conversation_id));

-- Participants: add participants (creator of conversation, existing participant, or self)
CREATE POLICY "Add Participant" ON public.chat_participants 
    FOR INSERT WITH CHECK (
        user_id = auth.uid() 
        OR public.is_chat_participant(conversation_id)
        OR EXISTS (
            SELECT 1 FROM public.chat_conversations 
            WHERE id = conversation_id AND created_by = auth.uid()
        )
    );

-- Messages: see messages of your conversations
CREATE POLICY "View Conversation Messages" ON public.chat_messages 
    FOR SELECT USING (public.is_chat_participant(conversation_id));

-- Messages: send messages in your conversations
CREATE POLICY "Send Message" ON public.chat_messages 
    FOR INSERT WITH CHECK (
        sender_id = auth.uid() 
        AND public.is_chat_participant(conversation_id)
    );

-- Message reads: manage your own read receipts
CREATE POLICY "Manage Own Read Receipts" ON public.chat_message_reads 
    FOR ALL USING (user_id = auth.uid());
