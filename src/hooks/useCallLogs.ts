'use client'

import { useEffect, useState, useRef } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { CallLog } from '@/components/chat/CallLogItem'

interface UseCallLogsProps {
  conversationId: string
}

export function useCallLogs({ conversationId }: UseCallLogsProps) {
  const supabase = getSupabaseBrowserClient()
  const [callLogs, setCallLogs] = useState<CallLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchCalls = async () => {
    try {
      const { data, error } = await supabase
        .from('call_sessions')
        .select(`
          id,
          conversation_id,
          caller_id,
          callee_id,
          call_type,
          status,
          started_at,
          answered_at,
          ended_at,
          duration_seconds
        `)
        .eq('conversation_id', conversationId)
        .order('started_at', { ascending: false })
        .limit(100)

      if (error) {
        console.error('Failed to fetch call logs:', error)
        return
      }

      if (data) {
        setCallLogs((data as unknown as CallLog[]).reverse()) // Reverse for chronological order (oldest first)
      }
    } catch (err) {
      console.error('Error fetching call logs:', err)
    }
  }

  // Fetch call logs and set up realtime
  useEffect(() => {
    setIsLoading(true)
    fetchCalls().finally(() => setIsLoading(false))

    // Subscribe to new calls and updates
    const channel = supabase
      .channel(`calls:${conversationId}-${Date.now()}`, {
        config: { broadcast: { self: true } },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_sessions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newCall = payload.new as CallLog
          setCallLogs((prev) => {
            // Check if call already exists
            if (prev.some((c) => c.id === newCall.id)) {
              return prev
            }
            return [newCall, ...prev].reverse().sort((a, b) => {
              return new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
            })
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_sessions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedCall = payload.new as CallLog
          setCallLogs((prev) =>
            prev.map((call) => (call.id === updatedCall.id ? updatedCall : call))
          )
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Call logs realtime subscribed')
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.log('Call logs subscription error, will use polling fallback')
        }
      })

    channelRef.current = channel

    // Polling fallback every 5 seconds
    const pollInterval = setInterval(fetchCalls, 5000)

    return () => {
      clearInterval(pollInterval)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [conversationId])

  return { callLogs, isLoading }
}
