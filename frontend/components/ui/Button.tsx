import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all cubic-bezier(0.34, 1.56, 0.64, 1) duration-300 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 active:scale-[0.98] hover:-translate-y-[1px] disabled:opacity-50 disabled:pointer-events-none'

    const variants = {
      primary: 'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/25',
      secondary: 'bg-bg-panel hover:bg-bg-hover border border-border-strong text-foreground shadow-sm',
      ghost: 'hover:bg-bg-hover text-text-subtle hover:text-foreground',
      danger: 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/10 hover:shadow-red-500/25',
      outline: 'border border-indigo-500/50 hover:border-indigo-500 text-indigo-500 dark:text-indigo-400 hover:bg-indigo-500/10',
    }

    const sizes = {
      sm: 'px-3 py-2 text-sm',
      md: 'px-5 py-2.5 text-sm',
      lg: 'px-7 py-3 text-base',
    }

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export { Button }
