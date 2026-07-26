'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');

const html = read('index.html');
const runtime = read('klas-runtime.js');
const bootstrap = read('klas-backend-bootstrap.js');
const room = read('klas-personal-room.js');
const worker = read('service-worker.js');
const rules = read('firestore-personal-room.rules');
const functions = read('functions/index.js');
const config = read('klas-config.js');

test('personal room is routed, rendered and available offline', () => {
  assert.match(html, /data-page="room"/);
  assert.match(html, /id="page-room"/);
  assert.match(runtime, /'room'/);
  assert.match(bootstrap, /import\(`\.\/klas-personal-room\.js\?v=\$\{release\}`\)/);
  assert.match(room, /doc\(db, 'rooms', uid\)/);
  assert.match(worker, /\.\/klas-personal-room\.css/);
  assert.match(worker, /\.\/klas-personal-room\.js/);
});

test('room writes remain owner-only and privacy values are bounded', () => {
  assert.match(rules, /match \/rooms\/\{uid\}/);
  assert.match(rules, /allow create: if isProvisionedMember\(\) && isSelf\(uid\)/);
  assert.match(rules, /allow update: if isProvisionedMember\(\) && isSelf\(uid\)/);
  assert.match(rules, /\['members', 'friends', 'private'\]/);
  assert.match(rules, /allow delete: if false/);
});

test('OpenAI integration is server-side, authenticated and privacy-conscious', () => {
  assert.match(functions, /defineSecret\('OPENAI_API_KEY'\)/);
  assert.match(functions, /verifyIdToken\(match\[1\], true\)/);
  assert.match(functions, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(functions, /model: 'gpt-5-mini'/);
  assert.match(functions, /store: false/);
  assert.match(functions, /safety_identifier: safetyIdentifier\(user\.uid\)/);
  assert.match(functions, /enforceAiRateLimit\(user\.uid\)/);
  assert.doesNotMatch(config, /sk-proj-|OPENAI_API_KEY\s*:/);
  assert.doesNotMatch(html, /sk-proj-/);
});
