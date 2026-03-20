'use client'
// =============================================================================
// hooks/usePresence.ts — Online presence & typing indicators via Supabase Realtime
// =============================================================================


import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { PresenceState, TypingEvent } from '@/types/database'

interface UsePresenceOptions {
  conversationId: string
  myUserId: string
  myDisplayName: string
}

export function usePresence({
  conversationId,
  myUserId,
  myDisplayName,
}: UsePresenceOptions) {
  const supabase = getSupabaseBrowserClient()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const [peerPresence, setPeerPresence] = useState<PresenceState | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const channel = supabase.channel(`presence:${conversationId}`, {
      config: { presence: { key: myUserId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ user_id: string; is_online: boolean; last_seen_at: string }>()
        const others = Object.entries(state)
          .filter(([key]) => key !== myUserId)
          .map(([, entries]) => entries[0])

        if (others.length > 0) {
          setPeerPresence({
            user_id: others[0].user_id,
            is_online: others[0].is_online,
            last_seen_at: others[0].last_seen_at,
          })
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (key !== myUserId) {
          setPeerPresence(prev => prev ? { ...prev, is_online: false, last_seen_at: new Date().toISOString() } : null)
        }
      })
      .on('broadcast', { event: 'typing' }, ({ payload }: { payload: TypingEvent }) => {
        if (payload.user_id !== myUserId) {
          setIsTyping(payload.is_typing)

          // Auto-clear typing after 3s if no update
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
          if (payload.is_typing) {
            typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000)
          }
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: myUserId,
            is_online: true,
            last_seen_at: new Date().toISOString(),
          })

          // Update profile online status
          await (supabase as any)
            .from('profiles')
            .update({ is_online: true, last_seen_at: new Date().toISOString() })
            .eq('id', myUserId)
            .then(({ error }: any) => {
              if (error) console.error('[Presence] Failed to update online status:', error)
            })
        }
      })

    channelRef.current = channel

    // Mark offline on unload
    const handleUnload = () => {
      channel.untrack();
      (supabase as any).from('profiles').update({ is_online: false, last_seen_at: new Date().toISOString() }).eq('id', myUserId)
    }
    window.addEventListener('beforeunload', handleUnload)

    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      supabase.removeChannel(channel)
    }
  }, [conversationId, myUserId])

  const broadcastTyping = useCallback(
    (typing: boolean) => {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          user_id: myUserId,
          display_name: myDisplayName,
          is_typing: typing,
        } satisfies TypingEvent,
      })
    },
    [myUserId, myDisplayName]
  )

  return { peerPresence, isPeerTyping: isTyping, broadcastTyping }
}

// =============================================================================
// hooks/useCall.ts — WebRTC call hook
// =============================================================================

import type { CallType, SignalingEvent } from '@/types/database'
import { CallService, type CallState } from '@/lib/webrtc/callService'

interface UseCallOptions {
  conversationId: string
  myUserId: string
  peerUserId: string
  peerDisplayName: string
}

export interface CallUI {
  state: CallState
  callType: CallType | null
  callId: string | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  isMuted: boolean
  isCameraOff: boolean
  incomingCallEvent: SignalingEvent | null
  duration: number // seconds
}

