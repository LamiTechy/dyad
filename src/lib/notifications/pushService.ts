// Push notifications service
// Handles web push notifications for messages and calls

export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js')
      console.log('Service Worker registered:', registration)
      return registration
    } catch (error) {
      console.error('Service Worker registration failed:', error)
    }
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications')
    return false
  }

  if (Notification.permission === 'granted') {
    return true
  }

  if (Notification.permission !== 'denied') {
    try {
      const permission = await Notification.requestPermission()
      return permission === 'granted'
    } catch (error) {
      console.error('Error requesting notification permission:', error)
      return false
    }
  }

  return false
}

export function sendNotification(title: string, options?: NotificationOptions) {
  if ('serviceWorker' in navigator && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, {
          badge: '/manifest.json',
          tag: 'dyad-notification',
          requireInteraction: true,
          ...options,
        })
      })
    }
  }
}

export function sendCallNotification(
  callerName: string,
  callType: 'voice' | 'video'
) {
  const title = `${callerName} is calling...`
  const body = `Incoming ${callType} call`
  
  sendNotification(title, {
    body,
    icon: '/icon-192x192.png',
    tag: 'dyad-call',
    requireInteraction: true,
  })
}

export function sendMessageNotification(
  senderName: string,
  messagePreview: string
) {
  const title = `Message from ${senderName}`
  
  sendNotification(title, {
    body: messagePreview.substring(0, 100),
    icon: '/icon-192x192.png',
    tag: 'dyad-message',
  })
}

export async function saveNotificationSubscription(
  userId: string,
  supabase: any
) {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      })

      // Save to database
      await (supabase as any)
        .from('notification_subscriptions')
        .upsert({
          user_id: userId,
          subscription: JSON.stringify(subscription),
          created_at: new Date().toISOString(),
        })

      return subscription
    } catch (error) {
      console.error('Error saving notification subscription:', error)
    }
  }
}

export function unsubscribeFromNotifications(userId: string, supabase: any) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(async registration => {
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()
        
        // Remove from database
        await (supabase as any)
          .from('notification_subscriptions')
          .delete()
          .eq('user_id', userId)
      }
    })
  }
}
