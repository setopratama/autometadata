// CLI Command Handler for IMGMETA-SEO

import path from 'node:path';
import fs from 'node:fs';
import { scanDirectory, info, success, warn, err, colors, writeLog } from './utils.js';
import { readFileMeta, applyEdits } from './meta.js';
import { getCachedAiResult, saveAiResultToCache } from './cache.js';
import { saveStagedFile, markFileInjected } from './db.js';
import { analyzeImageVision } from './vision.js';
import { refineSeoMetadata } from './seo.js';
import { calculateCost } from './cost.js';
import { startServer } from './server.js';
import { runSelfTests } from '../test/selftest.js';

export async function runCli(argv) {
  const command = argv[0];

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    showHelp();
    return;
  }

  if (command === 'web') {
    const port = parseInt(argv[1], 10) || 3030;
    startServer(port);
    return;
  }

  if (command === 'selftest') {
    await runSelfTests();
    return;
  }

  if (command === 'read') {
    const targetPattern = argv[1] || 'photo';
    await handleRead(targetPattern);
    return;
  }

  if (command === 'scan') {
    const targetPattern = argv[1] || 'photo';
    const apply = argv.includes('--apply');
    const rename = argv.includes('--rename');
    const noBackup = argv.includes('--no-backup=false') ? false : true;
    await handleScan(targetPattern, { apply, rename, noBackup });
    return;
  }

  warn(`Perintah tidak dikenal: "${command}". Jalankan "node index.js --help" untuk bantuan.`);
}

function showHelp() {
  console.log(`
${colors.bold}IMGMETA-SEO — CLI & Web UI Pemroses Metadata Foto Microstock${colors.reset}

${colors.yellow}PENGGUNAAN:${colors.reset}
  node index.js <perintah> [opsi]

${colors.yellow}PERINTAH UTAMA:${colors.reset}
  ${colors.green}scan <path>${colors.reset}         Scan foto & analisa AI Vision + DeepSeek SEO
  ${colors.green}read <path>${colors.reset}         Baca 3 lapisan metadata yang ada di file
  ${colors.green}web [port]${colors.reset}          Jalankan Web UI di localhost (default: 3030)
  ${colors.green}selftest${colors.reset}            Jalankan internal unit test round-trip biner

${colors.yellow}OPSI SCAN:${colors.reset}
  ${colors.cyan}--apply${colors.reset}             Injeksi langsung title/desc/tags ke metadata biner file
  ${colors.cyan}--rename${colors.reset}            Otomatis ubah nama file sesuai dengan SEO Title
  ${colors.cyan}--no-color${colors.reset}          Matikan format warna ANSI pada konsol

${colors.yellow}CONTOH:${colors.reset}
  node index.js scan "photo/*.*"
  node index.js scan "photo/*.*" --apply
  node index.js scan "photo/*.*" --apply --rename
  node index.js read "photo/*.*"
  node index.js web 3030
  npm run selftest
`);
}

async function handleRead(targetPattern) {
  const targetDir = targetPattern.includes('*') ? path.dirname(targetPattern) : targetPattern;
  const files = scanDirectory(path.resolve(process.cwd(), targetDir));

  if (files.length === 0) {
    info(`Tidak ada file gambar yang ditemukan di ${targetPattern}`);
    return;
  }

  writeLog('INFO', 'CLI', `Reading metadata for ${files.length} files in ${targetDir}`);
  info(`Membaca metadata dari ${files.length} file:\n`);

  for (const fp of files) {
    try {
      const meta = readFileMeta(fp);
      console.log(`${colors.bold}${meta.fileName}${colors.reset} [${meta.format.toUpperCase()} | ${meta.dimensions} | ${meta.sizeFormatted}]`);
      console.log(`  ${colors.cyan}Title:${colors.reset}       ${meta.metadata.title || colors.dim + '(kosong)' + colors.reset}`);
      console.log(`  ${colors.cyan}Description:${colors.reset} ${meta.metadata.description || colors.dim + '(kosong)' + colors.reset}`);
      console.log(`  ${colors.cyan}Keywords (${meta.metadata.keywords.length}):${colors.reset} ${meta.metadata.keywords.slice(0, 10).join(', ')}${meta.metadata.keywords.length > 10 ? ' ...' : ''}`);
      console.log('');
    } catch (e) {
      err(`Gagal membaca ${path.basename(fp)}: ${e.message}`);
    }
  }
}

