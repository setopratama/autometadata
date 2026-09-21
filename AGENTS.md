# imgmeta-seo — Panduan Kerja Agen AI & Kontributor

> Panduan standar dan aturan pengembangan codebase **imgmeta-seo** (CLI & Web UI pemroses metadata foto microstock zero-dependency).

---

## 📌 Ringkasan Proyek

CLI Node.js & Web UI tanpa dependensi eksternal untuk memproses metadata foto microstock secara otomatis:

- **Alur Kerja Tunggal:** Scan folder foto $\rightarrow$ Kirim ke AI Vision (hemat token) $\rightarrow$ DeepSeek 4 Flash olah hasil analisa menjadi SEO siap stock $\rightarrow$ Injeksi ke metadata biner file foto.
- **Output Injeksi:** Title, description, dan tags matang siap bersaing di *Adobe Stock / Shutterstock / Freepik* — 3 lapisan sinkron (**IPTC IIM + EXIF IFD0 + Adobe XMP Dublin Core**) langsung ke biner file, tanpa dependensi tool eksternal seperti `exiftool` atau `sharp`.
- **Runtime:** Node.js $\ge$ 22, `"type": "module"` (ESM murni, memanfaatkan `node:sqlite` bawaan).
- **Format Didukung:** JPEG (`.jpg`/`.jpeg`), PNG (`.png`), SVG (`.svg`), EPS (`.eps`).
- **Folder Kerja Foto:** `photo/` (root project).
- **Bahasa Dokumentasi & Komentar:** Bahasa Indonesia.

> [!IMPORTANT]
> **Aturan Utama (Zero Dependency):**
> **JANGAN** menambah dependensi runtime eksternal untuk parser/serializer biner. Semua parser (JPEG, PNG, TIFF/EXIF, IPTC IIM, XMP, SVG, EPS, CRC32) ditulis manual murni menggunakan Node.js standard library (`node:fs`, `node:buffer`, `node:crypto`, `node:sqlite`, dll.).

> [!WARNING]
> **Aturan Git:**
> 1. **JANGAN** melakukan `git add`, `git commit`, maupun `git push` tanpa izin atau instruksi langsung dari owner.
> 2. **JANGAN melakukan push sedikit-sedikit (mikro-push):** Kumpulkan seluruh perubahan kode dalam satu fitur/tugas yang utuh dan teruji terlebih dahulu. Eksekusi `git commit`/`push` HANYA dilakukan jika diminta secara eksplisit oleh owner.

---

## 🎯 Ruang Lingkup (Scope)

Tool ini **HANYA** melakukan satu alur pekerjaan:
$$\text{Scan Foto} \longrightarrow \text{AI Vision (Downscale)} \longrightarrow \text{DeepSeek 4 Flash (SEO)} \longrightarrow \text{Tulis Metadata Biner}$$

### ❌ Di Luar Scope (TOLAK):
1. Tracing raster ke vektor.
2. Konversi format gambar (misal PNG $\rightarrow$ JPEG).
3. Rename file batch.
4. Scoring komersial / commercial art director / 10 Commercial Directions.
5. Export ke format lain.

> Jika ada permintaan menambahkan fitur di luar scope di atas, **tolak dan konfirmasi terlebih dahulu kepada owner** sebelum implementasi.

---

## ⚡ Perintah Penting

```bash
# Pipeline utama: scan folder photo/ -> AI Vision -> SEO -> tulis metadata
npm start

# Jalankan Web UI di http://localhost:3030
npm run web

# Pengujian internal round-trip (EXIF, IPTC, XMP, PNG, SVG, EPS)
npm run selftest

# Bantuan & daftar opsi CLI
node index.js --help

# Scan & tampilkan metadata hasil AI (dry-run, tanpa menulis ke file)
node index.js scan "photo/*.*"

# Scan + tulis langsung title/description/tags ke metadata biner
node index.js scan "photo/*.*" --apply

# Baca metadata yang sudah ada di file
node index.js read "photo/*.*"
```

---

## 🏗️ Arsitektur & Struktur Direktori

