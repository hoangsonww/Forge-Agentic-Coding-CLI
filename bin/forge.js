#!/usr/bin/env node
/**
 * Forge CLI entry point.
 *
 * This shim locates the compiled CLI and forwards argv.
 * In production (installed via npm), dist/ is shipped.
 * In development, we fall back to ts-node on src/cli/index.ts.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
'use strict';

const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');
const compiled = path.join(projectRoot, 'dist', 'cli', 'index.js');

if (fs.existsSync(compiled)) {
  require(compiled);
} else {
  // Development fallback
  try {
    require('ts-node/register');
    require(path.join(projectRoot, 'src', 'cli', 'index.ts'));
  } catch (err) {
    console.error('[forge] Compiled output not found and ts-node is unavailable.');
    console.error('[forge] Run `npm run build` or install ts-node.');
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  }
}
