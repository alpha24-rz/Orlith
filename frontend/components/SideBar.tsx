'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { motion, AnimatePresence } from 'framer-motion'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notification'
import { useChatStore } from '@/stores/chat'
import { formatRelativeTime } from '@/lib/utils'
import {
  MessageSquare, Search, FileText, Layers, Activity, GitCompare, BarChart3,
  LayoutDashboard, Settings, Users, Trash2,
  X, Plus, ChevronsUpDown, Sun, Moon, Bell,
  PanelLeftClose, PanelLeftOpen, Workflow, Brain
} from 'lucide-react'

const NAV = [
  { href: '/dashboard/chat', icon: MessageSquare, label: 'Chat & Q&A' },
  { href: '/dashboard/search', icon: Search, label: 'Semantic Search' },
  { href: '/dashboard/documents', icon: FileText, label: 'Documents' },
  { href: '/dashboard/extract', icon: Layers, label: 'Extraction' },
  { href: '/dashboard/workflows', icon: Workflow, label: 'AI Workflow Builder' },
  { href: '/dashboard/compare', icon: GitCompare, label: 'Model Comparison' },
]

interface SideBarProps {
  pathname: string;
  onOpenNewWorkspace: () => void;
  onOpenCommandPalette: () => void;
  setSidebarOpen?: (open: boolean) => void;
}

