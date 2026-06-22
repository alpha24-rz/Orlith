import { Document, Workspace, ChatMessage, User, ExtractionJob, QueryStats } from './types'

// ── Users ───────────────────────────────────────────────────────────────────

export const mockUser: User = {
  id: 'usr_01',
  name: 'Alpha Alfarizi',
  email: 'alpha@acme.corp',
  avatar: 'AA',
  role: 'Owner',
  plan: 'Growth',
}

// ── Workspaces ───────────────────────────────────────────────────────────────

export const mockWorkspaces: Workspace[] = [
  { id: 'ws_01', name: 'Legal — Due Diligence', color: '#6366F1', docCount: 142, memberCount: 5 },
  { id: 'ws_02', name: 'Finance — Q2 Audits', color: '#10B981', docCount: 89, memberCount: 3 },
  { id: 'ws_03', name: 'Procurement RFPs', color: '#F59E0B', docCount: 24, memberCount: 8 },
  { id: 'ws_04', name: 'HR Policies', color: '#EC4899', docCount: 17, memberCount: 12 },
]

// ── Documents ────────────────────────────────────────────────────────────────

export const mockDocuments: Document[] = [
  {
    id: 'doc_01',
    name: 'Acquisition_Agreement_TechCorp_v3.pdf',
    type: 'PDF',
    size: 4_320_000,
    pages: 87,
    status: 'ready',
    uploadedAt: new Date('2026-06-05T10:22:00Z'),
    workspaceId: 'ws_01',
    tags: ['contract', 'M&A'],
    language: 'English',
    chunks: 312,
  },
  {
    id: 'doc_02',
    name: 'Q2_Financial_Report_2026.xlsx',
    type: 'XLSX',
    size: 1_140_000,
    pages: 24,
    status: 'ready',
    uploadedAt: new Date('2026-06-04T08:15:00Z'),
    workspaceId: 'ws_02',
    tags: ['finance', 'report'],
    language: 'English',
    chunks: 98,
  },
  {
    id: 'doc_03',
    name: 'Vendor_Proposal_Infratech.pdf',
    type: 'PDF',
    size: 2_870_000,
    pages: 45,
    status: 'ready',
    uploadedAt: new Date('2026-06-03T14:30:00Z'),
    workspaceId: 'ws_03',
    tags: ['vendor', 'RFP'],
    language: 'English',
    chunks: 178,
  },
  {
    id: 'doc_04',
    name: 'Employment_Policy_ID_2026.docx',
    type: 'DOCX',
    size: 890_000,
    pages: 32,
    status: 'processing',
    uploadedAt: new Date('2026-06-06T16:45:00Z'),
    workspaceId: 'ws_04',
    tags: ['HR', 'policy'],
    language: 'Bahasa Indonesia',
    chunks: 0,
    processingProgress: 68,
  },
  {
    id: 'doc_05',
    name: 'Invoice_Batch_May2026_500.pdf',
    type: 'PDF',
    size: 12_400_000,
    pages: 500,
    status: 'ready',
    uploadedAt: new Date('2026-06-02T09:00:00Z'),
    workspaceId: 'ws_02',
    tags: ['invoices', 'batch'],
    language: 'English',
    chunks: 1842,
  },
  {
    id: 'doc_06',
    name: 'NDA_Counterparty_XYZ.pdf',
    type: 'PDF',
    size: 540_000,
    pages: 8,
    status: 'failed',
    uploadedAt: new Date('2026-06-06T18:00:00Z'),
    workspaceId: 'ws_01',
    tags: ['NDA'],
    language: 'English',
    chunks: 0,
  },
  {
    id: 'doc_07',
    name: 'Software_License_Agreement.docx',
    type: 'DOCX',
    size: 1_200_000,
    pages: 28,
    status: 'ready',
    uploadedAt: new Date('2026-05-28T11:30:00Z'),
    workspaceId: 'ws_01',
    tags: ['license', 'software'],
    language: 'English',
    chunks: 124,
  },
  {
    id: 'doc_08',
    name: 'Annual_Report_Conglomerate_2025.pdf',
    type: 'PDF',
    size: 8_700_000,
    pages: 180,
    status: 'ready',
    uploadedAt: new Date('2026-05-20T09:00:00Z'),
    workspaceId: 'ws_02',
    tags: ['annual-report'],
    language: 'English',
    chunks: 712,
  },
]

// ── Chat Messages ────────────────────────────────────────────────────────────

