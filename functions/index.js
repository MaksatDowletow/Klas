'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { v2: cloudinary } = require('cloudinary');

initializeApp();

const CLOUDINARY_API_KEY = defineSecret('CLOUDINARY_API_KEY');
const CLOUDINARY_API_SECRET = defineSecret('CLOUDINARY_API_SECRET');
const CLOUDINARY_CLOUD_NAME = defineSecret('CLOUDINARY_CLOUD_NAME');
const ALLOWED_ORIGINS = new Set([
  'https://maksatdowletow.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

function json(res, status, body) {
  res.status(status).set('content-type', 'application/json; charset=utf-8').send(JSON.stringify(body));
}

function applyCors(req, res) {
  const origin = req.get('origin') || '';
  if (ALLOWED_ORIGINS.has(origin)) res.set('access-control-allow-origin', origin);
  res.set('vary', 'Origin');
  res.set('access-control-allow-methods', 'POST, OPTIONS');
  res.set('access-control-allow-headers', 'Authorization, Content-Type');
  res.set('access-control-max-age', '3600');
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function parseCloudinaryAsset(src, fallbackType = 'image') {
  const url = new URL(String(src || ''));
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') throw new Error('CLOUDINARY_URL_REQUIRED');
  const parts = url.pathname.split('/').filter(Boolean);
  const uploadIndex = parts.indexOf('upload');
  if (uploadIndex < 1 || uploadIndex >= parts.length - 1) throw new Error('CLOUDINARY_URL_INVALID');
  const resourceType = parts[uploadIndex - 1] === 'video' ? 'video' : fallbackType === 'video' ? 'video' : 'image';
  let assetParts = parts.slice(uploadIndex + 1);
  if (/^v\d+$/.test(assetParts[0] || '')) assetParts = assetParts.slice(1);
  if (!assetParts.length) throw new Error('CLOUDINARY_PUBLIC_ID_MISSING');
  const last = assetParts.pop().replace(/\.[a-z0-9]+$/i, '');
  assetParts.push(last);
  return { publicId: decodeURIComponent(assetParts.join('/')), resourceType };
}

async function verifyUser(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
  if (!match) throw new Error('AUTH_REQUIRED');
  return getAuth().verifyIdToken(match[1], true);
}

exports.deleteMediaAsset = onRequest({
  region: 'us-central1',
  secrets: [CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_CLOUD_NAME],
  timeoutSeconds: 60,
  memory: '256MiB',
  maxInstances: 10
}, async (req, res) => {
  if (!applyCors(req, res)) return json(res, 403, { error: 'ORIGIN_FORBIDDEN' });
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });

  try {
    const user = await verifyUser(req);
    const mediaId = String(req.body?.mediaId || '').trim();
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(mediaId)) return json(res, 400, { error: 'MEDIA_ID_INVALID' });

    const db = getFirestore();
    const ref = db.collection('media').doc(mediaId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return json(res, 200, { ok: true, alreadyDeleted: true });

    const media = snapshot.data();
    if (media.ownerId !== user.uid) return json(res, 403, { error: 'NOT_MEDIA_OWNER' });

    const asset = media.publicId
      ? { publicId: String(media.publicId), resourceType: media.resourceType === 'video' ? 'video' : media.type === 'video' ? 'video' : 'image' }
      : parseCloudinaryAsset(media.src, media.type);

    await ref.set({
      deletionState: 'deleting',
      deletionRequestedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME.value(),
      api_key: CLOUDINARY_API_KEY.value(),
      api_secret: CLOUDINARY_API_SECRET.value(),
      secure: true
    });

    const result = await cloudinary.uploader.destroy(asset.publicId, {
      resource_type: asset.resourceType,
      invalidate: true
    });
    if (!['ok', 'not found'].includes(result.result)) throw new Error(`CLOUDINARY_DELETE_${String(result.result || 'FAILED').toUpperCase()}`);

    await ref.delete();
    return json(res, 200, { ok: true, cloudinary: result.result });
  } catch (error) {
    console.error('deleteMediaAsset failed', error);
    const code = String(error?.message || 'DELETE_FAILED');
    const status = code === 'AUTH_REQUIRED' || code.startsWith('Firebase ID token') ? 401 : 500;
    return json(res, status, { error: code });
  }
});
