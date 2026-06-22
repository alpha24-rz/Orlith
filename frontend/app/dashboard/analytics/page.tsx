'use client'

import { useState, useEffect } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { api } from '@/lib/api-client'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts'
import { 
  BarChart3, MessageSquare, Layers, Users, ArrowUp, ArrowDown, 
  Zap, CreditCard, Activity 
} from 'lucide-react'

interface Metric {
  label: string
  value: string
  target: string
  status: string
  trend: string
}

interface UsageTrendPoint {
  date: string
  queries: number
  documents: number
  extractions: number
}

interface TopDocument {
  name: string
  queries: number
  workspace: string
}

interface QueryTopic {
  topic: string
  count: number
  pct: number
}

interface Member {
  id: string
  name: string
  email: string
  role: string
  avatar: string
  queries: number
  docsUploaded: number
  lastActive: string
}

interface AnalyticsData {
  metrics: Metric[]
  usage_trend: UsageTrendPoint[]
  top_documents: TopDocument[]
  query_topics: QueryTopic[]
  members: Member[]
}

const CUSTOM_TOOLTIP_STYLE = {
  contentStyle: { background: '#16161F', border: '1px solid #2A2A3A', borderRadius: '10px', fontSize: '12px' },
  labelStyle: { color: '#9090A8' },
}

const getMetricIcon = (label: string) => {
  if (label.includes('Query Response')) return MessageSquare
  if (label.includes('Extraction')) return Layers
  if (label.includes('Hallucination')) return BarChart3
  return Users
}

