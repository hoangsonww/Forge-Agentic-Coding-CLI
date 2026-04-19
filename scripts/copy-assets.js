#!/usr/bin/env node
/**
 * Copy non-TS assets (e.g. UI public/) into dist after tsc. tsc doesn't copy
 * .html / .css / static .js files on its own — without this step the
 * compiled server ends up serving stale public files that were last copied
 * by hand.
 *
 * Directories to mirror:
 *   src/ui/public   → dist/ui/public
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pairs = [
  [path.join(root, 'src', 'ui', 'public'), path.join(root, 'dist', 'ui', 'public')],
];

const copyTree = (src, dst) => {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
};

for (const [src, dst] of pairs) copyTree(src, dst);
