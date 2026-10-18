/**
 * Runtime backend URL resolution.
 *
 * By default the browser talks to the backend through the Next.js `/api`
 * rewrite proxy (configured at build/start time from BACKEND_URL /
 * NEXT_PUBLIC_API_URL). That is fine for a fixed server, but a Google Colab
 * backend gets a NEW Cloudflare URL every session, and rewrites only change
 * after restarting Next.js.
 *
 * To avoid that, a user can set a runtime override (stored in localStorage):
 *   - from the UI (Status page / Settings → Backend Server), or
 *   - by opening the app with `?backend=https://xxxx.trycloudflare.com`
 *     (the Colab notebook prints this link).
 *
 * When an override is active, every browser request to `/api/...` is sent
 * directly to `<override>/...` instead (see installBackendFetchOverride).
 * The backend allows CORS `*` and auth uses a Bearer header, so this works
 * without cookies.
 */

const STORAGE_KEY = 'orlith_backend_url'
export const BACKEND_URL_CHANGED_EVENT = 'orlith:backend-url-changed'

const DEFAULT_DIRECT_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const isBrowser = () => typeof window !== 'undefined'

/** Normalises user input: trims, adds https:// if missing, strips trailing slashes. */
export function normalizeBackendUrl(input: string): string {
  let url = input.trim()
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  return url.replace(/\/+$/, '')
}

/** Returns the runtime override URL, or null when using the default proxy. */
export function getBackendOverride(): string | null {
  if (!isBrowser()) return null
  try {
    return localStorage.getItem(STORAGE_KEY) || null
  } catch {
    return null
  }
}

/** Sets (or clears, when empty/null) the runtime override URL. */
export function setBackendOverride(url: string | null): void {
  if (!isBrowser()) return
  const normalized = url ? normalizeBackendUrl(url) : ''
  try {
    if (normalized) localStorage.setItem(STORAGE_KEY, normalized)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // localStorage unavailable (private mode) — nothing to persist
  }
  window.dispatchEvent(new CustomEvent(BACKEND_URL_CHANGED_EVENT, { detail: normalized || null }))
}

/** Base URL for browser API calls: the override, or the `/api` proxy. */
export function getApiBase(): string {
  return getBackendOverride() ?? '/api'
}

/** Builds a browser URL for a backend path, e.g. apiUrl('/documents/1/download'). */
export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${getApiBase()}${p}`
}

/** Absolute backend URL (no proxy) — used for uploads that bypass the proxy. */
export function getDirectBackendUrl(): string {
  return getBackendOverride() ?? DEFAULT_DIRECT_URL
}

/** WebSocket base (ws:// or wss://) pointing directly at the backend. */
export function getWsBase(): string {
  const override = getBackendOverride()
  if (override) return override.replace(/^http/i, 'ws')
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL.replace(/^http/i, 'ws')
  if (isBrowser()) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return process.env.NODE_ENV === 'development'
      ? `${protocol}//localhost:8000`
      : `${protocol}//${window.location.host}`
  }
  return 'ws://localhost:8000'
}

/** Rewrites a same-origin `/api/...` URL to the override target (or returns null). */
function rewriteApiUrl(url: string): string | null {
  const override = getBackendOverride()
  if (!override) return null
  if (url.startsWith('/api/') || url === '/api') return override + url.slice(4)
  const origin = window.location.origin
  if (url.startsWith(`${origin}/api/`)) return override + url.slice(origin.length + 4)
  return null
}

let fetchPatched = false

/**
 * Patches window.fetch once so existing `fetch('/api/...')` calls across the
 * app follow the runtime override without touching every call site.
 * Also reads `?backend=` from the current URL.
 */
export function installBackendFetchOverride(): void {
  if (!isBrowser() || fetchPatched) return
  fetchPatched = true

  // Accept ?backend=https://xxxx.trycloudflare.com (printed by the Colab notebook)
  try {
    const params = new URLSearchParams(window.location.search)
    const fromQuery = params.get('backend')
    if (fromQuery !== null) {
      setBackendOverride(fromQuery === 'default' ? null : fromQuery)
      params.delete('backend')
      const qs = params.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`)
    }
  } catch {
    // ignore malformed URLs
  }

  const originalFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') {
      const rewritten = rewriteApiUrl(input)
      if (rewritten) return originalFetch(rewritten, init)
    } else if (input instanceof URL) {
      const rewritten = rewriteApiUrl(input.href)
      if (rewritten) return originalFetch(rewritten, init)
    } else if (input instanceof Request) {
      const rewritten = rewriteApiUrl(input.url)
      if (rewritten) return originalFetch(new Request(rewritten, input), init)
    }
    return originalFetch(input, init)
  }
}
