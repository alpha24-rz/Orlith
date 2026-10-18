'use client'

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notification'
import { useToastStore } from '@/stores/toast'
import { getWsBase } from '@/lib/backend-url'

const getWsUrl = (token: string) => {
  return `${getWsBase()}/notifications/ws?token=${token}`
}

export default function GlobalWebSocket() {
  const token = useAuthStore(state => state.token)
  const { addNotification, fetchNotifications } = useNotificationStore()
  const addToast = useToastStore(state => state.addToast)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!token) {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      return
    }

    // Fetch initial notifications
    fetchNotifications()

    let reconnectAttempts = 0

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return

      try {
        const ws = new WebSocket(getWsUrl(token))
        wsRef.current = ws

        ws.onopen = () => {
          console.log("Global Notification WebSocket connected")
          reconnectAttempts = 0
        }

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data)
            if (payload.event === 'notification') {
              const notif = payload.data
              addNotification(notif)
              addToast({
                title: notif.title,
                description: notif.description,
                variant: notif.type
              })
            }
          } catch (e) {
            console.error("Failed to parse websocket message", e)
          }
        }

        ws.onclose = () => {
          console.log("Global Notification WebSocket closed")
          // Auto reconnect with exponential backoff
          const timeout = Math.min(10000, 1000 * Math.pow(2, reconnectAttempts))
          reconnectAttempts++
          reconnectTimeoutRef.current = setTimeout(connect, timeout)
        }
      } catch (e) {
        console.error("Failed to connect websocket", e)
      }
    }

    connect()

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (wsRef.current) {
        // Prevent auto-reconnect on unmount
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [token, addNotification, fetchNotifications, addToast])

  return null // Headless component
}
