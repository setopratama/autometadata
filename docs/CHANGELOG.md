# 📜 Changelog — IMGMETA-SEO

Dokumen ini mencatat seluruh riwayat perubahan, penambahan fitur, dan perbaikan bug pada proyek **imgmeta-seo (autometadata)**.

## [1.3.0] — 2026-09-21

### 🚀 Fitur Baru (New Features)
- **AI Automatic Categorization (26 Kategori Resmi Shutterstock):**
  - Mengintegrasikan identifikasi dan pengategorian otomatis foto ke dalam 1–2 kategori terbaik dari daftar 26 kategori resmi Shutterstock (`Abstract`, `Animals/Wildlife`, `Arts`, `Backgrounds/Textures`, `Beauty/Fashion`, `Buildings/Landmarks`, `Business/Finance`, `Celebrities`, `Education`, `Food and drink`, `Healthcare/Medical`, `Holidays`, `Industrial`, `Interiors`, `Miscellaneous`, `Nature`, `Objects`, `Parks/Outdoor`, `People`, `Religion`, `Science`, `Signs/Symbols`, `Sports/Recreation`, `Technology`, `Transportation`, `Vintage`).
  - *Engine SEO & Schema (`src/seo.js`, `src/db.js`, `src/cache.js`):* Menambahkan prompt DeepSeek 4 Flash untuk memilih 1-2 kategori, validasi kategori resmi (`validateSeoOutput`), *smart fallback category inferencing*, serta migrasi kolom `seo_categories` pada SQLite database (`ai_cache` & `file_history`).
  - *Shutterstock CSV Exporter (`src/csv.js`):* Menghubungkan properti kategori ke **Kolom D (`Categories`)** file CSV ekspor Shutterstock sesuai format RFC 4180.
  - *Web UI Selector (`public/`):* Menambahkan dropdown & chip selector kategori interaktif, tombol *Copy Categories*, serta auto-save manual edit ke SQLite staging.
- **Optimasi Shutterstock Keyword Best Practices & Stemming Deduplication:**
  - *Stemming Engine (`src/seo.js`):* Mengimplementasikan `getWordStem` dan `hasStemCollision` zero-dependency untuk mendeteksi kata dasar, bentuk jamak (*plurals*), dan variasi infleksi (`dog`, `dogs`, `doggy`, `dogged`, `cat`, `cats`, `flower`, `flowers`).
  - *4-Layer Keyword Pyramid:* Memperbarui prompt AI untuk menyusun kata kunci dalam 4 layer berurutan (*Specific Objects, Broader Topics, Concepts/Mood, Relevant Associations*) dengan jumlah tag antara 7 hingga 50.
  - *Description Sentence Enforcement:* Menambahkan validasi otomatis untuk mengubah deskripsi yang terdeteksi sebagai daftar kata kunci (*dot/comma list*) menjadi kalimat deskriptif yang mengalir.

---

## [1.2.1] — 2026-09-21

### 🐛 Perbaikan Bug Vital (Bug Fixes)
- **Fix (JPEG SOS Segment Header Corruption):** Memperbaiki bug biner yang menyebabkan JPEG dianggap corrupt (`Bad SOS length 18, corrupt jpeg`) oleh dekoder ketat seperti GNOME Glycin (`glycin-image-rs`) dan `libjpeg-turbo` setelah metadata diinjeksi.
  - *Parser JPEG (`src/jpeg.js`):* Memperbaiki slicing `sosHeader` di `parseJpeg` agar mengeksklusi 2-byte length field (`offset + 2`), serta standardisasi pembentukan segmen SOS `0xFFDA` menggunakan `makeSegment(0xDA, seg.data)` secara konsisten.
- **Fix (Web UI Thumbnail & Preview Image Stale Cache):** Memperbaiki masalah thumbnail dan preview gambar (`<img id="previewImage">`) yang error/broken di Web UI setelah proses injeksi metadata dan penamaan ulang file.
  - *Server HTTP (`src/server.js`):* Mengubah header `Cache-Control` pada endpoint `/api/photo/` dan `/api/thumbnail/` dari `max-age=86400, immutable` menjadi `no-cache, must-revalidate`, memotong query string (`?t=...`) pada parsing nama file, dan menambahkan parameter *cache-busting* timestamp pada `/api/files`.
  - *Metadata Engine (`src/meta.js`):* Membersihkan cache thumbnail `.tmp` saat rename agar server secara otomatis mengalihkan penyajian ke file photo original terbaru secara instan.
  - *Frontend (`public/app.js` & `public/index.html`):* Menambahkan handler `onerror` auto-retry pada elemen preview gambar utama, thumbnail sidebar, dan fungsi `generateAndCacheThumbnail`.

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
