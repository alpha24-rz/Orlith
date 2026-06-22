'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { formatRelativeTime } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAuthStore } from '@/stores/auth'
import {
  Layers, Plus, Trash2, Download, Play, CheckCircle2,
  Clock, XCircle, FileText, Loader2, X, Sparkles,
  AlertCircle, Zap, FileSpreadsheet, RefreshCw,
  GripVertical, ChevronDown, ChevronRight, Brain, Table2
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtractionField {
  name: string
  type: 'string' | 'number' | 'date' | 'boolean' | 'array'
}

interface BackendDocument {
  id: string
  filename: string
  file_type: string
  file_size: number
  status: string
  metadata?: { page_count?: number; chunk_count?: number }
  created_at: string
}

interface ExtractionJob {
  id: string
  workspace_id: string
  name: string
  fields: ExtractionField[]
  document_ids: string[]
  status: 'queued' | 'running' | 'completed' | 'failed'
  processed_count: number
  doc_count: number
  results: Record<string, Record<string, string | null>> | null
  error_message: string | null
  created_at: string
  completed_at: string | null
}

interface Toast {
  id: string
  title: string
  desc: string
  type: 'success' | 'info' | 'danger'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FIELD_TYPES: ExtractionField['type'][] = ['string', 'number', 'date', 'boolean', 'array']

const TYPE_ICONS: Record<ExtractionField['type'], string> = {
  string: 'Aa',
  number: '123',
  date: '📅',
  boolean: '☑',
  array: '[]',
}

const STATUS_CONFIG = {
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  running: {
    label: 'Running',
    icon: Loader2,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
  queued: {
    label: 'Queued',
    icon: Clock,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
  },
} as const

// ─── Utility helpers ──────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldRow({
  field,
  index,
  onChange,
  onRemove,
}: {
  field: ExtractionField
  index: number
  onChange: (i: number, patch: Partial<ExtractionField>) => void
  onRemove: (i: number) => void
}) {
  return (
    <div className="flex items-center gap-2 animate-fade-in group">
      <GripVertical className="w-3.5 h-3.5 text-[#3A3A4E] shrink-0 cursor-grab" />
      <input
        type="text"
        value={field.name}
        onChange={e => onChange(index, { name: e.target.value })}
        placeholder="Field name (e.g. Invoice Number)"
        className="flex-1 px-3 py-1.5 rounded-lg border border-border-strong bg-bg-panel text-xs text-foreground placeholder:text-text-muted focus:outline-none focus:border-indigo-500 transition-colors"
      />
      <div className="relative">
        <select
          value={field.type}
          onChange={e => onChange(index, { type: e.target.value as ExtractionField['type'] })}
          className="pl-2 pr-6 py-1.5 rounded-lg border border-border-strong bg-bg-panel text-xs text-indigo-300 focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer font-mono"
        >
          {FIELD_TYPES.map(t => (
            <option key={t} value={t}>
              {TYPE_ICONS[t]} {t}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none" />
      </div>
      <button
        onClick={() => onRemove(index)}
        className="p-1 text-[#3A3A4E] hover:text-red-400 transition-colors"
        title="Remove field"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function ResultsTable({
  job,
  docNames,
}: {
  job: ExtractionJob
  docNames: Record<string, string>
}) {
  const [expanded, setExpanded] = useState(true)
  if (!job.results || Object.keys(job.results).length === 0) return null

  const fieldNames = job.fields.map(f => f.name)
  const rows = Object.entries(job.results)

  return (
    <div className="rounded-2xl border border-border-strong bg-bg-input overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-bg-hover transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-bold">
          <Table2 className="w-4 h-4 text-indigo-400" />
          Results — {job.name}
          <span className="text-[10px] font-normal text-text-muted ml-1">
            {rows.length} doc{rows.length !== 1 ? 's' : ''} · {fieldNames.length} fields
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-text-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 text-text-muted" />
        )}
      </button>

      {expanded && (
        <div className="overflow-x-auto border-t border-border-subtle">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-bg-panel border-b border-border-strong">
                <th className="px-4 py-2.5 text-left font-semibold text-text-subtle whitespace-nowrap sticky left-0 bg-bg-panel">
                  Document
                </th>
                {fieldNames.map(fn => (
                  <th
                    key={fn}
                    className="px-4 py-2.5 text-left font-semibold text-text-subtle whitespace-nowrap"
                  >
                    {fn}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([docId, extracted], ri) => (
                <tr
                  key={docId}
                  className={`border-b border-border-subtle hover:bg-bg-hover/50 transition-colors ${
                    ri % 2 === 0 ? '' : 'bg-bg-panel/30'
                  }`}
                >
                  <td className="px-4 py-2.5 text-foreground/80 font-medium whitespace-nowrap sticky left-0 bg-inherit max-w-[180px] truncate">
                    {docNames[docId] ?? docId}
                  </td>
                  {fieldNames.map(fn => {
                    const val = extracted[fn]
                    return (
                      <td key={fn} className="px-4 py-2.5 whitespace-nowrap">
                        {val == null ? (
                          <span className="text-[#3A3A4E] italic">—</span>
                        ) : (
                          <span className="text-[#E0E0F0]">{String(val)}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExtractionPage() {
  const { activeWorkspace } = useWorkspaceStore()
  const { token } = useAuthStore()

  const [activeTab, setActiveTab] = useState<'jobs' | 'new'>('jobs')

  // Jobs list state
  const [jobs, setJobs] = useState<ExtractionJob[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [jobsError, setJobsError] = useState<string | null>(null)

  // Document list from workspace
  const [docs, setDocs] = useState<BackendDocument[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)

  // New extraction form
  const [jobName, setJobName] = useState('')
  const [fields, setFields] = useState<ExtractionField[]>([
    { name: '', type: 'string' },
  ])
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Expanded jobs for result view
  const [expandedResults, setExpandedResults] = useState<string | null>(null)

  // Doc name cache (id → filename)
  const [docNameCache, setDocNameCache] = useState<Record<string, string>>({})

  // Toast
  const [toasts, setToasts] = useState<Toast[]>([])

  // Polling ref for active jobs
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // ── Toast helpers ──────────────────────────────────────────────────────────

  const addToast = useCallback(
    (title: string, desc: string, type: Toast['type'] = 'success') => {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 9)
      setToasts(prev => [...prev, { id, title, desc, type }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
    },
    []
  )

  // ── Fetch jobs ─────────────────────────────────────────────────────────────

  const fetchJobs = useCallback(async () => {
    if (!activeWorkspace?.id) return
    setLoadingJobs(true)
    setJobsError(null)
    try {
      const res = await fetch(
        `/api/extract?workspace_id=${activeWorkspace.id}`,
        { headers: authHeaders(token) }
      )
      if (!res.ok) throw new Error(`Failed to load jobs (${res.status})`)
      const data: ExtractionJob[] = await res.json()
      setJobs(data)

      // Cache doc names
      const cache: Record<string, string> = {}
      data.forEach(j => {
        if (j.results) {
          // filenames come from doc list fetched separately
        }
      })
      setDocNameCache(prev => ({ ...prev, ...cache }))
    } catch (err: any) {
      setJobsError(err.message)
    } finally {
      setLoadingJobs(false)
    }
  }, [activeWorkspace?.id, token])

  // ── Fetch workspace documents ──────────────────────────────────────────────

  const fetchDocs = useCallback(async () => {
    if (!activeWorkspace?.id) return
    setLoadingDocs(true)
    try {
      const res = await fetch(`/api/documents/${activeWorkspace.id}`, {
        headers: authHeaders(token),
      })
      if (!res.ok) throw new Error()
      const data: BackendDocument[] = await res.json()
      setDocs(data)

      // Build cache
      const cache: Record<string, string> = {}
      data.forEach(d => (cache[d.id] = d.filename))
      setDocNameCache(prev => ({ ...prev, ...cache }))
    } catch {
      // silently ignore
    } finally {
      setLoadingDocs(false)
    }
  }, [activeWorkspace?.id, token])

  // ── Initial load + polling ─────────────────────────────────────────────────

  useEffect(() => {
    fetchJobs()
    fetchDocs()
  }, [fetchJobs, fetchDocs])

  // Poll every 3s while any job is running/queued
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'running' || j.status === 'queued')
    if (hasActive) {
      pollRef.current = setInterval(fetchJobs, 3000)
    } else {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [jobs, fetchJobs])

  // ── Field builder helpers ──────────────────────────────────────────────────

  const addField = () =>
    setFields(prev => [...prev, { name: '', type: 'string' }])

  const updateField = (i: number, patch: Partial<ExtractionField>) =>
    setFields(prev => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))

  const removeField = (i: number) =>
    setFields(prev => prev.filter((_, idx) => idx !== i))

  // ── Submit new job ─────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!activeWorkspace?.id) {
      addToast('No workspace', 'Select a workspace first.', 'danger')
      return
    }
    const validFields = fields.filter(f => f.name.trim() !== '')
    if (validFields.length === 0) {
      addToast('Validation Error', 'Add at least one field with a name.', 'danger')
      return
    }
    if (selectedDocIds.length === 0) {
      addToast('Validation Error', 'Select at least one document.', 'danger')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(token),
        },
        body: JSON.stringify({
          workspace_id: activeWorkspace.id,
          name:
            jobName.trim() ||
            `Extraction — ${new Date().toLocaleDateString('en-GB')}`,
          fields: validFields,
          document_ids: selectedDocIds,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Error ${res.status}`)
      }

      const job: ExtractionJob = await res.json()
      setJobs(prev => [job, ...prev])
      addToast('Job Queued', `"${job.name}" is now processing in the background.`, 'success')

      // Reset form
      setJobName('')
      setFields([{ name: '', type: 'string' }])
      setSelectedDocIds([])
      setActiveTab('jobs')
    } catch (err: any) {
      addToast('Failed to Start', err.message, 'danger')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Delete job ─────────────────────────────────────────────────────────────

  const handleDelete = async (job: ExtractionJob) => {
    if (!confirm(`Delete extraction job "${job.name}"?`)) return
    try {
      const res = await fetch(`/api/extract/${job.id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      })
      if (!res.ok) throw new Error()
      setJobs(prev => prev.filter(j => j.id !== job.id))
      addToast('Deleted', `Removed job "${job.name}".`, 'danger')
    } catch {
      addToast('Error', 'Could not delete job. Try again.', 'danger')
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExport = async (job: ExtractionJob, format: 'csv' | 'json') => {
    try {
      const res = await fetch(`/api/extract/${job.id}/export?format=${format}`, {
        headers: authHeaders(token),
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${job.name}.${format}`
      a.click()
      URL.revokeObjectURL(url)
      addToast('Export Ready', `Downloaded as ${format.toUpperCase()}.`, 'success')
    } catch {
      addToast('Export Failed', 'Could not download results.', 'danger')
    }
  }

  const readyDocs = docs.filter(d => d.status === 'ready')

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto px-6 py-8 animate-fade-in">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black mb-1">Data Extraction</h1>
            <p className="text-sm text-text-subtle">
              Extract structured fields from documents using your workspace&apos;s AI provider
            </p>
            {activeWorkspace && (
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
                <div className="w-2 h-2 rounded-full bg-indigo-400" />
                Workspace: <span className="font-semibold">{activeWorkspace.name}</span>
              </div>
            )}
            {!activeWorkspace && (
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                <AlertCircle className="w-3.5 h-3.5" />
                No workspace selected
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchJobs}
              className="p-2.5 rounded-xl border border-border-strong bg-bg-panel hover:border-border-strong text-text-subtle hover:text-foreground transition-all"
              title="Refresh jobs"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              id="new-extraction-btn"
              onClick={() => setActiveTab('new')}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
            >
              <Plus className="w-4 h-4" /> New extraction
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-bg-panel border border-border-strong rounded-xl w-fit">
          {(['jobs', 'new'] as const).map(tab => (
            <button
              key={tab}
              id={`extraction-tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-bg-hover text-foreground shadow-sm'
                  : 'text-text-subtle hover:text-foreground'
              }`}
            >
              {tab === 'jobs' ? `Extraction Jobs (${jobs.length})` : 'New Extraction'}
            </button>
          ))}
        </div>

        {/* ── Jobs Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'jobs' && (
          <div className="flex flex-col gap-4">
            {loadingJobs && jobs.length === 0 && (
              <div className="flex items-center justify-center py-16 gap-3 text-text-muted">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading extraction jobs…</span>
              </div>
            )}

            {jobsError && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {jobsError}
              </div>
            )}

            {!loadingJobs && jobs.length === 0 && !jobsError && (
              <div className="text-center py-16 border border-dashed border-border-strong rounded-2xl text-text-muted flex flex-col items-center gap-3">
                <Layers className="w-10 h-10 opacity-30" />
                <p className="text-sm">No extraction jobs yet.</p>
                <button
                  onClick={() => setActiveTab('new')}
                  className="mt-1 text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Create your first extraction
                </button>
              </div>
            )}

            {jobs.map(job => {
              const status = STATUS_CONFIG[job.status]
              const progress =
                job.doc_count > 0 ? (job.processed_count / job.doc_count) * 100 : 0

              return (
                <div key={job.id} className="flex flex-col gap-3">
                  <div className="rounded-2xl border border-border-strong bg-bg-input p-5 hover:border-border-strong transition-all group">
                    {/* Top row */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="text-sm font-bold group-hover:text-indigo-300 transition-colors truncate max-w-[250px] sm:max-w-md">
                            {job.name}
                          </h3>
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${status.bg} ${status.color} shrink-0`}
                          >
                            {job.status === 'running' ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <status.icon className="w-3 h-3" />
                            )}
                            {status.label}
                          </span>
                        </div>
                        <div className="text-xs text-text-muted">
                          {job.doc_count} document{job.doc_count !== 1 ? 's' : ''} ·{' '}
                          {job.fields.length} fields ·{' '}
                          {formatRelativeTime(new Date(job.created_at))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                        {job.status === 'completed' && (
                          <>
                            <button
                              id={`export-csv-${job.id}`}
                              onClick={() => handleExport(job, 'csv')}
                              title="Export CSV"
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-hover border border-border-strong hover:border-emerald-500/30 hover:text-emerald-400 text-text-subtle text-[10px] font-medium transition-all"
                            >
                              <Download className="w-3.5 h-3.5" /> CSV
                            </button>
                            <button
                              id={`export-json-${job.id}`}
                              onClick={() => handleExport(job, 'json')}
                              title="Export JSON"
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-hover border border-border-strong hover:border-indigo-500/30 hover:text-indigo-400 text-text-subtle text-[10px] font-medium transition-all"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5" /> JSON
                            </button>
                            <button
                              onClick={() =>
                                setExpandedResults(prev =>
                                  prev === job.id ? null : job.id
                                )
                              }
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600/10 border border-indigo-500/20 hover:bg-indigo-600/20 text-indigo-400 text-[10px] font-medium transition-all"
                            >
                              <Table2 className="w-3.5 h-3.5" />
                              {expandedResults === job.id ? 'Hide' : 'View'} results
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDelete(job)}
                          title="Delete job"
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-text-muted hover:text-red-400 transition-colors ml-auto sm:ml-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Progress bar for running jobs */}
                    {(job.status === 'running' || job.status === 'queued') && (
                      <div className="mb-4 animate-fade-in">
                        <div className="flex justify-between text-xs text-text-muted mb-1.5">
                          <span>
                            {job.status === 'queued'
                              ? 'Waiting in queue…'
                              : 'Processing documents…'}
                          </span>
                          <span>
                            {job.processed_count} / {job.doc_count}
                          </span>
                        </div>
                        <div className="h-1.5 bg-bg-hover rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              job.status === 'queued'
                                ? 'bg-blue-500 w-full animate-pulse'
                                : 'bg-gradient-to-r from-indigo-500 to-violet-500'
                            }`}
                            style={
                              job.status === 'running'
                                ? { width: `${Math.max(5, progress)}%` }
                                : undefined
                            }
                          />
                        </div>
                      </div>
                    )}

                    {/* Fields chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {job.fields.map(f => (
                        <span
                          key={f.name}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-bg-hover border border-border-strong text-[10px] text-text-subtle"
                        >
                          <span className="font-mono text-indigo-400">
                            {TYPE_ICONS[f.type] ?? f.type}
                          </span>
                          {f.name}
                        </span>
                      ))}
                    </div>

                    {/* Completed stats */}
                    {job.status === 'completed' && (
                      <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border-subtle">
                        <div className="text-center">
                          <div className="text-base font-black text-emerald-400">
                            {job.processed_count}
                          </div>
                          <div className="text-[9px] text-text-muted uppercase tracking-wider font-semibold">
                            Processed
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-base font-black text-foreground">
                            {job.fields.length}
                          </div>
                          <div className="text-[9px] text-text-muted uppercase tracking-wider font-semibold">
                            Fields
                          </div>
                        </div>
                        {job.completed_at && (
                          <div className="text-center">
                            <div className="text-base font-black text-foreground">
                              {formatRelativeTime(new Date(job.completed_at))}
                            </div>
                            <div className="text-[9px] text-text-muted uppercase tracking-wider font-semibold">
                              Completed
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Failed error message */}
                    {job.status === 'failed' && job.error_message && (
                      <div className="mt-4 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {job.error_message}
                      </div>
                    )}
                  </div>

                  {/* Inline results table */}
                  {expandedResults === job.id && job.results && (
                    <ResultsTable job={job} docNames={docNameCache} />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── New Extraction Tab ─────────────────────────────────────────── */}
        {activeTab === 'new' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Configuration */}
            <div className="flex flex-col gap-5">

              {/* Job name */}
              <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  Job Name
                </h3>
                <input
                  id="extraction-job-name"
                  type="text"
                  value={jobName}
                  onChange={e => setJobName(e.target.value)}
                  placeholder="e.g. Invoice Extraction — June 2026"
                  className="w-full px-3 py-2.5 rounded-xl border border-border-strong bg-bg-panel text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* Field builder */}
              <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Brain className="w-4 h-4 text-indigo-400" />
                    Fields to Extract
                    <span className="text-[10px] text-text-muted font-normal">
                      {fields.filter(f => f.name).length} configured
                    </span>
                  </h3>
                  <button
                    id="add-field-btn"
                    onClick={addField}
                    className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add field
                  </button>
                </div>

                {fields.length === 0 ? (
                  <div className="text-center py-6 text-xs text-text-muted border border-dashed border-border-strong rounded-xl">
                    No fields yet. Add a field to define the extraction schema.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {fields.map((field, i) => (
                      <FieldRow
                        key={i}
                        field={field}
                        index={i}
                        onChange={updateField}
                        onRemove={removeField}
                      />
                    ))}
                  </div>
                )}

                <div className="mt-4 p-3 rounded-xl bg-bg-panel border border-border-strong">
                  <p className="text-[10px] text-text-muted leading-relaxed">
                    <span className="text-indigo-400 font-semibold">Tip:</span> Be specific with
                    field names. The AI will look for each field by name in the document text and
                    return <span className="text-text-subtle">null</span> if not found.
                  </p>
                </div>
              </div>

              {/* Document picker */}
              <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-400" />
                    Select Documents
                  </h3>
                  <span className="text-xs text-text-muted">
                    {selectedDocIds.length} selected
                  </span>
                </div>

                {loadingDocs && (
                  <div className="flex items-center justify-center py-6 gap-2 text-text-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs">Loading documents…</span>
                  </div>
                )}

                {!loadingDocs && readyDocs.length === 0 && (
                  <div className="text-center py-6 text-xs text-text-muted border border-dashed border-border-strong rounded-xl">
                    No indexed documents yet. Upload and process documents in the{' '}
                    <a href="/dashboard/documents" className="text-indigo-400 hover:text-indigo-300">
                      Documents Library
                    </a>
                    .
                  </div>
                )}

                {!loadingDocs && readyDocs.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() =>
                          setSelectedDocIds(
                            selectedDocIds.length === readyDocs.length
                              ? []
                              : readyDocs.map(d => d.id)
                          )
                        }
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        {selectedDocIds.length === readyDocs.length
                          ? 'Deselect all'
                          : 'Select all'}
                      </button>
                    </div>
                    <div className="flex flex-col gap-1 max-h-52 overflow-y-auto pr-1">
                      {readyDocs.map(doc => (
                        <label
                          key={doc.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all border ${
                            selectedDocIds.includes(doc.id)
                              ? 'border-indigo-500/30 bg-indigo-600/5'
                              : 'border-transparent hover:bg-bg-hover hover:border-border-strong'
                          }`}
                        >
                          <input
                            type="checkbox"
                            id={`doc-select-${doc.id}`}
                            checked={selectedDocIds.includes(doc.id)}
                            onChange={e =>
                              setSelectedDocIds(prev =>
                                e.target.checked
                                  ? [...prev, doc.id]
                                  : prev.filter(id => id !== doc.id)
                              )
                            }
                            className="rounded border-border-strong accent-indigo-500 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate text-foreground">
                              {doc.filename}
                            </div>
                            <div className="text-[10px] text-text-muted">
                              {doc.file_type} · {formatBytes(doc.file_size)} ·{' '}
                              {doc.metadata?.page_count ?? '?'} pages ·{' '}
                              {doc.metadata?.chunk_count ?? '?'} chunks
                            </div>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                            ready
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Run button */}
              <button
                id="run-extraction-btn"
                onClick={handleSubmit}
                disabled={
                  selectedDocIds.length === 0 ||
                  fields.filter(f => f.name.trim()).length === 0 ||
                  submitting ||
                  !activeWorkspace
                }
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Queuing extraction…
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" /> Extract from {selectedDocIds.length || 0}{' '}
                    document{selectedDocIds.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>

            {/* Right: Live schema preview */}
            <div className="rounded-2xl border border-border-strong bg-bg-input p-5 flex flex-col gap-5">
              <div>
                <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Extraction Schema Preview
                </h3>
                <p className="text-xs text-text-muted">
                  Live preview of the JSON schema the AI will use
                </p>
              </div>

              <div className="rounded-xl bg-background border border-border-strong p-4 font-mono text-xs leading-relaxed overflow-x-auto">
                <pre className="text-text-subtle">
                  <span className="text-[#6366F1]">{'{'}</span>
                  {'\n'}
                  {fields
                    .filter(f => f.name.trim())
                    .map((f, i, arr) => (
                      <span key={i}>
                        {'  '}
                        <span className="text-emerald-400">&quot;{f.name}&quot;</span>
                        <span className="text-text-muted">: </span>
                        <span className="text-amber-300">&lt;{f.type}&gt;</span>
                        {i < arr.length - 1 ? ',' : ''}
                        {'\n'}
                      </span>
                    ))}
                  {fields.filter(f => f.name.trim()).length === 0 && (
                    <span className="text-[#3A3A4E] italic">  // Add fields on the left</span>
                  )}
                  {'\n'}
                  <span className="text-[#6366F1]">{'}'}</span>
                </pre>
              </div>

              <div className="rounded-xl bg-bg-panel border border-border-strong p-4">
                <div className="text-xs font-semibold text-text-subtle mb-3 uppercase tracking-wider">
                  How it works
                </div>
                <ol className="flex flex-col gap-2.5">
                  {[
                    {
                      step: '1',
                      title: 'Schema generation',
                      desc: 'Your field definitions are compiled into a JSON schema sent to the AI.',
                    },
                    {
                      step: '2',
                      title: 'Context retrieval',
                      desc: 'Indexed document chunks from ChromaDB are passed as context.',
                    },
                    {
                      step: '3',
                      title: 'Structured extraction',
                      desc: 'The LLM returns a strict JSON object matching your schema.',
                    },
                    {
                      step: '4',
                      title: 'Export',
                      desc: 'Results are stored and downloadable as CSV or JSON.',
                    },
                  ].map(({ step, title, desc }) => (
                    <li key={step} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-[10px] text-indigo-400 flex items-center justify-center shrink-0 font-bold mt-0.5">
                        {step}
                      </div>
                      <div>
                        <div className="text-xs font-semibold">{title}</div>
                        <div className="text-[10px] text-text-muted leading-relaxed">{desc}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className="pointer-events-auto flex gap-3 p-4 rounded-xl border border-border-strong bg-bg-input shadow-2xl w-80 animate-slide-in relative overflow-hidden"
          >
            {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {t.type === 'info' && <Zap className="w-5 h-5 text-indigo-400 shrink-0" />}
            {t.type === 'danger' && <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-foreground truncate">{t.title}</div>
              <div className="text-[10px] text-text-subtle mt-0.5 leading-relaxed">{t.desc}</div>
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="text-text-muted hover:text-foreground shrink-0 self-start transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="absolute left-0 bottom-0 h-0.5 bg-gradient-to-r from-indigo-500 to-violet-500 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
