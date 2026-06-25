'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Brain, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { useTheme } from 'next-themes'
import { axiosClient } from '@/lib/axios-client'
import { useAuthStore } from '@/stores/auth'

export default function RegisterPage() {
  const router = useRouter()
  const setAuth = useAuthStore(state => state.setAuth)
  const { setTheme } = useTheme()
  
  useEffect(() => {
    setTheme('dark')
  }, [setTheme])
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    // Client-side validations
    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      // 1. Register user
      await axiosClient.post('/auth/register', {
        email,
        password,
      })

      // 2. Automatically log in after registration
      const loginRes = await axiosClient.post('/auth/login', {
        email,
        password,
      })

      const { access_token, user } = loginRes.data
      setAuth(access_token, user)

      // 3. Redirect to dashboard
      router.push('/dashboard')
    } catch (err: any) {
      console.error(err)
      setError(
        err.response?.data?.detail || 
        err.response?.data?.error || 
        'Registration failed. Please check your credentials and try again.'
      )
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-600/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <Link href="/" className="flex items-center gap-2.5 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight">DocuMind<span className="text-indigo-400"> AI</span></span>
          </Link>
          <h1 className="text-2xl font-black mb-1">Create your account</h1>
          <p className="text-sm text-[#9090A8]">Get started with DocuMind AI today</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-[#2A2A3A] bg-[#16161F] p-8 shadow-xl">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[#C4C4D4]">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A5A72]" />
                <input
                  id="register-email"
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
              <label className="text-sm font-medium text-[#C4C4D4]">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A5A72]" />
                <input
                  id="register-password"
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
              <p className="text-[11px] text-[#5A5A72] mt-0.5">Must be at least 8 characters</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[#C4C4D4]">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A5A72]" />
                <input
                  id="register-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#2A2A3A] bg-[#111118] text-sm text-[#F8F8FF] placeholder:text-[#5A5A72] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
                  required
                />
              </div>
            </div>

            <button
              id="register-submit"
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-70 text-white font-semibold py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-indigo-500/20 mt-4 cursor-pointer"
            >
              {loading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <>Sign up <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-[#5A5A72] mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
