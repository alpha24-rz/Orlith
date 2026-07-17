# ORLITH AI: Full System Pipeline & Architecture Documentation

Dokumen ini menjelaskan alur kerja (*pipeline*) sistem secara menyeluruh (*end-to-end*) pada platform **ORLITH AI**. Sistem ini dirancang dengan arsitektur modular berlapis yang memisahkan antara abstraksi model AI (*LLM Gateway*), pemrosesan dokumen asinkron (*Document Pipeline*), mesin pencarian hibrida (*Hybrid RAG Retrieval Engine*), dan antarmuka pengguna berbasis *real-time streaming* (Next.js + SSE/WebSocket).

---

## 🌐 1. Arsitektur Umum & Alur Kerja Utama (High-Level System Flow)

Secara garis besar, siklus data di dalam **ORLITH AI** terbagi menjadi dua jalur utama:
1. **Ingestion & Indexing Pipeline (Jalur Asinkron):** Mengubah file fisik (PDF, DOCX, TXT) menjadi pecahan teks semantik (*chunks*) dan *vector embeddings* yang disimpan secara terisolasi per *workspace*.
2. **Retrieval & Generation Pipeline (Jalur Sinkron/Real-Time):** Memproses kueri pengguna melalui *Multi-Query Rewriting*, pencarian ganda (*Hybrid Search: Vector + BM25*), penggabungan peringkat (*Reciprocal Rank Fusion / RRF*), *Reranking*, hingga menghasilkan jawaban *stream* dengan sitasi akurat.

```mermaid
graph TB
    subgraph Frontend [Layer 1: Frontend - Next.js 14 App Router]
        UI[Web UI / Zustand State]
        SSE[SSE & WebSocket Client]
    end

    subgraph Backend [Layer 2: Backend - FastAPI Async Service]
        API[API Router / Auth & Rate Limiter]
        GATEWAY[LLMGateway: BYOK Multi-Provider Engine]
        ORCH[AIOrchestrator: Mode Router]
        
        subgraph Modes [Reasoning Modes]
            CHAT[StandardChatMode]
            AGENT[AgentMode]
            RESEARCH[DeepResearchMode]
        end

        subgraph Ingestion [Document Ingestion Pipeline]
            HOOKS[PipelineHooks / Plugin Engine]
            EXTRACT[TextExtractionService + OCR]
            CHUNK[ChunkingService]
            EMBED[EmbeddingService]
            BUS[EventBus System]
        end

        subgraph Retrieval [Hybrid RAG Retrieval Engine]
            REWRITE[Query Rewriter]
            HYBRID[Parallel Search: ChromaDB + BM25]
            RRF[Reciprocal Rank Fusion]
            RERANK[Cross-Encoder Reranker]
            GATE[Relevance Gating & Citations]
        end
    end

    subgraph Storage [Layer 3: Local-First Storage Layer]
        DB[(SQLite / aiosqlite<br/>documind.db)]
        VECTOR[(ChromaDB<br/>./data/chroma)]
        FILES[Local Uploads<br/>./data/uploads]
    end

    UI -->|Upload Document| API
    UI -->|Chat / Query SSE| API
    API -->|Route Upload| HOOKS
    API -->|Route Query| ORCH

    %% Ingestion Flow
    HOOKS -->|Before/After Extract| EXTRACT
    EXTRACT -->|Store File| FILES
    EXTRACT -->|Raw Pages| CHUNK
    CHUNK -->|Semantic Chunks| EMBED
    EMBED -->|Vector Embeddings| VECTOR
    EMBED -->|Document Meta & Metrics| DB
    EMBED -->|Publish Ready Event| BUS

    %% Retrieval & Generation Flow
    ORCH -->|Select Mode| Modes
    CHAT -->|Ask Providers| GATEWAY
    CHAT -->|Execute Retrieval| REWRITE
    REWRITE -->|Multi-Query Variants| HYBRID
    HYBRID -->|Vector Distances| VECTOR
    HYBRID -->|Keyword Matching| DB
    HYBRID -->|Raw Candidates| RRF
    RRF -->|Fused Pool| RERANK
    RERANK -->|Top-K Valid Chunks| GATE
    GATE -->|Context + Citations| CHAT
    CHAT -->|Stream Tokens via SSE| SSE
```

---

## 📄 2. Document Ingestion & Vectorization Pipeline (`DocumentPipeline`)

Dikelola oleh `services.pipeline.DocumentPipeline`, proses ini dieksekusi secara latar belakang (*background task*) dengan sistem *Hook Engine* (`PipelineHooks`) yang memungkinkan penyisipan validasi atau klasifikasi tambahan pada setiap tahap proses.

