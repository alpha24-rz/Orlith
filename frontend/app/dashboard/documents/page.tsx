'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import Link from 'next/link'
import { formatBytes, formatRelativeTime } from '@/lib/utils'
import { Document, DocumentStatus } from '@/lib/types'
import { api } from '@/lib/api-client'
import { useWorkspaceStore } from '@/stores/workspace'
import {
  FileText, Upload, Search, Filter, MoreVertical,
  CheckCircle2, Clock, XCircle, Trash2, Download,
  MessageSquare, Tag, ChevronDown, AlertCircle,
  X, FileSpreadsheet, RefreshCw, Zap, Settings
} from 'lucide-react'
import GoogleDriveSettingsModal from '@/components/GoogleDriveSettingsModal'

interface Toast {
  id: string
  title: string
  desc: string
  type: 'success' | 'info' | 'danger'
}

const FILE_TYPE_ICONS: Record<string, React.ReactNode> = {
  PDF: <div className="text-[10px] font-black text-red-400">PDF</div>,
  DOCX: <div className="text-[10px] font-black text-blue-400">DOC</div>,
  XLSX: <div className="text-[10px] font-black text-emerald-400">XLS</div>,
  TXT: <div className="text-[10px] font-black text-text-subtle">TXT</div>,
  CSV: <div className="text-[10px] font-black text-amber-400">CSV</div>,
  MD: <div className="text-[10px] font-black text-violet-400">MD</div>,
}

