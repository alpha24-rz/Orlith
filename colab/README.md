# 🚀 Panduan Eksperimen: Menjalankan Backend Orlith di Google Colab (NVIDIA L4 GPU)

Panduan ini berisi langkah-langkah praktis untuk menjalankan backend **Orlith AI (DocuMind)** beserta model AI lokal (**Ollama + Sentence-Transformers + EasyOCR**) pada Google Colab dengan GPU **NVIDIA L4 (24GB VRAM)**.

---

## 📋 Keunggulan Setup Ini
* **100% Bebas Biaya Token API**: Menggunakan LLM open-source lokal (misal: `qwen2.5:7b` atau `qwen2.5:14b`) yang berjalan langsung di GPU L4.
* **Performa RAG Cepat**: Embedding (`BAAI/bge-m3`) dan Reranker (`BAAI/bge-reranker-base`) menggunakan akselerasi CUDA.
* **Data Aman di Google Drive**: Database SQLite, ChromaDB, dan dokumen hasil upload disimpan di Google Drive Anda sehingga tidak hilang saat runtime terputus.
* **Akses Publik Gratis**: Menggunakan Cloudflare Tunnel (`cloudflared`) untuk mendapatkan URL HTTPS publik aman tanpa perlu port forwarding atau bayar ngrok.

---

## 🛠️ Langkah-Langkah Menjalankan

### Langkah 1: Buka Google Colab
1. Buka browser dan kunjungi [Google Colab](https://colab.research.google.com/).
2. Pilih tab **Upload**, lalu upload file [`Orlith_Colab_L4_Server.ipynb`](./Orlith_Colab_L4_Server.ipynb).

### Langkah 2: Aktifkan GPU NVIDIA L4
1. Di menu atas Colab, klik **Runtime** -> **Change runtime type**.
2. Pada bagian **Hardware accelerator**, pilih **GPU**.
3. Pada bagian **GPU type**, pilih **L4** (tersedia pada Colab Pro / compute units).
4. Klik **Save**.

### Langkah 3: Jalankan Cell Secara Berurutan
Jalankan setiap cell dari atas ke bawah:
1. **Langkah 1 (Cek GPU)**: Memastikan `nvidia-smi` mendeteksi GPU L4 dengan VRAM ~24GB.
2. **Langkah 2 (Mount Google Drive)**: Memberikan izin Google Drive agar folder `/content/drive/MyDrive/orlith_data` dibuat otomatis.
3. **Langkah 3 (Setup Source Code)**: Mengambil source code backend ke dalam Colab.
4. **Langkah 4 (Install Dependencies)**: Menginstall paket Python dan mendownload Cloudflare Tunnel.
5. **Langkah 5 (Jalankan Ollama)**: Menjalankan engine Ollama di background dan mendownload model pilihan Anda (`qwen2.5:7b`).
6. **Langkah 6 (Buat .env)**: Otomatis mengonfigurasi backend agar terhubung ke Ollama dan Google Drive.
7. **Langkah 7 (Jalankan Server & Tunnel)**: Membuka tunnel Cloudflare dan menjalankan server FastAPI Uvicorn.

---

## 🔗 Menghubungkan Frontend ke Backend Colab

Saat cell terakhir dijalankan, Anda akan melihat output seperti ini:

```text
=================================================================
🎉 PUBLIC BACKEND URL ANDA: https://random-subdomain.trycloudflare.com
📑 Interactive API Docs   : https://random-subdomain.trycloudflare.com/docs
❤️ Health Check Endpoint  : https://random-subdomain.trycloudflare.com/health
=================================================================
```

### Jika Frontend berjalan di Laptop (Localhost):
Buka file `.env.local` pada folder `frontend/` di laptop Anda, lalu ubah URL-nya:
```env
NEXT_PUBLIC_API_URL=https://random-subdomain.trycloudflare.com
```
Lalu restart frontend (`npm run dev`). Sekarang frontend di laptop Anda sudah berkomunikasi dengan server backend + GPU L4 di Google Colab!

---

## 💡 Tips & Trik Eksperimen di Colab

1. **Model Rekomendasi di L4 (24GB VRAM)**:
   * **`qwen2.5:7b`** *(Default)*: Sangat responsif, pemahaman konteks Bahasa Indonesia sangat baik, format JSON rapi.
   * **`qwen2.5:14b`**: Akurasi RAG sangat tinggi dan reasoning lebih mendalam. VRAM L4 sanggup menjalankannya dengan lancar.
   * **`llama3.1:8b`**: Alternatif populer untuk bahasa Inggris.
2. **Mencegah Colab Putus (Inactivity Timeout)**:
   * Biarkan tab browser Colab tetap terbuka di background selama eksperimen berlangsung.
   * Karena database disimpan di Google Drive (`orlith_data`), meskipun runtime terputus, Anda tidak perlu mengulang proses upload dokumen atau embedding. Cukup jalankan ulang notebook, data lama tetap utuh!
