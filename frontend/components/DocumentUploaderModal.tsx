'use client'

import React, { useState, useRef, useCallback } from 'react'
import { UploadCloud, File as FileIcon, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

interface DocumentUploaderModalProps {
  isOpen: boolean
  onClose: () => void
  workspaceId: string
  onUploadSuccess: () => void
}

export function DocumentUploaderModal({ isOpen, onClose, workspaceId, onUploadSuccess }: DocumentUploaderModalProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [ocr, setOcr] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatusText, setUploadStatusText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    setError(null)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelect(Array.from(e.dataTransfer.files))
    }
  }, [])

  const handleFilesSelect = (selectedFiles: File[]) => {
    const validExtensions = ['.pdf', '.docx', '.txt', '.md']
    const validFiles: File[] = []
    let hasInvalid = false

    selectedFiles.forEach(file => {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
      if (validExtensions.includes(ext)) {
        validFiles.push(file)
      } else {
        hasInvalid = true
      }
    })

    if (hasInvalid) {
      setError('Beberapa file diabaikan karena format tidak didukung (Hanya PDF, DOCX, TXT, MD).')
    } else {
      setError(null)
    }

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles])
    }
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpload = async () => {
    if (files.length === 0 || !workspaceId) return

    setIsUploading(true)
    setError(null)
    setUploadProgress(5)

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const fileIndexText = `${i + 1}/${files.length}`
      setUploadStatusText(`Mengunggah (${fileIndexText}): ${file.name}...`)

      const formData = new FormData()
      formData.append('workspace_id', workspaceId)
      formData.append('file', file)
      formData.append('ocr', String(ocr))

      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
        const res = await fetch(`${baseUrl}/documents/upload`, {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: formData,
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.detail || 'Failed to upload document')
        }

        successCount++
      } catch (err: any) {
        console.error(`Gagal mengunggah ${file.name}:`, err)
        failCount++
      }
      setUploadProgress(Math.round(((i + 1) / files.length) * 100))
    }

    setIsUploading(false)
    setUploadStatusText('')

    if (failCount > 0) {
      setError(`Berhasil mengunggah ${successCount} file. Gagal mengunggah ${failCount} file.`);
      setFiles(prev => prev.slice(successCount))
      onUploadSuccess()
    } else {
      setFiles([])
      onUploadSuccess()
      onClose()
    }
  }

  const hasPdf = files.some(file => file.name.toLowerCase().endsWith('.pdf'))

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-bg-panel border border-border-strong rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <h2 className="text-lg font-bold text-foreground">Upload Documents</h2>
          <button 
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-foreground hover:bg-bg-hover rounded-lg transition-colors"
            disabled={isUploading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Drag & Drop Area */}
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`
              relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl transition-all
              ${isDragging 
                ? 'border-indigo-500 bg-indigo-500/10' 
                : files.length > 0 
                  ? 'border-emerald-500/30 bg-emerald-500/5 hover:border-indigo-400 hover:bg-bg-hover cursor-pointer' 
                  : 'border-border-strong hover:border-indigo-400 hover:bg-bg-hover cursor-pointer'}
            `}
          >
            <input 
              ref={fileInputRef}
              type="file" 
              className="hidden" 
              accept=".pdf,.docx,.txt,.md"
              multiple
              onChange={(e) => e.target.files && handleFilesSelect(Array.from(e.target.files))}
              disabled={isUploading}
            />
            
            <div className="flex flex-col items-center gap-3 text-center pointer-events-none">
              <div className="w-12 h-12 bg-bg-input border border-border-strong text-text-muted rounded-full flex items-center justify-center">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Click or drag files here to upload</p>
                <p className="text-xs text-text-subtle mt-1">Supports PDF, DOCX, TXT, MD (Multiple Files)</p>
              </div>
            </div>
          </div>

          {/* Files List */}
          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-text-subtle">Selected Files ({files.length}):</p>
              <div className="max-h-48 overflow-y-auto space-y-2 pr-1 border border-border-subtle rounded-xl p-3 bg-bg-input">
                {files.map((f, index) => (
                  <div key={index} className="flex items-center justify-between text-sm p-2 rounded-lg bg-bg-panel border border-border-strong group">
                    <div className="flex items-center gap-2 truncate">
                      <FileIcon className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span className="text-foreground font-medium truncate" title={f.name}>{f.name}</span>
                      <span className="text-xs text-text-muted">({(f.size / 1024 / 1024).toFixed(2)} MB)</span>
                    </div>
                    {!isUploading && (
                      <button 
                        onClick={() => removeFile(index)}
                        className="text-text-muted hover:text-red-400 transition-colors p-1"
                        title="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error / Status Message */}
          {error && (
            <div className="flex items-start gap-2 p-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="flex-1">{error}</p>
            </div>
          )}

          {isUploading && uploadStatusText && (
            <div className="text-xs text-indigo-400 bg-indigo-500/5 border border-indigo-500/10 rounded-lg p-3 font-medium animate-pulse">
              {uploadStatusText}
            </div>
          )}

          {/* Options */}
          <div className="flex items-center gap-3">
            <input 
              type="checkbox" 
              id="ocr-toggle" 
              checked={ocr}
              onChange={(e) => setOcr(e.target.checked)}
              className="w-4 h-4 rounded border-border-strong bg-bg-input text-indigo-500 focus:ring-indigo-500 focus:ring-offset-gray-900"
              disabled={isUploading || !hasPdf}
            />
            <label htmlFor="ocr-toggle" className="text-sm text-text-subtle cursor-pointer flex flex-col">
              <span className="font-medium">Enable OCR (Scanned PDFs)</span>
              <span className="text-xs text-text-muted">Use PyTesseract to extract text from images in the PDF.</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border-subtle bg-bg-panel flex items-center justify-end gap-3">
          <button 
            onClick={onClose}
            disabled={isUploading}
            className="px-4 py-2 text-sm font-medium text-text-subtle hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleUpload}
            disabled={files.length === 0 || isUploading}
            className={`
              relative flex items-center justify-center px-6 py-2 text-sm font-semibold text-white rounded-lg transition-all
              ${files.length === 0 || isUploading 
                ? 'bg-indigo-600/50 cursor-not-allowed text-white/50' 
                : 'bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20'}
            `}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading... {uploadProgress}%
              </>
            ) : (
              `Upload ${files.length} Document${files.length > 1 ? 's' : ''}`
            )}
            
            {/* Progress bar overlay */}
            {isUploading && (
              <div 
                className="absolute left-0 bottom-0 h-1 bg-indigo-400 rounded-b-lg transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
