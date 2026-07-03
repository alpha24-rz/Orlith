'use client'

import { useState, useEffect } from 'react'
import { mockMembers, mockUser } from '@/lib/mock-data'
import {
  Settings, Users, Brain, Shield, CreditCard, Bell,
  Plus, Trash2, Mail, Crown, Edit2, Eye, ChevronRight,
  Save, Check, X, Key, Globe, Zap, Database, Lock,
  ExternalLink, AlertCircle, CheckCircle2, Copy, Download, Loader2, Building2, Sparkles, RefreshCw
} from 'lucide-react'

import { axiosClient } from '@/lib/axios-client'
import { Server } from 'lucide-react'

const SETTING_TABS = [
  { id: 'workspace', label: 'General', icon: Building2 },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'apikeys', label: 'API Keys', icon: Key },
  { id: 'ai', label: 'AI Models', icon: Sparkles },
  { id: 'security', label: 'Security', icon: Shield },
]

const ROLE_CONFIG = {
  Owner: { color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: Crown },
  Admin: { color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', icon: Shield },
  Editor: { color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: Edit2 },
  Viewer: { color: 'text-text-subtle bg-bg-hover border-border-strong', icon: Eye },
}

import { useWorkspaceStore } from '@/stores/workspace'

export default function SettingsPage() {
  const { activeWorkspace, updateWorkspace, deleteWorkspace, updateAiSettings } = useWorkspaceStore()
  const [activeTab, setActiveTab] = useState('workspace')
  const [defaultChatEndpointId, setDefaultChatEndpointId] = useState('')
  const [defaultChatModel, setDefaultChatModel] = useState('')
  const [defaultEmbeddingEndpointId, setDefaultEmbeddingEndpointId] = useState('')
  const [defaultEmbeddingModel, setDefaultEmbeddingModel] = useState('')
  
  const [members, setMembers] = useState<any[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [isInviting, setIsInviting] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [saved, setSaved] = useState(false)
  const [apiKeyCopied, setApiKeyCopied] = useState(false)
  
  interface ModelResp {
    id: string
    name: string
    endpoint_id: string
    endpoint_name: string
    provider_label: string
  }
  
  const [availableModels, setAvailableModels] = useState<ModelResp[]>([])
  const [endpoints, setEndpoints] = useState<{id: string, name: string}[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

  const [apiKeys, setApiKeys] = useState<any[]>([])
  const [loadingApiKeys, setLoadingApiKeys] = useState(false)
  const [newKeyProvider, setNewKeyProvider] = useState('')
  const [newKeyString, setNewKeyString] = useState('')
  const [newKeyNickname, setNewKeyNickname] = useState('')
  const [isAddingKey, setIsAddingKey] = useState(false)
  const [keyStatuses, setKeyStatuses] = useState<Record<string, { status: 'checking' | 'connected' | 'disconnected', error?: string }>>({})
  
  // Local state for workspace details
  const [wsName, setWsName] = useState('')
  const [wsDesc, setWsDesc] = useState('')
  
  useEffect(() => {
    if (activeWorkspace) {
      setWsName(activeWorkspace.name)
      // Map backend schema to UI states
      setDefaultChatEndpointId((activeWorkspace as any).active_llm_provider || '')
      setDefaultChatModel((activeWorkspace as any).active_llm_model || '')
      setDefaultEmbeddingEndpointId((activeWorkspace as any).active_embedding_provider || '')
      setDefaultEmbeddingModel((activeWorkspace as any).active_embedding_model || '')
    }
  }, [activeWorkspace])

  const fetchModels = () => {
    setLoadingModels(true)
    // Fetch all available models and infer providers
    Promise.all([
      axiosClient.get('/providers/models')
    ]).then(([modRes]) => {
      const models = modRes.data;
      setAvailableModels(models);
      
      const uniqueProviders = Array.from(new Set(models.map((m: any) => m.provider))) as string[];
      const providerList = uniqueProviders.map(p => {
        let name = p;
        if (p === 'openai') name = 'OpenAI';
        if (p === 'anthropic') name = 'Anthropic';
        if (p === 'gemini') name = 'Google Gemini';
        if (p === 'openrouter') name = 'OpenRouter';
        if (p === 'ollama') name = 'Ollama (Local)';
        return { id: p, name };
      });
      setEndpoints(providerList);
      
      if (providerList.length > 0 && !defaultChatEndpointId) {
        setDefaultChatEndpointId(providerList[0].id)
      }
      if (models.length > 0 && !defaultChatModel && providerList.length > 0) {
        const firstEpModels = models.filter((m: any) => m.provider === providerList[0].id)
        if (firstEpModels.length > 0) setDefaultChatModel(firstEpModels[0].id)
      }
    }).catch(err => {
      console.error("Failed to fetch endpoints/models", err)
    }).finally(() => setLoadingModels(false))
  }

  const fetchApiKeys = async () => {
    setLoadingApiKeys(true)
    try {
      const res = await axiosClient.get('/api-keys')
      setApiKeys(res.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingApiKeys(false)
    }
  }

  const validateApiKey = async (keyId: string) => {
    setKeyStatuses(prev => ({
      ...prev,
      [keyId]: { status: 'checking' }
    }))
    try {
      const res = await axiosClient.post(`/api-keys/${keyId}/validate`)
      if (res.data && res.data.valid) {
        setKeyStatuses(prev => ({
          ...prev,
          [keyId]: { status: 'connected' }
        }))
      } else {
        setKeyStatuses(prev => ({
          ...prev,
          [keyId]: { status: 'disconnected', error: res.data?.error || 'Validation failed' }
        }))
      }
    } catch (err: any) {
      setKeyStatuses(prev => ({
        ...prev,
        [keyId]: { status: 'disconnected', error: err.response?.data?.detail || 'Verification error' }
      }))
    }
  }

  // Trigger validation when keys are fetched
  useEffect(() => {
    if (apiKeys.length > 0) {
      apiKeys.forEach(k => {
        validateApiKey(k.id)
      })
    }
  }, [apiKeys])

  useEffect(() => {
    if (activeWorkspace) {
      fetchApiKeys()
    }
  }, [activeWorkspace])

  useEffect(() => {
    fetchModels()
  }, [])

  const saveSettings = async () => {
    if (!activeWorkspace) return
    try {
      if (activeTab === 'workspace') {
        await updateWorkspace(activeWorkspace.id, { name: wsName })
      } else if (activeTab === 'ai') {
        // Enforce single active API key constraint: sync embedding provider to LLM provider
        let embedModel = 'default'
        if (defaultChatEndpointId === 'gemini') {
          embedModel = 'models/gemini-embedding-001'
        } else if (defaultChatEndpointId === 'openai') {
          embedModel = 'text-embedding-3-small'
        } else if (defaultChatEndpointId === 'openrouter') {
          embedModel = 'openrouter/nvidia/llama-nemotron-embed-vl-1b-v2:free'
        } else if (defaultChatEndpointId === 'ollama') {
          embedModel = 'nomic-embed-text'
        }
        await updateAiSettings(activeWorkspace.id, {
          active_llm_provider: defaultChatEndpointId,
          active_llm_model: defaultChatModel,
          active_embedding_provider: defaultChatEndpointId,
          active_embedding_model: embedModel
        })
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error(e)
    }
  }

  const handleDeleteWorkspace = async () => {
    if (!activeWorkspace) return
    if (window.confirm("Are you sure you want to delete this workspace?")) {
      await deleteWorkspace(activeWorkspace.id)
    }
  }

  const handleAddApiKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKeyProvider || !newKeyString) return
    setIsAddingKey(true)
    try {
      await axiosClient.post('/api-keys', {
        provider: newKeyProvider,
        api_key: newKeyString,
        nickname: newKeyNickname || `${newKeyProvider.charAt(0).toUpperCase() + newKeyProvider.slice(1)} Key`
      })
      setNewKeyString('')
      setNewKeyNickname('')
      fetchApiKeys()
      fetchModels()
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to add API key. Check if it is valid.'
      alert(msg)
    } finally {
      setIsAddingKey(false)
    }
  }

  const handleDeleteApiKey = async (id: string) => {
    if (!window.confirm("Are you sure you want to remove this API key? This will disable any models that depend on it.")) return
    try {
      await axiosClient.delete(`/api-keys/${id}`)
      fetchApiKeys()
      fetchModels()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to remove API key')
    }
  }

  const copyApiKey = () => {
    navigator.clipboard.writeText('dm_live_sk_1a2b3c4d5e6f7g8h9i0j')
    setApiKeyCopied(true)
    setTimeout(() => setApiKeyCopied(false), 2000)
  }

  const renderWorkspace = () => (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
        <h3 className="text-sm font-bold mb-4">Workspace Details</h3>
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-text-subtle mb-1.5 block">Workspace Name</label>
            <input
              id="workspace-name"
              value={wsName}
              onChange={e => setWsName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border-strong bg-bg-panel text-sm text-foreground focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-subtle mb-1.5 block">Description</label>
            <textarea
              id="workspace-description"
              rows={2}
              value={wsDesc}
              onChange={e => setWsDesc(e.target.value)}
              placeholder="Workspace description"
              className="w-full px-3 py-2.5 rounded-xl border border-border-strong bg-bg-panel text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-subtle mb-1.5 block">Workspace Color</label>
            <div className="flex gap-2">
              {['#6366F1', '#10B981', '#F59E0B', '#EC4899', '#3B82F6', '#8B5CF6'].map(c => (
                <button
                  key={c}
                  className="w-7 h-7 rounded-full border-2 border-border-strong hover:border-white transition-colors"
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
        <h3 className="text-sm font-bold text-red-400 mb-2">Danger Zone</h3>
        <p className="text-xs text-text-subtle mb-4">Once you delete a workspace, there is no going back. All documents, queries, and data will be permanently removed.</p>
        <button id="delete-workspace-btn" onClick={handleDeleteWorkspace} className="px-4 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-all">
          Delete workspace
        </button>
      </div>
      
      <button
        onClick={saveSettings}
        className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20 w-full sm:w-auto mt-2"
      >
        {saved ? <><Check className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save workspace details</>}
      </button>
    </div>
  )

  const fetchMembers = async () => {
    if (!activeWorkspace) return
    setLoadingMembers(true)
    try {
      const res = await axiosClient.get(`/workspaces/${activeWorkspace.id}/members?skip=0&limit=50`)
      setMembers(res.data.members || [])
    } catch (err) {
      console.error("Failed to fetch members", err)
    } finally {
      setLoadingMembers(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'members') {
      fetchMembers()
    }
  }, [activeTab, activeWorkspace])

  const handleInviteMember = async () => {
    if (!activeWorkspace || !inviteEmail.trim()) return
    setIsInviting(true)
    try {
      await axiosClient.post(`/workspaces/${activeWorkspace.id}/members`, { email: inviteEmail.trim() })
      setInviteEmail('')
      fetchMembers()
    } catch (err: any) {
      let errorMsg = err.response?.data?.detail || 'Failed to invite member'
      if (err.response?.status === 404) errorMsg = "User with this email does not exist in the platform"
      if (err.response?.status === 400 && errorMsg.includes("already a member")) errorMsg = "User is already a member of this workspace"
      if (err.response?.status === 403) errorMsg = "Only workspace owners and admins can invite members"
      if (err.response?.status === 429) errorMsg = "Too many invites. Please wait a moment."
      alert(errorMsg)
    } finally {
      setIsInviting(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!activeWorkspace) return
    if (!confirm('Are you sure you want to remove this member?')) return
    
    setIsDeleting(userId)
    const prev = [...members]
    setMembers(prev.filter(m => m.id !== userId))
    
    try {
      await axiosClient.delete(`/workspaces/${activeWorkspace.id}/members/${userId}`)
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to remove member')
      setMembers(prev)
    } finally {
      setIsDeleting(null)
    }
  }

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!activeWorkspace) return
    const prev = [...members]
    setMembers(prev.map(m => m.id === userId ? { ...m, role: newRole } : m))
    
    try {
      await axiosClient.patch(`/workspaces/${activeWorkspace.id}/members/${userId}/role`, { role: newRole })
      setMembers(prev => prev.map(m => m.id === userId ? { ...m, role: newRole } : m))
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update role')
      setMembers(prev)
    }
  }

  const renderMembers = () => (
    <div className="flex flex-col gap-5">
      {/* Invite */}
      <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
        <h3 className="text-sm font-bold mb-4">Invite Members</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border-strong bg-bg-panel text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <button
            id="invite-btn"
            onClick={handleInviteMember}
            disabled={isInviting}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> {isInviting ? 'Inviting...' : 'Invite'}
          </button>
        </div>
      </div>

      {/* Members list */}
      <div className="rounded-2xl border border-border-strong bg-bg-input overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <h3 className="text-sm font-bold">Team Members ({members.length})</h3>
        </div>
        {loadingMembers ? (
          <div className="px-5 py-8 text-center text-text-muted text-sm animate-pulse">
            Loading members...
          </div>
        ) : (
          members.map((m, i) => {
          const roleConf = ROLE_CONFIG[m.role as keyof typeof ROLE_CONFIG]
          return (
            <div key={m.id} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 px-5 py-3.5 ${i < members.length - 1 ? 'border-b border-border-subtle' : ''}`}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-600/20 border border-indigo-300 dark:border-indigo-500/20 flex items-center justify-center text-sm font-bold text-indigo-700 dark:text-indigo-300 shrink-0">
                  {m.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{m.name}</span>
                    {m.id === mockUser.id && <span className="text-[10px] text-text-muted bg-bg-hover px-1.5 py-0.5 rounded">You</span>}
                  </div>
                  <div className="text-xs text-text-muted truncate">{m.email}</div>
                  <div className="text-[10px] text-text-muted sm:hidden mt-0.5">Active {m.lastActive}</div>
                </div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t border-border-subtle/40 sm:border-0 w-full sm:w-auto">
                <span className="text-[10px] text-text-muted hidden sm:inline">Active {m.lastActive}</span>
                {m.role === 'Owner' ? (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${roleConf.color}`}>
                    <roleConf.icon className="w-3 h-3" /> {m.role}
                  </span>
                ) : (
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.id, e.target.value)}
                    className={`bg-bg-panel border border-border-strong outline-none cursor-pointer px-2.5 py-1 rounded-full text-xs font-medium ${roleConf.color}`}
                  >
                    <option value="Admin">Admin</option>
                    <option value="Editor">Editor</option>
                    <option value="Viewer">Viewer</option>
                  </select>
                )}
                {m.role !== 'Owner' && (
                  <button
                    id={`remove-member-${m.id}`}
                    onClick={() => handleRemoveMember(m.id)}
                    disabled={isDeleting === m.id}
                    className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )
        }) )}
      </div>

      {/* Role explanation */}
      <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
        <h3 className="text-sm font-bold mb-3">Role Permissions</h3>
        <div className="flex flex-col gap-2">
          {[
            { role: 'Owner', desc: 'Full control — delete workspace, manage all members' },
            { role: 'Admin', desc: 'Manage members, settings, and all documents' },
            { role: 'Editor', desc: 'Upload documents, run queries and extractions' },
            { role: 'Viewer', desc: 'Read-only access — view docs and query results only' },
          ].map(({ role, desc }) => {
            const conf = ROLE_CONFIG[role as keyof typeof ROLE_CONFIG]
            return (
              <div key={role} className="flex items-start gap-3 p-3 rounded-xl bg-bg-panel border border-border-strong">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${conf.color}`}>
                  <conf.icon className="w-3 h-3" /> {role}
                </span>
                <span className="text-[11px] text-text-subtle leading-relaxed">{desc}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  const renderAI = () => {
    const chatModelsForEndpoint = availableModels.filter((m: any) => m.provider === defaultChatEndpointId)
    const embedModelsForEndpoint = availableModels.filter((m: any) => m.provider === defaultEmbeddingEndpointId)
    
    return (
    <div className="flex flex-col gap-5">
      {/* Primary endpoint */}
      <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
        <h3 className="text-sm font-bold mb-1">Primary LLM Endpoint</h3>
        <p className="text-xs text-text-muted mb-4">Used for all Q&A, summarization, and extraction tasks.</p>
        
        {endpoints.length === 0 ? (
          <div className="text-xs text-amber-400 p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
            You need to configure an Endpoint in the <strong>Endpoints</strong> tab first.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {endpoints.map(p => (
              <button
                key={p.id}
                id={`provider-${p.id}`}
                onClick={() => setDefaultChatEndpointId(p.id)}
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                  defaultChatEndpointId === p.id
                    ? 'border-indigo-500/50 bg-indigo-600/10'
                    : 'border-border-strong hover:border-border-strong hover:bg-bg-hover'
                }`}
              >
                <div className={`w-3 h-3 rounded-full border-2 mt-0.5 shrink-0 transition-all ${
                  defaultChatEndpointId === p.id ? 'border-indigo-500 bg-indigo-500' : 'border-border-strong'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold">{p.name}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Model selection */}
        {defaultChatEndpointId && (
          <div className="mt-4 border-t border-border-subtle pt-4">
            <h4 className="text-xs font-bold mb-3 text-text-subtle">Chat Model</h4>
            {loadingModels ? (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <Loader2 className="w-4 h-4 animate-spin" /> Fetching available models...
              </div>
            ) : chatModelsForEndpoint.length > 0 ? (
              <select
                value={defaultChatModel}
                onChange={(e) => setDefaultChatModel(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border-strong bg-bg-panel text-sm text-foreground focus:outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="">-- Select a model --</option>
                {chatModelsForEndpoint.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.display_name || m.name || m.id}</option>
                ))}
              </select>
            ) : (
              <div className="text-xs text-text-muted">
                No models found for this endpoint. Try typing the model ID manually:
                <input
                  type="text"
                  value={defaultChatModel}
                  onChange={(e) => setDefaultChatModel(e.target.value)}
                  placeholder="e.g. gpt-4"
                  className="w-full px-3 py-2.5 rounded-xl border border-border-strong bg-bg-panel text-sm text-foreground focus:outline-none focus:border-indigo-500 transition-colors mt-2"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Embeddings selection hidden to enforce single active key constraint */}
      {false && (
        <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
          <h3 className="text-sm font-bold mb-1">Embedding Provider</h3>
          <p className="text-xs text-text-muted mb-4">Used for vector indexing and semantic search.</p>
          
          {endpoints.length === 0 ? (
            <div className="text-xs text-text-muted">Configure an endpoint first.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              {endpoints.map(e => (
                <button
                  key={e.id}
                  onClick={() => setDefaultEmbeddingEndpointId(e.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    defaultEmbeddingEndpointId === e.id
                      ? 'border-indigo-500/50 bg-indigo-600/10'
                      : 'border-border-strong hover:border-border-strong hover:bg-bg-hover'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full border-2 shrink-0 transition-all ${
                    defaultEmbeddingEndpointId === e.id ? 'border-indigo-500 bg-indigo-500' : 'border-border-strong'
                  }`} />
                  <span className="text-xs font-medium flex-1">{e.name}</span>
                </button>
              ))}
            </div>
          )}
          
          {/* Model selection */}
          {defaultEmbeddingEndpointId && (
            <div className="mt-4 border-t border-border-subtle pt-4">
              <h4 className="text-xs font-bold mb-3 text-text-subtle">Embedding Model</h4>
              <div className="text-xs text-text-muted mb-2">Type the exact ID of the embedding model you wish to use (e.g. text-embedding-3-small, nomic-embed-text)</div>
              <input
                type="text"
                value={defaultEmbeddingModel}
                onChange={(e) => setDefaultEmbeddingModel(e.target.value)}
                placeholder="e.g. text-embedding-3-small"
                className="w-full px-3 py-2.5 rounded-xl border border-border-strong bg-bg-panel text-sm text-foreground focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          )}
        </div>
      )}

      {/* Model routing */}
      <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
        <h3 className="text-sm font-bold mb-3">Intelligent Routing</h3>
        <div className="flex flex-col gap-3">
          {[
            { id: 'cost-routing', label: 'Cost-priority routing', desc: 'Simple Q&A → cheap model; complex synthesis → capable model', default: true },
            { id: 'fallback-chain', label: 'Automatic fallback', desc: 'If primary errors or exceeds 5s timeout, retry with fallback provider', default: true },
            { id: 'ab-testing', label: 'A/B testing mode', desc: 'Split a % of queries to secondary provider for evaluation', default: false },
            { id: 'data-residency', label: 'EU data residency routing', desc: 'EU-tagged workspaces route only to Mistral AI or Azure EU region', default: false },
          ].map(r => (
            <div key={r.id} className="flex items-start gap-3 p-3 rounded-xl bg-bg-panel border border-border-strong">
              <input
                id={r.id}
                type="checkbox"
                defaultChecked={r.default}
                className="mt-0.5 accent-indigo-500"
              />
              <div>
                <div className="text-xs font-semibold mb-0.5">{r.label}</div>
                <div className="text-[10px] text-text-muted">{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        id="save-ai-settings"
        onClick={saveSettings}
        className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20 w-full sm:w-auto"
      >
        {saved ? <><Check className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save settings</>}
      </button>
    </div>
    )
  }

  const renderSecurity = () => (
    <div className="flex flex-col gap-5">
      {/* API Keys */}
      <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
        <h3 className="text-sm font-bold mb-1">API Keys</h3>
        <p className="text-xs text-text-muted mb-4">Use these to integrate DocuMind into your internal tools via REST API.</p>
        <div className="flex items-center gap-3 p-3 rounded-xl bg-bg-panel border border-border-strong mb-3">
          <Key className="w-4 h-4 text-indigo-400 shrink-0" />
          <code className="flex-1 text-xs text-text-subtle font-mono">dm_live_sk_1a2b3c4d5e6f•••••••••••••</code>
          <button
            id="copy-api-key"
            onClick={copyApiKey}
            className="text-xs text-text-muted hover:text-foreground transition-colors"
          >
            {apiKeyCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <button id="generate-new-key" className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border-strong bg-bg-panel hover:border-border-strong text-xs font-medium text-text-subtle hover:text-foreground transition-all">
          <Plus className="w-3.5 h-3.5" /> Generate new key
        </button>
      </div>

      {/* Security settings */}
      <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
        <h3 className="text-sm font-bold mb-4">Security Settings</h3>
        <div className="flex flex-col gap-3">
          {[
            { id: 'pii-detection', label: 'PII Detection & Redaction', desc: 'Automatically detect and redact PII before sending to external LLM providers', enabled: false },
            { id: 'prompt-guard', label: 'Prompt Injection Guard', desc: 'Apply prompt injection filters before content is sent to any provider', enabled: true },
            { id: 'audit-log', label: 'Full Audit Log', desc: 'Log every query, response, and document access with user identity', enabled: true },
            { id: 'gdpr-deletion', label: 'GDPR Right-to-Deletion', desc: 'Deletion propagates through vector store, document store, and logs', enabled: true },
          ].map(s => (
            <div key={s.id} className="flex items-start justify-between gap-4 p-3 rounded-xl bg-bg-panel border border-border-strong">
              <div>
                <div className="text-xs font-semibold mb-0.5">{s.label}</div>
                <div className="text-[10px] text-text-muted">{s.desc}</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input id={s.id} type="checkbox" defaultChecked={s.enabled} className="sr-only peer" />
                <div className="w-9 h-5 bg-[#2A2A3A] peer-checked:bg-indigo-600 rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4 transition-colors" />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-bold">Compliance Status</h3>
        </div>
        <div className="flex flex-col gap-2">
          {[
            { label: 'AES-256 encryption at rest', done: true },
            { label: 'TLS 1.3 in transit', done: true },
            { label: 'Tenant namespace isolation', done: true },
            { label: 'SOC 2 Type II controls implemented', done: true },
            { label: 'SOC 2 Type II audit completed', done: false },
            { label: 'Penetration testing', done: false },
          ].map(c => (
            <div key={c.label} className="flex items-center gap-2.5 text-xs">
              {c.done ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />}
              <span className={c.done ? 'text-foreground/80' : 'text-text-subtle'}>{c.label}</span>
              {!c.done && <span className="text-[10px] text-amber-400 ml-auto">Planned</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const renderApiKeys = () => (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
        <h3 className="text-sm font-bold mb-1">Add API Key</h3>
        <p className="text-xs text-text-muted mb-4">Connect your own API key to access models from this provider. Your keys are encrypted at rest.</p>
        
        <form onSubmit={handleAddApiKey} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-1.5">Provider</label>
              <select
                value={newKeyProvider}
                onChange={(e) => {
                  setNewKeyProvider(e.target.value)
                  if (!newKeyNickname && e.target.value) setNewKeyNickname(`${e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1)} Key`)
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-border-strong bg-bg-panel text-xs text-foreground focus:outline-none focus:border-indigo-500 transition-colors"
                required
              >
                <option value="">-- Select Provider --</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Google Gemini</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-1.5">Nickname (Optional)</label>
              <input
                type="text"
                value={newKeyNickname}
                onChange={(e) => setNewKeyNickname(e.target.value)}
                placeholder="e.g. My Prod Key"
                className="w-full px-3 py-2.5 rounded-xl border border-border-strong bg-bg-panel text-xs text-foreground focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-1.5">API Key</label>
            <div className="relative">
              <input
                type="password"
                value={newKeyString}
                onChange={(e) => setNewKeyString(e.target.value)}
                placeholder="sk-..."
                className="w-full pl-3 pr-10 py-2.5 rounded-xl border border-border-strong bg-bg-panel text-xs text-foreground focus:outline-none focus:border-indigo-500 transition-colors"
                required
              />
              <Key className="w-4 h-4 text-text-muted absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>
          <div className="flex justify-end mt-2">
            <button
              type="submit"
              disabled={isAddingKey || !newKeyProvider || !newKeyString}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all"
            >
              {isAddingKey ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</> : <><Plus className="w-4 h-4" /> Add Key</>}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-border-strong bg-bg-input p-5">
        <h3 className="text-sm font-bold mb-4">Connected API Keys</h3>
        {loadingApiKeys ? (
          <div className="text-xs text-text-muted animate-pulse">Loading keys...</div>
        ) : apiKeys.length === 0 ? (
          <div className="text-xs text-text-muted p-4 bg-bg-panel rounded-xl text-center border border-border-strong border-dashed">
            No API keys connected yet. Add one above to unlock AI models.
          </div>
        ) : (
          <div className="space-y-2">
            {apiKeys.map(k => (
              <div key={k.id} className="flex items-center justify-between p-3 bg-bg-panel border border-border-strong rounded-xl">
                <div>
                  <div className="text-sm font-bold text-foreground flex items-center gap-2 flex-wrap">
                    {k.nickname || k.provider}
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full uppercase tracking-wider">{k.provider}</span>
                    {(() => {
                      const statusInfo = keyStatuses[k.id];
                      if (!statusInfo) return null;
                      if (statusInfo.status === 'checking') {
                        return (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full animate-pulse">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            Checking...
                          </span>
                        )
                      }
                      if (statusInfo.status === 'connected') {
                        return (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full" title="Connected successfully">
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                            Connected
                          </span>
                        )
                      }
                      if (statusInfo.status === 'disconnected') {
                        return (
                          <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full" title={statusInfo.error || "Key validation failed"}>
                            <AlertCircle className="w-2.5 h-2.5 text-rose-400" />
                            Disconnected
                          </span>
                        )
                      }
                      return null;
                    })()}
                  </div>
                  <div className="text-xs text-text-muted mt-1 font-mono">{k.masked_key}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => validateApiKey(k.id)}
                    disabled={keyStatuses[k.id]?.status === 'checking'}
                    className="p-2 text-text-muted hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors disabled:opacity-50"
                    title="Test Connection"
                  >
                    <RefreshCw className={`w-4 h-4 ${keyStatuses[k.id]?.status === 'checking' ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => handleDeleteApiKey(k.id)}
                    className="p-2 text-text-muted hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                    title="Remove Key"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const renderContent = () => {
    switch (activeTab) {
      case 'workspace': return renderWorkspace()
      case 'members': return renderMembers()
      case 'apikeys': return renderApiKeys()
      case 'ai': return renderAI()
      case 'security': return renderSecurity()

    }
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black mb-2">Settings</h1>
        <p className="text-sm text-text-subtle">Manage workspace, members, and AI providers</p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar tabs */}
        <div className="md:w-52 shrink-0">
          <nav className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0" style={{ scrollbarWidth: 'none' }}>
            {SETTING_TABS.map(tab => (
              <button
                key={tab.id}
                id={`settings-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all text-left shrink-0 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/20'
                    : 'text-text-subtle hover:text-foreground hover:bg-bg-hover'
                }`}
              >
                <tab.icon className="w-4 h-4 shrink-0" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {renderContent()}
        </div>
      </div>
    </div>
  </div>
  )
}


