export interface User {
  id: string
  name: string
  email: string
  avatar: string
  role: 'Owner' | 'Admin' | 'Editor' | 'Viewer'
  plan: 'Starter' | 'Growth' | 'Business' | 'Enterprise'
}

export interface Workspace {
  id: string
  name: string
  color: string
  docCount: number
  memberCount: number
  default_chat_endpoint_id?: string
  default_chat_model?: string
  default_embedding_endpoint_id?: string
  default_embedding_model?: string
}

export type DocumentStatus = 'uploading' | 'processing' | 'ready' | 'failed' | 'error'
export type DocumentType = 'PDF' | 'DOCX' | 'XLSX' | 'TXT' | 'MD' | 'CSV'

export interface Document {
  id: string
  name: string
  type: DocumentType
  size: number
  pages: number
  status: DocumentStatus
  uploadedAt: Date
  workspaceId: string
  tags: string[]
  language: string
  chunks: number
  processingProgress?: number
  content_hash?: string
  metadata?: {
    page_count?: number
    chunk_count?: number
    char_count?: number
    ocr_applied?: boolean
    error?: string
    [key: string]: any
  }
}

export interface Citation {
  // Citation number yang direferensi AI dalam teks: [1], [2], dst
  citationNumber?: number
  docId: string
  docName: string
  page: number
  snippet: string
  // Teks penuh untuk panel detail (lebih panjang dari snippet)
  fullText?: string
  // Skor relevansi 0-1 dari vector search
  relevanceScore?: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  citations?: Citation[]
  confidence?: number
  model?: string
  // Jumlah query variants yang digunakan (dari query rewriting)
  queriesUsed?: number
  source_mode?: 'DOCUMENT' | 'GENERAL' | 'HYBRID'
  retrieval_score?: number
}

export interface ExtractionField {
  name: string
  type: 'string' | 'number' | 'date' | 'boolean' | 'array'
}

export interface ExtractionJob {
  id: string
  name: string
  template: 'Invoice' | 'Contract' | 'Custom'
  docCount: number
  processedCount: number
  status: 'running' | 'completed' | 'failed' | 'queued'
  createdAt: Date
  accuracy: number
  fields: string[]
}

export interface QueryStats {
  date: string
  queries: number
  documents: number
  extractions: number
}

export interface PricingPlan {
  name: string
  price: string
  period?: string
  seats: string
  storage: string
  queries: string
  features: string[]
  highlight: boolean
  cta: string
}
