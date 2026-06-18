# 🚀 Panduan Instalasi ORLITH AI

> **ORLITH AI** — Your Intelligent Corporate Brain.  
> Platform AI self-hosted untuk menganalisis dan berinteraksi dengan ribuan dokumen menggunakan teknologi RAG (Retrieval-Augmented Generation).

Panduan ini akan membantu Anda menginstal dan menjalankan ORLITH AI dari nol hingga siap digunakan. Ditulis agar mudah diikuti oleh siapa saja — dari pemula hingga developer berpengalaman.

---

## 📑 Daftar Isi

- [Persyaratan Sistem](#-persyaratan-sistem)
- [Metode 1: Instalasi Satu Perintah (Paling Mudah)](#-metode-1-instalasi-satu-perintah-paling-mudah)
- [Metode 2: Docker Compose (Disarankan)](#-metode-2-docker-compose-disarankan)
- [Metode 3: Instalasi Manual (Untuk Developer)](#-metode-3-instalasi-manual-untuk-developer)
- [Konfigurasi Setelah Instalasi](#-konfigurasi-setelah-instalasi)
- [Menggunakan LLM Lokal (Ollama)](#-menggunakan-llm-lokal-ollama--sepenuhnya-offline)
- [Deploy ke Production (VPS/Cloud)](#-deploy-ke-production-vpscloud)
- [Backup & Restore Data](#-backup--restore-data)
- [Perintah Makefile Berguna](#-perintah-makefile-berguna)
- [Troubleshooting / Solusi Masalah](#-troubleshooting--solusi-masalah)

---

## 📋 Persyaratan Sistem

### Spesifikasi Minimum

| Komponen | Minimum | Direkomendasikan |
|----------|---------|------------------|
| **CPU** | 2 Core | 4 Core |
| **RAM** | 4 GB | 8 GB+ (jika menggunakan Ollama/LLM lokal) |
| **Penyimpanan** | 10 GB kosong | 20 GB+ (tergantung jumlah dokumen) |
| **OS** | Linux, macOS, Windows (WSL2) | Ubuntu 22.04 LTS |

### Software yang Dibutuhkan

Pilih salah satu metode instalasi, lalu pastikan software yang dibutuhkan sudah terinstal:

| Software | Docker Method | Manual Method | Cara Cek |
|----------|:---:|:---:|----------|
| **Git** | ✅ Wajib | ✅ Wajib | `git --version` |
| **Docker** | ✅ Wajib | ❌ | `docker --version` |
| **Docker Compose** | ✅ Wajib | ❌ | `docker compose version` |
| **Python 3.10+** | ❌ | ✅ Wajib | `python3 --version` |
| **Node.js 18+** | ❌ | ✅ Wajib | `node --version` |
| **npm 9+** | ❌ | ✅ Wajib | `npm --version` |

### Cara Instal Prasyarat

<details>
<summary><strong>🐧 Linux (Ubuntu/Debian)</strong></summary>

```bash
# Git
sudo apt update && sudo apt install -y git

# Docker & Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# ⚠️ Logout dan login kembali agar grup docker aktif

# Verifikasi
docker --version
docker compose version
```
</details>

<details>
<summary><strong>🍎 macOS</strong></summary>

```bash
# Git (biasanya sudah terinstal, atau via Xcode CLI Tools)
xcode-select --install

# Docker Desktop (sudah termasuk Docker Compose)
# Download dari: https://www.docker.com/products/docker-desktop/
# Setelah install, buka Docker Desktop dan tunggu sampai running

# Verifikasi
docker --version
docker compose version
```
</details>

<details>
<summary><strong>🪟 Windows</strong></summary>

1. Install **WSL2**: Buka PowerShell sebagai Administrator:
   ```powershell
   wsl --install
   ```
2. Restart komputer
3. Install **Docker Desktop**: Download dari https://www.docker.com/products/docker-desktop/
4. Buka Docker Desktop → Settings → General → ✅ "Use the WSL 2 based engine"
5. Semua perintah di panduan ini dijalankan di terminal **WSL2** (Ubuntu)
</details>

---

## ⚡ Metode 1: Instalasi Satu Perintah (Paling Mudah)

Cara tercepat untuk menjalankan ORLITH AI. Cukup satu perintah, script otomatis akan:
- Clone repositori
- Generate SECRET_KEY yang aman
- Build dan jalankan semua container Docker

### Linux & macOS

```bash
curl -sSL https://raw.githubusercontent.com/alpha24-rz/Orlith/main/install.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/alpha24-rz/Orlith/main/install.ps1 | iex
```

Setelah selesai, buka browser dan akses:
- 🖥️ **Aplikasi**: http://localhost:3000
- 📖 **API Docs**: http://localhost:8000/docs

---

## 🐳 Metode 2: Docker Compose (Disarankan)

Metode ini memberikan kontrol lebih terhadap konfigurasi. Cocok untuk production dan server.

### Langkah 1 — Clone Repositori

```bash
git clone https://github.com/alpha24-rz/Orlith.git
cd Orlith
```

### Langkah 2 — Buat File Konfigurasi (`.env`)

Salin template konfigurasi:

```bash
cp .env.example .env
```

Kemudian buka file `.env` dengan text editor dan **wajib** ubah `SECRET_KEY`:

```bash
nano .env   # atau gunakan editor lain: vim, code, dll
```

> ⚠️ **PENTING:** Ganti nilai `SECRET_KEY` dengan string acak minimal 32 karakter. Gunakan perintah ini untuk generate otomatis:
> ```bash
> python3 -c "import secrets; print(secrets.token_hex(32))"
> ```

Contoh isi `.env` yang sudah dikonfigurasi:

```env
# ─── Wajib Diubah ───────────────────────────────────────────
ENVIRONMENT=production
SECRET_KEY=a1b2c3d4e5f6...kunci-acak-anda-minimal-32-karakter

# ─── Opsional (biarkan default jika berjalan di localhost) ──
NEXT_PUBLIC_API_URL=http://localhost:8000
DATABASE_URL=sqlite+aiosqlite:///./data/documind.db
LOG_LEVEL=INFO
```

### Langkah 3 — Build & Jalankan

```bash
docker compose up --build -d
```

> 💡 **Catatan:** Proses build pertama kali membutuhkan waktu **5-15 menit** tergantung kecepatan internet (mengunduh Docker images dan dependensi Python/Node.js).

### Langkah 4 — Verifikasi Instalasi

Cek apakah semua container berjalan:

```bash
docker compose ps
```

Output yang diharapkan:

```
NAME                 STATUS              PORTS
documind-backend     Up (healthy)        0.0.0.0:8000->8000/tcp
documind-frontend    Up                  0.0.0.0:3000->3000/tcp
documind-postgres    Up                  0.0.0.0:5432->5432/tcp
```

Cek kesehatan backend:

```bash
curl http://localhost:8000/health
```

Output yang diharapkan:

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

### Langkah 5 — Buka Aplikasi 🎉

| Layanan | URL |
|---------|-----|
| 🖥️ **Frontend (UI Utama)** | http://localhost:3000 |
| 📖 **Swagger API Docs** | http://localhost:8000/docs |
| 📘 **ReDoc API Docs** | http://localhost:8000/redoc |

**Langkah pertama di aplikasi:**
1. Buka http://localhost:3000
2. Klik **Register** untuk membuat akun baru
3. Login dengan akun yang baru dibuat
4. Buat **Workspace** pertama Anda
5. Upload dokumen (PDF, DOCX, atau TXT)
6. Mulai chat dengan dokumen Anda!

### Menghentikan & Menjalankan Ulang

```bash
# Menghentikan semua layanan
docker compose down

# Menjalankan kembali (tanpa rebuild)
docker compose up -d

# Melihat log secara real-time
docker compose logs -f

# Melihat log backend saja
docker compose logs -f backend
```

---

## 🔧 Metode 3: Instalasi Manual (Untuk Developer)

Metode ini cocok jika Anda ingin memodifikasi kode sumber atau menjalankan tanpa Docker.

### Langkah 1 — Clone & Konfigurasi

```bash
git clone https://github.com/alpha24-rz/Orlith.git
cd Orlith
cp .env.example .env
# Edit .env → ubah SECRET_KEY (lihat instruksi di Metode 2)
```

### Langkah 2 — (Opsional) Install Tesseract OCR

Dibutuhkan untuk membaca PDF yang berupa hasil scan (gambar):

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y tesseract-ocr libtesseract-dev build-essential

# macOS
brew install tesseract

# Verifikasi
tesseract --version
```

### Langkah 3 — Setup Backend (FastAPI)

Buka terminal dan jalankan:

```bash
# Masuk ke folder backend
cd backend

# Buat virtual environment Python
python3 -m venv venv

# Aktifkan virtual environment
source venv/bin/activate        # Linux/macOS
# venv\Scripts\activate         # Windows

# Install semua dependensi Python
pip install -r requirements.txt
```

> ⏱️ **Catatan:** Install `sentence-transformers` (untuk reranker) dan `chromadb` bisa memakan waktu beberapa menit.

Jalankan server backend:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

✅ Backend sekarang berjalan di **http://localhost:8000**

> 💡 Flag `--reload` membuat server auto-restart saat ada perubahan kode (berguna untuk development).

### Langkah 4 — Setup Frontend (Next.js)

Buka **terminal baru** (biarkan terminal backend tetap berjalan):

```bash
# Masuk ke folder frontend
cd frontend

# Buat file konfigurasi lokal
cat <<EOF > .env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
BACKEND_URL=http://localhost:8000
EOF

# Install dependensi Node.js
npm install

# Jalankan development server
npm run dev
```

✅ Frontend sekarang berjalan di **http://localhost:3000**

### Pintasan: Jalankan Semua Sekaligus dengan Make

Jika Anda memiliki `make` terinstal, cukup jalankan:

```bash
# Setup awal (buat .env + install dependensi)
make setup

# Jalankan backend + frontend bersamaan
make dev
```

---

## ⚙️ Konfigurasi Setelah Instalasi

### Menambahkan API Key LLM

ORLITH AI menggunakan model **BYOK** (Bring Your Own Key) — Anda menghubungkan API key sendiri dari provider AI yang Anda pilih.

| Provider | Cara Mendapatkan Key | Gratis? |
|----------|---------------------|---------|
| **OpenRouter** | https://openrouter.ai/keys | ✅ Banyak model gratis |
| **OpenAI** | https://platform.openai.com/api-keys | ❌ Berbayar |
| **Anthropic** | https://console.anthropic.com/ | ❌ Berbayar |
| **Google Gemini** | https://aistudio.google.com/apikey | ✅ Tier gratis tersedia |
| **Ollama** | Install di komputer lokal | ✅ Gratis & offline |

**Cara setup di aplikasi:**

1. Login ke ORLITH AI → buka **Workspace** Anda
2. Klik ikon ⚙️ **Settings** pada sidebar
3. Tab **AI Provider** → pilih provider (misal: OpenRouter)
4. Tab **API Keys** → masukkan API key Anda
5. Pilih model yang ingin digunakan (misal: `deepseek/deepseek-chat`)
6. Simpan konfigurasi

> 🔒 **Keamanan:** Semua API key dienkripsi menggunakan **Fernet (AES-128-CBC)** sebelum disimpan ke database. Key plaintext tidak pernah tersimpan.

### Provider yang Paling Direkomendasikan untuk Pemula

| Kebutuhan | Provider | Model | Kelebihan |
|-----------|----------|-------|-----------|
| **Gratis, mudah** | OpenRouter | `deepseek/deepseek-chat` | Gratis, cepat |
| **Kualitas tinggi** | Anthropic | `claude-3.5-sonnet` | Sangat akurat |
| **Privasi total** | Ollama | `llama3` | 100% offline, gratis |
| **Konteks besar** | Google | `gemini-2.5-flash` | 1M token context |

---

## 🏠 Menggunakan LLM Lokal (Ollama) — Sepenuhnya Offline

Dengan Ollama, data Anda **tidak pernah** keluar dari komputer Anda. Sempurna untuk dokumen rahasia.

### Langkah 1 — Install Ollama

```bash
# Linux
curl -fsSL https://ollama.com/install.sh | sh

# macOS
# Download dari: https://ollama.com/download

# Verifikasi
ollama --version
```

### Langkah 2 — Download Model

```bash
# Model chat (untuk menjawab pertanyaan)
ollama pull llama3

# Model embedding (untuk pencarian dokumen) — PENTING!
ollama pull nomic-embed-text
```

> 💡 **Tips:** Untuk komputer dengan RAM ≤ 8GB, gunakan model yang lebih ringan:
> ```bash
> ollama pull phi3:mini           # Model chat ringan (~2.3GB)
> ollama pull nomic-embed-text    # Model embedding (~274MB)
> ```

### Langkah 3 — Konfigurasi di ORLITH

1. Pastikan Ollama berjalan: `ollama serve`
2. Di ORLITH → Workspace Settings → AI Provider → pilih **Ollama (Local)**
3. Masukkan Base URL:

| Situasi | Base URL |
|---------|----------|
| ORLITH di **Docker**, Ollama di **host** (macOS/Windows) | `http://host.docker.internal:11434` |
| ORLITH di **Docker**, Ollama di **host** (Linux) | Lihat catatan di bawah ⬇️ |
| ORLITH **manual** (tanpa Docker) | `http://localhost:11434` |

<details>
<summary><strong>🐧 Catatan khusus Docker di Linux</strong></summary>

Di Linux, `host.docker.internal` tidak tersedia secara default. Tambahkan baris berikut di `docker-compose.yml` pada service `backend`:

```yaml
services:
  backend:
    # ... konfigurasi lainnya ...
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Kemudian restart: `docker compose up -d`

Base URL: `http://host.docker.internal:11434`
</details>

---

## 🌐 Deploy ke Production (VPS/Cloud)

### Langkah Tambahan untuk Server Remote

Jika Anda men-deploy ORLITH AI ke VPS (misal: DigitalOcean, AWS, Hetzner):

**1. Ubah `NEXT_PUBLIC_API_URL` di `.env`:**

```env
# Ganti localhost dengan IP publik server Anda
NEXT_PUBLIC_API_URL=http://203.0.113.50:8000

# Atau jika sudah ada domain:
NEXT_PUBLIC_API_URL=https://api.orlith.perusahaan.com
```

**2. Ubah `CORS_ORIGINS` di `.env`:**

```env
CORS_ORIGINS=http://203.0.113.50:3000,https://orlith.perusahaan.com
```

**3. Rebuild setelah mengubah `.env`:**

```bash
docker compose down
docker compose up --build -d
```

### Setup Nginx Reverse Proxy (Opsional tapi Direkomendasikan)

Nginx berfungsi sebagai gerbang tunggal sehingga pengguna cukup mengakses satu domain (tanpa port `:3000` atau `:8000`).

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/orlith
```

Isi file konfigurasi:

```nginx
server {
    listen 80;
    server_name orlith.perusahaan.com;

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

        # Timeout panjang untuk streaming chat & WebSocket
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

Aktifkan dan jalankan:

```bash
sudo ln -s /etc/nginx/sites-available/orlith /etc/nginx/sites-enabled/
sudo nginx -t          # Test konfigurasi
sudo systemctl reload nginx
```

### Tambahkan SSL/HTTPS (Gratis via Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d orlith.perusahaan.com
```

> Setelah SSL aktif, update `.env`:
> ```env
> NEXT_PUBLIC_API_URL=https://orlith.perusahaan.com/api
> ```

---

## 💾 Backup & Restore Data

Semua data ORLITH AI tersimpan di satu folder: `./data/`

```
./data/
├── documind.db     # Database utama (users, workspace, chat history)
├── chroma/         # Database vektor (embeddings untuk pencarian)
└── uploads/        # File dokumen asli (PDF, DOCX, TXT)
```

### Backup

```bash
# Hentikan layanan dulu (hindari korupsi database)
docker compose down

# Buat arsip backup
tar -czvf orlith-backup-$(date +%F).tar.gz ./data

# Jalankan kembali
docker compose up -d
```

### Restore

```bash
docker compose down
tar -xzvf orlith-backup-2026-06-18.tar.gz -C .
docker compose up -d
```

---

## 🛠️ Perintah Makefile Berguna

Jika Anda memiliki `make` terinstal, berikut perintah-perintah yang tersedia:

| Perintah | Fungsi |
|----------|--------|
| `make setup` | Setup awal — buat `.env`, install semua dependensi |
| `make dev` | Jalankan backend + frontend secara lokal (tanpa Docker) |
| `make dev-docker` | Jalankan dengan Docker + hot-reload (mode development) |
| `make up` | Jalankan semua layanan (mode production) |
| `make stop` | Hentikan semua layanan |
| `make restart` | Restart semua layanan |
| `make logs` | Lihat log real-time semua layanan |
| `make logs-backend` | Lihat log backend saja |
| `make build` | Build ulang Docker images (tanpa cache) |
| `make test` | Jalankan semua test |
| `make lint` | Linting kode (backend: ruff, frontend: eslint) |
| `make health` | Cek kesehatan layanan yang berjalan |
| `make clean` | Hapus Docker containers dan images |
| `make clean-data` | ⚠️ Hapus SEMUA data (database, uploads, vectors) |
| `make help` | Tampilkan semua perintah yang tersedia |

---

## 🔍 Troubleshooting / Solusi Masalah

### ❌ Error: "Failed to fetch" di halaman frontend

**Penyebab:** Frontend tidak bisa menghubungi backend API.

**Solusi:**
1. Pastikan backend berjalan: `curl http://localhost:8000/health`
2. Periksa `NEXT_PUBLIC_API_URL` di `.env`:
   - Jika di **localhost**: `http://localhost:8000`
   - Jika di **server/VPS**: `http://<IP_SERVER>:8000`
3. Rebuild frontend: `docker compose up --build -d frontend`

> ⚠️ `NEXT_PUBLIC_` variabel di-embed saat build. Jika Anda mengubahnya, frontend harus di-rebuild.

---

### ❌ Error: "SQLite DB is locked"

**Penyebab:** Permission folder `./data/` tidak sesuai.

**Solusi:**
```bash
sudo chmod -R 775 ./data
sudo chown -R $USER:docker ./data
```

---

### ❌ Upload PDF gagal atau sangat lambat

**Penyebab:** PDF berupa hasil scan (gambar) → OCR aktif secara otomatis dan memakan CPU.

**Solusi:**
- Pastikan server memiliki CPU yang cukup (minimal 2 core)
- Jika menggunakan Nginx, naikkan timeout:
  ```nginx
  proxy_read_timeout 300;
  proxy_send_timeout 300;
  ```

---

### ❌ Progress bar dokumen tidak bergerak real-time

**Penyebab:** Koneksi WebSocket terblokir oleh proxy atau firewall.

**Solusi:** Pastikan konfigurasi Nginx memiliki header WebSocket:
```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

---

### ❌ Error: "Reranker model could not be loaded"

**Penyebab:** Library `sentence-transformers` tidak terinstal atau model belum terdownload.

**Solusi:** Ini bukan error fatal — sistem akan fallback ke ranking tanpa reranker. Untuk menginstal:
```bash
pip install sentence-transformers
```

> 💡 Model reranker (`BAAI/bge-reranker-base`) akan didownload otomatis saat pertama kali digunakan (~1GB). Pastikan koneksi internet tersedia.

---

### ❌ Error: "Provider configuration issue"

**Penyebab:** API key belum dikonfigurasi atau sudah expired.

**Solusi:**
1. Buka Workspace Settings → tab **API Keys**
2. Periksa apakah key sudah ditambahkan untuk provider yang dipilih
3. Jika menggunakan OpenRouter, pastikan saldo/kredit masih tersedia di https://openrouter.ai/credits

---

### ❌ Container tidak mau start / Docker build gagal

**Solusi umum:**
```bash
# Hapus cache dan rebuild dari awal
docker compose down --rmi local --remove-orphans
docker compose up --build -d

# Jika masih gagal, cek disk space
df -h
```

---

## 📞 Butuh Bantuan?

- 📖 **API Docs**: Akses `http://localhost:8000/docs` untuk Swagger interaktif
- 🐛 **Bug Report**: Buat issue di [GitHub Repository](https://github.com/alpha24-rz/Orlith/issues)
- 📝 **Dokumentasi Teknis**: Lihat `docs/self-hosted-setup.md` untuk panduan deployment lanjutan

---

<div align="center">

**ORLITH AI** — *Your Intelligent Corporate Brain.*  
Built with ❤️ using FastAPI, Next.js, and ChromaDB.

</div>
