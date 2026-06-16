# Product Requirements Document (PRD) - ORLITH AI

**Document Date:** June 16, 2026
**Product Name:** ORLITH AI
**Status:** Draft / Active
**Version:** 1.5 (Enterprise-Grade RAG)

---

## 1. Executive Summary

**ORLITH AI** is a "Corporate Brain" and **AI Model Intelligence Platform** based on *Retrieval-Augmented Generation* (RAG) that is designed to be self-hostable and ready for Enterprise scale. It is built for a wide audience—from students struggling to synthesize dense reading materials to enterprises managing massive internal archives. Beyond enabling intelligent interactions with thousands of documents through a *Hybrid Search & Reranking* architecture, ORLITH AI provides intelligent analytics to evaluate and recommend the best Large Language Models (LLMs) based on actual usage data within each workspace. ORLITH AI guarantees absolute privacy through data isolation, Bring Your Own Key (BYOK) controls, and local air-gapped capabilities.

## 2. Background & Problem Statement

Many organizations, institutions, and students possess vast amounts of operational documents, guidelines, reports, and textbooks that are difficult to navigate and comprehend.
**Core problems faced today:**
- Traditional keyword-based search systems are highly ineffective for contextual questions, while pure vector search often fails for exact-match queries like receipt numbers or specific names.
- Standard RAG systems frequently hallucinate and lack systematic accuracy evaluation.
- Sending confidential enterprise documents or personal academic materials to public clouds violates Data Privacy Compliance and security protocols.

**ORLITH AI's Solution:**
Provide an end-to-end *Enterprise RAG* pipeline combining *Vector Search*, *BM25 (Keyword Search)*, and *Rerankers* atop a robust *PostgreSQL + pgvector* architecture. This solution runs entirely locally, guaranteeing absolute security, with integrated metrics and evaluation systems to ensure hallucination-free RAG.

## 3. User Personas

1. **The End User (Knowledge Worker / Student)**
   - **Needs:** An intuitive interface, real-time responses (streaming), and highly accurate **citations** alongside original document snippets to validate answers and study efficiently.
2. **The Workspace Owner (Manager / Team Lead / Researcher)**
   - **Needs:** Usage analytics dashboards, *Workspace* isolation, and the ability to evaluate AI response quality against department-specific or subject-specific datasets.
3. **The Deployer (IT / System Administrator)**
   - **Needs:** Seamless Docker installation guides, status monitoring, *PostgreSQL* database migration, and large-scale infrastructure management.

---

## 4. Core Features & Functionality

### 4.1 Granular Workspaces (Isolated Workspaces)
The system supports a fully functional multi-tenant architecture.
- Users can create various *Workspaces* (e.g., "HR Dept", "Legal Dept", "Biology Semester 4").
- Chat history and AI configurations are strictly isolated per *Workspace*.

### 4.2 Document Processing Pipeline & Semantic Chunking
Document processing goes beyond simple text splitting; it passes through an advanced *Ingestion Pipeline*:
1. **Parsing:** Reading raw documents.
2. **Cleaning:** Removing noise characters and irrelevant formatting.
3. **Metadata Extraction:** Automatically attaching *metadata*.
4. **Semantic Chunking:** Splitting text based on semantic meaning and complete paragraphs, avoiding brute-force character-count chunking.
5. **Embedding:** Converting chunks into numerical vectors.
6. **Indexing:** Ingesting data into the vector database.

*Example metadata structure per chunk:*
```json
{
  "document_id": "doc-uuid-1234",
  "page": 12,
  "section": "Financial Summary",
  "uploaded_by": "user-uuid",
  "workspace": "Finance"
}
```

### 4.3 Hybrid Search (Vector + BM25 + RRF Fusion)
This is the core search engine guaranteeing enterprise-level accuracy.
The system runs meaning-based search (*Vector Search*) and exact keyword search (*BM25*) in parallel. The results from both are then optimally merged using the **Reciprocal Rank Fusion (RRF)** algorithm.

### 4.4 Reranking Layer
To maximize relevance before context is sent to the LLM, the system implements *Cross-Encoder Reranking* (e.g., using models like `bge-reranker-large` or `bge-reranker-v2-m3`).
**Query Execution Flow:**
`Query` ➔ `Hybrid Search (Fetch Top 20)` ➔ `Reranker` ➔ `Filter Top 5 Most Relevant` ➔ `LLM`

