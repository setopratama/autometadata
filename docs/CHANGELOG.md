# 📜 Changelog — IMGMETA-SEO

Dokumen ini mencatat seluruh riwayat perubahan, penambahan fitur, dan perbaikan bug pada proyek **imgmeta-seo (autometadata)**.

---

## [1.2.0] — 2026-09-21

### 🐛 Perbaikan Bug Vital (Bug Fixes)
- **Fix (Critical Thumbnail Rename Bug):** Memperbaiki bug hilangnya thumbnail foto di Web UI setelah proses **Injeksi Terpilih + Auto-Rename Title**.
  - *Backend (`src/meta.js`):* Menambahkan migrasi rename otomatis file thumbnail di `photo/.tmp/oldFileName` ke `photo/.tmp/newFileName`.
  - *Server API (`src/server.js`):* Menambahkan properti `thumbnailUrl` dan `fullImageUrl` terbaru yang menyertakan query parameter timestamp cache-busting (`?t=...`).
  - *Frontend (`public/app.js`):* Memperbarui state `file.thumbnail` ke endpoint `/api/thumbnail/...` (sebelumnya keliru ke `/api/photo/...`) dan memicu regenerasi thumbnail otomatis di latar belakang.
- **Fix (Directory Scanner Filter):** Memperbarui `scanDirectory` pada `src/utils.js` agar secara ketat mengabaikan file dan folder tersembunyi berawalan titik (seperti `photo/.tmp`, `.git`, `.cache`) serta membatasi rekursi subfolder yang tidak diperlukan.

---

### 🚀 Fitur Baru (New Features)
- **Title SEO Max 200 Karakter & Pengayaan AI Prompt:**
  - Memperluas batas maksimal panjang judul dari **70 karakter** menjadi **200 karakter** (`TITLE_MAX_LEN = 200`).
  - Memperkaya prompt AI (Vision & DeepSeek 4 Flash) untuk menyusun judul kaya rincian yang mencakup sudut kamera (*camera angle/perspective* seperti *top-down, macro close-up, low-angle*), pencahayaan (*lighting setup*), tekstur mikro permukaan, detail objek fokal, dan konteks komersial (*copy space*).
- **Centralized Activity Logging Engine (`imgmeta.log`):**
  - Membuat utilitas `writeLog` terpusat ber-timestamp ISO 8601 di `src/utils.js`.
  - Mengintegrasikan instrumen pencatatan log real-time pada modul `cache`, `vision`, `seo`, `meta`, `cli`, dan `server`.
  - Menambahkan endpoint REST `GET /api/logs` dan live polling stream pada terminal **Activity Stream // imgmeta.log** Web UI.

---

### ⚙️ Pemeliharaan & Konfigurasi (Maintenance)
- **Default Concurrency THREADS:** Mengubah default kecepatan pemrosesan paralel dari `2X` menjadi `1X` agar antrean berjalan berurutan secara pelan dan aman dari pembatasan kuota API (*Rate Limit / HTTP 429*).
- **Pengujian Biner (Selftest):** Memperbarui unit test `test/selftest.js` untuk menguji judul 200 karakter. Hasil selftest tetap **100% lulus (8 dari 8 pengujian)**.
- **Aturan Pengembangan (AGENTS.md):** Memperbarui panduan agen AI untuk melarang *mikro-push* dan membersihkan tautan path drive lokal menjadi path relatif yang bersih.
