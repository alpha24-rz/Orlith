import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import { useWorkspaceStore } from '@/stores/workspace'

const API_URL = '/api' // Uses Next.js local proxy to avoid CORS

export const axiosClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request Interceptor: Attach JWT token if available
axiosClient.interceptors.request.use(
  (config) => {
    // Get token from Zustand store (or fallback to localStorage in browser)
    const token = useAuthStore.getState().token || (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null)
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response Interceptor: Automatically handle token expiration or invalidation (401 Unauthorized)
axiosClient.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth store state and credentials cookie
      useAuthStore.getState().clearAuth()
      
      if (typeof window !== 'undefined' && window.location.pathname !== '/' && !window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
        useWorkspaceStore.getState().clearWorkspace()
        window.location.href = '/'
      }
    }
    return Promise.reject(error)
  }
)

export default axiosClient