export default function AnalyticsPage() {
  const { activeWorkspace } = useWorkspaceStore()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [usageSummary, setUsageSummary] = useState<any>(null)
  const [usageBreakdown, setUsageBreakdown] = useState<any[]>([])
  const [loading, setLoading] = useState(!!activeWorkspace?.id)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!activeWorkspace?.id) {
      return
    }

    let isMounted = true
    const fetchAnalytics = async () => {
      setLoading(true)
      setError(null)
      try {
        const [res, summary, breakdown] = await Promise.all([
          api.getWorkspaceAnalytics(activeWorkspace.id),
          api.getUsageSummary(activeWorkspace.id),
          api.getUsageBreakdown(activeWorkspace.id)
        ])
        if (isMounted) {
          setData(res as AnalyticsData)
          setUsageSummary(summary)
          setUsageBreakdown(breakdown)
        }
      } catch (err) {
        console.error(err)
        if (isMounted) {
          const errMsg = err instanceof Error ? err.message : 'Failed to load analytics data'
          setError(errMsg)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchAnalytics()
    return () => {
      isMounted = false
    }
  }, [activeWorkspace?.id])

  if (loading) {
    return (
      <div className="h-full overflow-y-auto px-6 py-8 animate-pulse">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex items-start justify-between mb-10">
            <div className="space-y-2">
              <div className="h-8 w-48 bg-[#1E1E2E] rounded-lg" />
              <div className="h-4 w-72 bg-[#1E1E2E] rounded-md" />
            </div>
            <div className="h-8 w-28 bg-[#1E1E2E] rounded-xl" />
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rounded-2xl border border-border-strong bg-bg-input p-6 h-36" />
            ))}
          </div>

          <div className="rounded-2xl border border-border-strong bg-bg-input p-5 h-72 mb-6" />
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-64" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6">
        <div className="max-w-md space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-500 mb-2">
            <BarChart3 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold">Failed to load analytics</h3>
          <p className="text-sm text-text-subtle">{error}</p>
          <button
            onClick={() => {
              if (activeWorkspace?.id) {
                setLoading(true)
                setError(null)
                api.getWorkspaceAnalytics(activeWorkspace.id)
                  .then((res) => setData(res as AnalyticsData))
                  .catch(err => setError(err.message || 'Failed to load analytics'))
                  .finally(() => setLoading(false))
              }
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!activeWorkspace) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6">
        <div className="max-w-md space-y-4">
          <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto text-indigo-400 mb-2">
            <BarChart3 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold">No Active Workspace</h3>
          <p className="text-sm text-text-subtle">Please select or create a workspace to view usage analytics.</p>
        </div>
      </div>
    )
  }

  const metrics = data?.metrics || []
  const usageTrend = data?.usage_trend || []
  const topDocuments = data?.top_documents || []
  const queryTopics = data?.query_topics || []
  const members = data?.members || []

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-start justify-between mb-10">
          <div>
            <h1 className="text-2xl font-black mb-1">Analytics</h1>
            <p className="text-sm text-text-subtle">Usage trends, document insights, and performance metrics for <strong className="text-foreground font-semibold">{activeWorkspace.name}</strong></p>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-strong bg-bg-panel text-xs text-text-subtle">
            Last 14 days
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Metric KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {metrics.map((m: Metric) => {
            const IconComponent = getMetricIcon(m.label)
            const isHallucination = m.label.includes('Hallucination')
            const isPositiveTrend = isHallucination
              ? m.trend.startsWith('-')
              : m.trend.startsWith('+')
            return (
              <div key={m.label} className="rounded-2xl border border-border-strong bg-bg-input p-6">
                <div className="flex items-center justify-between mb-3">
                  <IconComponent className="w-4 h-4 text-text-muted" />
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                    isPositiveTrend ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
                  }`}>
                    {m.trend.startsWith('-')
                      ? <ArrowDown className="w-2.5 h-2.5" />
                      : <ArrowUp className="w-2.5 h-2.5" />
                    }
                    {m.trend}
                  </span>
                </div>
                <div className="text-2xl font-black mb-0.5">{m.value}</div>
                <div className="text-xs text-text-muted">{m.label}</div>
                <div className="text-[10px] text-text-muted mt-0.5">Target: {m.target}</div>
              </div>
            )
          })}
        </div>

        {/* Usage area chart */}
        <div className="rounded-2xl border border-border-strong bg-bg-input p-5 mb-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-bold">Platform Usage</h2>
              <p className="text-xs text-text-muted mt-0.5">Queries, documents uploaded, and extractions run</p>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <AreaChart data={usageTrend}>
                <defs>
                  <linearGradient id="queryGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="extractGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
                <XAxis dataKey="date" tick={{ fill: '#5A5A72', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5A5A72', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...CUSTOM_TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="queries" stroke="#6366F1" fill="url(#queryGrad)" strokeWidth={2} name="Queries" />
                <Area type="monotone" dataKey="extractions" stroke="#10B981" fill="url(#extractGrad)" strokeWidth={2} name="Extractions" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-5 mt-3">
            <div className="flex items-center gap-1.5 text-xs text-text-subtle"><div className="w-3 h-0.5 rounded-full bg-indigo-500" /> Queries</div>
            <div className="flex items-center gap-1.5 text-xs text-text-subtle"><div className="w-3 h-0.5 rounded-full bg-emerald-500" /> Extractions</div>
          </div>
        </div>

        {/* AI Cost Analysis Widget */}
        {usageSummary && (
          <div className="space-y-6 mb-6">
            <h2 className="text-base font-black flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-indigo-400" />
              AI Cost & Token Analysis
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Total Estimated Cost</div>
                <div className="text-2xl font-black text-emerald-400">${(usageSummary.summary.total_cost_usd || 0.0).toFixed(4)}</div>
                <div className="text-[10px] text-text-muted mt-1">Based on token rates for RAG, Agents & Research</div>
              </div>
              <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Total Token Count</div>
                <div className="text-2xl font-black text-indigo-300">{(usageSummary.summary.total_tokens || 0).toLocaleString()}</div>
                <div className="text-[10px] text-text-muted mt-1">In: {(usageSummary.summary.prompt_tokens || 0).toLocaleString()} · Out: {(usageSummary.summary.completion_tokens || 0).toLocaleString()}</div>
              </div>
              <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Total API Requests</div>
                <div className="text-2xl font-black text-foreground">{usageSummary.summary.total_calls || 0} calls</div>
                <div className="text-[10px] text-text-muted mt-1">Avg cost per call: ${(usageSummary.summary.total_calls > 0 ? usageSummary.summary.total_cost_usd / usageSummary.summary.total_calls : 0.0).toFixed(4)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Daily cost trend */}
              <div className="rounded-2xl border border-border-strong bg-bg-input p-5 flex flex-col">
                <h3 className="text-xs font-bold mb-3">Daily AI Expenditures</h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <BarChart data={usageBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
                      <XAxis dataKey="date" tick={{ fill: '#5A5A72', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#5A5A72', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip {...CUSTOM_TOOLTIP_STYLE} formatter={(value: any) => [`$${parseFloat(value).toFixed(6)}`, 'Cost']} />
                      <Bar dataKey="cost" fill="#6366F1" radius={[4, 4, 0, 0]} name="Cost (USD)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Models / Provider breakdown */}
              <div className="rounded-2xl border border-border-strong bg-bg-input p-5 flex flex-col justify-between">
                <div className="space-y-4">
                  <h3 className="text-xs font-bold">Cost Breakdown by Model</h3>
                  <div className="space-y-3">
                    {Object.keys(usageSummary.by_model).length === 0 ? (
                      <div className="text-center py-10 text-xs text-text-muted">
                        No active model usage logged yet.
                      </div>
                    ) : (
                      Object.entries(usageSummary.by_model).map(([model, meta]: [string, any]) => (
                        <div key={model} className="flex items-center justify-between text-xs">
                          <div>
                            <span className="font-semibold text-foreground">{model}</span>
                            <span className="text-[10px] text-text-muted block">{(meta.tokens || 0).toLocaleString()} tokens</span>
                          </div>
                          <span className="font-black text-emerald-400">${(meta.cost || 0.0).toFixed(5)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                {Object.keys(usageSummary.by_provider).length > 0 && (
                  <div className="border-t border-border-subtle/60 pt-3 mt-4 flex justify-between text-[10px] text-text-muted">
                    <span>Active providers: {Object.keys(usageSummary.by_provider).join(', ')}</span>
                    <span>Tokens: {(usageSummary.summary.total_tokens || 0).toLocaleString()} total</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Top documents */}
          <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
            <h2 className="text-sm font-bold mb-4">Most Queried Documents</h2>
            <div className="flex flex-col gap-3">
              {topDocuments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-text-muted text-xs">
                  No documents found or queried in this workspace.
                </div>
              ) : (
                topDocuments.map((d: TopDocument, i: number) => {
                  const maxQueries = topDocuments[0]?.queries || 1
                  const pct = maxQueries > 0 ? (d.queries / maxQueries) * 100 : 0
                  return (
                    <div key={d.name} className="flex items-center gap-3">
                      <div className="text-xs font-black text-[#3A3A4E] w-4 shrink-0">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate mb-1" title={d.name}>{d.name}</div>
                        <div className="h-1.5 bg-bg-hover rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-xs text-text-subtle shrink-0 w-12 text-right">{d.queries} q</div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Query topics */}
          <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
            <h2 className="text-sm font-bold mb-4">Query Topics</h2>
            <div className="flex flex-col gap-3">
              {queryTopics.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-text-muted text-xs">
                  No query history data available.
                </div>
              ) : (
                queryTopics.map((t: QueryTopic, i: number) => {
                  const colors = ['#6366F1', '#8B5CF6', '#EC4899', '#10B981', '#F59E0B', '#3B82F6']
                  return (
                    <div key={t.topic} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-foreground/80 truncate">{t.topic}</span>
                          <span className="text-xs text-text-muted shrink-0 ml-2">{t.pct}%</span>
                        </div>
                        <div className="h-1.5 bg-bg-hover rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${t.pct}%`, background: colors[i % colors.length] }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* User activity */}
        <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
          <h2 className="text-sm font-bold mb-4">User Activity</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="pb-3 text-left text-text-muted font-semibold uppercase tracking-wider">User</th>
                  <th className="pb-3 text-left text-text-muted font-semibold uppercase tracking-wider">Role</th>
                  <th className="pb-3 text-right text-text-muted font-semibold uppercase tracking-wider">Queries</th>
                  <th className="pb-3 text-right text-text-muted font-semibold uppercase tracking-wider">Docs uploaded</th>
                  <th className="pb-3 text-right text-text-muted font-semibold uppercase tracking-wider">Last active</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m: Member, i: number) => (
                  <tr key={m.id} className={`${i < members.length - 1 ? 'border-b border-border-subtle' : ''}`}>
                    <td className="py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center text-[10px] font-bold text-indigo-300">
                          {m.avatar}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{m.name}</div>
                          <div className="text-[10px] text-text-muted">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-text-subtle">{m.role}</td>
                    <td className="py-3 text-right text-text-subtle">{m.queries}</td>
                    <td className="py-3 text-right text-text-subtle">{m.docsUploaded}</td>
                    <td className="py-3 text-right text-text-muted">{m.lastActive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
