# 🚀 Panduan Menjalankan Backend Orlith di Google Colab (NVIDIA L4 GPU)

Panduan ini berisi langkah-langkah praktis untuk menjalankan backend **Orlith AI (SOTA RAG 2.0)** beserta model AI lokal (**Ollama + Sentence-Transformers + EasyOCR**) pada Google Colab dengan GPU **NVIDIA L4 (24GB VRAM)**.

---

## 📋 Keunggulan Menjalankan di NVIDIA L4 GPU (24GB VRAM)
* **Akselerasi CUDA Penuh**:
  - **Ollama Engine**: Menjalankan model `qwen2.5:7b` atau `qwen2.5:14b` langsung di VRAM GPU L4 dengan kecepatan generasi token sangat tinggi.
  - **Embedding SOTA**: Model `BAAI/bge-m3` berjalan di GPU CUDA untuk proses embedding ribuan chunk dokumen dalam hitungan detik.
  - **Cross-Encoder Reranker**: Model `BAAI/bge-reranker-base` di-akselerasi GPU untuk perangkingan konteks yang presisi.
  - **EasyOCR GPU**: Ekstraksi teks dari PDF scan/gambar dipercepat dengan CUDA.
* **Fitur SOTA RAG 2.0 Aktif**:
  - **Multilingual Query Expansion**: Adaptif Bahasa Indonesia dan English.
  - **HyDE (Hypothetical Document Embeddings)**: Mengisi celah semantik antara query pengguna dan isi dokumen.
  - **Neighbor Chunk Stitching**: Menyatukan chunk bertetangga agar tidak ada kalimat terputus.
  - **Parent-Child Context**: Memberikan konteks narasi lengkap 1500 karakter ke LLM.
* **100% Bebas Biaya Token API**: Tanpa perlu membayar API OpenAI atau Anthropic.
* **Akses Publik Gratis**: Menggunakan Cloudflare Tunnel (`cloudflared`) untuk mendapatkan URL HTTPS publik otomatis tanpa perlu akun atau setup rumit.

---

## 🛠️ Langkah-Langkah Menjalankan

### Langkah 1: Buka Google Colab
1. Buka browser dan kunjungi [Google Colab](https://colab.research.google.com/).
2. Pilih tab **Upload**, lalu upload file notebook [`Orlith_Colab_L4_Server.ipynb`](./Orlith_Colab_L4_Server.ipynb).

### Langkah 2: Aktifkan GPU NVIDIA L4
1. Di menu atas Colab, klik **Runtime** -> **Change runtime type**.
2. Pada bagian **Hardware accelerator**, pilih **GPU**.
3. Pada bagian **GPU type**, pilih **L4** (tersedia di Colab Pro / compute units).
4. Klik **Save**.

### Langkah 3: Jalankan Cell Secara Berurutan
Jalankan setiap cell dari atas ke bawah:
1. **Langkah 1 (Cek GPU)**: Memastikan `nvidia-smi` mendeteksi GPU L4 dengan VRAM ~24GB.
2. **Langkah 2 (Setup Storage Data)**: Menyiapkan folder `/content/orlith_data` untuk database SQLite, ChromaDB vector store, dan file uploads.
3. **Langkah 3 (Ekstrak backend.zip)**:
   - File **`backend.zip`** sudah otomatis disiapkan di folder root proyek Anda.
   - Anda cukup drag-and-drop file `backend.zip` ke panel Files (📁) di sebelah kiri Colab, ATAU jalankan cell untuk membuka dialog upload file langsung.
4. **Langkah 4 (Install Dependencies)**: Menginstall paket Python, PyTorch CUDA, sentence-transformers, dan Cloudflare Tunnel.
5. **Langkah 5 (Jalankan Ollama)**: Menjalankan engine Ollama di background dan mendownload model lokal (default: `qwen2.5:7b`).
6. **Langkah 6 (Buat .env SOTA RAG 2.0)**: Mengonfigurasi backend agar otomatis menggunakan GPU, Ollama, BGE-M3, dan parameter RAG 2.0.
7. **Langkah 7 (Jalankan Server & Tunnel)**: Membuka tunnel Cloudflare dan menjalankan FastAPI server di port 8000.

---

## 🔗 Menghubungkan Frontend ke Backend Colab

Saat cell terakhir dijalankan, Anda akan melihat output URL seperti ini:

```text
=================================================================
🎉 PUBLIC BACKEND URL ANDA: https://random-subdomain.trycloudflare.com
📑 Interactive API Docs   : https://random-subdomain.trycloudflare.com/docs
❤️ Health Check Endpoint  : https://random-subdomain.trycloudflare.com/health
=================================================================

👉 Masukkan URL ini ke file .env Frontend Anda (localhost / Vercel):
NEXT_PUBLIC_API_URL=https://random-subdomain.trycloudflare.com
```

### Konfigurasi Frontend di Laptop Anda:
Buka file `.env.local` (atau `.env`) di folder `frontend/` laptop Anda, lalu perbarui baris berikut:
```env
NEXT_PUBLIC_API_URL=https://random-subdomain.trycloudflare.com
```
Lalu jalankan frontend di terminal laptop Anda:
```bash
npm run dev
```
Buka browser di `http://localhost:3000`. Sekarang frontend di laptop Anda sudah terhubung langsung ke backend berkecepatan tinggi dengan GPU NVIDIA L4 di Google Colab!

---

## 💡 Rekomendasi Model di GPU L4 (24GB VRAM)

* **`qwen2.5:7b`** *(Default)*: Sangat cepat (~4.5GB VRAM), akurasi bahasa Indonesia luar biasa, format sitasi dan JSON sangat presisi.
* **`qwen2.5:14b`**: Penalaran mendalam dan sintesis dokumen kompleks (~9GB VRAM — GPU L4 memiliki 24GB VRAM sehingga sangat leluasa).
* **`llama3.1:8b`**: Alternatif untuk analisis dokumen bahasa Inggris.

