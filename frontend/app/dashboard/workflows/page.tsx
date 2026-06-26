'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  Connection,
  Edge,
  Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { v4 as uuidv4 } from 'uuid'
import { nodeTypes } from '@/components/workflows/CustomNodes'
import { Play, Save, Bot, Database, Code, GitBranch, MessageSquare, Workflow, FileText, FileSearch, CheckCircle2, User, Loader2, Menu, X } from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspace'
import { api } from '@/lib/api-client'
import { useNotificationStore } from '@/stores/notification'

const SIDEBAR_NODES = [
  { type: 'inputNode', label: 'Input Trigger', icon: Play, desc: 'Start workflow', color: 'text-emerald-500' },
  { type: 'agentNode', label: 'LLM Agent', icon: Bot, desc: 'Process tasks', color: 'text-indigo-500' },
  { type: 'ragNode', label: 'RAG Retrieval', icon: Database, desc: 'Fetch context', color: 'text-amber-500' },
  { type: 'toolNode', label: 'External Tool', icon: Code, desc: 'API / Search', color: 'text-cyan-500' },
  { type: 'conditionNode', label: 'Condition', icon: GitBranch, desc: 'Logic router', color: 'text-purple-500' },
  { type: 'memoryNode', label: 'Memory', icon: MessageSquare, desc: 'Chat history', color: 'text-fuchsia-500' },
  { type: 'promptNode', label: 'Prompt Template', icon: FileText, desc: 'Format inputs', color: 'text-blue-500' },
  { type: 'loaderNode', label: 'Document Loader', icon: FileSearch, desc: 'Load files', color: 'text-orange-500' },
  { type: 'evaluatorNode', label: 'Evaluator', icon: CheckCircle2, desc: 'Score outputs', color: 'text-teal-500' },
  { type: 'reviewNode', label: 'Human Review', icon: User, desc: 'Pause for approval', color: 'text-pink-600' },
  { type: 'outputNode', label: 'Final Output', icon: Save, desc: 'End workflow', color: 'text-rose-500' },
]

const defaultNodes: Node[] = [
  { id: '1', type: 'inputNode', position: { x: 100, y: 250 }, data: { query: '' } },
  { id: '2', type: 'agentNode', position: { x: 500, y: 250 }, data: { systemPrompt: 'You are an AI assistant.', model: 'gpt-4o', temperature: 0.7, maxTokens: 4000, role: "Assistant" } },
  { id: '3', type: 'outputNode', position: { x: 900, y: 250 }, data: {} },
]

const defaultEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: '#818CF8' } },
  { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: '#34D399' } },
]