async function handleScan(targetPattern, options = {}) {
  const targetDir = targetPattern.includes('*') ? path.dirname(targetPattern) : targetPattern;
  const files = scanDirectory(path.resolve(process.cwd(), targetDir));

  if (files.length === 0) {
    info(`Tidak ada file foto di folder "${targetDir}". Letakkan foto di folder photo/ terlebih dahulu.`);
    return;
  }

  writeLog('INFO', 'CLI', `Starting CLI scan process for ${files.length} file(s) [Apply: ${options.apply}, Rename: ${options.rename}]`);
  info(`Memulai proses scan untuk ${files.length} file...`);
  if (!options.apply) {
    info(`[DRY-RUN MODE] Metadata hanya ditampilkan. Tambahkan flag ${colors.bold}--apply${colors.reset} untuk menulis biner.\n`);
  }

  let totalCost = 0;
  let totalVisionTokens = 0;
  let totalSeoTokens = 0;

  for (let i = 0; i < files.length; i++) {
    const fp = files[i];
    const fileName = path.basename(fp);

    console.log(`\n[${i + 1}/${files.length}] ${colors.bold}${fileName}${colors.reset}`);
    writeLog('INFO', 'CLI', `Processing file [${i + 1}/${files.length}]`, fileName);

    try {
      const meta = readFileMeta(fp);
      const cached = getCachedAiResult(meta.imageHash);

      let seoData;
      let visionDesc;

      if (cached) {
        success(`Cache hit (SHA-256): ${meta.imageHash.slice(0, 16)}...`);
        seoData = cached.seo;
        visionDesc = cached.visionRaw;
      } else {
        info(`Tahap 1: Mengirim ke AI Vision...`);
        const buffer = fs.readFileSync(fp);
        const vResult = await analyzeImageVision(buffer);
        visionDesc = vResult.visualDescription;

        info(`Tahap 2: Mengolah SEO dengan DeepSeek 4 Flash...`);
        const sResult = await refineSeoMetadata(visionDesc);
        seoData = sResult.seo;

        const cost = calculateCost(vResult.modelUsed, vResult.inputTokens, vResult.outputTokens) +
                     calculateCost(sResult.modelUsed, sResult.inputTokens, sResult.outputTokens);
        totalCost += cost;
        totalVisionTokens += vResult.tokensUsed;
        totalSeoTokens += sResult.tokensUsed;

        saveAiResultToCache(meta.imageHash, visionDesc, seoData, {
          visionTokens: vResult.tokensUsed,
          seoTokens: sResult.tokensUsed
        }, cost);
      }

      console.log(`  ${colors.green}Title:${colors.reset}       ${seoData.title} (${seoData.title.length}/70 char)`);
      console.log(`  ${colors.green}Description:${colors.reset} ${seoData.description}`);
      console.log(`  ${colors.green}Tags (${seoData.keywords.length}):${colors.reset}  ${seoData.keywords.join(', ')}`);

      // Simpan ke SQLite Staged Queue
      saveStagedFile({
        file_path: fp,
        file_name: fileName,
        image_hash: meta.imageHash,
        format: meta.format,
        file_size: meta.sizeBytes || fs.statSync(fp).size,
        status: options.apply ? 'injected' : 'scanned',
        vision_raw: visionDesc,
        seo_title: seoData.title,
        seo_description: seoData.description,
        seo_keywords: seoData.keywords,
        tokens_used: cached ? (cached.tokens?.visionTokens || 0) + (cached.tokens?.seoTokens || 0) : totalVisionTokens + totalSeoTokens,
        cost_usd: cached ? (cached.estCostUsd || 0.0) : totalCost
      });

      if (options.apply) {
        info(`Menulis 3-lapisan metadata biner (IPTC + EXIF IFD0 + XMP)...`);
        const result = applyEdits(fp, seoData, {
          createBackup: !options.noBackup,
          rename: options.rename
        });

        // Update database record status to injected
        markFileInjected(fp, result.filePath, seoData);

        if (result.renamed) {
          success(`Injeksi metadata berhasil & file di-rename menjadi: ${colors.bold}${result.fileName}${colors.reset}`);
        } else {
          success(`Injeksi metadata berhasil.`);
        }
      }
    } catch (e) {
      err(`Error memproses ${fileName}: ${e.message}`);
    }
  }

  writeLog('SUCCESS', 'CLI', `CLI scan process finished for ${files.length} file(s). Total AI cost: $${totalCost.toFixed(4)}`);
  console.log(`\n${colors.bold}── Ringkasan Batch ──${colors.reset}`);
  console.log(`Total File: ${files.length}`);
  console.log(`Total Token AI: ${(totalVisionTokens + totalSeoTokens).toLocaleString()}`);
  console.log(`Estimasi Biaya API: $${totalCost.toFixed(4)}`);
}
