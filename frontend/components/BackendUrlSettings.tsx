'use client'

import { useEffect, useState } from 'react'
import { Link2, Check, RotateCcw } from 'lucide-react'
import {
  BACKEND_URL_CHANGED_EVENT,
  getBackendOverride,
  normalizeBackendUrl,
  setBackendOverride,
} from '@/lib/backend-url'

/**
 * Lets the user point the app at a different backend at runtime
 * (e.g. the Cloudflare URL printed by the Google Colab notebook).
 */
export default function BackendUrlSettings() {
  const [current, setCurrent] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const sync = () => {
      const url = getBackendOverride()
      setCurrent(url)
      setValue(url ?? '')
    }
    sync()
    window.addEventListener(BACKEND_URL_CHANGED_EVENT, sync)
    return () => window.removeEventListener(BACKEND_URL_CHANGED_EVENT, sync)
  }, [])

  const normalized = normalizeBackendUrl(value)
  const isDirty = normalized !== (current ?? '')

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    setBackendOverride(normalized || null)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const reset = () => {
    setBackendOverride(null)
    setValue('')
  }

  return (
    <form onSubmit={save} className="mt-5 pt-5 border-t border-border-subtle">
      <label htmlFor="backend-url-input" className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-text-muted mb-2">
        <Link2 className="w-3.5 h-3.5" />
        Backend Server URL
      </label>
      <div className="flex gap-2">
        <input
          id="backend-url-input"
          type="url"
          inputMode="url"
          spellCheck={false}
          placeholder="https://xxxx.trycloudflare.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 min-w-0 bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition"
        />
        <button
          id="backend-url-save"
          type="submit"
          disabled={!isDirty && !saved}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 hover:bg-indigo-500/25 disabled:opacity-40 transition-colors"
        >
          {saved ? <Check className="w-3.5 h-3.5" /> : null}
          {saved ? 'Saved' : 'Connect'}
        </button>
        {current && (
          <button
            id="backend-url-reset"
            type="button"
            onClick={reset}
            title="Use the default backend (Next.js proxy)"
            className="p-2 rounded-lg border border-border-subtle text-text-muted hover:text-foreground hover:bg-bg-hover transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-[11px] text-text-muted mt-2 leading-relaxed">
        {current
          ? <>Requests go directly to <span className="font-mono text-foreground/80 break-all">{current}</span>.</>
          : <>Using the default backend via the <span className="font-mono">/api</span> proxy. Paste the URL from the Colab notebook to switch.</>}
      </p>
    </form>
  )
}