```mermaid
sequenceDiagram
    autonumber
    actor User as User / API
    participant P as DocumentPipeline
    participant H as PipelineHooks
    participant E as TextExtractionService
    participant C as ChunkingService
    participant G as LLMGateway
    participant V as EmbeddingService
    participant DB as SQLite DB
    participant Chroma as ChromaDB
    participant EB as EventBus

    User->>P: process(document_id, ocr=True/False)
    P->>DB: Fetch Document & Workspace
    
    %% Pre-Extract
    P->>H: trigger("before_extract", ctx, document)
    P->>E: extract(document, ocr, ctx)
    E-->>P: pages, metadata (page_count, text_hash)
    P->>H: trigger("after_extract", ctx, document, pages, meta)
    Note over H: Classification Hook berjalan di sini<br/>(document_classifier.py)

    %% Gateway & Provider Check
    P->>G: get_embedding_provider(workspace)
    G-->>P: embedding_provider, model_name

    %% Chunking
    P->>H: trigger("before_chunk", ctx, pages, document)
    P->>C: chunk(pages, document, workspace, ctx, provider, model)
    C-->>P: chunks[] (Semantic / Recursive chunks)
    P->>H: trigger("after_chunk", ctx, document, chunks)

    %% Embedding & Storage
    P->>H: trigger("before_embedding", ctx, chunks, document)
    P->>V: embed_and_store(document, chunks, workspace, ctx, ...)
    V->>Chroma: upsert embeddings (ChromaDB Collection)
    V->>DB: update Document status = "ready", metadata_json, metrics
    P->>H: trigger("after_embedding", ctx, document)

    %% Event Notification
    P->>EB: publish("DocumentReadyEvent", {document_id, metrics, workspace_id})
    EB-->>User: WebSocket / SSE Notification (UI Update)
```

### Tahapan Detail Ingestion:
1. **Inisialisasi & Hook Execution (`before_extract`):** Mengambil data dokumen dan konfigurasi *workspace* dari database SQLite (`aiosqlite`).
2. **Ekstraksi Teks (`TextExtractionService`):** Mengesktrak teks dari halaman per halaman. Jika parameter `ocr=True` aktif atau teks berbasis gambar/hasil scan terdeteksi, sistem menjalankan proses Optical Character Recognition (OCR).
3. **Klasifikasi Dokumen (`after_extract`):** `classification_hook` mendeteksi tipe dan struktur dokumen secara otomatis dari metadata dan konten yang diekstrak.
4. **Setup Provider (`LLMGateway`):** Menentukan mesin *embedding* yang aktif pada *workspace* tersebut (bisa berupa OpenAI, HuggingFace, Cohere, atau **Ollama local embedding**).
5. **Semantic Text Chunking (`ChunkingService`):** Memecah halaman menjadi segmen teks bermakna dengan mempertahankan konteks paragraf dan batasan token optimal.
6. **Vector Upsert (`EmbeddingService`):** Menghasilkan vektor untuk setiap *chunk* dan menyimpannya langsung ke dalam **ChromaDB** pada *collection* khusus *workspace_id* bersangkutan.
7. **Finalization & Event Bus (`EventBus`):** Menyimpan riwayat latensi (*metrics* & *status_history*) ke DB, mengubah status dokumen menjadi `ready`, dan memancarkan `DocumentReadyEvent` agar antarmuka pengguna (Next.js) memperbarui status di UI secara *real-time*.

---

## 🔍 3. Hybrid RAG Retrieval Engine (`retrieve_relevant_chunks`)

Saat pengguna mengirimkan pertanyaan pada mode *Chat/RAG*, sistem tidak sekadar mencocokkan *cosine similarity* standar, melainkan menjalankan **pipeline pencarian hibrida multi-tahap** untuk memastikan relevansi dan akurasi maksimal (`services.ai.retrieval.search`).

