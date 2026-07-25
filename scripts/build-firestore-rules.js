'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const basePath = path.join(root, 'firestore.rules');
const fragmentPaths = [
  path.join(root, 'firestore-group-communication.rules'),
  path.join(root, 'firestore-user-media.rules')
];
const outputPath = path.join(root, 'firestore.generated.rules');
const marker = '    match /{document=**} { allow read, write: if false; }';
const legacyMediaBlock = /    match \/media\/\{mediaId\} \{[\s\S]*?\n    \}\n\n(?=    match \/stories\/\{storyId\})/;

let base = fs.readFileSync(basePath, 'utf8');
const fragments = fragmentPaths.map(file => fs.readFileSync(file, 'utf8').trimEnd());
if (!base.includes(marker)) throw new Error('Firestore catch-all marker tapylmady.');
if (!legacyMediaBlock.test(base)) throw new Error('Köne permissive media rules blogy tapylmady.');
base = base.replace(legacyMediaBlock, '');
if (!fragments[0].includes('match /groupConversations/{groupId}') || !fragments[0].includes('match /groupCalls/{groupId}')) throw new Error('Topar aragatnaşyk rules fragmenti nädogry.');
if (!fragments[1].includes('match /media/{mediaId}') || !fragments[1].includes('match /mediaAlbums/{albumId}')) throw new Error('Ulanyjy media rules fragmenti nädogry.');
const generated = base.replace(marker, `${fragments.join('\n\n')}\n\n${marker}`);
if ((generated.match(/match \/media\/\{mediaId\}/g) || []).length !== 1) throw new Error('Generated rules içinde media blogy ýeke-täk bolmaly.');
fs.writeFileSync(outputPath, generated);
console.log(`Firestore rules generated: ${path.basename(outputPath)} (${fragments.length} fragments)`);
