import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ANSI Colors Support & NO_COLOR flag
const noColor = process.argv.includes('--no-color') || Boolean(process.env.NO_COLOR);

export const colors = {
  reset: noColor ? '' : '\x1b[0m',
  bold: noColor ? '' : '\x1b[1m',
  dim: noColor ? '' : '\x1b[2m',
  red: noColor ? '' : '\x1b[31m',
  green: noColor ? '' : '\x1b[32m',
  yellow: noColor ? '' : '\x1b[33m',
  blue: noColor ? '' : '\x1b[34m',
  magenta: noColor ? '' : '\x1b[35m',
  cyan: noColor ? '' : '\x1b[36m',
  white: noColor ? '' : '\x1b[37m',
  gray: noColor ? '' : '\x1b[90m'
};

export const info = (...args) => console.log(colors.cyan + 'ℹ' + colors.reset, ...args);
export const success = (...args) => console.log(colors.green + '✓' + colors.reset, ...args);
export const warn = (...args) => console.log(colors.yellow + '⚠' + colors.reset, ...args);
export const err = (...args) => console.error(colors.red + '✗' + colors.reset, ...args);

// In-memory log buffer (max 200 items) for real-time Web UI Activity Stream
const LOG_BUFFER = [];
const MAX_LOG_BUFFER = 200;

let logIdCounter = 1;

/**
 * Write a structured activity log entry to imgmeta.log, in-memory buffer, and console.
 * @param {string} level - Log level ('INFO'|'SUCCESS'|'WARN'|'ERROR'|'AI_VISION'|'AI_SEO'|'INJECT'|'RENAME'|'CACHE')
 * @param {string} category - Category ('SCAN'|'VISION'|'SEO'|'META'|'CACHE'|'SERVER'|'CLI')
 * @param {string} message - Human readable log message
 * @param {string} [file] - Optional associated file path or file name
 */
export function writeLog(level, category, message, file = '') {
  const timestamp = new Date().toISOString();
  const fileBasename = file ? path.basename(file) : '';
  const filePrefix = fileBasename ? `${fileBasename} — ` : '';
  const logLine = `[${timestamp}] [${level}] [${category}] ${filePrefix}${message}\n`;

  const logEntry = {
    id: logIdCounter++,
    timestamp,
    level,
    category,
    file: fileBasename,
    message,
    line: logLine.trim()
  };

  // 1. In-memory buffer
  LOG_BUFFER.push(logEntry);
  if (LOG_BUFFER.length > MAX_LOG_BUFFER) {
    LOG_BUFFER.shift();
  }

  // 2. Append to imgmeta.log
  try {
    fs.appendFileSync(path.resolve(process.cwd(), 'imgmeta.log'), logLine, 'utf8');
  } catch (e) {
    // Ignore log write errors
  }

  // 3. Optional console output formatted with ANSI colors if running in CLI mode
  if (process.stdout.isTTY || !process.env.SUPPRESS_CONSOLE_LOGS) {
    let color = colors.reset;
    if (level === 'ERROR') color = colors.red;
    else if (level === 'SUCCESS' || level === 'INJECT') color = colors.green;
    else if (level === 'WARN') color = colors.yellow;
    else if (level === 'AI_VISION') color = colors.magenta;
    else if (level === 'AI_SEO') color = colors.blue;
    else if (level === 'CACHE') color = colors.cyan;

    const timeShort = timestamp.split('T')[1].slice(0, 8);
    // Silent console stream to avoid clogging interactive CLI tables unless needed
  }

  return logEntry;
}

/**
 * Retrieve recent log entries for Web UI API.
 * @param {number} limit
 * @returns {Array} List of recent log entries
 */
export function getRecentLogs(limit = 100) {
  return LOG_BUFFER.slice(-limit);
}

// Structured Failure Logging to imgmeta.log
export function logFailure(operation, file, message) {
  writeLog('ERROR', operation, message, file);
}

// Compute SHA-256 of a Buffer or File
export function sha256(data) {
  const hash = crypto.createHash('sha256');
  if (Buffer.isBuffer(data) || typeof data === 'string') {
    hash.update(data);
  } else {
    throw new Error('Data must be Buffer or string');
  }
  return hash.digest('hex');
}

// Compute File SHA-256
export function getFileSha256(filePath) {
  const buffer = fs.readFileSync(filePath);
  return sha256(buffer);
}

// Pure Node.js File Scanner (Ignores hidden folders like .tmp and subdirectories by default)
export function scanDirectory(dirPath, extensions = ['.jpg', '.jpeg', '.png', '.svg', '.eps'], recursive = false) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    // 1. Abaikan file atau folder tersembunyi berawalan titik (misal: .tmp, .git, .cache)
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      // 2. Hanya rekursi jika flag recursive secara eksplisit diset ke true
      if (recursive) {
        results.push(...scanDirectory(fullPath, extensions, recursive));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

// Format bytes into human readable string
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Sanitize title into clean SEO filename (Windows/POSIX compatible)
export function sanitizeFilename(title, ext = '', dirPath = '') {
  if (!title || typeof title !== 'string') return `untitled${ext}`;

  // 1. Lowercase and remove invalid filesystem characters: \ / : * ? " < > | , . ! ' ` # $ % &
  let clean = title
    .toLowerCase()
    .trim()
    .replace(/[\\/:*?"<>|,!.'`#$%&+=^;~()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 2. Max length clamp (up to 90 characters for base name)
  if (clean.length > 90) {
    const lastSpace = clean.slice(0, 90).lastIndexOf(' ');
    clean = (lastSpace > 40 ? clean.slice(0, lastSpace) : clean.slice(0, 90)).trim();
  }

  if (!clean) clean = 'untitled';

  const normalizedExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  let finalName = `${clean}${normalizedExt}`;

  // 3. Collision resolution in target directory if dirPath provided
  if (dirPath && fs.existsSync(dirPath)) {
    let counter = 1;
    let targetPath = path.join(dirPath, finalName);
    while (fs.existsSync(targetPath)) {
      finalName = `${clean} ${counter}${normalizedExt}`;
      targetPath = path.join(dirPath, finalName);
      counter++;
    }
  }

  return finalName;
}
