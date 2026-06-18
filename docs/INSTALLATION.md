# 🚀 ORLITH AI Installation & Setup Guide

> **ORLITH AI** — Your Intelligent Corporate Brain.  
> A self-hostable AI platform for analyzing and chatting with thousands of documents using advanced RAG (Retrieval-Augmented Generation) technology.

This guide walks you through installing and running ORLITH AI from scratch. Written to be easy to follow for beginners and experienced developers alike.

---

## 📑 Table of Contents

- [System Requirements](#-system-requirements)
- [Method 1: One-Line Install (Easiest)](#-method-1-one-line-install-easiest)
- [Method 2: Docker Compose (Recommended)](#-method-2-docker-compose-recommended)
- [Method 3: Manual Installation (For Developers)](#-method-3-manual-installation-for-developers)
- [Post-Installation Configuration](#-post-installation-configuration)
- [Using Local LLMs (Ollama)](#-using-local-llms-ollama--fully-offline)
- [Production Deployment (VPS/Cloud)](#-production-deployment-vpscloud)
- [Backup & Restore](#-backup--restore)
- [Useful Makefile Commands](#-useful-makefile-commands)
- [Troubleshooting](#-troubleshooting)

---

## 📋 System Requirements

### Minimum Specifications

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 2 Cores | 4 Cores |
| **RAM** | 4 GB | 8 GB+ (if using Ollama/local LLMs) |
| **Storage** | 10 GB free | 20 GB+ (depends on document volume) |
| **OS** | Linux, macOS, Windows (WSL2) | Ubuntu 22.04 LTS |

### Required Software

Choose an installation method, then ensure the necessary software is installed:

| Software | Docker Method | Manual Method | How to Verify |
|----------|:---:|:---:|----------|
| **Git** | ✅ Required | ✅ Required | `git --version` |
| **Docker** | ✅ Required | ❌ | `docker --version` |
| **Docker Compose** | ✅ Required | ❌ | `docker compose version` |
| **Python 3.10+** | ❌ | ✅ Required | `python3 --version` |
| **Node.js 18+** | ❌ | ✅ Required | `node --version` |
| **npm 9+** | ❌ | ✅ Required | `npm --version` |

### Installing Prerequisites

<details>
<summary><strong>🐧 Linux (Ubuntu/Debian)</strong></summary>

```bash
# Git
sudo apt update && sudo apt install -y git

# Docker & Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# ⚠️ Log out and log back in for the docker group to take effect

# Verify
docker --version
docker compose version
```
</details>

<details>
<summary><strong>🍎 macOS</strong></summary>

```bash
# Git (usually pre-installed, or install via Xcode CLI Tools)
xcode-select --install

# Docker Desktop (includes Docker Compose)
# Download from: https://www.docker.com/products/docker-desktop/
# After installing, open Docker Desktop and wait until it's running

# Verify
docker --version
docker compose version
```
</details>

<details>
<summary><strong>🪟 Windows</strong></summary>

1. Install **WSL2**: Open PowerShell as Administrator:
   ```powershell
   wsl --install
   ```
2. Restart your computer
3. Install **Docker Desktop**: Download from https://www.docker.com/products/docker-desktop/
4. Open Docker Desktop → Settings → General → ✅ "Use the WSL 2 based engine"
5. All commands in this guide should be run in the **WSL2** (Ubuntu) terminal
</details>

---

## ⚡ Method 1: One-Line Install (Easiest)

The fastest way to run ORLITH AI. A single command will automatically:
- Clone the repository
- Generate a secure SECRET_KEY
- Build and launch all Docker containers

### Linux & macOS

```bash
curl -sSL https://raw.githubusercontent.com/alpha24-rz/Orlith/main/install.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/alpha24-rz/Orlith/main/install.ps1 | iex
```

Once complete, open your browser:
- 🖥️ **App**: http://localhost:3000
- 📖 **API Docs**: http://localhost:8000/docs

---

## 🐳 Method 2: Docker Compose (Recommended)

This method gives you more control over configuration. Ideal for production and servers.

### Step 1 — Clone the Repository

```bash
git clone https://github.com/alpha24-rz/Orlith.git
cd Orlith
```

### Step 2 — Create Configuration File (`.env`)

Copy the configuration template:

```bash
cp .env.example .env
```

Then open `.env` with a text editor and **you must** change `SECRET_KEY`:

```bash
nano .env   # or use any other editor: vim, code, etc.
```

> ⚠️ **IMPORTANT:** Replace the `SECRET_KEY` value with a random string of at least 32 characters. Use this command to auto-generate one:
> ```bash
> python3 -c "import secrets; print(secrets.token_hex(32))"
> ```

Example of a configured `.env`:

```env
# ─── Must Change ─────────────────────────────────────────────
ENVIRONMENT=production
SECRET_KEY=a1b2c3d4e5f6...your-random-key-at-least-32-chars

# ─── Optional (leave defaults if running on localhost) ───────
NEXT_PUBLIC_API_URL=http://localhost:8000
DATABASE_URL=sqlite+aiosqlite:///./data/documind.db
LOG_LEVEL=INFO
```

### Step 3 — Build & Launch

```bash
docker compose up --build -d
```

> 💡 **Note:** The first build takes **5-15 minutes** depending on your internet speed (downloading Docker images and Python/Node.js dependencies).

### Step 4 — Verify Installation

Check that all containers are running:

```bash
docker compose ps
```

Expected output:

```
NAME                 STATUS              PORTS
documind-backend     Up (healthy)        0.0.0.0:8000->8000/tcp
documind-frontend    Up                  0.0.0.0:3000->3000/tcp
documind-postgres    Up                  0.0.0.0:5432->5432/tcp
```

Check backend health:

```bash
curl http://localhost:8000/health
```

Expected output:

```json
{
  "status": "healthy",
  "service": "DocuMind AI",
  "dependencies": {
    "database": "connected",
    "chroma": "connected"
  }
}
```

### Step 5 — Open the App 🎉

| Service | URL |
|---------|-----|
| 🖥️ **Frontend (Main UI)** | http://localhost:3000 |
| 📖 **Swagger API Docs** | http://localhost:8000/docs |
| 📘 **ReDoc API Docs** | http://localhost:8000/redoc |

**First steps in the app:**
1. Open http://localhost:3000
2. Click **Register** to create a new account
3. Login with your new account
4. Create your first **Workspace**
5. Upload documents (PDF, DOCX, or TXT)
6. Start chatting with your documents!

### Stopping & Restarting

```bash
# Stop all services
docker compose down

# Restart (without rebuilding)
docker compose up -d

# View real-time logs
docker compose logs -f

# View backend logs only
docker compose logs -f backend
```

---

## 🔧 Method 3: Manual Installation (For Developers)

This method is ideal if you want to modify the source code or run without Docker.

### Step 1 — Clone & Configure

```bash
git clone https://github.com/alpha24-rz/Orlith.git
cd Orlith
cp .env.example .env
# Edit .env → change SECRET_KEY (see Method 2 instructions)
```

### Step 2 — (Optional) Install Tesseract OCR

Required for reading scanned PDF documents (image-based):

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y tesseract-ocr libtesseract-dev build-essential

# macOS
brew install tesseract

# Verify
tesseract --version
```

### Step 3 — Setup Backend (FastAPI)

Open a terminal and run:

```bash
# Navigate to the backend directory
cd backend

# Create a Python virtual environment
python3 -m venv venv

# Activate the virtual environment
source venv/bin/activate        # Linux/macOS
# venv\Scripts\activate         # Windows

# Install all Python dependencies
pip install -r requirements.txt
```

> ⏱️ **Note:** Installing `sentence-transformers` (for reranking) and `chromadb` can take several minutes.

Start the backend server:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

✅ Backend is now running at **http://localhost:8000**

> 💡 The `--reload` flag auto-restarts the server when code changes are detected (useful for development).

### Step 4 — Setup Frontend (Next.js)

Open a **new terminal** (keep the backend terminal running):

```bash
# Navigate to the frontend directory
cd frontend

# Create local configuration file
cat <<EOF > .env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
BACKEND_URL=http://localhost:8000
EOF

# Install Node.js dependencies
npm install

# Start the development server
npm run dev
```

✅ Frontend is now running at **http://localhost:3000**

### Shortcut: Run Everything at Once with Make

If you have `make` installed, simply run:

```bash
# Initial setup (create .env + install all dependencies)
make setup

# Run backend + frontend simultaneously
make dev
```

---

## ⚙️ Post-Installation Configuration

### Adding LLM API Keys

ORLITH AI uses a **BYOK** (Bring Your Own Key) model — you connect your own API keys from your preferred AI provider.

| Provider | How to Get a Key | Free? |
|----------|-----------------|-------|
| **OpenRouter** | https://openrouter.ai/keys | ✅ Many free models |
| **OpenAI** | https://platform.openai.com/api-keys | ❌ Paid |
| **Anthropic** | https://console.anthropic.com/ | ❌ Paid |
| **Google Gemini** | https://aistudio.google.com/apikey | ✅ Free tier available |
| **Ollama** | Install on your local machine | ✅ Free & offline |

**How to set up in the app:**

1. Log into ORLITH AI → open your **Workspace**
2. Click the ⚙️ **Settings** icon in the sidebar
3. **AI Provider** tab → select your provider (e.g., OpenRouter)
4. **API Keys** tab → enter your API key
5. Choose a model (e.g., `deepseek/deepseek-chat`)
6. Save the configuration

> 🔒 **Security:** All API keys are encrypted using **Fernet (AES-128-CBC)** before being stored in the database. Plaintext keys are never persisted.

### Recommended Providers for Beginners

| Use Case | Provider | Model | Why |
|----------|----------|-------|-----|
| **Free & easy** | OpenRouter | `deepseek/deepseek-chat` | Free, fast |
| **High quality** | Anthropic | `claude-3.5-sonnet` | Very accurate |
| **Total privacy** | Ollama | `llama3` | 100% offline, free |
| **Large context** | Google | `gemini-2.5-flash` | 1M token context |

---

## 🏠 Using Local LLMs (Ollama) — Fully Offline

With Ollama, your data **never** leaves your computer. Perfect for confidential documents.

### Step 1 — Install Ollama

```bash
# Linux
curl -fsSL https://ollama.com/install.sh | sh

# macOS
# Download from: https://ollama.com/download

# Verify
ollama --version
```

### Step 2 — Download Models

```bash
# Chat model (for answering questions)
ollama pull llama3

# Embedding model (for document search) — IMPORTANT!
ollama pull nomic-embed-text
```

> 💡 **Tips:** For machines with ≤ 8GB RAM, use lighter models:
> ```bash
> ollama pull phi3:mini           # Light chat model (~2.3GB)
> ollama pull nomic-embed-text    # Embedding model (~274MB)
> ```

### Step 3 — Configure in ORLITH

1. Make sure Ollama is running: `ollama serve`
2. In ORLITH → Workspace Settings → AI Provider → select **Ollama (Local)**
3. Enter the Base URL:

| Scenario | Base URL |
|----------|----------|
| ORLITH in **Docker**, Ollama on **host** (macOS/Windows) | `http://host.docker.internal:11434` |
| ORLITH in **Docker**, Ollama on **host** (Linux) | See note below ⬇️ |
| ORLITH **manual** (no Docker) | `http://localhost:11434` |

<details>
<summary><strong>🐧 Special note for Docker on Linux</strong></summary>

On Linux, `host.docker.internal` is not available by default. Add the following to `docker-compose.yml` under the `backend` service:

```yaml
services:
  backend:
    # ... other configuration ...
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Then restart: `docker compose up -d`

Base URL: `http://host.docker.internal:11434`
</details>

---

## 🌐 Production Deployment (VPS/Cloud)

### Additional Steps for Remote Servers

If you're deploying ORLITH AI to a VPS (e.g., DigitalOcean, AWS, Hetzner):

**1. Update `NEXT_PUBLIC_API_URL` in `.env`:**

```env
# Replace localhost with your server's public IP
NEXT_PUBLIC_API_URL=http://203.0.113.50:8000

# Or if you have a domain:
NEXT_PUBLIC_API_URL=https://api.orlith.yourcompany.com
```

**2. Update `CORS_ORIGINS` in `.env`:**

```env
CORS_ORIGINS=http://203.0.113.50:3000,https://orlith.yourcompany.com
```

**3. Rebuild after changing `.env`:**

```bash
docker compose down
docker compose up --build -d
```

### Nginx Reverse Proxy Setup (Optional but Recommended)

Nginx acts as a single gateway so users only need to access one domain (no `:3000` or `:8000` ports).

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/orlith
```

Configuration file contents:

```nginx
server {
    listen 80;
    server_name orlith.yourcompany.com;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API + WebSocket
    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Long timeouts for streaming chat & WebSocket
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

Activate and run:

```bash
sudo ln -s /etc/nginx/sites-available/orlith /etc/nginx/sites-enabled/
sudo nginx -t          # Test configuration
sudo systemctl reload nginx
```

### Add SSL/HTTPS (Free via Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d orlith.yourcompany.com
```

> After SSL is active, update `.env`:
> ```env
> NEXT_PUBLIC_API_URL=https://orlith.yourcompany.com/api
> ```

---

## 💾 Backup & Restore

All ORLITH AI data is stored in a single folder: `./data/`

```
./data/
├── documind.db     # Main database (users, workspaces, chat history)
├── chroma/         # Vector database (embeddings for search)
└── uploads/        # Original document files (PDF, DOCX, TXT)
```

### Backup

```bash
# Stop services first (prevents database corruption)
docker compose down

# Create backup archive
tar -czvf orlith-backup-$(date +%F).tar.gz ./data

# Restart
docker compose up -d
```

### Restore

```bash
docker compose down
tar -xzvf orlith-backup-2026-06-18.tar.gz -C .
docker compose up -d
```

---

## 🛠️ Useful Makefile Commands

If you have `make` installed, these commands are available:

| Command | Function |
|---------|----------|
| `make setup` | Initial setup — create `.env`, install all dependencies |
| `make dev` | Run backend + frontend locally (no Docker) |
| `make dev-docker` | Run with Docker + hot-reload (development mode) |
| `make up` | Start all services (production mode) |
| `make stop` | Stop all services |
| `make restart` | Restart all services |
| `make logs` | View real-time logs for all services |
| `make logs-backend` | View backend logs only |
| `make build` | Rebuild Docker images (no cache) |
| `make test` | Run all tests |
| `make lint` | Lint code (backend: ruff, frontend: eslint) |
| `make health` | Check health of running services |
| `make clean` | Remove Docker containers and images |
| `make clean-data` | ⚠️ Delete ALL data (database, uploads, vectors) |
| `make help` | Show all available commands |

---

## 🔍 Troubleshooting

### ❌ "Failed to fetch" error on the frontend

**Cause:** Frontend can't reach the backend API.

**Solution:**
1. Check if backend is running: `curl http://localhost:8000/health`
2. Verify `NEXT_PUBLIC_API_URL` in `.env`:
   - On **localhost**: `http://localhost:8000`
   - On **server/VPS**: `http://<SERVER_IP>:8000`
3. Rebuild frontend: `docker compose up --build -d frontend`

> ⚠️ `NEXT_PUBLIC_` variables are embedded at build time. If you change them, the frontend must be rebuilt.

---

### ❌ "SQLite DB is locked" error

**Cause:** The `./data/` folder has incorrect permissions.

**Solution:**
```bash
sudo chmod -R 775 ./data
sudo chown -R $USER:docker ./data
```

---

### ❌ PDF upload fails or is extremely slow

**Cause:** Scanned PDFs (image-based) trigger automatic OCR which is CPU-intensive.

**Solution:**
- Ensure sufficient CPU (minimum 2 cores)
- If using Nginx, increase timeouts:
  ```nginx
  proxy_read_timeout 300;
  proxy_send_timeout 300;
  ```

---

### ❌ Document progress bar doesn't update in real-time

**Cause:** WebSocket connections are being blocked by proxy or firewall.

**Solution:** Ensure your Nginx config includes WebSocket headers:
```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

---

### ❌ "Reranker model could not be loaded"

**Cause:** `sentence-transformers` library is not installed or model hasn't been downloaded.

**Solution:** This is not a fatal error — the system falls back to ranking without the reranker. To install:
```bash
pip install sentence-transformers
```

> 💡 The reranker model (`BAAI/bge-reranker-base`) is automatically downloaded on first use (~1GB). Ensure internet connectivity is available.

---

### ❌ "Provider configuration issue"

**Cause:** API key not configured or expired.

**Solution:**
1. Open Workspace Settings → **API Keys** tab
2. Check that a key has been added for the selected provider
3. If using OpenRouter, check your credit balance at https://openrouter.ai/credits

---

### ❌ Container won't start / Docker build fails

**General solution:**
```bash
# Clear cache and rebuild from scratch
docker compose down --rmi local --remove-orphans
docker compose up --build -d

# If still failing, check disk space
df -h
```

---

## 📞 Need Help?

- 📖 **API Docs**: Access `http://localhost:8000/docs` for interactive Swagger UI
- 🐛 **Bug Reports**: Create an issue on the [GitHub Repository](https://github.com/alpha24-rz/Orlith/issues)
- 📝 **Technical Docs**: See `docs/self-hosted-setup.md` for advanced deployment guide

---

<div align="center">

**ORLITH AI** — *Your Intelligent Corporate Brain.*  
Built with ❤️ using FastAPI, Next.js, and ChromaDB.

</div>
