// =============================================================================
// components/chat/ChatHeader.tsx
// =============================================================================

'use client'

import { format, formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import type { PresenceState } from '@/types/database'

interface ChatHeaderProps {
  peerProfile: { display_name: string; avatar_url: string | null } | null
  peerPresence: PresenceState | null
  isPeerTyping: boolean
  isRealtimeConnected: boolean
  e2eeReady: boolean
  onSearchOpen: () => void
  onVoiceCall: () => void
  onVideoCall: () => void
}

function Avatar({ name, url, size = 36 }: { name: string; url: string | null; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div
      className="rounded-full bg-violet-600 flex items-center justify-center text-white font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  )
}

export function ChatHeader({
  peerProfile,
  peerPresence,
  isPeerTyping,
  isRealtimeConnected,
  e2eeReady,
  onSearchOpen,
  onVoiceCall,
  onVideoCall,
}: ChatHeaderProps) {
  const presenceText = () => {
    if (isPeerTyping) return <span className="text-green-400 animate-pulse">typing...</span>
    if (peerPresence?.is_online) return <span className="text-green-400">online</span>
    if (peerPresence?.last_seen_at) {
      return (
        <span className="text-neutral-500">
          last seen {formatDistanceToNow(new Date(peerPresence.last_seen_at), { addSuffix: true })}
        </span>
      )
    }
    return null
  }

  return (
    <header className="flex items-center gap-3 px-4 py-3 bg-neutral-950 border-b border-neutral-900 shrink-0">
      {/* Back (mobile) */}
      <Link href="/" className="md:hidden text-neutral-500 hover:text-white p-1 -ml-2">
        ←
      </Link>

      {/* Avatar + info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="relative">
          <Avatar
            name={peerProfile?.display_name ?? '?'}
            url={peerProfile?.avatar_url ?? null}
            size={38}
          />
          {peerPresence?.is_online && (
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 border-2 border-neutral-950 rounded-full" />
          )}
        </div>

        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-neutral-100 truncate">
            {peerProfile?.display_name ?? 'Loading...'}
          </h1>
          <p className="text-xs truncate">{presenceText()}</p>
        </div>
      </div>

      {/* Status indicators */}
      <div className="flex items-center gap-2 shrink-0">
        {e2eeReady && (
          <span title="End-to-end encrypted" className="text-green-500 text-xs">🔒</span>
        )}
        {!isRealtimeConnected && (
          <span title="Reconnecting..." className="text-yellow-500 text-xs animate-pulse">⚡</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onVoiceCall}
          className="p-2 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 rounded-full transition-colors"
          title="Voice call"
        >
          📞
        </button>
        <button
          onClick={onVideoCall}
          className="p-2 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 rounded-full transition-colors"
          title="Video call"
        >
          🎥
        </button>
        <button
          onClick={onSearchOpen}
          className="p-2 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 rounded-full transition-colors"
          title="Search messages"
        >
          🔍
        </button>
        <Link
          href="/setup"
          className="p-2 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 rounded-full transition-colors"
          title="Settings"
        >
          ⚙️
        </Link>
      </div>
    </header>
  )
}

// =============================================================================
// components/chat/CallOverlay.tsx
// =============================================================================

import type { CallUI } from '@/hooks/usePresence'
import type { Profile } from '@/types/database'

interface CallOverlayProps {
  callUI: CallUI
  myProfile: Profile
  peerProfile: { display_name: string; avatar_url: string | null } | null
  onAccept: () => void
  onReject: () => void
  onEnd: () => void
  onToggleMute: () => void
  onToggleCamera: () => void
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function CallOverlay({
  callUI,
  myProfile,
  peerProfile,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleCamera,
}: CallOverlayProps) {
  const localVideoRef = (el: HTMLVideoElement | null) => {
    if (el && callUI.localStream) el.srcObject = callUI.localStream
  }
  const remoteVideoRef = (el: HTMLVideoElement | null) => {
    if (el && callUI.remoteStream) el.srcObject = callUI.remoteStream
  }

  const isVideo = callUI.callType === 'video'
  const isActive = callUI.state === 'active'
  const isConnecting = ['initiating', 'ringing', 'connecting', 'reconnecting'].includes(callUI.state)

  return (
    <div className="fixed inset-0 z-40 bg-neutral-950 flex flex-col">
      {/* Video streams */}
      {isVideo && callUI.remoteStream && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Non-video / overlay */}
      <div className={`flex flex-col items-center justify-center flex-1 gap-6 relative z-10 ${isVideo && isActive ? 'justify-end pb-24' : ''}`}>
        {/* Peer info */}
        {(!isVideo || !isActive) && (
          <>
            <Avatar
              name={peerProfile?.display_name ?? '?'}
              url={peerProfile?.avatar_url ?? null}
              size={96}
            />
            <div className="text-center">
              <h2 className="text-xl font-semibold text-white">{peerProfile?.display_name ?? '...'}</h2>
              <p className="text-neutral-400 mt-1">
                {callUI.state === 'ringing' && (callUI.incomingCallEvent ? 'Incoming call...' : 'Ringing...')}
                {callUI.state === 'initiating' && 'Calling...'}
                {callUI.state === 'connecting' && 'Connecting...'}
                {callUI.state === 'reconnecting' && 'Reconnecting...'}
                {callUI.state === 'active' && `${isVideo ? '📹' : '📞'} ${formatDuration(callUI.duration)}`}
                {callUI.state === 'ended' && 'Call ended'}
              </p>
            </div>
          </>
        )}

        {/* Self video (small PiP) */}
        {isVideo && callUI.localStream && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`rounded-xl object-cover border-2 border-neutral-800 ${
              isActive ? 'absolute top-4 right-4 w-24 h-36' : 'w-32 h-48 mt-4'
            }`}
          />
        )}
      </div>

      {/* Call controls */}
      <div className="absolute bottom-12 left-0 right-0 flex items-center justify-center gap-6 z-20">
        {isConnecting && callUI.incomingCallEvent && (
          <>
            <button
              onClick={onReject}
              className="w-16 h-16 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center text-white text-2xl shadow-xl"
            >
              ✕
            </button>
            <button
              onClick={onAccept}
              className="w-16 h-16 bg-green-600 hover:bg-green-500 rounded-full flex items-center justify-center text-white text-2xl shadow-xl"
            >
              📞
            </button>
          </>
        )}

        {isActive && (
          <>
            <button
              onClick={onToggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-xl shadow-lg
                ${callUI.isMuted ? 'bg-red-600' : 'bg-neutral-700 hover:bg-neutral-600'}`}
            >
              {callUI.isMuted ? '🔇' : '🎤'}
            </button>

            {isVideo && (
              <button
                onClick={onToggleCamera}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-xl shadow-lg
                  ${callUI.isCameraOff ? 'bg-red-600' : 'bg-neutral-700 hover:bg-neutral-600'}`}
              >
                {callUI.isCameraOff ? '🚫' : '📹'}
              </button>
            )}

            <button
              onClick={onEnd}
              className="w-16 h-16 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center text-white text-2xl shadow-xl"
            >
              📵
            </button>
          </>
        )}

        {callUI.state === 'initiating' || (callUI.state === 'ringing' && !callUI.incomingCallEvent) ? (
          <button
            onClick={onEnd}
            className="w-16 h-16 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center text-white text-2xl shadow-xl"
          >
            📵
          </button>
        ) : null}
      </div>
    </div>
  )
}

