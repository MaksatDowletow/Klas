'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('group communication runtime is deployed and bootstrapped', () => {
  const bootstrap = read('klas-backend-bootstrap.js');
  const deployment = JSON.parse(read('deployment-files.json'));
  const worker = read('service-worker.js');
  assert.match(bootstrap, /klas-group-communication\.js/);
  assert.ok(deployment.files.includes('klas-group-communication.js'));
  assert.match(worker, /klas-group-communication\.js/);
});

test('group chat requires Firestore group membership', () => {
  const runtime = read('klas-group-communication.js');
  assert.match(runtime, /memberIds \|\| \[\]\)\.includes\(runtime\.user\.uid\)/);
  assert.match(runtime, /groupConversations/);
  assert.match(runtime, /maxlength="4000"/);
});

test('group video uses targeted signaling and bounded active room size', () => {
  const runtime = read('klas-group-communication.js');
  assert.match(runtime, /MAX_VIDEO_PARTICIPANTS = 6/);
  assert.match(runtime, /where\('active','==',true\)/);
  assert.match(runtime, /where\('to','==',runtime\.user\.uid\)/);
  assert.match(runtime, /addDoc\(collection\(db,'groupCalls',groupId,'signals'\)/);
  assert.match(runtime, /RTCPeerConnection/);
});

test('generated Firestore rules protect group chat and video collections', () => {
  const fragment = read('firestore-group-communication.rules');
  const build = read('scripts/build-firestore-rules.js');
  const firebase = JSON.parse(read('firebase.json'));
  assert.match(fragment, /match \/groupConversations\/\{groupId\}/);
  assert.match(fragment, /match \/groupCalls\/\{groupId\}/);
  assert.match(fragment, /request\.auth\.uid in get\(.+groups/);
  assert.match(fragment, /validSessionDescription/);
  assert.match(fragment, /validIceCandidate/);
  assert.match(build, /firestore\.generated\.rules/);
  assert.equal(firebase.firestore.rules, 'firestore.generated.rules');
});
