#!/usr/bin/env node
'use strict';
/**
 * Post-install hook for `npm install -g @hoangsonw/forge`.
 *
 * 1. Creates the ~/.forge skeleton (idempotent).
 * 2. If FORGE_BINARY_PATH is set, stops there — treat Forge as "run from
 *    source" (useful in monorepos and CI).
 * 3. If FORGE_SKIP_DOWNLOAD is set, stops there too (hermetic installs).
 * 4. Otherwise downloads the platform binary from GitHub Releases, verifies
 *    SHA-256 + signature, and installs to ~/.forge/bin/.
 *
 * We never fail `npm install` — any failure degrades to "use the compiled JS
 * shipped with the package". The CLI shim handles the fallback.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
const os = require('os');
const fs = require('fs');
const path = require('path');

const forgeHome = process.env.FORGE_HOME || path.join(os.homedir(), '.forge');
const dirs = ['bin', 'models', 'memory', 'plugins', 'skills', 'agents', 'mcp', 'mcp/tokens', 'logs', 'global', 'projects'];
try {
  fs.mkdirSync(forgeHome, { recursive: true });
  for (const d of dirs) fs.mkdirSync(path.join(forgeHome, d), { recursive: true });
} catch (err) {
  console.warn('[forge] postinstall: could not create ~/.forge:', String(err));
  return;
}

if (process.env.FORGE_SKIP_DOWNLOAD === '1' || process.env.FORGE_BINARY_PATH) {
  return;
}

// Binary download is attempted lazily by the CLI itself on first run. This
// keeps npm install fast and avoids failing in air-gapped environments. See
// src/release/download.ts.
