import Link from 'next/link'
import { ArrowRight, ChevronRight, Brain, Zap, Lock, MessageSquare, FileText, Layers, BarChart3, Shield, Search, CheckCircle } from 'lucide-react'
import { useState } from 'react'

export default function Hero() {
  const [activeDemo, setActiveDemo] = useState('chat')

  return (
<section className="relative pt-28 pb-32 px-6 flex flex-col items-center text-center overflow-hidden\">
        {/* Glow orbs */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-40 left-1/4 w-[300px] h-[300px] bg-violet-600/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute top-40 right-1/4 w-[300px] h-[300px] bg-indigo-600/10 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center max-w-4xl mx-auto">

          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05] mb-6 animate-fade-in">
            The AI brain for
            <br />
            <span className="gradient-text">your enterprise</span>
            <br />
            documents
          </h1>

          <p className="text-lg md:text-xl text-text-subtle max-w-2xl leading-relaxed mb-10 animate-fade-in">
            Ask questions, extract structured data, and search across thousands of contracts, invoices, and reports — with full citation traceability. Built for legal, finance, and operations teams.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 items-center animate-fade-in">
            <Link
              href="/signup"
              id="hero-cta-primary"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-7 py-3.5 rounded-xl transition-all duration-200 shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:scale-95"
            >
              Start for free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/dashboard"
              id="hero-cta-demo"
              className="inline-flex items-center gap-2 text-text-subtle hover:text-foreground font-medium px-6 py-3.5 rounded-xl border border-border-strong hover:border-border-strong transition-all duration-200 hover:bg-bg-hover active:scale-95"
            >
              View live demo
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

        </div>

        {/* Hero Interactive UI mockup */}
        <div className="relative z-10 mt-16 w-full max-w-5xl mx-auto px-2 md:px-0">
          <div className="rounded-2xl border border-border-strong bg-bg-panel overflow-hidden shadow-2xl hover:border-border-strong transition-colors duration-300">
            {/* Window chrome */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 border-b border-border-subtle bg-bg-input gap-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <div className="w-3 h-3 rounded-full bg-green-500/70" />
                <div className="ml-4 flex items-center gap-2 px-3 py-1 rounded bg-background border border-border-strong text-[10px] text-text-muted">
                  <Lock className="w-2.5 h-2.5" />
                  <span>app.documind.ai/dashboard/{activeDemo}</span>
                </div>
              </div>
              
              {/* Interactive Tab Selectors */}
              <div className="flex bg-background border border-border-strong rounded-lg p-0.5 self-center">
                <button
                  onClick={() => setActiveDemo('chat')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    activeDemo === 'chat' ? 'bg-indigo-600 text-white shadow-sm' : 'text-text-subtle hover:text-foreground'
                  }`}
                >
                  💬 Chat Q&A
                </button>
                <button
                  onClick={() => setActiveDemo('extract')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    activeDemo === 'extract' ? 'bg-indigo-600 text-white shadow-sm' : 'text-text-subtle hover:text-foreground'
                  }`}
                >
                  📊 Extraction
                </button>
                <button
                  onClick={() => setActiveDemo('search')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    activeDemo === 'search' ? 'bg-indigo-600 text-white shadow-sm' : 'text-text-subtle hover:text-foreground'
                  }`}
                >
                  🔍 Search
                </button>
              </div>
            </div>

            {/* Simulated Workspace content */}
            <div className="flex h-[400px]">
              {/* Sidebar */}
              <div className="w-48 border-r border-border-subtle bg-bg-panel p-3 flex flex-col gap-1 shrink-0 hidden md:flex">
                <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
                  <div className="w-5 h-5 rounded bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                    <Brain className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-xs font-bold">DocuMind AI</span>
                </div>
                {['Chat & Q&A', 'Documents', 'Extraction', 'Analytics', 'Settings'].map((item, i) => {
                  const isActive = (activeDemo === 'chat' && i === 0) || (activeDemo === 'extract' && i === 2) || (activeDemo === 'search' && i === 1);
                  return (
                    <div key={item} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] cursor-default transition-colors ${
                      isActive ? 'bg-indigo-600/20 text-indigo-300 font-semibold' : 'text-text-muted'
                    }`}>
                      {[MessageSquare, FileText, Layers, BarChart3, Shield][i] && (() => { const Icon = [MessageSquare, FileText, Layers, BarChart3, Shield][i]; return <Icon className="w-3 h-3" /> })()}
                      {item}
                    </div>
                  );
                })}
              </div>

              {/* Dynamic Viewport */}
              <div className="flex-1 flex flex-col bg-background overflow-hidden p-4 animate-fade-in" key={activeDemo}>
                {activeDemo === 'chat' && (
                  <div className="flex-1 flex flex-col justify-between">
                    <div className="flex flex-col gap-3 overflow-y-auto pr-1">
                      <div className="flex justify-end">
                        <div className="bg-indigo-600/20 border border-indigo-500/20 rounded-2xl rounded-tr-sm px-4 py-2 max-w-sm">
                          <p className="text-xs text-indigo-100">Extract the break fee and termination clauses in the TechCorp agreement.</p>
                        </div>
                      </div>
                      <div className="flex gap-2.5 max-w-lg">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 mt-0.5">
                          <Brain className="w-3 h-3 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="bg-bg-input border border-border-strong rounded-2xl rounded-tl-sm px-4 py-2.5">
                            <p className="text-xs text-text-subtle leading-relaxed">
                              Under <strong className="text-foreground">Article 12 (pp. 64–67)</strong>: Failure to cure a material breach within 30 business days results in agreement termination and triggers a <strong className="text-foreground">$2,500,000 break fee</strong> payable by the breaching party.
                            </p>
                          </div>
                          <div className="mt-2 flex gap-1.5">
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-bg-panel border border-border-strong text-[9px] text-indigo-400">
                              <FileText className="w-2.5 h-2.5" /> p. 65
                            </div>
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-400">
                              97% confidence
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Input box */}
                    <div className="pt-2 border-t border-border-subtle">
                      <div className="flex items-center gap-2 bg-bg-input border border-border-strong rounded-lg px-3 py-2">
                        <input className="flex-1 bg-transparent text-xs text-text-muted outline-none" placeholder="Ask another question about this agreement..." readOnly />
                        <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center cursor-pointer">
                          <ArrowRight className="w-3 h-3 text-white" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeDemo === 'extract' && (
                  <div className="flex-1 flex flex-col justify-between overflow-hidden">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-border-subtle">
                      <div>
                        <div className="text-xs font-bold">Batch Key Terms Extraction</div>
                        <div className="text-[10px] text-text-muted">Job: Invoice Extraction — May 2026</div>
                      </div>
                      <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-input border border-border-strong text-[10px] font-bold text-indigo-400 hover:text-foreground transition-colors">
                        <CheckCircle className="w-3 h-3" /> Export CSV
                      </button>
                    </div>
                    {/* Grid */}
                    <div className="flex-1 overflow-x-auto text-[10px] scrollbar-none">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-border-strong text-text-muted uppercase">
                            <th className="py-2">File</th>
                            <th className="py-2">Vendor Name</th>
                            <th className="py-2">Total Amount</th>
                            <th className="py-2">Due Date</th>
                            <th className="py-2">Confidence</th>
                          </tr>
                        </thead>
                        <tbody className="text-text-subtle divide-y divide-border-subtle">
                          <tr>
                            <td className="py-2.5 truncate max-w-[100px]">INV-2026-001.pdf</td>
                            <td className="py-2.5 font-semibold text-foreground">PT Infratech Solutions</td>
                            <td className="py-2.5">Rp 145,000,000</td>
                            <td className="py-2.5">2026-05-31</td>
                            <td className="py-2.5 text-emerald-400">99%</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 truncate max-w-[100px]">INV-2026-002.pdf</td>
                            <td className="py-2.5 font-semibold text-foreground">Acme Supplies Ltd</td>
                            <td className="py-2.5">$12,500</td>
                            <td className="py-2.5">2026-06-02</td>
                            <td className="py-2.5 text-emerald-400">98%</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 truncate max-w-[100px]">INV-2026-003.pdf</td>
                            <td className="py-2.5 font-semibold text-foreground">TechCorp Services</td>
                            <td className="py-2.5">$8,750</td>
                            <td className="py-2.5">2026-06-07</td>
                            <td className="py-2.5 text-emerald-400">96%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-2 p-2 bg-bg-input border border-border-strong rounded-xl flex items-center justify-between text-[9px] text-text-muted">
                      <span>⚡ Status: Completed (500/500 invoices processed)</span>
                      <span>Average Accuracy: 96.7%</span>
                    </div>
                  </div>
                )}

                {activeDemo === 'search' && (
                  <div className="flex-1 flex flex-col justify-between overflow-hidden">
                    <div className="flex items-center gap-2 bg-bg-input border border-border-strong rounded-xl px-3 py-1.5 mb-3">
                      <Search className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="text-xs text-foreground">termination liability limits</span>
                      <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">⚡ Semantic</span>
                    </div>
                    {/* List */}
                    <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-1">
                      <div className="p-2.5 rounded-xl border border-border-strong bg-bg-input hover:border-indigo-500/30 transition-all">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-semibold text-foreground truncate max-w-[150px]">Acquisition_Agreement_TechCorp_v3.pdf</span>
                          <span className="text-[9px] font-bold text-emerald-400">98% match</span>
                        </div>
                        <p className="text-[10px] text-text-subtle leading-relaxed italic">
                          "...maximum aggregate <mark className="bg-indigo-500/20 text-indigo-200 rounded px-0.5">liability for termination</mark> breaches shall not exceed <strong className="text-foreground">$5,000,000</strong>..."
                        </p>
                      </div>
                      <div className="p-2.5 rounded-xl border border-border-strong bg-bg-input">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-semibold text-foreground truncate max-w-[150px]">Software_License_Agreement.docx</span>
                          <span className="text-[9px] font-bold text-emerald-400">84% match</span>
                        </div>
                        <p className="text-[10px] text-text-subtle leading-relaxed italic">
                          "...either party may <mark className="bg-indigo-500/20 text-indigo-200 rounded px-0.5">terminate this Agreement</mark> immediately for breach..."
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
  )}