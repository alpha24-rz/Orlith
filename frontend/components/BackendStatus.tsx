'use client'

import { useEffect, useState, useCallback } from 'react'
import { CheckCircle2, XCircle, RefreshCw, Wifi, WifiOff, Clock, Server, Cpu } from 'lucide-react'
import BackendUrlSettings from './BackendUrlSettings'
import { BACKEND_URL_CHANGED_EVENT } from '@/lib/backend-url'

interface HealthData {
  status: string
  service: string
  version: string
  environment: string
  timestamp: string
  gpu?: {
    name: string
    memory_used_gb: number
    memory_total_gb: number
  } | null
}

type ConnectionStatus = 'checking' | 'connected' | 'error'

interface BackendStatusProps {
  /** If true, shows a compact inline badge instead of full card */
  compact?: boolean
}

export default function BackendStatus({ compact = false }: BackendStatusProps) {
  const [status, setStatus] = useState<ConnectionStatus>('checking')
  const [health, setHealth] = useState<HealthData | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkHealth = useCallback(async () => {
    const start = performance.now()

    try {
      // Uses the Next.js /api proxy → rewrites to backend /health
      // (or the runtime backend override, e.g. a Colab tunnel URL)
      const res = await fetch('/api/health', {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      })

      const elapsed = Math.round(performance.now() - start)
      setLatency(elapsed)
      setLastChecked(new Date())

      if (res.ok) {
        const data: HealthData = await res.json()
        setHealth(data)
        setError(null)
        setStatus('connected')
      } else {
        setError(`HTTP ${res.status}: ${res.statusText}`)
        setStatus('error')
      }
    } catch (err: unknown) {
      setLatency(null)
      setLastChecked(new Date())
      const errMsg = err instanceof Error ? err.message : 'Network error — backend may be down'
      setError(errMsg)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    // Initial fetch deferred to avoid synchronous setState during effect mount
    const timer = setTimeout(() => {
      void checkHealth()
    }, 0)

    // Re-check every 30 seconds
    const interval = setInterval(() => {
      setStatus('checking')
      void checkHealth()
    }, 30_000)

    const handleUrlChange = () => {
      setStatus('checking')
      void checkHealth()
    }

    // Re-check immediately when the backend URL is switched at runtime
    window.addEventListener(BACKEND_URL_CHANGED_EVENT, handleUrlChange)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
      window.removeEventListener(BACKEND_URL_CHANGED_EVENT, handleUrlChange)
    }
  }, [checkHealth])

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        {status === 'checking' && (
          <>
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            <span className="text-text-subtle">Connecting…</span>
          </>
        )}
        {status === 'connected' && (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-emerald-400">Backend connected</span>
            {latency !== null && (
              <span className="text-text-muted">{latency}ms</span>
            )}
          </>
        )}
        {status === 'error' && (
          <>
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-red-400">Backend unreachable</span>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-bg-panel/80 backdrop-blur-sm p-6 shadow-sm">
      {/* Glow */}
      <div
        className={`absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none transition-colors duration-700 ${
          status === 'connected'
            ? 'bg-emerald-500'
            : status === 'error'
            ? 'bg-red-500'
            : 'bg-indigo-500'
        }`}
      />

      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-500 ${
              status === 'connected'
                ? 'bg-emerald-500/15 text-emerald-400'
                : status === 'error'
                ? 'bg-red-500/15 text-red-400'
                : 'bg-indigo-500/15 text-indigo-400'
            }`}
          >
            {status === 'connected' ? (
              <Wifi className="w-5 h-5" />
            ) : status === 'error' ? (
              <WifiOff className="w-5 h-5" />
            ) : (
              <RefreshCw className="w-5 h-5 animate-spin" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm">Backend Connection</h3>
            <p className="text-xs text-text-muted mt-0.5">FastAPI · Python 3.12</p>
          </div>
        </div>

        <button
          onClick={checkHealth}
          disabled={status === 'checking'}
          className="p-2 rounded-lg hover:bg-bg-hover text-text-muted hover:text-foreground transition-colors disabled:opacity-40"
          title="Re-check connection"
        >
          <RefreshCw className={`w-4 h-4 ${status === 'checking' ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Status Badge */}
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-5 ${
          status === 'connected'
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : status === 'error'
            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
        }`}
      >
        {status === 'connected' && <CheckCircle2 className="w-3 h-3" />}
        {status === 'error' && <XCircle className="w-3 h-3" />}
        {status === 'checking' && <RefreshCw className="w-3 h-3 animate-spin" />}
        {status === 'connected' ? 'Healthy' : status === 'error' ? 'Unreachable' : 'Checking…'}
      </div>

      {/* Metrics Grid */}
      {status === 'connected' && health && (
        <div className="grid grid-cols-2 gap-3">
          <Metric icon={<Server className="w-3.5 h-3.5" />} label="Service" value={health.service} />
          <Metric icon={<Clock className="w-3.5 h-3.5" />} label="Latency" value={latency !== null ? `${latency}ms` : '—'} />
          <Metric icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Version" value={`v${health.version}`} />
          <Metric icon={<Wifi className="w-3.5 h-3.5" />} label="Environment" value={health.environment} />
          {health.gpu && (
            <div className="col-span-2">
              <Metric
                icon={<Cpu className="w-3.5 h-3.5" />}
                label="GPU"
                value={`${health.gpu.name} · ${health.gpu.memory_used_gb.toFixed(1)} / ${health.gpu.memory_total_gb.toFixed(1)} GB`}
              />
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {status === 'error' && error && (
        <div className="text-xs text-red-400/80 bg-red-500/5 border border-red-500/15 rounded-lg p-3 font-mono break-all">
          {error}
        </div>
      )}

      {/* Last Checked */}
      {lastChecked && (
        <p className="text-[11px] text-text-muted mt-4">
          Last checked {lastChecked.toLocaleTimeString()}
        </p>
      )}

      {/* Runtime backend URL (e.g. Google Colab tunnel) */}
      <BackendUrlSettings />
    </div>
  )
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="bg-bg-input rounded-xl p-3 border border-border-subtle">
      <div className="flex items-center gap-1.5 text-text-muted text-[10px] uppercase tracking-widest mb-1">
        {icon}
        {label}
      </div>
      <p className="text-foreground text-sm font-medium truncate">{value}</p>
    </div>
  )
}
