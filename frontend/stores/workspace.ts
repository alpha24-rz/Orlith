import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Workspace } from '@/lib/types'
import { api } from '@/lib/api-client'

interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  loading: boolean
  fetchWorkspaces: () => Promise<void>
  setActiveWorkspace: (w: Workspace) => void
  createWorkspace: (name: string, description?: string) => Promise<void>
  updateWorkspace: (id: string, updates: Partial<Workspace>) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
  updateAiSettings: (id: string, settings: any) => Promise<void>
  clearWorkspace: () => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      workspaces: [],
      activeWorkspace: null,
      loading: false,
      fetchWorkspaces: async () => {
        set({ loading: true })
        try {
          const data = await api.getWorkspaces()
          set((state) => {
            const validActive = state.activeWorkspace && data.find((w: any) => w.id === state.activeWorkspace!.id)
            return { 
              workspaces: data, 
              activeWorkspace: validActive || (data.length > 0 ? data[0] : null),
              loading: false 
            }
          })
        } catch (e) {
          console.error(e)
          set({ loading: false })
        }
      },
      setActiveWorkspace: (w) => set({ activeWorkspace: w }),
      createWorkspace: async (name, description) => {
        const w = await api.createWorkspace({ name, description })
        set((state) => ({
          workspaces: [...state.workspaces, w],
          activeWorkspace: w
        }))
      },
      updateWorkspace: async (id, updates) => {
        const w = await api.updateWorkspace(id, updates)
        set((state) => ({
          workspaces: state.workspaces.map(wk => wk.id === id ? { ...wk, ...w } : wk),
          activeWorkspace: state.activeWorkspace?.id === id ? { ...state.activeWorkspace, ...w } : state.activeWorkspace
        }))
      },
      deleteWorkspace: async (id) => {
        await api.deleteWorkspace(id)
        set((state) => {
          const newWs = state.workspaces.filter(wk => wk.id !== id)
          return {
            workspaces: newWs,
            activeWorkspace: state.activeWorkspace?.id === id ? (newWs.length > 0 ? newWs[0] : null) : state.activeWorkspace
          }
        })
      },
      updateAiSettings: async (id, settings) => {
        const w = await api.updateWorkspaceAiSettings(id, settings)
        set((state) => ({
          workspaces: state.workspaces.map(wk => wk.id === id ? { ...wk, ...w } : wk),
          activeWorkspace: state.activeWorkspace?.id === id ? { ...state.activeWorkspace, ...w } : state.activeWorkspace
        }))
      },
      clearWorkspace: () => {
        set({ workspaces: [], activeWorkspace: null, loading: false })
      }
    }),
    {
      name: 'workspace-storage',
      partialize: (state) => ({ activeWorkspace: state.activeWorkspace }),
    }
  )
)
