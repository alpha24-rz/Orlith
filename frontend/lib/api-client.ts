import { Workspace, Document, ChatMessage } from './types'

// In the browser: use Next.js /api proxy (avoids CORS entirely)
// In server-side: use the raw backend URL
const API_URL =
  typeof window !== 'undefined'
    ? '/api'
    : (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000')

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function fetchAPI<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  } as any

  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token')
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  // If we are passing FormData, we shouldn't set Content-Type manually so the browser sets the boundary
  if (options.body instanceof FormData) {
    delete (headers as any)['Content-Type']
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let errorMessage = 'An error occurred'
    try {
      const errorData = await response.json()
      errorMessage = errorData.detail || errorData.error || response.statusText
    } catch (e) {
      errorMessage = response.statusText
    }
    throw new ApiError(response.status, errorMessage)
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return {} as T
  }
  
  // Return the raw response for streams
  if (options.headers && (options.headers as any)['Accept'] === 'text/event-stream') {
    return response as any
  }

  return response.json()
}

export const api = {
  getWorkspaces: async () => {
    const data = await fetchAPI<any[]>('/workspaces')
    return data.map((w: any, i) => ({
      ...w,
      color: ['#6366F1', '#10B981', '#F59E0B', '#EC4899', '#3B82F6', '#8B5CF6'][i % 6],
      docCount: w.doc_count || 0,
      memberCount: w.member_count || 1
    })) as Workspace[]
  },
  createWorkspace: async (data: { name: string; description?: string }) => {
    const w = await fetchAPI<any>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(data)
    })
    return {
      ...w,
      color: '#6366F1',
      docCount: 0,
      memberCount: 1
    } as Workspace
  },
  updateWorkspace: async (id: string, data: { name?: string; description?: string }) => {
    const w = await fetchAPI<any>(`/workspaces/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
    return w as Workspace
  },
  deleteWorkspace: async (id: string) => {
    await fetchAPI<any>(`/workspaces/${id}`, { method: 'DELETE' })
  },
  updateWorkspaceAiSettings: async (id: string, data: any) => {
    const w = await fetchAPI<any>(`/workspaces/${id}/settings/ai`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
    return w as Workspace
  },
  getWorkspaceStats: async (id: string) => {
    return await fetchAPI<any>(`/workspaces/${id}/stats`)
  },
  getWorkspaceAnalytics: async (id: string) => {
    return await fetchAPI<any>(`/workspaces/${id}/analytics`)
  },

  // Documents
  getDocuments: async (workspaceId: string) => {
    const data = await fetchAPI<any[]>(`/documents/${workspaceId}`)
    return data.map((d: any) => ({
      id: d.id,
      name: d.filename,
      type: d.file_type || 'PDF',
      size: d.file_size || 0,
      pages: d.metadata?.page_count ?? 1,
      status: d.status,
      uploadedAt: new Date(d.created_at.endsWith('Z') ? d.created_at : d.created_at + 'Z'),
      workspaceId: d.workspace_id,
      tags: d.metadata?.ocr_applied ? ['ocr-extracted'] : [],
      language: 'en',
      chunks: d.metadata?.chunk_count ?? 0,
      content_hash: d.content_hash,
      metadata: d.metadata
    })) as Document[]
  },
  uploadDocument: async (workspaceId: string, file: File, ocr: boolean = false) => {
    const formData = new FormData()
    formData.append('workspace_id', workspaceId)
    formData.append('file', file)
    formData.append('ocr', ocr ? 'true' : 'false')
    
    // Bypass Next.js proxy for uploads due to Turbopack 404 bugs with large multipart requests
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const headers: any = {}
    
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token')
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    }

    const response = await fetch(`${baseUrl}/documents/upload`, {
      method: 'POST',
      headers,
      body: formData
    })

    if (!response.ok) {
      let errorMessage = 'An error occurred during upload'
      try {
        const errorData = await response.json()
        errorMessage = errorData.detail || errorData.error || response.statusText
      } catch (e) {
        errorMessage = response.statusText
      }
      throw new ApiError(response.status, errorMessage)
    }

    const d = await response.json()
    return {
      id: d.id,
      name: d.filename,
      type: d.file_type || 'PDF',
      size: d.file_size || 0,
      pages: d.metadata?.page_count ?? 1,
      status: d.status,
      uploadedAt: new Date(d.created_at.endsWith('Z') ? d.created_at : d.created_at + 'Z'),
      workspaceId: d.workspace_id,
      tags: d.metadata?.ocr_applied ? ['ocr-extracted'] : [],
      language: 'en',
      chunks: d.metadata?.chunk_count ?? 0,
      content_hash: d.content_hash,
      metadata: d.metadata
    } as Document
  },
  deleteDocument: async (documentId: string) => {
    return fetchAPI<any>(`/documents/${documentId}`, {
      method: 'DELETE'
    })
  },

  // Query (streaming RAG)
  queryWorkspace: async function* (workspaceId: string, message: string) {
    const response = await fetchAPI<Response>('/query', {
      method: 'POST',
      body: JSON.stringify({ workspace_id: workspaceId, message }),
      headers: { 'Accept': 'text/event-stream' }
    })
    
    if (!response.body) return

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      yield chunk
    }
  },

  // Semantic search (non-streaming, returns ranked chunk hits)
  searchWorkspace: async (workspaceId: string, query: string, topK = 15) => {
    const data = await fetchAPI<{ results: any[] }>('/query/search', {
      method: 'POST',
      body: JSON.stringify({ workspace_id: workspaceId, query, top_k: topK })
    })
    return data.results || []
  },

  // Agent Traces
  getAgentTraces: async (workspaceId: string, limit = 20) => {
    const data = await fetchAPI<{ traces: any[] }>(`/agent/${workspaceId}/traces?limit=${limit}`)
    return data.traces || []
  },
  getAgentTraceDetail: async (workspaceId: string, traceId: string) => {
    return await fetchAPI<any>(`/agent/${workspaceId}/traces/${traceId}`)
  },

  // Usage / AI Cost Tracking
  getUsageSummary: async (workspaceId: string) => {
    return await fetchAPI<any>(`/usage/${workspaceId}`)
  },
  getUsageBreakdown: async (workspaceId: string) => {
    const data = await fetchAPI<{ breakdown: any[] }>(`/usage/${workspaceId}/breakdown`)
    return data.breakdown || []
  },

  // Model Comparison (Streaming Parallel Test)
  compareModels: async function* (workspaceId: string, message: string, modelA: string, modelB: string) {
    const response = await fetch(`${API_URL}/compare/${workspaceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify({ query: message, model_a: modelA, model_b: modelB })
    })

    if (!response.ok) {
      let errorMessage = 'An error occurred during comparison'
      try {
        const errorData = await response.json()
        errorMessage = errorData.detail || errorData.error || response.statusText
      } catch (e) {
        errorMessage = response.statusText
      }
      throw new ApiError(response.status, errorMessage)
    }

    if (!response.body) return

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      yield chunk
    }
  },

  // Model Comparison Votes
  voteModelCompare: async (workspaceId: string, data: any) => {
    return await fetchAPI<any>(`/compare/${workspaceId}/vote`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },
  getModelCompareVotes: async (workspaceId: string) => {
    const data = await fetchAPI<{ votes: any[] }>(`/compare/${workspaceId}/votes`)
    return data.votes || []
  },

  // Notifications
  getNotifications: async () => {
    return await fetchAPI<any[]>('/notifications')
  },
  markNotificationRead: async (id: string) => {
    return await fetchAPI<any>(`/notifications/${id}/read`, {
      method: 'POST'
    })
  },
  markAllNotificationsRead: async () => {
    return await fetchAPI<any>('/notifications/read-all', {
      method: 'POST'
    })
  },

  // Workflows
  getWorkflows: async (workspaceId: string) => {
    return await fetchAPI<any[]>(`/workflows?workspace_id=${workspaceId}`)
  },
  getWorkflow: async (workflowId: string) => {
    return await fetchAPI<any>(`/workflows/${workflowId}`)
  },
  createWorkflow: async (data: any) => {
    return await fetchAPI<any>('/workflows', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },
  updateWorkflow: async (workflowId: string, data: any) => {
    return await fetchAPI<any>(`/workflows/${workflowId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },
  deleteWorkflow: async (workflowId: string) => {
    return await fetchAPI<any>(`/workflows/${workflowId}`, {
      method: 'DELETE'
    })
  }
}
