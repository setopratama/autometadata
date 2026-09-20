import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), '.env'));
  } catch (e) {}
}
import { scanDirectory, formatBytes, getFileSha256, logFailure } from './utils.js';
import { readFileMeta, applyEdits } from './meta.js';
import { getCachedAiResult, saveAiResultToCache } from './cache.js';
import { analyzeImageVision } from './vision.js';
import { refineSeoMetadata } from './seo.js';
import { calculateCost } from './cost.js';
import { 
  getDb, 
  saveStagedFile, 
  getStagedFile, 
  getAllStagedFiles, 
  updateStagedFileMetadata, 
  markFileInjected, 
  deleteStagedFile 
} from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const PHOTO_DIR = path.join(ROOT_DIR, 'photo');
const TMP_DIR = path.join(PHOTO_DIR, '.tmp');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.eps': 'application/postscript',
  '.ico': 'image/x-icon'
};

// Helper parse JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

export function startServer(port = 3030) {
  if (!fs.existsSync(PHOTO_DIR)) {
    fs.mkdirSync(PHOTO_DIR, { recursive: true });
  }
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    try {
      fs.writeFileSync(path.join(TMP_DIR, '.gitignore'), "*\n!.gitignore\n");
    } catch (e) {}
  }

  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;
    const method = req.method.toUpperCase();

    // ──────────────────────────────────────────────────────────
    // REST API ENDPOINTS
    // ──────────────────────────────────────────────────────────

    // 1. GET /api/files (Scan physical folder & merge with SQLite Staged data)
    if (method === 'GET' && pathname === '/api/files') {
      try {
        const filePaths = scanDirectory(PHOTO_DIR);
        const filesList = [];

        for (const fp of filePaths) {
          try {
            const metaInfo = readFileMeta(fp);
            const staged = getStagedFile(fp);
            const cached = getCachedAiResult(metaInfo.imageHash);

            let status = 'pending';
            let visionRaw = '';
            let seo = { ...metaInfo.metadata };
            let tokensUsed = 0;
            let costUsd = 0.0;

            if (staged) {
              status = staged.status || 'scanned';
              visionRaw = staged.vision_raw || '';
              seo = {
                title: staged.seo_title || metaInfo.metadata.title,
                description: staged.seo_description || metaInfo.metadata.description,
                keywords: staged.seo_keywords?.length ? staged.seo_keywords : metaInfo.metadata.keywords
              };
              tokensUsed = staged.tokens_used || 0;
              costUsd = staged.cost_usd || 0.0;
            } else if (cached) {
              status = 'scanned';
              visionRaw = cached.visionRaw;
              seo = { ...cached.seo };
              tokensUsed = (cached.tokens?.visionTokens || 0) + (cached.tokens?.seoTokens || 0);
              costUsd = cached.estCostUsd || 0.0;
            } else if (metaInfo.metadata.title && metaInfo.metadata.keywords.length >= 10) {
              status = 'injected';
            }

            filesList.push({
              id: metaInfo.imageHash.slice(0, 12),
              filePath: fp,
              name: metaInfo.fileName,
              format: metaInfo.format,
              size: metaInfo.sizeFormatted,
              sizeBytes: metaInfo.sizeBytes,
              dimensions: metaInfo.dimensions,
              endian: metaInfo.endian,
              hash: metaInfo.imageHash,
              status,
              thumbnail: `/api/thumbnail/${encodeURIComponent(metaInfo.fileName)}`,
              fullImage: `/api/photo/${encodeURIComponent(metaInfo.fileName)}`,
              visionRaw,
              seo,
              tokensUsed,
              costUsd
            });
          } catch (e) {
            // Skip unreadable individual files
          }
        }

        return sendJson(res, 200, { files: filesList });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    // 2. GET /api/thumbnail/:fileName (Serve lightweight cached thumbnail from photo/.tmp/)
    if (method === 'GET' && pathname.startsWith('/api/thumbnail/')) {
      const fileName = decodeURIComponent(pathname.replace('/api/thumbnail/', ''));
      const tmpPath = path.join(TMP_DIR, fileName);
      const originalPath = path.join(PHOTO_DIR, fileName);

      // Check if lightweight thumbnail exists in photo/.tmp/
      if (fs.existsSync(tmpPath)) {
        const ext = path.extname(tmpPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'image/jpeg';
        res.writeHead(200, { 
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400, immutable'
        });
        return fs.createReadStream(tmpPath).pipe(res);
      }

      // Fallback to original image if thumbnail not yet generated
      if (fs.existsSync(originalPath)) {
        const ext = path.extname(originalPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600'
        });
        return fs.createReadStream(originalPath).pipe(res);
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Thumbnail not found');
    }

    // 3. POST /api/thumbnail/:fileName (Save client-generated lightweight thumbnail to photo/.tmp/)
    if (method === 'POST' && pathname.startsWith('/api/thumbnail/')) {
      const fileName = decodeURIComponent(pathname.replace('/api/thumbnail/', ''));
      const tmpPath = path.join(TMP_DIR, fileName);
      const body = await parseBody(req);

      if (body.dataUrl) {
        try {
          const base64Data = body.dataUrl.replace(/^data:image\/\w+;base64,/, '');
          fs.writeFileSync(tmpPath, Buffer.from(base64Data, 'base64'));
          return sendJson(res, 200, { success: true, cached: true });
        } catch (e) {
          return sendJson(res, 500, { error: e.message });
        }
      }

      return sendJson(res, 400, { error: 'dataUrl is required' });
    }

    // 4. GET /api/photo/:fileName (Serve local full image for center preview)
    if (method === 'GET' && pathname.startsWith('/api/photo/')) {
      const fileName = decodeURIComponent(pathname.replace('/api/photo/', ''));
      const filePath = path.join(PHOTO_DIR, fileName);

      if (!filePath.startsWith(PHOTO_DIR) || !fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('File not found');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600'
      });
      return fs.createReadStream(filePath).pipe(res);
    }

    // 3. POST /api/analyze/:fileName (Analyze & Save Staged Result to SQLite)
    if (method === 'POST' && pathname.startsWith('/api/analyze/')) {
      const fileName = decodeURIComponent(pathname.replace('/api/analyze/', ''));
      const filePath = path.join(PHOTO_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        return sendJson(res, 404, { error: 'File does not exist' });
      }

      try {
        const buffer = fs.readFileSync(filePath);
        const imageHash = getFileSha256(filePath);
        const stat = fs.statSync(filePath);
        const format = path.extname(filePath).replace('.', '').toLowerCase();

        // Check cache first
        const cached = getCachedAiResult(imageHash);
        if (cached) {
          // Save to SQLite staged as well
          saveStagedFile({
            file_path: filePath,
            file_name: fileName,
            image_hash: imageHash,
            format,
            file_size: stat.size,
            status: 'scanned',
            vision_raw: cached.visionRaw,
            seo_title: cached.seo.title,
            seo_description: cached.seo.description,
            seo_keywords: cached.seo.keywords,
            tokens_used: (cached.tokens?.visionTokens || 0) + (cached.tokens?.seoTokens || 0),
            cost_usd: 0.0
          });

          return sendJson(res, 200, {
            cached: true,
            visionRaw: cached.visionRaw,
            seo: cached.seo,
            tokens: cached.tokens,
            estCostUsd: 0.0
          });
        }

        // Tahap 1: AI Vision (6 Pilar Visual Inspection)
        let visionResult;
        try {
          visionResult = await analyzeImageVision(buffer);
        } catch (vErr) {
          logFailure('STAGE_VISION', fileName, vErr.message);
          return sendJson(res, 500, { error: vErr.message, stage: 'vision', errorType: 'ERROR_VISION' });
        }

        // Tahap 2: SEO Refinement (DeepSeek 4 Flash)
        let seoResult;
        try {
          seoResult = await refineSeoMetadata(visionResult.visualDescription);
        } catch (sErr) {
          logFailure('STAGE_SEO', fileName, sErr.message);
          return sendJson(res, 500, { 
            error: sErr.message, 
            stage: 'seo', 
            errorType: 'ERROR_SEO',
            visionRaw: visionResult.visualDescription 
          });
        }

        const visionCost = calculateCost(visionResult.modelUsed, visionResult.inputTokens, visionResult.outputTokens);
        const seoCost = calculateCost(seoResult.modelUsed, seoResult.inputTokens, seoResult.outputTokens);
        const totalCost = Number((visionCost + seoCost).toFixed(6));

        const tokens = {
          visionTokens: visionResult.tokensUsed,
          seoTokens: seoResult.tokensUsed
        };

        // 1. Simpan ke Cache AI
        saveAiResultToCache(imageHash, visionResult.visualDescription, seoResult.seo, tokens, totalCost);

        // 2. Simpan ke SQLite Staged Queue
        saveStagedFile({
          file_path: filePath,
          file_name: fileName,
          image_hash: imageHash,
          format,
          file_size: stat.size,
          status: 'scanned',
          vision_raw: visionResult.visualDescription,
          seo_title: seoResult.seo.title,
          seo_description: seoResult.seo.description,
          seo_keywords: seoResult.seo.keywords,
          tokens_used: visionResult.tokensUsed + seoResult.tokensUsed,
          cost_usd: totalCost
        });

        return sendJson(res, 200, {
          cached: false,
          visionRaw: visionResult.visualDescription,
          seo: seoResult.seo,
          tokens,
          estCostUsd: totalCost
        });
      } catch (err) {
        logFailure('SERVER_ANALYZE', fileName, err.message);
        return sendJson(res, 500, { error: err.message, stage: 'general' });
      }
    }

    // 4. POST /api/staged/update (Update user manual edits in SQLite staging)
    if (method === 'POST' && pathname === '/api/staged/update') {
      const body = await parseBody(req);
      const { fileName, title, description, keywords } = body;
      const filePath = path.join(PHOTO_DIR, fileName);

      if (!fileName) {
        return sendJson(res, 400, { error: 'fileName is required' });
      }

      const success = updateStagedFileMetadata(filePath, { title, description, keywords });
      return sendJson(res, 200, { success });
    }

    // 5. POST /api/inject-selected (Batch Binary Injection for Selected Items)
    if (method === 'POST' && pathname === '/api/inject-selected') {
      const body = await parseBody(req);
      const items = Array.isArray(body.items) ? body.items : [];
      const globalRename = Boolean(body.rename);

      if (items.length === 0) {
        return sendJson(res, 400, { error: 'Tidak ada item yang dipilih untuk diinjeksi.' });
      }

      const results = [];
      for (const item of items) {
        const fileName = item.fileName || path.basename(item.filePath || '');
        const filePath = item.filePath || path.join(PHOTO_DIR, fileName);

        if (!fs.existsSync(filePath)) {
          results.push({ fileName, success: false, error: 'File tidak ditemukan' });
          continue;
        }

        try {
          const edits = {
            title: item.title,
            description: item.description,
            keywords: item.keywords || []
          };

          const doRename = item.rename !== undefined ? Boolean(item.rename) : globalRename;
          const applyResult = applyEdits(filePath, edits, { rename: doRename });

          // Perbarui status menjadi 'injected' di SQLite
          markFileInjected(filePath, applyResult.filePath, edits);

          results.push({
            oldFileName: fileName,
            newFileName: path.basename(applyResult.filePath),
            filePath: applyResult.filePath,
            success: true,
            renamed: applyResult.renamed
          });
        } catch (err) {
          logFailure('INJECT_SELECTED', fileName, err.message);
          const isRenameErr = err.message.toLowerCase().includes('rename') || err.message.toLowerCase().includes('ebusy') || err.message.toLowerCase().includes('eperm');
          results.push({ 
            fileName, 
            success: false, 
            error: err.message, 
            stage: isRenameErr ? 'rename' : 'inject',
            errorType: isRenameErr ? 'ERROR_RENAME' : 'ERROR_INJECT'
          });
        }
      }

      return sendJson(res, 200, { results, total: items.length, successCount: results.filter(r => r.success).length });
    }

    // 6. POST /api/apply/:fileName (Single file direct binary injection)
    if (method === 'POST' && pathname.startsWith('/api/apply/')) {
      const fileName = decodeURIComponent(pathname.replace('/api/apply/', ''));
      const filePath = path.join(PHOTO_DIR, fileName);
      const body = await parseBody(req);

      if (!fs.existsSync(filePath)) {
        return sendJson(res, 404, { error: 'File does not exist' });
      }

      try {
        const edits = {
          title: body.title,
          description: body.description,
          keywords: body.keywords || []
        };

        const result = applyEdits(filePath, edits, {
          rename: Boolean(body.rename)
        });

        // Update database history
        markFileInjected(filePath, result.filePath, edits);

        return sendJson(res, 200, result);
      } catch (err) {
        logFailure('SERVER_APPLY', fileName, err.message);
        const isRenameErr = err.message.toLowerCase().includes('rename') || err.message.toLowerCase().includes('ebusy') || err.message.toLowerCase().includes('eperm');
        return sendJson(res, 500, { 
          error: err.message, 
          stage: isRenameErr ? 'rename' : 'inject',
          errorType: isRenameErr ? 'ERROR_RENAME' : 'ERROR_INJECT'
        });
      }
    }

    // 7. GET /api/stats (Database AI & Staged Statistics)
    if (method === 'GET' && pathname === '/api/stats') {
      try {
        const db = getDb();
        const row = db.prepare(`
          SELECT 
            COUNT(*) as total_cached,
            SUM(vision_tokens) as total_vision_tokens,
            SUM(seo_tokens) as total_seo_tokens,
            SUM(est_cost_usd) as total_cost
          FROM ai_cache
        `).get();

        return sendJson(res, 200, {
          totalCached: row.total_cached || 0,
          visionTokens: row.total_vision_tokens || 0,
          seoTokens: row.total_seo_tokens || 0,
          totalCostUsd: Number((row.total_cost || 0).toFixed(4))
        });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    // ──────────────────────────────────────────────────────────
    // STATIC FILE SERVING FROM public/
    // ──────────────────────────────────────────────────────────
    let reqPath = pathname === '/' ? '/index.html' : pathname;
    let filePath = path.join(PUBLIC_DIR, reqPath);

    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (!err && stats.isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      }
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('\x1b[31m%s\x1b[0m', `✗ Port ${port} sedang digunakan oleh proses lain.`);
      console.log('\x1b[33m%s\x1b[0m', `  Tips: Tutup proses sebelumnya atau jalankan dengan port lain, contoh: node index.js web 3031`);
    } else {
      console.error('\x1b[31m%s\x1b[0m', `✗ Server error: ${err.message}`);
    }
  });

  server.listen(port, () => {
    console.log('\x1b[32m%s\x1b[0m', `✓ Server IMGMETA-SEO berjalan di http://localhost:${port}`);
    console.log('\x1b[90m%s\x1b[0m', `  Folder Web: ${PUBLIC_DIR}`);
    console.log('\x1b[90m%s\x1b[0m', `  Folder Foto: ${PHOTO_DIR}`);
    console.log('\x1b[90m%s\x1b[0m', `  Tekan Ctrl+C untuk menghentikan server.\n`);
  });

  return server;
}
