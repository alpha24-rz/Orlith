'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import {
  Brain, LayoutDashboard, FileText, MessageSquare, Layers,
  BarChart3, Settings, Users, ChevronDown, Bell, Search,
  Plus, ChevronsUpDown, Zap, X, Menu, ChevronRight, Key, Shield, CreditCard,
  Activity, GitCompare, Sun, Moon, Workflow
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { Workspace } from '@/lib/types'
import { useWorkspaceStore } from '@/stores/workspace'
import Image from 'next/image'
import SideBar from '@/components/SideBar'
import GlobalToast from '@/components/GlobalToast'
import GlobalWebSocket from '@/components/GlobalWebSocket'

const NAV = [
  { href: '/dashboard/chat', icon: MessageSquare, label: 'Chat & Q&A' },
  { href: '/dashboard/search', icon: Search, label: 'Semantic Search' },
  { href: '/dashboard/documents', icon: FileText, label: 'Documents' },
  { href: '/dashboard/extract', icon: Layers, label: 'Extraction' },
  { href: '/dashboard/workflows', icon: Workflow, label: 'AI Workflow Builder' },
  { href: '/dashboard/compare', icon: GitCompare, label: 'Model Comparison' },
  { href: '/dashboard/analytics', icon: BarChart3, label: 'Analytics' },
  { href: '/dashboard/visualizer', icon: Brain, label: 'NLP & ML Visualizer' },
]