```text
index.js            # Entry point CLI (jalankan run(process.argv.slice(2)))
imgmeta.db          # Database SQLite lokal (cache AI, riwayat, konfigurasi)
photo/              # Folder kerja: tempat foto yang akan diproses
docs/               # Dokumentasi teknis & arsitektur

src/
  cli.js            # Parsing argumen + subperintah: scan / read / web / db / selftest
  server.js         # HTTP server murni Node.js (REST API & static files untuk Web UI)
  db.js             # SQLite bawaan Node.js (node:sqlite) — cache AI & riwayat

  # ── PIPELINE AI (2 TAHAP) ──
  vision.js         # [TAHAP 1] Kirim gambar ke AI Vision (downscale + cache SHA-256 + cost tracking)
  seo.js            # [TAHAP 2] Kirim hasil analisa ke DeepSeek 4 Flash -> title/description/tags matang
  cache.js          # Cache SHA-256 (imageHash + promptVersion) -> hindari panggilan AI berulang
  cost.js           # Pra-estimasi & pelacakan token/biaya per batch

  # ── ENGINE METADATA BINER (ZERO-DEPENDENCY) ──
  jpeg.js           # Parser JPEG: APP1 Exif, APP13 Photoshop, XMP, SOF
  png.js            # Parser & serializer chunk PNG: eXIf, tEXt/zTXt/iTXt, IHDR, CRC32 manual
  exif.js           # Parser & serializer TIFF/EXIF: IFD0, ExifIFD, GPS IFD, IFD1 + thumbnail
  iptc.js           # Parser & serializer IPTC IIM di APP13 "Photoshop 3.0"
  xmp.js            # Parser & serializer Adobe XMP Dublin Core
  svg.js            # Parser metadata SVG zero-dependency
  eps.js            # Parser metadata EPS zero-dependency
  meta.js           # Lapisan tinggi abstraksi file: readFileMeta, applyEdits, editFile
  utils.js          # Utilitas: warna ANSI, logger, logFailure, sanitasi Windows, glob

public/             # Aset Web UI (Frontend): index.html, style.css, app.js
test/
  selftest.js       # Unit test round-trip biner; dipanggil lewat "npm run selftest"
```

### Alur Panggilan Pipeline:
$$\text{cli.js} \longrightarrow \text{vision.js} \longrightarrow \text{seo.js} \longrightarrow \text{meta.js} \longrightarrow \begin{cases} \text{exif.js} \\ \text{jpeg.js / png.js / svg.js / eps.js} \\ \text{iptc.js} \\ \text{xmp.js} \end{cases} \longrightarrow \text{Injeksi Biner}$$
*(Catatan: Tidak boleh ada siklus import).*

---

## 🤖 Pipeline AI 2-Tahap

1. **Tahap 1 — Vision:**
   Gambar $\rightarrow$ AI Vision (dengan downscale $\le 512\times512$ px + cache) $\rightarrow$ Menghasilkan deskripsi visual mentah (objek utama, suasana, komposisi, warna, konteks).
2. **Tahap 2 — SEO Refinement:**
   Deskripsi visual mentah $\rightarrow$ DeepSeek 4 Flash $\rightarrow$ Menghasilkan metadata siap pakai (*title*, *description*, *tags*).
   *Alasan:* DeepSeek menerima input teks murni, sehingga konsumsi token jauh lebih murah dan efisien dibanding mengirim gambar berulang kali.

---

## 🔒 Invariant Metadata yang HARUS Dijaga

- **Urutan IFD Menaik:** Berdasarkan spesifikasi TIFF 6.0, tag harus terurut menaik (`serializeTiff()` wajib melakukan `entries.sort((a, b) => a.tag - b.tag)`).
- **Preservasi Round-Trip:**
  - Pertahankan endianness asli TIFF (`II` / `MM`) melalui `model.endian`.
  - Pertahankan thumbnail (`IFD1` + tag `0x0201` / `0x0202`).
  - Simpan tag tak dikenal sebagai byte mentah.
  - Tangani terminator ASCII (`\0`) secara otomatis.
- **Lokasi APP1 EXIF:** Header 6 byte `"Exif\0\0"` diikuti struktur buffer TIFF.
- **IPTC (APP13 Photoshop 3.0):**
  - Header 14 byte, resource 8BIM (`ID 0x0404`).
  - Dataset Record 2: `0x05` (Judul), `0x19` (Kata Kunci berulang), `0x78` (Keterangan), `0x50` (Penulis).
  - Charset wajib UTF-8 (Record 1, Dataset `0x5A`, sequence `ESC % G`).
  - Saat edit, resource 8BIM lain (Thumbnail `0x0409`, ResolutionInfo `0x0405`, dll.) **wajib dipertahankan**.
