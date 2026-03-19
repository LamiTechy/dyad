// =============================================================================
// types/database.ts — Auto-generated-style Supabase DB types
// These should be regenerated via `supabase gen types typescript` in production.
// =============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'seen' | 'failed'
export type CallStatus = 'initiating' | 'ringing' | 'active' | 'ended' | 'missed' | 'rejected' | 'failed'
export type CallType = 'voice' | 'video'
export type AttachmentType = 'image' | 'video' | 'audio' | 'document' | 'voice_note'
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'voice_note' | 'file' | 'call' | 'system' | 'link_preview'

export interface Database {
  public: {
    Tables: {
      allowed_users: {
        Row: {
          id: string
          email: string
          invited_at: string
          invited_by: string | null
          is_active: boolean
        }
        Insert: Omit<Database['public']['Tables']['allowed_users']['Row'], 'id' | 'invited_at'>
        Update: Partial<Database['public']['Tables']['allowed_users']['Insert']>
      }
      profiles: {
        Row: {
          id: string
          email: string
          display_name: string
          avatar_url: string | null
          about: string | null
          last_seen_at: string | null
          is_online: boolean
          notifications_enabled: boolean
          disappearing_messages_duration: number | null
          created_at: string
          updated_at: string
        }
        Insert: Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'email' | 'display_name'> &
          Partial<Omit<Database['public']['Tables']['profiles']['Row'], 'id' | 'email' | 'display_name'>>
        Update: Partial<Omit<Database['public']['Tables']['profiles']['Row'], 'id' | 'created_at'>>
      }
      conversations: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          last_message_id: string | null
          last_message_at: string | null
          message_count: number
          is_archived: boolean
        }
        Insert: Partial<Omit<Database['public']['Tables']['conversations']['Row'], 'id' | 'created_at' | 'updated_at' | 'message_count'>>
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>
      }
      conversation_members: {
        Row: {
          id: string
          conversation_id: string
          user_id: string
          joined_at: string
          is_muted: boolean
          muted_until: string | null
          last_read_message_id: string | null
          last_read_at: string | null
        }
        Insert: Pick<Database['public']['Tables']['conversation_members']['Row'], 'conversation_id' | 'user_id'> &
          Partial<Omit<Database['public']['Tables']['conversation_members']['Row'], 'conversation_id' | 'user_id' | 'id' | 'joined_at'>>
        Update: Partial<Omit<Database['public']['Tables']['conversation_members']['Row'], 'id' | 'conversation_id' | 'user_id' | 'joined_at'>>
      }
      device_keys: {
        Row: {
          id: string
          user_id: string
          device_id: string
          identity_public_key: Json
          prekey_bundle: Json | null
          key_fingerprint: string
          created_at: string
          last_seen_at: string
          is_current: boolean
        }
        Insert: Omit<Database['public']['Tables']['device_keys']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['device_keys']['Insert']>
      }
      messages: {
        Row: {
          id: string
          client_id: string
          conversation_id: string
          sender_id: string
          encrypted_body: string | null
          iv: string | null
          body_plaintext: string | null
          message_type: MessageType
          reply_to_id: string | null
          forwarded_from_id: string | null
          is_forwarded: boolean
          is_edited: boolean
          edited_at: string | null
          original_encrypted_body: string | null
          deleted_for_everyone: boolean
          deleted_at: string | null
          expires_at: string | null
          search_tokens: string | null
          status: MessageStatus
          sent_at: string
          created_at: string
          updated_at: string
        }
        Insert: Pick<Database['public']['Tables']['messages']['Row'], 'client_id' | 'conversation_id' | 'sender_id'> &
          Partial<Omit<Database['public']['Tables']['messages']['Row'], 'client_id' | 'conversation_id' | 'sender_id' | 'id' | 'created_at' | 'updated_at'>>
        Update: Partial<Omit<Database['public']['Tables']['messages']['Row'], 'id' | 'client_id' | 'conversation_id' | 'sender_id' | 'created_at'>>
      }
      message_receipts: {
        Row: {
          id: string
          message_id: string
          user_id: string
          delivered_at: string | null
          seen_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['message_receipts']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['message_receipts']['Insert']>
      }
      reactions: {
        Row: {
          id: string
          message_id: string
          user_id: string
          emoji: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['reactions']['Row'], 'id' | 'created_at'>
        Update: never
      }
      attachments: {
        Row: {
          id: string
          message_id: string
          conversation_id: string
          uploader_id: string
          type: AttachmentType
          storage_path: string
          thumbnail_path: string | null
          filename: string
          mime_type: string
          size_bytes: number
          width: number | null
          height: number | null
          duration_seconds: number | null
          is_encrypted: boolean
          encrypted_key: string | null
          waveform: number[] | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['attachments']['Row'], 'id' | 'created_at'>
        Update: never
      }
      pinned_messages: {
        Row: {
          id: string
          conversation_id: string
          message_id: string
          pinned_by: string
          pinned_at: string
        }
        Insert: Omit<Database['public']['Tables']['pinned_messages']['Row'], 'id' | 'pinned_at'>
        Update: never
      }
      link_previews: {
        Row: {
          id: string
          url: string
          title: string | null
          description: string | null
          image_url: string | null
          favicon_url: string | null
          site_name: string | null
          fetched_at: string
          expires_at: string
          fetch_failed: boolean
        }
        Insert: Omit<Database['public']['Tables']['link_previews']['Row'], 'id' | 'fetched_at'>
        Update: Partial<Database['public']['Tables']['link_previews']['Insert']>
      }
      call_sessions: {
        Row: {
          id: string
          conversation_id: string
          caller_id: string
          callee_id: string
          call_type: CallType
          status: CallStatus
          started_at: string
          answered_at: string | null
          ended_at: string | null
          duration_seconds: number | null
          sdp_offer: string | null
          sdp_answer: string | null
          ice_candidates_log: Json | null
        }
        Insert: Pick<Database['public']['Tables']['call_sessions']['Row'], 'conversation_id' | 'caller_id' | 'callee_id' | 'call_type'> &
          Partial<Omit<Database['public']['Tables']['call_sessions']['Row'], 'conversation_id' | 'caller_id' | 'callee_id' | 'call_type' | 'id' | 'started_at' | 'duration_seconds'>>
        Update: Partial<Omit<Database['public']['Tables']['call_sessions']['Row'], 'id' | 'conversation_id' | 'caller_id' | 'callee_id' | 'started_at' | 'duration_seconds'>>
      }
      disappearing_message_rules: {
        Row: {
          id: string
          conversation_id: string
          enabled_by: string
          duration_seconds: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['disappearing_message_rules']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Pick<Database['public']['Tables']['disappearing_message_rules']['Row'], 'duration_seconds'>>
      }
      drafts: {
        Row: {
          id: string
          conversation_id: string
          user_id: string
          encrypted_body: string | null
          iv: string | null
          body_plaintext: string | null
          reply_to_id: string | null
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['drafts']['Row'], 'id'>
        Update: Partial<Omit<Database['public']['Tables']['drafts']['Row'], 'id' | 'conversation_id' | 'user_id'>>
      }
    }
    Views: {
      messages_with_sender: {
        Row: Database['public']['Tables']['messages']['Row'] & {
          sender_display_name: string | null
          sender_avatar_url: string | null
        }
      }
    }
    Functions: {
      is_allowed_user: { Returns: boolean }
      is_conversation_member: { Args: { p_conversation_id: string }; Returns: boolean }
      purge_expired_messages: { Returns: number }
    }
  }
}

// =============================================================================
// Derived / Application-Level Types
// =============================================================================

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type MessageWithSender = Database['public']['Views']['messages_with_sender']['Row']
export type Attachment = Database['public']['Tables']['attachments']['Row']
export type Reaction = Database['public']['Tables']['reactions']['Row']
export type CallSession = Database['public']['Tables']['call_sessions']['Row']
export type DeviceKey = Database['public']['Tables']['device_keys']['Row']
export type Conversation = Database['public']['Tables']['conversations']['Row']
export type ConversationMember = Database['public']['Tables']['conversation_members']['Row']
export type PinnedMessage = Database['public']['Tables']['pinned_messages']['Row']
export type MessageReceipt = Database['public']['Tables']['message_receipts']['Row']

// Rich client-side message type with hydrated relations
export interface RichMessage extends MessageWithSender {
  attachment?: Attachment | null
  reactions: Reaction[]
  receipt?: MessageReceipt | null
  reply_to?: MessageWithSender | null
  // Decrypted body (populated by crypto layer on the client)
  decrypted_body?: string | null
  // Optimistic state
  isOptimistic?: boolean
  sendFailed?: boolean
}

export interface TypingEvent {
  user_id: string
  display_name: string
  is_typing: boolean
}

export interface PresenceState {
  user_id: string
  is_online: boolean
  last_seen_at: string
}

// WebRTC signaling event types
export type SignalingEventType =
  | 'call_offer'
  | 'call_answer'
  | 'call_reject'
  | 'call_end'
  | 'ice_candidate'
  | 'call_renegotiate'

export interface SignalingEvent {
  type: SignalingEventType
  call_id: string
  from_user_id: string
  to_user_id: string
  payload: {
    sdp?: RTCSessionDescriptionInit
    candidate?: RTCIceCandidateInit
    call_type?: CallType
  }
}
