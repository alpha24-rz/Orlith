import { create } from 'zustand'

export interface User {
  id: string
  email: string
  username?: string | null
  created_at: string
}

interface AuthState {
  token: string | null
  user: User | null
  loading: boolean
  error: string | null
  setAuth: (token: string, user: User) => void
  clearAuth: () => void
  initAuth: () => void
}

const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null
  const nameEQ = name + "="
  const ca = document.cookie.split(';')
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i]
    while (c.charAt(0) === ' ') c = c.substring(1, c.length)
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length)
  }
  return null
}

const setCookie = (name: string, value: string, days = 7) => {
  if (typeof document === 'undefined') return
  const date = new Date()
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000))
  const expires = "; expires=" + date.toUTCString()
  // Secure setting depends on protocol, we make it conditional or lax
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax" + secure
}

const eraseCookie = (name: string) => {
  if (typeof document === 'undefined') return
  document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax'
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  loading: false,
  error: null,
  setAuth: (token, user) => {
    set({ token, user, error: null })
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
    }
    setCookie('token', token, 7)
  },
  clearAuth: () => {
    set({ token: null, user: null, error: null })
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
    }
    eraseCookie('token')
  },
  initAuth: () => {
    if (typeof window === 'undefined') return
    const token = localStorage.getItem('auth_token')
    const userJson = localStorage.getItem('auth_user')
    
    // Sync check with cookies if localStorage got cleared
    const cookieToken = getCookie('token')
    
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson)
        set({ token, user })
        if (!cookieToken) {
          setCookie('token', token, 7)
        }
      } catch (e) {
        console.error("Failed to parse auth user", e)
      }
    } else if (cookieToken) {
      set({ token: cookieToken })
    }
  }
}))
export default useAuthStore
