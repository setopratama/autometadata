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

// Structured Failure Logging to imgmeta.log
export function logFailure(operation, file, message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${operation}] ${file} — ${message}\n`;
  try {
    fs.appendFileSync(path.resolve(process.cwd(), 'imgmeta.log'), logLine, 'utf8');
  } catch (e) {
    // Ignore logging failures
  }
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

// Pure Node.js Recursive Glob File Scanner
export function scanDirectory(dirPath, extensions = ['.jpg', '.jpeg', '.png', '.svg', '.eps']) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanDirectory(fullPath, extensions));
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
