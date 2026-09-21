// High-level File Metadata Operations Wrapper

import fs from 'node:fs';
import path from 'node:path';
import { parseJpeg, injectJpegMetadata } from './jpeg.js';
import { parsePng, injectPngMetadata } from './png.js';
import { parseSvg, injectSvgMetadata } from './svg.js';
import { parseEps, injectEpsMetadata } from './eps.js';
import { sha256, getFileSha256, formatBytes, logFailure, sanitizeFilename, writeLog } from './utils.js';

export function getFileFormat(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.jpg', '.jpeg'].includes(ext)) return 'jpg';
  if (ext === '.png') return 'png';
  if (ext === '.svg') return 'svg';
  if (ext === '.eps') return 'eps';
  return 'unknown';
}

export function readFileMeta(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const stats = fs.statSync(filePath);
    const format = getFileFormat(filePath);
    const imageHash = sha256(buffer);

    let parsed = null;
    if (format === 'jpg') {
      parsed = parseJpeg(buffer);
    } else if (format === 'png') {
      parsed = parsePng(buffer);
    } else if (format === 'svg') {
      parsed = parseSvg(buffer);
    } else if (format === 'eps') {
      parsed = parseEps(buffer);
    } else {
      throw new Error(`Unsupported file format: ${path.extname(filePath)}`);
    }

    return {
      filePath,
      fileName: path.basename(filePath),
      format,
      sizeBytes: stats.size,
      sizeFormatted: formatBytes(stats.size),
      dimensions: parsed.dimensions || `${parsed.width || '?'} x ${parsed.height || '?'}`,
      endian: parsed.endian || 'II',
      imageHash,
      metadata: parsed.metadata || {
        title: '',
        description: '',
        keywords: [],
        author: ''
      }
    };
  } catch (err) {
    logFailure('READ_META', filePath, err.message);
    throw err;
  }
}

export function applyEdits(filePath, edits = {}, options = {}) {
  const createBackup = typeof options === 'boolean' ? options : Boolean(options.createBackup);
  const shouldRename = typeof options === 'object' ? Boolean(options.rename) : false;

  try {
    const buffer = fs.readFileSync(filePath);
    const format = getFileFormat(filePath);
    let outputBuffer = null;

    writeLog('INJECT', 'META', `Serializing 3-layer sync (IPTC 8BIM UTF-8 + EXIF IFD0/XP + XMP Dublin Core) for ${format.toUpperCase()}`, filePath);

    if (format === 'jpg') {
      outputBuffer = injectJpegMetadata(buffer, edits);
    } else if (format === 'png') {
      outputBuffer = injectPngMetadata(buffer, edits);
    } else if (format === 'svg') {
      outputBuffer = injectSvgMetadata(buffer, edits);
    } else if (format === 'eps') {
      outputBuffer = injectEpsMetadata(buffer, edits);
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }

    // Optional backup if explicitly requested
    if (createBackup) {
      fs.writeFileSync(`${filePath}.bak`, buffer);
    }

    // Write updated binary to file
    fs.writeFileSync(filePath, outputBuffer);
    writeLog('SUCCESS', 'META', `Binary metadata successfully injected into file`, filePath);

    let finalFilePath = filePath;
    let renamed = false;

    // Optional: Auto-Rename file according to Title
    if (shouldRename && edits.title) {
      const dirPath = path.dirname(filePath);
      const ext = path.extname(filePath);
      const newFileName = sanitizeFilename(edits.title, ext, dirPath);
      const newFilePath = path.join(dirPath, newFileName);

      if (newFilePath.toLowerCase() !== filePath.toLowerCase()) {
        const oldFileName = path.basename(filePath);
        fs.renameSync(filePath, newFilePath);
        finalFilePath = newFilePath;
        renamed = true;
        writeLog('RENAME', 'META', `Renamed file based on Title -> "${newFileName}"`, finalFilePath);

        // Migrasi file thumbnail di .tmp jika ada
        try {
          const tmpDir = path.join(dirPath, '.tmp');
          const oldTmpPath = path.join(tmpDir, oldFileName);
          const newTmpPath = path.join(tmpDir, newFileName);
          if (fs.existsSync(oldTmpPath)) {
            fs.renameSync(oldTmpPath, newTmpPath);
          }
        } catch (e) {
          // Ignore non-blocking thumbnail rename errors
        }
      }
    }

    return {
      success: true,
      filePath: finalFilePath,
      originalPath: filePath,
      fileName: path.basename(finalFilePath),
      renamed,
      newHash: sha256(outputBuffer)
    };
  } catch (err) {
    logFailure('APPLY_EDITS', filePath, err.message);
    throw err;
  }
}
