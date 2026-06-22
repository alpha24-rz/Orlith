import { create } from 'zustand'
import { api } from '@/lib/api-client'

export interface Notification {
  id: string
  title: string
  description: string
  type: 'success' | 'error' | 'warning' | 'info'
  is_read: boolean
  created_at: string
  workspace_id?: string
}

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  fetchNotifications: () => Promise<void>
  addNotification: (notification: Notification) => void
  markAsRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  
  fetchNotifications: async () => {
    try {
      const data = await api.getNotifications()
      set({ 
        notifications: data,
        unreadCount: data.filter((n: Notification) => !n.is_read).length
      })
    } catch (err) {
      console.error("Failed to fetch notifications", err)
    }
  },
  
  addNotification: (notif) => {
    set((state) => {
      const exists = state.notifications.some(n => n.id === notif.id)
      if (exists) return state // avoid duplicates

      const newNotifs = [notif, ...state.notifications].slice(0, 100)
      return {
        notifications: newNotifs,
        unreadCount: newNotifs.filter((n) => !n.is_read).length
      }
    })
  },
  
  markAsRead: async (id) => {
    // Optimistic update
    set((state) => ({
      notifications: state.notifications.map((n) => n.id === id ? { ...n, is_read: true } : n),
      unreadCount: Math.max(0, state.unreadCount - 1)
    }))
    try {
      await api.markNotificationRead(id)
    } catch (err) {
      console.error("Failed to mark read", err)
      // Revert if failed
      set((state) => ({
        notifications: state.notifications.map((n) => n.id === id ? { ...n, is_read: false } : n),
        unreadCount: state.unreadCount + 1
      }))
    }
  },
  
  markAllRead: async () => {
    const previousUnreadCount = get().unreadCount
    const previousNotifs = get().notifications

    // Optimistic update
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0
    }))
    try {
      await api.markAllNotificationsRead()
    } catch (err) {
      console.error("Failed to mark all read", err)
      // Revert
      set({
        notifications: previousNotifs,
        unreadCount: previousUnreadCount
      })
    }
  }
}))
