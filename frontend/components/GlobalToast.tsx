'use client'

import { useToastStore } from '@/stores/toast'
import { CheckCircle2, AlertCircle, Info, XCircle, X } from 'lucide-react'

export default function GlobalToast() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const icons = {
          success: <CheckCircle2 className="w-5 h-5 text-green-400" />,
          error: <XCircle className="w-5 h-5 text-red-400" />,
          warning: <AlertCircle className="w-5 h-5 text-yellow-400" />,
          info: <Info className="w-5 h-5 text-blue-400" />
        }

        const borderColors = {
          success: 'border-green-500/20',
          error: 'border-red-500/20',
          warning: 'border-yellow-500/20',
          info: 'border-blue-500/20'
        }

        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 p-4 bg-bg-panel border ${borderColors[toast.variant]} rounded-xl shadow-2xl pointer-events-auto animate-fade-in`}
          >
            <div className="shrink-0 mt-0.5">{icons[toast.variant]}</div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground">{toast.title}</h4>
              {toast.description && (
                <p className="text-xs text-text-subtle mt-1">{toast.description}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 text-text-muted hover:text-foreground transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
