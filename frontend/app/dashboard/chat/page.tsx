'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { mockDocuments } from '@/lib/mock-data'
import { ChatMessage, Citation } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import {
  Brain, Send, FileText, ThumbsUp, ThumbsDown, Copy,
  ChevronDown, Sparkles, Clock, RotateCcw, X, Zap,
  MessageSquare, ChevronRight, Info, Search, Star,
  Bot, Wrench, CheckCircle2, AlertCircle, Loader2, ChevronUp, Database,
  FlaskConical, BookOpen, ListTree, Layers, Download, ExternalLink, ScrollText, Trash2, Check
} from 'lucide-react'
import ReactMarkdown, { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism'

const SUGGESTED_QUERIES = [
  "What are the termination clauses?",
  "Summarize the key financial obligations",
  "Who are the parties in this agreement?",
  "What is the total contract value?",
  "Extract all payment due dates",
]

interface ModelInfo {
  id: string
  name: string
  endpoint_id: string
  endpoint_name: string
  provider_label: string
}

const FALLBACK_MODELS: ModelInfo[] = []

type Conversation = {
  id: string;
  workspace_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

// ─── Agent Step Types ─────────────────────────────────────────────────────
type AgentStep = {
  id: string
  type: 'thinking' | 'tool_call' | 'tool_result' | 'answer_start' | 'done' | 'error' | 'max_iterations'
  step?: number
  tool?: string
  args?: Record<string, any>
  result?: Record<string, any>
  message?: string
  latency_ms?: number
}

// ─── Agent Steps Panel ─────────────────────────────────────────────────────
const TOOL_LABELS: Record<string, string> = {
  search_documents: 'Mencari Dokumen',
  list_documents: 'Daftar Dokumen',
  get_document_metadata: 'Metadata Dokumen',
  get_document_content: 'Membaca Halaman',
  semantic_search: 'Pencarian Semantik',
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  search_documents: <Search className="w-3 h-3" />,
  list_documents: <Database className="w-3 h-3" />,
  get_document_metadata: <FileText className="w-3 h-3" />,
  get_document_content: <FileText className="w-3 h-3" />,
  semantic_search: <Search className="w-3 h-3" />,
}

function AgentStepsPanel({ steps, isRunning, streamingText }: {
  steps: AgentStep[]
  isRunning: boolean
  streamingText: string
}) {
  const [collapsed, setCollapsed] = useState(false)

  // Group tool_call + tool_result pairs
  const toolPairs: { call: AgentStep; result?: AgentStep }[] = []
  const otherSteps: AgentStep[] = []

  const toolCallMap = new Map<string, AgentStep>()
  for (const s of steps) {
    if (s.type === 'tool_call') {
      const key = `${s.step}_${s.tool}`
      toolCallMap.set(key, s)
      toolPairs.push({ call: s })
    } else if (s.type === 'tool_result') {
      const key = `${s.step}_${s.tool}`
      const pair = toolPairs.find(p => `${p.call.step}_${p.call.tool}` === key)
      if (pair) pair.result = s
    }
  }

  const hasContent = toolPairs.length > 0 || isRunning

  if (!hasContent && !streamingText) return null

  return (
    <div className="flex gap-3 mb-4 animate-fade-in">
      <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-4 h-4 text-foreground" />
      </div>
      <div className="flex-1 max-w-2xl">
        {/* Steps header */}
        <div
          className="flex items-center gap-2 mb-2 cursor-pointer group"
          onClick={() => setCollapsed(c => !c)}
        >
          <div className="flex items-center gap-1.5">
            {isRunning && !streamingText ? (
              <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span className="text-xs font-semibold text-text-subtle group-hover:text-foreground transition-colors">
              {isRunning && !streamingText
                ? `Agent sedang bekerja... (langkah ${steps.filter(s => s.type === 'tool_call').length})`
                : `Agent selesai — ${toolPairs.length} tool calls`
              }
            </span>
          </div>
          {toolPairs.length > 0 && (
            <button className="ml-auto text-text-muted hover:text-foreground transition-colors">
              {collapsed
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronUp className="w-3 h-3" />
              }
            </button>
          )}
        </div>

        {/* Tool call steps */}
        {!collapsed && toolPairs.length > 0 && (
          <div className="bg-background border border-border-subtle rounded-xl overflow-hidden mb-2">
            {toolPairs.map((pair, i) => (
              <div key={i} className={`px-3 py-2.5 ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
                <div className="flex items-center gap-2">
                  {/* Step number */}
                  <div className="w-5 h-5 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-black text-violet-400">{i + 1}</span>
                  </div>
                  {/* Tool icon */}
                  <div className="text-violet-400">
                    {TOOL_ICONS[pair.call.tool || ''] || <Wrench className="w-3 h-3" />}
                  </div>
                  {/* Tool name */}
                  <span className="text-xs font-semibold text-foreground">
                    {TOOL_LABELS[pair.call.tool || ''] || pair.call.tool}
                  </span>
                  {/* Args preview */}
                  {pair.call.args && Object.keys(pair.call.args).length > 0 && (
                    <span className="text-[10px] text-text-muted truncate max-w-[180px]">
                      {Object.entries(pair.call.args)
                        .map(([k, v]) => `${k}: "${String(v).slice(0, 30)}${String(v).length > 30 ? '...' : ''}"`)
                        .join(', ')
                      }
                    </span>
                  )}
                  {/* Status */}
                  <div className="ml-auto shrink-0">
                    {pair.result ? (
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        {pair.result.latency_ms && (
                          <span className="text-[9px] text-text-muted">{pair.result.latency_ms}ms</span>
                        )}
                      </div>
                    ) : (
                      <Loader2 className="w-3 h-3 text-violet-400 animate-spin" />
                    )}
                  </div>
                </div>
                {/* Result preview */}
                {pair.result?.result && (
                  <div className="mt-1.5 ml-7 text-[10px] text-text-muted">
                    {(() => {
                      const r = pair.result.result
                      if (r.hits_found !== undefined) return `${r.hits_found} chunks ditemukan`
                      if (r.total_documents !== undefined) return `${r.total_documents} dokumen di workspace`
                      if (r.filename) return `📄 ${r.filename}`
                      if (r.content) return `${String(r.content).slice(0, 60)}...`
                      if (r.error) return `⚠ ${r.error}`
                      return null
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Streaming answer */}
        {streamingText && (
          <div className="bg-bg-input border border-border-strong rounded-2xl rounded-tl-sm px-4 py-3">
            <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {streamingText}
              <span className="inline-block w-1.5 h-4 bg-violet-500 ml-1 align-middle animate-caret">|</span>
            </div>
          </div>
        )}

        {/* Loading state before answer */}
        {isRunning && !streamingText && (
          <div className="flex items-center gap-2 text-text-muted text-xs">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1 h-1 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <span>Menganalisis dokumen...</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Citation Pill Component ─────────────────────────────────────────────────
function CitationPill({ citation, index, onOpenDoc }: { citation: Citation; index: number; onOpenDoc: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const num = citation.citationNumber ?? index + 1
  const relevancePct = citation.relevanceScore ? Math.round(citation.relevanceScore * 100) : null

  useEffect(() => {
    if (!expanded) return

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setExpanded(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [expanded])

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-bg-panel border border-border-strong hover:border-indigo-500/40 hover:bg-indigo-600/5 text-xs text-indigo-400 transition-all duration-200"
      >
        <FileText className="w-3 h-3" />
        <span className="max-w-[120px] truncate text-[11px]">{citation.docName.replace(/\.[^.]+$/, '')}</span>
        <span className="text-text-muted">p.{citation.page}</span>
        <sup className="text-[9px] font-bold">[{num}]</sup>
      </button>
      {expanded && (
        <div className="absolute bottom-full left-0 mb-2 w-80 rounded-xl border border-border-strong bg-bg-input shadow-2xl shadow-black/50 p-4 z-20">
          {/* Header */}
          <div className="flex items-start gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-black text-indigo-400">{num}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{citation.docName}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-text-muted">Halaman {citation.page}</span>
                {relevancePct !== null && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${relevancePct >= 80 ? 'bg-emerald-500/10 text-emerald-400' :
                    relevancePct >= 60 ? 'bg-amber-500/10 text-amber-400' :
                      'bg-[#2A2A3A] text-text-subtle'
                    }`}>
                    {relevancePct}% match
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Snippet / Full Text */}
          <div className="bg-bg-panel rounded-lg p-3 mb-3 border border-border-subtle">
            <p className="text-[11px] text-text-subtle italic leading-relaxed line-clamp-5">
              &ldquo;{citation.fullText || citation.snippet}&rdquo;
            </p>
          </div>
          {/* Actions */}
          <button
            onClick={(e) => { e.stopPropagation(); onOpenDoc(); setExpanded(false); }}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 text-xs text-indigo-400 hover:text-indigo-300 transition-all"
          >
            <FileText className="w-3 h-3" />
            Buka Dokumen
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Inline Citation Renderer ─────────────────────────────────────────────────
// Parse [N] patterns di teks AI menjadi superscript interaktif
function renderContentWithCitations(
  content: string,
  citations: Citation[],
  onCitationClick: (citation: Citation) => void
): React.ReactNode[] {
  const parts = content.split(/(\[\d+(?:,\s*\d+)*\])/g)

  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+(?:,\s*\d+)*)\]$/)
    if (match) {
      const nums = match[1].split(',').map(n => parseInt(n.trim()))
      return (
        <span key={i} className="inline-flex gap-0.5">
          {nums.map(num => {
            const citation = citations.find(c =>
              (c.citationNumber ?? 0) === num ||
              citations.indexOf(c) + 1 === num
            )
            return (
              <button
                key={num}
                onClick={() => citation && onCitationClick(citation)}
                title={citation ? `${citation.docName} — p.${citation.page}` : `Sumber [${num}]`}
                className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-[9px] font-black text-indigo-300 hover:bg-indigo-500/40 hover:text-indigo-200 transition-all cursor-pointer align-super leading-none"
              >
                {num}
              </button>
            )
          })}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}


// ─── Chat Bubble Component ────────────────────────────────────────────────────
function ChatBubble({ message, onOpenDoc }: { message: ChatMessage; onOpenDoc: (citation: Citation) => void }) {
  const isUser = message.role === 'user'
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)
  const [copied, setCopied] = useState(false)
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null)
  const citationPanelRef = useRef<HTMLDivElement>(null)

  const copy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleCitationClick = (citation: Citation) => {
    setActiveCitation(activeCitation?.docId === citation.docId && activeCitation?.page === citation.page ? null : citation)
  }

  useEffect(() => {
    if (!activeCitation) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const isCitationBtn = target.closest('button')?.getAttribute('title')?.includes('Sumber') || target.closest('button')?.getAttribute('title')?.includes('— p.')
      
      if (citationPanelRef.current && !citationPanelRef.current.contains(target) && !isCitationBtn) {
        setActiveCitation(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [activeCitation])

  if (isUser) {
    return (
      <div className="flex justify-end mb-4 animate-fade-in">
        <div className="max-w-lg bg-indigo-600/20 border border-indigo-500/20 rounded-2xl rounded-tr-sm px-4 py-3">
          <p className="text-sm text-foreground leading-relaxed">{message.content}</p>
        </div>
      </div>
    )
  }

  const citations = message.citations ?? []
  const hasInlineCitations = citations.length > 0 && /\[\d+\]/.test(message.content)

  const renderers: Components = {
    // Custom renderer untuk paragraf — inject citation badges
    p: ({ children }) => (
      <p className="mb-3 last:mb-0">
        {typeof children === 'string'
          ? renderContentWithCitations(children, citations, handleCitationClick)
          : Array.isArray(children)
            ? children.map((child, i) =>
              typeof child === 'string'
                ? renderContentWithCitations(child, citations, handleCitationClick)
                : child
            )
            : children
        }
      </p>
    ),
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '')
      const language = match ? match[1] : ''
      const codeString = String(children).replace(/\n$/, '')
      
      const [isCopied, setIsCopied] = useState(false)
      const handleCopyCode = () => {
        navigator.clipboard.writeText(codeString)
        setIsCopied(true)
        setTimeout(() => setIsCopied(false), 2000)
      }

      if (!inline && match) {
        return (
          <div className="relative group/code my-4 rounded-xl overflow-hidden border border-border-strong bg-[#1E1E1E]">
            <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-border-strong text-[10px] uppercase font-bold text-text-muted">
              <span>{language}</span>
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                title={isCopied ? "Copied!" : "Copy code"}
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {isCopied ? <span className="text-emerald-400 normal-case">Copied</span> : <span className="normal-case">Copy</span>}
              </button>
            </div>
            <div className="text-[13px]">
              <SyntaxHighlighter
                {...props}
                style={vscDarkPlus}
                language={language}
                PreTag="div"
                customStyle={{ margin: 0, padding: '1rem', background: 'transparent' }}
              >
                {codeString}
              </SyntaxHighlighter>
            </div>
          </div>
        )
      }
      return (
        <code {...props} className={`${className} bg-bg-hover px-1.5 py-0.5 rounded text-indigo-300 font-mono text-[13px]`}>
          {children}
        </code>
      )
    }
  }

  return (
    <div className="flex gap-3 mb-6 animate-fade-in">
      <div className="flex-1 max-w-2xl">
        <div className="bg-bg-input border border-border-strong rounded-2xl rounded-tl-sm px-4 py-3 mb-2">
          {hasInlineCitations ? (
            // Render teks dengan inline citation badges yang interaktif
            <div className="text-sm text-foreground/80 leading-relaxed">
              <div className="prose prose-invert prose-sm max-w-none
                [&_strong]:text-foreground [&_strong]:font-semibold
                [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px] [&_table]:my-4 [&_table]:rounded-xl [&_table]:overflow-hidden [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto
                [&_th]:px-4 [&_th]:py-3 [&_th]:bg-bg-hover/80 [&_th]:border-b [&_th]:border-border-strong [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground
                [&_td]:px-4 [&_td]:py-3 [&_td]:border-b [&_td]:border-border-subtle/50
                [&_tr:last-child_td]:border-0
                [&_blockquote]:border-l-2 [&_blockquote]:border-indigo-500 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-text-subtle
              ">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={renderers}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            // Render normal tanpa inline citations
            <div className="prose prose-invert prose-sm max-w-none text-foreground/80 leading-relaxed
              [&_strong]:text-foreground [&_strong]:font-semibold
              [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px] [&_table]:my-4 [&_table]:rounded-xl [&_table]:overflow-hidden [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto
              [&_th]:px-4 [&_th]:py-3 [&_th]:bg-bg-hover/80 [&_th]:border-b [&_th]:border-border-strong [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground
              [&_td]:px-4 [&_td]:py-3 [&_td]:border-b [&_td]:border-border-subtle/50
              [&_tr:last-child_td]:border-0
              [&_blockquote]:border-l-2 [&_blockquote]:border-indigo-500 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-text-subtle
            ">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={renderers}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Active citation detail panel */}
        {activeCitation && (
          <div ref={citationPanelRef} className="mb-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs font-semibold text-foreground">{activeCitation.docName}</span>
                <span className="text-[10px] bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5 rounded">p.{activeCitation.page}</span>
                {activeCitation.relevanceScore && (
                  <span className="text-[10px] text-emerald-400">{Math.round(activeCitation.relevanceScore * 100)}% match</span>
                )}
              </div>
              <button onClick={() => setActiveCitation(null)} className="text-text-muted hover:text-foreground transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
            <p className="text-[11px] text-text-subtle italic leading-relaxed">
              &ldquo;{activeCitation.fullText || activeCitation.snippet}&rdquo;
            </p>
            <button
              onClick={() => { onOpenDoc(activeCitation); setActiveCitation(null); }}
              className="mt-2 text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              Buka dokumen <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Citations pills + confidence */}
        {citations.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {citations.map((c, i) => (
              <CitationPill key={i} citation={c} index={i} onOpenDoc={() => onOpenDoc(c)} />
            ))}
            {message.source_mode && message.source_mode === 'DOCUMENT' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="w-3 h-3" />
                Answered from document
              </span>
            )}
            {message.source_mode && message.source_mode === 'HYBRID' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border bg-indigo-500/10 border-indigo-500/20 text-indigo-400">
                <Layers className="w-3 h-3" />
                Document + General Knowledge
              </span>
            )}
            {message.source_mode && message.source_mode === 'GENERAL' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border bg-amber-500/10 border-amber-500/20 text-amber-400" title="No relevant document found">
                <AlertCircle className="w-3 h-3" />
                General knowledge
              </span>
            )}
            {message.retrieval_score && message.retrieval_score > 0 && (
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${message.retrieval_score > 0.7 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                message.retrieval_score > 0.45 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                  'bg-red-500/10 border-red-500/20 text-red-400'
                }`} title="Similarity Score">
                <Search className="w-3 h-3" />
                {Math.round(message.retrieval_score * 100)}% Match
              </span>
            )}
            {/* Query rewriting badge */}
            {message.queriesUsed && message.queriesUsed > 1 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-violet-500/10 border border-violet-500/20 text-violet-400">
                <Search className="w-2.5 h-2.5" />
                {message.queriesUsed} query variants
              </span>
            )}
          </div>
        )}

        {/* Meta bar */}
        <div className="flex items-center gap-3">
          {message.model && (
            <span className="text-[10px] text-text-muted">{message.model}</span>
          )}
          <span className="text-[10px] text-text-muted">{formatRelativeTime(message.timestamp)}</span>
          <div className="flex items-center gap-1 ml-auto">
            <button onClick={copy} className="p-1 rounded text-text-muted hover:text-foreground transition-colors" title={copied ? 'Disalin!' : 'Salin'}>
              <Copy className="w-3 h-3" />
            </button>
            <button
              onClick={() => setFeedback('up')}
              className={`p-1 rounded transition-colors ${feedback === 'up' ? 'text-emerald-400' : 'text-text-muted hover:text-foreground'}`}
            >
              <ThumbsUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => setFeedback('down')}
              className={`p-1 rounded transition-colors ${feedback === 'down' ? 'text-red-400' : 'text-text-muted hover:text-foreground'}`}
            >
              <ThumbsDown className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Deep Research Types ───────────────────────────────────────────────────────────
type ResearchEvent = {
  event: string
  sub_questions?: string[]
  count?: number
  question?: string
  index?: number
  total?: number
  chunks_found?: number
  summary_length?: number
  total_chunks?: number
  total_sources?: number
  syntheses_count?: number
  is_followup?: boolean
  job_id?: string
  report_length?: number
  reason?: string
  weak_questions?: string[]
  message?: string
}

// ─── Deep Research Panel ───────────────────────────────────────────────────────────
const RESEARCH_STEP_LABELS: Record<string, string> = {
  plan_start: 'Menyusun rencana riset...',
  plan: 'Rencana riset selesai',
  searching: 'Mencari di dokumen',
  found: 'Chunks ditemukan',
  synthesizing: 'Mensintesis temuan',
  synthesized: 'Sintesis selesai',
  iterating: 'Mengisi gap informasi',
  writing_report: 'Menulis laporan final...',
  done: 'Laporan selesai',
  error: 'Terjadi kesalahan',
}

function DeepResearchPanel({
  events,
  isRunning,
  onViewReport,
  finalJobId,
}: {
  events: ResearchEvent[]
  isRunning: boolean
  onViewReport: () => void
  finalJobId: string | null
}) {
  const subQuestions = events.find(e => e.event === 'plan')?.sub_questions || []
  const isDone = events.some(e => e.event === 'done')
  const hasError = events.some(e => e.event === 'error')
  const writingReport = events.some(e => e.event === 'writing_report')
  const doneEvent = events.find(e => e.event === 'done')
  const totalChunks = doneEvent?.total_chunks || 0
  const totalSources = doneEvent?.total_sources || 0

  // Build progress steps untuk display
  const progressSteps = events.filter(e =>
    ['plan', 'searching', 'synthesized', 'iterating', 'writing_report', 'done', 'error'].includes(e.event)
  )

  return (
    <div className="flex gap-3 mb-4 animate-fade-in">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 mt-0.5">
        <FlaskConical className="w-4 h-4 text-foreground" />
      </div>
      <div className="flex-1 max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          {isRunning && !isDone ? (
            <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
          ) : isDone ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          ) : hasError ? (
            <AlertCircle className="w-3.5 h-3.5 text-red-400" />
          ) : (
            <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
          )}
          <span className="text-xs font-semibold text-foreground">
            {isDone ? 'Laporan Riset Selesai' :
              hasError ? 'Riset Gagal' :
                writingReport ? 'Menulis Laporan...' :
                  'Deep Research Berjalan'}
          </span>
          {isDone && doneEvent && (
            <span className="text-[10px] text-text-muted ml-auto">
              {totalChunks} chunks · {totalSources} sumber
            </span>
          )}
        </div>

        {/* Sub-questions plan */}
        {subQuestions.length > 0 && (
          <div className="bg-background border border-border-subtle rounded-xl p-3 mb-3">
            <div className="flex items-center gap-1.5 mb-2">
              <ListTree className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">Rencana Riset</span>
            </div>
            {subQuestions.map((q, i) => (
              <div key={i} className="flex items-start gap-2 py-1">
                <div className="w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[8px] font-black text-emerald-400">{i + 1}</span>
                </div>
                <span className="text-[11px] text-foreground/80 leading-relaxed">{q}</span>
                {/* Status dot per question */}
                {(() => {
                  const foundEvt = events.find(e => e.event === 'synthesized' && e.index === i + 1)
                  const searchEvt = events.find(e => e.event === 'searching' && e.index === i + 1)
                  return foundEvt ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5 ml-auto" />
                  ) : searchEvt ? (
                    <Loader2 className="w-3 h-3 text-emerald-400 animate-spin shrink-0 mt-0.5 ml-auto" />
                  ) : null
                })()}
              </div>
            ))}
          </div>
        )}

        {/* Progress log */}
        <div className="space-y-1 mb-3">
          {progressSteps.map((evt, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              {evt.event === 'error' ? (
                <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
              ) : evt.event === 'done' ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : (
                <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/30 shrink-0" />
              )}
              <span className={`${evt.event === 'error' ? 'text-red-400' :
                evt.event === 'done' ? 'text-emerald-400 font-medium' :
                  'text-text-subtle'
                }`}>
                {evt.event === 'searching' && evt.question
                  ? `Mencari: "${evt.question.slice(0, 50)}${evt.question.length > 50 ? '...' : ''}"` :
                  evt.event === 'synthesized'
                    ? `Selesai Q${evt.index}: ${evt.chunks_found} chunks` :
                    evt.event === 'plan'
                      ? `${evt.count} sub-questions dihasilkan` :
                      evt.event === 'iterating'
                        ? `Gap filling: ${evt.reason}` :
                        evt.event === 'writing_report'
                          ? `Menulis laporan dari ${evt.total_chunks} chunks, ${evt.total_sources} sumber...` :
                          evt.event === 'done'
                            ? `Laporan selesai · ${evt.report_length?.toLocaleString()} karakter` :
                            evt.event === 'error'
                              ? (evt.message || 'Terjadi kesalahan') :
                              RESEARCH_STEP_LABELS[evt.event] || evt.event
                }
              </span>
            </div>
          ))}

          {/* Running indicator */}
          {isRunning && !isDone && !hasError && (
            <div className="flex items-center gap-2 text-[11px]">
              <Loader2 className="w-3 h-3 text-emerald-400 animate-spin shrink-0" />
              <span className="text-text-muted">
                {writingReport ? 'Menyusun laporan final...' : 'Menganalisis dokumen...'}
              </span>
            </div>
          )}
        </div>

        {/* View Report button */}
        {isDone && finalJobId && (
          <button
            onClick={onViewReport}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-foreground text-xs font-semibold transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
          >
            <ScrollText className="w-3.5 h-3.5" />
            Lihat Laporan Lengkap
            <ExternalLink className="w-3 h-3 opacity-70" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Research Report Modal ───────────────────────────────────────────────────────────
function ResearchReportModal({
  report,
  query,
  onClose,
  onAskFollowUp,
}: {
  report: string
  query: string
  onClose: () => void
  onAskFollowUp: (q: string) => void
}) {
  const copyReport = () => navigator.clipboard.writeText(report)

  const downloadReport = () => {
    const blob = new Blob([report], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `research-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative z-10 w-full max-w-4xl rounded-2xl border border-border-strong bg-bg-panel shadow-2xl shadow-black/70 flex flex-col overflow-hidden animate-fade-in">
        {/* Modal Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border-subtle bg-bg-input shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center">
            <FlaskConical className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-foreground">Laporan Riset Mendalam</div>
            <div className="text-[10px] text-text-muted truncate">{query}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyReport}
              title="Salin laporan"
              className="p-2 rounded-lg text-text-muted hover:text-foreground hover:bg-bg-hover transition-all"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={downloadReport}
              title="Unduh sebagai Markdown"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-emerald-400 text-xs font-medium transition-all"
            >
              <Download className="w-3 h-3" />
              .md
            </button>
            <button onClick={onClose} className="p-2 rounded-lg text-text-muted hover:text-foreground hover:bg-bg-hover transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Report Content */}
        <div className="flex-1 overflow-y-auto p-6 max-h-[70vh]">
          <div className="prose prose-invert prose-sm max-w-none
            [&_h1]:text-xl [&_h1]:font-black [&_h1]:text-foreground [&_h1]:mb-4 [&_h1]:mt-0
            [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:border-b [&_h2]:border-border-subtle [&_h2]:pb-2
            [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-indigo-300 [&_h3]:mt-5 [&_h3]:mb-2
            [&_p]:text-foreground/80 [&_p]:leading-relaxed [&_p]:text-sm [&_p]:mb-3
            [&_ul]:space-y-1 [&_ul]:ml-4 [&_li]:text-foreground/80 [&_li]:text-sm
            [&_ol]:space-y-1 [&_ol]:ml-4
            [&_strong]:text-foreground [&_strong]:font-semibold
            [&_em]:text-text-subtle
            [&_blockquote]:border-l-2 [&_blockquote]:border-emerald-500 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-text-subtle
            [&_code]:bg-bg-hover [&_code]:px-1 [&_code]:rounded [&_code]:text-emerald-300 [&_code]:text-xs
            [&_hr]:border-border-subtle
            [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs
            [&_th]:px-3 [&_th]:py-2 [&_th]:bg-bg-hover [&_th]:border [&_th]:border-border-strong [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground
            [&_td]:px-3 [&_td]:py-2 [&_td]:border [&_td]:border-border-strong
          ">
            <ReactMarkdown>{report}</ReactMarkdown>
          </div>
        </div>

        {/* Footer: Follow-up actions */}
        <div className="border-t border-border-subtle px-6 py-3 bg-background flex items-center gap-3 shrink-0">
          <span className="text-[10px] text-text-muted">Lanjutkan riset:</span>
          {[
            'Apa implikasi hukumnya?',
            'Bandingkan dengan standar industri',
            'Buat ringkasan eksekutif singkat',
          ].map((q) => (
            <button
              key={q}
              onClick={() => { onAskFollowUp(q); onClose() }}
              className="text-[10px] px-2.5 py-1.5 rounded-lg bg-bg-hover hover:bg-[#2A2A3A] border border-border-strong text-text-subtle hover:text-foreground transition-all"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}


function ChatPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const chatId = searchParams.get('id')

  const { activeWorkspace, updateAiSettings } = useWorkspaceStore()
  const { conversations, fetchConversations, addConversation } = useChatStore()
  const user = useAuthStore(state => state.user)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(chatId)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(FALLBACK_MODELS[0])
  const [models, setModels] = useState<ModelInfo[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [modelSearch, setModelSearch] = useState('')

  useEffect(() => {
    if (chatId !== activeConversationId) {
      if (chatId) {
        selectThread(chatId)
      } else {
        setActiveConversationId(null)
        setMessages([])
      }
    }
  }, [chatId])

  useEffect(() => {
    if (!user?.id) return
    const storedFavs = localStorage.getItem(`documind_favorite_models_${user.id}`)
    if (storedFavs) {
      try {
        setFavorites(JSON.parse(storedFavs))
      } catch (e) {
        setFavorites([])
      }
    } else {
      // Migrate old un-scoped favorites if they exist
      const oldFavs = localStorage.getItem('documind_favorite_models')
      if (oldFavs) {
        try {
          setFavorites(JSON.parse(oldFavs))
          localStorage.setItem(`documind_favorite_models_${user.id}`, oldFavs)
        } catch (e) {
          setFavorites([])
        }
      }
    }
  }, [user?.id])

  const toggleFavorite = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    let updated: string[]
    if (favorites.includes(modelId)) {
      updated = favorites.filter(id => id !== modelId)
    } else {
      updated = [...favorites, modelId]
    }
    setFavorites(updated)
    if (user?.id) {
      localStorage.setItem(`documind_favorite_models_${user.id}`, JSON.stringify(updated))
    }
  }

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models');
      if (res.ok) {
        const json = await res.json();
        const fetchedModels: ModelInfo[] = json.data.map((m: any) => ({
          id: m.id,
          name: m.name || m.id,
          endpoint_id: 'openrouter',
          endpoint_name: 'OpenRouter',
          provider_label: 'OpenRouter'
        }));

        // Sort alphabetically
        fetchedModels.sort((a, b) => a.name.localeCompare(b.name));

        setModels(fetchedModels);
        const savedModelId = localStorage.getItem('documind_preferred_model');
        const defaultModel = (savedModelId && fetchedModels.find(m => m.id === savedModelId))
          || fetchedModels.find(m => m.id === 'deepseek/deepseek-v3.2-exp')
          || fetchedModels[0];
        setSelectedModel(defaultModel);
        return;
      }
    } catch (err) {
      console.error("Failed to fetch models from OpenRouter", err);
    }

    // Fallback if network request fails
    const fallbackModel = {
      id: 'deepseek/deepseek-v3.2-exp',
      name: 'DeepSeek V3.2 Exp',
      endpoint_id: 'openrouter',
      endpoint_name: 'OpenRouter',
      provider_label: 'OpenRouter'
    } as ModelInfo;
    setModels([fallbackModel]);

    const savedModelId = localStorage.getItem('documind_preferred_model');
    if (savedModelId && savedModelId !== fallbackModel.id) {
      setSelectedModel({
        id: savedModelId,
        name: savedModelId,
        endpoint_id: 'openrouter',
        endpoint_name: 'OpenRouter',
        provider_label: 'OpenRouter'
      });
    } else {
      setSelectedModel(fallbackModel);
    }
  }, []);

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false)

  // ── Agent Mode state
  const [agentMode, setAgentMode] = useState(false)
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([])
  const [agentRunning, setAgentRunning] = useState(false)
  const [agentStreamText, setAgentStreamText] = useState('')

  // ── Deep Research state
  const [researchModalOpen, setResearchModalOpen] = useState(false)
  const [researchQuery, setResearchQuery] = useState('')
  const [researchRunning, setResearchRunning] = useState(false)
  const [researchEvents, setResearchEvents] = useState<ResearchEvent[]>([])
  const [researchJobId, setResearchJobId] = useState<string | null>(null)
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [reportContent, setReportContent] = useState('')
  const [reportQuery, setReportQuery] = useState('')

  // Doc Viewer Modal states
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerDoc, setViewerDoc] = useState<{ id: string; name: string; page: number; snippet: string } | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const selectThread = async (conversationId: string) => {
    setActiveConversationId(conversationId)
    setMessages([])
    try {
      const headers: HeadersInit = {}
      const token = localStorage.getItem('auth_token')
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`/api/conversations/${conversationId}/messages`, { headers })
      if (res.ok) {
        const data = await res.json()
        const mappedMessages: ChatMessage[] = data.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at),
          citations: m.citations,
          confidence: m.confidence,
          model: m.model,
          queriesUsed: m.metadata_json?.queriesUsed,
          source_mode: m.metadata_json?.source_mode,
          retrieval_score: m.metadata_json?.retrieval_score,
        }))
        setMessages(mappedMessages)
      }
    } catch (err) {
      console.error('Failed to load messages', err)
    }
  }

  // Removed handleNewChat and deleteConversation as they are in SideBar now

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    // Route ke agent mode jika aktif
    if (agentMode) {
      await sendAgentMessage()
      return
    }

    const currentInput = input.trim()
    const currentConvId = activeConversationId

    // Optimistic UI for new conversation
    if (!currentConvId) {
      const tempId = `temp_${Date.now()}`
      const newConv = {
        id: tempId,
        title: currentInput.length > 30 ? currentInput.substring(0, 30) + '...' : currentInput,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        workspace_id: activeWorkspace?.id || ''
      }
      addConversation(newConv)
      setActiveConversationId(tempId)
      // replace state URL to attach ?id=tempId smoothly
      window.history.replaceState(null, '', `/dashboard/chat?id=${tempId}`)
    }

    const userMsg: ChatMessage = {
      id: `msg_${Date.now().toString() + Math.random().toString(36).substring(2, 9)}_u`,
      role: 'user',
      content: currentInput,
      timestamp: new Date(),
    }
    setMessages(p => [...p, userMsg])
    setInput('')
    setLoading(true)
    setStreamingText('')

    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      const token = localStorage.getItem('auth_token')
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const res = await fetch('/api/query', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          workspace_id: activeWorkspace?.id || '',
          message: currentInput,
          conversation_id: currentConvId,
          conversation_history: messages.map(m => ({ role: m.role, content: m.content })),
          endpoint_id: selectedModel?.endpoint_id || null,
          model: selectedModel?.id || null,
        })
      })

      if (!res.ok) throw new Error('Failed to generate response')
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let done = false
      let accumulatedText = ''
      let citations: Citation[] = []
      let confidence = 0.9
      let modelUsed = selectedModel?.id || 'default'
      let queriesUsed = 1
      let sourceMode: 'DOCUMENT' | 'GENERAL' | 'HYBRID' | undefined = undefined
      let retrievalScore: number | undefined = undefined

      while (!done) {
        const { value, done: doneReading } = await reader.read()
        done = doneReading
        if (value) {
          const chunk = decoder.decode(value, { stream: !done })
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim()
              if (dataStr === '[DONE]') break
              try {
                const parsed = JSON.parse(dataStr)
                if (parsed.text) {
                  accumulatedText += parsed.text
                  setStreamingText(accumulatedText)
                } else if (parsed.meta) {
                  if (parsed.meta.citations) citations = parsed.meta.citations
                  if (parsed.meta.confidence) confidence = parsed.meta.confidence
                  if (parsed.meta.model) modelUsed = parsed.meta.model
                  if (parsed.meta.queriesUsed) queriesUsed = parsed.meta.queriesUsed
                  if (parsed.meta.source_mode) sourceMode = parsed.meta.source_mode
                  if (parsed.meta.retrieval_score !== undefined) retrievalScore = parsed.meta.retrieval_score
                  if (parsed.meta.conversation_id) {
                    if (!currentConvId) {
                      setActiveConversationId(parsed.meta.conversation_id)
                    }
                  }
                }
              } catch (e) { /* ignore */ }
            }
          }
        }
      }

      const aiMsg: ChatMessage = {
        id: `msg_${Date.now()}_a`,
        role: 'assistant',
        content: accumulatedText || 'Maaf, terjadi kesalahan saat menghasilkan respons.',
        timestamp: new Date(),
        citations: citations.length > 0 ? citations : undefined,
        confidence,
        model: modelUsed,
        queriesUsed,
        source_mode: sourceMode,
        retrieval_score: retrievalScore,
      }
      setMessages(p => [...p, aiMsg])
    } catch (error) {
      console.error('SSE Error:', error)
      const fallbackMsg: ChatMessage = {
        id: `msg_${Date.now()}_err`,
        role: 'assistant',
        content: 'Terjadi kesalahan. Pastikan backend berjalan dan konfigurasi workspace sudah benar.',
        timestamp: new Date(),
        model: selectedModel?.id || 'default',
      }
      setMessages(p => [...p, fallbackMsg])
    } finally {
      setStreamingText('')
      setLoading(false)
      if (activeWorkspace) fetchConversations(activeWorkspace.id)
    }
  }

  // ── Agent Mode Send ────────────────────────────────────────────────────────────
  const sendAgentMessage = async () => {
    if (!input.trim() || loading) return
    const currentInput = input.trim()

    const currentConvId = activeConversationId

    // Optimistic UI for new conversation
    if (!currentConvId) {
      const tempId = `temp_${Date.now()}`
      const newConv = {
        id: tempId,
        title: currentInput.length > 30 ? currentInput.substring(0, 30) + '...' : currentInput,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        workspace_id: activeWorkspace?.id || ''
      }
      addConversation(newConv)
      setActiveConversationId(tempId)
      window.history.replaceState(null, '', `/dashboard/chat?id=${tempId}`)
    }

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content: currentInput,
      timestamp: new Date(),
    }
    setMessages(p => [...p, userMsg])
    setInput('')
    setLoading(true)
    setAgentRunning(true)
    setAgentSteps([])
    setAgentStreamText('')

    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      const token = localStorage.getItem('auth_token')
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          workspace_id: activeWorkspace?.id || '',
          message: currentInput,
          conversation_id: currentConvId,
          conversation_history: messages.map(m => ({ role: m.role, content: m.content })),
          max_iterations: 8,
          endpoint_id: selectedModel?.endpoint_id || null,
          model: selectedModel?.id || null,
        }),
      })

      if (!res.ok) throw new Error('Agent request failed')
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let done = false
      let accumulatedAnswer = ''
      let totalSteps = 0
      let traceId = ''

      while (!done) {
        const { value, done: doneReading } = await reader.read()
        done = doneReading
        if (value) {
          const chunk = decoder.decode(value, { stream: !done })
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const dataStr = line.slice(6).trim()
            if (dataStr === '[DONE]') break

            try {
              const evt = JSON.parse(dataStr)
              const event = evt.event

              if (event === 'thinking') {
                setAgentSteps(prev => [
                  ...prev.filter(s => s.type !== 'thinking'),
                  { id: `thinking_${evt.step}`, type: 'thinking', step: evt.step },
                ])
              } else if (event === 'tool_call') {
                setAgentSteps(prev => [
                  ...prev.filter(s => s.type !== 'thinking'),
                  {
                    id: `tc_${evt.step}_${evt.tool}`,
                    type: 'tool_call',
                    step: evt.step,
                    tool: evt.tool,
                    args: evt.args,
                  },
                ])
              } else if (event === 'tool_result') {
                setAgentSteps(prev => [
                  ...prev,
                  {
                    id: `tr_${evt.step}_${evt.tool}`,
                    type: 'tool_result',
                    step: evt.step,
                    tool: evt.tool,
                    result: evt.result,
                    latency_ms: evt.latency_ms,
                  },
                ])
                setAgentSteps([])
                if (evt.conversation_id && !currentConvId) {
                  setActiveConversationId(evt.conversation_id)
                }
              } else if (event === 'answer') {
                accumulatedAnswer += evt.text || ''
                setAgentStreamText(accumulatedAnswer)
              } else if (event === 'done') {
                totalSteps = evt.total_steps || 0
                traceId = evt.trace_id || ''
              } else if (event === 'error') {
                accumulatedAnswer = `Error: ${evt.message}`
                setAgentStreamText(accumulatedAnswer)
              }
            } catch (e) { /* ignore */ }
          }
        }
      }

      // Setelah stream selesai, tambahkan ke messages
      const agentMsg: ChatMessage = {
        id: `msg_${Date.now()}_agent`,
        role: 'assistant',
        content: accumulatedAnswer || 'Agent menyelesaikan pencarian tapi tidak menghasilkan jawaban.',
        timestamp: new Date(),
        model: `${selectedModel?.name || 'Model'} (Agent • ${totalSteps} steps)`,
      }
      setMessages(p => [...p, agentMsg])

    } catch (error) {
      console.error('Agent error:', error)
      setMessages(p => [...p, {
        id: `msg_${Date.now()}_err`,
        role: 'assistant',
        content: 'Agent mengalami error. Pastikan backend berjalan.',
        timestamp: new Date(),
        model: selectedModel?.id || 'default',
      }])
    } finally {
      setAgentRunning(false)
      setLoading(false)
      // Bersihkan agent steps setelah selesai (bisa toggle collapse)
      setTimeout(() => {
        setAgentStreamText('')
      }, 200)
      if (activeWorkspace) fetchConversations(activeWorkspace.id)
    }
  }

  // ── Deep Research Launch ───────────────────────────────────────────────────────────
  const startDeepResearch = async (query: string) => {
    if (!query.trim() || researchRunning) return
    setResearchRunning(true)
    setResearchEvents([])
    setResearchJobId(null)
    setReportContent('')
    setResearchQuery(query)

    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      const token = localStorage.getItem('auth_token')
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const res = await fetch('/api/research/start', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          workspace_id: activeWorkspace?.id || '',
          query: query.trim(),
          endpoint_id: selectedModel?.endpoint_id || null,
          model: selectedModel?.id || null,
        }),
      })

      if (!res.ok) throw new Error('Research request failed')
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let done = false

      while (!done) {
        const { value, done: doneReading } = await reader.read()
        done = doneReading
        if (value) {
          const chunk = decoder.decode(value, { stream: !done })
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const dataStr = line.slice(6).trim()
            if (dataStr === '[DONE]') break

            try {
              const evt: ResearchEvent = JSON.parse(dataStr)
              setResearchEvents(prev => [...prev, evt])

              if (evt.event === 'done') {
                setResearchJobId(evt.job_id || null)
              }
            } catch (e) { /* ignore */ }
          }
        }
      }
    } catch (error) {
      console.error('Research error:', error)
      setResearchEvents(prev => [...prev, {
        event: 'error',
        message: 'Koneksi ke backend gagal. Pastikan backend berjalan.',
      }])
    } finally {
      setResearchRunning(false)
    }
  }

  const openReport = async () => {
    if (!researchJobId) return
    // Ambil report dari API jika ada job ID
    try {
      const res = await fetch(`/api/research/${activeWorkspace?.id || ''}/jobs/${researchJobId}`)
      if (res.ok) {
        const data = await res.json()
        setReportContent(data.result_markdown || '')
        setReportQuery(data.query || researchQuery)
      }
    } catch (e) {
      // Fallback: gunakan data dari events
      setReportContent('Gagal mengambil laporan dari server.')
    }
    setReportModalOpen(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex h-full animate-fade-in relative">
      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Messages */}

        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col scrollbar-none">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 py-12">
              {/* <img src="/logo_dark.svg" alt="" className='w-12 h-12' /> */}

              <div>
                <h2 className="text-xl font-black mb-2">Ask anything about your documents</h2>
                <p className="text-sm text-text-subtle max-w-sm">I'll search across all documents in your workspace and return cited answers.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                {SUGGESTED_QUERIES.map((q, i) => (
                  <button
                    key={i}
                    id={`suggested-query-${i}`}
                    onClick={() => setInput(q)}
                    className="p-3 rounded-xl border border-border-strong hover:border-indigo-500/30 hover:bg-indigo-600/5 text-left text-xs text-text-subtle hover:text-foreground transition-all duration-200"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {messages.map(m => (
                <ChatBubble
                  key={m.id}
                  message={m}
                  onOpenDoc={(citation) => {
                    setViewerDoc({ id: citation.docId, name: citation.docName, page: citation.page, snippet: citation.snippet })
                    setViewerOpen(true)
                  }}
                />
              ))}
              {/* Research Panel — tampil saat deep research aktif/selesai */}
              {(researchRunning || researchEvents.length > 0) && (
                <DeepResearchPanel
                  events={researchEvents}
                  isRunning={researchRunning}
                  onViewReport={openReport}
                  finalJobId={researchJobId}
                />
              )}
              {/* Agent Steps Panel — tampil saat agent mode aktif */}
              {agentMode && (agentRunning || agentSteps.length > 0) && (
                <AgentStepsPanel
                  steps={agentSteps}
                  isRunning={agentRunning}
                  streamingText={agentStreamText}
                />
              )}
              {/* Regular streaming indicator */}
              {loading && !agentMode && (
                <div className="flex gap-3 mb-6">
                  <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Brain className="w-4 h-4 text-foreground" />
                  </div>
                  <div className="flex-1 max-w-2xl">
                    <div className="bg-bg-input border border-border-strong rounded-2xl rounded-tl-sm px-4 py-3">
                      {streamingText ? (
                        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                          {streamingText}
                          <span className="inline-block w-1.5 h-4 bg-indigo-500 ml-1.5 align-middle animate-caret">|</span>
                        </p>
                      ) : (
                        <div className="flex items-center gap-2 text-text-muted">
                          <div className="flex gap-1">
                            {[0, 1, 2].map(i => (
                              <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                            ))}
                          </div>
                          <span className="text-xs">Searching documents…</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="p-3 sm:p-4 border-t border-border-subtle shrink-0 bg-background flex flex-col gap-2 sm:gap-3">


          <div className="flex flex-col gap-2 rounded-2xl border border-border-strong bg-bg-input backdrop-blur-md focus-within:border-indigo-500/50 focus-within:shadow-lg focus-within:shadow-indigo-500/5 transition-all duration-200 p-2.5 sm:p-3">
            <textarea
              ref={inputRef}
              id="chat-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your documents…"
              rows={2}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-text-muted outline-none resize-none leading-relaxed min-h-[44px] max-h-[160px]"
            />
            <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
              {/* Model picker + Agent Mode toggle + Research button */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Deep Research button */}
                <button
                  id="deep-research-btn"
                  onClick={() => setResearchModalOpen(true)}
                  title="Deep Research — riset mendalam lintas dokumen"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-border-strong bg-bg-panel hover:border-emerald-500/30 hover:bg-emerald-500/5 text-xs font-medium text-text-subtle hover:text-emerald-400 transition-all cursor-pointer"
                >
                  <FlaskConical className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden md:inline">Research</span>
                  {researchRunning && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
                </button>

                {/* Agent Mode toggle */}
                <button
                  id="agent-mode-toggle"
                  onClick={() => setAgentMode(a => !a)}
                  title={agentMode ? 'Mode Agent aktif — klik untuk nonaktifkan' : 'Aktifkan Agent Mode'}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${agentMode
                    ? 'bg-violet-600/20 border-violet-500/40 text-violet-300 shadow-sm shadow-violet-500/10'
                    : 'border-border-strong bg-bg-panel hover:border-violet-500/30 text-text-subtle hover:text-violet-400'
                    }`}
                >
                  <Bot className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden md:inline">Agent</span>
                  {agentMode && <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shrink-0" />}
                </button>

                {/* Model picker */}
                <div className="relative">
                  <button
                    id="model-selector"
                    onClick={() => setModelMenuOpen(!modelMenuOpen)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-border-strong bg-bg-panel hover:border-border-strong text-xs font-medium transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate max-w-[70px] sm:max-w-[120px] md:max-w-[150px]">
                      {selectedModel ? selectedModel.name : 'Select Model'}
                    </span>
                    <ChevronDown className="w-3 h-3 text-text-muted shrink-0" />
                  </button>
                  {modelMenuOpen && (
                    <div className="absolute left-0 bottom-full mb-1 w-64 rounded-xl border border-border-strong bg-bg-input shadow-xl z-20 overflow-hidden max-h-96 flex flex-col">
                      <div className="p-2 border-b border-border-strong">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                          <input
                            type="text"
                            placeholder="Search models..."
                            value={modelSearch}
                            onChange={(e) => setModelSearch(e.target.value)}
                            className="w-full bg-bg-surface border border-border-strong rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-text-muted focus:outline-none focus:border-indigo-500/50"
                            autoFocus
                          />
                        </div>
                      </div>
                      
                      <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-border-strong">
                        {/* Favorites section */}
                        {favorites.length > 0 && !modelSearch && (
                          <>
                            <div className="px-3 py-1.5 text-[9px] font-bold text-amber-400 bg-bg-hover flex items-center gap-1">
                              <Star className="w-3 h-3 fill-amber-400" />
                              FAVORITE MODELS
                            </div>
                            {(models.length > 0 ? models : FALLBACK_MODELS)
                              .filter(m => favorites.includes(m.id))
                              .map(m => (
                                <div
                                  key={`fav-${m.id}`}
                                  onClick={() => {
                                    setSelectedModel(m)
                                    localStorage.setItem('documind_preferred_model', m.id)
                                    if (activeWorkspace) {
                                      updateAiSettings(activeWorkspace.id, {
                                        default_chat_endpoint_id: m.endpoint_id,
                                        default_chat_model: m.id,
                                      }).catch(console.error)
                                    }
                                    setModelMenuOpen(false)
                                  }}
                                  className={`w-full flex items-center justify-between px-3 py-2 hover:bg-bg-hover cursor-pointer transition-colors text-left ${selectedModel?.id === m.id ? 'bg-bg-hover' : ''}`}
                                >
                                  <div className="flex flex-col min-w-0 pr-2">
                                    <span className="text-xs font-semibold truncate text-foreground">{m.name}</span>
                                    <span className="text-[8px] text-text-muted uppercase font-bold tracking-wider">{m.provider_label}</span>
                                  </div>
                                  <button
                                    onClick={(e) => toggleFavorite(m.id, e)}
                                    className="p-1 text-amber-400 hover:text-text-muted transition-colors shrink-0"
                                  >
                                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                                  </button>
                                </div>
                              ))}
                            <div className="border-t border-border-strong" />
                          </>
                        )}

                        <div className="px-3 py-1.5 text-[9px] font-bold text-text-subtle bg-bg-hover">
                          {modelSearch ? 'SEARCH RESULTS' : 'ALL AVAILABLE MODELS'}
                        </div>
                        {(models.length > 0 ? models : FALLBACK_MODELS)
                          .filter(m => 
                            !modelSearch || 
                            m.name.toLowerCase().includes(modelSearch.toLowerCase()) || 
                            m.provider_label.toLowerCase().includes(modelSearch.toLowerCase())
                          )
                          .map(m => (
                            <div
                              key={m.id}
                              onClick={() => {
                                setSelectedModel(m)
                                localStorage.setItem('documind_preferred_model', m.id)
                                if (activeWorkspace) {
                                  updateAiSettings(activeWorkspace.id, {
                                    default_chat_endpoint_id: m.endpoint_id,
                                    default_chat_model: m.id,
                                  }).catch(console.error)
                                }
                                setModelMenuOpen(false)
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2 hover:bg-bg-hover cursor-pointer transition-colors text-left ${selectedModel?.id === m.id ? 'bg-bg-hover' : ''}`}
                            >
                              <div className="flex flex-col min-w-0 pr-2">
                                <span className="text-xs font-semibold truncate text-foreground">{m.name}</span>
                                <span className="text-[8px] text-text-muted uppercase font-bold tracking-wider">{m.provider_label}</span>
                              </div>
                              <button
                                onClick={(e) => toggleFavorite(m.id, e)}
                                className="p-1 text-text-muted hover:text-amber-400 transition-colors shrink-0"
                              >
                                <Star className={`w-3.5 h-3.5 ${favorites.includes(m.id) ? 'fill-amber-400 text-amber-400' : ''}`} />
                              </button>
                            </div>
                          ))}
                          
                        {(models.length > 0 ? models : FALLBACK_MODELS).filter(m => 
                            !modelSearch || 
                            m.name.toLowerCase().includes(modelSearch.toLowerCase()) || 
                            m.provider_label.toLowerCase().includes(modelSearch.toLowerCase())
                          ).length === 0 && (
                            <div className="px-3 py-4 text-center text-xs text-text-muted">
                              No models found matching "{modelSearch}"
                            </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-text-muted hidden md:inline">⏎ Send · ⇧⏎ New line</span>
                <button
                  id="send-message-btn"
                  onClick={sendMessage}
                  disabled={!input.trim() || loading}
                  className="flex items-center justify-center w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/20 active:scale-95 shrink-0"
                >
                  <Send className="w-3.5 h-3.5 text-foreground" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile history drawer */}
      {historyDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setHistoryDrawerOpen(false)} />
          <div className="relative z-10 w-64 h-full bg-background border-r border-border-subtle flex flex-col animate-fade-in">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <h2 className="text-sm font-bold">Query History</h2>
              <button className="p-1 text-text-muted hover:text-foreground" onClick={() => setHistoryDrawerOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 border-b border-border-subtle">
              <button
                onClick={() => {
                  router.push('/dashboard/chat');
                  setActiveConversationId(null);
                  setMessages([]);
                  setHistoryDrawerOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-border-strong hover:border-indigo-500/40 hover:bg-indigo-600/5 text-xs font-medium text-text-subtle hover:text-foreground transition-all"
              >
                <MessageSquare className="w-3.5 h-3.5" /> New conversation
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => {
                    selectThread(conv.id);
                    setHistoryDrawerOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors group ${activeConversationId === conv.id ? 'bg-indigo-600/15 text-indigo-300' : 'hover:bg-bg-hover text-text-subtle hover:text-foreground'
                    }`}
                >
                  <div className="text-xs line-clamp-2 transition-colors leading-relaxed">{conv.title}</div>
                  <div className="text-[10px] text-text-muted mt-1">{formatRelativeTime(conv.updated_at)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Research Launch Modal */}
      {researchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md" onClick={() => setResearchModalOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border-strong bg-bg-panel shadow-2xl animate-fade-in overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border-subtle bg-bg-input">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center">
                <FlaskConical className="w-4.5 h-4.5 text-emerald-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">Deep Research</div>
                <div className="text-[10px] text-text-muted">Investigasi mendalam lintas seluruh dokumen workspace</div>
              </div>
              <button onClick={() => setResearchModalOpen(false)} className="ml-auto p-1.5 rounded-lg text-text-muted hover:text-foreground hover:bg-bg-hover transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5">
              <label className="block text-xs font-semibold text-text-subtle mb-2 uppercase tracking-wide">
                Topik atau Pertanyaan Riset
              </label>
              <textarea
                autoFocus
                value={researchQuery}
                onChange={e => setResearchQuery(e.target.value)}
                placeholder="Contoh: Analisis lengkap klausul terminasi dan penalti dalam semua kontrak yang ada..."
                rows={3}
                className="w-full bg-background border border-border-strong focus:border-emerald-500/50 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-text-muted outline-none resize-none leading-relaxed transition-all"
              />

              {/* How it works */}
              <div className="mt-4 bg-background border border-border-subtle rounded-xl p-3">
                <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">Pipeline Otomatis</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { step: '1', label: 'Plan', desc: 'Generate 4 sub-questions', color: 'emerald' },
                    { step: '2', label: 'Search', desc: 'Semantic search per Q', color: 'teal' },
                    { step: '3', label: 'Synthesize', desc: 'Rangkum per pertanyaan', color: 'cyan' },
                    { step: '4', label: 'Report', desc: 'Laporan Markdown final', color: 'emerald' },
                  ].map(s => (
                    <div key={s.step} className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                        <span className="text-[8px] font-black text-emerald-400">{s.step}</span>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-foreground">{s.label}</div>
                        <div className="text-[9px] text-text-muted">{s.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick suggestions */}
              <div className="mt-3">
                <div className="text-[10px] text-text-muted mb-2">Contoh topik:</div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Analisis semua klausul terminasi dan penalti',
                    'Ringkasan obligasi keuangan dan pembayaran',
                    'Perbandingan syarat NDA antar dokumen',
                  ].map(s => (
                    <button
                      key={s}
                      onClick={() => setResearchQuery(s)}
                      className="text-[10px] px-2.5 py-1 rounded-lg bg-bg-hover hover:bg-emerald-500/10 hover:border-emerald-500/20 border border-border-strong text-text-subtle hover:text-emerald-400 transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={() => setResearchModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-border-strong text-sm text-text-subtle hover:text-foreground hover:bg-bg-hover transition-all"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  if (!researchQuery.trim()) return
                  setResearchModalOpen(false)
                  startDeepResearch(researchQuery)
                }}
                disabled={!researchQuery.trim() || researchRunning}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-foreground transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                Mulai Riset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Research Report Modal */}
      {reportModalOpen && reportContent && (
        <ResearchReportModal
          report={reportContent}
          query={reportQuery}
          onClose={() => setReportModalOpen(false)}
          onAskFollowUp={q => {
            setInput(q)
            setReportModalOpen(false)
          }}
        />
      )}

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
              <button
                onClick={() => {
                  setInput(`Tell me more about the section on page ${viewerDoc.page} regarding "${viewerDoc.snippet.slice(0, 35)}..."`)
                  setViewerOpen(false)
                }}
                className="ml-auto flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors active:scale-95 text-[9px] sm:text-[10px]"
              >
                <Brain className="w-3 h-3" />
                <span className="hidden sm:inline">Ask AI about this page</span>
                <span className="sm:hidden">Tanya AI</span>
              </button>
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

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted">Loading chat...</div>}>
      <ChatPageInner />
    </Suspense>
  )
}