function WorkflowBuilder() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges)
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)

  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace)
  const addNotification = useNotificationStore((state) => state.addNotification)

  // Fetch workflows on mount
  useEffect(() => {
    const fetchWorkflows = async () => {
      if (!activeWorkspace?.id) return
      try {
        const workflows = await api.getWorkflows(activeWorkspace.id)
        if (workflows && workflows.length > 0) {
          const latest = workflows[0]
          setCurrentWorkflowId(latest.id)
          if (latest.nodes?.length > 0) setNodes(latest.nodes)
          if (latest.edges?.length > 0) setEdges(latest.edges)
          // Viewport is restored below if we had the instance, but we can just fitView for now
        }
      } catch (e) {
        console.error("Failed to load workflows", e)
      }
    }
    fetchWorkflows()
  }, [activeWorkspace?.id, setNodes, setEdges])

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#818CF8' } }, eds)),
    [setEdges],
  )

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const type = event.dataTransfer.getData('application/reactflow')
      if (typeof type === 'undefined' || !type) return

      if (!reactFlowInstance) return

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const newNode: Node = {
        id: uuidv4(),
        type,
        position,
        data: { label: `${type} node` },
      }

      setNodes((nds) => nds.concat(newNode))
    },
    [reactFlowInstance, setNodes],
  )

  const saveWorkflow = async () => {
    if (!reactFlowInstance || !activeWorkspace?.id) return
    
    setIsSaving(true)
    try {
      const flow = reactFlowInstance.toObject()
      
      const workflowPayload = {
        workspace_id: activeWorkspace.id,
        name: "Research Workflow",
        description: "Primary agent orchestration pipeline",
        workflow_type: "agent",
        is_active: true,
        version: 1,
        nodes: flow.nodes,
        edges: flow.edges,
        viewport: flow.viewport
      }

      if (currentWorkflowId) {
        await api.updateWorkflow(currentWorkflowId, workflowPayload)
      } else {
        const created = await api.createWorkflow(workflowPayload)
        setCurrentWorkflowId(created.id)
      }

      addNotification({
        id: uuidv4(),
        title: 'Workflow Saved',
        description: 'Workflow saved successfully to database!',
        type: 'success',
        is_read: false,
        created_at: new Date().toISOString()
      })
    } catch (e) {
      console.error(e)
      addNotification({
        id: uuidv4(),
        title: 'Save Failed',
        description: 'Failed to save workflow',
        type: 'error',
        is_read: false,
        created_at: new Date().toISOString()
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="h-full flex overflow-hidden bg-background flex-col">
      {/* Header bar */}
      <div className="h-14 border-b border-border-subtle bg-background flex items-center justify-between px-6 shrink-0 z-10 relative">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLibraryOpen(!libraryOpen)}
            className="md:hidden p-1.5 text-text-subtle hover:text-foreground hover:bg-bg-hover rounded-lg border border-border-strong mr-1 shrink-0"
            title="Toggle Node Library"
          >
            <Menu className="w-4 h-4" />
          </button>
          <Workflow className="w-5 h-5 text-indigo-400 shrink-0" />
          <h1 className="text-sm font-bold text-foreground truncate">AI Workflow Builder <span className="text-[10px] font-normal text-text-muted bg-bg-panel px-2 py-0.5 rounded-full border border-border-strong ml-1 hidden sm:inline">Phase 1.5</span></h1>
        </div>
        <button 
          onClick={saveWorkflow}
          disabled={isSaving}
          className="flex items-center justify-center gap-1.5 p-2 sm:px-4 sm:py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors shadow-lg shadow-indigo-500/20 active:scale-95 shrink-0"
        >
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">
            {isSaving ? 'Saving...' : 'Save Workflow'}
          </span>
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Sidebar overlay backdrop */}
        {libraryOpen && (
          <div 
            className="md:hidden fixed inset-0 z-20 bg-black/60 backdrop-blur-sm"
            onClick={() => setLibraryOpen(false)}
          />
        )}

        {/* Node Library Sidebar */}
        <div className={`fixed md:relative inset-y-0 md:inset-auto left-0 z-30 w-64 h-full md:h-auto border-r border-border-subtle bg-bg-panel flex flex-col shrink-0 transition-transform duration-300 md:transform-none ${libraryOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          <div className="p-4 border-b border-border-subtle flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold text-foreground uppercase tracking-wider">Node Library</h2>
              <p className="text-[10px] text-text-muted mt-1">Drag and drop nodes into canvas</p>
            </div>
            <button
              onClick={() => setLibraryOpen(false)}
              className="md:hidden p-1.5 rounded-lg text-text-muted hover:text-foreground hover:bg-bg-hover transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {SIDEBAR_NODES.map((node) => (
              <div
                key={node.type}
                className="p-3 border border-border-strong bg-background rounded-xl cursor-grab active:cursor-grabbing hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-colors flex items-center gap-3"
                onDragStart={(event) => onDragStart(event, node.type)}
                draggable
              >
                <div className={`p-1.5 rounded-lg bg-bg-input ${node.color}`}>
                  <node.icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground">{node.label}</div>
                  <div className="text-[10px] text-text-muted">{node.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 relative" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView
            className="bg-background"
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--border-strong)" gap={16} size={1} />
            <Controls className="bg-bg-panel border-border-strong fill-foreground" />
          </ReactFlow>
        </div>
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <ReactFlowProvider>
      <WorkflowBuilder />
    </ReactFlowProvider>
  )
}
