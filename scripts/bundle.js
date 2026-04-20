#!/usr/bin/env node
/**
 * Create an offline bundle: tarball of dist/, package.json, LICENSE, README,
 * scripts, install/. Used by `forge bundle create` and by enterprise
 * air-gapped deployments.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const outDir = process.argv[2] || path.join(root, 'tmp');
fs.mkdirSync(outDir, { recursive: true });

const out = path.join(outDir, 'forge-bundle.tar.gz');
const include = ['dist', 'bin', 'scripts', 'install', 'package.json', 'README.md', 'LICENSE'];
for (const p of include) {
  if (!fs.existsSync(path.join(root, p))) {
    console.error(`[forge bundle] missing ${p}; run npm run build first`);
    process.exit(1);
  }
}
const res = spawnSync('tar', ['-czf', out, '-C', root, ...include], { stdio: 'inherit' });
if (res.status !== 0) process.exit(res.status ?? 1);
console.log(`Wrote ${out}`);