// =============================================================================
// components/chat/IncomingCallToast.tsx
// =============================================================================

import type { CallType } from '@/types/database'

interface IncomingCallToastProps {
  peerName: string
  callType: CallType
  onAccept: () => void
  onReject: () => void
}

export function IncomingCallToast({ peerName, callType, onAccept, onReject }: IncomingCallToastProps) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl p-4 flex items-center gap-4 min-w-[280px] animate-slide-down">
      <div className="flex-1">
        <p className="font-semibold text-white text-sm">{peerName}</p>
        <p className="text-neutral-400 text-xs">{callType === 'video' ? '📹 Incoming video call' : '📞 Incoming voice call'}</p>
      </div>
      <button onClick={onReject} className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white">✕</button>
      <button onClick={onAccept} className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white">✓</button>
    </div>
  )
}

// =============================================================================
// components/chat/SearchPanel.tsx
// =============================================================================

import { useState, useRef } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

interface SearchPanelProps {
  conversationId: string
  onClose: () => void
}

export function SearchPanel({ conversationId, onClose }: SearchPanelProps) {
  const supabase = getSupabaseBrowserClient()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; body_plaintext: string | null; created_at: string }[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setIsSearching(true)
    const { data } = await supabase
      .from('messages')
      .select('id, body_plaintext, created_at')
      .eq('conversation_id', conversationId)
      .eq('deleted_for_everyone', false)
      .ilike('body_plaintext', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(20)
    setResults(data ?? [])
    setIsSearching(false)
  }

  const handleChange = (v: string) => {
    setQuery(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(v), 400)
  }

  // Note: E2EE messages can't be searched server-side.
  // A production implementation would maintain a client-side full-text search index
  // (e.g. MiniSearch or FlexSearch) over decrypted messages in memory.

  return (
    <div className="fixed inset-0 z-30 bg-neutral-950 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-900">
        <input
          autoFocus
          type="text"
          placeholder="Search messages..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          className="flex-1 bg-neutral-900 text-neutral-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <button onClick={onClose} className="text-neutral-500 hover:text-white p-2">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isSearching && <div className="text-center py-8 text-neutral-600">Searching...</div>}
        {!isSearching && query && results.length === 0 && (
          <div className="text-center py-8 text-neutral-600">No results found</div>
        )}
        {!isSearching && query && (
          <p className="text-xs text-neutral-600 px-4 py-2">
            Note: End-to-end encrypted messages require client-side search.
          </p>
        )}
        {results.map(r => (
          <div key={r.id} className="px-4 py-3 border-b border-neutral-900 hover:bg-neutral-900 cursor-pointer">
            <p className="text-sm text-neutral-200 truncate">{r.body_plaintext}</p>
            <p className="text-xs text-neutral-600 mt-0.5">{format(new Date(r.created_at), 'MMM d, yyyy HH:mm')}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// =============================================================================
// components/chat/PinnedMessageBanner.tsx
// =============================================================================

interface PinnedMessageBannerProps {
  messages: { id: string; decrypted_body?: string | null; body_plaintext?: string | null }[]
  conversationId: string
}

export function PinnedMessageBanner({ messages }: PinnedMessageBannerProps) {
  const [idx, setIdx] = useState(0)
  const current = messages[idx % messages.length]

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 bg-neutral-900 border-b border-neutral-800 cursor-pointer"
      onClick={() => setIdx(i => (i + 1) % messages.length)}
    >
      <div className="w-0.5 h-8 bg-violet-500 rounded-full shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-violet-400 font-medium mb-0.5">
          Pinned Message {messages.length > 1 && `${idx + 1}/${messages.length}`}
        </p>
        <p className="text-xs text-neutral-300 truncate">
          {current?.decrypted_body ?? current?.body_plaintext ?? '📎 Attachment'}
        </p>
      </div>
    </div>
  )
}

// Re-export Avatar for use in CallOverlay
export { Avatar }