export default function SideBar({ pathname, onOpenNewWorkspace, onOpenCommandPalette, setSidebarOpen }: SideBarProps) {
  const router = useRouter()
  const { workspaces, activeWorkspace, setActiveWorkspace } = useWorkspaceStore()
  const user = useAuthStore(state => state.user)
  const clearAuth = useAuthStore(state => state.clearAuth)
  const clearWorkspace = useWorkspaceStore(state => state.clearWorkspace)
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotificationStore()
  const { setTheme, resolvedTheme } = useTheme()

  const { conversations, fetchConversations, deleteConversation, clearConversations } = useChatStore()

  const [mounted, setMounted] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const workspaceRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (workspaceRef.current && !workspaceRef.current.contains(event.target as Node)) {
        setWorkspaceMenuOpen(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false)
        setNotificationsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (activeWorkspace?.id) {
      fetchConversations(activeWorkspace.id)
    }
  }, [activeWorkspace?.id, fetchConversations])

  const displayName = user?.username || user?.email?.split('@')[0] || 'User'
  const displayEmail = user?.email || ''
  const displayAvatar = displayName.slice(0, 2).toUpperCase()

  return (
    <aside
      className={`group relative flex flex-col h-full bg-bg-sidebar border-r border-border-subtle overflow-visible z-30 shrink-0 select-none transition-all duration-200 ${isCollapsed ? 'w-[72px]' : 'w-60'}`}
    >
      {/* ── Floating collapse toggle ── */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-[22px] z-50 w-6 h-6 rounded-full
           bg-bg-panel border border-border-strong
           text-text-subtle hover:text-foreground hover:bg-bg-hover
           hidden md:flex items-center justify-center
           shadow-sm transition-colors duration-150"
        title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        style={{ boxShadow: '0 1px 4px 0 rgba(0,0,0,0.18)' }}
      >
        {isCollapsed
          ? <PanelLeftOpen className="w-3 h-3" />
          : <PanelLeftClose className="w-3 h-3" />
        }
      </button>

      {/* ── Logo ── */}
      <div className="flex items-center justify-between h-[60px] border-b border-border-subtle shrink-0 overflow-hidden">
        <Link href="/" className="flex items-center min-w-0 h-full">
          <div className="w-[72px] h-full flex items-center justify-center shrink-0">
            <div className="w-7 h-7 relative shrink-0">
              {mounted && resolvedTheme === 'dark' ? <Image src="/logo_dark.svg" alt="DocuMind AI" fill className="object-contain" /> : <Image src="/logo_light.svg" alt="DocuMind AI" fill className="object-contain" />}
            </div>
          </div>
          {!isCollapsed && (
            <span className="text-foreground font-semibold tracking-wide text-lg hidden sm:block truncate pr-3">
              ORLITH
            </span>
          )}
        </Link>
        {setSidebarOpen && !isCollapsed && (
          <button
            className="md:hidden p-1 mr-3 text-text-muted hover:text-foreground transition-all duration-300"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Workspace switcher & Global Search Icon ── */}
      <div ref={workspaceRef} className="border-b border-border-subtle relative z-20 flex items-center h-[52px] shrink-0 overflow-hidden">
        <button
          onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
          className="flex items-center justify-start h-full hover:bg-bg-hover transition-colors min-w-0 w-full overflow-hidden"
          title={isCollapsed && activeWorkspace ? activeWorkspace.name : undefined}
        >
          <div className="w-[72px] flex items-center justify-center shrink-0">
            {activeWorkspace ? (
              <div
                className="w-6 h-6 rounded-md shrink-0 flex items-center justify-center"
                style={{ background: activeWorkspace.color + '30', border: `1px solid ${activeWorkspace.color}50` }}
              >
                <div className="w-2 h-2 rounded-full" style={{ background: activeWorkspace.color }} />
              </div>
            ) : (
              <div className="w-6 h-6 rounded-md shrink-0 bg-bg-input border border-border-subtle flex items-center justify-center text-[10px] font-bold text-text-muted">
                W
              </div>
            )}
          </div>
          {!isCollapsed && activeWorkspace && (
            <div className="flex-1 text-left min-w-0 overflow-hidden pr-2">
              <div className="text-xs font-semibold text-foreground truncate">{activeWorkspace.name}</div>
              <div className="text-[10px] text-text-muted">{activeWorkspace.docCount} docs</div>
            </div>
          )}
          {!isCollapsed && !activeWorkspace && (
            <div className="flex-1 text-left min-w-0 pr-2">
              <div className="text-xs font-semibold text-text-subtle truncate">No workspaces</div>
            </div>
          )}
          {!isCollapsed && (
            <ChevronsUpDown className="w-3.5 h-3.5 text-text-muted shrink-0 mr-2 transition-all duration-300" />
          )}
        </button>

        {!isCollapsed && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onOpenCommandPalette}
            className="rounded-lg bg-bg-input/80 hover:bg-bg-input text-text-muted hover:text-indigo-400 transition-colors flex items-center justify-center shrink-0 border border-border-subtle hover:border-border-strong shadow-2xs p-2 mr-3 overflow-hidden"
            title="Search (⌘K)"
          >
            <Search className="w-4 h-4 shrink-0" />
          </motion.button>
        )}

        <AnimatePresence>
          {workspaceMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: isCollapsed ? 0 : -8, x: isCollapsed ? -8 : 0, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
              exit={{ opacity: 0, y: isCollapsed ? 0 : -8, x: isCollapsed ? -8 : 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className={`absolute ${isCollapsed ? 'left-full ml-2 top-2 w-48' : 'left-3 right-3 top-full mt-1'
                } rounded-xl border border-border-strong bg-bg-panel shadow-xl overflow-hidden z-50`}
            >
              {workspaces.map(w => (
                <button
                  key={w.id}
                  onClick={() => { setActiveWorkspace(w); setWorkspaceMenuOpen(false) }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-bg-hover transition-colors ${activeWorkspace?.id === w.id ? 'bg-bg-hover' : ''
                    }`}
                >
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                    style={{ background: w.color + '30' }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: w.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{w.name}</div>
                    <div className="text-[10px] text-text-muted">{w.docCount} docs</div>
                  </div>
                </button>
              ))}
              <div className="border-t border-border-subtle">
                <button
                  onClick={() => { onOpenNewWorkspace(); setWorkspaceMenuOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-indigo-400 hover:bg-bg-hover transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> New workspace
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Main nav (Fixed & Non-scrolling) ── */}
      <div className="flex flex-col gap-0.5 shrink-0 py-2">
        {NAV.map(item => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              title={isCollapsed ? item.label : undefined}
              className={`relative flex items-center justify-start h-10 rounded-lg text-sm transition-colors duration-150 min-w-0 w-full overflow-hidden ${
                active ? 'text-foreground font-semibold' : 'text-text-subtle hover:text-foreground hover:bg-bg-hover'
              }`}
            >
              {active && (
                <motion.div
                  layoutId="activeNavIndicator"
                  className="absolute inset-y-0 left-2 right-2 rounded-lg bg-foreground/[0.06] dark:bg-white/5 border border-foreground/[0.08] dark:border-white/10 shadow-2xs"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
              <div className="w-[72px] h-full flex items-center justify-center shrink-0 relative z-10">
                <item.icon className="w-4 h-4 shrink-0" />
              </div>
              {!isCollapsed && (
                <span className="overflow-hidden whitespace-nowrap relative z-10 truncate">
                  {item.label}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {/* ── Recent Chats (Scrollable when expanded, flexible spacer when collapsed to keep User Profile at bottom) ── */}
      <div className={`flex flex-col flex-1 min-h-0 ${isCollapsed ? 'pointer-events-none hidden' : 'px-3 pb-3 mt-2'}`}>
        {!isCollapsed && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between px-3 mb-2 shrink-0">
              <span className="text-xs font-bold text-foreground">Recent Chats</span>
              <Link
                href="/dashboard/chat"
                onClick={() => setSidebarOpen?.(false)}
                className="p-1 rounded-md text-text-muted hover:text-foreground hover:bg-bg-hover transition-colors"
                title="New Chat"
              >
                <Plus className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-0.5 pr-1">
              {conversations.slice(0, 15).map(conv => {
                const active = pathname === '/dashboard/chat' && (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('id') === conv.id)
                return (
                  <div key={conv.id} className="group/chat flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-150 min-w-0 hover:bg-bg-hover shrink-0">
                    <Link
                      href={`/dashboard/chat?id=${conv.id}`}
                      onClick={() => setSidebarOpen?.(false)}
                      className={`flex-1 min-w-0 flex items-center gap-2 ${active ? 'text-foreground font-medium' : 'text-text-subtle'}`}
                    >
                      <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-xs">{conv.title}</div>
                        <div className="text-[9px] text-text-muted">{formatRelativeTime(conv.updated_at)}</div>
                      </div>
                    </Link>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (confirm('Hapus percakapan ini?')) {
                          deleteConversation(conv.id)
                        }
                      }}
                      className="opacity-0 group-hover/chat:opacity-100 p-1.5 -mr-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-all shrink-0"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom nav ── */}
      <div ref={userMenuRef} className="border-t border-border-subtle flex flex-col relative shrink-0 mt-auto py-2">

        {/* User Profile */}
        <button
          onClick={() => { setUserMenuOpen(!userMenuOpen); setNotificationsOpen(false) }}
          className="flex items-center h-11 rounded-lg hover:bg-bg-hover transition-colors text-left min-w-0 w-full"
          title={isCollapsed ? displayEmail : undefined}
        >
          <div className="w-[72px] h-full flex items-center justify-center shrink-0">
            <div className="relative w-7 h-7 rounded-full shrink-0 bg-indigo-100 dark:bg-indigo-600/30 border border-indigo-300 dark:border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-700 dark:text-indigo-300">
              {displayAvatar}
              {unreadCount > 0 && (
                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-500 border border-bg-sidebar animate-pulse" />
              )}
            </div>
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0 overflow-hidden pr-3">
              <div className="text-xs font-semibold text-foreground truncate">{displayName}</div>
            </div>
          )}
        </button>

        {/* User Menu Dropdown */}
        <AnimatePresence>
          {userMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: isCollapsed ? 0 : 8, x: isCollapsed ? -8 : 0, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
              exit={{ opacity: 0, y: isCollapsed ? 0 : 8, x: isCollapsed ? -8 : 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className={`absolute ${isCollapsed ? 'left-full ml-2 bottom-0 w-56' : 'left-3 right-3 bottom-[100%] mb-2'
                } rounded-xl border border-border-strong bg-bg-panel shadow-2xl z-50 overflow-hidden`}
            >
              <div className="p-3 border-b border-border-subtle bg-bg-input">
                <div className="text-xs font-bold text-foreground truncate">{displayName}</div>
                <div className="text-[10px] text-text-muted truncate">{displayEmail}</div>
              </div>
              <div className="p-1.5 flex flex-col">
                <Link
                  href="/dashboard/overview"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-subtle hover:text-foreground hover:bg-bg-hover transition-colors"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard Overview
                </Link>
                <Link
                  href="/dashboard/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-subtle hover:text-foreground hover:bg-bg-hover transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" /> Workspace Settings
                </Link>
                <Link
                  href="/dashboard/analytics"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-subtle hover:text-foreground hover:bg-bg-hover transition-colors"
                >
                  <BarChart3 className="w-3.5 h-3.5" /> Analytics
                </Link>

                <div className="h-px bg-border-subtle my-1" />

                <button
                  onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-subtle hover:text-foreground hover:bg-bg-hover transition-colors text-left"
                >
                  {mounted && resolvedTheme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                  {mounted && resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </button>

                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    setNotificationsOpen(true);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-text-subtle hover:text-foreground hover:bg-bg-hover transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Bell className="w-3.5 h-3.5" /> Notifications
                  </div>
                  {unreadCount > 0 && (
                    <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center text-[9px] font-bold text-white">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </div>
                  )}
                </button>

                <div className="h-px bg-border-subtle my-1" />

                <button
                  onClick={() => {
                    setUserMenuOpen(false)
                    clearAuth()
                    clearWorkspace()
                    clearConversations()
                    window.location.href = '/'
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors text-left"
                >
                  Sign out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Notifications Menu */}
        <AnimatePresence>
          {notificationsOpen && (
            <motion.div
              initial={{ opacity: 0, y: isCollapsed ? 0 : 8, x: isCollapsed ? -8 : 0, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
              exit={{ opacity: 0, y: isCollapsed ? 0 : 8, x: isCollapsed ? -8 : 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className={`absolute ${isCollapsed ? 'left-full ml-2 bottom-0 w-80' : 'left-3 right-3 bottom-[100%] mb-2'
                } rounded-xl border border-border-strong bg-bg-panel shadow-2xl z-50 p-4`}
            >
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold text-foreground">Recent Alerts</span>
                {unreadCount > 0 && (
                  <button
                    className="text-[10px] text-indigo-400 hover:underline"
                    onClick={() => {
                      markAllRead()
                    }}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                {notifications.length === 0 ? (
                  <div className="text-xs text-text-muted text-center py-4">No notifications yet</div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        if (!n.is_read) markAsRead(n.id)
                      }}
                      className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${!n.is_read ? 'bg-indigo-500/5 border-indigo-500/15' : 'bg-bg-input border-border-strong hover:bg-bg-hover'
                        }`}
                    >
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-xs font-semibold text-foreground truncate">{n.title}</span>
                        <span className="text-[9px] text-text-muted shrink-0">
                          {new Date(n.created_at.endsWith('Z') ? n.created_at : n.created_at + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[10px] text-text-subtle leading-relaxed line-clamp-2">{n.description}</p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  )
}