export function useCall({
  conversationId,
  myUserId,
  peerUserId,
  peerDisplayName: _peerDisplayName,
}: UseCallOptions) {
  const supabase = getSupabaseBrowserClient()
  const serviceRef = useRef<CallService | null>(null)
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [callUI, setCallUI] = useState<CallUI>({
    state: 'idle',
    callType: null,
    callId: null,
    localStream: null,
    remoteStream: null,
    isMuted: false,
    isCameraOff: false,
    incomingCallEvent: null,
    duration: 0,
  })

  const updateUI = (updates: Partial<CallUI>) =>
    setCallUI(prev => ({ ...prev, ...updates }))

  // Setup signaling channel + call service
  useEffect(() => {
    const channel = supabase.channel(`calls:${conversationId}`)

    channel.on('broadcast', { event: 'signaling' }, ({ payload }: { payload: SignalingEvent }) => {
      if (payload.to_user_id !== myUserId) return

      switch (payload.type) {
        case 'call_offer':
          updateUI({ incomingCallEvent: payload, state: 'ringing', callId: payload.call_id, callType: payload.payload.call_type ?? 'voice' })
          break

        case 'call_answer':
          serviceRef.current?.handleAnswer(payload.payload.sdp!)
          updateUI({ state: 'active' })
          startDurationTimer()
          break

        case 'call_reject':
          updateUI({ state: 'ended' })
          serviceRef.current?.cleanup()
          resetAfterDelay()
          break

        case 'call_end':
          updateUI({ state: 'ended' })
          serviceRef.current?.cleanup()
          stopDurationTimer()
          resetAfterDelay()
          break

        case 'ice_candidate':
          serviceRef.current?.handleIceCandidate(payload.payload.candidate!)
          break

        case 'call_renegotiate':
          if (serviceRef.current) {
            serviceRef.current.handleAnswer(payload.payload.sdp!)
          }
          break
      }
    })

    channel.subscribe()
    signalingChannelRef.current = channel

    // Initialize CallService
    serviceRef.current = new CallService(myUserId, peerUserId, {
      onStateChange: (state) => {
        updateUI({ state })
        if (state === 'active') startDurationTimer()
        if (state === 'ended' || state === 'failed') stopDurationTimer()
      },
      onRemoteStream: (stream) => updateUI({ remoteStream: stream }),
      onRemoteStreamRemoved: () => updateUI({ remoteStream: null }),
      onError: (err) => console.error('[Call] Error:', err),
      onIncomingCall: (event) => updateUI({ incomingCallEvent: event }),
      onCallEnded: () => resetAfterDelay(),
    })
    serviceRef.current.setSignalingChannel(channel)

    return () => {
      supabase.removeChannel(channel)
      serviceRef.current?.cleanup()
      stopDurationTimer()
    }
  }, [conversationId, myUserId, peerUserId])

  const startDurationTimer = () => {
    if (durationTimerRef.current) return
    durationTimerRef.current = setInterval(() => {
      setCallUI(prev => ({ ...prev, duration: prev.duration + 1 }))
    }, 1000)
  }

  const stopDurationTimer = () => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current)
      durationTimerRef.current = null
    }
  }

  const resetAfterDelay = () => {
    setTimeout(() => {
      setCallUI({
        state: 'idle',
        callType: null,
        callId: null,
        localStream: null,
        remoteStream: null,
        isMuted: false,
        isCameraOff: false,
        incomingCallEvent: null,
        duration: 0,
      })
    }, 2000)
  }

  const initiateCall = async (callType: CallType) => {
    // Create call session in DB
    const { data: callSession } = await (supabase as any)
      .from('call_sessions')
      .insert({
        conversation_id: conversationId,
        caller_id: myUserId,
        callee_id: peerUserId,
        call_type: callType,
        status: 'initiating',
      })
      .select()
      .single()

    if (!callSession) throw new Error('Failed to create call session')

    updateUI({
      state: 'initiating',
      callType,
      callId: callSession.id,
      duration: 0,
    })

    await serviceRef.current?.initiateCall(callSession.id, callType)
    const localStream = serviceRef.current?.getLocalStream()
    if (localStream) updateUI({ localStream })
  }

  const acceptCall = async () => {
    const { incomingCallEvent } = callUI
    if (!incomingCallEvent) return

    const localStream = await serviceRef.current?.acceptCall(
      incomingCallEvent.call_id,
      incomingCallEvent.payload.call_type ?? 'voice',
      incomingCallEvent.payload.sdp!
    )

    if (localStream) updateUI({ localStream, incomingCallEvent: null })

    // Update DB
    await (supabase as any)
      .from('call_sessions')
      .update({ status: 'active', answered_at: new Date().toISOString() })
      .eq('id', incomingCallEvent.call_id)
  }

  const rejectCall = async () => {
    if (!callUI.callId || !callUI.incomingCallEvent) return
    await serviceRef.current?.rejectCall(callUI.callId)

    await (supabase as any)
      .from('call_sessions')
      .update({ status: 'rejected', ended_at: new Date().toISOString() })
      .eq('id', callUI.callId)

    resetAfterDelay()
  }

  const endCall = async () => {
    await serviceRef.current?.endCall()
    if (callUI.callId) {
      await (supabase as any)
        .from('call_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', callUI.callId)
    }
    stopDurationTimer()
  }

  const toggleMute = () => {
    const newMuted = !callUI.isMuted
    serviceRef.current?.toggleMicrophone(!newMuted)
    updateUI({ isMuted: newMuted })
  }

  const toggleCamera = () => {
    const newOff = !callUI.isCameraOff
    serviceRef.current?.toggleCamera(!newOff)
    updateUI({ isCameraOff: newOff })
  }

  return {
    callUI,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
  }
}