const STATUS_CONFIG: Record<DocumentStatus, { label: string, icon: any, color: string, bg: string }> = {
  ready: { label: 'Ready', icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  processing: { label: 'Processing', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  uploading: { label: 'Uploading', icon: Clock, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
  failed: { label: 'Failed', icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  error: { label: 'Failed', icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
}

const getWebSocketUrl = (workspaceId: string) => {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/api/documents/ws/${workspaceId}`
  }
  const envUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  const wsBase = envUrl.replace(/^http/, 'ws')
  return `${wsBase}/documents/ws/${workspaceId}`
}

async function fetchFilesInFolder(folderId: string, accessToken: string): Promise<any[]> {
  let allFiles: any[] = []
  let nextPageToken: string | undefined = undefined
  
  do {
    const q: string = `'${folderId}' in parents and trashed = false`
    const requestUrl: string = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,mimeType)&pageSize=1000${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`
    const response: Response = await fetch(requestUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })
    if (!response.ok) {
      throw new Error(`Failed to list files in folder: ${response.statusText}`)
    }
    const data: any = await response.json()
    const files = data.files || []
    
    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        const subFiles = await fetchFilesInFolder(file.id, accessToken)
        allFiles = allFiles.concat(subFiles)
      } else {
        allFiles.push(file)
      }
    }
    
    nextPageToken = data.nextPageToken
  } while (nextPageToken)

  return allFiles
}

export default function DocumentsPage() {
  const { activeWorkspace } = useWorkspaceStore()
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedTag, setSelectedTag] = useState<string>('all')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatusText, setUploadStatusText] = useState('')
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)
  const [useOcr, setUseOcr] = useState(false)
  
  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([])
  const [isDriveSettingsOpen, setIsDriveSettingsOpen] = useState(false)
  const [isGapiLoaded, setIsGapiLoaded] = useState(false)

  const addToast = useCallback((title: string, desc: string, type: 'success' | 'info' | 'danger' = 'success') => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 9)
    setToasts(prev => [...prev, { id, title, desc, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3500)
  }, [])

  const loadGoogleSDKs = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const anyWin = window as any
      if (anyWin.gapi && anyWin.google?.accounts?.oauth2) {
        resolve()
        return
      }

      let gapiLoaded = false
      let gisLoaded = false

      const checkLoaded = () => {
        if (gapiLoaded && gisLoaded) {
          setIsGapiLoaded(true)
          resolve()
        }
      }

      // Load gapi
      if (!anyWin.gapi) {
        const scriptGapi = document.createElement('script')
        scriptGapi.src = 'https://apis.google.com/js/api.js'
        scriptGapi.async = true
        scriptGapi.defer = true
        scriptGapi.onload = () => {
          gapiLoaded = true
          checkLoaded()
        }
        scriptGapi.onerror = () => reject(new Error('Gagal memuat Google API script'))
        document.body.appendChild(scriptGapi)
      } else {
        gapiLoaded = true
      }

      // Load gis
      if (!anyWin.google?.accounts?.oauth2) {
        const scriptGis = document.createElement('script')
        scriptGis.src = 'https://accounts.google.com/gsi/client'
        scriptGis.async = true
        scriptGis.defer = true
        scriptGis.onload = () => {
          gisLoaded = true
          checkLoaded()
        }
        scriptGis.onerror = () => reject(new Error('Gagal memuat Google Identity Services script'))
        document.body.appendChild(scriptGis)
      } else {
        gisLoaded = true
      }

      checkLoaded()
    })
  }

  const handleGoogleDriveClick = async () => {
    if (!activeWorkspace?.id) {
      addToast("Upload Blocked", "Silakan pilih workspace terlebih dahulu.", "danger")
      return
    }

    const clientId = localStorage.getItem('google_client_id')
    const apiKey = localStorage.getItem('google_api_key')

    if (!clientId || !apiKey) {
      setIsDriveSettingsOpen(true)
      return
    }

    const savedToken = localStorage.getItem('google_access_token')
    const expiry = localStorage.getItem('google_token_expiry')

    if (savedToken && expiry && Date.now() < parseInt(expiry)) {
      setUploading(true)
      setUploadProgress(5)
      try {
        await loadGoogleSDKs()
        openPicker(savedToken, apiKey)
      } catch (err: any) {
        console.error(err)
        setUploading(false)
        addToast("Google Drive", err.message || "Gagal memuat SDK Google.", "danger")
      }
      return
    }

    setUploading(true)
    setUploadProgress(5)
    addToast("Google Drive", "Menghubungkan ke Google Drive...", "info")

    try {
      await loadGoogleSDKs()
      const anyWin = window as any
      
      const tokenClient = anyWin.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: async (response: any) => {
          if (response.error !== undefined) {
            setUploading(false)
            console.error(response)
            addToast("Google Drive", "Autentikasi gagal.", "danger")
            return
          }
          
          if (response.access_token) {
            localStorage.setItem('google_access_token', response.access_token)
            localStorage.setItem('google_token_expiry', (Date.now() + (response.expires_in || 3600) * 1000).toString())
          }
          
          openPicker(response.access_token, apiKey)
        },
      })
      tokenClient.requestAccessToken({ prompt: '' })
    } catch (err: any) {
      console.error(err)
      setUploading(false)
      addToast("Google Drive", err.message || "Gagal menghubungkan.", "danger")
    }
  }

  const openPicker = (accessToken: string, apiKey: string) => {
    const anyWin = window as any
    anyWin.gapi.load('picker', () => {
      const view = new anyWin.google.picker.DocsView(anyWin.google.picker.ViewId.DOCS)
      view.setMimeTypes('application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,application/vnd.google-apps.document,application/vnd.google-apps.spreadsheet,application/vnd.google-apps.presentation')
      view.setIncludeFolders(true)
      view.setSelectFolderEnabled(true)
      
      const picker = new anyWin.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey)
        .enableFeature(anyWin.google.picker.Feature.MULTISELECT_ENABLED)
        .setCallback(async (data: any) => {
          if (data.action === anyWin.google.picker.Action.PICKED) {
            const files = data.docs.map((d: any) => ({
              id: d.id,
              name: d.name,
              mimeType: d.mimeType
            }))
            handleGoogleDriveFilesSelected(files, accessToken)
          } else if (data.action === anyWin.google.picker.Action.CANCEL) {
            setUploading(false)
          }
        })
        .build()
      picker.setVisible(true)
    })
  }

  const handleGoogleDriveFilesSelected = async (selectedItems: { id: string; name: string; mimeType: string }[], accessToken: string) => {
    if (selectedItems.length === 0) return
    setUploading(true)
    setUploadStatusText("Membaca file & folder...")
    setUploadProgress(5)

    let files: { id: string; name: string; mimeType: string }[] = []

    try {
      for (const item of selectedItems) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          addToast("Google Drive", `Menelusuri folder: ${item.name}...`, "info")
          const folderFiles = await fetchFilesInFolder(item.id, accessToken)
          files = files.concat(folderFiles)
        } else {
          files.push(item)
        }
      }
    } catch (err: any) {
      console.error(err)
      addToast("Failed", `Gagal membaca folder Google Drive: ${err.message || "Unknown error"}`, "danger")
      setUploading(false)
      setUploadStatusText('')
      return
    }

    const isSupportedFile = (name: string, mimeType: string) => {
      const lowerName = name.toLowerCase()
      const isExtensionSupported = ['.pdf', '.docx', '.xlsx', '.txt', '.md'].some(ext => lowerName.endsWith(ext))
      const isMimeSupported = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/markdown',
        'application/vnd.google-apps.document',
        'application/vnd.google-apps.spreadsheet',
        'application/vnd.google-apps.presentation'
      ].includes(mimeType)
      return isExtensionSupported || isMimeSupported
    }

    const filteredFiles = files.filter(f => isSupportedFile(f.name, f.mimeType))

    if (filteredFiles.length === 0) {
      addToast("Info", "Tidak ada file yang didukung ditemukan di dalam pilihan/folder tersebut.", "info")
      setUploading(false)
      setUploadStatusText('')
      return
    }

    let successCount = 0
    let failCount = 0

    const GOOGLE_EXPORT_FORMATS: Record<string, { mimeType: string, extension: string }> = {
      'application/vnd.google-apps.document': {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: '.docx'
      },
      'application/vnd.google-apps.spreadsheet': {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extension: '.xlsx'
      },
      'application/vnd.google-apps.presentation': {
        mimeType: 'application/pdf',
        extension: '.pdf'
      }
    }

    for (let i = 0; i < filteredFiles.length; i++) {
      const gfile = filteredFiles[i]
      const fileIndexText = filteredFiles.length > 1 ? `(${i + 1}/${filteredFiles.length})` : ''
      setUploadStatusText(`Downloading ${fileIndexText}: ${gfile.name}...`)
      
      const baseProgress = (i / filteredFiles.length) * 100
      setUploadProgress(Math.round(baseProgress + (10 / filteredFiles.length)))

      if (filteredFiles.length === 1) {
        addToast("Google Drive", `Downloading ${gfile.name}...`, "info")
      }

      try {
        let blob: Blob
        let finalFileName = gfile.name

        setUploadProgress(Math.round(baseProgress + (30 / filteredFiles.length)))
        if (GOOGLE_EXPORT_FORMATS[gfile.mimeType]) {
          const exportFormat = GOOGLE_EXPORT_FORMATS[gfile.mimeType]
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${gfile.id}/export?mimeType=${exportFormat.mimeType}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          })

          if (!res.ok) {
            throw new Error(`Export failed: ${res.statusText}`)
          }
          blob = await res.blob()
          if (!finalFileName.toLowerCase().endsWith(exportFormat.extension)) {
            finalFileName += exportFormat.extension
          }
        } else {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${gfile.id}?alt=media`, {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          })

          if (!res.ok) {
            throw new Error(`Download failed: ${res.statusText}`)
          }
          blob = await res.blob()
        }

        setUploadProgress(Math.round(baseProgress + (60 / filteredFiles.length)))
        const file = new File([blob], finalFileName, { type: blob.type })

        setUploadStatusText(`Uploading ${fileIndexText}: ${finalFileName}...`)
        const newDoc = await api.uploadDocument(activeWorkspace!.id, file, useOcr)

        setDocs(prev => {
          const exists = prev.some(d => d.id === newDoc.id)
          if (exists) {
            return prev.map(d => d.id === newDoc.id ? newDoc : d)
          }
          return [newDoc, ...prev]
        })
        successCount++
        setUploadProgress(Math.round(((i + 1) / filteredFiles.length) * 100))
      } catch (err: any) {
        failCount++
        console.error(err)
        addToast("Failed", `Failed to import ${gfile.name}: ${err.message || "Unknown error"}`, "danger")
      }
    }

    if (filteredFiles.length > 1) {
      if (successCount === filteredFiles.length) {
        addToast("Success", `All ${successCount} files imported from Google Drive.`, "success")
      } else if (successCount > 0) {
        addToast("Import Finished", `Imported ${successCount} files, ${failCount} failed.`, "info")
      } else {
        addToast("Import Failed", `Failed to import all files from Google Drive.`, "danger")
      }
    } else if (successCount === 1) {
      addToast("Sukses", "Dokumen berhasil diunggah dari Google Drive.", "success")
    }

    setUploading(false)
    setUploadStatusText('')
  }

  // Fetch initial documents & manage updates via Websocket/Polling
  useEffect(() => {
    if (!activeWorkspace?.id) return
    let active = true
    let socket: WebSocket | null = null
    let pollInterval: NodeJS.Timeout | null = null

    const fetchInitialDocs = async () => {
      setLoading(true)
      try {
        const data = await api.getDocuments(activeWorkspace.id)
        if (active) {
          setDocs(data)
        }
      } catch (err) {
        console.error("Error fetching documents:", err)
        if (active) {
          addToast("Error Loading", "Failed to retrieve documents list", "danger")
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    const startPollingFallback = () => {
      if (pollInterval) return
      console.log("Starting polling fallback...")
      pollInterval = setInterval(async () => {
        if (!active) return
        try {
          const data = await api.getDocuments(activeWorkspace.id)
          setDocs(data)
        } catch (err) {
          console.error("Polling error:", err)
        }
      }, 4000)
    }

    const setupWS = () => {
      try {
        const wsUrl = getWebSocketUrl(activeWorkspace.id)
        socket = new WebSocket(wsUrl)

        socket.onopen = () => {
          console.log("WebSocket connected to workspace:", activeWorkspace.id)
        }

        socket.onmessage = (event) => {
          if (!active) return
          try {
            const payload = JSON.parse(event.data)
            if (payload.event === 'document_status') {
              const updated = payload.data
              
              const newDoc: Document = {
                id: updated.id,
                name: updated.filename,
                type: (updated.filename.split('.').pop() || 'PDF').toUpperCase() as any,
                size: updated.file_size,
                pages: updated.metadata?.page_count ?? 1,
                status: updated.status,
                uploadedAt: new Date(updated.created_at ? (updated.created_at.endsWith('Z') ? updated.created_at : updated.created_at + 'Z') : Date.now()),
                workspaceId: updated.workspace_id,
                tags: updated.metadata?.ocr_applied ? ['ocr-extracted'] : [],
                language: 'en',
                chunks: updated.metadata?.chunk_count ?? 0,
                content_hash: updated.content_hash,
                metadata: updated.metadata
              }

              setDocs(prev => {
                const exists = prev.some(d => d.id === newDoc.id)
                if (exists) {
                  return prev.map(d => d.id === newDoc.id ? newDoc : d)
                } else {
                  return [newDoc, ...prev]
                }
              })
            }
          } catch (e) {
            console.error("WebSocket message parsing error:", e)
          }
        }

        socket.onerror = (e) => {
          console.warn("WebSocket error, falling back to polling:", e)
          startPollingFallback()
        }

        socket.onclose = () => {
          if (active) {
            console.warn("WebSocket disconnected, falling back to polling.")
            startPollingFallback()
          }
        }

      } catch (err) {
        console.warn("WebSocket initialization error, falling back to polling:", err)
        startPollingFallback()
      }
    }

    fetchInitialDocs()
    setupWS()

    return () => {
      active = false
      if (socket) socket.close()
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [activeWorkspace?.id])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return
    if (!activeWorkspace?.id) {
      addToast("Upload Blocked", "Please select a workspace first.", "danger")
      return
    }

    setUploading(true)
    setUploadProgress(15)
    addToast("Upload Started", `Uploading ${acceptedFiles[0].name}...`, "info")

    try {
      const newDoc = await api.uploadDocument(activeWorkspace.id, acceptedFiles[0], useOcr)
      setUploadProgress(100)
      setDocs(prev => {
        const exists = prev.some(d => d.id === newDoc.id)
        if (exists) {
          return prev.map(d => d.id === newDoc.id ? newDoc : d)
        }
        return [newDoc, ...prev]
      })
      addToast("Upload Complete", "Document uploaded successfully. Processing started.", "success")
    } catch (err: any) {
      addToast("Upload Failed", err.message || "An error occurred during upload.", "danger")
    } finally {
      setUploading(false)
    }
  }, [activeWorkspace?.id, useOcr])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
    maxSize: 100 * 1024 * 1024, // 100 MB Limit
  })

  const filtered = docs.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase())
    const normalizedStatus = (d.status === 'error' || d.status === 'failed') ? 'failed' : d.status
    const matchStatus = statusFilter === 'all' || normalizedStatus === statusFilter
    const matchTag = selectedTag === 'all' || d.tags.some(t => t.toLowerCase() === selectedTag.toLowerCase())
    return matchSearch && matchStatus && matchTag
  })

  const counts = {
    all: docs.length,
    ready: docs.filter(d => d.status === 'ready').length,
    processing: docs.filter(d => d.status === 'processing' || d.status === 'uploading').length,
    failed: docs.filter(d => d.status === 'failed' || d.status === 'error').length,
  }

  const handleDelete = async (id: string, name: string) => {
    try {
      await api.deleteDocument(id)
      setDocs(prev => prev.filter(d => d.id !== id))
      if (selectedDoc?.id === id) {
        setSelectedDoc(null)
      }
      addToast("Document Deleted", `${name} has been permanently deleted.`, "danger")
    } catch (err: any) {
      addToast("Delete Failed", err.message || "Could not delete document.", "danger")
    }
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-8 animate-fade-in">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black mb-1">Documents</h1>
            <p className="text-sm text-text-subtle">{counts.all} documents indexed in workspace</p>
          </div>
        </div>

        {/* Drop zone with OCR controls */}
        <div className="space-y-3">
          <div
            {...getRootProps()}
            id="upload-dropzone"
            className={`relative rounded-2xl border-2 border-dashed p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
              isDragActive
                ? 'border-indigo-500 bg-indigo-600/10'
                : 'border-border-strong hover:border-border-strong hover:bg-bg-panel'
            }`}
          >
            <input {...getInputProps()} id="upload-input" />
            {uploading ? (
              <div className="flex flex-col items-center gap-3 w-full max-w-xs animate-fade-in">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-indigo-400 animate-bounce" />
                </div>
                <div className="text-sm font-semibold truncate w-full px-2" title={uploadStatusText || "Uploading & processing…"}>
                  {uploadStatusText || "Uploading & processing…"}
                </div>
                <div className="w-full h-1.5 bg-bg-hover rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="text-xs text-text-muted">{uploadProgress}%</div>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center mb-3 transition-transform group-hover:scale-110">
                  <Upload className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="text-sm font-bold mb-1">
                  {isDragActive ? 'Drop files here' : 'Drag & drop documents'}
                </div>
                <div className="text-xs text-text-subtle mb-3">or click to browse (Max 100MB)</div>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {['PDF', 'DOCX', 'TXT', 'MD'].map(t => (
                    <span key={t} className="px-2 py-0.5 rounded-full bg-bg-hover border border-border-strong text-[10px] text-text-muted">{t}</span>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 items-center justify-center mt-4">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleGoogleDriveClick()
                    }}
                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-bg-panel border border-border-strong hover:border-indigo-500/40 hover:bg-indigo-600/5 text-xs text-indigo-400 font-semibold transition-all cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M19.43 12.98l-7.43-12.98h-4l7.43 12.98z" fill="#FFC107" />
                      <path d="M15.43 20h-10.86l-3.43-6 5.43-9.43z" fill="#2196F3" />
                      <path d="M22 13h-10.86l-3.43 6h10.86z" fill="#4CAF50" />
                    </svg>
                    <span>Connect Google Drive</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsDriveSettingsOpen(true)
                    }}
                    title="Google Drive Settings"
                    className="p-2 rounded-xl bg-bg-panel border border-border-strong hover:border-indigo-500/40 hover:bg-indigo-600/5 text-text-muted hover:text-indigo-400 transition-colors cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
          
          {/* OCR Checkbox Row */}
          <div className="flex items-center gap-2 px-1">
            <input
              id="ocr-checkbox"
              type="checkbox"
              checked={useOcr}
              onChange={(e) => setUseOcr(e.target.checked)}
              className="w-4 h-4 rounded border-border-strong bg-bg-panel text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="ocr-checkbox" className="text-xs text-text-subtle cursor-pointer select-none">
              Run OCR for scanned PDFs (requires PyTesseract on host)
            </label>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 mb-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                id="documents-search"
                type="text"
                placeholder="Search documents by name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-border-strong bg-bg-panel text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="flex gap-2">
              {(['all', 'ready', 'processing', 'failed'] as const).map(s => {
                const count = s === 'all' ? counts.all : counts[s]
                return (
                  <button
                    key={s}
                    id={`filter-${s}`}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 capitalize border ${
                      statusFilter === s
                        ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
                        : 'bg-bg-panel border border-border-strong text-text-subtle hover:text-foreground hover:border-border-strong'
                    }`}
                  >
                    {s === 'processing' ? 'Processing' : s} ({count})
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Document list */}
        <div className="rounded-2xl border border-border-strong bg-bg-input overflow-hidden">
          {/* Desktop view */}
          <div className="hidden md:block overflow-x-auto">
            <div className="min-w-[768px]">
              {/* Table header */}
              <div className="grid grid-cols-[2fr_80px_80px_120px_100px_80px] gap-4 px-5 py-3 border-b border-border-subtle text-xs font-semibold text-text-muted uppercase tracking-wider">
                <span>Document</span>
                <span>Type</span>
                <span>Size</span>
                <span>Uploaded</span>
                <span>Status</span>
                <span>Actions</span>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                  <RefreshCw className="w-8 h-8 mb-3 animate-spin text-indigo-500" />
                  <p className="text-sm">Fetching documents...</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                  <FileText className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No documents found matching search criteria.</p>
                </div>
              ) : (
                filtered.map((doc, i) => {
                  const status = STATUS_CONFIG[doc.status] || STATUS_CONFIG.error
                  const isProcessing = doc.status === 'processing' || doc.status === 'uploading'
                  return (
                    <div
                      key={doc.id}
                      className={`grid grid-cols-[2fr_80px_80px_120px_100px_80px] gap-4 px-5 py-3.5 items-center hover:bg-bg-hover transition-colors cursor-pointer ${i < filtered.length - 1 ? 'border-b border-border-subtle' : ''}`}
                      onClick={() => setSelectedDoc(doc)}
                    >
                      {/* Name */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-bg-panel border border-border-strong flex items-center justify-center shrink-0">
                          {FILE_TYPE_ICONS[doc.type] || <FileText className="w-3.5 h-3.5 text-text-muted" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate hover:text-indigo-300 transition-colors">{doc.name}</div>
                          <div className="text-xs text-text-muted">
                            {doc.status === 'ready' ? `${doc.chunks} chunks · ${doc.pages} pages` :
                             isProcessing ? `Processing details…` :
                             `Extraction failed: ${doc.metadata?.error || 'unknown error'}`}
                          </div>
                        </div>
                      </div>

                      {/* Type */}
                      <span className="text-xs text-text-subtle">{doc.type}</span>

                      {/* Size */}
                      <span className="text-xs text-text-subtle">{formatBytes(doc.size)}</span>

                      {/* Uploaded */}
                      <span className="text-xs text-text-subtle">{formatRelativeTime(doc.uploadedAt)}</span>

                      {/* Status */}
                      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border w-fit ${status.bg} ${status.color}`}>
                        {isProcessing ? (
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        ) : (
                          <status.icon className="w-3 h-3" />
                        )}
                        {status.label}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <Link
                          href="/dashboard/chat"
                          id={`doc-chat-${doc.id}`}
                          title="Ask about this document"
                          onClick={() => addToast("Query context loaded", `Opening chat scoped to ${doc.name}`, "info")}
                          className="p-1.5 rounded-lg hover:bg-indigo-600/20 text-text-muted hover:text-indigo-400 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          id={`doc-delete-${doc.id}`}
                          title="Delete"
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-text-muted hover:text-red-400 transition-colors"
                          onClick={() => handleDelete(doc.id, doc.name)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Mobile view */}
          <div className="block md:hidden divide-y divide-border-subtle">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                <RefreshCw className="w-6 h-6 mb-2 animate-spin text-indigo-500" />
                <p className="text-xs">Fetching documents...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                <FileText className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs">No documents found matching search criteria.</p>
              </div>
            ) : (
              filtered.map((doc) => {
                const status = STATUS_CONFIG[doc.status] || STATUS_CONFIG.error
                const isProcessing = doc.status === 'processing' || doc.status === 'uploading'
                return (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedDoc(doc)}
                    className="p-4 hover:bg-bg-hover transition-colors cursor-pointer flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-bg-panel border border-border-strong flex items-center justify-center shrink-0">
                          {FILE_TYPE_ICONS[doc.type] || <FileText className="w-3.5 h-3.5 text-text-muted" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-foreground truncate">{doc.name}</div>
                          <div className="text-[10px] text-text-muted mt-0.5">
                            {doc.type} · {formatBytes(doc.size)} · {formatRelativeTime(doc.uploadedAt)}
                          </div>
                        </div>
                      </div>
                      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${status.bg} ${status.color}`}>
                        {isProcessing ? (
                          <div className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
                        ) : (
                          <status.icon className="w-2.5 h-2.5" />
                        )}
                        {status.label}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-1 text-[10px] text-text-subtle">
                      <div>
                        {doc.status === 'ready' ? `${doc.chunks} chunks · ${doc.pages} pages` : '—'}
                      </div>
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <Link
                          href="/dashboard/chat"
                          id={`doc-chat-mob-${doc.id}`}
                          onClick={() => addToast("Query context loaded", `Opening chat scoped to ${doc.name}`, "info")}
                          className="px-2.5 py-1 rounded-lg border border-border-strong bg-bg-panel text-xs text-text-subtle hover:text-indigo-400 transition-colors flex items-center gap-1"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> Ask AI
                        </Link>
                        <button
                          id={`doc-delete-mob-${doc.id}`}
                          className="p-1 rounded-lg border border-border-strong bg-bg-panel hover:bg-red-500/20 text-text-muted hover:text-red-400 transition-colors"
                          onClick={() => handleDelete(doc.id, doc.name)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Document detail slide-over */}
        {selectedDoc && (
          <div className="fixed inset-0 z-50 flex animate-fade-in justify-end">
            <div className="hidden md:block flex-1 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedDoc(null)} />
            <div className="w-full md:max-w-md bg-bg-panel border-l border-border-strong flex flex-col overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-border-subtle">
                <h2 className="text-sm font-bold text-foreground">Document Details</h2>
                <button onClick={() => setSelectedDoc(null)} className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 flex flex-col gap-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-bg-input border border-border-strong flex items-center justify-center">
                    {FILE_TYPE_ICONS[selectedDoc.type] || <FileText className="w-5 h-5 text-text-muted" />}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-foreground">{selectedDoc.name}</div>
                    <div className="text-xs text-text-muted mt-0.5">{selectedDoc.type} · {formatBytes(selectedDoc.size)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Pages', value: selectedDoc.pages },
                    { label: 'Chunks', value: selectedDoc.chunks || '—' },
                    { label: 'OCR Applied', value: selectedDoc.metadata?.ocr_applied ? 'Yes' : 'No' },
                    { label: 'Uploaded', value: formatRelativeTime(selectedDoc.uploadedAt) },
                  ].map(i => (
                    <div key={i.label} className="rounded-xl bg-bg-input border border-border-strong p-3">
                      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{i.label}</div>
                      <div className="text-sm font-semibold text-foreground">{i.value}</div>
                    </div>
                  ))}
                </div>

                {selectedDoc.content_hash && (
                  <div className="rounded-xl bg-bg-input border border-border-strong p-3">
                    <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Content Hash (SHA-256)</div>
                    <div className="text-xs font-mono text-text-muted break-all">{selectedDoc.content_hash}</div>
                  </div>
                )}

                {selectedDoc.metadata?.error && (
                  <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
                    <div className="text-[10px] text-red-400 uppercase tracking-wider mb-1">Error Message</div>
                    <div className="text-xs text-red-200">{selectedDoc.metadata.error}</div>
                  </div>
                )}

                {selectedDoc.tags && selectedDoc.tags.length > 0 && (
                  <div>
                    <div className="text-xs text-text-muted mb-2">Tags</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedDoc.tags.map(tag => (
                        <span key={tag} className="px-2.5 py-1 rounded-full bg-indigo-600/10 border border-indigo-500/20 text-xs text-indigo-400">#{tag}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Link 
                    href="/dashboard/chat"
                    onClick={() => {
                      addToast("Scoped chat query loaded", `Chatting about ${selectedDoc.name}`, "info")
                      setSelectedDoc(null)
                    }}
                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-xl transition-all text-center active:scale-95"
                  >
                    <MessageSquare className="w-4 h-4" /> Ask about this
                  </Link>
                  <button 
                    onClick={() => handleDelete(selectedDoc.id, selectedDoc.name)}
                    className="flex items-center justify-center gap-2 bg-red-600/10 border border-red-500/20 hover:bg-red-600/20 text-red-400 text-sm py-2.5 px-4 rounded-xl transition-all active:scale-95"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto flex gap-3 p-4 rounded-xl border border-border-strong bg-bg-input shadow-2xl w-80 animate-slide-in relative overflow-hidden">
            {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {t.type === 'info' && <Zap className="w-5 h-5 text-indigo-400 shrink-0" />}
            {t.type === 'danger' && <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}
            
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-foreground truncate">{t.title}</div>
              <div className="text-[10px] text-text-subtle mt-0.5 leading-relaxed">{t.desc}</div>
            </div>
            
            <button 
              onClick={() => setToasts(p => p.filter(toast => toast.id !== t.id))} 
              className="text-text-muted hover:text-foreground shrink-0 self-start transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="absolute left-0 bottom-0 h-0.5 bg-gradient-to-r from-indigo-500 to-violet-500 w-full animate-pulse" />
          </div>
        ))}
      </div>

      <GoogleDriveSettingsModal
        isOpen={isDriveSettingsOpen}
        onClose={() => setIsDriveSettingsOpen(false)}
        onSave={() => addToast("Pengaturan Disimpan", "Kredensial Google Drive berhasil disimpan.", "success")}
      />
    </div>
  )
}
