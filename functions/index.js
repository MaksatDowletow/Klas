'use strict';

const { createHash, randomUUID } = require('node:crypto');
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
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const AI_MINUTE_LIMIT = 5;
const AI_DAY_LIMIT = 100;
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

function cleanText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const parts = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

function safetyIdentifier(uid) {
  return createHash('sha256').update(`klas:${uid}`).digest('hex');
}

async function enforceAiRateLimit(uid) {
  const db = getFirestore();
  const reference = db.collection('aiUsage').doc(uid);
  const now = Date.now();
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.data() || {};
    const minuteStart = timestampMillis(data.minuteWindowStartedAt);
    const dayStart = timestampMillis(data.dayWindowStartedAt);
    const sameMinute = minuteStart > 0 && now - minuteStart < 60_000;
    const sameDay = dayStart > 0 && now - dayStart < 86_400_000;
    const minuteCount = sameMinute ? Number(data.minuteCount) || 0 : 0;
    const dayCount = sameDay ? Number(data.dayCount) || 0 : 0;
    if (minuteCount >= AI_MINUTE_LIMIT || dayCount >= AI_DAY_LIMIT) throw new Error('AI_RATE_LIMIT');
    transaction.set(reference, {
      uid,
      minuteWindowStartedAt: new Date(sameMinute ? minuteStart : now),
      minuteCount: minuteCount + 1,
      dayWindowStartedAt: new Date(sameDay ? dayStart : now),
      dayCount: dayCount + 1,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });
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

exports.profileAssistant = onRequest({
  region: 'us-central1',
  secrets: [OPENAI_API_KEY],
  timeoutSeconds: 60,
  memory: '256MiB',
  maxInstances: 5
}, async (req, res) => {
  if (!applyCors(req, res)) return json(res, 403, { error: 'ORIGIN_FORBIDDEN' });
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });

  try {
    const user = await verifyUser(req);
    const goal = cleanText(req.body?.goal, 600);
    const source = req.body?.profile && typeof req.body.profile === 'object' ? req.body.profile : {};
    const profile = {
      fullName: cleanText(source.fullName, 100),
      city: cleanText(source.city, 80),
      profession: cleanText(source.profession, 80),
      school: cleanText(source.school, 120),
      graduationYear: cleanText(source.graduationYear, 4),
      className: cleanText(source.className, 20),
      interests: cleanText(source.interests, 300),
      currentBio: cleanText(source.currentBio, 500)
    };

    const account = await getFirestore().collection('users').doc(user.uid).get();
    if (!account.exists || account.data()?.status !== 'active') return json(res, 403, { error: 'ACCOUNT_INACTIVE' });
    await enforceAiRateLimit(user.uid);

    const requestId = randomUUID();
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${OPENAI_API_KEY.value()}`,
        'content-type': 'application/json',
        'x-client-request-id': requestId
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        store: false,
        safety_identifier: safetyIdentifier(user.uid),
        instructions: 'Sen Klas sosial platformasy üçin türkmen dilinde profil bio ýazýan redaktor. Diňe berlen maglumatlara daýan. Saglyk, din, syýasat, etnik gelip çykyş ýa-da başga duýgur häsiýetleri çaklama. Netije 1-3 sözlem, arassa, dostlukly we 500 belgiden gysga bolsun. Diňe taýýar bio tekstini ber.',
        input: JSON.stringify({ goal, profile }),
        max_output_tokens: 220
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('OpenAI profileAssistant error', response.status, payload?.error?.type || payload?.error?.code || 'unknown', requestId);
      const status = response.status === 429 ? 429 : 502;
      return json(res, status, { error: response.status === 429 ? 'AI_LIMIT_REACHED' : 'AI_SERVICE_FAILED' });
    }

    const bio = cleanText(extractResponseText(payload), 500);
    if (!bio) return json(res, 502, { error: 'AI_EMPTY_RESPONSE' });
    return json(res, 200, { ok: true, bio });
  } catch (error) {
    console.error('profileAssistant failed', error);
    const code = String(error?.message || 'AI_REQUEST_FAILED');
    const status = code === 'AUTH_REQUIRED' || code.startsWith('Firebase ID token')
      ? 401
      : code === 'AI_RATE_LIMIT'
        ? 429
        : 500;
    return json(res, status, { error: code });
  }
});