export const mockChatHistory: ChatMessage[] = [
  {
    id: 'msg_01',
    role: 'user',
    content: 'What are the termination clauses in the TechCorp acquisition agreement?',
    timestamp: new Date('2026-06-06T10:00:00Z'),
  },
  {
    id: 'msg_02',
    role: 'assistant',
    content: `The TechCorp Acquisition Agreement contains **three termination provisions** (Article 12, pp. 64–67):

1. **Mutual Consent** — Either party may terminate by written consent of both parties at any time prior to closing, without penalty.

2. **Material Breach** — Either party may terminate if the other fails to cure a material breach within **30 business days** of written notice. Termination triggers a **$2.5M break fee** payable by the breaching party.

3. **Regulatory Block** — Either party may terminate if any government authority issues a final, non-appealable order prohibiting the transaction. No break fee applies in this scenario.

> **Note**: The agreement also contains a "force majeure" clause (§12.4) that suspends but does not terminate obligations during qualifying events.`,
    timestamp: new Date('2026-06-06T10:00:08Z'),
    citations: [
      { docId: 'doc_01', docName: 'Acquisition_Agreement_TechCorp_v3.pdf', page: 64, snippet: 'Either party may terminate this Agreement upon written notice if the other party has materially breached...' },
      { docId: 'doc_01', docName: 'Acquisition_Agreement_TechCorp_v3.pdf', page: 65, snippet: '$2,500,000 break fee shall be payable within 5 business days of termination...' },
      { docId: 'doc_01', docName: 'Acquisition_Agreement_TechCorp_v3.pdf', page: 67, snippet: 'In the event a Governmental Authority issues a final Order...' },
    ],
    confidence: 0.94,
    model: 'claude-sonnet-4',
  },
  {
    id: 'msg_03',
    role: 'user',
    content: 'What is the total transaction value and payment structure?',
    timestamp: new Date('2026-06-06T10:02:00Z'),
  },
  {
    id: 'msg_04',
    role: 'assistant',
    content: `Based on **Article 3 — Purchase Price** (pp. 12–18), the transaction structure is:

**Total Consideration: USD 145,000,000**

| Component | Amount | Timing |
|-----------|--------|--------|
| Cash at closing | $110,000,000 | At closing |
| Escrow holdback | $15,000,000 | Released 18 months post-close |
| Earn-out (max) | $20,000,000 | Over 24 months, tied to EBITDA targets |

The earn-out is contingent on the acquired entity achieving **$28M EBITDA** in Year 1 and **$35M EBITDA** in Year 2 post-acquisition.`,
    timestamp: new Date('2026-06-06T10:02:09Z'),
    citations: [
      { docId: 'doc_01', docName: 'Acquisition_Agreement_TechCorp_v3.pdf', page: 12, snippet: 'The aggregate consideration for the Shares shall be USD 145,000,000...' },
      { docId: 'doc_01', docName: 'Acquisition_Agreement_TechCorp_v3.pdf', page: 15, snippet: 'Earn-Out Payment shall not exceed USD 20,000,000 in aggregate...' },
    ],
    confidence: 0.97,
    model: 'claude-sonnet-4',
  },
]

// ── Extraction Jobs ──────────────────────────────────────────────────────────

export const mockExtractionJobs: ExtractionJob[] = [
  {
    id: 'job_01',
    name: 'Invoice Extraction — May 2026',
    template: 'Invoice',
    docCount: 500,
    processedCount: 500,
    status: 'completed',
    createdAt: new Date('2026-06-02T09:00:00Z'),
    accuracy: 0.967,
    fields: ['Invoice Number', 'Vendor Name', 'Issue Date', 'Due Date', 'Total Amount', 'Currency', 'Line Items'],
  },
  {
    id: 'job_02',
    name: 'Contract Key Terms — Legal Review',
    template: 'Contract',
    docCount: 24,
    processedCount: 24,
    status: 'completed',
    createdAt: new Date('2026-06-04T14:00:00Z'),
    accuracy: 0.942,
    fields: ['Parties', 'Effective Date', 'Term', 'Total Value', 'Governing Law', 'Termination Notice'],
  },
  {
    id: 'job_03',
    name: 'HR Policies — Benefit Extraction',
    template: 'Custom',
    docCount: 17,
    processedCount: 11,
    status: 'running',
    createdAt: new Date('2026-06-06T16:30:00Z'),
    accuracy: 0,
    fields: ['Policy Name', 'Effective Date', 'Eligibility Criteria', 'Benefit Amount', 'Claim Procedure'],
  },
]

// ── Analytics data ───────────────────────────────────────────────────────────

export const mockQueryStats: QueryStats[] = [
  { date: 'Jun 1', queries: 124, documents: 8, extractions: 12 },
  { date: 'Jun 2', queries: 198, documents: 15, extractions: 31 },
  { date: 'Jun 3', queries: 156, documents: 11, extractions: 8 },
  { date: 'Jun 4', queries: 287, documents: 22, extractions: 45 },
  { date: 'Jun 5', queries: 341, documents: 19, extractions: 67 },
  { date: 'Jun 6', queries: 412, documents: 31, extractions: 89 },
  { date: 'Jun 7', queries: 189, documents: 12, extractions: 24 },
]

export const mockTopDocuments = [
  { name: 'Acquisition_Agreement_TechCorp_v3.pdf', queries: 87, workspace: 'Legal' },
  { name: 'Invoice_Batch_May2026_500.pdf', queries: 64, workspace: 'Finance' },
  { name: 'Q2_Financial_Report_2026.xlsx', queries: 52, workspace: 'Finance' },
  { name: 'Vendor_Proposal_Infratech.pdf', queries: 38, workspace: 'Procurement' },
  { name: 'Software_License_Agreement.docx', queries: 29, workspace: 'Legal' },
]

export const mockMembers = [
  { id: 'usr_01', name: 'Alpha Alfarizi', email: 'alpha@acme.corp', role: 'Owner', avatar: 'AA', lastActive: '2 min ago' },
  { id: 'usr_02', name: 'Sarah Chen', email: 'sarah.chen@acme.corp', role: 'Editor', avatar: 'SC', lastActive: '1h ago' },
  { id: 'usr_03', name: 'Budi Santoso', email: 'budi@acme.corp', role: 'Editor', avatar: 'BS', lastActive: '3h ago' },
  { id: 'usr_04', name: 'Alex Morgan', email: 'alex@acme.corp', role: 'Viewer', avatar: 'AM', lastActive: '1d ago' },
  { id: 'usr_05', name: 'Jessica Lee', email: 'jessica@acme.corp', role: 'Admin', avatar: 'JL', lastActive: '30m ago' },
]
