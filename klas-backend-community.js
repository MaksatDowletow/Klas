import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { db, runtime, bridge, handleError, normalizeHttpUrl } from './klas-backend-core.js';

let stops = [];
let publicMedia = new Map();
let ownMedia = new Map();

function requireUser(){
  if (!runtime.user) throw new Error('Ilki Google bilen giriş ediň.');
  return runtime.user;
}

function cleanText(value, max, label, required = false){
  const result = String(value || '').trim();
  if (required && !result) throw new Error(`${label} hökmany.`);
  if (result.length > max) throw new Error(`${label} ${max} belgiden uzyn bolmaly däl.`);
  return result;
}

function createdAtMillis(value){
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (Number.isFinite(value?.seconds)) return Number(value.seconds) * 1000;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestDocs(docs){
  return [...docs].sort((a, b) => {
    const difference = createdAtMillis(b.data()?.createdAt) - createdAtMillis(a.data()?.createdAt);
    return difference || String(b.id).localeCompare(String(a.id));
  });
}

function isIndexUnavailable(error){
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code.includes('failed-precondition') && message.includes('index');
}

function watchWithIndexFallback(primaryQuery, fallbackQuery, onData, label){
  let primaryStop = null;
  let fallbackStop = null;
  let retryTimer = null;
  let closed = false;

  const stopFallback = () => {
    fallbackStop?.();
    fallbackStop = null;
  };

  const startPrimary = () => {
    if (closed) return;
    primaryStop?.();
    primaryStop = onSnapshot(
      primaryQuery,
      snapshot => {
        stopFallback();
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = null;
        onData(snapshot, false);
      },
      error => {
        primaryStop = null;
        if (!isIndexUnavailable(error)) return handleError(error, label);
        if (!fallbackStop) {
          console.info(`[Klas] ${label}: Firestore indeksi taýýarlanýar; wagtlaýyn indeks talap etmeýän query ulanylýar.`);
          fallbackStop = onSnapshot(
            fallbackQuery,
            snapshot => onData(snapshot, true),
            fallbackError => handleError(fallbackError, label)
          );
        }
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(startPrimary, 60000);
      }
    );
  };

  startPrimary();
  return () => {
    closed = true;
    primaryStop?.();
    stopFallback();
    if (retryTimer) clearTimeout(retryTimer);
  };
}

function clear(){
  stops.forEach(stop => stop());
  stops = [];
  publicMedia = new Map();
  ownMedia = new Map();
  bridge.mergeRemoteGroups([]);
  bridge.mergeRemoteEvents([]);
  bridge.mergeRemoteMedia([]);
  bridge.mergeRemoteStories([]);
}

function watch(name, map, method){
  stops.push(onSnapshot(
    query(collection(db, name), orderBy('createdAt', 'desc'), limit(100)),
    snapshot => bridge[method](snapshot.docs.map(item => map(item.id, item.data()))),
    error => handleError(error, `${name} ýüklenmedi`)
  ));
}

function mediaView(id, media){
  return {
    id,
    remote: true,
    type: media.type === 'video' ? 'video' : 'image',
    src: media.src || '',
    title: media.title || 'Media',
    description: media.description || '',
    albumId: media.albumId || '',
    visibility: media.visibility || 'public',
    ownerId: media.ownerId,
    createdAt: media.createdAt || null
  };
}

function mergeVisibleMedia(){
  const merged = new Map(publicMedia);
  ownMedia.forEach((value, id) => merged.set(id, value));
  bridge.mergeRemoteMedia([...merged.values()].sort((a, b) => {
    const difference = createdAtMillis(b.createdAt) - createdAtMillis(a.createdAt);
    return difference || String(b.id).localeCompare(String(a.id));
  }));
}

function watchMedia(){
  const uid = runtime.user.uid;
  stops.push(watchWithIndexFallback(
    query(collection(db, 'media'), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(100)),
    query(collection(db, 'media'), where('visibility', '==', 'public'), limit(500)),
    snapshot => {
      publicMedia = new Map(newestDocs(snapshot.docs).slice(0, 100).map(item => [item.id, mediaView(item.id, item.data())]));
      mergeVisibleMedia();
    },
    'Açyk media ýüklenmedi'
  ));
  stops.push(watchWithIndexFallback(
    query(collection(db, 'media'), where('ownerId', '==', uid), orderBy('createdAt', 'desc'), limit(100)),
    query(collection(db, 'media'), where('ownerId', '==', uid), limit(500)),
    snapshot => {
      ownMedia = new Map(newestDocs(snapshot.docs).slice(0, 100).map(item => [item.id, mediaView(item.id, item.data())]));
      mergeVisibleMedia();
    },
    'Öz mediýaňyz ýüklenmedi'
  ));
}

function start(){
  clear();
  if (!runtime.user) return;
  watch('groups', (id, group) => ({
    id,
    remote: true,
    name: group.name || 'Gurnak',
    members: Number(group.membersCount) || 1,
    icon: group.icon || '🏫',
    description: group.description || '',
    joined: (group.memberIds || []).includes(runtime.user.uid),
    owner: group.ownerId === runtime.user.uid,
    ownerId: group.ownerId
  }), 'mergeRemoteGroups');
  watch('events', (id, event) => ({
    id,
    remote: true,
    title: event.title || 'Çäre',
    date: event.date || '',
    time: event.time || '18:00',
    location: event.location || '',
    description: event.description || '',
    attending: (event.attendeeIds || []).includes(runtime.user.uid),
    ownerId: event.ownerId
  }), 'mergeRemoteEvents');
  watchMedia();
  watch('stories', (id, story) => ({
    id,
    remote: true,
    ownerId: story.ownerId,
    name: story.ownerName || 'Ulanyjy',
    avatar: story.ownerAvatar || '',
    media: story.media || '',
    text: story.text || '',
    viewed: false,
    own: story.ownerId === runtime.user.uid
  }), 'mergeRemoteStories');
}

export async function createGroup(data){
  const user = requireUser();
  await addDoc(collection(db, 'groups'), {
    name: cleanText(data.name, 80, 'Gurnagyň ady', true),
    icon: cleanText(data.icon || '🏫', 8, 'Nyşan') || '🏫',
    description: cleanText(data.description, 300, 'Beýan'),
    ownerId: user.uid,
    memberIds: [user.uid],
    membersCount: 1,
    createdAt: serverTimestamp()
  });
}

export async function toggleGroup(id, joined){
  const user = requireUser();
  await updateDoc(doc(db, 'groups', id), {
    memberIds: joined ? arrayRemove(user.uid) : arrayUnion(user.uid),
    membersCount: increment(joined ? -1 : 1),
    updatedAt: serverTimestamp()
  });
}

export const deleteGroup = id => deleteDoc(doc(db, 'groups', id));

export async function createEvent(data){
  const user = requireUser();
  const date = cleanText(data.date, 10, 'Sene', true);
  const time = cleanText(data.time || '18:00', 5, 'Wagt', true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('Sene ýa-da wagt formaty nädogry.');
  await addDoc(collection(db, 'events'), {
    title: cleanText(data.title, 120, 'Çäräniň ady', true),
    date,
    time,
    location: cleanText(data.location, 180, 'Ýer', true),
    description: cleanText(data.description, 500, 'Beýan'),
    ownerId: user.uid,
    attendeeIds: [user.uid],
    createdAt: serverTimestamp()
  });
}

export async function toggleEvent(id, attending){
  const user = requireUser();
  await updateDoc(doc(db, 'events', id), {
    attendeeIds: attending ? arrayRemove(user.uid) : arrayUnion(user.uid),
    updatedAt: serverTimestamp()
  });
}

export const deleteEvent = id => deleteDoc(doc(db, 'events', id));

export async function createMedia(data){
  const user = requireUser();
  const type = data.type === 'video' ? 'video' : 'image';
  await addDoc(collection(db, 'media'), {
    title: cleanText(data.title || 'Täze media', 100, 'Media ady') || 'Täze media',
    description: cleanText(data.description, 500, 'Media beýany'),
    src: normalizeHttpUrl(data.src, { allowEmpty: false }),
    type,
    albumId: cleanText(data.albumId, 120, 'Albom ID-si'),
    visibility: data.visibility === 'private' ? 'private' : 'public',
    ownerId: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateMedia(id, data){
  requireUser();
  await updateDoc(doc(db, 'media', id), {
    title: cleanText(data.title || 'Media', 100, 'Media ady') || 'Media',
    description: cleanText(data.description, 500, 'Media beýany'),
    albumId: cleanText(data.albumId, 120, 'Albom ID-si'),
    visibility: data.visibility === 'private' ? 'private' : 'public',
    updatedAt: serverTimestamp()
  });
}

export const deleteMedia = id => deleteDoc(doc(db, 'media', id));

export async function createStory(data){
  const user = requireUser();
  await addDoc(collection(db, 'stories'), {
    text: cleanText(data.text, 500, 'Pursat ýazgysy'),
    media: normalizeHttpUrl(data.media, { allowEmpty: false }),
    ownerId: user.uid,
    ownerName: cleanText(runtime.profile?.shortName || user.displayName || 'Ulanyjy', 100, 'Ulanyjy ady'),
    ownerAvatar: normalizeHttpUrl(runtime.profile?.avatarURL || user.photoURL || ''),
    createdAt: serverTimestamp()
  });
}

export const deleteStory = id => deleteDoc(doc(db, 'stories', id));

window.addEventListener('klas-auth', event => event.detail.user ? start() : clear());
if (runtime.user) start();
