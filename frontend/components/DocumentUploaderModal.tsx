'use client'

import React, { useState, useRef, useCallback } from 'react'
import { UploadCloud, File, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

interface DocumentUploaderModalProps {
  isOpen: boolean
  onClose: () => void
  workspaceId: string
  onUploadSuccess: () => void
}

export function DocumentUploaderModal({ isOpen, onClose, workspaceId, onUploadSuccess }: DocumentUploaderModalProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [ocr, setOcr] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
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
      handleFileSelect(e.dataTransfer.files[0])
    }
  }, [])

  const handleFileSelect = (selectedFile: File) => {
    const validExtensions = ['.pdf', '.docx', '.txt', '.md']
    const ext = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase()
    
    if (!validExtensions.includes(ext)) {
      setError(`Unsupported file format: ${ext}. Please upload PDF, DOCX, TXT, or MD.`)
      setFile(null)
      return
    }
    
    setFile(selectedFile)
    setError(null)
  }

  const handleUpload = async () => {
    if (!file || !workspaceId) return

    setIsUploading(true)
    setError(null)
    setUploadProgress(10) // Initial progress

    const formData = new FormData()
    formData.append('workspace_id', workspaceId)
    formData.append('file', file)
    formData.append('ocr', String(ocr))

    try {
      setUploadProgress(50) // Mid progress
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

      setUploadProgress(100)
      
      setTimeout(() => {
        setIsUploading(false)
        setFile(null)
        setUploadProgress(0)
        onUploadSuccess()
        onClose()
      }, 500)

    } catch (err: any) {
      setError(err.message)
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-bg-panel border border-border-strong rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <h2 className="text-lg font-bold text-foreground">Upload Document</h2>
          <button 
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-foreground hover:bg-bg-hover rounded-lg transition-colors"
            disabled={isUploading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Drag & Drop Area */}
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !file && fileInputRef.current?.click()}
            className={`
              relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl transition-all
              ${isDragging 
                ? 'border-indigo-500 bg-indigo-500/10' 
                : file 
                  ? 'border-emerald-500/50 bg-emerald-500/5' 
                  : 'border-border-strong hover:border-indigo-400 hover:bg-bg-hover cursor-pointer'}
            `}
          >
            <input 
              ref={fileInputRef}
              type="file" 
              className="hidden" 
              accept=".pdf,.docx,.txt,.md"
              onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
            />
            
            {file ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{file.name}</p>
                  <p className="text-xs text-text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                {!isUploading && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    className="text-xs text-red-400 hover:text-red-300 mt-1 font-medium"
                  >
                    Remove file
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center pointer-events-none">
                <div className="w-12 h-12 bg-bg-input border border-border-strong text-text-muted rounded-full flex items-center justify-center">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Click or drag file to this area</p>
                  <p className="text-xs text-text-subtle mt-1">Supports PDF, DOCX, TXT, MD</p>
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 p-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{error}</p>
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
              disabled={isUploading || (file ? !file.name.toLowerCase().endsWith('.pdf') : false)}
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
            disabled={!file || isUploading}
            className={`
              relative flex items-center justify-center px-6 py-2 text-sm font-semibold text-white rounded-lg transition-all
              ${!file || isUploading 
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
              'Upload Document'
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
