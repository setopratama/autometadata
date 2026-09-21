import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = process.env.DB_PATH || path.resolve(process.cwd(), 'imgmeta.db');

let dbInstance = null;

export function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    initSchema(dbInstance);
  }
  return dbInstance;
}

function initSchema(db) {
  // Aktifkan WAL mode dan busy timeout untuk performa konkurensi tinggi
  try {
    db.exec(`PRAGMA journal_mode = WAL;`);
    db.exec(`PRAGMA busy_timeout = 5000;`);
  } catch (e) {}

  // 1. Tabel Cache AI
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_cache (
      hash_key TEXT PRIMARY KEY,
      image_hash TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      vision_raw TEXT NOT NULL,
      seo_title TEXT NOT NULL,
      seo_description TEXT NOT NULL,
      seo_keywords TEXT NOT NULL,
      vision_tokens INTEGER DEFAULT 0,
      seo_tokens INTEGER DEFAULT 0,
      est_cost_usd REAL DEFAULT 0.0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 2. Tabel Staged Metadata & Riwayat Scan/Injeksi
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_history (
      file_path TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      image_hash TEXT NOT NULL,
      format TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      status TEXT NOT NULL,
      vision_raw TEXT,
      seo_title TEXT,
      seo_description TEXT,
      seo_keywords TEXT,
      tokens_used INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0.0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 3. Tabel Metrik & Statistik Global
  db.exec(`
    CREATE TABLE IF NOT EXISTS cost_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0.0,
      cache_hit INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 4. Bersihkan entri sampah (.tmp / file tersembunyi) dari riwayat SQLite
  try {
    db.exec(`DELETE FROM file_history WHERE file_path LIKE '%/.tmp/%' OR file_name LIKE '.%';`);
  } catch (e) {}
}

// ──────────────────────────────────────────────────────────
// HELPER METHODS UNTUK STAGED METADATA
// ──────────────────────────────────────────────────────────

export function saveStagedFile(data) {
  try {
    const db = getDb();
    const keywordsJson = typeof data.seo_keywords === 'string' 
      ? data.seo_keywords 
      : JSON.stringify(data.seo_keywords || []);

    const stmt = db.prepare(`
      INSERT INTO file_history 
      (file_path, file_name, image_hash, format, file_size, status, vision_raw, seo_title, seo_description, seo_keywords, tokens_used, cost_usd, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(file_path) DO UPDATE SET
        file_name = excluded.file_name,
        image_hash = excluded.image_hash,
        format = excluded.format,
        file_size = excluded.file_size,
        status = excluded.status,
        vision_raw = excluded.vision_raw,
        seo_title = excluded.seo_title,
        seo_description = excluded.seo_description,
        seo_keywords = excluded.seo_keywords,
        tokens_used = excluded.tokens_used,
        cost_usd = excluded.cost_usd,
        updated_at = datetime('now')
    `);

    stmt.run(
      data.file_path,
      data.file_name || path.basename(data.file_path),
      data.image_hash || '',
      data.format || '',
      data.file_size || 0,
      data.status || 'scanned',
      data.vision_raw || '',
      data.seo_title || '',
      data.seo_description || '',
      keywordsJson,
      data.tokens_used || 0,
      data.cost_usd || 0.0
    );
    return true;
  } catch (err) {
    return false;
  }
}

export function getStagedFile(filePath) {
  try {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM file_history WHERE file_path = ?');
    const row = stmt.get(filePath);
    if (!row) return null;
    return {
      ...row,
      seo_keywords: JSON.parse(row.seo_keywords || '[]')
    };
  } catch (err) {
    return null;
  }
}

export function getAllStagedFiles() {
  try {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM file_history ORDER BY updated_at DESC');
    const rows = stmt.all();
    return rows.map(r => ({
      ...r,
      seo_keywords: JSON.parse(r.seo_keywords || '[]')
    }));
  } catch (err) {
    return [];
  }
}

export function updateStagedFileMetadata(filePath, metadata) {
  try {
    const db = getDb();
    const keywordsJson = typeof metadata.keywords === 'string' 
      ? metadata.keywords 
      : JSON.stringify(metadata.keywords || []);

    const stmt = db.prepare(`
      UPDATE file_history
      SET seo_title = ?, seo_description = ?, seo_keywords = ?, updated_at = datetime('now')
      WHERE file_path = ?
    `);
    stmt.run(metadata.title || '', metadata.description || '', keywordsJson, filePath);
    return true;
  } catch (err) {
    return false;
  }
}

export function markFileInjected(oldFilePath, newFilePath, metadata) {
  try {
    const db = getDb();
    const keywordsJson = typeof metadata.keywords === 'string' 
      ? metadata.keywords 
      : JSON.stringify(metadata.keywords || []);

    const stmt = db.prepare(`
      UPDATE file_history
      SET file_path = ?, file_name = ?, status = 'injected', seo_title = ?, seo_description = ?, seo_keywords = ?, updated_at = datetime('now')
      WHERE file_path = ?
    `);
    stmt.run(newFilePath, path.basename(newFilePath), metadata.title || '', metadata.description || '', keywordsJson, oldFilePath);
    return true;
  } catch (err) {
    return false;
  }
}

export function deleteStagedFile(filePath) {
  try {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM file_history WHERE file_path = ?');
    stmt.run(filePath);
    return true;
  } catch (err) {
    return false;
  }
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
