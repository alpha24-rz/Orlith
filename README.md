# ORLITH AI

**Your Intelligent Corporate Brain.** 
Effortlessly chat with thousands of documents—from dense textbooks to enterprise reports—powered by advanced Enterprise Retrieval-Augmented Generation (RAG).

ORLITH is a self-hostable, multi-provider AI platform built for students, professionals, and enterprises. Built with FastAPI, Next.js, and ChromaDB, it supports multiple LLM providers, granular workspaces, and easy local deployment via Docker.

## Features

- **Granular Workspaces**: Isolate documents, query histories, and API configurations into separate workspaces for organized research or departmental use.
- **BYOK & Multi-Provider LLMs**: Configure different AI models (OpenAI, Anthropic, Gemini, Mistral, Ollama, OpenRouter, DeepSeek) individually for each workspace.
- **Advanced Retrieval Augmented Generation (RAG)**: Conversational search grounded directly on your documents with token-by-token streaming and pixel-perfect, accurate citations.
- **Local Embedding Support**: Built-in support for multiple embedding providers, including OpenAI, Cohere, and local Ollama embeddings for air-gapped, privacy-first deployments.
- **Production Hardened**: Built-in JSON structured logging via `structlog`, global rate-limiting via `slowapi`, exponential backoffs with `tenacity`, and rigorous health-checking.
- **Modern UI**: A heavily polished Next.js application with deep React integration for responsive components and real-time WebSocket progress tracking.

## Architecture

* **Backend**: FastAPI (Python 3.10+) handling file ingestion, background task routing, semantic text-chunking (via `langchain`), and embeddings insertion to ChromaDB.
* **Frontend**: Next.js 14 App Router, utilizing Zustand for global state, Tailwind CSS + Framer Motion for beautiful micro-animations.
* **Vector Store**: Local-first ChromaDB collection per-workspace ensuring tenant isolation.
* **Database**: SQLite with async SQLAlchemy & Alembic migrations to store users, document metadata, workspaces, and query histories.

## Prerequisites

- Docker and Docker Compose
- (Optional) API Keys from providers like OpenAI, Anthropic, or OpenRouter

> [!TIP]
> **Complete Self-Hosted Guide**: For an in-depth, step-by-step guide on setup, configuration, data backups, local LLM integration (Ollama), and production best practices (like Nginx Reverse Proxy and SSL), please refer to the [Self-Hosted Setup & Deploy Guide](docs/self-hosted-setup.md).

## One-Line Install (Recommended)

You can install and run ORLITH AI on Linux, macOS, or Windows with a single command. Ensure you have Git, Docker, and Docker Compose installed.

**Linux and macOS:**
```bash
curl -sSL https://raw.githubusercontent.com/alpha24-rz/documind-ai/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/alpha24-rz/documind-ai/main/install.ps1 | iex
```

## Quick Start (Manual Docker)

1. Clone the repository and navigate into the root directory.
   ```bash
   git clone https://github.com/yourusername/orlith.git
   cd orlith
   ```

2. Copy the example `.env` file (if you have one) or create one at the project root:
   ```bash
   cat <<EOF > .env
   ENVIRONMENT=production
   SECRET_KEY=your-super-secret-key-at-least-32-chars
   LOG_LEVEL=INFO
   # NEXT_PUBLIC_API_URL=http://your-server-ip:8000 # Uncomment and replace for remote prod use
   EOF
   ```

3. Build and launch the containers:
   ```bash
   docker-compose up --build -d
   ```

4. The application will be available at:
   - Frontend UI: `http://localhost:3000`
   - Backend API Docs: `http://localhost:8000/docs`

## Manual Development Setup

If you prefer to run services individually for development without Docker:

### 1. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
python main.py
```
*The backend will run at `http://localhost:8000`*

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*The frontend will run at `http://localhost:3000`*

## Configuration Guide

### Adding an API Key
You can add an API key at runtime globally or configure it in the UI per workspace:
1. Open the ORLITH UI.
2. Navigate to your **Workspace Settings**.
3. Under the **AI Provider** tab, choose your desired LLM (e.g., Claude, OpenAI, Ollama).
4. Save the configuration. 
5. Under the **API Keys** tab, manage your secure provider secrets (they will be encrypted via Fernet on the backend).

### Running Local LLMs (Ollama)
If you wish to use fully offline AI:
1. Ensure Ollama is running on your host machine.
2. Pull your desired models (e.g., `ollama run llama3`).
3. In Workspace Settings, select **Ollama (Local)** and input the Base URL (e.g., `http://host.docker.internal:11434` if running from within Docker).

## Development Notes
- The SQLite DB is stored at `./data/documind.db`. (Note: The internal database file is currently maintained for backward compatibility).
- ChromaDB vector indices are stored at `./data/chroma`.
- Uploaded files are chunked and stored locally at `./data/uploads`.
- To inspect deep health metrics and provider availability, ping the `/health` endpoint.

## License
MIT License.