const BOTTOM_NAV = [
  { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const { workspaces, activeWorkspace, fetchWorkspaces, setActiveWorkspace, createWorkspace, clearWorkspace } = useWorkspaceStore()

  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Custom Modals / Dropdowns
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [newWsColor, setNewWsColor] = useState('#1a1a1f')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [cmdSearch, setCmdSearch] = useState('')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  const workspaceColors = ['#1a1a1f']

  const user = useAuthStore(state => state.user)
  const token = useAuthStore(state => state.token)
  const initAuth = useAuthStore(state => state.initAuth)
  const clearAuth = useAuthStore(state => state.clearAuth)

  const displayName = user?.username || user?.email?.split('@')[0] || 'User'
  const displayEmail = user?.email || ''
  const displayAvatar = displayName.slice(0, 2).toUpperCase()

  useEffect(() => {
    initAuth()
  }, [initAuth])

  useEffect(() => {
    if (token) {
      fetchWorkspaces()
    }
  }, [token, fetchWorkspaces])

  // Hotkey listener for Command Palette (CMD+K or CTRL+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const COMMAND_SECTIONS = [
    {
      group: 'Navigation',
      items: [
        { label: 'Go to Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Go to Chat & Q&A', href: '/dashboard/chat', icon: MessageSquare },
        { label: 'Go to Semantic Search', href: '/dashboard/search', icon: Search },
        { label: 'Go to Documents Library', href: '/dashboard/documents', icon: FileText },
        { label: 'Go to Data Extraction', href: '/dashboard/extract', icon: Layers },
        { label: 'Go to Usage Analytics', href: '/dashboard/analytics', icon: BarChart3 },
        { label: 'Go to Settings', href: '/dashboard/settings', icon: Settings },
      ]
    },
    {
      group: 'Quick Actions',
      items: [
        { label: 'Create New Workspace', action: 'new-workspace', icon: Plus },
        { label: 'Upload Documents', href: '/dashboard/documents?action=upload', icon: FileText },
      ]
    }
  ]

  const filteredCommands = COMMAND_SECTIONS.map(sec => ({
    group: sec.group,
    items: sec.items.filter(item =>
      item.label.toLowerCase().includes(cmdSearch.toLowerCase())
    )
  })).filter(sec => sec.items.length > 0)


  return (
    <div className="flex h-screen bg-background overflow-hidden bg-dot-pattern">
      {/* Desktop sidebar */}
      <div className="relative flex-shrink-0 hidden md:flex overflow-visible">
        <SideBar pathname={pathname} onOpenNewWorkspace={() => setNewWorkspaceOpen(true)} onOpenCommandPalette={() => setCommandPaletteOpen(true)} setSidebarOpen={setSidebarOpen} />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex animate-fade-in">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10">
            <SideBar pathname={pathname} onOpenNewWorkspace={() => setNewWorkspaceOpen(true)} onOpenCommandPalette={() => setCommandPaletteOpen(true)} setSidebarOpen={setSidebarOpen} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <GlobalToast />
        <GlobalWebSocket />
        {/* Mobile Topbar */}
        <header className="md:hidden flex items-center gap-4 px-6 py-3 border-b border-border-subtle bg-background/80 backdrop-blur-md shrink-0 z-30">
          <button
            className="p-2 text-text-subtle hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
            id="mobile-sidebar-toggle"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="flex-1 text-sm font-semibold text-foreground tracking-wide">ORLITH</div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden relative">
          {children}
        </main>
      </div>

      {/* New Workspace Modal */}
      {newWorkspaceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setNewWorkspaceOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border-strong bg-bg-panel shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold">New Workspace</h2>
              <button onClick={() => setNewWorkspaceOpen(false)} className="p-1.5 rounded-lg text-text-muted hover:text-foreground hover:bg-bg-hover transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-text-subtle mb-1.5 block">Workspace Name</label>
                <input
                  id="new-workspace-name"
                  type="text"
                  value={newWsName}
                  onChange={e => setNewWsName(e.target.value)}
                  placeholder="e.g. Legal — Q3 Review"
                  className="w-full px-3 py-2.5 rounded-xl border border-border-strong bg-bg-input text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-text-subtle mb-2 block">Color</label>
                <div className="flex gap-2">
                  {workspaceColors.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewWsColor(c)}
                      className={`w-7 h-7 rounded-full transition-all ${newWsColor === c ? 'ring-2 ring-foreground ring-offset-2 ring-offset-bg-panel' : 'hover:scale-110'}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-3 mt-1">
                <button
                  onClick={() => setNewWorkspaceOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border-strong text-sm text-text-subtle hover:text-foreground hover:border-border-strong transition-all"
                >
                  Cancel
                </button>
                <button
                  id="create-workspace-btn"
                  disabled={!newWsName.trim()}
                  onClick={async () => {
                    try {
                      await createWorkspace(newWsName, '')
                      setNewWorkspaceOpen(false)
                      setNewWsName('')
                      setNewWsColor('#6366F1')
                    } catch (e) {
                      console.error(e)
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-500/20"
                >
                  Create workspace
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Command Palette (CMD+K) Modal */}
      {commandPaletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh]">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCommandPaletteOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border-strong bg-bg-panel shadow-2xl overflow-hidden flex flex-col max-h-[60vh] animate-fade-in">
            {/* Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border-subtle">
              <Search className="w-5 h-5 text-indigo-400 shrink-0" />
              <input
                type="text"
                value={cmdSearch}
                onChange={e => setCmdSearch(e.target.value)}
                placeholder="Search actions, links, and documents..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-text-muted outline-none"
                autoFocus
              />
              <button
                onClick={() => setCommandPaletteOpen(false)}
                className="px-2 py-0.5 rounded bg-bg-hover border border-border-strong text-[10px] text-text-muted"
              >
                ESC
              </button>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-3">
              {filteredCommands.length === 0 ? (
                <div className="text-center py-8 text-xs text-text-muted">
                  No commands matched your query.
                </div>
              ) : (
                filteredCommands.map(sec => (
                  <div key={sec.group}>
                    <div className="px-2.5 py-1 text-[10px] font-bold text-text-muted uppercase tracking-wider">
                      {sec.group}
                    </div>
                    <div className="flex flex-col gap-0.5 mt-1">
                      {sec.items.map(item => (
                        <button
                          key={item.label}
                          onClick={() => {
                            setCommandPaletteOpen(false)
                            setCmdSearch('')
                            if (item.href) {
                              router.push(item.href)
                            } else if (item.action === 'new-workspace') {
                              setNewWorkspaceOpen(true)
                            }
                          }}
                          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-xs text-text-subtle hover:text-foreground hover:bg-bg-hover text-left transition-colors"
                        >
                          <item.icon className="w-4 h-4 text-text-muted shrink-0" />
                          <span className="flex-1 font-medium">{item.label}</span>
                          <span className="text-[10px] text-text-muted uppercase font-mono">enter</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-border-subtle bg-bg-input flex items-center justify-between text-[10px] text-text-muted">
              <span>Use ↑↓ arrows to navigate, enter to select</span>
              <span>DocuMind Quick Access</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