- **Sinkronisasi 3-Lapisan (Wajib Selaras):**
  1. **IPTC IIM** (APP13 8BIM ID `0x0404`)
  2. **EXIF IFD0:** `ImageDescription` (`0x010E`), `XPTitle` (`0x9C9B`), `XPKeywords` (`0x9C9E`), `XPComment` (`0x9C9C`), `XPAuthor` (`0x9C9D`) — format UCS-2 / UTF-16LE.
  3. **Adobe XMP Dublin Core:** `<dc:title>`, `<dc:subject>` (`rdf:Bag`), `<dc:description>`, `<dc:creator>`.
- **Kebijakan Backup:**
  - `scan --apply` secara default **TIDAK** membuat file `.bak`.
  - Cadangan hanya dibuat bila opsi `--no-backup=false` diberikan secara eksplisit.
  - Opsi `--backup` **tidak ada**.
- **Dry-run Default:**
  - Perintah `scan` tanpa flag `--apply` hanya menampilkan preview hasil di konsol dan tidak mengubah biner file sama sekali.

---

## 💡 Aturan AI & Hemat Token (WAJIB)

1. **Downscale Sebelum Kirim ke Vision:**
   Maksimal **$512 \times 512$ px** (idealnya $384 \times 384$ px). Gambar resolusi penuh ($1024 \times 1024$ px atau lebih) memakan 10.000–15.000 token; downscaling memangkasnya menjadi 2.000–5.000 token tanpa mengurangi kualitas pemahaman visual.
2. **Cache SHA-256 Wajib:**
   Sebelum memanggil API AI, hitung hash: `sha256(imageHash + promptVersion)`. Jika entri ada di database SQLite (`imgmeta.db`), gunakan hasil cache untuk menghemat 100% biaya token gambar berulang.
3. **Prompt Minimalis & Terstruktur:**
   Instruksi pendek (<200 token) dengan format output JSON ketat. Jangan menaruh aturan bisnis SEO di dalam prompt Vision.
4. **Batch Ganjil/Genap:**
   Kirim dalam jumlah genap jika API membulatkan token per gambar.
5. **DeepSeek 4 Flash untuk Tahap SEO:**
   Kirim teks deskripsi murni ke DeepSeek 4 Flash untuk menghasilkan SEO microstock.

---

## 🏷️ Aturan SEO Stock Image (WAJIB)

- **Title:**
  - Maksimal **200 karakter**.
  - Menyertakan rincian visual lengkap: objek utama, tekstur mikro, perspektif/sudut kamera (top-down, macro, low-angle), pencahayaan, dan konteks komersial.
  - Hindari istilah teknis kamera/gear (misal: *f/2.8, 50mm, ISO 100*).
  - Tanpa merek dagang, nama seniman, atau nama orang nyata.
- **Description:**
  - 1–2 kalimat efektif.
  - Menjelaskan konteks, kegunaan, dan konsep gambar tanpa mengulang judul secara mentah.
- **Tags / Keywords:**
  - Target **15–25 keywords** (maksimal 49 untuk foto, 25 untuk vektor).
  - **Urutan = Prioritas:** 10 keyword pertama memiliki bobot terbesar pada algoritma pencarian stock.
  - **Keselarasan:** Kata kunci inti pada *Title* wajib ada di dalam 10 keyword pertama.
  - Gunakan satu bahasa konsisten sesuai profil akun kontributor.
- **Validasi Ketat (`validateSeoOutput()`):**
  - Title > 200 karakter $\rightarrow$ potong / tolak.
  - Keyword mengandung merek dagang (*Canon, Porsche, iPad, Apple, Nike*, dll.) $\rightarrow$ hapus otomatis.
  - Jumlah keyword < 10 atau > 49 $\rightarrow$ sesuaikan secara proporsional.
  - *Jangan pernah mempercayai 100% output mentah LLM tanpa validasi.*

---

## 💻 Konvensi Kode

