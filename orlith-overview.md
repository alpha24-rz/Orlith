# ORLITH AI Overview

The **ORLITH AI** workspace is a self-hostable "Corporate Brain" repository and an advanced document analysis system designed to support Multi-Provider LLMs natively.

This platform allows users to interact with their documents using highly accurate *Retrieval-Augmented Generation* (RAG) technology.

Below is a detailed breakdown of the features, system architecture, and technology stack used within this workspace.

---

## 🚀 Core Features

1. **Granular Workspaces (Isolated Workspaces)**
   Enables separation and isolation of documents, query histories, and API configurations into distinct workspaces for better security and organization (multi-tenant isolation).
   
2. **BYOK (Bring Your Own Key) & Multi-Provider LLMs**
   Supports integration with various AI model providers. Each workspace can be individually configured to use models like **OpenAI, Anthropic, Gemini, Mistral, Ollama, OpenRouter, or DeepSeek**.

3. **Advanced RAG (Retrieval Augmented Generation)**
   An intelligent conversational search feature that directly retrieves context from uploaded documents. It features token-by-token streaming for instantaneous responses, alongside the ability to provide highly accurate citations from source documents.

4. **Local Embedding Support**
   Supports third-party embedding providers as well as *local/offline* ones like OpenAI, Cohere, and local embedding models from **Ollama** for air-gapped deployments completely isolated from the internet.

5. **Production Hardened**
   Built with a robust and stable system:
   - Structured JSON logging using `structlog`.
   - Global rate-limiting capabilities using `slowapi`.
   - Exponential backoffs with `tenacity` to handle timeouts and errors during AI API calls.
   - Comprehensive health metrics checking.

6. **Modern UI/UX**
   A clean, modern, and highly responsive interface with smooth transition animations and real-time communication support based on WebSockets.

---

## 🛠️ Architecture & Technology Stack

The application is divided into three main layers: Backend, Frontend, and Data Storage (Database & Vector Store).

### 1. Backend (Server-Side System)
Handles document ingestion, text-chunking, and RAG logic processes.
- **Core Framework**: FastAPI (Python 3.10+). Fast, modern, and supports fully *asynchronous* operations.
- **AI / LLM Orchestration**: Uses the *Langchain* library to orchestrate interactions between prompts, models, and semantic text-chunking.
- **ORM & Database Migrations**: SQLAlchemy (with *async* support / `aiosqlite`) and Alembic to manage database schema migrations.
- **Security**: Utilizes `Fernet` encryption to securely store users' LLM provider API Keys.

### 2. Frontend (User Interface)
Responsible for rendering visuals, state management, and user interaction.
- **Core Framework**: Next.js 14 App Router (Modern React.js framework).
- **Styling & Design**: Tailwind CSS for building a sleek, customizable, and neat UI.
- **State Management**: Zustand for lightweight and fast global state handling.
- **Animations**: Framer Motion for page transitions and *micro-animations*.

### 3. Database & Storage
The application's storage is designed with a *local-first* approach:
- **Relational Database**: SQLite stored at `./data/documind.db` (legacy name maintained) to store user data, workspace configurations, chat histories, and document metadata.
- **Vector Store**: ChromaDB to store text *embeddings* persistently (stored at `./data/chroma`). This ensures every workspace gets its own isolated storage index that never mixes.
- **Local Storage**: Physical documents are chunked and securely stored in `./data/uploads`.

---

## ⚙️ System & Deployment Flow

To simplify operations and prevent dependency version conflicts, ORLITH AI relies entirely on **Docker** infrastructure:

- **Docker & Docker Compose**: 
  The workspace includes a `docker-compose.yml` configuration file to easily run services in isolation. With a single command `docker-compose up --build -d`, backend and frontend containers will be built and run interchangeably, with mapped *volumes* (detailed in `./data`).
- **Nginx Reverse Proxy & SSL**: 
  (Optional, guided). The system is designed to be safely deployed in production behind a reverse proxy and HTTPS.

## 📂 Main Directory Structure

- `/backend/` — Complete source code of the FastAPI backend (Python).
- `/frontend/` — UI source code of Next.js (Node.js/React).
- `/data/` — Local storage directory (SQLite Database, File Uploads, ChromaDB Vectors). Mounted inside a *docker volume*.
- `/docs/` — Directory for deployment guides and documentation.
- `docker-compose.yml` — Container orchestration configurations.
- `Makefile` — Automation scripts for developer ease during development.

---
Overall, **ORLITH AI** combines the rock-solid stability of Python (FastAPI) and the rapid iteration speed of modern web technologies (Next.js) with advanced RAG and AI agent orchestration, all under complete Self-Hosted control for enterprise data privacy.
