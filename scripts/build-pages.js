'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '_site');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const exists = file => fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).size > 0;
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function fail(message) {
  console.error(`Release audit failed: ${message}`);
  process.exitCode = 1;
}

const health = json('health.json');
const pkg = json('package.json');
const deployment = json('deployment-files.json');
const config = read('klas-config.js');
const runtime = read('klas-runtime.js');
const worker = read('service-worker.js');
const marker = read('DEPLOYMENT_VERSION');

if (!/^\d+\.\d+\.\d+$/.test(health.version || '')) fail('health.version must be SemVer');
if (!/^\d+\.\d+\.\d+$/.test(health.cacheVersion || '')) fail('health.cacheVersion must be SemVer');
if (pkg.version !== health.version) fail(`package.json ${pkg.version} != health ${health.version}`);
if (!new RegExp(`version: '${escapeRegex(health.version)}'`).test(config)) fail('klas-config.js version is not aligned');
if (!new RegExp(`APP_VERSION = '${escapeRegex(health.version)}'`).test(runtime)) fail('klas-runtime.js version is not aligned');
if (!new RegExp(`klas-shell-v${escapeRegex(health.cacheVersion)}`).test(worker)) fail('service-worker cache version is not aligned');
if (!marker.includes(`Klas v${health.version}`)) fail('DEPLOYMENT_VERSION is not aligned');

const files = [...new Set(deployment.files || [])];
if (!files.length) fail('deployment-files.json is empty');
for (const file of files) if (!exists(file)) fail(`missing deployment file: ${file}`);

const shellPaths = [...worker.matchAll(/'\.\/([^']+)'/g)]
  .map(match => match[1])
  .filter(file => file && file !== '.');
const shellSet = new Set(shellPaths);
for (const file of shellPaths) {
  if (!exists(file)) fail(`service worker references missing file: ${file}`);
  if (!files.includes(file)) fail(`service worker asset is absent from deployment-files.json: ${file}`);
}

const offlineRuntime = files.filter(file => /^klas-.*\.(?:js|mjs)$/.test(file));
for (const file of offlineRuntime) {
  if (!shellSet.has(file)) fail(`deployed runtime is absent from offline app shell: ${file}`);
}

const testScript = String(pkg.scripts?.test || '');
if (!testScript.includes('*.test.js') || !testScript.includes('*.test.mjs')) {
  fail('npm test must discover both .js and .mjs test suites');
}

if (process.exitCode) process.exit(process.exitCode);

fs.rmSync(output, { recursive: true, force: true });
for (const file of files) {
  const source = path.join(root, file);
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
fs.writeFileSync(path.join(output, '.nojekyll'), '');
fs.writeFileSync(path.join(output, 'release.json'), `${JSON.stringify({
  app: health.app,
  version: health.version,
  cacheVersion: health.cacheVersion,
  commit: process.env.GITHUB_SHA || 'local',
  deployedAt: new Date().toISOString(),
  features: health.features
}, null, 2)}\n`);

console.log(`Release audit passed: Klas ${health.version}, cache ${health.cacheVersion}, ${files.length} files.`);