- **ESM Standard:** Gunakan format murni ESM (`import`/`export`) dengan prefix `node:` (contoh: `import fs from "node:fs"`).
- **Bahasa & Komentar:** Gunakan Bahasa Indonesia yang ringkas dan menjelaskan alasan (*"mengapa"*).
- **Pemisahan AI:** Semua interaksi AI wajib melalui `src/vision.js` dan `src/seo.js`. Dilarang memanggil endpoint API AI langsung dari `cli.js` atau `server.js`.
- **Penanganan Error Batch:** Bungkus per-file dalam blok `try/catch`. File yang gagal tidak boleh menggagalkan seluruh batch proses.
- **Logging Kegagalan:** Panggil `utils.logFailure(operation, file, message)` pada blok `catch` untuk mencatat log ke `imgmeta.log` (format: `[tanggal] [operasi] file — pesan`).
- **Output Konsol:** Gunakan `utils.info`, `utils.err`, dan `utils.warn`. Dukung opsi `--no-color` dan environment variable `NO_COLOR`.
- **Binary Parsing:** Gunakan `Buffer.subarray()`, `readUInt16LE/BE`, dan `readUInt32LE/BE` dengan memperhatikan endianness data.

---

## 🚀 Pola Penambahan Fitur

| Kebutuhan | Tempat & Pola Implementasi |
| :--- | :--- |
| **Model AI Vision Baru** | Tambahkan adapter di `src/vision.js` dengan signature seragam `{ analyze(imageBuffer, prompt) -> visualDescription }`. Daftarkan di map `providers`. |
| **Ubah Aturan SEO** | Ubah/tambah konstanta di `src/seo.js` (`TITLE_MAX_LEN`, `KEYWORD_MAX`, `FORBIDDEN_TERMS`), terapkan di `validateSeoOutput()`, dan update selftest. |
| **Field Metadata Baru** | Tambah konstanta di parser terkait (`src/iptc.js` / `src/exif.js`), integrasikan baca/tulis di `src/meta.js`, lalu ekspos ke CLI. |
| **Invalidasi Cache** | Jika prompt atau model berubah, perbarui `promptVersion` agar sistem tidak mengambil cache usang. |
| **Pengujian Baru** | Tambahkan test case round-trip di `test/selftest.js`. |
| **Changelog** | Catat setiap perubahan arsitektural atau fitur di `CHANGELOG.md`. |

---

## 🧪 Pengujian & Verifikasi

1. **Selftest Biner:**
   ```bash
   npm run selftest
   ```
   *Wajib menghasilkan output akhir:* `"Semua pengujian lulus"`.
2. **Pengujian Fitur AI:**
   Uji menggunakan gambar tiruan (dummy buffer) tanpa memanggil API berbayar. Gunakan mock pada `vision.analyze()` dan `seo.refine()` yang mengembalikan JSON statis, lalu pastikan injeksi biner berhasil.
3. **Klaim Hemat Token:**
   Ukur konsumsi token riil sebelum dan sesudah optimasi. Jangan menulis klaim penghematan token di dokumentasi jika belum terverifikasi secara terukur.
4. **Static Review:**
   Bila environment tidak mendukung eksekusi Node, lakukan tinjauan statis mendalam mencakup sintaksis, invariant biner, dan konsistensi skema import/export.

---

## ⚠️ Anti-Patterns & Kesalahan Fatal yang Harus Dihindari

1. ❌ **Mengirim gambar resolusi penuh ke AI Vision** *(selalu downscale $\le 512\times512$)*.
2. ❌ **Memanggil API AI tanpa memeriksa cache SHA-256 database terlebih dahulu**.
3. ❌ **Menaruh aturan SEO Adobe Stock di prompt AI Vision** *(simpan di `seo.js`)*.
4. ❌ **Menghasilkan title > 70 karakter atau membiarkan tag mengandung trademark / nama brand**.
5. ❌ **Menaruh keyword utama di luar 10 posisi teratas**.
6. ❌ **Menulis teks IPTC tanpa deklarasi UTF-8** *(merusak karakter non-latin)*.
7. ❌ **Menghapus seluruh segmen APP13** alih-alih hanya memperbarui resource IPTC 8BIM.
8. ❌ **Mereset `model.endian` ke default `II`** *(file big-endian `MM` akan rusak)*.
9. ❌ **Membuang thumbnail IFD1 saat proses edit metadata**.
10. ❌ **Menulis tag IFD tidak berurutan atau salah menghitung null-terminator string**.
11. ❌ **Menambah dependensi npm eksternal** untuk manipulasi biner gambar.
12. ❌ **Melakukan eksekusi Git (commit/push) sedikit-sedikit (mikro-push)** atau tanpa instruksi eksplisit dari owner.