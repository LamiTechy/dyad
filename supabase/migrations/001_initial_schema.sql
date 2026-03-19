-- =============================================================================
-- DYAD — Complete Database Schema Migration
-- Run order: 001_initial_schema.sql
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- TYPES / ENUMS
-- =============================================================================

CREATE TYPE message_status AS ENUM ('sending', 'sent', 'delivered', 'seen', 'failed');
CREATE TYPE call_status AS ENUM ('initiating', 'ringing', 'active', 'ended', 'missed', 'rejected', 'failed');
CREATE TYPE call_type AS ENUM ('voice', 'video');
CREATE TYPE attachment_type AS ENUM ('image', 'video', 'audio', 'document', 'voice_note');
CREATE TYPE reaction_type AS ENUM ('like', 'love', 'laugh', 'wow', 'sad', 'angry', 'custom');

-- =============================================================================
-- TABLE: allowed_users
-- Controls exactly which 2 email addresses can register/access the app.
-- This is the primary access gate used by RLS and signup checks.
-- =============================================================================
CREATE TABLE public.allowed_users (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT        NOT NULL UNIQUE,
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invited_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  CONSTRAINT allowed_users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Seed: replace these with your actual 2 user emails before deploying
-- INSERT INTO public.allowed_users (email) VALUES ('user1@example.com'), ('user2@example.com');

-- =============================================================================
-- TABLE: profiles
-- One row per auth.users entry. Mirrors/extends auth.users.
-- =============================================================================
CREATE TABLE public.profiles (
  id                UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT        NOT NULL,
  display_name      TEXT        NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  avatar_url        TEXT,
  about             TEXT        CHECK (char_length(about) <= 160),
  last_seen_at      TIMESTAMPTZ,
  is_online         BOOLEAN     NOT NULL DEFAULT false,
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  disappearing_messages_duration INTEGER, -- seconds, NULL = off
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Enforce allowed_users gate
  IF NOT EXISTS (SELECT 1 FROM public.allowed_users WHERE email = NEW.email AND is_active = true) THEN
    RAISE EXCEPTION 'Email not in allowed_users list';
  END IF;

  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- TABLE: conversations
-- There is exactly ONE conversation row for the 2-user app.
-- We still model it properly for correctness and future-proofing.
-- =============================================================================
CREATE TABLE public.conversations (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_id   UUID,                     -- FK added after messages table
  last_message_at   TIMESTAMPTZ,
  message_count     INTEGER     NOT NULL DEFAULT 0,
  is_archived       BOOLEAN     NOT NULL DEFAULT false
);

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- TABLE: conversation_members
-- Maps users to conversations. Exactly 2 rows per conversation.
-- =============================================================================
CREATE TABLE public.conversation_members (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id   UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_muted          BOOLEAN     NOT NULL DEFAULT false,
  muted_until       TIMESTAMPTZ,
  last_read_message_id UUID,               -- FK added after messages
  last_read_at      TIMESTAMPTZ,
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX idx_conv_members_user_id ON public.conversation_members(user_id);
CREATE INDEX idx_conv_members_conv_id ON public.conversation_members(conversation_id);

-- =============================================================================
-- TABLE: device_keys
-- Stores per-device public keys for E2EE key exchange.
-- Private keys NEVER leave the client device.
-- =============================================================================
CREATE TABLE public.device_keys (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id         TEXT        NOT NULL,        -- client-generated UUID stored in localStorage
  -- ECDH P-256 public key, JWK format, for key agreement
  identity_public_key JSONB     NOT NULL,
  -- Signed prekeys for forward secrecy (one-time use keys bundle)
  prekey_bundle     JSONB,
  key_fingerprint   TEXT        NOT NULL,        -- SHA-256 hex of identity_public_key
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current        BOOLEAN     NOT NULL DEFAULT true,
  UNIQUE(user_id, device_id)
);

CREATE INDEX idx_device_keys_user_id ON public.device_keys(user_id);

-- =============================================================================
-- TABLE: shared_secrets_meta
-- Stores encrypted-session metadata (NOT the secret itself).
-- Used to verify that both sides have completed key exchange.
-- =============================================================================
CREATE TABLE public.shared_secrets_meta (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id   UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  initiator_user_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  responder_user_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Each side stores an encrypted copy of the shared key, encrypted with their own identity key
  initiator_encrypted_key TEXT, -- base64 of AES-wrapped shared secret, only initiator can decrypt
  responder_encrypted_key TEXT, -- base64 of AES-wrapped shared secret, only responder can decrypt
  key_version       INTEGER     NOT NULL DEFAULT 1,
  established_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TABLE: messages
-- Core message table. Bodies are stored as encrypted ciphertext (base64).
-- The server never sees plaintext.
-- =============================================================================
CREATE TABLE public.messages (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id         UUID        NOT NULL UNIQUE, -- idempotency key from client
  conversation_id   UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  -- E2EE: encrypted_body is AES-GCM ciphertext (base64url-encoded).
  -- iv (nonce) is stored alongside for decryption.
  encrypted_body    TEXT,                        -- base64url AES-GCM ciphertext
  iv                TEXT,                        -- base64url 12-byte nonce

  -- Plaintext fallback ONLY if E2EE not established (e.g., first-launch bootstrap)
  -- In production this should be NULL once E2EE is active
  body_plaintext    TEXT,

  -- Type metadata (not encrypted — needed for UI rendering decisions)
  message_type      TEXT        NOT NULL DEFAULT 'text'
                    CHECK (message_type IN ('text','image','video','audio','voice_note','file','call','system','link_preview')),

  reply_to_id       UUID        REFERENCES public.messages(id) ON DELETE SET NULL,
  forwarded_from_id UUID        REFERENCES public.messages(id) ON DELETE SET NULL,
  is_forwarded      BOOLEAN     NOT NULL DEFAULT false,

  -- Edit tracking
  is_edited         BOOLEAN     NOT NULL DEFAULT false,
  edited_at         TIMESTAMPTZ,
  original_encrypted_body TEXT,                  -- snapshot before edit

  -- Deletion
  deleted_for_everyone BOOLEAN  NOT NULL DEFAULT false,
  deleted_at        TIMESTAMPTZ,

  -- Disappearing messages
  expires_at        TIMESTAMPTZ,

  -- Full-text search vector (over decrypted body — only viable without E2EE, or via client-side index)
  -- We store a search hint: a hash used for client-side search matching
  search_tokens     TSVECTOR,                    -- populated only in non-E2EE mode

  status            message_status NOT NULL DEFAULT 'sending',
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX idx_messages_reply_to ON public.messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX idx_messages_expires_at ON public.messages(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_messages_client_id ON public.messages(client_id);
CREATE INDEX idx_messages_search ON public.messages USING GIN(search_tokens) WHERE search_tokens IS NOT NULL;

CREATE TRIGGER messages_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add deferred FK to conversations
ALTER TABLE public.conversations
  ADD CONSTRAINT fk_last_message
  FOREIGN KEY (last_message_id) REFERENCES public.messages(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

-- Trigger: update conversation last_message on insert
CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations
  SET
    last_message_id = NEW.id,
    last_message_at = NEW.created_at,
    message_count   = message_count + 1
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_on_message();

-- =============================================================================
-- TABLE: message_receipts
-- Tracks per-user delivery and seen state for each message.
-- =============================================================================
CREATE TABLE public.message_receipts (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id        UUID        NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivered_at      TIMESTAMPTZ,
  seen_at           TIMESTAMPTZ,
  UNIQUE(message_id, user_id)
);

CREATE INDEX idx_receipts_message_id ON public.message_receipts(message_id);
CREATE INDEX idx_receipts_user_id ON public.message_receipts(user_id);

-- =============================================================================
-- TABLE: reactions
-- Emoji reactions on messages.
-- =============================================================================
CREATE TABLE public.reactions (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id        UUID        NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji             TEXT        NOT NULL CHECK (char_length(emoji) <= 8),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX idx_reactions_message_id ON public.reactions(message_id);

-- =============================================================================
-- TABLE: attachments
-- Media and file attachments linked to messages.
-- =============================================================================
CREATE TABLE public.attachments (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id        UUID        NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id   UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  uploader_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  type              attachment_type NOT NULL,
  storage_path      TEXT        NOT NULL,        -- supabase storage object path
  thumbnail_path    TEXT,                        -- for image/video thumbnails
  filename          TEXT        NOT NULL,
  mime_type         TEXT        NOT NULL,
  size_bytes        BIGINT      NOT NULL CHECK (size_bytes > 0),
  width             INTEGER,                     -- images/videos
  height            INTEGER,                     -- images/videos
  duration_seconds  FLOAT,                       -- audio/video

  -- E2EE: if encrypted, the file itself is encrypted client-side before upload
  is_encrypted      BOOLEAN     NOT NULL DEFAULT true,
  encrypted_key     TEXT,                        -- AES key encrypted with shared secret, base64

  -- Waveform data for voice notes (array of amplitude floats)
  waveform          FLOAT[],

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_message_id ON public.attachments(message_id);
CREATE INDEX idx_attachments_conversation_id ON public.attachments(conversation_id);
CREATE INDEX idx_attachments_type ON public.attachments(conversation_id, type);

-- =============================================================================
-- TABLE: pinned_messages
-- =============================================================================
CREATE TABLE public.pinned_messages (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id   UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id        UUID        NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  pinned_by         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  pinned_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(conversation_id, message_id)
);

CREATE INDEX idx_pinned_conv ON public.pinned_messages(conversation_id);

-- =============================================================================
-- TABLE: link_previews
-- Server-side generated link preview cache (Edge Function populated).
-- =============================================================================
CREATE TABLE public.link_previews (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  url               TEXT        NOT NULL UNIQUE,
  title             TEXT,
  description       TEXT,
  image_url         TEXT,
  favicon_url       TEXT,
  site_name         TEXT,
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  fetch_failed      BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_link_previews_url ON public.link_previews(url);
CREATE INDEX idx_link_previews_expires ON public.link_previews(expires_at);

-- =============================================================================
-- TABLE: call_sessions
-- One row per call attempt.
-- =============================================================================
CREATE TABLE public.call_sessions (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id   UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  caller_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  callee_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  call_type         call_type   NOT NULL,
  status            call_status NOT NULL DEFAULT 'initiating',

  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at       TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  duration_seconds  INTEGER     GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NOT NULL AND answered_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (ended_at - answered_at))::INTEGER
    ELSE NULL END
  ) STORED,

  -- WebRTC signaling: stored transiently, not for long-term history
  -- Actual signaling goes over Realtime Broadcast; we store here for reconnect reference only
  sdp_offer         TEXT,
  sdp_answer        TEXT,

  -- Diagnostics
  ice_candidates_log JSONB,

  CONSTRAINT call_participants_different CHECK (caller_id != callee_id)
);

CREATE INDEX idx_calls_conversation ON public.call_sessions(conversation_id, started_at DESC);
CREATE INDEX idx_calls_participants ON public.call_sessions(caller_id, callee_id);

-- =============================================================================
-- TABLE: call_events
-- Detailed event log for call state transitions (for call history / missed calls).
-- =============================================================================
CREATE TABLE public.call_events (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id           UUID        NOT NULL REFERENCES public.call_sessions(id) ON DELETE CASCADE,
  actor_id          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type        TEXT        NOT NULL
                    CHECK (event_type IN ('initiated','ringing','answered','rejected','ended','missed','ice_candidate','sdp_offer','sdp_answer','reconnecting','failed')),
  payload           JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_call_events_call_id ON public.call_events(call_id, created_at);

-- =============================================================================
-- TABLE: disappearing_message_rules
-- Per-conversation or per-user configuration for message auto-deletion.
-- =============================================================================
CREATE TABLE public.disappearing_message_rules (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id   UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE UNIQUE,
  enabled_by        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  duration_seconds  INTEGER     NOT NULL CHECK (duration_seconds > 0),
  -- 3600 = 1hr, 86400 = 1 day, 604800 = 1 week
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER disappearing_rules_updated_at
  BEFORE UPDATE ON public.disappearing_message_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- TABLE: drafts
-- Per-user local draft persistence (stored server-side for multi-device sync).
-- =============================================================================
CREATE TABLE public.drafts (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id   UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Draft body: can be plaintext (not a sent message, so less critical to encrypt,
  -- but encrypted anyway for consistency)
  encrypted_body    TEXT,
  iv                TEXT,
  body_plaintext    TEXT,         -- fallback
  reply_to_id       UUID        REFERENCES public.messages(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);

CREATE TRIGGER drafts_updated_at
  BEFORE UPDATE ON public.drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- TABLE: blocked_state
-- Mute / block state. Even for 2 users, completeness matters.
-- =============================================================================
CREATE TABLE public.blocked_state (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id),
  CONSTRAINT no_self_block CHECK (blocker_id != blocked_id)
);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Convenience view: messages with sender profile
CREATE VIEW public.messages_with_sender AS
SELECT
  m.*,
  p.display_name AS sender_display_name,
  p.avatar_url   AS sender_avatar_url
FROM public.messages m
LEFT JOIN public.profiles p ON p.id = m.sender_id;

-- =============================================================================
-- CLEANUP: Expiring messages cron job
-- This is called by a Supabase Edge Function on a schedule (or pg_cron if enabled).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.purge_expired_messages()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Soft-delete: mark as deleted rather than hard delete (preserves thread integrity)
  UPDATE public.messages
  SET
    deleted_for_everyone = true,
    deleted_at = NOW(),
    encrypted_body = NULL,
    body_plaintext = NULL,
    iv = NULL
  WHERE
    expires_at IS NOT NULL
    AND expires_at < NOW()
    AND deleted_for_everyone = false;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- =============================================================================
-- Add deferred FKs after all tables created
-- =============================================================================
ALTER TABLE public.conversation_members
  ADD CONSTRAINT fk_last_read_message
  FOREIGN KEY (last_read_message_id) REFERENCES public.messages(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