```mermaid
flowchart TD
    Start([Input User Query]) --> GatewayCheck[LLMGateway: Get Active Chat & Embed Models]
    GatewayCheck --> RewriteCheck{enable_rewriting == True?}
    
    RewriteCheck -->|Yes| Rewrite[Query Rewriter: Generate 2-3 Multi-Query Variants]
    RewriteCheck -->|No| SingleQuery[Use Single Original Query]
    
    Rewrite --> EmbedQueries[Embedding Provider: Embed All Query Variants]
    SingleQuery --> EmbedQueries
    
    EmbedQueries --> ParallelSearch{Parallel Search Execution}
    
    subgraph VectorSearch [Vector Search Path]
        ParallelSearch -->|Query Embeddings| ChromaQuery[ChromaDB Collection Query]
        ChromaQuery --> DistanceFilter[Filter Distance <= 0.35<br/>Similarity >= 0.65]
    end
    
    subgraph KeywordSearch [Keyword Search Path]
        ParallelSearch -->|Raw Query Strings| BM25Query[BM25 Keyword Search<br/>SQLite In-Memory / Cache]
    end
    
    DistanceFilter --> FusionCheck{enable_hybrid_search?}
    BM25Query --> FusionCheck
    
    FusionCheck -->|Yes| RRF[Reciprocal Rank Fusion - RRF<br/>Combine Vector + BM25 Ranks]
    FusionCheck -->|No| VectorOnly[Use Vector Candidates Only]
    
    RRF --> RerankCheck{enable_reranker?}
    VectorOnly --> RerankCheck
    
    RerankCheck -->|Yes| Reranker[Cross-Encoder Reranking<br/>BGE / Cohere / Jina]
    RerankCheck -->|No| RawSorted[Sort by RRF / Cosine Score]
    
    Reranker --> Dedup[Deduplicate by Normalized Filename + Page Number]
    RawSorted --> Dedup
    
    Dedup --> Gate[Relevance Threshold Gate<br/>Filter Top Score >= RAG_SIMILARITY_THRESHOLD]
    
    Gate --> SourceMode{Top Score Analysis}
    SourceMode -->|Score >= 0.70| ModeDoc[Source Mode: DOCUMENT]
    SourceMode -->|Score >= Threshold| ModeHybrid[Source Mode: HYBRID]
    SourceMode -->|Score < Threshold| ModeGen[Source Mode: GENERAL<br/>Clear Context Chunks]
    
    ModeDoc --> End([Return Final Chunks & Citations])
    ModeHybrid --> End
    ModeGen --> End
```

### Tahapan Detail Retrieval:
1. **Multi-Query Rewriting (`rewrite_query`):** Menggunakan model LLM aktif untuk memperluas kueri awal pengguna menjadi 2-3 variasi kueri alternatif guna menangkap sinonim dan maksud tersembunyi.
2. **Parallel Retrieval Execution (`asyncio.gather`):**
   - **Vector Path (`ChromaDB`):** Mencari *n_results* teratas dari vektor *embeddings* dan memvalidasi batas jarak (*cosine distance* $\le 0.35$).
   - **Keyword Path (`retrieve_bm25`):** Mencari kecocokan kata kunci eksak menggunakan algoritma BM25 pada indeks teks dokumen.
3. **Reciprocal Rank Fusion (`RRF`):** Menggabungkan urutan peringkat dari *Vector Search* dan *BM25 Keyword Search* menjadi satu daftar kandidat terkonsolidasi yang kebal terhadap pembobotan skor absolut.
4. **Cross-Encoder Reranking (`execute_rerank`):** Memproses ulang kandidat menggunakan model *Reranker* khusus (seperti BGE/Cohere) untuk memberi skor presisi hubungan semantik antara kueri dan teks *chunk*.
5. **Deduplication (`normalize_filename` + `page_number`):** Menghapus duplikasi *chunk* yang berasal dari versi dokumen yang sama pada halaman yang sama.
6. **Relevance Gating & Source Mode:**
   - **`DOCUMENT` (Score $\ge 0.70$):** Jawaban didasarkan murni pada bukti dokumen.
   - **`HYBRID` (Score $\ge$ Threshold):** Menggabungkan konteks dokumen dengan pengetahuan umum model.
   - **`GENERAL` (Score $<$ Threshold):** Jika dokumen tidak relevan, *chunk* dikosongkan dan model menjawab dari pengetahuan umum (atau menolak menjawab sesuai instruksi sistem).

---

## 🤖 4. Multi-Mode AI Orchestration & SSE Streaming (`AIOrchestrator`)

Saat kueri selesai melalui tahap *retrieval*, `services.ai.orchestrator.AIOrchestrator` menentukan jalur penalaran (*reasoning mode*) yang tepat sebelum mengirimkan *stream output* ke pengguna.

