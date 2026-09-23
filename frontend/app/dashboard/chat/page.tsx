'use client'

import { useState, useRef, useEffect, useCallback, Suspense, Fragment, isValidElement, cloneElement, ReactNode } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { mockDocuments } from '@/lib/mock-data'
import { ChatMessage, Citation } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import ReactMarkdown, { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { BorderBeam } from '@/components/ui/BorderBeam'

const PROMPT_SUGGESTIONS = [
  {
    title: 'Ringkasan Eksekutif',
    desc: 'Rangkum poin-poin utama, tujuan, dan kesimpulan dari dokumen.',
    query: 'Buatkan ringkasan eksekutif dan poin-poin penting dari dokumen yang ada.',
  },
  {
    title: 'Temukan Fakta & Data Kunci',
    desc: 'Cari tanggal krusial, nilai finansial, dan pihak yang terlibat.',
    query: 'Ekstrak semua tanggal penting, angka finansial, dan pihak yang disebutkan dalam dokumen.',
  },
  {
    title: 'Analisis & Perbandingan',
    desc: 'Bandingkan pasal, kewajiban, atau perubahan antar bagian dokumen.',
    query: 'Bandingkan kewajiban, hak, dan perbedaan ketentuan utama dalam dokumen ini.',
  },
  {
    title: 'Identifikasi Risiko & Rekomendasi',
    desc: 'Deteksi potensi klausul berisiko dan rekomendasi mitigasi.',
    query: 'Identifikasi potensi risiko atau klausul kritis dalam dokumen ini dan berikan rekomendasi strategi.',
  },
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

function AgentStepsPanel({ steps, isRunning, streamingText }: {
  steps: AgentStep[]
  isRunning: boolean
  streamingText: string
}) {
  const [collapsed, setCollapsed] = useState(false)

  // Group tool_call + tool_result pairs
  const toolPairs: { call: AgentStep; result?: AgentStep }[] = []

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
    <div className="flex flex-col mb-4 animate-fade-in max-w-2xl">
      {/* Steps header */}
      <div
        className="flex items-center gap-2 mb-2 cursor-pointer group"
        onClick={() => setCollapsed(c => !c)}
      >
        <span className="text-xs font-semibold text-text-subtle group-hover:text-foreground transition-colors">
          {isRunning && !streamingText
            ? `Agent sedang bekerja... (${steps.filter(s => s.type === 'tool_call').length} langkah)`
            : `Agent selesai (${toolPairs.length} langkah)`
          }
        </span>
        {toolPairs.length > 0 && (
          <span className="ml-auto text-xs text-text-muted hover:text-foreground">
            {collapsed ? 'Lihat rincian ▾' : 'Sembunyikan ▴'}
          </span>
        )}
      </div>

      {/* Tool call steps */}
      {!collapsed && toolPairs.length > 0 && (
        <div className="bg-bg-panel border border-border-strong rounded-xl overflow-hidden mb-2">
          {toolPairs.map((pair, i) => (
            <div key={i} className={`px-3 py-2 text-xs ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-muted font-mono">[{i + 1}]</span>
                <span className="font-medium text-foreground">
                  {TOOL_LABELS[pair.call.tool || ''] || pair.call.tool}
                </span>
                {pair.call.args && Object.keys(pair.call.args).length > 0 && (
                  <span className="text-[11px] text-text-muted truncate max-w-[200px]">
                    {Object.entries(pair.call.args)
                      .map(([k, v]) => `${k}: "${String(v).slice(0, 30)}"`)
                      .join(', ')}
                  </span>
                )}
                <span className="ml-auto text-[10px] text-text-muted">
                  {pair.result ? (pair.result.latency_ms ? `${pair.result.latency_ms}ms` : 'Selesai') : 'Memproses...'}
                </span>
              </div>
              {pair.result?.result && (
                <div className="mt-1 text-[11px] text-text-muted">
                  {(() => {
                    const r = pair.result.result
                    if (r.hits_found !== undefined) return `${r.hits_found} kutipan ditemukan`
                    if (r.total_documents !== undefined) return `${r.total_documents} dokumen di workspace`
                    if (r.filename) return r.filename
                    if (r.content) return `${String(r.content).slice(0, 70)}...`
                    if (r.error) return r.error
                    return null
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Loading state before answer */}
      {isRunning && !streamingText && (
        <div className="text-text-muted text-xs mt-1">
          Menganalisis dokumen...
        </div>
      )}

      {/* Streaming answer */}
      {streamingText && (
        <div className="bg-bg-panel border border-border-strong rounded-xl p-4 mt-2">
          <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
            {streamingText}
            <span className="inline-block w-1.5 h-4 bg-foreground ml-1 align-middle animate-caret">|</span>
          </div>
        </div>
      )}
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
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-border-strong hover:bg-bg-hover text-xs text-text-subtle hover:text-foreground transition-colors cursor-pointer"
      >
        <span className="max-w-[120px] truncate text-[11px] font-medium">{citation.docName.replace(/\.[^.]+$/, '')}</span>
        <span className="text-[10px] text-text-muted">p.{citation.page}</span>
        <sup className="text-[9px] font-bold text-indigo-400">[{num}]</sup>
      </button>
      {expanded && (
        <div className="absolute bottom-full left-0 mb-2 w-80 rounded-xl border border-border-strong bg-bg-panel shadow-2xl p-4 z-20">
          {/* Header */}
          <div className="flex items-start gap-2 mb-3">
            <div className="w-6 h-6 rounded border border-border-strong flex items-center justify-center shrink-0 text-xs font-bold text-foreground">
              {num}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{citation.docName}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-text-muted">Halaman {citation.page}</span>
                {relevancePct !== null && (
                  <span className="text-[10px] text-text-muted">
                    {relevancePct}% match
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Snippet / Full Text */}
          <div className="bg-bg-input rounded-md p-3 mb-3 border border-border-subtle">
            <p className="text-[11px] text-text-subtle italic leading-relaxed line-clamp-5">
              &ldquo;{citation.fullText || citation.snippet}&rdquo;
            </p>
          </div>
          {/* Actions */}
          <button
            onClick={(e) => { e.stopPropagation(); onOpenDoc(); setExpanded(false); }}
            className="w-full py-1.5 rounded-md border border-border-strong hover:bg-bg-hover text-xs font-medium text-foreground transition-colors cursor-pointer"
          >
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

function processCitationsInNode(
  node: ReactNode,
  citations: Citation[],
  onCitationClick: (citation: Citation) => void
): ReactNode {
  if (typeof node === 'string') {
    return renderContentWithCitations(node, citations, onCitationClick)
  }
  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <Fragment key={i}>
        {processCitationsInNode(child, citations, onCitationClick)}
      </Fragment>
    ))
  }
  if (isValidElement(node)) {
    if (node.type === 'code' || node.type === 'pre' || node.type === 'button') {
      return node
    }
    const children = (node.props as any)?.children
    if (children) {
      return cloneElement(node, {
        ...(node.props as any),
        children: processCitationsInNode(children, citations, onCitationClick)
      } as any)
    }
  }
  return node
}


// ─── Standalone CodeBlock Component ──────────────────────────────────────────
function CodeBlock({ language, codeString, props }: { language: string; codeString: string; props: any }) {
  const [isCopied, setIsCopied] = useState(false)
  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeString)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  return (
    <div className="relative group/code my-4 rounded-xl overflow-hidden border border-border-strong bg-[#121316]">
      <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-border-subtle text-[11px] font-mono text-text-muted">
        <span className="uppercase font-medium text-text-subtle">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopyCode}
          className="text-[11px] text-text-subtle hover:text-foreground transition-colors px-2 py-0.5 rounded hover:bg-white/10 cursor-pointer"
        >
          {isCopied ? 'Tersalin' : 'Salin'}
        </button>
      </div>
      <div className="text-[13px] overflow-x-auto leading-relaxed">
        <SyntaxHighlighter
          {...props}
          style={vscDarkPlus}
          language={language || 'text'}
          PreTag="div"
          customStyle={{ margin: 0, padding: '1rem', background: 'transparent' }}
        >
          {codeString}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}

interface ChatBubbleProps {
  message: ChatMessage
  onOpenDoc: (citation: Citation) => void
  onEditSubmit?: (messageId: string, newContent: string) => void
  onRegenerate?: (messageId: string) => void
}

// ─── Chat Bubble Component ────────────────────────────────────────────────────
function ChatBubble({ message, onOpenDoc, onEditSubmit, onRegenerate }: ChatBubbleProps) {
  const isUser = message.role === 'user'
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)
  const [copied, setCopied] = useState(false)
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null)
  const citationPanelRef = useRef<HTMLDivElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)

  useEffect(() => {
    setEditContent(message.content)
  }, [message.content])

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
    if (isEditing) {
      return (
        <div className="flex justify-end mb-6 animate-fade-in w-full">
          <div className="w-full max-w-xl bg-bg-input border border-indigo-500/40 rounded-2xl p-4 shadow-lg shadow-black/20">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full bg-transparent border-0 focus:ring-0 text-sm text-foreground leading-relaxed resize-none h-24 focus:outline-none"
              placeholder="Edit pesan Anda..."
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => {
                  setIsEditing(false)
                  setEditContent(message.content)
                }}
                className="px-3 py-1.5 rounded-lg border border-border-strong text-xs font-semibold text-text-subtle hover:text-foreground hover:bg-bg-hover transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  if (editContent.trim() && editContent.trim() !== message.content) {
                    onEditSubmit?.(message.id, editContent.trim())
                  }
                  setIsEditing(false)
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer shadow-sm"
              >
                Simpan & Kirim
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-end mb-6 animate-fade-in group w-full">
        <div className="max-w-xl bg-bg-panel border border-border-strong rounded-2xl px-4.5 py-3 shadow-xs">
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
        <div className="flex items-center gap-2 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[10px] text-text-muted">{formatRelativeTime(message.timestamp)}</span>
          <button
            onClick={copy}
            className="text-[10px] text-text-muted hover:text-foreground transition-colors cursor-pointer px-1 py-0.5 rounded hover:bg-white/5"
          >
            {copied ? 'Disalin' : 'Salin'}
          </button>
          {onEditSubmit && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-[10px] text-text-muted hover:text-foreground transition-colors cursor-pointer px-1 py-0.5 rounded hover:bg-white/5"
            >
              Edit
            </button>
          )}
        </div>
      </div>
    )
  }

  const citations = message.citations ?? []
  const hasInlineCitations = citations.length > 0 && /\[\d+(?:,\s*\d+)*\]/.test(message.content)

  const renderers: Components = {
    p: ({ children }) => (
      <p className="mb-3.5 last:mb-0 leading-relaxed">
        {processCitationsInNode(children, citations, handleCitationClick)}
      </p>
    ),
    li: ({ children }) => (
      <li className="mb-1.5 leading-relaxed">
        {processCitationsInNode(children, citations, handleCitationClick)}
      </li>
    ),
    td: ({ children }) => (
      <td className="px-4 py-3 border-b border-border-subtle/50">
        {processCitationsInNode(children, citations, handleCitationClick)}
      </td>
    ),
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '')
      const language = match ? match[1] : ''
      const codeString = String(children).replace(/\n$/, '')
      
      if (!inline && match) {
        return <CodeBlock language={language} codeString={codeString} props={props} />
      }
      return (
        <code {...props} className={`${className || ''} bg-white/5 text-foreground px-1.5 py-0.5 rounded border border-border-subtle font-mono text-[12px]`}>
          {children}
        </code>
      )
    }
  }

  return (
    <div className="flex flex-col mb-8 animate-fade-in group w-full">
      {/* Header author line */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-foreground tracking-wide">Orlith</span>
        {message.model && (
          <span className="text-[10px] text-text-muted font-mono">{message.model}</span>
        )}
      </div>

      <div className="w-full min-w-0">
        <div className="text-sm text-foreground/90 leading-relaxed mb-3">
          {hasInlineCitations ? (
            <div className="prose prose-invert prose-sm max-w-none
              [&_strong]:text-foreground [&_strong]:font-semibold
              [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px] [&_table]:my-4 [&_table]:rounded-lg [&_table]:overflow-hidden [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto
              [&_th]:px-4 [&_th]:py-2.5 [&_th]:bg-bg-hover/80 [&_th]:border-b [&_th]:border-border-strong [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground
              [&_td]:px-4 [&_td]:py-2.5 [&_td]:border-b [&_td]:border-border-subtle/50
              [&_tr:last-child_td]:border-0
              [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-text-subtle
            ">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={renderers}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none text-foreground/90 leading-relaxed
              [&_strong]:text-foreground [&_strong]:font-semibold
              [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px] [&_table]:my-4 [&_table]:rounded-lg [&_table]:overflow-hidden [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto
              [&_th]:px-4 [&_th]:py-2.5 [&_th]:bg-bg-hover/80 [&_th]:border-b [&_th]:border-border-strong [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground
              [&_td]:px-4 [&_td]:py-2.5 [&_td]:border-b [&_td]:border-border-subtle/50
              [&_tr:last-child_td]:border-0
              [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-text-subtle
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
          <div ref={citationPanelRef} className="mb-3 rounded-lg border border-border-strong bg-bg-panel p-3.5 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">{activeCitation.docName}</span>
                <span className="text-[10px] text-text-muted">Halaman {activeCitation.page}</span>
                {activeCitation.relevanceScore && (
                  <span className="text-[10px] text-text-muted">{Math.round(activeCitation.relevanceScore * 100)}% match</span>
                )}
              </div>
              <button onClick={() => setActiveCitation(null)} className="text-xs text-text-muted hover:text-foreground cursor-pointer">
                Tutup
              </button>
            </div>
            <p className="text-[12px] text-text-subtle italic leading-relaxed">
              &ldquo;{activeCitation.fullText || activeCitation.snippet}&rdquo;
            </p>
            <button
              onClick={() => { onOpenDoc(activeCitation); setActiveCitation(null); }}
              className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors cursor-pointer"
            >
              Buka dokumen di viewer →
            </button>
          </div>
        )}

        {/* Citations pills + source tags */}
        {citations.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-2.5">
            <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider mr-0.5">Sumber:</span>
            {citations.map((c, i) => (
              <CitationPill key={i} citation={c} index={i} onOpenDoc={() => onOpenDoc(c)} />
            ))}
            {message.source_mode && message.source_mode === 'DOCUMENT' && (
              <span className="px-2 py-0.5 rounded text-[11px] font-medium border border-border-strong text-text-subtle">
                Dokumen Terverifikasi
              </span>
            )}
            {message.source_mode && message.source_mode === 'HYBRID' && (
              <span className="px-2 py-0.5 rounded text-[11px] font-medium border border-border-strong text-text-subtle">
                Dokumen + Umum
              </span>
            )}
            {message.source_mode && message.source_mode === 'GENERAL' && (
              <span className="px-2 py-0.5 rounded text-[11px] font-medium border border-border-strong text-text-subtle">
                Pengetahuan Umum
              </span>
            )}
            {message.retrieval_score && message.retrieval_score > 0 && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono text-text-muted border border-border-subtle">
                {Math.round(message.retrieval_score * 100)}% Match
              </span>
            )}
          </div>
        )}

        {/* Meta Bar */}
        <div className="flex items-center gap-3 text-text-muted pt-1">
          <span className="text-[11px] text-text-muted">{formatRelativeTime(message.timestamp)}</span>
          <div className="flex items-center gap-2 ml-auto opacity-70 group-hover:opacity-100 transition-opacity">
            <button onClick={copy} className="text-[11px] text-text-muted hover:text-foreground transition-colors cursor-pointer px-1 py-0.5 rounded hover:bg-white/5">
              {copied ? 'Disalin' : 'Salin'}
            </button>
            {onRegenerate && (
              <button
                onClick={() => onRegenerate(message.id)}
                className="text-[11px] text-text-muted hover:text-foreground transition-colors cursor-pointer px-1 py-0.5 rounded hover:bg-white/5"
              >
                Regenerasi
              </button>
            )}
            <button
              onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
              title="Bagus"
              aria-label="Bagus"
              className={`p-1 rounded hover:bg-white/5 transition-colors cursor-pointer ${feedback === 'up' ? 'text-foreground bg-white/10' : 'text-text-muted hover:text-foreground'}`}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
              title="Kurang"
              aria-label="Kurang"
              className={`p-1 rounded hover:bg-white/5 transition-colors cursor-pointer ${feedback === 'down' ? 'text-foreground bg-white/10' : 'text-text-muted hover:text-foreground'}`}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
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
    <div className="flex flex-col mb-4 animate-fade-in max-w-2xl bg-bg-panel border border-border-strong rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 border-b border-border-subtle pb-2">
        <span className="text-xs font-semibold text-foreground">
          {isDone ? 'Laporan Riset Selesai' :
            hasError ? 'Riset Gagal' :
              writingReport ? 'Menulis Laporan...' :
                'Deep Research Berjalan...'}
        </span>
        {isDone && doneEvent && (
          <span className="text-[10px] text-text-muted">
            {totalChunks} kutipan · {totalSources} sumber
          </span>
        )}
      </div>

      {/* Sub-questions plan */}
      {subQuestions.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Rencana Riset</div>
          <div className="space-y-1">
            {subQuestions.map((q, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] text-text-subtle">
                <span className="text-text-muted font-mono">{i + 1}.</span>
                <span className="leading-relaxed">{q}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress log */}
      <div className="space-y-1 mb-3 text-[11px] text-text-muted">
        {progressSteps.map((evt, i) => (
          <div key={i} className="flex items-center gap-2">
            <span>·</span>
            <span>
              {evt.event === 'searching' && evt.question
                ? `Mencari: "${evt.question.slice(0, 50)}${evt.question.length > 50 ? '...' : ''}"` :
                evt.event === 'synthesized'
                  ? `Selesai bagian ${evt.index}: ${evt.chunks_found} kutipan` :
                  evt.event === 'plan'
                    ? `${evt.count} sub-pertanyaan disusun` :
                    evt.event === 'iterating'
                      ? `Melengkapi data: ${evt.reason}` :
                      evt.event === 'writing_report'
                        ? `Menyusun laporan dari ${evt.total_chunks} kutipan...` :
                        evt.event === 'done'
                          ? `Laporan final selesai (${evt.report_length?.toLocaleString()} karakter)` :
                          evt.event === 'error'
                            ? (evt.message || 'Terjadi kesalahan') :
                            RESEARCH_STEP_LABELS[evt.event] || evt.event
              }
            </span>
          </div>
        ))}

        {isRunning && !isDone && !hasError && (
          <div className="text-[11px] text-text-muted">
            {writingReport ? 'Menyusun laporan final...' : 'Menganalisis dokumen...'}
          </div>
        )}
      </div>

      {/* View Report button */}
      {isDone && finalJobId && (
        <button
          onClick={onViewReport}
          className="w-full py-2 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-all cursor-pointer"
        >
          Buka Laporan Riset
        </button>
      )}
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
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-bg-input shrink-0">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Laporan Riset</div>
            <div className="text-xs text-text-muted truncate mt-0.5">{query}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyReport}
              className="px-2.5 py-1 text-xs text-text-muted hover:text-foreground hover:bg-bg-hover rounded transition-colors"
            >
              Salin
            </button>
            <button
              onClick={downloadReport}
              className="px-2.5 py-1 text-xs border border-border-subtle text-text-muted hover:text-foreground hover:bg-bg-hover rounded transition-colors"
            >
              Unduh .md
            </button>
            <button
              onClick={onClose}
              className="px-2.5 py-1 text-xs text-text-muted hover:text-foreground rounded transition-colors"
            >
              Tutup
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
  const token = useAuthStore(state => state.token)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const messagesCache = useRef<Record<string, ChatMessage[]>>({})
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(FALLBACK_MODELS[0])
  const [models, setModels] = useState<ModelInfo[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [modelSearch, setModelSearch] = useState('')

  useEffect(() => {
    if (activeConversationId && messages.length > 0) {
      messagesCache.current[activeConversationId] = messages
    }
  }, [activeConversationId, messages])

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
      const token = localStorage.getItem('auth_token')
      const headers: HeadersInit = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      const res = await fetch('/api/providers/models', { headers });
      if (res.ok) {
        const data = await res.json();
        const fetchedModels: ModelInfo[] = data.map((m: any) => ({
          id: m.id,
          name: m.display_name || m.id,
          endpoint_id: m.provider,
          endpoint_name: m.provider === 'gemini' ? 'Google Gemini' : m.provider.charAt(0).toUpperCase() + m.provider.slice(1),
          provider_label: m.provider === 'gemini' ? 'Google Gemini' : m.provider.charAt(0).toUpperCase() + m.provider.slice(1)
        }));

        // Sort alphabetically
        fetchedModels.sort((a, b) => a.name.localeCompare(b.name));

        setModels(fetchedModels);
        const savedModelId = localStorage.getItem('documind_preferred_model');
        const defaultModel = (savedModelId && fetchedModels.find(m => m.id === savedModelId))
          || fetchedModels.find(m => m.id === 'gemini-1.5-flash')
          || fetchedModels[0];
        setSelectedModel(defaultModel);
        return;
      }
    } catch (err) {
      console.error("Failed to fetch models from backend", err);
    }

    // Fallback if network request fails
    const fallbackModel = {
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      endpoint_id: 'gemini',
      endpoint_name: 'Google Gemini',
      provider_label: 'Google Gemini'
    } as ModelInfo;
    setModels([fallbackModel]);

    const savedModelId = localStorage.getItem('documind_preferred_model');
    if (savedModelId && savedModelId !== fallbackModel.id) {
      setSelectedModel({
        id: savedModelId,
        name: savedModelId,
        endpoint_id: 'gemini',
        endpoint_name: 'Google Gemini',
        provider_label: 'Google Gemini'
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

  const selectThread = useCallback(async (conversationId: string) => {
    setActiveConversationId(conversationId)
    
    // Instant optimistic render from local cache
    if (messagesCache.current[conversationId]) {
      setMessages(messagesCache.current[conversationId])
      setLoadingThread(false)
    } else {
      setMessages([])
      setLoadingThread(true)
    }

    if (conversationId.startsWith('temp_')) {
      setMessages([])
      setLoadingThread(false)
      return
    }

    try {
      const headers: HeadersInit = {}
      const token = localStorage.getItem('auth_token')
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`/api/conversations/${conversationId}/messages`, { headers })
      if (res.ok) {
        const data = await res.json()
        const mappedMessages: ChatMessage[] = (data.messages || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at),
          citations: m.citations || m.metadata_json?.citations,
          confidence: m.confidence ?? m.metadata_json?.confidence,
          model: m.model || m.metadata_json?.model,
          queriesUsed: m.metadata_json?.queriesUsed,
          source_mode: m.metadata_json?.source_mode,
          retrieval_score: m.metadata_json?.retrieval_score,
        }))
        messagesCache.current[conversationId] = mappedMessages
        setMessages(mappedMessages)
      }
    } catch (err) {
      console.error('Failed to load messages', err)
    } finally {
      setLoadingThread(false)
    }
  }, [])

  useEffect(() => {
    if (chatId) {
      if (chatId !== activeConversationId) {
        selectThread(chatId)
      }
    } else {
      setActiveConversationId(null)
      setMessages([])
      setLoadingThread(false)
    }
  }, [chatId, activeConversationId, selectThread])

  // Removed handleNewChat and deleteConversation as they are in SideBar now

  const sendMessage = async (overrideInput?: string, overrideHistory?: ChatMessage[]) => {
    if (loading) return
    const currentInput = overrideInput !== undefined ? overrideInput.trim() : input.trim()
    if (!currentInput) return

    // Route ke agent mode jika aktif
    if (agentMode) {
      await sendAgentMessage(overrideInput, overrideHistory)
      return
    }

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

    let finalConvId = currentConvId
    const userMsg: ChatMessage = {
      id: `msg_${Date.now().toString() + Math.random().toString(36).substring(2, 9)}_u`,
      role: 'user',
      content: currentInput,
      timestamp: new Date(),
    }
    setMessages(p => [...(overrideHistory || p), userMsg])
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
          conversation_history: (overrideHistory || messages).map(m => ({ role: m.role, content: m.content })),
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
                    finalConvId = parsed.meta.conversation_id
                    if (!currentConvId) {
                      setActiveConversationId(parsed.meta.conversation_id)
                      window.history.replaceState(null, '', `/dashboard/chat?id=${parsed.meta.conversation_id}`)
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

      const targetId = finalConvId || currentConvId
      if (targetId && !targetId.startsWith('temp_')) {
        try {
          const headers: HeadersInit = {}
          const token = localStorage.getItem('auth_token')
          if (token) headers['Authorization'] = `Bearer ${token}`
          const convRes = await fetch(`/api/conversations/${targetId}/messages`, { headers })
            if (convRes.ok) {
              const data = await convRes.json()
              if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
                const mappedMessages: ChatMessage[] = data.messages.map((m: any) => ({
                  id: m.id,
                  role: m.role,
                  content: m.content,
                  timestamp: new Date(m.created_at),
                  citations: m.citations || m.metadata_json?.citations,
                  confidence: m.confidence ?? m.metadata_json?.confidence,
                  model: m.model || m.metadata_json?.model,
                  queriesUsed: m.metadata_json?.queriesUsed,
                  source_mode: m.metadata_json?.source_mode,
                  retrieval_score: m.metadata_json?.retrieval_score,
                }))
                setMessages(prev => {
                  const hasAssistantInMapped = mappedMessages.some(m => m.role === 'assistant')
                  const hasAssistantInPrev = prev.some(m => m.role === 'assistant')
                  if (!hasAssistantInMapped && hasAssistantInPrev) {
                    return prev
                  }
                  return mappedMessages
                })
              }
            }
          } catch (e) {
            console.error("Failed to refresh messages", e)
          }
      }
    }
  }

  // ── Agent Mode Send ────────────────────────────────────────────────────────────
  const sendAgentMessage = async (overrideInput?: string, overrideHistory?: ChatMessage[]) => {
    if (loading) return
    const currentInput = overrideInput !== undefined ? overrideInput.trim() : input.trim()
    if (!currentInput) return

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

    let finalConvId = currentConvId
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content: currentInput,
      timestamp: new Date(),
    }
    setMessages(p => [...(overrideHistory || p), userMsg])
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
          conversation_history: (overrideHistory || messages).map(m => ({ role: m.role, content: m.content })),
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
                if (evt.conversation_id) {
                  finalConvId = evt.conversation_id
                  if (!currentConvId) {
                    setActiveConversationId(evt.conversation_id)
                    window.history.replaceState(null, '', `/dashboard/chat?id=${evt.conversation_id}`)
                  }
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

      const targetId = finalConvId || currentConvId
      if (targetId && !targetId.startsWith('temp_')) {
        try {
          const headers: HeadersInit = {}
          const token = localStorage.getItem('auth_token')
          if (token) headers['Authorization'] = `Bearer ${token}`
          const convRes = await fetch(`/api/conversations/${targetId}/messages`, { headers })
          if (convRes.ok) {
            const data = await convRes.json()
            if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
              const mappedMessages: ChatMessage[] = data.messages.map((m: any) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                timestamp: new Date(m.created_at),
                citations: m.citations || m.metadata_json?.citations,
                confidence: m.confidence ?? m.metadata_json?.confidence,
                model: m.model || m.metadata_json?.model,
                queriesUsed: m.metadata_json?.queriesUsed,
                source_mode: m.metadata_json?.source_mode,
                retrieval_score: m.metadata_json?.retrieval_score,
              }))
              setMessages(prev => {
                const hasAssistantInMapped = mappedMessages.some(m => m.role === 'assistant')
                const hasAssistantInPrev = prev.some(m => m.role === 'assistant')
                if (!hasAssistantInMapped && hasAssistantInPrev) {
                  return prev
                }
                return mappedMessages
              })
            }
          }
        } catch (e) {
          console.error("Failed to refresh messages", e)
        }
      }
    }
  }

  const handleEditSubmit = async (messageId: string, newContent: string) => {
    const finalConvId = activeConversationId
    if (!finalConvId || loading) return

    const idx = messages.findIndex(m => m.id === messageId)
    if (idx === -1) return

    try {
      setLoading(true)
      const token = localStorage.getItem('auth_token')
      const headers: HeadersInit = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`/api/conversations/${finalConvId}/messages/${messageId}`, {
        method: 'DELETE',
        headers
      })

      if (!res.ok) {
        throw new Error('Failed to delete message for edit')
      }

      const history = messages.slice(0, idx)
      await sendMessage(newContent, history)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  const handleRegenerate = async (messageId: string) => {
    const finalConvId = activeConversationId
    if (!finalConvId || loading) return

    const idx = messages.findIndex(m => m.id === messageId)
    if (idx === -1) return

    const userMsgIdx = idx - 1
    if (userMsgIdx < 0 || messages[userMsgIdx].role !== 'user') return

    const userMsg = messages[userMsgIdx]

    try {
      setLoading(true)
      const token = localStorage.getItem('auth_token')
      const headers: HeadersInit = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`/api/conversations/${finalConvId}/messages/${userMsg.id}`, {
        method: 'DELETE',
        headers
      })

      if (!res.ok) {
        throw new Error('Failed to delete message for regenerate')
      }

      const history = messages.slice(0, userMsgIdx)
      await sendMessage(userMsg.content, history)
    } catch (err) {
      console.error(err)
      setLoading(false)
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
    <div className="flex h-full animate-fade-in relative overflow-hidden">
      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0 bg-background h-full">
        {/* Top Context Header Bar */}
        <div className="h-13 border-b border-border-subtle bg-background px-4 sm:px-6 flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            {/* Toggle History Button */}
            <button
              onClick={() => setHistoryDrawerOpen(true)}
              className="px-2.5 py-1 rounded border border-border-strong hover:bg-bg-hover text-xs font-medium text-text-subtle hover:text-foreground transition-all cursor-pointer"
            >
              Riwayat {conversations.length > 0 && `(${conversations.length})`}
            </button>

            <span className="text-text-muted text-xs">/</span>

            {/* Active Conversation Title */}
            <span className="text-xs font-medium text-foreground truncate max-w-[140px] sm:max-w-[240px] md:max-w-md">
              {activeConversationId
                ? conversations.find(c => c.id === activeConversationId)?.title || 'Percakapan Aktif'
                : 'Percakapan Baru'}
            </span>

            {/* Active Workspace */}
            {activeWorkspace && (
              <span className="hidden md:inline text-[11px] text-text-muted truncate max-w-[160px]">
                · {activeWorkspace.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* New Conversation Button */}
            <button
              onClick={() => {
                router.push('/dashboard/chat')
                setActiveConversationId(null)
                setMessages([])
                setInput('')
              }}
              className="px-3 py-1 rounded border border-border-strong hover:bg-bg-hover text-xs font-medium text-foreground transition-all cursor-pointer"
            >
              + New Chat
            </button>
          </div>
        </div>

        {/* Messages scroll area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 flex flex-col scrollbar-none">
          {loadingThread && messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8 text-text-muted">
              <span className="text-xs font-medium">Memuat percakapan...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-2 sm:py-4 max-w-2xl mx-auto w-full animate-fade-in my-auto">
              {/* Clean Typographic Headline */}
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mb-2 sm:mb-3">
                What would you like to know?
              </h2>
              <p className="text-sm text-text-muted max-w-md mb-5 sm:mb-6 leading-relaxed">
                Tanyakan apa saja seputar dokumen Anda. Orlith akan mencari, menganalisis, dan menyertakan sitasi halaman yang terverifikasi.
              </p>

              {/* Bento Prompt Grid - No Icons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 w-full text-left">
                {PROMPT_SUGGESTIONS.map((item, i) => (
                  <button
                    key={i}
                    id={`suggested-query-${i}`}
                    onClick={() => {
                      setInput(item.query)
                      inputRef.current?.focus()
                    }}
                    className="p-3.5 sm:p-4 rounded-xl border border-border-strong/70 bg-bg-panel/40 hover:bg-bg-hover hover:border-border-strong transition-all text-left cursor-pointer group"
                  >
                    <div className="text-xs font-semibold text-foreground group-hover:text-indigo-300 transition-colors">
                      {item.title}
                    </div>
                    <div className="text-xs text-text-muted mt-1 leading-relaxed">
                      {item.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="w-full max-w-4xl mx-auto flex flex-col space-y-6">
              {messages.map(m => (
                <ChatBubble
                  key={m.id}
                  message={m}
                  onOpenDoc={(citation) => {
                    setViewerDoc({ id: citation.docId, name: citation.docName, page: citation.page, snippet: citation.snippet })
                    setViewerOpen(true)
                  }}
                  onEditSubmit={handleEditSubmit}
                  onRegenerate={handleRegenerate}
                />
              ))}
              {/* Research Panel */}
              {(researchRunning || researchEvents.length > 0) && (
                <DeepResearchPanel
                  events={researchEvents}
                  isRunning={researchRunning}
                  onViewReport={openReport}
                  finalJobId={researchJobId}
                />
              )}
              {/* Agent Steps Panel */}
              {agentMode && (agentRunning || agentSteps.length > 0) && (
                <AgentStepsPanel
                  steps={agentSteps}
                  isRunning={agentRunning}
                  streamingText={agentStreamText}
                />
              )}
              {/* Regular streaming indicator */}
              {loading && !agentMode && (
                <div className="flex flex-col mb-6">
                  <div className="text-xs font-semibold text-text-muted mb-1">Orlith</div>
                  <div className="text-sm text-foreground/90 leading-relaxed">
                    {streamingText ? (
                      <p className="whitespace-pre-wrap">
                        {streamingText}
                        <span className="inline-block w-1.5 h-4 bg-foreground ml-1 align-middle animate-caret">|</span>
                      </p>
                    ) : (
                      <span className="text-xs text-text-muted">Mencari referensi & menghasilkan jawaban...</span>
                    )}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="w-full max-w-4xl mx-auto px-4 pb-4 pt-2 shrink-0">
          <div className="relative group/input rounded-2xl border border-border-strong bg-bg-panel/90 shadow-xl shadow-black/10 focus-within:border-border-strong transition-all p-3 sm:p-3.5 flex flex-col gap-2.5">
            <BorderBeam size={320} duration={8} borderWidth={1.5} rainbow={true} glow={true} />

            {/* Mode Switcher Tabs */}
            <div className="relative z-10 flex items-center justify-between gap-2 pb-1 border-b border-border-subtle/40">
              <div className="flex items-center gap-1">
                {/* Standard RAG mode tab */}
                <button
                  type="button"
                  onClick={() => setAgentMode(false)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                    !agentMode
                      ? 'bg-white/10 text-foreground font-semibold'
                      : 'text-text-muted hover:text-foreground'
                  }`}
                >
                  Chat
                </button>

                {/* Agent mode tab */}
                <button
                  type="button"
                  id="agent-mode-toggle"
                  onClick={() => setAgentMode(a => !a)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                    agentMode
                      ? 'bg-white/10 text-foreground font-semibold'
                      : 'text-text-muted hover:text-foreground'
                  }`}
                >
                  Agent
                </button>

                {/* Deep Research button */}
                <button
                  type="button"
                  id="deep-research-btn"
                  onClick={() => setResearchModalOpen(true)}
                  className="px-2.5 py-1 rounded text-xs font-medium text-text-muted hover:text-foreground transition-all cursor-pointer"
                >
                  Deep Research
                </button>
              </div>
            </div>

            {/* Textarea */}
            <textarea
              ref={inputRef}
              id="chat-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                agentMode
                  ? "Berikan perintah untuk Agent (misal: analisis dokumen dan rangkum perbedaannya)..."
                  : "Tanyakan apa saja tentang dokumen Anda..."
              }
              rows={2}
              className="relative z-10 w-full bg-transparent text-sm text-foreground placeholder:text-text-muted outline-none resize-none leading-relaxed min-h-[48px] max-h-[160px]"
            />

            {/* Bottom bar inside dock */}
            <div className="relative z-10 flex items-center justify-between gap-2 pt-1 border-t border-border-subtle/40">
              {/* Model Picker */}
              <div className="relative">
                <button
                  type="button"
                  id="model-selector"
                  onClick={() => setModelMenuOpen(!modelMenuOpen)}
                  className="px-2.5 py-1 rounded border border-border-strong hover:bg-bg-hover text-xs font-medium text-text-subtle hover:text-foreground transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>{selectedModel ? selectedModel.name : 'Pilih Model'}</span>
                  <span className="text-[10px] text-text-muted">▾</span>
                </button>

                {modelMenuOpen && (
                  <div className="absolute left-0 bottom-full mb-2 w-72 rounded-xl border border-border-strong bg-bg-panel shadow-2xl z-30 overflow-hidden max-h-96 flex flex-col">
                    <div className="p-2 border-b border-border-strong">
                      <input
                        type="text"
                        placeholder="Cari model..."
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        className="w-full bg-bg-surface border border-border-strong rounded-md px-2.5 py-1.5 text-xs text-foreground placeholder:text-text-muted focus:outline-none"
                        autoFocus
                      />
                    </div>
                    
                    <div className="overflow-y-auto scrollbar-thin">
                      {/* Favorites section */}
                      {favorites.length > 0 && !modelSearch && (
                        <>
                          <div className="px-3 py-1.5 text-[9px] font-bold text-text-muted bg-bg-hover uppercase tracking-wider">
                            Favorit
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
                                className={`w-full flex items-center justify-between px-3 py-2 hover:bg-bg-hover cursor-pointer transition-colors text-left ${selectedModel?.id === m.id ? 'bg-white/5 font-medium' : ''}`}
                              >
                                <div className="flex flex-col min-w-0 pr-2">
                                  <span className="text-xs truncate text-foreground">{m.name}</span>
                                  <span className="text-[8px] text-text-muted uppercase tracking-wider">{m.provider_label}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => toggleFavorite(m.id, e)}
                                  className="text-xs text-amber-400 hover:text-text-muted transition-colors p-1"
                                >
                                  ★
                                </button>
                              </div>
                            ))}
                          <div className="border-t border-border-strong" />
                        </>
                      )}

                      <div className="px-3 py-1.5 text-[9px] font-bold text-text-muted bg-bg-hover uppercase tracking-wider">
                        {modelSearch ? 'Hasil Pencarian' : 'Semua Model'}
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
                            className={`w-full flex items-center justify-between px-3 py-2 hover:bg-bg-hover cursor-pointer transition-colors text-left ${selectedModel?.id === m.id ? 'bg-white/5 font-medium' : ''}`}
                          >
                            <div className="flex flex-col min-w-0 pr-2">
                              <span className="text-xs truncate text-foreground">{m.name}</span>
                              <span className="text-[8px] text-text-muted uppercase tracking-wider">{m.provider_label}</span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => toggleFavorite(m.id, e)}
                              className="text-xs text-text-muted hover:text-amber-400 transition-colors p-1"
                            >
                              {favorites.includes(m.id) ? '★' : '☆'}
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Keyboard shortcut hint + Send button */}
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[10px] text-text-muted hidden sm:inline">
                  Enter kirim · Shift+Enter baris baru
                </span>
                
                <button
                  type="button"
                  id="send-message-btn"
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  className="px-4 py-1.5 rounded-lg bg-foreground text-background font-medium text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-all cursor-pointer"
                >
                  {loading ? 'Memproses...' : 'Kirim'}
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Slide-over history drawer */}
      {historyDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setHistoryDrawerOpen(false)} />
          <div className="relative z-10 w-72 sm:w-80 h-full bg-background border-r border-border-strong shadow-2xl flex flex-col animate-fade-in">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <h2 className="text-sm font-semibold text-foreground">Riwayat Percakapan</h2>
              <button className="text-xs text-text-muted hover:text-foreground p-1 cursor-pointer" onClick={() => setHistoryDrawerOpen(false)}>
                Tutup
              </button>
            </div>
            <div className="p-3 border-b border-border-subtle">
              <button
                onClick={() => {
                  router.push('/dashboard/chat');
                  setActiveConversationId(null);
                  setMessages([]);
                  setInput('');
                  setHistoryDrawerOpen(false);
                }}
                className="w-full py-2 rounded-md border border-border-strong hover:bg-bg-hover text-xs font-medium text-foreground transition-all cursor-pointer"
              >
                + Percakapan Baru
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1 scrollbar-thin">
              {conversations.length === 0 ? (
                <div className="text-center py-8 text-xs text-text-muted">
                  Belum ada riwayat percakapan.
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => {
                      window.history.pushState(null, '', `/dashboard/chat?id=${conv.id}`);
                      selectThread(conv.id);
                      setHistoryDrawerOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-md transition-all cursor-pointer ${
                      activeConversationId === conv.id 
                        ? 'bg-white/10 text-foreground font-medium' 
                        : 'hover:bg-bg-hover text-text-subtle hover:text-foreground'
                    }`}
                  >
                    <div className="text-xs line-clamp-2 leading-relaxed">{conv.title || 'Percakapan Tanpa Judul'}</div>
                    <div className="text-[10px] text-text-muted mt-0.5">{formatRelativeTime(conv.updated_at)}</div>
                  </button>
                ))
              )}
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
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle bg-bg-input">
              <div>
                <div className="text-sm font-semibold text-foreground">Deep Research</div>
                <div className="text-xs text-text-muted mt-0.5">Investigasi mendalam lintas seluruh dokumen workspace</div>
              </div>
              <button onClick={() => setResearchModalOpen(false)} className="text-xs text-text-muted hover:text-foreground px-2 py-1 transition-colors">
                Tutup
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
                className="w-full bg-background border border-border-strong focus:border-border-subtle rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-text-muted outline-none resize-none leading-relaxed transition-all"
              />

              {/* How it works */}
              <div className="mt-4 bg-background border border-border-subtle rounded-xl p-3">
                <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">Pipeline Otomatis</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { step: '1', label: 'Plan', desc: 'Generate 4 sub-questions' },
                    { step: '2', label: 'Search', desc: 'Semantic search per Q' },
                    { step: '3', label: 'Synthesize', desc: 'Rangkum per pertanyaan' },
                    { step: '4', label: 'Report', desc: 'Laporan Markdown final' },
                  ].map(s => (
                    <div key={s.step} className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-text-muted">[{s.step}]</span>
                      <div>
                        <div className="text-[10px] font-medium text-foreground">{s.label}</div>
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
                      className="text-[10px] px-2.5 py-1 rounded border border-border-subtle hover:bg-bg-hover text-text-subtle hover:text-foreground transition-all"
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
                className="flex-1 py-2.5 rounded-xl border border-border-strong text-xs text-text-subtle hover:text-foreground hover:bg-bg-hover transition-all"
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
                className="flex-1 py-2.5 rounded-xl bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium transition-all"
              >
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
                <span className="text-xs font-semibold text-foreground truncate max-w-[150px] sm:max-w-md">{viewerDoc.name}</span>
                <span className="text-[11px] font-mono text-text-muted border border-border-subtle px-1.5 py-0.5 rounded">p. {viewerDoc.page}</span>
                <a
                  href={`/api/documents/${viewerDoc.id}/download?token=${encodeURIComponent(token || '')}#page=${viewerDoc.page}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-2 py-1 rounded border border-border-subtle hover:bg-bg-hover text-xs text-text-muted hover:text-foreground transition-colors"
                >
                  <span className="hidden sm:inline">Buka Tab Baru</span>
                  <span className="sm:hidden">Tab Baru</span>
                </a>
              </div>
              <button onClick={() => setViewerOpen(false)} className="text-xs text-text-muted hover:text-foreground px-2 py-1 rounded transition-colors">
                Tutup
              </button>
            </div>

            {/* Viewer toolbar */}
            <div className="flex items-center gap-4 px-4 py-2 border-b border-border-subtle bg-background text-xs text-text-subtle">
              <div className="flex items-center gap-2">
                <span>Halaman</span>
                <input type="text" readOnly value={viewerDoc.page} className="w-8 text-center bg-bg-hover border border-border-subtle rounded py-0.5 text-xs text-foreground" />
              </div>
              <div className="w-px h-3 bg-border-subtle" />
              <button
                onClick={() => {
                  setInput(`Jelaskan lebih lanjut bagian pada halaman ${viewerDoc.page} mengenai: "${viewerDoc.snippet.slice(0, 50)}..."`)
                  setViewerOpen(false)
                }}
                className="ml-auto px-3 py-1 rounded border border-border-subtle hover:bg-bg-hover text-foreground font-medium text-xs transition-colors"
              >
                Tanya AI tentang bagian ini
              </button>
            </div>

            {/* Page Content / Actual PDF iframe */}
            <div className="flex-1 bg-background flex flex-col">
              {viewerDoc.name.toLowerCase().endsWith('.pdf') ? (
                <div className="flex-1 w-full flex flex-col">
                  {/* Mobile Tip Banner */}
                  <div className="block sm:hidden border-b border-border-subtle px-4 py-2 text-[11px] text-text-muted text-center">
                    Catatan: Gunakan <strong>"Buka Tab Baru"</strong> jika pratinjau dokumen tidak memuat di peramban seluler.
                  </div>
                  <iframe
                    src={`/api/documents/${viewerDoc.id}/download?token=${encodeURIComponent(token || '')}#page=${viewerDoc.page}`}
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
