'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const runtime = fs.readFileSync('klas-user-media.js', 'utf8');
const community = fs.readFileSync('klas-backend-community.js', 'utf8');
const bootstrap = fs.readFileSync('klas-backend-bootstrap.js', 'utf8');
const deployment = JSON.parse(fs.readFileSync('deployment-files.json', 'utf8'));
const worker = fs.readFileSync('service-worker.js', 'utf8');
const rules = fs.readFileSync('firestore-user-media.rules', 'utf8');
const builder = fs.readFileSync('scripts/build-firestore-rules.js', 'utf8');

test('personal media manager is deployed and loaded', () => {
  assert.match(bootstrap, /klas-user-media\.js/);
  assert.ok(deployment.files.includes('klas-user-media.js'));
  assert.match(worker, /klas-user-media\.js/);
});

test('manager supports owner query, albums, filters, bulk move and bulk delete', () => {
  assert.match(runtime, /where\('ownerId','==',uid\)/);
  assert.match(runtime, /mediaAlbums/);
  assert.match(runtime, /mediaManagerAlbumFilter/);
  assert.match(runtime, /moveSelected/);
  assert.match(runtime, /writeBatch/);
  assert.match(runtime, /batch\.delete/);
});

test('media schema stores editable metadata and visibility', () => {
  for (const field of ['description', 'albumId', 'visibility', 'updatedAt']) assert.match(community, new RegExp(field));
  assert.match(runtime, /visibility.*private/);
  assert.match(runtime, /KlasMediaViewer/);
});

test('security rules restrict media and album mutation to owners', () => {
  assert.match(rules, /match \/media\/\{mediaId\}/);
  assert.match(rules, /match \/mediaAlbums\/\{albumId\}/);
  assert.match(rules, /resource\.data\.ownerId == request\.auth\.uid/);
  assert.match(rules, /request\.resource\.data\.ownerId == request\.auth\.uid/);
  assert.match(rules, /visibility.*\['public', 'private'\]/s);
});

test('generated rules builder includes media security fragment', () => {
  assert.match(builder, /firestore-user-media\.rules/);
  assert.match(builder, /match \/mediaAlbums\/\{albumId\}/);
});