```mermaid
graph LR
    Input[Orchestrator Input:<br/>Query, Workspace ID, Mode] --> Router{Reasoning Mode Router}
    
    Router -->|mode == 'chat' / 'rag'| ChatMode[StandardChatMode]
    Router -->|mode == 'agent'| AgentMode[AgentMode<br/>Multi-Step Tool Use]
    Router -->|mode == 'research'| ResearchMode[DeepResearchMode<br/>Iterative Deep Search]
    
    subgraph ChatExecution [StandardChatMode Pipeline]
        ChatMode --> SetupLLM[LLMGateway: Resolve BYOK Provider]
        SetupLLM --> DBHistory[Get/Create Conversation & Save Message]
        DBHistory --> Retrieve[Call retrieve_relevant_chunks Engine]
        Retrieve --> BuildContext[Build Unified System Prompt + Parent Context]
        BuildContext --> YieldMeta[Yield SSE Meta Event:<br/>Citations, Model, Confidence Score]
        YieldMeta --> StreamLLM[LLM Token Generator]
        StreamLLM --> YieldTokens[Yield SSE Data Events:<br/>token-by-token stream]
    end
```

### Multi-Provider BYOK Gateway (`LLMGateway`):
Platform ini mendukung pengalihan model secara dinamis tanpa mengubah kode aplikasi. `LLMGateway` mengenkripsi dan mendekripsi kunci rahasia (*API Keys*) menggunakan *Fernet Encryption* serta mendukung *provider* berikut:
- **Cloud Providers:** OpenAI (`gpt-4o`, `gpt-4o-mini`), Anthropic (`claude-3-5-sonnet`), Google Gemini, Mistral AI, DeepSeek, OpenRouter.
- **Local & Offline Providers:** **Ollama** (`llama3`, `mistral`, `qwen`, dll) dan Local HuggingFace embeddings untuk jaminan keamanan data 100% *air-gapped*.

---

## 🛡️ 5. Isolasi Multi-Tenant & Struktur Penyimpanan Data

Keamanan dan isolasi data antar organisasi/departemen dijaga secara ketat oleh arsitektur **Granular Workspaces**:

```mermaid
graph TD
    subgraph StorageEngine [Physical Storage Layer - Mounted Volumes]
        subgraph DB [SQLite Database: ./data/documind.db]
            T1[Table: workspaces]
            T2[Table: documents]
            T3[Table: conversations & messages]
            T4[Table: api_keys & provider_settings]
        end

        subgraph Chroma [ChromaDB Vector Store: ./data/chroma]
            C1[Collection: workspace_id_A]
            C2[Collection: workspace_id_B]
            C3[Collection: workspace_id_C]
        end

        subgraph Uploads [Local File Storage: ./data/uploads]
            U1[Dir: /workspace_id_A/file1.pdf]
            U2[Dir: /workspace_id_B/file2.docx]
        end
    end

    TenantA[User / Department A] -->|Strict Workspace ID Filtering| T1 & C1 & U1
    TenantB[User / Department B] -->|Strict Workspace ID Filtering| T1 & C2 & U2
```

- **Database Relasional (`aiosqlite`):** Setiap *query* selalu menyertakan `workspace_id` sebagai *foreign key filter* utama.
- **Vector Index Isolations:** ChromaDB membuat *collection* terpisah dengan pengenal `workspace.id`. Ruang pencarian vektor tidak akan pernah bercampur antar *workspace*.
- **File Storage Structure:** File fisik yang diunggah disimpan dengan partisi direktori berdasarkan ID *workspace* dan ID dokumen di `./data/uploads`.

---

## ⚡ 6. DevOps, Lifecycle & Production Hardening

Agar sistem tahan banting saat dijalankan pada lingkungan produksi skala besar, sistem mengintegrasikan lapisan keandalan (*reliability hooks*):

1. **Structured JSON Logging (`structlog`):**
   Seluruh aktivitas *pipeline* (seperti latensi ekstraksi, *metrics* *chunking*, latensi *fusion RRF*, dan *error stack trace*) dicatat dalam format JSON yang mudah dipindai oleh alat pemantauan (*log aggregator* seperti ELK atau Datadog).
2. **Global Rate-Limiting (`slowapi`):**
   Mencegah *denial of service* (DoS) atau lonjakan biaya tak terduga dari panggilan API LLM secara berlebihan pada level *router* FastAPI.
3. **Exponential Backoff Resilience (`tenacity`):**
   Jika terjadi *timeout* jaringan atau kegagalan sementara saat memanggil penyedia AI eksternal (OpenAI/Anthropic/Ollama), `tenacity` akan melakukan coba ulang (*retry*) secara otomatis dengan jeda waktu eksponensial.
4. **Health Checking Metrics (`/health`):**
   Kontainer Docker memonitor ketersediaan *database*, *vector store*, dan *AI provider Gateway* setiap 30 detik melalui integrasi `healthcheck` di `docker-compose.yml`.
