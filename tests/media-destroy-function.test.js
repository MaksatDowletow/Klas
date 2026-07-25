'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const functionSource = fs.readFileSync('functions/index.js', 'utf8');
const mediaRuntime = fs.readFileSync('klas-user-media.js', 'utf8');
const config = fs.readFileSync('klas-config.js', 'utf8');
const firebase = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('media deletion is server-side and authenticated', () => {
  assert.match(functionSource, /verifyIdToken\(match\[1\], true\)/);
  assert.match(functionSource, /media\.ownerId !== user\.uid/);
  assert.match(functionSource, /cloudinary\.uploader\.destroy/);
  assert.match(functionSource, /invalidate:\s*true/);
  assert.match(functionSource, /await ref\.delete\(\)/);
});

test('Cloudinary secrets never enter browser configuration', () => {
  assert.doesNotMatch(config, /apiSecret|API_SECRET|CLOUDINARY_API_SECRET/);
  assert.match(functionSource, /defineSecret\('CLOUDINARY_API_SECRET'\)/);
  assert.match(functionSource, /defineSecret\('CLOUDINARY_API_KEY'\)/);
  assert.match(functionSource, /defineSecret\('CLOUDINARY_CLOUD_NAME'\)/);
});

test('frontend uses Firebase bearer token and never directly deletes media metadata', () => {
  assert.match(mediaRuntime, /getIdToken\(\)/);
  assert.match(mediaRuntime, /authorization:`Bearer \$\{token\}`/);
  assert.match(mediaRuntime, /config\?\.cloudinary\?\.deleteEndpoint/);
  assert.doesNotMatch(mediaRuntime, /batch\.delete\(doc\(db,\s*['"]media['"]/);
});

test('Firebase and release scripts include the media function', () => {
  assert.equal(firebase.functions.source, 'functions');
  assert.match(pkg.scripts['deploy:media-function'], /functions:deleteMediaAsset/);
  assert.match(pkg.scripts['deploy:media-backend'], /deploy:rules/);
});
