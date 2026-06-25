'use client'

import { useState, useRef } from 'react'
import { formatRelativeTime } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspace'
import {
  Search, Zap, FileText, Filter, SlidersHorizontal,
  MessageSquare, ChevronDown, X, Sparkles, Clock,
  ArrowRight, Brain, CheckCircle2, AlertCircle, ExternalLink
} from 'lucide-react'
import Link from 'next/link'

interface SearchHit {
  docId: string
  docName: string
  docType: string
  workspace: string
  workspaceId: string
  page: number
  relevance: number
  snippet: string
  matchType: string
  uploadedAt: string | null
}

const TYPE_OPTIONS = ['All types', 'PDF', 'DOCX', 'XLSX', 'TXT', 'CSV']

const FILE_TYPE_COLORS: Record<string, string> = {
  PDF: 'text-red-400',
  DOCX: 'text-blue-400',
  XLSX: 'text-emerald-400',
  TXT: 'text-text-subtle',
  CSV: 'text-amber-400',
}

function HighlightedText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  return (
    <span>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <mark key={i} className="bg-indigo-500/20 text-indigo-200 rounded px-0.5 not-italic">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </span>
  )
}

function RelevanceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = score > 0.9 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : score > 0.75 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    : 'text-text-subtle bg-bg-hover border-border-strong'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${color}`}>
      {pct}% match
    </span>
  )
}

export default function SearchPage() {
  const { activeWorkspace, workspaces } = useWorkspaceStore()
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchHit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [docType, setDocType] = useState('All types')
  const [matchType, setMatchType] = useState<'all' | 'semantic' | 'keyword'>('all')
  
  // Document Viewer states
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerDoc, setViewerDoc] = useState<{ id: string; name: string; page: number; snippet: string } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    if (!activeWorkspace?.id) {
      setError('Please select a workspace first.')
      return
    }

    setLoading(true)
    setSearched(false)
    setError(null)
    setResults([])

    try {
      const res = await fetch('/api/query/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
        body: JSON.stringify({
          workspace_id: activeWorkspace.id,
          query: query.trim(),
          top_k: 15,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Search failed (${res.status})`)
      }

      const data = await res.json()
      let hits: SearchHit[] = data.results || []

      // Client-side filter by docType
      if (docType !== 'All types') {
        hits = hits.filter(h => h.docType === docType)
      }
      // Client-side filter by matchType
      if (matchType !== 'all') {
        hits = hits.filter(h => h.matchType === matchType)
      }

      setResults(hits)
    } catch (err: any) {
      setError(err.message || 'An error occurred during search.')
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }

  const RECENT_QUERIES = [
    'termination clauses contract',
    'payment due dates invoices',
    'confidentiality obligations NDA',
    'governing law jurisdiction',
  ]

  return (
    <div className="h-full overflow-y-auto px-6 py-8 animate-fade-in">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-black mb-1">Semantic Search</h1>
          <p className="text-sm text-text-subtle">
            Vector search across all indexed documents in your active workspace — understands intent, synonyms, and context.
          </p>
          {activeWorkspace && (
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
              <div className="w-2 h-2 rounded-full bg-indigo-400" />
              Searching in: <span className="font-semibold">{activeWorkspace.name}</span>
            </div>
          )}
          {!activeWorkspace && (
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              <AlertCircle className="w-3.5 h-3.5" />
              No workspace selected. Switch workspace from the sidebar.
            </div>
          )}
        </div>

        {/* Search input */}
        <div className="relative mb-4">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border bg-bg-input transition-all duration-200 ${
            loading ? 'border-indigo-500/60 shadow-lg shadow-indigo-500/10' : 'border-border-strong focus-within:border-indigo-500/50 focus-within:shadow-lg focus-within:shadow-indigo-500/5'
          }`}>
            {loading ? (
              <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin shrink-0" />
            ) : (
              <Search className="w-5 h-5 text-text-muted shrink-0" />
            )}
            <input
              ref={inputRef}
              id="semantic-search-input"
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search across all documents…"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-text-muted outline-none"
            />
            {query && (
              <button onClick={() => { setQuery(''); setSearched(false); setResults([]) }} className="p-1 text-text-muted hover:text-foreground transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              id="run-search-btn"
              onClick={handleSearch}
              disabled={!query.trim() || loading || !activeWorkspace}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shrink-0 active:scale-95 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Search</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6 p-1 bg-bg-panel/20 rounded-2xl border border-border-subtle">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-text-muted" />
            <select
              value={docType}
              onChange={e => setDocType(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-border-strong bg-bg-panel text-xs text-text-subtle focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
            >
              {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="flex gap-1 items-center w-full sm:w-auto sm:ml-auto p-1 bg-bg-panel/50 rounded-xl border border-border-strong sm:border-transparent">
            {(['all', 'semantic', 'keyword'] as const).map(m => (
              <button
                key={m}
                id={`match-type-${m}`}
                onClick={() => setMatchType(m)}
                className={`flex-1 sm:flex-none text-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize cursor-pointer ${
                  matchType === m
                    ? 'bg-indigo-600/20 text-indigo-300 font-bold'
                    : 'text-text-subtle hover:text-foreground'
                }`}
              >
                {m === 'all' ? 'All' : m === 'semantic' ? '⚡ Semantic' : '🔑 Keyword'}
              </button>
            ))}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Initial state — no search yet */}
        {!searched && !loading && (
          <div className="flex flex-col gap-6">
            {/* Recent queries */}
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                <Clock className="w-3.5 h-3.5" /> Recent searches
              </div>
              <div className="flex flex-col gap-1.5">
                {RECENT_QUERIES.map((q, i) => (
                  <button
                    key={i}
                    id={`recent-query-${i}`}
                    onClick={() => { setQuery(q); }}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-bg-input border border-transparent hover:border-border-strong text-left transition-all group"
                  >
                    <Clock className="w-3.5 h-3.5 text-[#3A3A4E] shrink-0" />
                    <span className="text-sm text-text-subtle group-hover:text-foreground transition-colors">{q}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#3A3A4E] ml-auto group-hover:text-indigo-400 transition-colors" />
                  </button>
                ))}
              </div>
            </div>

            {/* Tips */}
            <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold">Search tips</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { tip: 'Ask in natural language', ex: '"what are the payment terms?"' },
                  { tip: 'Search by concept, not just keyword', ex: '"early exit provisions"' },
                  { tip: 'Combine topics', ex: '"GDPR obligations in vendor contracts"' },
                  { tip: 'Search specific document types', ex: '"NDA confidentiality obligations"' },
                ].map((t, i) => (
                  <div key={i} className="p-3 rounded-xl bg-bg-panel border border-border-strong">
                    <div className="text-xs font-semibold mb-1">{t.tip}</div>
                    <div className="text-[11px] text-indigo-400 font-mono">{t.ex}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center">
              <Brain className="w-6 h-6 text-indigo-400 animate-pulse" />
            </div>
            <div className="text-sm text-text-subtle">Searching indexed documents with embeddings…</div>
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {searched && !loading && (
          <div>
            {/* Results header */}
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-text-subtle">
                <span className="font-semibold text-foreground">{results.length}</span> results for &ldquo;{query}&rdquo;
              </div>
              <Link
                href="/dashboard/chat"
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-600/10 border border-indigo-500/20 hover:bg-indigo-600/20 text-indigo-400 text-xs font-medium transition-all active:scale-95"
              >
                <MessageSquare className="w-3.5 h-3.5" /> Ask AI about these results
              </Link>
            </div>

            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-3">
                <Search className="w-10 h-10 opacity-30" />
                <p className="text-sm">No results found. Try a different query or upload more documents.</p>
                <button onClick={() => { setDocType('All types'); setMatchType('all') }} className="text-xs text-indigo-400 hover:text-indigo-300">
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {results.map((r, i) => (
                  <div
                    key={`${r.docId}-${r.page}-${i}`}
                    id={`search-result-${i}`}
                    onClick={() => {
                      setViewerDoc({ id: r.docId, name: r.docName, page: r.page, snippet: r.snippet })
                      setViewerOpen(true)
                    }}
                    className="rounded-2xl border border-border-strong bg-bg-input p-5 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5 transition-all cursor-pointer group"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-bg-panel border border-border-strong flex items-center justify-center shrink-0">
                          <span className={`text-[10px] font-black ${FILE_TYPE_COLORS[r.docType] || 'text-text-subtle'}`}>{r.docType}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate group-hover:text-indigo-300 transition-colors" title={r.docName}>{r.docName}</div>
                          <div className="text-[10px] text-text-muted">{r.workspace} · p. {r.page}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:ml-auto shrink-0 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${
                          r.matchType === 'semantic'
                            ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
                            : 'text-text-subtle bg-bg-hover border-border-strong'
                        }`}>
                          {r.matchType === 'semantic' ? '⚡ semantic' : '🔑 keyword'}
                        </span>
                        <RelevanceBadge score={r.relevance} />
                      </div>
                    </div>

                    <p className="text-xs text-text-subtle leading-relaxed italic mb-3">
                      &quot;<HighlightedText text={r.snippet} />&quot;
                    </p>

                    {/* Relevance bar */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1 bg-bg-hover rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-700"
                          style={{ width: `${r.relevance * 100}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-2 ml-auto">
                        <Link
                          href="/dashboard/chat"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-panel border border-border-strong hover:border-indigo-500/40 hover:bg-indigo-600/5 text-[10px] text-text-subtle hover:text-indigo-400 font-medium transition-all"
                          onClick={e => e.stopPropagation()}
                        >
                          <MessageSquare className="w-3 h-3" /> Ask AI
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Document Viewer Modal */}
      {viewerOpen && viewerDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setViewerOpen(false)} />
          <div className="relative z-10 w-full sm:max-w-4xl h-[100dvh] sm:h-[85vh] rounded-none sm:rounded-2xl border-0 sm:border border-border-strong bg-bg-panel shadow-2xl flex flex-col overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border-subtle bg-bg-input">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="text-xs font-bold text-foreground truncate max-w-[100px] sm:max-w-md">{viewerDoc.name}</span>
                <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded shrink-0">p. {viewerDoc.page}</span>
                <a
                  href={`/api/documents/${viewerDoc.id}/download#page=${viewerDoc.page}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2 py-1 rounded bg-[#2A2A3A] border border-border-subtle hover:border-indigo-500/40 hover:bg-indigo-600/5 text-[10px] text-indigo-400 hover:text-indigo-300 transition-all font-semibold shrink-0"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span className="hidden sm:inline">Buka di Tab Baru</span>
                </a>
              </div>
              <button onClick={() => setViewerOpen(false)} className="p-1 rounded text-text-muted hover:text-foreground hover:bg-bg-hover transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Viewer toolbar */}
            <div className="flex items-center gap-4 px-4 py-2 border-b border-border-subtle bg-background text-[10px] text-text-subtle">
              <div className="flex items-center gap-2">
                <span>Page</span>
                <input type="text" readOnly value={viewerDoc.page} className="w-8 text-center bg-bg-hover border border-border-strong rounded py-0.5" />
              </div>
              <div className="w-px h-3 bg-[#2A2A3A]" />
              <Link 
                href={`/dashboard/chat`}
                className="ml-auto flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors active:scale-95 text-[9px] sm:text-[10px]"
              >
                <Brain className="w-3 h-3" />
                <span className="hidden sm:inline">Ask AI about this page</span>
                <span className="sm:hidden">Tanya AI</span>
              </Link>
            </div>
            
            {/* Page Content / Actual PDF iframe */}
            <div className="flex-1 bg-background flex flex-col">
              {viewerDoc.name.toLowerCase().endsWith('.pdf') ? (
                <div className="flex-1 w-full flex flex-col">
                  {/* Mobile Tip Banner */}
                  <div className="block sm:hidden bg-indigo-500/10 border-b border-indigo-500/20 px-4 py-2 text-[10px] text-indigo-300 text-center">
                    💡 Tips: Jika PDF tidak tampil sempurna, gunakan tombol <strong>"Buka di Tab Baru"</strong> di atas.
                  </div>
                  <iframe
                    src={`/api/documents/${viewerDoc.id}/download#page=${viewerDoc.page}`}
                    className="flex-1 w-full border-none"
                    title={viewerDoc.name}
                  />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-6 bg-background bg-dot-pattern flex items-center justify-center">
                  <div className="w-full max-w-xl bg-bg-input border border-border-strong rounded-xl p-8 shadow-lg text-xs leading-relaxed text-text-subtle min-h-[50vh] flex flex-col justify-between">
                    <div>
                      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-6 border-b border-border-subtle pb-2 flex justify-between">
                        <span>Document Snippet</span>
                        <span>CONFIDENTIAL</span>
                      </div>
                      <p className="mb-4 text-foreground bg-indigo-500/10 border-l-2 border-indigo-500 p-3 italic rounded-r-lg">
                        "...{viewerDoc.snippet}..."
                      </p>
                    </div>
                    <div className="text-center text-[10px] text-text-muted mt-6 border-t border-border-subtle/60 pt-3">
                      Document ID: {viewerDoc.id}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
