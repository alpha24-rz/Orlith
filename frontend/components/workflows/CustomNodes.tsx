import { Handle, Position } from '@xyflow/react'
import { Brain, FileText, Settings, Database, Code, GitBranch, Save, Search, MessageSquare, Play, Bot, FileSearch, CheckCircle2, User } from 'lucide-react'

// --- Interfaces for Node Data (Schema Contracts for Executor) ---
export interface AgentNodeData {
  model: string
  role: string
  systemPrompt: string
  temperature: number
  maxTokens: number
}

export interface RagNodeData {
  knowledgeBase: string
  topK: number
}

export interface ToolNodeData {
  tool: string
  config: Record<string, any>
}

export interface MemoryNodeData {
  memoryType: "conversation" | "long_term"
  windowSize: number
}

export interface HumanReviewNodeData {
  approvalRequired: boolean
}

// ----------------------------------------------------------------

const BaseNode = ({ icon: Icon, title, type, color, children, hasInput = true, hasOutput = true }: any) => {
  return (
    <div className={`rounded-xl border border-border-strong bg-bg-panel shadow-xl min-w-[280px] overflow-hidden`}>
      <div className={`px-4 py-2.5 flex items-center gap-2 border-b border-border-strong ${color}`}>
        <Icon className="w-4 h-4 text-white" />
        <span className="text-xs font-bold text-white uppercase tracking-wider">{title}</span>
        <span className="ml-auto text-[9px] text-white/90 font-mono bg-black/25 px-2 py-0.5 rounded">{type}</span>
      </div>
      <div className="p-4 space-y-3 relative">
        {children}
      </div>
      {hasInput && <Handle type="target" position={Position.Left} className="w-3.5 h-3.5 bg-indigo-400 border-2 border-bg-panel" />}
      {hasOutput && <Handle type="source" position={Position.Right} className="w-3.5 h-3.5 bg-emerald-400 border-2 border-bg-panel" />}
    </div>
  )
}

export const InputNode = ({ data }: any) => (
  <BaseNode icon={Play} title="Input Trigger" type="INPUT" color="bg-emerald-600" hasInput={false}>
    <div className="text-xs text-text-subtle">Starts the workflow with a user query or document.</div>
    <input type="text" className="w-full mt-2 text-xs p-2 rounded-lg bg-bg-input border border-border-subtle text-foreground placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors" placeholder="Example Query..." defaultValue={data.query} />
  </BaseNode>
)

export const OutputNode = ({ data }: any) => (
  <BaseNode icon={Save} title="Final Output" type="OUTPUT" color="bg-rose-600" hasOutput={false}>
    <div className="text-xs text-text-subtle">Returns the final synthesized answer to the user.</div>
  </BaseNode>
)

export const AgentNode = ({ data }: any) => {
  const nodeData = data as Partial<AgentNodeData>;
  return (
    <BaseNode icon={Bot} title="LLM Agent" type="AGENT" color="bg-indigo-600">
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-text-muted font-bold uppercase mb-1.5 block tracking-wider">Role</label>
          <input type="text" className="w-full text-xs p-2 rounded-lg bg-bg-input border border-border-subtle text-foreground placeholder-text-muted focus:outline-none focus:border-indigo-500" placeholder="e.g. Researcher" defaultValue={nodeData.role} />
        </div>
        <div>
          <label className="text-[10px] text-text-muted font-bold uppercase mb-1.5 block tracking-wider">System Prompt</label>
          <textarea className="w-full text-xs p-2 rounded-lg bg-bg-input border border-border-subtle text-foreground placeholder-text-muted resize-none h-20 focus:outline-none focus:border-indigo-500" placeholder="You are an expert..." defaultValue={nodeData.systemPrompt} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-text-muted font-bold uppercase mb-1.5 block tracking-wider">Model</label>
            <select className="w-full text-xs p-2 rounded-lg bg-bg-input border border-border-subtle text-foreground focus:outline-none focus:border-indigo-500" defaultValue={nodeData.model || "gpt-4o"}>
              <option value="gpt-4o">GPT-4o</option>
              <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
              <option value="gemini-1-5-pro">Gemini 1.5 Pro</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-text-muted font-bold uppercase mb-1.5 block tracking-wider">Max Tokens</label>
            <input type="number" className="w-full text-xs p-2 rounded-lg bg-bg-input border border-border-subtle text-foreground focus:outline-none focus:border-indigo-500" defaultValue={nodeData.maxTokens || 4000} />
          </div>
        </div>
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Temperature ({nodeData.temperature || 0.7})</label>
          </div>
          <input type="range" min="0" max="1" step="0.1" className="w-full accent-indigo-500" defaultValue={nodeData.temperature || 0.7} />
        </div>
      </div>
    </BaseNode>
  )
}

export const RAGNode = ({ data }: any) => {
  const nodeData = data as Partial<RagNodeData>;
  return (
    <BaseNode icon={Database} title="RAG Retrieval" type="RAG" color="bg-amber-600">
      <div className="text-xs text-text-subtle mb-3">Retrieves semantic context from workspace documents.</div>
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-text-muted font-bold uppercase mb-1.5 block tracking-wider">Knowledge Base</label>
          <select className="w-full text-xs p-2 rounded-lg bg-bg-input border border-border-subtle text-foreground focus:outline-none focus:border-amber-500" defaultValue={nodeData.knowledgeBase || "default"}>
            <option value="default">Default Workspace</option>
            <option value="shared">Shared Documents</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-bg-input border border-border-subtle">
          <span className="text-[10px] text-text-subtle font-bold uppercase tracking-wider">Top K Chunks</span>
          <input type="number" className="w-16 text-xs p-1 rounded bg-background border border-border-strong text-foreground text-center focus:outline-none focus:border-amber-500" defaultValue={nodeData.topK || 5} min={1} max={20} />
        </div>
      </div>
    </BaseNode>
  )
}

