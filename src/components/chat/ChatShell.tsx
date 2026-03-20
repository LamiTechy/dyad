'use client'
// =============================================================================
// components/chat/ChatShell.tsx — Main chat client component
// Orchestrates: messages, presence, typing, calls, E2EE bootstrap
// =============================================================================


import { useEffect, useRef, useState, useCallback } from 'react'
import { useMessages } from '@/hooks/useMessages'
import { usePresence, useCall } from '@/hooks/usePresence'
import { useCallLogs } from '@/hooks/useCallLogs'
import { getOrCreateDeviceId, generateIdentityKeyPair } from '@/lib/crypto/e2ee'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { MessageList } from './MessageList'
import { MessageComposer } from './MessageComposer'
import { ChatHeader } from './ChatHeader'
import { CallOverlay } from './CallOverlay'
import { IncomingCallToast } from './IncomingCallToast'
import { SearchPanel } from './SearchPanel'
import { PinnedMessageBanner } from './PinnedMessageBanner'
import { WallpaperPicker } from './WallpaperPicker'
import type { Profile, RichMessage } from '@/types/database'

interface ChatShellProps {
  conversationId: string
  myUserId: string
  myProfile: Profile
  peerProfile: { id: string; display_name: string; avatar_url: string | null; is_online: boolean; last_seen_at: string | null } | null
  peerDeviceKeyJwk: JsonWebKey | null
}

