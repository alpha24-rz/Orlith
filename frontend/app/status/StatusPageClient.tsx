'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Activity, ArrowLeft, CheckCircle2, XCircle,
  RefreshCw, Globe, Server, Database, Layers
} from 'lucide-react'
import BackendStatus from '@/components/BackendStatus'

interface ServiceRow {
  id: string
  name: string
  description: string
  url: string
  icon: React.ReactNode
}

const SERVICES: ServiceRow[] = [
  {
    id: 'backend',
    name: 'Backend API',
    description: 'FastAPI · Python 3.12 · /health',
    url: '/api/health',
    icon: <Server className="w-4 h-4" />,
  },
  {
    id: 'docs',
    name: 'API Documentation',
    description: 'OpenAPI / Swagger · /docs',
    url: '/api/openapi.json',
    icon: <Globe className="w-4 h-4" />,
  },
]

type SvcStatus = 'checking' | 'up' | 'down'

export default function StatusPageClient() {
  const [svcStatus, setSvcStatus] = useState<Record<string, SvcStatus>>({
    backend: 'checking',
    docs: 'checking',
  })
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const checkAll = async () => {
    setLastRefresh(new Date())
    setSvcStatus({ backend: 'checking', docs: 'checking' })

    await Promise.all(
      SERVICES.map(async (svc) => {
        try {
          const res = await fetch(svc.url, {
            cache: 'no-store',
            signal: AbortSignal.timeout(5000),
          })
          setSvcStatus((prev) => ({ ...prev, [svc.id]: res.ok ? 'up' : 'down' }))
        } catch {
          setSvcStatus((prev) => ({ ...prev, [svc.id]: 'down' }))
        }
      })
    )
  }

  useEffect(() => {
    checkAll()
    const t = setInterval(checkAll, 30_000)
    return () => clearInterval(t)
  }, [])

  const allUp = Object.values(svcStatus).every((s) => s === 'up')
  const anyDown = Object.values(svcStatus).some((s) => s === 'down')

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className={`absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] blur-[120px] opacity-15 rounded-full transition-colors duration-1000 ${
            anyDown ? 'bg-red-600' : allUp ? 'bg-emerald-600' : 'bg-indigo-600'
          }`}
        />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-16">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-foreground transition-colors mb-10"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-400">
              <Activity className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">System Status</h1>
          </div>
          <p className="text-text-subtle text-sm">
            Real-time health of DocuMind AI services.
            Auto-refreshes every 30 seconds.
          </p>
        </div>

        {/* Overall Banner */}
        <div
          className={`flex items-center justify-between rounded-2xl p-5 mb-8 border ${
            anyDown
              ? 'bg-red-500/8 border-red-500/20'
              : allUp
              ? 'bg-emerald-500/8 border-emerald-500/20'
              : 'bg-indigo-500/8 border-indigo-500/20'
          }`}
        >
          <div className="flex items-center gap-3">
            {anyDown ? (
              <XCircle className="w-6 h-6 text-red-400" />
            ) : allUp ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            ) : (
              <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
            )}
            <div>
              <p className="font-semibold text-foreground">
                {anyDown
                  ? 'Some services are down'
                  : allUp
                  ? 'All systems operational'
                  : 'Checking services…'}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                Last refreshed {lastRefresh.toLocaleTimeString()}
              </p>
            </div>
          </div>

          <button
            onClick={checkAll}
            className="p-2 rounded-lg hover:bg-bg-hover text-text-muted hover:text-foreground transition-colors"
            title="Refresh now"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Backend health card (rich detail) */}
        <div className="mb-4">
          <BackendStatus />
        </div>

        {/* Services table */}
        <div className="rounded-2xl border border-border-subtle bg-bg-panel/40 backdrop-blur-sm overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-border-subtle">
            <h2 className="text-sm font-semibold text-foreground">Services</h2>
          </div>
          {SERVICES.map((svc, i) => {
            const s = svcStatus[svc.id]
            return (
              <div
                key={svc.id}
                className={`flex items-center justify-between px-5 py-4 ${
                  i < SERVICES.length - 1 ? 'border-b border-border-subtle' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-text-muted">{svc.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{svc.name}</p>
                    <p className="text-xs text-text-muted">{svc.description}</p>
                  </div>
                </div>

                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                    s === 'up'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : s === 'down'
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-indigo-500/10 text-indigo-400'
                  }`}
                >
                  {s === 'checking' && <RefreshCw className="w-3 h-3 animate-spin" />}
                  {s === 'up' && (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                  )}
                  {s === 'down' && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                  {s === 'up' ? 'Operational' : s === 'down' ? 'Down' : 'Checking'}
                </div>
              </div>
            )
          })}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-xl border border-border-subtle bg-bg-panel/40 hover:bg-bg-hover transition-colors px-4 py-3 text-sm text-text-subtle hover:text-foreground"
          >
            <Layers className="w-4 h-4 text-indigo-400" />
            API Docs (Swagger)
          </a>
          <a
            href="/api/redoc"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-xl border border-border-subtle bg-bg-panel/40 hover:bg-bg-hover transition-colors px-4 py-3 text-sm text-text-subtle hover:text-foreground"
          >
            <Database className="w-4 h-4 text-indigo-400" />
            API Docs (ReDoc)
          </a>
        </div>
      </div>
    </div>
  )
}