export const ToolNode = ({ data }: any) => {
  const nodeData = data as Partial<ToolNodeData>;
  return (
    <BaseNode icon={Code} title="External Tool" type="TOOL" color="bg-cyan-600">
      <div className="space-y-2">
        <label className="text-[10px] text-text-muted font-bold uppercase mb-1.5 block tracking-wider">Selected Tool</label>
        <select className="w-full text-xs p-2 rounded-lg bg-bg-input border border-border-subtle text-foreground focus:outline-none focus:border-cyan-500" defaultValue={nodeData.tool || "web_search"}>
          <option value="web_search">Web Search</option>
          <option value="database_query">Database Query</option>
          <option value="api_call">API Request</option>
        </select>
        <div className="text-[10px] text-text-muted mt-2">Tool configuration will be dynamically loaded based on selection.</div>
      </div>
    </BaseNode>
  )
}

export const ConditionNode = ({ data }: any) => (
  <BaseNode icon={GitBranch} title="Condition" type="ROUTER" color="bg-purple-600" hasOutput={false}>
    <div className="text-xs text-text-subtle mb-4">Routes flow based on conditional evaluation.</div>
    <div className="relative h-16 border border-border-subtle rounded-lg bg-bg-input p-2 flex flex-col justify-between">
      <div className="text-[10px] font-bold text-emerald-500">→ True Branch</div>
      <div className="text-[10px] font-bold text-rose-500">→ False Branch</div>
    </div>
    <Handle type="source" position={Position.Right} id="true" style={{ top: '65px' }} className="w-3.5 h-3.5 bg-emerald-500 border-2 border-bg-panel" />
    <Handle type="source" position={Position.Right} id="false" style={{ top: '100px' }} className="w-3.5 h-3.5 bg-rose-500 border-2 border-bg-panel" />
  </BaseNode>
)

export const MemoryNode = ({ data }: any) => {
  const nodeData = data as Partial<MemoryNodeData>;
  return (
    <BaseNode icon={MessageSquare} title="Memory" type="MEMORY" color="bg-fuchsia-600">
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-text-muted font-bold uppercase mb-1.5 block tracking-wider">Memory Type</label>
          <select className="w-full text-xs p-2 rounded-lg bg-bg-input border border-border-subtle text-foreground focus:outline-none focus:border-fuchsia-500" defaultValue={nodeData.memoryType || "conversation"}>
            <option value="conversation">Conversation Window</option>
            <option value="long_term">Long-Term (Vector Store)</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-bg-input border border-border-subtle">
          <span className="text-[10px] text-text-subtle font-bold uppercase tracking-wider">Window Size</span>
          <input type="number" className="w-16 text-xs p-1 rounded bg-background border border-border-strong text-foreground text-center focus:outline-none focus:border-fuchsia-500" defaultValue={nodeData.windowSize || 10} min={1} max={50} />
        </div>
      </div>
    </BaseNode>
  )
}

// Additional Nodes requested
export const PromptTemplateNode = ({ data }: any) => (
  <BaseNode icon={FileText} title="Prompt Template" type="PROMPT" color="bg-blue-500">
    <div className="text-xs text-text-subtle mb-2">Formats input variables into a structured prompt.</div>
  </BaseNode>
)

export const DocumentLoaderNode = ({ data }: any) => (
  <BaseNode icon={FileSearch} title="Document Loader" type="LOADER" color="bg-orange-500">
    <div className="text-xs text-text-subtle mb-2">Loads specific PDFs or text files into context.</div>
  </BaseNode>
)

export const EvaluatorNode = ({ data }: any) => (
  <BaseNode icon={CheckCircle2} title="Evaluator" type="EVAL" color="bg-teal-500">
    <div className="text-xs text-text-subtle mb-2">Scores outputs against predefined criteria.</div>
  </BaseNode>
)

export const HumanReviewNode = ({ data }: any) => {
  const nodeData = data as Partial<HumanReviewNodeData>;
  return (
    <BaseNode icon={User} title="Human Review" type="REVIEW" color="bg-pink-600">
      <div className="text-xs text-text-subtle mb-3">Pauses execution pending human approval.</div>
      <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
        <input type="checkbox" defaultChecked={nodeData.approvalRequired ?? true} className="accent-pink-500 w-4 h-4 rounded border-border-strong" />
        Require Explicit Approval
      </label>
    </BaseNode>
  )
}

export const nodeTypes = {
  inputNode: InputNode,
  agentNode: AgentNode,
  outputNode: OutputNode,
  ragNode: RAGNode,
  toolNode: ToolNode,
  conditionNode: ConditionNode,
  memoryNode: MemoryNode,
  promptNode: PromptTemplateNode,
  loaderNode: DocumentLoaderNode,
  evaluatorNode: EvaluatorNode,
  reviewNode: HumanReviewNode,
}
