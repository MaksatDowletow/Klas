import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const recovery = fs.readFileSync(new URL('../klas-cache-recovery.js', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../klas-backend-bootstrap.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const deployment = JSON.parse(fs.readFileSync(new URL('../deployment-files.json', import.meta.url), 'utf8'));
const health = JSON.parse(fs.readFileSync(new URL('../health.json', import.meta.url), 'utf8'));

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
  assert.equal(health.cacheVersion, '6.6.1');
  assert.ok(health.features.includes('automatic-cache-recovery'));
  assert.ok(health.features.includes('reload-loop-guard'));
});
