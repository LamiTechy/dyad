'use client'

import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { PhoneIcon, VideoIcon, SearchIcon, SettingsIcon, PictureIcon, LockIcon } from '@/components/ui/Icons'
import { MobileMenu } from './MobileMenu'
import type { PresenceState } from '@/types/database'

interface ChatHeaderProps {
  peerUserId: string | null
  peerProfile: { display_name: string; avatar_url: string | null } | null
  peerPresence: PresenceState | null
  isPeerTyping: boolean
  isRealtimeConnected: boolean
  e2eeReady: boolean
  onSearchOpen: () => void
  onVoiceCall: () => void
  onVideoCall: () => void
  onWallpaperOpen?: () => void
}

export function Avatar({
  name,
  url,
  size = 36,
}: {
  name: string
  url: string | null
  size?: number
}) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="rounded-full object-cover shrink-0 ring-2 ring-pink-500/30"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className="rounded-full bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white font-semibold shrink-0 ring-2 ring-pink-500/30"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials || '?'}
    </div>
  )
}

export function ChatHeader({
  peerUserId,
  peerProfile: initialPeerProfile,
  peerPresence,
  isPeerTyping,
  isRealtimeConnected,
  e2eeReady,
  onSearchOpen,
  onVoiceCall,
  onVideoCall,
  onWallpaperOpen,
}: ChatHeaderProps) {
  const supabase = getSupabaseBrowserClient()
  const [peerProfile, setPeerProfile] = useState(initialPeerProfile)
  const [isOnline, setIsOnline] = useState(false)
  const [lastSeen, setLastSeen] = useState<string | null>(null)

  // Fetch peer profile client-side
  useEffect(() => {
    if (!peerUserId) return

    supabase
      .from('profiles')
      .select('display_name, avatar_url, is_online, last_seen_at')
      .eq('id', peerUserId)
      .single()
      .then(({ data }: any) => {
        if (data) {
          setPeerProfile({ display_name: data.display_name, avatar_url: data.avatar_url })
          setIsOnline(data.is_online)
          setLastSeen(data.last_seen_at)
        }
      })

    // Listen for profile updates
    const profileChannel = supabase
      .channel(`profile_updates_${peerUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${peerUserId}`,
        },
        (payload) => {
          const u = payload.new as {
            display_name: string
            avatar_url: string | null
            is_online: boolean
            last_seen_at: string | null
          }
          setPeerProfile({ display_name: u.display_name, avatar_url: u.avatar_url })
          setIsOnline(u.is_online)
          setLastSeen(u.last_seen_at)
        }
      )
      .subscribe()

    // Poll every 8s as fallback
    const pollInterval = setInterval(() => {
      supabase
        .from('profiles')
        .select('is_online, last_seen_at, display_name, avatar_url')
        .eq('id', peerUserId)
        .single()
        .then(({ data }: any) => {
          if (data) {
            setIsOnline(data.is_online)
            setLastSeen(data.last_seen_at)
            setPeerProfile({ display_name: data.display_name, avatar_url: data.avatar_url })
          }
        })
    }, 8000)

    return () => {
      clearInterval(pollInterval)
      supabase.removeChannel(profileChannel)
    }
  }, [peerUserId])

  // Override with realtime presence if available (more accurate)
  useEffect(() => {
    if (peerPresence) {
      setIsOnline(peerPresence.is_online)
      if (peerPresence.last_seen_at) setLastSeen(peerPresence.last_seen_at)
    }
  }, [peerPresence])

  const presenceText = () => {
    if (isPeerTyping) return <span className="text-pink-400 animate-pulse">typing...</span>
    if (isOnline) return <span className="text-pink-400">online</span>
    if (lastSeen) {
      return (
        <span className="text-neutral-500">
          last seen {formatDistanceToNow(new Date(lastSeen), { addSuffix: true })}
        </span>
      )
    }
    return <span className="text-neutral-600">offline</span>
  }

  return (
    <header className="glass flex items-center gap-3 px-4 py-3 border-b border-pink-500/10 shrink-0">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="relative">
          <Avatar
            name={peerProfile?.display_name ?? '?'}
            url={peerProfile?.avatar_url ?? null}
            size={38}
          />
          {isOnline && (
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-pink-400 border-2 border-neutral-950 rounded-full animate-pulse" />
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-neutral-100 truncate">
            {peerProfile?.display_name ?? '...'}
          </h1>
          <p className="text-xs truncate">{presenceText()}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {e2eeReady && (
          <div title="End-to-end encrypted" className="p-1">
            <LockIcon size={16} color="#10b981" />
          </div>
        )}
        {!isRealtimeConnected && (
          <div title="Reconnecting..." className="p-1 animate-pulse">
            <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {/* Call buttons - always visible */}
        <button
          onClick={onVoiceCall}
          className="p-2 text-neutral-500 hover:text-pink-400 hover:bg-pink-500/10 rounded-full transition-all duration-300"
          title="Voice call"
        >
          <PhoneIcon size={20} color="currentColor" />
        </button>
        <button
          onClick={onVideoCall}
          className="p-2 text-neutral-500 hover:text-pink-400 hover:bg-pink-500/10 rounded-full transition-all duration-300"
          title="Video call"
        >
          <VideoIcon size={20} color="currentColor" />
        </button>

        {/* Desktop action buttons - hidden on mobile */}
        <div className="hidden md:flex items-center gap-1">
          <button
            onClick={onSearchOpen}
            className="p-2 text-neutral-500 hover:text-pink-400 hover:bg-pink-500/10 rounded-full transition-all duration-300"
            title="Search"
          >
            <SearchIcon size={20} color="currentColor" />
          </button>
          {onWallpaperOpen && (
            <button
              onClick={onWallpaperOpen}
              className="p-2 text-neutral-500 hover:text-pink-400 hover:bg-pink-500/10 rounded-full transition-all duration-300"
              title="Set wallpaper"
            >
              <PictureIcon size={20} color="currentColor" />
            </button>
          )}
          <Link
            href="/setup"
            className="p-2 text-neutral-500 hover:text-pink-400 hover:bg-pink-500/10 rounded-full transition-all duration-300"
            title="Settings"
          >
            <SettingsIcon size={20} color="currentColor" />
          </Link>
        </div>

        {/* Mobile menu - hidden on desktop */}
        <div className="md:hidden">
          <MobileMenu
            onSearchOpen={onSearchOpen}
            onWallpaperOpen={onWallpaperOpen}
          />
        </div>
      </div>
    </header>
  )
}