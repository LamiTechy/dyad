// Service Worker for handling push notifications
// Place this in public/sw.js

/**
 * Handle incoming push notifications
 */
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.warn('Push event received with no data')
    return
  }

  try {
    const data = event.data.json()
    const title = data.title || 'Dyad'
    const options = {
      badge: '/icon-192x192.png',
      tag: 'dyad-notification',
      requireInteraction: true,
      ...(data.options || {}),
    }

    event.waitUntil(
      self.registration.showNotification(title, options)
    )
  } catch (error) {
    console.error('Error handling push notification:', error)
  }
})

/**
 * Handle notification clicks
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already an open window
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus()
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow('/')
      }
      return null
    })
  )
})

/**
 * Install event - skip waiting to activate immediately
 */
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

/**
 * Activate event - claim all clients
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})
