import { create } from 'zustand'

export interface Conversation {
  id: string;
  workspace_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatState {
  conversations: Conversation[];
  loading: boolean;
  fetchConversations: (workspaceId: string) => Promise<void>;
  addConversation: (conv: Conversation) => void;
  deleteConversation: (id: string) => Promise<boolean>;
  clearConversations: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  loading: false,

  fetchConversations: async (workspaceId: string) => {
    if (!workspaceId) return;
    set({ loading: true });
    try {
      const headers: HeadersInit = {}
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`/api/conversations?workspace_id=${workspaceId}`, { headers })
      if (res.ok) {
        const data = await res.json()
        set({ conversations: data })
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      set({ loading: false })
    }
  },

  addConversation: (conv: Conversation) => {
    set((state) => {
      // Avoid duplicate temp IDs if the actual one was just added
      const exists = state.conversations.some(c => c.id === conv.id)
      if (exists) return state
      return { conversations: [conv, ...state.conversations] }
    })
  },

  deleteConversation: async (id: string) => {
    try {
      const headers: HeadersInit = {}
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`/api/conversations/${id}`, {
        method: 'DELETE',
        headers
      })
      if (res.ok) {
        set((state) => ({
          conversations: state.conversations.filter(c => c.id !== id)
        }))
        return true
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err)
    }
    return false
  },

  clearConversations: () => {
    set({ conversations: [] })
  }
}))
