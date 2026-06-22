import Link from 'next/link'
import { Brain } from 'lucide-react'


export default function Footer() {
  return (
      <footer className="py-12 px-6 border-t border-border-subtle">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Brain className="w-3 h-3 text-white" />
            </div>
            <span className="font-bold text-sm">DocuMind AI</span>
          </div>
          <p className="text-xs text-text-muted">© 2026 DocuMind AI. All rights reserved. Built by Alpha Alfarizi.</p>
          <div className="flex gap-5 text-xs text-text-muted">
            <Link href="#" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Security</Link>
          </div>
        </div>
      </footer>
  )}