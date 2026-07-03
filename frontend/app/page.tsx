"use client"

import { useState, useEffect } from "react"
import { Eye, EyeOff, ArrowRight, User } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import Prism from "@/components/Prism"
import { useAuthStore } from "@/stores/auth"
import { axiosClient } from "@/lib/axios-client"

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [agreedToTerms, setAgreedToTerms] = useState(true)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [mounted, setMounted] = useState(false)
  console.log("HELLO FROM CLIENT", { mounted })
  const [isTransitioning, setIsTransitioning] = useState(false)

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const setAuth = useAuthStore((state) => state.setAuth)
  const { setTheme } = useTheme()

  useEffect(() => {
    setTheme("dark")
  }, [setTheme])

  const handleDemoAccess = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await axiosClient.post('/auth/demo')
      const { access_token, user } = res.data
      setAuth(access_token, user)
      router.push('/dashboard/chat')
    } catch (err: any) {
      console.error(err)
      setError(
        err.response?.data?.detail ||
        err.response?.data?.error ||
        'Failed to access as Guest. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const slides = [
    {
      src: "/images/slides/slide_1.png",
      title: "Document Intelligence,",
      subtitle: "Elevated by AI",
    },
    {
      src: "/images/slides/slide_2.png",
      title: "Semantic Search,",
      subtitle: "Beyond Keywords",
    },
    {
      src: "/images/slides/slide_3.png",
      title: "Actionable Insights,",
      subtitle: "Extracted Instantly",
    }
  ]

  useEffect(() => {
    setMounted(true)
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const handleModeSwitch = () => {
    setIsTransitioning(true)
    setError(null)
    setTimeout(() => {
      setIsSignUp(!isSignUp)
      setTimeout(() => {
        setIsTransitioning(false)
      }, 50)
    }, 150)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (isSignUp) {
        if (!agreedToTerms) {
          setError("You must agree to the Terms & Conditions")
          setLoading(false)
          return
        }

        const username = `${firstName} ${lastName}`.trim()
        const payload = {
          email,
          password,
          ...(username && { username }),
        }

        await axiosClient.post('/auth/register', payload)

        // Auto switch to login with success message
        setIsSignUp(false)
        setError("Registration successful! Please sign in.")
      } else {
        const res = await axiosClient.post('/auth/login', {
          email,
          password,
        })

        const { access_token, user } = res.data
        setAuth(access_token, user)
        router.push('/dashboard/chat')
      }
    } catch (err: any) {
      console.error(err)
      setError(
        err.response?.data?.detail ||
        err.response?.data?.error ||
        (isSignUp ? 'Registration failed. Please try again.' : 'Incorrect email or password. Please try again.')
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground flex items-center justify-center p-4 relative overflow-hidden">
      {/* Prism Background */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-80 mix-blend-screen">
        <Prism
          animationType="3drotate"
          transparent={true}
          noise={0.15}
          glow={0.8}
          scale={3.6}
        />
      </div>

      <div
        className={`relative z-10 w-full max-w-4xl bg-bg-panel/70 backdrop-blur-2xl border border-border-subtle rounded-3xl overflow-hidden flex flex-col lg:flex-row shadow-2xl shadow-purple-500/10 transition-all duration-700 ease-out ${mounted ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
      >
        {/* Left Panel */}
        <div className="lg:w-[45%] bg-bg-sidebar p-5 flex flex-col">
          {/* Header */}
          <div
            className={`flex items-center justify-between mb-4 transition-all duration-500 delay-200 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
              }`}
          >
            <div className="text-foreground text-xl font-bold tracking-wider flex gap-2">
              <img className="w-6" src="./logo_dark.svg" alt="" />
              <span className="bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">ORLITH</span>
            </div>
          </div>

          {/* Image Container */}
          <div
            className={`flex-1 relative rounded-2xl overflow-hidden min-h-[260px] transition-all duration-700 delay-300 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
          >
            {slides.map((slide, index) => (
              <div
                key={index}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${currentSlide === index ? "opacity-100 z-10" : "opacity-0 z-0"
                  }`}
              >
                <Image
                  src={slide.src}
                  alt={slide.title}
                  fill
                  className="object-cover opacity-60"
                  unoptimized
                  priority={index === 0}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-bg-sidebar via-bg-sidebar/20 to-transparent" />

                {/* Text Overlay */}
                <div
                  className={`absolute bottom-6 left-0 right-0 text-center px-4 transition-all duration-700 delay-300 ${currentSlide === index ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                    }`}
                >
                  <h2 className="text-white text-xl font-semibold leading-tight tracking-tight">
                    {slide.title}
                    <br />
                    {slide.subtitle}
                  </h2>
                </div>
              </div>
            ))}
          </div>

          {/* Carousel Dots */}
          <div
            className={`flex items-center justify-center gap-1.5 mt-4 transition-all duration-500 delay-[600ms] ${mounted ? "opacity-100" : "opacity-0"
              }`}
          >
            {[0, 1, 2].map((index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`h-0.5 rounded-full transition-all duration-300 ${currentSlide === index
                  ? "w-6 bg-white"
                  : "w-3 bg-white/20 hover:bg-white/40"
                  }`}
              />
            ))}
          </div>
        </div>

        {/* Right Panel - Form */}
        <div className="lg:w-[55%] p-6 lg:p-8 flex flex-col justify-center">
          <div className={`transition-all duration-300 ease-out ${isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"}`}>
            <h1
              className={`text-foreground text-2xl lg:text-3xl font-bold mb-1 tracking-tight transition-all duration-500 delay-300 ${mounted ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
                }`}
            >
              {isSignUp ? "Create an account" : "Welcome back"}
            </h1>
            <p
              className={`text-text-muted text-sm mb-6 transition-all duration-500 delay-[350ms] ${mounted ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
                }`}
            >
              {isSignUp ? "Already have an account? " : "Don't have an account? "}
              <button
                onClick={handleModeSwitch}
                type="button"
                className="text-text-subtle underline underline-offset-2 hover:text-purple-400 transition-colors duration-300"
              >
                {isSignUp ? "Log in" : "Sign up"}
              </button>
            </p>
          </div>

          <form className="space-y-3" onSubmit={handleSubmit}>
            {error && (
              <div
                className={`transition-all duration-500 delay-[380ms] p-3 rounded-xl text-sm font-medium ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"} ${error.includes("successful") ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}
              >
                {error}
              </div>
            )}

            {/* Name Fields - Animated Height */}
            <div
              className={`grid transition-all duration-400 ease-out overflow-hidden ${isSignUp ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
            >
              <div className="overflow-hidden">
                <div
                  className={`grid grid-cols-2 gap-3 pb-3 transition-all duration-500 delay-[400ms] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                    }`}
                >
                  <input
                    type="text"
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-bg-input border border-border-strong rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all duration-300"
                    required={isSignUp}
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-bg-input border border-border-strong rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all duration-300"
                  />
                </div>
              </div>
            </div>

            <div
              className={`transition-all duration-500 delay-[450ms] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
            >
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-bg-input border border-border-strong rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all duration-300"
                required
              />
            </div>

            <div
              className={`relative transition-all duration-500 delay-[500ms] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
            >
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-bg-input border border-border-strong rounded-xl px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all duration-300"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-foreground transition-colors duration-300"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Terms Checkbox - Animated */}
            <div
              className={`grid transition-all duration-400 ease-out overflow-hidden ${isSignUp ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
            >
              <div className="overflow-hidden">
                <label
                  className={`flex items-center gap-2.5 cursor-pointer py-1 transition-all duration-500 delay-[550ms] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                    }`}
                >
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center transition-all duration-300 ${agreedToTerms
                        ? "bg-purple-500 shadow-lg shadow-purple-500/30"
                        : "border border-border-strong bg-transparent"
                        }`}
                    >
                      <svg
                        className={`w-2.5 h-2.5 text-white transition-all duration-300 ${agreedToTerms ? "opacity-100 scale-100" : "opacity-0 scale-50"
                          }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  </div>
                  <span className="text-text-muted text-xs">
                    I agree to the{" "}
                    <a href="#" className="text-purple-400 underline underline-offset-2 hover:text-purple-300 transition-colors duration-300">
                      Terms & Conditions
                    </a>
                  </span>
                </label>
              </div>
            </div>

            <div
              className={`transition-all duration-500 delay-[600ms] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
            >
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center h-[44px] bg-purple-500 hover:bg-purple-400 disabled:opacity-70 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all duration-300 text-sm shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:-translate-y-0.5 active:translate-y-0 active:shadow-purple-500/20"
              >
                {loading ? (
                  <svg className="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <span className={`inline-block transition-all duration-300 ${isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"}`}>
                    {isSignUp ? "Create account" : "Sign in"}
                  </span>
                )}
              </button>
            </div>
          </form>

          {/* Divider */}
          <div
            className={`flex items-center gap-3 my-5 transition-all duration-500 delay-[650ms] ${mounted ? "opacity-100" : "opacity-0"
              }`}
          >
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <span className={`text-text-muted text-xs transition-all duration-300 ${isTransitioning ? "opacity-0" : "opacity-100"}`}>
              {isSignUp ? "Or register with" : "Or sign in with"}
            </span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>

          {/* Social Buttons */}
          <div
            className={`grid grid-cols-2 gap-3 transition-all duration-500 delay-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
          >
            <button type="button" className="flex items-center justify-center gap-2 bg-bg-input border border-border-strong hover:border-border-subtle hover:bg-bg-hover text-foreground text-sm py-2.5 rounded-xl transition-all duration-300 group hover:scale-[1.02] active:scale-100">
              <svg className="w-4 h-4 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="text-text-subtle group-hover:text-foreground transition-colors duration-300">Google</span>
            </button>
            <button
              type="button"
              onClick={handleDemoAccess}
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-bg-input border border-border-strong hover:border-purple-500/50 hover:bg-purple-500/5 text-foreground text-sm py-2.5 rounded-xl transition-all duration-300 group hover:scale-[1.02] active:scale-100 disabled:opacity-50"
            >
              <User className="w-4 h-4 text-purple-400 transition-transform duration-300 group-hover:scale-110" />
              <span className="text-text-subtle group-hover:text-foreground transition-colors duration-300">Akses Tanpa Login</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