### 4.5 Source Attribution & Comprehensive Citations
The system doesn't just provide page numbers; it provides authentic proof.
- **Citations include:** Document Name, Page Number, Specific Paragraph, Similarity Score (e.g., `0.91`), and the direct *Text Snippet* (e.g., `"The operational expenditure increased..."`).
This maximizes user *Trust* metrics.

### 4.6 Embedding & Model Management (BYOK)
- Freedom to assign specific LLMs per workspace (OpenAI, Anthropic, Gemini, Ollama, etc.).
- **Embedding Profile:** The system logs the active *Embedding Model* type.
- If the owner changes the embedding model, the system automatically flags documents with a `Reindex Required` status and displays the *Vector Count* & *Last Indexed* info.

### 4.7 AI Model Intelligence & Benchmark Radar
ORLITH AI is not just a RAG application; it is an **AI Model Intelligence Platform**. It guides users to select the most suitable LLM based on their actual workspace data, rather than generic internet benchmarks.

**A. AI Benchmark Radar**
Displays a Radar Chart for every LLM used, measured across 6 real-world metrics:
1. **Accuracy**: Derived from *Answer Acceptance Rate* (User 👍/👎 Feedback).
2. **Speed**: Average *Time-to-First-Token* (TTFT) and total response time.
3. **Cost**: Normalized token consumption.
4. **Citation Quality**: Percentage of answers successfully providing accurate source citations.
5. **Reliability**: *Success Rate*, tracking *errors* and *timeouts*.
6. **Context Understanding**: Average *Faithfulness* and *Answer Relevancy* metrics.

**B. AI Model Arena & Recommendations**
The system proactively recommends more efficient models.
- **Example Dashboard Notification:** *"Recommendation: Switch to Claude 3.5 Sonnet. Expected Improvements: +18% Accuracy, +12% Citation Quality, -5% Speed, +35% Cost."*

### 4.8 Usage Analytics
Dedicated dashboard for *Workspace Owners* displaying:
- Questions Asked
- Documents Indexed
- Storage Used
- Tokens Consumed
- Cost Estimate
- Most Accessed Documents

---

## 5. Non-Functional Requirements

### 5.1 Performance & Reliability
- **Time-to-First-Token (TTFT):** *Streaming* initiates in under 1.5 seconds.
- Implements *Exponential Backoff* for external LLM *rate limits*, alongside *global API rate-limiting*.

### 5.2 Security
- All third-party API Keys must be encrypted at rest using *Fernet Symmetric Encryption*.

---

## 6. Architecture & Technology Stack

The product is built specifically for scale and high concurrency (*Production-Hardened*).

**Frontend Layer:**
- Next.js 14 (App Router), Tailwind CSS, Zustand, Framer Motion.

**Backend Layer:**
- FastAPI (Python 3.10+) with a fully asynchronous system.
- Langchain/LlamaIndex for RAG pipeline orchestration (Ingest, Hybrid Search, Reranking).

**Database & Storage (Enterprise Data Layer):**
- **Unified Relational & Vector DB:** **PostgreSQL + pgvector**
  - Relational and vector storage are combined within a highly robust *Postgres* ecosystem.
  - **Core Table Schema:**
    - `Users`, `Workspaces`, `Documents`
    - `Chunks` (containing original text and JSONB metadata)
    - `Conversations`, `Messages`
    - `pgvector` extension is used for the `Embeddings` schema.

**Deployment Infrastructure:**
- Docker & Docker Compose.

---

## 7. Development Roadmap

### V1.0 (MVP)
Focus on foundational, isolated RAG functionality:
- Document Upload & Chat
- Citation Level 1
- Workspace Management
- BYOK (Bring Your Own Key)
- Ollama Local Integration

### V1.5 (The "Brain" Upgrade - Enterprise RAG Foundation)
Focus on radical improvements to search quality and accuracy:
- Semantic Chunking Implementation
- Hybrid Search (Vector + BM25) & RRF
- Cross-Encoder Reranker
- AI Model Benchmark Radar & Arena (Real-usage metrics & LLM Recommendations)

### V2.0 (Security, Scale, and SaaS Preparedness)
Focus on large-scale enterprise collaboration and long-term infrastructure:
- Role Based Access Control (RBAC) & Multi-User Support
- SSO Integrations (SAML / OAuth)
- Comprehensive Audit Logs
- Full infrastructure migration to PostgreSQL + pgvector
- Usage Analytics & Quota Management

### V3.0 (The Ultimate Corporate Brain)
Focus on data source expansion to become the central intelligence hub:
- Native Integrations: Confluence, Jira, Slack
- Cloud Connectors: Google Drive, Microsoft SharePoint
- Automated Web Crawling (Company Wikis)
