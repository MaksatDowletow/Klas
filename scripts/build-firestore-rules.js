'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const basePath = path.join(root, 'firestore.rules');
const fragmentPath = path.join(root, 'firestore-group-communication.rules');
const outputPath = path.join(root, 'firestore.generated.rules');
const marker = '    match /{document=**} { allow read, write: if false; }';

const base = fs.readFileSync(basePath, 'utf8');
const fragment = fs.readFileSync(fragmentPath, 'utf8').trimEnd();
if (!base.includes(marker)) throw new Error('Firestore catch-all marker tapylmady.');
if (!fragment.includes('match /groupConversations/{groupId}')) throw new Error('Topar çat rules fragmenti nädogry.');
if (!fragment.includes('match /groupCalls/{groupId}')) throw new Error('Topar wideoçat rules fragmenti nädogry.');
const generated = base.replace(marker, `${fragment}\n\n${marker}`);
fs.writeFileSync(outputPath, generated);
console.log(`Firestore rules generated: ${path.basename(outputPath)}`);
