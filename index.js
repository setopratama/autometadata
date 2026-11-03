#!/usr/bin/env bun
import path from 'node:path';

// Load .env otomatis bila runtime menyediakan process.loadEnvFile.
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), '.env'));
  } catch (e) {}
}

import { runCli } from './src/cli.js';

runCli(process.argv.slice(2)).catch((err) => {
  console.error('\x1b[31m%s\x1b[0m', `Fatal Error: ${err.message}`);
  process.exit(1);
});
