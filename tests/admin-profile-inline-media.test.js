'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const runtime = fs.readFileSync('klas-admin-profile-media.js','utf8');
const bootstrap = fs.readFileSync('klas-backend-bootstrap.js','utf8');
const deployment = JSON.parse(fs.readFileSync('deployment-files.json','utf8'));
const worker = fs.readFileSync('service-worker.js','utf8');

test('administrator profile module is loaded and available offline', () => {
  assert.match(bootstrap,/klas-admin-profile-media\.js/);
  assert.ok(deployment.files.includes('klas-admin-profile-media.js'));
  assert.match(worker,/klas-admin-profile-media\.js/);
});

test('administrator profile is role-aware and separate from owner media operations', () => {
  assert.match(runtime,/role\(\) === 'admin'/);
  assert.match(runtime,/administratorProfileCard/);
  assert.match(runtime,/Media eýeçilik amallary merkezi admin panelinde däl/);
});

test('media controls are rendered at the media location only for its owner', () => {
  assert.match(runtime,/function owns\(item\)/);
  assert.match(runtime,/item\.ownerId === uid \|\| item\.ownerId === 'me'/);
  assert.match(runtime,/media-inline-owner-actions/);
  assert.match(runtime,/data-inline-media-edit/);
  assert.match(runtime,/data-inline-media-delete/);
  assert.match(runtime,/KlasUserMedia\?\.edit/);
  assert.match(runtime,/KlasUserMedia\?\.remove/);
});

test('inline media controls stop propagation to viewer button', () => {
  assert.match(runtime,/event\.preventDefault\(\); event\.stopPropagation\(\)/);
});
