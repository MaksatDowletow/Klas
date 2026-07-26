'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const community = fs.readFileSync('klas-backend-community.js', 'utf8');
const media = fs.readFileSync('klas-user-media.js', 'utf8');
const bootstrap = fs.readFileSync('klas-backend-bootstrap.js', 'utf8');

for (const [name, source] of [['community media', community], ['personal media manager', media]]) {
  test(`${name} falls back while composite indexes are building`, () => {
    assert.match(source, /function isIndexUnavailable\(error\)/);
    assert.match(source, /code\.includes\('failed-precondition'\) && message\.includes\('index'\)/);
    assert.match(source, /function watchWithIndexFallback\(primaryQuery, fallbackQuery, onData, label\)/);
    assert.match(source, /fallbackStop = onSnapshot\(/);
    assert.match(source, /retryTimer = setTimeout\(startPrimary, 60000\)/);
    assert.match(source, /function newestDocs\(docs\)/);
  });
}

test('community keeps indexed queries and adds index-free public and owner fallbacks', () => {
  assert.match(community, /where\('visibility', '==', 'public'\), orderBy\('createdAt', 'desc'\), limit\(100\)/);
  assert.match(community, /where\('visibility', '==', 'public'\), limit\(500\)/);
  assert.match(community, /where\('ownerId', '==', uid\), orderBy\('createdAt', 'desc'\), limit\(100\)/);
  assert.match(community, /where\('ownerId', '==', uid\), limit\(500\)/);
});

test('personal media and albums retain server ordering with bounded index-free fallbacks', () => {
  assert.match(media, /where\('ownerId','==',uid\), orderBy\('createdAt','desc'\), limit\(500\)/);
  assert.match(media, /where\('ownerId','==',uid\), limit\(500\)/);
  assert.match(media, /collection\(db,'mediaAlbums'\).*orderBy\('createdAt','desc'\).*limit\(100\)/s);
  assert.match(media, /collection\(db,'mediaAlbums'\).*where\('ownerId','==',uid\), limit\(250\)/s);
});

test('backend module cache is refreshed for the fallback release', () => {
  assert.match(bootstrap, /20260726-index-fallback1/);
});
