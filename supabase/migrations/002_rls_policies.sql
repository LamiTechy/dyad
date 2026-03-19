-- =============================================================================
-- DYAD — Row Level Security Policies
-- File: 002_rls_policies.sql
-- =============================================================================
-- Security model: Only the 2 users in allowed_users can read or write ANY data.
-- All policies verify auth.uid() IS IN (SELECT id FROM auth.users WHERE email IN (SELECT email FROM allowed_users))
-- We cache this as a helper function for performance.
-- =============================================================================

-- Helper: returns TRUE if the current authenticated user is in allowed_users
CREATE OR REPLACE FUNCTION public.is_allowed_user()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_users au
    JOIN auth.users u ON u.email = au.email
    WHERE u.id = auth.uid() AND au.is_active = true
  );
$$;

-- Helper: returns TRUE if the caller is a member of a given conversation
CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = p_conversation_id
    AND user_id = auth.uid()
  );
$$;

-- =============================================================================
-- ENABLE RLS on every table
-- =============================================================================
ALTER TABLE public.allowed_users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_keys               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_secrets_meta       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_receipts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_previews             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disappearing_message_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drafts                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_state             ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- allowed_users: only allowed users can view; only service role can modify
-- =============================================================================
CREATE POLICY "allowed_users_select"
  ON public.allowed_users FOR SELECT
  TO authenticated
  USING (public.is_allowed_user());

-- No INSERT/UPDATE/DELETE for regular users — managed via service role only

-- =============================================================================
-- profiles
-- =============================================================================
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_allowed_user());

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid() AND public.is_allowed_user());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid() AND public.is_allowed_user())
  WITH CHECK (id = auth.uid());

-- =============================================================================
-- conversations
-- =============================================================================
CREATE POLICY "conversations_select"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (public.is_allowed_user() AND public.is_conversation_member(id));

CREATE POLICY "conversations_insert"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_allowed_user());

CREATE POLICY "conversations_update"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (public.is_allowed_user() AND public.is_conversation_member(id));

-- =============================================================================
-- conversation_members
-- =============================================================================
CREATE POLICY "conv_members_select"
  ON public.conversation_members FOR SELECT
  TO authenticated
  USING (
    public.is_allowed_user() AND
    public.is_conversation_member(conversation_id)
  );

CREATE POLICY "conv_members_insert"
  ON public.conversation_members FOR INSERT
  TO authenticated
  WITH CHECK (public.is_allowed_user() AND user_id = auth.uid());

CREATE POLICY "conv_members_update_own"
  ON public.conversation_members FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND public.is_allowed_user());

-- =============================================================================
-- device_keys (E2EE)
-- Both users can read each other's public keys (needed for key exchange)
-- Only write your own keys
-- =============================================================================
CREATE POLICY "device_keys_select"
  ON public.device_keys FOR SELECT
  TO authenticated
  USING (public.is_allowed_user());

CREATE POLICY "device_keys_insert_own"
  ON public.device_keys FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_allowed_user());

CREATE POLICY "device_keys_update_own"
  ON public.device_keys FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND public.is_allowed_user());

CREATE POLICY "device_keys_delete_own"
  ON public.device_keys FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND public.is_allowed_user());

-- =============================================================================
-- shared_secrets_meta
-- =============================================================================
CREATE POLICY "shared_secrets_select"
  ON public.shared_secrets_meta FOR SELECT
  TO authenticated
  USING (
    public.is_allowed_user() AND
    (initiator_user_id = auth.uid() OR responder_user_id = auth.uid())
  );

CREATE POLICY "shared_secrets_insert"
  ON public.shared_secrets_meta FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_allowed_user() AND
    initiator_user_id = auth.uid()
  );

CREATE POLICY "shared_secrets_update"
  ON public.shared_secrets_meta FOR UPDATE
  TO authenticated
  USING (
    public.is_allowed_user() AND
    (initiator_user_id = auth.uid() OR responder_user_id = auth.uid())
  );

-- =============================================================================
-- messages
-- =============================================================================
CREATE POLICY "messages_select"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    public.is_allowed_user() AND
    public.is_conversation_member(conversation_id) AND
    (deleted_for_everyone = false OR sender_id = auth.uid())
  );

CREATE POLICY "messages_insert"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_allowed_user() AND
    sender_id = auth.uid() AND
    public.is_conversation_member(conversation_id)
  );

CREATE POLICY "messages_update_own"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (
    public.is_allowed_user() AND
    sender_id = auth.uid() AND
    public.is_conversation_member(conversation_id)
  )
  WITH CHECK (sender_id = auth.uid());

-- "Delete for everyone" requires sender; "delete for me" handled client-side
-- We allow the sender to update deleted_for_everyone = true
-- We do NOT allow hard deletes via RLS (only via service role for cleanup)

-- =============================================================================
-- message_receipts
-- =============================================================================
CREATE POLICY "receipts_select"
  ON public.message_receipts FOR SELECT
  TO authenticated
  USING (
    public.is_allowed_user() AND
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
      AND public.is_conversation_member(m.conversation_id)
    )
  );

CREATE POLICY "receipts_insert_own"
  ON public.message_receipts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_allowed_user());

CREATE POLICY "receipts_update_own"
  ON public.message_receipts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND public.is_allowed_user());

-- =============================================================================
-- reactions
-- =============================================================================
CREATE POLICY "reactions_select"
  ON public.reactions FOR SELECT
  TO authenticated
  USING (
    public.is_allowed_user() AND
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
      AND public.is_conversation_member(m.conversation_id)
    )
  );

