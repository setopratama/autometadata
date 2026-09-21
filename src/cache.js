import { getDb } from './db.js';
import { sha256, writeLog } from './utils.js';

export const PROMPT_VERSION = 'v2.1.0';

export function getCacheKey(imageHash, promptVersion = PROMPT_VERSION) {
  return sha256(`${imageHash}:${promptVersion}`);
}

export function getCachedAiResult(imageHash, promptVersion = PROMPT_VERSION) {
  try {
    const db = getDb();
    const key = getCacheKey(imageHash, promptVersion);
    const stmt = db.prepare('SELECT * FROM ai_cache WHERE hash_key = ?');
    const row = stmt.get(key);
    if (!row) return null;

    writeLog('CACHE', 'CACHE_HIT', `SHA-256 match found in SQLite database (100% token cost saved)`, imageHash.slice(0, 12));

    return {
      hashKey: row.hash_key,
      imageHash: row.image_hash,
      promptVersion: row.prompt_version,
      visionRaw: row.vision_raw,
      seo: {
        title: row.seo_title,
        description: row.seo_description,
        keywords: JSON.parse(row.seo_keywords || '[]')
      },
      tokens: {
        visionTokens: row.vision_tokens,
        seoTokens: row.seo_tokens
      },
      estCostUsd: row.est_cost_usd,
      createdAt: row.created_at
    };
  } catch (err) {
    return null;
  }
}

export function saveAiResultToCache(imageHash, visionRaw, seoData, tokens = {}, costUsd = 0.0, promptVersion = PROMPT_VERSION) {
  try {
    const db = getDb();
    const key = getCacheKey(imageHash, promptVersion);
    const keywordsJson = JSON.stringify(seoData.keywords || []);

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO ai_cache 
      (hash_key, image_hash, prompt_version, vision_raw, seo_title, seo_description, seo_keywords, vision_tokens, seo_tokens, est_cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      key,
      imageHash,
      promptVersion,
      visionRaw,
      seoData.title,
      seoData.description,
      keywordsJson,
      tokens.visionTokens || 0,
      tokens.seoTokens || 0,
      costUsd
    );
    return true;
  } catch (err) {
    return false;
  }
}
