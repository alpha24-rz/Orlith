'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { mockQueryStats, mockExtractionJobs } from '@/lib/mock-data'
import { formatBytes, formatRelativeTime } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import {
  FileText, MessageSquare, Layers, TrendingUp, Upload,
  ArrowRight, AlertCircle, CheckCircle2, Clock, Zap,
  BarChart3, Brain, ArrowUpRight, X, Trash2, RefreshCw
} from 'lucide-react'
import { LineChart, Line, AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import { DocumentUploaderModal } from '@/components/DocumentUploaderModal'
import { useWorkspaceStore } from '@/stores/workspace'
import { api } from '@/lib/api-client'

interface Toast {
  id: string
  title: string
  desc: string
  type: 'success' | 'info' | 'danger'
}

const STAT_CARDS = [
  {
    label: 'Total Documents',
    value: '272',
    sub: '+31 this week',
    icon: FileText,
    color: '#6366F1',
    trend: '+12%',
    positive: true,
    chartData: [{ v: 240 }, { v: 245 }, { v: 242 }, { v: 250 }, { v: 258 }, { v: 265 }, { v: 272 }],
  },
  {
    label: 'Queries This Month',
    value: '1,247',
    sub: '3,753 remaining',
    icon: MessageSquare,
    color: '#8B5CF6',
    trend: '+34%',
    positive: true,
    chartData: [{ v: 800 }, { v: 850 }, { v: 910 }, { v: 980 }, { v: 1050 }, { v: 1140 }, { v: 1247 }],
  },
  {
    label: 'Extractions Run',
    value: '541',
    sub: '97% avg accuracy',
    icon: Layers,
    color: '#10B981',
    trend: '+89%',
    positive: true,
    chartData: [{ v: 300 }, { v: 320 }, { v: 380 }, { v: 410 }, { v: 460 }, { v: 500 }, { v: 541 }],
  },
  {
    label: 'Storage Used',
    value: '3.2 GB',
    sub: 'of 10 GB',
    icon: BarChart3,
    color: '#F59E0B',
    trend: '32%',
    positive: true,
    chartData: [{ v: 1.2 }, { v: 1.5 }, { v: 1.8 }, { v: 2.1 }, { v: 2.6 }, { v: 2.9 }, { v: 3.2 }],
  },
]

export default function DashboardPage() {
  const user = useAuthStore(state => state.user)
  const email = user?.email || 'user@example.com'
  const [toasts, setToasts] = useState<Toast[]>([])

  // Real data integration
  const { activeWorkspace, workspaces } = useWorkspaceStore()
  const activeWorkspaceId = activeWorkspace?.id
  const [documents, setDocuments] = useState<any[]>([])
  const [isUploaderOpen, setIsUploaderOpen] = useState(false)

  const [realStats, setRealStats] = useState({
    documents_count: 0,
    queries_count: 0,
    storage_bytes: 0
  })

  const fetchStats = useCallback(async () => {
    if (!activeWorkspaceId) return
    try {
      const stats = await api.getWorkspaceStats(activeWorkspaceId)
      setRealStats(stats)
    } catch (e) {
      console.error(e)
    }
  }, [activeWorkspaceId])

  const fetchDocuments = useCallback(async () => {
    if (!activeWorkspaceId) return
    try {
      const res = await api.getDocuments(activeWorkspaceId)
      const data = res.sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      setDocuments(data)
    } catch (err) {
      console.error("Failed to fetch documents", err)
    }
  }, [activeWorkspaceId])

  useEffect(() => {
    if (!activeWorkspaceId) return
    fetchDocuments()
    fetchStats()

    // Setup WebSocket
    const ws = new WebSocket(`ws://localhost:8000/documents/ws/${activeWorkspaceId}`)

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.event === 'document_status') {
          const docData = payload.data
          setDocuments(prevDocs => {
            const index = prevDocs.findIndex(d => d.id === docData.id)
            if (index !== -1) {
              const newDocs = [...prevDocs]
              newDocs[index] = { ...newDocs[index], ...docData }
              return newDocs
            } else {
              // new document
              return [docData, ...prevDocs]
            }
          })

          if (docData.status === 'ready') {
            addToast("Processing Complete", `${docData.filename} is ready.`, "success")
          } else if (docData.status === 'error') {
            addToast("Processing Failed", `${docData.filename} encountered an error: ${docData.error || ''}`, "danger")
          }
        }
      } catch (err) {
        console.error("WS Parse error", err)
      }
    }

    return () => {
      ws.close()
    }
  }, [activeWorkspaceId, fetchDocuments])

  const handleDeleteDocument = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await api.deleteDocument(id)
      setDocuments(prev => prev.filter(d => d.id !== id))
      fetchStats()
      addToast("Document Deleted", "The document has been removed.", "info")
    } catch (err) {
      addToast("Delete Failed", "Failed to delete the document.", "danger")
    }
  }

  const handleReEmbed = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm("Changing embedding models or re-embedding will re-index this document and consume credits/time. Proceed?")) {
      return
    }

    try {
      const res = await fetch(`http://localhost:8000/documents/${id}/process`, { method: 'POST' })
      if (res.ok) {
        addToast("Re-embed Started", "Document is being processed again.", "info")
      }
    } catch (err) {
      addToast("Action Failed", "Could not start re-embedding process.", "danger")
    }
  }

  const recentDocs = documents.slice(0, 5)
  const processingDocs = documents.filter(d => d.status === 'processing' || d.status === 'uploading')

  const addToast = (title: string, desc: string, type: 'success' | 'info' | 'danger' = 'success') => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 9)
    setToasts(prev => [...prev, { id, title, desc, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3500)
  }

  const handleQuickStartClick = (q: string) => {
    addToast("Query Loaded", `Redirecting to chat with query: "${q.slice(0, 25)}..."`, "info")
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-8 animate-fade-in">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 sm:mb-12">
          <div className="space-y-2 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black truncate">Welcome, {email}</h1>
            <p className="text-xs sm:text-sm text-text-subtle">Here's what's happening in your workspaces today.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsUploaderOpen(true)}
              id="dashboard-upload-btn"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-3 rounded-xl transition-all duration-200 shadow-lg shadow-indigo-500/20 hover:-translate-y-0.5 active:scale-95"
            >
              <Upload className="w-4 h-4" /> Upload docs
            </button>
          </div>
        </div>

        {/* Processing banner */}
        {processingDocs.length > 0 && (
          <div className="mb-10 flex items-center gap-4 px-5 py-4 rounded-xl bg-indigo-600/10 border border-indigo-500/20">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
            <p className="text-sm text-indigo-300">
              <span className="font-semibold">{processingDocs.length} document{processingDocs.length > 1 ? 's' : ''} processing</span>
              {' '}— {processingDocs[0].filename} is currently {processingDocs[0].status}
            </p>
            <ArrowRight className="w-4 h-4 text-indigo-400 ml-auto shrink-0" />
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          <div className="rounded-2xl border border-border-strong bg-bg-input p-6 hover:border-border-strong transition-colors group relative overflow-hidden">
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-500/10 border border-indigo-500/30">
                <FileText className="w-4 h-4 text-indigo-400" />
              </div>
            </div>
            <div className="text-3xl font-black mb-1">{realStats.documents_count}</div>
            <div className="text-sm text-foreground/80 font-medium mb-1">Total Documents</div>
            <div className="text-xs text-text-muted">Indexed in active workspace</div>
          </div>

          <div className="rounded-2xl border border-border-strong bg-bg-input p-6 hover:border-border-strong transition-colors group relative overflow-hidden">
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-violet-500/10 border border-violet-500/30">
                <MessageSquare className="w-4 h-4 text-violet-400" />
              </div>
            </div>
            <div className="text-3xl font-black mb-1">{realStats.queries_count}</div>
            <div className="text-sm text-foreground/80 font-medium mb-1">Total Queries</div>
            <div className="text-xs text-text-muted">Conversational RAG queries</div>
          </div>

          <div className="rounded-2xl border border-border-strong bg-bg-input p-6 hover:border-border-strong transition-colors group relative overflow-hidden">
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/30">
                <Layers className="w-4 h-4 text-emerald-400" />
              </div>
            </div>
            <div className="text-3xl font-black mb-1">0</div>
            <div className="text-sm text-foreground/80 font-medium mb-1">Extractions Run</div>
            <div className="text-xs text-text-muted">Coming soon</div>
          </div>

          <div className="rounded-2xl border border-border-strong bg-bg-input p-6 hover:border-border-strong transition-colors group relative overflow-hidden">
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-500/10 border border-amber-500/30">
                <BarChart3 className="w-4 h-4 text-amber-400" />
              </div>
            </div>
            <div className="text-3xl font-black mb-1">{formatBytes(realStats.storage_bytes)}</div>
            <div className="text-sm text-foreground/80 font-medium mb-1">Storage Used</div>
            <div className="text-xs text-text-muted">Active workspace size</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Query activity chart */}
          <div className="lg:col-span-2 rounded-2xl border border-border-strong bg-bg-input p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold">Query Activity</h2>
                <p className="text-xs text-text-muted mt-0.5">Last 7 days</p>
              </div>
              <Link href="/dashboard/analytics" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                Full analytics <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <AreaChart data={mockQueryStats}>
                  <defs>
                    <linearGradient id="qGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="eGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{ background: '#16161F', border: '1px solid #2A2A3A', borderRadius: '8px', fontSize: '12px' }}
                    labelStyle={{ color: '#9090A8' }}
                    itemStyle={{ color: '#6366F1' }}
                  />
                  <Area type="monotone" dataKey="queries" stroke="#6366F1" fill="url(#qGrad)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="extractions" stroke="#10B981" fill="url(#eGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5 text-xs text-text-subtle">
                <div className="w-3 h-0.5 rounded-full bg-indigo-500" /> Queries
              </div>
              <div className="flex items-center gap-1.5 text-xs text-text-subtle">
                <div className="w-3 h-0.5 rounded-full bg-emerald-500" /> Extractions
              </div>
            </div>
          </div>

          {/* Workspaces */}
          <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold">Workspaces</h2>
            </div>
            <div className="flex flex-col gap-2">
              {workspaces.length === 0 ? (
                <div className="text-center py-6 text-xs text-text-muted">No workspaces yet.</div>
              ) : (
                workspaces.map(w => (
                  <div
                    key={w.id}
                    onClick={() => addToast("Workspace Switched", `Active scope changed to ${w.name}`, "success")}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-bg-hover cursor-pointer transition-colors border border-transparent hover:border-border-strong"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: (w.color || '#6366F1') + '20' }}>
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: w.color || '#6366F1' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">{w.name}</div>
                      <div className="text-[10px] text-text-muted">{w.docCount ?? 0} docs · {w.memberCount ?? 1} members</div>
                    </div>
                    <ArrowRight className="w-3 h-3 text-text-muted" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent documents */}
          <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold">Recent Documents</h2>
              <Link href="/dashboard/documents" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {recentDocs.length === 0 ? (
              <div className="text-center py-8 text-sm text-text-muted">
                No documents found. Upload one to get started.
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {recentDocs.map(doc => (
                  <div
                    key={doc.id}
                    onClick={() => addToast("Document Selected", `Viewing details for ${doc.filename}`, "info")}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-bg-hover cursor-pointer transition-colors group border border-transparent hover:border-border-strong"
                  >
                    <div className="w-8 h-8 rounded-lg bg-bg-panel border border-border-strong flex items-center justify-center shrink-0">
                      <FileText className="w-3.5 h-3.5 text-text-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate flex items-center gap-2">
                        {doc.filename}
                        {doc.status === 'ready' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                            Vectorized
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-text-muted">
                        {formatBytes(doc.file_size)} · {doc.metadata?.chunk_count || 0} chunks · {formatRelativeTime(new Date(doc.created_at))}
                      </div>
                    </div>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${doc.status === 'ready' ? 'bg-emerald-400' :
                        (doc.status === 'processing' || doc.status === 'uploading') ? 'bg-amber-400 animate-pulse' :
                          'bg-red-400'
                      }`} title={doc.status} />
                    <button
                      onClick={(e) => handleReEmbed(doc.id, e)}
                      title="Re-embed document"
                      className="p-1.5 text-text-muted hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all ml-2"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteDocument(doc.id, e)}
                      className="p-1.5 text-text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Q&A suggestions */}
          <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold">Quick Start</h2>
              <Link href="/dashboard/chat" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                Open chat <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {[
                "What are the key termination clauses in the TechCorp agreement?",
                "Summarize the Q2 financial performance highlights",
                "Which vendor proposal has the best pricing terms?",
                "Extract all payment due dates from the May invoices",
              ].map((q, i) => (
                <Link
                  key={i}
                  href="/dashboard/chat"
                  id={`quick-query-${i}`}
                  onClick={() => handleQuickStartClick(q)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border-strong hover:border-indigo-500/30 hover:bg-indigo-600/5 cursor-pointer transition-all duration-200 group"
                >
                  <Brain className="w-4 h-4 text-text-muted group-hover:text-indigo-400 shrink-0 transition-colors" />
                  <span className="text-xs text-text-subtle group-hover:text-foreground transition-colors">{q}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-text-muted group-hover:text-indigo-400 ml-auto shrink-0 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <DocumentUploaderModal
        isOpen={isUploaderOpen}
        onClose={() => setIsUploaderOpen(false)}
        workspaceId={activeWorkspaceId ?? ''}
        onUploadSuccess={fetchDocuments}
      />

      {/* Floating Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto flex gap-3 p-4 rounded-xl border border-border-strong bg-bg-input shadow-2xl w-80 animate-slide-in relative overflow-hidden">
            {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {t.type === 'info' && <Zap className="w-5 h-5 text-indigo-400 shrink-0" />}
            {t.type === 'danger' && <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}

            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-foreground truncate">{t.title}</div>
              <div className="text-[10px] text-text-subtle mt-0.5 leading-relaxed">{t.desc}</div>
            </div>

            <button
              onClick={() => setToasts(p => p.filter(toast => toast.id !== t.id))}
              className="text-text-muted hover:text-foreground shrink-0 self-start transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="absolute left-0 bottom-0 h-0.5 bg-gradient-to-r from-indigo-500 to-violet-500 w-full animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
