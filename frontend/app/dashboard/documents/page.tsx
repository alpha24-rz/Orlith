'use client'

import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import Link from 'next/link'
import { formatBytes, formatRelativeTime } from '@/lib/utils'
import { Document, DocumentStatus } from '@/lib/types'
import { api } from '@/lib/api-client'
import { useWorkspaceStore } from '@/stores/workspace'
import {
  FileText, Upload, Search, Filter, MoreVertical,
  CheckCircle2, Clock, XCircle, Trash2, Download,
  MessageSquare, Tag, ChevronDown, File, AlertCircle,
  X, FileSpreadsheet, RefreshCw, Zap
} from 'lucide-react'

interface Toast {
  id: string
  title: string
  desc: string
  type: 'success' | 'info' | 'danger'
}

const FILE_TYPE_ICONS: Record<string, React.ReactNode> = {
  PDF: <div className="text-[10px] font-black text-red-400">PDF</div>,
  DOCX: <div className="text-[10px] font-black text-blue-400">DOC</div>,
  XLSX: <div className="text-[10px] font-black text-emerald-400">XLS</div>,
  TXT: <div className="text-[10px] font-black text-text-subtle">TXT</div>,
  CSV: <div className="text-[10px] font-black text-amber-400">CSV</div>,
  MD: <div className="text-[10px] font-black text-violet-400">MD</div>,
}

