'use client'

import { useState, useEffect, useRef } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { 
  GitCompare, Send, Zap, Clock, AlertCircle, Sparkles, 
  ThumbsUp, HelpCircle, History, MessageSquare, BarChart2,
  ChevronDown, Search
} from 'lucide-react'
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip
} from 'recharts'
import { api } from '@/lib/api-client'
import { axiosClient } from '@/lib/axios-client'

interface VoteHistoryItem {
  id: string
  query_text: string
  model_a: string
  model_b: string
  response_a: string
  response_b: string
  vote: string
  created_at: string
}

interface SearchableSelectProps {
  label: string
  value: string
  onChange: (val: string) => void
  options: any[]
  disabled?: boolean
  placeholder?: string
}

function SearchableSelect({ label, value, onChange, options, disabled, placeholder = "Search model..." }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const selectedOption = options.find(o => o.id === value)

  const filteredOptions = options.filter(o => {
    const term = search.toLowerCase()
    const name = (o.display_name || o.id).toLowerCase()
    const provider = (o.provider || '').toLowerCase()
    return name.includes(term) || provider.includes(term)
  })

  return (
    <div className="relative" ref={containerRef}>
      <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-1.5">{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2.5 rounded-xl border border-border-strong bg-bg-panel text-xs font-semibold text-foreground text-left flex items-center justify-between focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 cursor-pointer"
      >
        <span className="truncate">
          {selectedOption ? `${selectedOption.display_name || selectedOption.id} (${selectedOption.provider})` : "Select a model"}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0 ml-2" />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1.5 rounded-xl border border-border-strong bg-bg-input shadow-2xl p-2 space-y-2 animate-fade-in max-h-60 flex flex-col">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              type="text"
              placeholder={placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border-strong bg-bg-panel text-xs text-foreground placeholder:text-text-muted focus:outline-none focus:border-indigo-500 transition-colors"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-border-subtle/30 pr-0.5 mt-1">
            {filteredOptions.length === 0 ? (
              <div className="text-center py-4 text-xs text-text-muted">No models found</div>
            ) : (
              filteredOptions.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    onChange(o.id)
                    setIsOpen(false)
                    setSearch('')
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer ${
                    o.id === value
                      ? 'bg-indigo-600/20 text-indigo-300 font-bold'
                      : 'hover:bg-bg-hover text-text-subtle hover:text-foreground'
                  }`}
                >
                  <span className="truncate">{o.display_name || o.id}</span>
                  <span className="text-[10px] text-text-muted font-normal uppercase shrink-0 ml-2">{o.provider}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ModelComparisonPage() {
  const { activeWorkspace } = useWorkspaceStore()
  const [modelA, setModelA] = useState('')
  const [modelB, setModelB] = useState('')
  const [availableModels, setAvailableModels] = useState<any[]>([])
  const [query, setQuery] = useState('')
  
  // Streaming state
  const [streaming, setStreaming] = useState(false)
  const [responseA, setResponseA] = useState('')
  const [responseB, setResponseB] = useState('')
  const [ttftA, setTtftA] = useState<number | null>(null)
  const [ttftB, setTtftB] = useState<number | null>(null)
  const [speedA, setSpeedA] = useState<number | null>(null)
  const [speedB, setSpeedB] = useState<number | null>(null)
  const [costA, setCostA] = useState<number | null>(null)
  const [costB, setCostB] = useState<number | null>(null)
  
  // Voting and history
  const [voted, setVoted] = useState(false)
  const [votesHistory, setVotesHistory] = useState<VoteHistoryItem[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const startTimeA = useRef<number>(0)
  const startTimeB = useRef<number>(0)
  const endTimeA = useRef<number>(0)
  const endTimeB = useRef<number>(0)



  const fetchHistory = async () => {
    if (!activeWorkspace?.id) return
    try {
      const data = await api.getModelCompareVotes(activeWorkspace.id)
      setVotesHistory(data)
    } catch (err) {
      console.error("Failed to load compare votes", err)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [activeWorkspace?.id])

  useEffect(() => {
    axiosClient.get('/providers/models').then(res => {
      setAvailableModels(res.data)
      if (res.data.length >= 2) {
        setModelA(res.data[0].id)
        setModelB(res.data[1].id)
      } else if (res.data.length === 1) {
        setModelA(res.data[0].id)
        setModelB(res.data[0].id)
      }
    }).catch(console.error)
  }, [])

  const CAPABILITY_PROFILES: Record<string, { reasoning: number, coding: number, documentAnalysis: number, longContext: number, knowledge: number, costEfficiency: number }> = {
    'gpt-4o-mini': { reasoning: 82, coding: 80, documentAnalysis: 85, longContext: 80, knowledge: 85, costEfficiency: 95 },
    'gpt-4o': { reasoning: 95, coding: 92, documentAnalysis: 96, longContext: 90, knowledge: 94, costEfficiency: 80 },
    'gpt-4-turbo': { reasoning: 93, coding: 88, documentAnalysis: 92, longContext: 95, knowledge: 95, costEfficiency: 75 },
    'gpt-3.5': { reasoning: 70, coding: 65, documentAnalysis: 70, longContext: 65, knowledge: 80, costEfficiency: 98 },
    'sonnet': { reasoning: 94, coding: 95, documentAnalysis: 95, longContext: 92, knowledge: 92, costEfficiency: 85 },
    'opus': { reasoning: 96, coding: 85, documentAnalysis: 97, longContext: 95, knowledge: 97, costEfficiency: 60 },
    'haiku': { reasoning: 85, coding: 80, documentAnalysis: 85, longContext: 88, knowledge: 85, costEfficiency: 98 },
    'gemini-1.5-pro': { reasoning: 94, coding: 88, documentAnalysis: 95, longContext: 100, knowledge: 95, costEfficiency: 80 },
    'gemini-1.5-flash': { reasoning: 85, coding: 80, documentAnalysis: 85, longContext: 95, knowledge: 85, costEfficiency: 98 },
    'gemini': { reasoning: 88, coding: 82, documentAnalysis: 88, longContext: 90, knowledge: 88, costEfficiency: 85 },
    'llama-3.1-70b': { reasoning: 90, coding: 85, documentAnalysis: 88, longContext: 85, knowledge: 92, costEfficiency: 90 },
    'llama-3.1-8b': { reasoning: 80, coding: 75, documentAnalysis: 78, longContext: 80, knowledge: 82, costEfficiency: 99 },
    'llama-3-70b': { reasoning: 88, coding: 82, documentAnalysis: 85, longContext: 60, knowledge: 90, costEfficiency: 85 },
    'llama-3-8b': { reasoning: 75, coding: 70, documentAnalysis: 70, longContext: 60, knowledge: 75, costEfficiency: 95 },
    'deepseek-coder': { reasoning: 85, coding: 95, documentAnalysis: 80, longContext: 75, knowledge: 85, costEfficiency: 92 },
    'deepseek-v2': { reasoning: 92, coding: 88, documentAnalysis: 85, longContext: 85, knowledge: 90, costEfficiency: 95 },
    'deepseek': { reasoning: 90, coding: 88, documentAnalysis: 85, longContext: 85, knowledge: 90, costEfficiency: 95 },
    'mistral-large': { reasoning: 92, coding: 85, documentAnalysis: 90, longContext: 80, knowledge: 92, costEfficiency: 85 },
    'mixtral': { reasoning: 85, coding: 80, documentAnalysis: 85, longContext: 80, knowledge: 88, costEfficiency: 92 },
    'qwen-max': { reasoning: 93, coding: 88, documentAnalysis: 90, longContext: 85, knowledge: 92, costEfficiency: 85 },
    'qwen-plus': { reasoning: 88, coding: 82, documentAnalysis: 85, longContext: 80, knowledge: 88, costEfficiency: 92 },
  }

  const DEFAULT_PROFILE = { reasoning: 80, coding: 80, documentAnalysis: 80, longContext: 80, knowledge: 80, costEfficiency: 80 }

  const getCapabilityProfile = (modelId: string) => {
    if (!modelId) return DEFAULT_PROFILE
    const id = modelId.toLowerCase()
    
    // Cari metadata model asli dari daftar model yang tersedia
    const modelMeta = availableModels.find(m => m.id === modelId)
    const contextWindow = modelMeta?.context_window || 8192
    const provider = modelMeta?.provider || ''

    // 1. Tentukan nilai default awal
    let reasoning = 80
    let coding = 75
    let documentAnalysis = 80
    let longContext = 70
    let knowledge = 80
    let costEfficiency = 85

    // 2. Analisis berdasarkan context window (Metadata asli)
    if (contextWindow >= 1000000) {
      longContext = 98
    } else if (contextWindow >= 200000) {
      longContext = 92
    } else if (contextWindow >= 128000) {
      longContext = 85
    } else if (contextWindow >= 32000) {
      longContext = 75
    } else {
      longContext = 60
    }

    // 3. Analisis berdasarkan provider & tipe model (Cost Efficiency)
    if (provider === 'ollama' || id.includes('free') || id.includes('local')) {
      costEfficiency = 100
    } else if (id.includes('mini') || id.includes('flash') || id.includes('haiku') || id.includes('8b') || id.includes('3b') || id.includes('lite')) {
      costEfficiency = 95
    } else if (id.includes('opus') || id.includes('max') || id.includes('large') || id.includes('o1') || id.includes('405b') || id.includes('gpt-4-turbo')) {
      costEfficiency = 55
    } else {
      costEfficiency = 80
    }

    // 4. Analisis berdasarkan tag pada ID model (Ukuran & Kemampuan)
    if (id.includes('pro') || id.includes('opus') || id.includes('sonnet') || id.includes('max') || id.includes('70b') || id.includes('large') || id.includes('o1') || id.includes('405b') || id.includes('gpt-4o')) {
      reasoning = 94
      coding = 90
      documentAnalysis = 93
      knowledge = 94
    } else if (id.includes('mini') || id.includes('flash') || id.includes('haiku') || id.includes('8b') || id.includes('3b') || id.includes('lite')) {
      reasoning = 82
      coding = 78
      documentAnalysis = 82
      knowledge = 82
    }

    // 5. Cek spesialisasi fungsional
    if (id.includes('coder') || id.includes('code')) {
      coding = Math.max(coding, 96)
      reasoning = Math.max(reasoning, 88)
    }
    if (id.includes('math') || id.includes('reasoning') || id.includes('o1')) {
      reasoning = Math.max(reasoning, 98)
    }
    if (id.includes('vision') || id.includes('vl') || id.includes('multimodal')) {
      documentAnalysis = Math.max(documentAnalysis, 95)
    }

    // 6. Override khusus menggunakan profil statis populer jika terdeteksi
    const matches = Object.keys(CAPABILITY_PROFILES)
      .filter(key => id.includes(key))
      .sort((a, b) => b.length - a.length)
      
    if (matches.length > 0) {
      const matchedProfile = { ...CAPABILITY_PROFILES[matches[0]] }
      return {
        reasoning: matchedProfile.reasoning,
        coding: matchedProfile.coding,
        documentAnalysis: matchedProfile.documentAnalysis,
        longContext: matchedProfile.longContext || longContext,
        knowledge: matchedProfile.knowledge,
        costEfficiency: provider === 'ollama' ? 100 : matchedProfile.costEfficiency,
      }
    }

    return { reasoning, coding, documentAnalysis, longContext, knowledge, costEfficiency }
  }

  const profileA = getCapabilityProfile(modelA)
  const profileB = getCapabilityProfile(modelB)

  const radarData = [
    { metric: 'Reasoning', A: profileA.reasoning, B: profileB.reasoning, fullMark: 100 },
    { metric: 'Coding', A: profileA.coding, B: profileB.coding, fullMark: 100 },
    { metric: 'Document Analysis', A: profileA.documentAnalysis, B: profileB.documentAnalysis, fullMark: 100 },
    { metric: 'Long Context', A: profileA.longContext, B: profileB.longContext, fullMark: 100 },
    { metric: 'Knowledge', A: profileA.knowledge, B: profileB.knowledge, fullMark: 100 },
    { metric: 'Cost Efficiency', A: profileA.costEfficiency, B: profileB.costEfficiency, fullMark: 100 },
  ]

  const calculateCost = (model: string, inTokens: number, outTokens: number) => {
    const modelLower = model.toLowerCase()
    let inRate = 1.0 / 1_000_000
    let outRate = 2.0 / 1_000_000
    
    if (modelLower.includes('mini')) {
      inRate = 0.15 / 1_000_000
      outRate = 0.60 / 1_000_000
    } else if (modelLower.includes('gpt-4o')) {
      inRate = 5.00 / 1_000_000
      outRate = 15.00 / 1_000_000
    } else if (modelLower.includes('sonnet')) {
      inRate = 3.00 / 1_000_000
      outRate = 15.00 / 1_000_000
    } else if (modelLower.includes('haiku')) {
      inRate = 0.25 / 1_000_000
      outRate = 1.25 / 1_000_000
    } else if (modelLower.includes('ollama')) {
      return 0.0
    }
    return (inTokens * inRate) + (outTokens * outRate)
  }

  const handleCompare = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeWorkspace?.id || !query.trim() || streaming) return

    setStreaming(true)
    setResponseA('')
    setResponseB('')
    setTtftA(null)
    setTtftB(null)
    setSpeedA(null)
    setSpeedB(null)
    setCostA(null)
    setCostB(null)
    setVoted(false)
    setErrorMsg(null)

    const now = performance.now()
    startTimeA.current = now
    startTimeB.current = now

    try {
      const compareStream = api.compareModels(activeWorkspace.id, query, modelA, modelB)

      for await (const chunk of compareStream) {
        // SSE is returned as text lines. Parse each "data: {...}"
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim()
            if (dataStr === '[DONE]') continue
            
            try {
              const payload = JSON.parse(dataStr)
              const event = payload.event
              const body = payload.data

              if (event === 'model_a') {
                setResponseA(prev => prev + body.text)
              } else if (event === 'model_b') {
                setResponseB(prev => prev + body.text)
              } else if (event === 'ttft_model_a') {
                setTtftA(body.ttft_ms)
              } else if (event === 'ttft_model_b') {
                setTtftB(body.ttft_ms)
              } else if (event === 'done_model_a') {
                endTimeA.current = performance.now()
                const durationSec = (endTimeA.current - startTimeA.current) / 1000
                const tokens = body.text.length / 4
                const promptTokens = query.length / 4
                setSpeedA(Math.round(tokens / durationSec))
                setCostA(calculateCost(modelA, promptTokens, tokens))
              } else if (event === 'done_model_b') {
                endTimeB.current = performance.now()
                const durationSec = (endTimeB.current - startTimeB.current) / 1000
                const tokens = body.text.length / 4
                const promptTokens = query.length / 4
                setSpeedB(Math.round(tokens / durationSec))
                setCostB(calculateCost(modelB, promptTokens, tokens))
              } else if (event === 'error_model_a') {
                setResponseA(`Error: ${body.message}`)
              } else if (event === 'error_model_b') {
                setResponseB(`Error: ${body.message}`)
              }
            } catch (pErr) {
              // chunk json parse error
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || 'Gagal menjalankan perbandingan model. Pastikan API key dikonfigurasi.')
    } finally {
      setStreaming(false)
    }
  }

  const handleVote = async (choice: 'model_a' | 'model_b' | 'tie') => {
    if (!activeWorkspace?.id || voted || !responseA || !responseB) return
    try {
      await api.voteModelCompare(activeWorkspace.id, {
        query_text: query,
        model_a: modelA,
        model_b: modelB,
        response_a: responseA,
        response_b: responseB,
        vote: choice
      })
      setVoted(true)
      fetchHistory()
    } catch (err) {
      console.error("Failed to submit vote", err)
    }
  }

  if (!activeWorkspace) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-background">
        <div className="max-w-md space-y-4">
          <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto text-indigo-400 mb-2">
            <GitCompare className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold">No Active Workspace</h3>
          <p className="text-sm text-text-subtle">Select or create a workspace to compare LLM performance.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-background px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black mb-1 flex items-center gap-2">
              <GitCompare className="w-6 h-6 text-indigo-400" />
              Model Comparison
            </h1>
            <p className="text-sm text-text-subtle">
              Compare LLM outputs side-by-side on a single query and check latency/cost metrics
            </p>
          </div>
        </div>

        {/* Configurations & Input */}
        <div className="p-5 rounded-2xl border border-border-subtle bg-background/80 backdrop-blur-sm">
          <form onSubmit={handleCompare} className="space-y-5">
            {/* Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SearchableSelect
                label="Model A"
                value={modelA}
                onChange={setModelA}
                options={availableModels}
                disabled={streaming}
                placeholder="Search Model A..."
              />
              <SearchableSelect
                label="Model B"
                value={modelB}
                onChange={setModelB}
                options={availableModels}
                disabled={streaming}
                placeholder="Search Model B..."
              />
            </div>

            {/* Query Input */}
            <div className="relative flex items-center">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={streaming}
                placeholder="Ask both models a question (e.g., 'What is the refund policy for cancellations?')"
                className="w-full pl-4 pr-12 py-3 rounded-xl border border-border-strong bg-bg-panel text-xs text-foreground placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="submit"
                disabled={streaming || !query.trim()}
                className="absolute right-2 p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-all cursor-pointer"
              >
                {streaming ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </form>
          
          {errorMsg && (
            <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {/* Side-by-side Response Areas */}
            {(responseA || responseB || streaming) ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Model A response panel */}
              <div className="rounded-2xl border border-border-subtle bg-background/40 flex flex-col min-h-[300px] min-w-0 w-full overflow-hidden">
                {/* Header metrics */}
                <div className="p-4 border-b border-border-subtle bg-background/80 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">Model A</span>
                    <h2 className="text-xs font-bold text-foreground leading-normal truncate max-w-[200px]">{modelA}</h2>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-text-subtle">
                    {ttftA && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" /> TTFT: {ttftA}ms
                      </span>
                    )}
                    {speedA && (
                      <span className="flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-amber-400" /> {speedA} tok/s
                      </span>
                    )}
                    {costA !== null && (
                      <span className="font-semibold text-emerald-400">${costA.toFixed(6)}</span>
                    )}
                  </div>
                </div>
                {/* Content */}
                <div className="flex-1 p-5 text-xs leading-relaxed text-foreground font-normal whitespace-pre-wrap break-words overflow-x-hidden overflow-y-auto">
                  {responseA || (
                    <span className="text-text-muted italic animate-pulse">Waiting for stream response...</span>
                  )}
                </div>
              </div>

              {/* Model B response panel */}
              <div className="rounded-2xl border border-border-subtle bg-background/40 flex flex-col min-h-[300px] min-w-0 w-full overflow-hidden">
                {/* Header metrics */}
                <div className="p-4 border-b border-border-subtle bg-background/80 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">Model B</span>
                    <h2 className="text-xs font-bold text-foreground leading-normal truncate max-w-[200px]">{modelB}</h2>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-text-subtle">
                    {ttftB && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" /> TTFT: {ttftB}ms
                      </span>
                    )}
                    {speedB && (
                      <span className="flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-amber-400" /> {speedB} tok/s
                      </span>
                    )}
                    {costB !== null && (
                      <span className="font-semibold text-emerald-400">${costB.toFixed(6)}</span>
                    )}
                  </div>
                </div>
                {/* Content */}
                <div className="flex-1 p-5 text-xs leading-relaxed text-foreground font-normal whitespace-pre-wrap break-words overflow-x-hidden overflow-y-auto">
                  {responseB || (
                    <span className="text-text-muted italic animate-pulse">Waiting for stream response...</span>
                  )}
                </div>
              </div>

            </div>

            {/* Voting Component */}
            {!streaming && responseA && responseB && (
              <div className="p-5 rounded-2xl border border-border-strong bg-bg-input text-center max-w-xl mx-auto space-y-4">
                <h3 className="text-xs font-bold text-foreground flex items-center justify-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" /> Which model generated a better answer?
                </h3>
                {voted ? (
                  <div className="text-xs font-bold text-emerald-400 py-1 flex items-center justify-center gap-1.5 bg-emerald-500/5 border border-emerald-500/15 rounded-xl max-w-xs mx-auto">
                    <ThumbsUp className="w-3.5 h-3.5" /> Vote submitted! Thank you.
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={() => handleVote('model_a')}
                      className="px-4 py-2.5 rounded-xl border border-indigo-500/20 bg-indigo-600/10 hover:bg-indigo-600 text-white text-xs font-semibold cursor-pointer transition-all hover:scale-[1.02]"
                    >
                      👈 Model A is Better
                    </button>
                    <button
                      onClick={() => handleVote('tie')}
                      className="px-4 py-2.5 rounded-xl border border-border-strong bg-bg-panel hover:bg-bg-hover text-text-subtle hover:text-foreground text-xs font-semibold cursor-pointer transition-all"
                    >
                      🤝 Tie (Equal Performance)
                    </button>
                    <button
                      onClick={() => handleVote('model_b')}
                      className="px-4 py-2.5 rounded-xl border border-indigo-500/20 bg-indigo-600/10 hover:bg-indigo-600 text-white text-xs font-semibold cursor-pointer transition-all hover:scale-[1.02]"
                    >
                      Model B is Better 👉
                    </button>
                  </div>
                )}
              </div>
            )}
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-text-muted text-sm border border-border-subtle border-dashed rounded-2xl bg-bg-panel/30">
                Submit a query to start comparing models.
              </div>
            )}
          </div>

          <div className="space-y-8">
            {/* Model Metrics Radar */}
            <div className="p-5 rounded-2xl border border-border-subtle bg-background/80 flex flex-col items-center">
              <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-indigo-400" /> Model Capability Profile</h3>
              <p className="text-[10px] text-text-muted mb-4 text-center">Scores are estimated capability profiles based on public benchmark trends and model characteristics. They are not official benchmark results.</p>
              <div className="w-full h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                    <PolarGrid stroke="#3A3A4A" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: '#8A8AA3', fontSize: 10 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#5A5A72', fontSize: 10 }} />
                    <Radar name="Model A" dataKey="A" stroke="#818CF8" fill="#818CF8" fillOpacity={0.4} />
                    <Radar name="Model B" dataKey="B" stroke="#34D399" fill="#34D399" fillOpacity={0.4} />
                    <RechartsTooltip contentStyle={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'var(--foreground)' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-6 mt-2 w-full">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-indigo-400 opacity-80" /><span className="text-[10px] text-foreground truncate max-w-[100px]">{availableModels.find(m => m.id === modelA)?.display_name || modelA || "Model A"}</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-emerald-400 opacity-80" /><span className="text-[10px] text-foreground truncate max-w-[100px]">{availableModels.find(m => m.id === modelB)?.display_name || modelB || "Model B"}</span></div>
              </div>
            </div>

            {/* Voting history short preview */}
            <div className="rounded-2xl border border-border-subtle bg-background/80 p-5 space-y-4">
              <h3 className="text-[10px] font-bold text-text-subtle uppercase tracking-wider flex items-center gap-2">
                <History className="w-3.5 h-3.5" /> Recent Battles
              </h3>
              <div className="overflow-hidden">
                {votesHistory.length === 0 ? (
                  <div className="text-center py-4 text-xs text-text-muted">No votes yet.</div>
                ) : (
                  <div className="space-y-3">
                    {votesHistory.slice(0, 4).map((item) => (
                      <div key={item.id} className="flex flex-col gap-1.5 pb-3 border-b border-border-subtle/30 last:border-0 last:pb-0">
                        <div className="text-xs text-foreground truncate w-full font-medium" title={item.query_text}>&quot;{item.query_text}&quot;</div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className={item.vote === 'model_a' ? 'text-indigo-400 font-bold' : 'text-text-muted'}>A: {item.model_a.split('/').pop()?.slice(0, 15)}</span>
                          <span className={item.vote === 'model_b' ? 'text-emerald-400 font-bold' : 'text-text-muted'}>B: {item.model_b.split('/').pop()?.slice(0, 15)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Full Voting History Table */}
        <div className="rounded-2xl border border-border-subtle bg-background/80 p-5 space-y-4 mt-8">
          <h3 className="text-xs font-bold text-text-subtle uppercase tracking-wider flex items-center gap-2">
            <History className="w-4 h-4" />
            Comparison Logs & Voting History ({votesHistory.length})
          </h3>
          
          <div className="overflow-x-auto">
            {votesHistory.length === 0 ? (
              <div className="text-center py-8 text-xs text-text-muted">
                No comparison votes submitted yet in this workspace.
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-border-subtle text-text-muted">
                    <th className="pb-3 font-semibold uppercase tracking-wider">Query</th>
                    <th className="pb-3 font-semibold uppercase tracking-wider">Model A</th>
                    <th className="pb-3 font-semibold uppercase tracking-wider">Model B</th>
                    <th className="pb-3 font-semibold uppercase tracking-wider">Winner</th>
                    <th className="pb-3 font-semibold uppercase tracking-wider text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {votesHistory.map((item) => (
                    <tr key={item.id} className="border-b border-border-subtle/40 last:border-b-0 hover:bg-bg-panel/40 transition-colors">
                      <td className="py-3 font-medium text-foreground max-w-xs truncate pr-4" title={item.query_text}>
                        {item.query_text}
                      </td>
                      <td className="py-3 text-text-subtle">{item.model_a}</td>
                      <td className="py-3 text-text-subtle">{item.model_b}</td>
                      <td className="py-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          item.vote === 'tie'
                            ? 'bg-bg-hover text-text-subtle'
                            : 'bg-indigo-500/15 text-indigo-300'
                        }`}>
                          {item.vote === 'model_a' ? 'Model A' : item.vote === 'model_b' ? 'Model B' : 'Tie (Seri)'}
                        </span>
                      </td>
                      <td className="py-3 text-right text-text-muted">
                        {new Date(item.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
