'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const testsDir = path.join(root, 'tests');
const excluded = new Set(['firestore-rules.test.mjs']);
const files = fs.readdirSync(testsDir)
  .filter(name => /\.test\.(?:js|mjs)$/.test(name) && !excluded.has(name))
  .sort()
  .map(name => path.join('tests', name));

if (!files.length) {
  console.error('Unit test faýllary tapylmady.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root,
  stdio: 'inherit'
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
