'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const runtime = fs.readFileSync(path.join(root, 'klas-registration-groups.js'), 'utf8');
const policy = fs.readFileSync(path.join(root, 'klas-registration-groups-policy.mjs'), 'utf8');

test('automatic groups use deterministic Firestore document IDs and transactions', () => {
  assert.match(runtime, /doc\(db, 'groups', definition\.key\)/);
  assert.match(runtime, /runTransaction\(db/);
  assert.match(policy, /groupKey:/);
  assert.match(policy, /autoManaged: true/);
});

test('group assignment no longer depends on a browser-local marker', () => {
  assert.doesNotMatch(runtime, /localStorage/);
  assert.match(runtime, /where\('memberIds', 'array-contains', uid\)/);
  assert.match(runtime, /registrationDataFromGroups/);
});

test('profile classification edits remove stale automatic memberships', () => {
  assert.match(runtime, /if \(desiredKeys\.has\(group\.id\)\) continue/);
  assert.match(runtime, /filter\(uid => uid !== user\.uid\)/);
  assert.match(runtime, /edit:\(\)=>openAssignmentDialog\(true\)/);
});