const STATUS_CONFIG: Record<DocumentStatus, { label: string, icon: any, color: string, bg: string }> = {
  ready: { label: 'Ready', icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  processing: { label: 'Processing', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  uploading: { label: 'Uploading', icon: Clock, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
  failed: { label: 'Failed', icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  error: { label: 'Failed', icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
}

const getWebSocketUrl = (workspaceId: string) => {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/api/documents/ws/${workspaceId}`
  }
  const envUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  const wsBase = envUrl.replace(/^http/, 'ws')
  return `${wsBase}/documents/ws/${workspaceId}`
}

export default function DocumentsPage() {
  const { activeWorkspace } = useWorkspaceStore()
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedTag, setSelectedTag] = useState<string>('all')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)
  const [useOcr, setUseOcr] = useState(false)
  
  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = (title: string, desc: string, type: 'success' | 'info' | 'danger' = 'success') => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 9)
    setToasts(prev => [...prev, { id, title, desc, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3500)
  }

  // Fetch initial documents & manage updates via Websocket/Polling
  useEffect(() => {
    if (!activeWorkspace?.id) return
    let active = true
    let socket: WebSocket | null = null
    let pollInterval: NodeJS.Timeout | null = null

    const fetchInitialDocs = async () => {
      setLoading(true)
      try {
        const data = await api.getDocuments(activeWorkspace.id)
        if (active) {
          setDocs(data)
        }
      } catch (err) {
        console.error("Error fetching documents:", err)
        if (active) {
          addToast("Error Loading", "Failed to retrieve documents list", "danger")
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    const startPollingFallback = () => {
      if (pollInterval) return
      console.log("Starting polling fallback...")
      pollInterval = setInterval(async () => {
        if (!active) return
        try {
          const data = await api.getDocuments(activeWorkspace.id)
          setDocs(data)
        } catch (err) {
          console.error("Polling error:", err)
        }
      }, 4000)
    }

    const setupWS = () => {
      try {
        const wsUrl = getWebSocketUrl(activeWorkspace.id)
        socket = new WebSocket(wsUrl)

        socket.onopen = () => {
          console.log("WebSocket connected to workspace:", activeWorkspace.id)
        }

        socket.onmessage = (event) => {
          if (!active) return
          try {
            const payload = JSON.parse(event.data)
            if (payload.event === 'document_status') {
              const updated = payload.data
              
              const newDoc: Document = {
                id: updated.id,
                name: updated.filename,
                type: (updated.filename.split('.').pop() || 'PDF').toUpperCase() as any,
                size: updated.file_size,
                pages: updated.metadata?.page_count ?? 1,
                status: updated.status,
                uploadedAt: new Date(updated.created_at ? (updated.created_at.endsWith('Z') ? updated.created_at : updated.created_at + 'Z') : Date.now()),
                workspaceId: updated.workspace_id,
                tags: updated.metadata?.ocr_applied ? ['ocr-extracted'] : [],
                language: 'en',
                chunks: updated.metadata?.chunk_count ?? 0,
                content_hash: updated.content_hash,
                metadata: updated.metadata
              }

              setDocs(prev => {
                const exists = prev.some(d => d.id === newDoc.id)
                if (exists) {
                  return prev.map(d => d.id === newDoc.id ? newDoc : d)
                } else {
                  return [newDoc, ...prev]
                }
              })
            }
          } catch (e) {
            console.error("WebSocket message parsing error:", e)
          }
        }

        socket.onerror = (e) => {
          console.warn("WebSocket error, falling back to polling:", e)
          startPollingFallback()
        }

        socket.onclose = () => {
          if (active) {
            console.warn("WebSocket disconnected, falling back to polling.")
            startPollingFallback()
          }
        }

      } catch (err) {
        console.warn("WebSocket initialization error, falling back to polling:", err)
        startPollingFallback()
      }
    }

    fetchInitialDocs()
    setupWS()

    return () => {
      active = false
      if (socket) socket.close()
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [activeWorkspace?.id])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return
    if (!activeWorkspace?.id) {
      addToast("Upload Blocked", "Please select a workspace first.", "danger")
      return
    }

    setUploading(true)
    setUploadProgress(15)
    addToast("Upload Started", `Uploading ${acceptedFiles[0].name}...`, "info")

    try {
      const newDoc = await api.uploadDocument(activeWorkspace.id, acceptedFiles[0], useOcr)
      setUploadProgress(100)
      setDocs(prev => {
        const exists = prev.some(d => d.id === newDoc.id)
        if (exists) {
          return prev.map(d => d.id === newDoc.id ? newDoc : d)
        }
        return [newDoc, ...prev]
      })
      addToast("Upload Complete", "Document uploaded successfully. Processing started.", "success")
    } catch (err: any) {
      addToast("Upload Failed", err.message || "An error occurred during upload.", "danger")
    } finally {
      setUploading(false)
    }
  }, [activeWorkspace?.id, useOcr])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
    maxSize: 100 * 1024 * 1024, // 100 MB Limit
  })

  const filtered = docs.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase())
    const normalizedStatus = (d.status === 'error' || d.status === 'failed') ? 'failed' : d.status
    const matchStatus = statusFilter === 'all' || normalizedStatus === statusFilter
    const matchTag = selectedTag === 'all' || d.tags.some(t => t.toLowerCase() === selectedTag.toLowerCase())
    return matchSearch && matchStatus && matchTag
  })

  const counts = {
    all: docs.length,
    ready: docs.filter(d => d.status === 'ready').length,
    processing: docs.filter(d => d.status === 'processing' || d.status === 'uploading').length,
    failed: docs.filter(d => d.status === 'failed' || d.status === 'error').length,
  }

  const handleDelete = async (id: string, name: string) => {
    try {
      await api.deleteDocument(id)
      setDocs(prev => prev.filter(d => d.id !== id))
      if (selectedDoc?.id === id) {
        setSelectedDoc(null)
      }
      addToast("Document Deleted", `${name} has been permanently deleted.`, "danger")
    } catch (err: any) {
      addToast("Delete Failed", err.message || "Could not delete document.", "danger")
    }
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-8 animate-fade-in">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black mb-1">Documents</h1>
            <p className="text-sm text-text-subtle">{counts.all} documents indexed in workspace</p>
          </div>
        </div>

        {/* Drop zone with OCR controls */}
        <div className="space-y-3">
          <div
            {...getRootProps()}
            id="upload-dropzone"
            className={`relative rounded-2xl border-2 border-dashed p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
              isDragActive
                ? 'border-indigo-500 bg-indigo-600/10'
                : 'border-border-strong hover:border-border-strong hover:bg-bg-panel'
            }`}
          >
            <input {...getInputProps()} id="upload-input" />
            {uploading ? (
              <div className="flex flex-col items-center gap-3 w-full max-w-xs animate-fade-in">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-indigo-400 animate-bounce" />
                </div>
                <div className="text-sm font-semibold">Uploading & processing…</div>
                <div className="w-full h-1.5 bg-bg-hover rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="text-xs text-text-muted">{uploadProgress}%</div>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center mb-3 transition-transform group-hover:scale-110">
                  <Upload className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="text-sm font-bold mb-1">
                  {isDragActive ? 'Drop files here' : 'Drag & drop documents'}
                </div>
                <div className="text-xs text-text-subtle mb-3">or click to browse (Max 100MB)</div>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {['PDF', 'DOCX', 'TXT', 'MD'].map(t => (
                    <span key={t} className="px-2 py-0.5 rounded-full bg-bg-hover border border-border-strong text-[10px] text-text-muted">{t}</span>
                  ))}
                </div>
              </>
            )}
          </div>
          
          {/* OCR Checkbox Row */}
          <div className="flex items-center gap-2 px-1">
            <input
              id="ocr-checkbox"
              type="checkbox"
              checked={useOcr}
              onChange={(e) => setUseOcr(e.target.checked)}
              className="w-4 h-4 rounded border-border-strong bg-bg-panel text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="ocr-checkbox" className="text-xs text-text-subtle cursor-pointer select-none">
              Run OCR for scanned PDFs (requires PyTesseract on host)
            </label>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 mb-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                id="documents-search"
                type="text"
                placeholder="Search documents by name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-border-strong bg-bg-panel text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="flex gap-2">
              {(['all', 'ready', 'processing', 'failed'] as const).map(s => {
                const count = s === 'all' ? counts.all : counts[s]
                return (
                  <button
                    key={s}
                    id={`filter-${s}`}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 capitalize border ${
                      statusFilter === s
                        ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
                        : 'bg-bg-panel border border-border-strong text-text-subtle hover:text-foreground hover:border-border-strong'
                    }`}
                  >
                    {s === 'processing' ? 'Processing' : s} ({count})
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Document list */}
        <div className="rounded-2xl border border-border-strong bg-bg-input overflow-hidden">
          {/* Desktop view */}
          <div className="hidden md:block overflow-x-auto">
            <div className="min-w-[768px]">
              {/* Table header */}
              <div className="grid grid-cols-[2fr_80px_80px_120px_100px_80px] gap-4 px-5 py-3 border-b border-border-subtle text-xs font-semibold text-text-muted uppercase tracking-wider">
                <span>Document</span>
                <span>Type</span>
                <span>Size</span>
                <span>Uploaded</span>
                <span>Status</span>
                <span>Actions</span>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                  <RefreshCw className="w-8 h-8 mb-3 animate-spin text-indigo-500" />
                  <p className="text-sm">Fetching documents...</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                  <FileText className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No documents found matching search criteria.</p>
                </div>
              ) : (
                filtered.map((doc, i) => {
                  const status = STATUS_CONFIG[doc.status] || STATUS_CONFIG.error
                  const isProcessing = doc.status === 'processing' || doc.status === 'uploading'
                  return (
                    <div
                      key={doc.id}
                      className={`grid grid-cols-[2fr_80px_80px_120px_100px_80px] gap-4 px-5 py-3.5 items-center hover:bg-bg-hover transition-colors cursor-pointer ${i < filtered.length - 1 ? 'border-b border-border-subtle' : ''}`}
                      onClick={() => setSelectedDoc(doc)}
                    >
                      {/* Name */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-bg-panel border border-border-strong flex items-center justify-center shrink-0">
                          {FILE_TYPE_ICONS[doc.type] || <FileText className="w-3.5 h-3.5 text-text-muted" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate hover:text-indigo-300 transition-colors">{doc.name}</div>
                          <div className="text-xs text-text-muted">
                            {doc.status === 'ready' ? `${doc.chunks} chunks · ${doc.pages} pages` :
                             isProcessing ? `Processing details…` :
                             `Extraction failed: ${doc.metadata?.error || 'unknown error'}`}
                          </div>
                        </div>
                      </div>

                      {/* Type */}
                      <span className="text-xs text-text-subtle">{doc.type}</span>

                      {/* Size */}
                      <span className="text-xs text-text-subtle">{formatBytes(doc.size)}</span>

                      {/* Uploaded */}
                      <span className="text-xs text-text-subtle">{formatRelativeTime(doc.uploadedAt)}</span>

                      {/* Status */}
                      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border w-fit ${status.bg} ${status.color}`}>
                        {isProcessing ? (
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        ) : (
                          <status.icon className="w-3 h-3" />
                        )}
                        {status.label}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <Link
                          href="/dashboard/chat"
                          id={`doc-chat-${doc.id}`}
                          title="Ask about this document"
                          onClick={() => addToast("Query context loaded", `Opening chat scoped to ${doc.name}`, "info")}
                          className="p-1.5 rounded-lg hover:bg-indigo-600/20 text-text-muted hover:text-indigo-400 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          id={`doc-delete-${doc.id}`}
                          title="Delete"
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-text-muted hover:text-red-400 transition-colors"
                          onClick={() => handleDelete(doc.id, doc.name)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Mobile view */}
          <div className="block md:hidden divide-y divide-border-subtle">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                <RefreshCw className="w-6 h-6 mb-2 animate-spin text-indigo-500" />
                <p className="text-xs">Fetching documents...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                <FileText className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs">No documents found matching search criteria.</p>
              </div>
            ) : (
              filtered.map((doc) => {
                const status = STATUS_CONFIG[doc.status] || STATUS_CONFIG.error
                const isProcessing = doc.status === 'processing' || doc.status === 'uploading'
                return (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedDoc(doc)}
                    className="p-4 hover:bg-bg-hover transition-colors cursor-pointer flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-bg-panel border border-border-strong flex items-center justify-center shrink-0">
                          {FILE_TYPE_ICONS[doc.type] || <FileText className="w-3.5 h-3.5 text-text-muted" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-foreground truncate">{doc.name}</div>
                          <div className="text-[10px] text-text-muted mt-0.5">
                            {doc.type} · {formatBytes(doc.size)} · {formatRelativeTime(doc.uploadedAt)}
                          </div>
                        </div>
                      </div>
                      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${status.bg} ${status.color}`}>
                        {isProcessing ? (
                          <div className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
                        ) : (
                          <status.icon className="w-2.5 h-2.5" />
                        )}
                        {status.label}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-1 text-[10px] text-text-subtle">
                      <div>
                        {doc.status === 'ready' ? `${doc.chunks} chunks · ${doc.pages} pages` : '—'}
                      </div>
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <Link
                          href="/dashboard/chat"
                          id={`doc-chat-mob-${doc.id}`}
                          onClick={() => addToast("Query context loaded", `Opening chat scoped to ${doc.name}`, "info")}
                          className="px-2.5 py-1 rounded-lg border border-border-strong bg-bg-panel text-xs text-text-subtle hover:text-indigo-400 transition-colors flex items-center gap-1"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> Ask AI
                        </Link>
                        <button
                          id={`doc-delete-mob-${doc.id}`}
                          className="p-1 rounded-lg border border-border-strong bg-bg-panel hover:bg-red-500/20 text-text-muted hover:text-red-400 transition-colors"
                          onClick={() => handleDelete(doc.id, doc.name)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Document detail slide-over */}
        {selectedDoc && (
          <div className="fixed inset-0 z-50 flex animate-fade-in justify-end">
            <div className="hidden md:block flex-1 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedDoc(null)} />
            <div className="w-full md:max-w-md bg-bg-panel border-l border-border-strong flex flex-col overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-border-subtle">
                <h2 className="text-sm font-bold text-foreground">Document Details</h2>
                <button onClick={() => setSelectedDoc(null)} className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 flex flex-col gap-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-bg-input border border-border-strong flex items-center justify-center">
                    {FILE_TYPE_ICONS[selectedDoc.type] || <FileText className="w-5 h-5 text-text-muted" />}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-foreground">{selectedDoc.name}</div>
                    <div className="text-xs text-text-muted mt-0.5">{selectedDoc.type} · {formatBytes(selectedDoc.size)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Pages', value: selectedDoc.pages },
                    { label: 'Chunks', value: selectedDoc.chunks || '—' },
                    { label: 'OCR Applied', value: selectedDoc.metadata?.ocr_applied ? 'Yes' : 'No' },
                    { label: 'Uploaded', value: formatRelativeTime(selectedDoc.uploadedAt) },
                  ].map(i => (
                    <div key={i.label} className="rounded-xl bg-bg-input border border-border-strong p-3">
                      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{i.label}</div>
                      <div className="text-sm font-semibold text-foreground">{i.value}</div>
                    </div>
                  ))}
                </div>

                {selectedDoc.content_hash && (
                  <div className="rounded-xl bg-bg-input border border-border-strong p-3">
                    <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Content Hash (SHA-256)</div>
                    <div className="text-xs font-mono text-text-muted break-all">{selectedDoc.content_hash}</div>
                  </div>
                )}

                {selectedDoc.metadata?.error && (
                  <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
                    <div className="text-[10px] text-red-400 uppercase tracking-wider mb-1">Error Message</div>
                    <div className="text-xs text-red-200">{selectedDoc.metadata.error}</div>
                  </div>
                )}

                {selectedDoc.tags && selectedDoc.tags.length > 0 && (
                  <div>
                    <div className="text-xs text-text-muted mb-2">Tags</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedDoc.tags.map(tag => (
                        <span key={tag} className="px-2.5 py-1 rounded-full bg-indigo-600/10 border border-indigo-500/20 text-xs text-indigo-400">#{tag}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Link 
                    href="/dashboard/chat"
                    onClick={() => {
                      addToast("Scoped chat query loaded", `Chatting about ${selectedDoc.name}`, "info")
                      setSelectedDoc(null)
                    }}
                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-xl transition-all text-center active:scale-95"
                  >
                    <MessageSquare className="w-4 h-4" /> Ask about this
                  </Link>
                  <button 
                    onClick={() => handleDelete(selectedDoc.id, selectedDoc.name)}
                    className="flex items-center justify-center gap-2 bg-red-600/10 border border-red-500/20 hover:bg-red-600/20 text-red-400 text-sm py-2.5 px-4 rounded-xl transition-all active:scale-95"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

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