CREATE POLICY "reactions_insert_own"
  ON public.reactions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_allowed_user());

CREATE POLICY "reactions_delete_own"
  ON public.reactions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND public.is_allowed_user());

-- =============================================================================
-- attachments
-- =============================================================================
CREATE POLICY "attachments_select"
  ON public.attachments FOR SELECT
  TO authenticated
  USING (
    public.is_allowed_user() AND
    public.is_conversation_member(conversation_id)
  );

CREATE POLICY "attachments_insert"
  ON public.attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    uploader_id = auth.uid() AND
    public.is_allowed_user() AND
    public.is_conversation_member(conversation_id)
  );

-- =============================================================================
-- pinned_messages
-- =============================================================================
CREATE POLICY "pinned_select"
  ON public.pinned_messages FOR SELECT
  TO authenticated
  USING (
    public.is_allowed_user() AND
    public.is_conversation_member(conversation_id)
  );

CREATE POLICY "pinned_insert"
  ON public.pinned_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    pinned_by = auth.uid() AND
    public.is_allowed_user() AND
    public.is_conversation_member(conversation_id)
  );

CREATE POLICY "pinned_delete"
  ON public.pinned_messages FOR DELETE
  TO authenticated
  USING (
    public.is_allowed_user() AND
    public.is_conversation_member(conversation_id)
  );

-- =============================================================================
-- link_previews (read-only for users; written by Edge Function with service role)
-- =============================================================================
CREATE POLICY "link_previews_select"
  ON public.link_previews FOR SELECT
  TO authenticated
  USING (public.is_allowed_user());

-- =============================================================================
-- call_sessions
-- =============================================================================
CREATE POLICY "calls_select"
  ON public.call_sessions FOR SELECT
  TO authenticated
  USING (
    public.is_allowed_user() AND
    (caller_id = auth.uid() OR callee_id = auth.uid())
  );

CREATE POLICY "calls_insert"
  ON public.call_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    caller_id = auth.uid() AND
    public.is_allowed_user() AND
    public.is_conversation_member(conversation_id)
  );

CREATE POLICY "calls_update_participant"
  ON public.call_sessions FOR UPDATE
  TO authenticated
  USING (
    public.is_allowed_user() AND
    (caller_id = auth.uid() OR callee_id = auth.uid())
  );

-- =============================================================================
-- call_events
-- =============================================================================
CREATE POLICY "call_events_select"
  ON public.call_events FOR SELECT
  TO authenticated
  USING (
    public.is_allowed_user() AND
    EXISTS (
      SELECT 1 FROM public.call_sessions cs
      WHERE cs.id = call_id
      AND (cs.caller_id = auth.uid() OR cs.callee_id = auth.uid())
    )
  );

CREATE POLICY "call_events_insert"
  ON public.call_events FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id = auth.uid() AND
    public.is_allowed_user() AND
    EXISTS (
      SELECT 1 FROM public.call_sessions cs
      WHERE cs.id = call_id
      AND (cs.caller_id = auth.uid() OR cs.callee_id = auth.uid())
    )
  );

-- =============================================================================
-- disappearing_message_rules
-- =============================================================================
CREATE POLICY "disappearing_select"
  ON public.disappearing_message_rules FOR SELECT
  TO authenticated
  USING (
    public.is_allowed_user() AND
    public.is_conversation_member(conversation_id)
  );

CREATE POLICY "disappearing_insert"
  ON public.disappearing_message_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    enabled_by = auth.uid() AND
    public.is_allowed_user() AND
    public.is_conversation_member(conversation_id)
  );

CREATE POLICY "disappearing_update"
  ON public.disappearing_message_rules FOR UPDATE
  TO authenticated
  USING (
    public.is_allowed_user() AND
    public.is_conversation_member(conversation_id)
  );

CREATE POLICY "disappearing_delete"
  ON public.disappearing_message_rules FOR DELETE
  TO authenticated
  USING (
    public.is_allowed_user() AND
    public.is_conversation_member(conversation_id)
  );

-- =============================================================================
-- drafts
-- =============================================================================
CREATE POLICY "drafts_own"
  ON public.drafts FOR ALL
  TO authenticated
  USING (user_id = auth.uid() AND public.is_allowed_user())
  WITH CHECK (user_id = auth.uid() AND public.is_allowed_user());

-- =============================================================================
-- blocked_state
-- =============================================================================
CREATE POLICY "blocked_own"
  ON public.blocked_state FOR ALL
  TO authenticated
  USING (blocker_id = auth.uid() AND public.is_allowed_user())
  WITH CHECK (blocker_id = auth.uid() AND public.is_allowed_user());

CREATE POLICY "blocked_select_as_blocked"
  ON public.blocked_state FOR SELECT
  TO authenticated
  USING (blocked_id = auth.uid() AND public.is_allowed_user());

-- =============================================================================
-- STORAGE POLICIES
-- =============================================================================
-- Create the private media bucket (run via Supabase dashboard or API)
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'chat-media',
--   'chat-media',
--   false,  -- NOT public
--   104857600, -- 100 MB
--   ARRAY['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm','audio/mpeg','audio/ogg','audio/webm','application/pdf','text/plain']
-- );

-- Storage RLS: only allowed users can access objects in chat-media
CREATE POLICY "storage_select_allowed"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-media' AND
    public.is_allowed_user()
  );

CREATE POLICY "storage_insert_allowed"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media' AND
    public.is_allowed_user() AND
    -- Enforce path prefix: user can only upload to their own subfolder
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "storage_update_allowed"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'chat-media' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "storage_delete_allowed"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-media' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
