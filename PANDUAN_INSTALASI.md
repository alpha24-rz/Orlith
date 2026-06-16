# Panduan Instalasi ORLITH AI

Panduan ini akan membantu Anda melakukan instalasi dan menjalankan ORLITH AI di server atau komputer lokal Anda. Karena ORLITH AI adalah platform *self-hosted*, ada dua cara utama untuk menjalankannya: menggunakan **Docker** (Sangat Disarankan) atau **Manual** (Untuk Development).

## Prasyarat
Sebelum memulai, pastikan sistem Anda sudah terinstal:
- **Git** (untuk mengambil kode dari repositori)
- **Docker & Docker Compose** (jika ingin menjalankan via Docker)
- **Node.js (v18+) & Python (3.10+)** (hanya jika ingin menjalankan secara manual tanpa Docker)

---

## Opsi 1: Instalasi Menggunakan Docker (Disarankan)

Cara ini paling mudah dan aman karena semua dependensi (database, backend, frontend, vector store) sudah diisolasi di dalam container.

### 1. Clone Repositori
Langkah pertama adalah mengunduh (clone) source code ORLITH AI ke mesin Anda.
```bash
git clone https://github.com/alpha24-rz/Orlith.git
cd Orlith
```
*(Catatan: pastikan nama folder sesuai dengan hasil clone, biasanya `Orlith` atau `orlith`)*

### 2. Konfigurasi Environment (`.env`)
Salin file contoh `.env` jika tersedia, atau buat file `.env` baru di folder utama proyek (root):
```bash
cat <<EOF > .env
ENVIRONMENT=production
SECRET_KEY=ganti-dengan-kunci-rahasia-anda-minimal-32-karakter
LOG_LEVEL=INFO
# NEXT_PUBLIC_API_URL=http://ip-server-anda:8000 # Hapus tanda pagar dan ganti IP jika di-deploy di remote server
EOF
```
**Penting:** Ganti nilai `SECRET_KEY` dengan string acak yang kuat demi keamanan aplikasi Anda.

### 3. Build dan Jalankan Container
Gunakan Docker Compose untuk membangun image dan menjalankan semua layanan di latar belakang (*detached mode*).
```bash
docker-compose up --build -d
```
Tunggu beberapa saat hingga proses build selesai. Docker akan mengunduh image yang dibutuhkan, menginstal dependensi Python dan Node.js, serta menjalankan database.

### 4. Akses Aplikasi
Setelah semua container berjalan, aplikasi ORLITH AI dapat diakses melalui browser Anda:
- **Tampilan Antarmuka (Frontend UI):** `http://localhost:3000`
- **Dokumentasi API Backend (Swagger UI):** `http://localhost:8000/docs`

---

## Opsi 2: Instalasi Manual (Untuk Development/Pengembangan)

Jika Anda adalah seorang pengembang yang ingin memodifikasi kode, Anda bisa menjalankan layanan frontend dan backend secara terpisah tanpa Docker.

### 1. Clone Repositori
```bash
git clone https://github.com/alpha24-rz/Orlith.git
cd Orlith
```

### 2. Menjalankan Backend (FastAPI)
Buka terminal baru dan masuk ke folder `backend`.
```bash
cd backend

# Buat virtual environment
python -m venv venv

# Aktifkan virtual environment
# Di Linux/macOS:
source venv/bin/activate
# Di Windows:
# venv\Scripts\activate

# Instal dependensi Python
pip install -r requirements.txt

# Terapkan migrasi database (SQLite)
alembic upgrade head

# Jalankan server backend
python main.py
```
*Backend sekarang berjalan di `http://localhost:8000`*

### 3. Menjalankan Frontend (Next.js)
Buka terminal baru lainnya dan masuk ke folder `frontend`.
```bash
cd frontend

# Instal dependensi Node.js (bisa juga menggunakan pnpm/yarn)
npm install

# Jalankan development server
npm run dev
```
*Frontend sekarang berjalan di `http://localhost:3000`*

---

## Konfigurasi Tambahan Setelah Instalasi

### Menambahkan API Key LLM (OpenAI, Anthropic, dll)
1. Buka aplikasi di `http://localhost:3000`.
2. Masuk ke menu **Workspace Settings** (Pengaturan Ruang Kerja).
3. Pada tab **AI Provider**, pilih penyedia model AI yang Anda inginkan.
4. Pada tab **API Keys**, masukkan kunci API (*API Key*) Anda. Kunci ini akan dienkripsi dengan aman di dalam database.

### Menggunakan LLM Lokal (Ollama - Sepenuhnya Offline)
Jika Anda tidak ingin data Anda keluar dari server lokal, Anda bisa menggunakan Ollama:
1. Pastikan Anda sudah menginstal dan menjalankan [Ollama](https://ollama.com/) di mesin Anda.
2. Unduh model yang diinginkan melalui terminal, misalnya: `ollama run llama3`.
3. Di antarmuka ORLITH (Workspace Settings), pilih **Ollama (Local)**.
4. Masukkan Base URL dari Ollama. Jika ORLITH berjalan di dalam Docker, biasanya URL-nya adalah `http://host.docker.internal:11434`. Jika berjalan secara manual, gunakan `http://localhost:11434`.

---

## Lokasi Data Penting
Secara default, ORLITH menyimpan data secara lokal di dalam folder proyek Anda:
- **Database Utama (SQLite):** `./data/documind.db`
- **Database Vektor (ChromaDB):** `./data/chroma`
- **File Unggahan (Dokumen):** `./data/uploads`

Pastikan Anda melakukan *backup* (cadangan) secara berkala pada folder `./data` tersebut agar tidak kehilangan data Anda.