export function ChatShell({
  conversationId,
  myUserId,
  myProfile,
  peerProfile,
  peerDeviceKeyJwk: initialPeerKeyJwk,
}: ChatShellProps) {
  const supabase = getSupabaseBrowserClient()
  const [myDeviceId, setMyDeviceId] = useState<string>('')
  const [peerPublicKeyJwk, setPeerPublicKeyJwk] = useState<JsonWebKey | null>(initialPeerKeyJwk)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<RichMessage | null>(null)
  const [editingMessage, setEditingMessage] = useState<RichMessage | null>(null)
  const [e2eeReady, setE2eeReady] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // ===========================================================================
  // E2EE Bootstrap
  // ===========================================================================

  useEffect(() => {
    async function bootstrapE2EE() {
      const deviceId = getOrCreateDeviceId()
      setMyDeviceId(deviceId)

      // Check if we already have keys for this device in DB
      const { data: existing } = await supabase
        .from('device_keys')
        .select('id')
        .eq('user_id', myUserId)
        .eq('device_id', deviceId)
        .single()

      if (!existing) {
        // Generate and publish new keypair
        const { publicKeyJwk, fingerprint } = await generateIdentityKeyPair(deviceId)
        await (supabase as any).from('device_keys').upsert({
          user_id: myUserId,
          device_id: deviceId,
          identity_public_key: publicKeyJwk,
          key_fingerprint: fingerprint,
          is_current: true,
        })
      }

      // Subscribe to peer key updates
      const channel = supabase
        .channel(`device-keys:${conversationId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'device_keys',
          filter: peerProfile ? `user_id=eq.${peerProfile.id}` : '',
        }, (payload) => {
          const key = payload.new as { identity_public_key: JsonWebKey; is_current: boolean }
          if (key.is_current) setPeerPublicKeyJwk(key.identity_public_key)
        })
        .subscribe()

      setE2eeReady(true)

      return () => { supabase.removeChannel(channel) }
    }

    bootstrapE2EE()
  }, [myUserId, conversationId, peerProfile?.id])

  // ===========================================================================
  // Messages
  // ===========================================================================

  const {
    messages,
    isLoading,
    isRealtimeConnected,
    loadMore,
    hasMore,
    isLoadingMore,
    sendMessage,
    isSending,
    editMessage,
    deleteMessage,
    reactToMessage,
    markSeen,
    pinMessage,
  } = useMessages({
    conversationId,
    myUserId,
    myDeviceId,
    peerPublicKeyJwk,
  })

  // ===========================================================================
  // Call Logs
  // ===========================================================================

  const { callLogs } = useCallLogs({
    conversationId,
  })

  // ===========================================================================
  // Presence & Typing
  // ===========================================================================

  const { peerPresence, isPeerTyping, broadcastTyping } = usePresence({
    conversationId,
    myUserId,
    myDisplayName: myProfile.display_name,
  })

  // ===========================================================================
  // Calls
  // ===========================================================================

  const {
    callUI,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
  } = useCall({
    conversationId,
    myUserId,
    peerUserId: peerProfile?.id ?? '',
    peerDisplayName: peerProfile?.display_name ?? 'Other',
  })

  // ===========================================================================
  // Auto-scroll to bottom on new messages
  // ===========================================================================

  const isAtBottom = useRef(true)
  useEffect(() => {
    if (isAtBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const threshold = 100
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold

    // Load more when scrolled to top
    if (el.scrollTop < 200 && hasMore && !isLoadingMore) {
      loadMore()
    }
  }, [hasMore, isLoadingMore, loadMore])

  // Mark last message seen when focused
  useEffect(() => {
    const lastMsg = messages[messages.length - 1]
    if (lastMsg && lastMsg.sender_id !== myUserId && isAtBottom.current) {
      markSeen(lastMsg.id)
    }
  }, [messages, myUserId])

  // ===========================================================================
  // Message actions
  // ===========================================================================

  const handleSend = async (body: string) => {
    if (!body.trim()) return
    await sendMessage({
      conversationId,
      body: body.trim(),
      replyToId: replyTo?.id,
    })
    setReplyTo(null)
  }

  const handleEdit = async (newBody: string) => {
    if (!editingMessage || !newBody.trim()) return
    await editMessage({ messageId: editingMessage.id, newBody: newBody.trim() })
    setEditingMessage(null)
  }

  const handleDelete = async (messageId: string, forEveryone: boolean) => {
    await deleteMessage({ messageId, forEveryone })
  }

  // Fetch pinned messages with realtime updates
  const [pinnedMessages, setPinnedMessages] = useState<RichMessage[]>([])

  const fetchPinned = async () => {
    const { data } = await (supabase as any)
      .from('pinned_messages')
      .select('message_id, messages_with_sender(*)')
      .eq('conversation_id', conversationId)
      .order('pinned_at', { ascending: false })
    if (data) {
      setPinnedMessages(data.map((d: any) => d.messages_with_sender as unknown as RichMessage).filter(Boolean))
    }
  }

  useEffect(() => {
    fetchPinned()

    // Realtime subscription
    const channel = supabase
      .channel(`pinned:${conversationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pinned_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, () => {
        fetchPinned()
      })
      .subscribe()

    // Poll every 3 seconds as fallback
    const poll = setInterval(fetchPinned, 3000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
  }, [conversationId])

  // Wallpaper
  const [wallpaper, setWallpaper] = useState<string | null>(null)
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false)

  useEffect(() => {
    // Fetch initial wallpaper
    (supabase as any).from('conversations').select('wallpaper_url').eq('id', conversationId).single()
      .then(({ data }: any) => { if (data?.wallpaper_url) setWallpaper(data.wallpaper_url) })

    // Subscribe to wallpaper changes
    const channel = supabase.channel(`wallpaper:${conversationId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'conversations',
        filter: `id=eq.${conversationId}`,
      }, (payload) => {
        const w = (payload.new as { wallpaper_url: string | null }).wallpaper_url
        setWallpaper(w ?? null)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId])

  const effectivePeerPresence = peerProfile
    ? {
        user_id: peerProfile.id,
        is_online: peerPresence?.is_online ?? peerProfile.is_online,
        last_seen_at: peerPresence?.last_seen_at ?? peerProfile.last_seen_at ?? '',
      }
    : null

  return (
    <div className="flex flex-col h-[100dvh]" style={{ backgroundImage: wallpaper && wallpaper.startsWith("linear-gradient") ? wallpaper : wallpaper ? `url(${wallpaper})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}>
      {/* Header */}
      <ChatHeader
        peerUserId={peerProfile?.id ?? null}
        peerProfile={peerProfile}
        peerPresence={effectivePeerPresence}
        isPeerTyping={isPeerTyping}
        isRealtimeConnected={isRealtimeConnected}
        e2eeReady={e2eeReady}
        onSearchOpen={() => setIsSearchOpen(true)}
        onVoiceCall={() => initiateCall('voice')}
        onWallpaperOpen={() => setShowWallpaperPicker(true)}
        onVideoCall={() => initiateCall('video')}
      />

      {/* Pinned messages */}
      {pinnedMessages.length > 0 && (
        <PinnedMessageBanner
          messages={pinnedMessages}
          conversationId={conversationId}
        />
      )}

      {/* Message list */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto overscroll-contain bg-transparent"
        onScroll={handleScroll}
      >
        <MessageList
          messages={messages}
          callLogs={callLogs}
          myUserId={myUserId}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          onReply={setReplyTo}
          onEdit={setEditingMessage}
          onDelete={handleDelete}
          onReact={reactToMessage}
          onPin={pinMessage}
        />
        <div ref={bottomRef} />
      </div>

      {/* Reply / Edit preview */}
      {(replyTo || editingMessage) && (
        <div className="px-4 py-2 bg-neutral-900 border-t border-neutral-800 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-violet-400 font-medium mb-0.5">
              {editingMessage ? 'Editing message' : `Replying to ${replyTo?.sender_display_name ?? 'message'}`}
            </div>
            <p className="text-sm text-neutral-400 truncate">
              {editingMessage
                ? editingMessage.decrypted_body ?? editingMessage.body_plaintext
                : replyTo?.decrypted_body ?? replyTo?.body_plaintext}
            </p>
          </div>
          <button
            onClick={() => { setReplyTo(null); setEditingMessage(null) }}
            className="text-neutral-500 hover:text-neutral-300 p-1 shrink-0"
            aria-label="Cancel"
          >
            ✕
          </button>
        </div>
      )}

      {/* Composer */}
      <MessageComposer
        conversationId={conversationId}
        myUserId={myUserId}
        myDeviceId={myDeviceId}
        peerPublicKeyJwk={peerPublicKeyJwk}
        editingMessage={editingMessage}
        onSend={editingMessage ? handleEdit : handleSend}
        onTyping={broadcastTyping}
        isSending={isSending}
      />

      {/* Call overlay */}
      {callUI.state !== 'idle' && callUI.state !== 'ended' && (
        <CallOverlay
          callUI={callUI}
          myProfile={myProfile}
          peerProfile={peerProfile}
          onAccept={acceptCall}
          onReject={rejectCall}
          onEnd={endCall}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
        />
      )}

      {/* Incoming call toast */}
      {callUI.incomingCallEvent && callUI.state === 'ringing' && (
        <IncomingCallToast
          peerName={peerProfile?.display_name ?? 'Unknown'}
          callType={callUI.callType ?? 'voice'}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      {/* Wallpaper picker */}
      {showWallpaperPicker && (
        <WallpaperPicker
          conversationId={conversationId}
          myUserId={myUserId}
          currentWallpaper={wallpaper}
          onClose={() => setShowWallpaperPicker(false)}
          onWallpaperChange={setWallpaper}
        />
      )}

      {/* Search panel */}
      {isSearchOpen && (
        <SearchPanel
          conversationId={conversationId}
          onClose={() => setIsSearchOpen(false)}
        />
      )}
    </div>
  )
}