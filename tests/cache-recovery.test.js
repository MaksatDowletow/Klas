'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const recovery = read('klas-cache-recovery.js');
const bootstrap = read('klas-backend-bootstrap.js');
const worker = read('service-worker.js');
const deployment = JSON.parse(read('deployment-files.json'));
const health = JSON.parse(read('health.json'));

test('runtime errors trigger guarded cache recovery', () => {
  assert.match(recovery, /addEventListener\('klas:error'/);
  assert.match(recovery, /COOLDOWN_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/);
  assert.match(recovery, /sessionStorage/);
  assert.match(recovery, /location\.replace\(recoveryUrl\(\)\)/);
});

test('recovery clears only application caches and preserves local data', () => {
  assert.match(recovery, /CACHE_PREFIX\s*=\s*'klas-shell-'/);
  assert.match(recovery, /caches\.delete/);
  assert.doesNotMatch(recovery, /localStorage\.clear|indexedDB\.deleteDatabase/);
});

test('recovery refreshes service workers before reload', () => {
  assert.match(recovery, /getRegistrations\(\)/);
  assert.match(recovery, /registration\.update\(\)/);
  assert.match(recovery, /SKIP_WAITING/);
});

test('recovery runtime is deployed, bootstrapped and cached', () => {
  assert.ok(deployment.files.includes('klas-cache-recovery.js'));
  assert.match(bootstrap, /import\(`\.\/klas-cache-recovery\.js/);
  assert.match(worker, /\.\/klas-cache-recovery\.js/);
  const cacheVersion = worker.match(/CACHE_VERSION\s*=\s*'klas-shell-v([^']+)'/)?.[1];
  assert.ok(cacheVersion, 'Service Worker cache version must be declared');
  assert.equal(health.cacheVersion, cacheVersion);
  assert.ok(health.features.includes('automatic-cache-recovery'));
  assert.ok(health.features.includes('reload-loop-guard'));
});
