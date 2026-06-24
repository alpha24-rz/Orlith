'use client'

import React, { useState, useEffect } from 'react'
import { X, Settings, HelpCircle, Save, ExternalLink } from 'lucide-react'

interface GoogleDriveSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
}

export default function GoogleDriveSettingsModal({ isOpen, onClose, onSave }: GoogleDriveSettingsModalProps) {
  const [clientId, setClientId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setClientId(localStorage.getItem('google_client_id') || '')
      setApiKey(localStorage.getItem('google_api_key') || '')
    }
  }, [isOpen])

  const handleSave = () => {
    localStorage.setItem('google_client_id', clientId.trim())
    localStorage.setItem('google_api_key', apiKey.trim())
    onSave()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-bg-panel border border-border-strong rounded-2xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border-subtle bg-bg-input shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-bold text-foreground font-sans">Pengaturan Google Drive</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-foreground hover:bg-bg-hover rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          <p className="text-xs text-text-subtle leading-relaxed">
            Untuk mengunduh dokumen langsung dari Google Drive, Anda perlu mengkonfigurasi kredensial Google API Project Anda sendiri. Data ini disimpan secara aman dan lokal hanya di browser Anda.
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="client-id" className="block text-[10px] font-bold text-text-subtle uppercase tracking-wider mb-1.5">
                Google Client ID (OAuth 2.0 Client ID)
              </label>
              <input
                id="client-id"
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="xxxxxx-xxxxxxxx.apps.googleusercontent.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border-strong bg-bg-input text-xs text-foreground placeholder:text-text-muted focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label htmlFor="api-key" className="block text-[10px] font-bold text-text-subtle uppercase tracking-wider mb-1.5">
                Google API Key (Browser API Key)
              </label>
              <input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-border-strong bg-bg-input text-xs text-foreground placeholder:text-text-muted focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          {/* Toggle Help */}
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1.5 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold transition-colors mt-2 cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            {showHelp ? 'Sembunyikan Panduan Konfigurasi' : 'Tampilkan Panduan Konfigurasi'}
          </button>

          {showHelp && (
            <div className="rounded-xl border border-indigo-500/10 bg-indigo-500/5 p-4 space-y-3.5 text-xs text-text-subtle animate-fade-in leading-relaxed">
              <div className="font-bold text-foreground">
                Panduan 5 Langkah Konfigurasi Google Cloud Console:
              </div>
              <ol className="list-decimal pl-4 space-y-2">
                <li>
                  Buka{' '}
                  <a 
                    href="https://console.cloud.google.com" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-indigo-400 hover:underline inline-flex items-center gap-0.5"
                  >
                    Google Cloud Console <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  dan buat/pilih sebuah project.
                </li>
                <li>
                  Masuk ke **API & Services** &gt; **Library**, cari dan aktifkan **Google Drive API** dan **Google Picker API**.
                </li>
                <li>
                  Masuk ke **Credentials**:
                  <ul className="list-disc pl-4 mt-1 space-y-1 text-text-muted">
                    <li>Klik **+ Create Credentials** &gt; **API key** untuk mendapatkan API Key Anda.</li>
                    <li>Klik **+ Create Credentials** &gt; **OAuth client ID** (Pilih Application type: *Web application*).</li>
                  </ul>
                </li>
                <li>
                  Pada pengaturan OAuth Client ID, tambahkan asal aplikasi Anda ke **Authorized JavaScript origins**:
                  <code className="block bg-bg-input px-2 py-1 rounded text-text-subtle font-mono text-[10px] mt-1.5 w-fit">
                    http://localhost:3000
                  </code>
                </li>
                <li>
                  Konfigurasi **OAuth consent screen** (pilih User Type: *External*), tambahkan email Anda sebagai *Test users*, dan tambahkan scope <code className="text-indigo-300">.../auth/drive.readonly</code>.
                </li>
              </ol>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border-subtle bg-bg-panel shrink-0 flex items-center justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-text-subtle hover:text-foreground transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button 
            onClick={handleSave}
            disabled={!clientId || !apiKey}
            className={`
              flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white rounded-xl transition-all cursor-pointer
              ${!clientId || !apiKey 
                ? 'bg-indigo-600/50 cursor-not-allowed text-white/50' 
                : 'bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 active:scale-95'}
            `}
          >
            <Save className="w-3.5 h-3.5" />
            Simpan Konfigurasi
          </button>
        </div>
      </div>
    </div>
  )
}
