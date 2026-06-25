'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Brain, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { useTheme } from 'next-themes'
import { axiosClient } from '@/lib/axios-client'
import { useAuthStore } from '@/stores/auth'

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore(state => state.setAuth)
  const { setTheme } = useTheme()
  
  useEffect(() => {
    setTheme('dark')
  }, [setTheme])
  
  const [email, setEmail] = useState('alpha@acme.corp')
  const [password, setPassword] = useState('password123')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    
    try {
      const res = await axiosClient.post('/auth/login', {
        email,
        password,
      })

      const { access_token, user } = res.data
      setAuth(access_token, user)
      
      router.push('/dashboard')
    } catch (err: any) {
      console.error(err)
      setError(
        err.response?.data?.detail || 
        err.response?.data?.error || 
        'Incorrect email or password. Please try again.'
      )
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <Link href="/" className="flex items-center gap-2.5 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight">DocuMind<span className="text-indigo-400"> AI</span></span>
          </Link>
          <h1 className="text-2xl font-black mb-1">Welcome back</h1>
          <p className="text-sm text-[#9090A8]">Sign in to your workspace</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-[#2A2A3A] bg-[#16161F] p-8 shadow-xl">
          {/* Google OAuth */}
          <button
            id="login-google"
            type="button"
            className="w-full flex items-center justify-center gap-3 py-2.5 rounded-xl border border-[#2A2A3A] bg-[#111118] hover:bg-[#1C1C28] hover:border-[#3A3A4E] text-sm font-medium transition-all duration-200 mb-6"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-[#2A2A3A]" />
            <span className="text-xs text-[#5A5A72]">or continue with email</span>
            <div className="flex-1 h-px bg-[#2A2A3A]" />
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[#C4C4D4]">Work email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A5A72]" />
                <input
                  id="login-email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#2A2A3A] bg-[#111118] text-sm text-[#F8F8FF] placeholder:text-[#5A5A72] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[#C4C4D4]">Password</label>
                <Link href="#" className="text-xs text-indigo-400 hover:text-indigo-300">Forgot password?</Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A5A72]" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#2A2A3A] bg-[#111118] text-sm text-[#F8F8FF] placeholder:text-[#5A5A72] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A5A72] hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-70 text-white font-semibold py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-indigo-500/20 mt-2 cursor-pointer"
            >
              {loading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <>Sign in <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-[#5A5A72] mt-6">
          Don't have an account?{' '}
          <Link href="/register" className="text-indigo-400 hover:text-indigo-300 font-medium">
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  )
}
