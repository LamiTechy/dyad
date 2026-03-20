'use client'

import { useEffect } from 'react'
import { 
  registerServiceWorker, 
  requestNotificationPermission,
  sendCallNotification,
  sendMessageNotification,
  saveNotificationSubscription,
} from '@/lib/notifications/pushService'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

interface UseNotificationsProps {
  userId: string
  conversationId: string
  peerName: string
}

export function useNotifications({
  userId,
  conversationId,
  peerName,
}: UseNotificationsProps) {
  const supabase = getSupabaseBrowserClient()

  // Initialize notifications on mount
  useEffect(() => {
    const initializeNotifications = async () => {
      // Register service worker
      await registerServiceWorker()

      // Request permission
      const permitted = await requestNotificationPermission()
      if (permitted) {
        // Save subscription to database
        await saveNotificationSubscription(userId, supabase)
      }
    }

    initializeNotifications()
  }, [userId, supabase])

  // Listen for incoming calls
  useEffect(() => {
    const channel = supabase
      .channel(`call_notifications:${conversationId}`)
      .on('broadcast', { event: 'incoming_call' }, payload => {
        const { call_type } = payload
        sendCallNotification(peerName, call_type)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, peerName, supabase])

  // Listen for new messages (if document is not focused)
  useEffect(() => {
    const channel = supabase
      .channel(`message_notifications:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, payload => {
        const message = payload.new as any
        
        // Only notify if user is not the sender and document is not focused
        if (message.sender_id !== userId && !document.hasFocus()) {
          const preview = message.body_plaintext || '[Attachment]'
          sendMessageNotification(peerName, preview)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, userId, peerName, supabase])

  return {
    sendCallNotification,
    sendMessageNotification,
  }
}
