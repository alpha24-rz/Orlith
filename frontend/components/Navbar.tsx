'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
    Brain, ArrowRight, Menu, X, Activity
} from 'lucide-react'
import BackendStatus from './BackendStatus'
import Image from 'next/image'


export default function Navbar() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    return (
        <nav className="fixed top-0 inset-x-0 z-50 glass border-b border-border-subtle">
            <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16 gap-8">
                <Link href="/" className="flex items-center gap-2">
                    <div className="w-7 h-7 relative">
                        <Image
                            src="/logo_dark.svg"
                            alt="DocuMind AI"
                            fill
                            className="object-contain hidden dark:block"
                        />
                        <Image
                            src="/logo_light.svg"
                            alt="DocuMind AI"
                            fill
                            className="object-contain block dark:hidden"
                        />
                    </div>
                </Link>


                <div className="hidden md:flex items-center gap-3">
                    {/* Compact backend status indicator */}
                    <Link
                        href="/status"
                        className="flex items-center gap-1.5 text-xs text-text-subtle hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-bg-hover"
                        title="View system status"
                    >
                        <BackendStatus compact />
                    </Link>
                    <div className="h-4 w-px bg-border-strong" />
                    <Link href="/login" className="text-sm text-text-subtle hover:text-foreground transition-colors px-5 py-2.5">
                        Sign in
                    </Link>
                    <Link href="/signup" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-all duration-200 shadow-lg shadow-indigo-500/20 active:scale-95">
                        Get started free
                        <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </div>

                <button
                    className="md:hidden p-2 text-text-subtle hover:text-foreground"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    id="mobile-menu-toggle"
                >
                    {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
            </div>

            {mobileMenuOpen && (
                <div className="md:hidden px-6 pb-4 flex flex-col gap-3 border-t border-border-subtle pt-4">
                    <div className="flex gap-3 pt-2">
                        <Link href="/login" className="flex-1 text-center text-sm border border-border-strong py-2 rounded-lg text-text-subtle hover:text-foreground transition-colors">Sign in</Link>
                        <Link href="/signup" className="flex-1 text-center text-sm bg-indigo-600 py-2 rounded-lg text-white font-medium">Get started</Link>
                    </div>
                </div>
            )}
        </nav>
    )
}
