'use strict';

const CACHE_VERSION = 'klas-shell-v6.7.0';
const APP_BASE = new URL('./', self.registration.scope);
const appUrl = path => new URL(path, APP_BASE).href;
const APP_SHELL = [
  './','./index.html','./offline.html','./privacy.html','./manifest.webmanifest','./health.json',
  './klas-v4.css','./klas-backend.css','./klas-livechat.css','./klas-design-system.css','./klas-media-viewer.css',
  './klas-config.js','./klas-runtime.js','./klas-cache-recovery.js','./klas-auth-policy.js','./klas-presence-policy.js','./klas-media-viewer.js','./klas-contact-sync.js',
  './klas-v4-1.js','./klas-v4-2.js','./klas-v4-3.js','./klas-v4-4.js','./klas-bridge.js','./klas-pwa.js',
  './klas-backend-bootstrap.js','./klas-backend-core.js','./klas-backend-ui.js','./klas-backend-chat.js','./klas-backend-community.js',
  './klas-backend-notifications.js','./klas-backend-video.js','./klas-backend-realtime.js','./klas-backend-school-relations.js',
  './klas-school-groups-policy.mjs','./klas-registration-groups-policy.mjs','./klas-registration-groups.js','./klas-group-communication.js','./klas-user-media.js','./klas-admin-profile-media.js',
  './assets/icons/klas-icon.svg','./assets/icons/klas-maskable.svg','./assets/icons/klas-180.png','./assets/icons/klas-192.png','./assets/icons/klas-512.png','./assets/icons/klas-maskable-192.png','./assets/icons/klas-maskable-512.png'
].map(appUrl);

async function precacheIndividually(){
  const cache = await caches.open(CACHE_VERSION);
  const results = await Promise.allSettled(APP_SHELL.map(async url => {
    const response = await fetch(url, { cache: 'reload' });
    if (!response.ok) throw new Error(`Precache ${response.status}: ${url}`);
    await cache.put(url, response);
  }));
  const failed = results.filter(result => result.status === 'rejected');
  if (failed.length) console.warn(`Klas PWA: ${failed.length} asset keşlenmedi`, failed);
}

self.addEventListener('install', event => event.waitUntil(precacheIndividually()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('klas-shell-') && key !== CACHE_VERSION).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_APP_CACHES') {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('klas-shell-')).map(key => caches.delete(key)))));
  }
  if (event.data?.type === 'GET_VERSION') event.source?.postMessage({ type: 'VERSION', version: CACHE_VERSION });
});
async function networkFirst(request, fallbackUrl){
  const cache = await caches.open(CACHE_VERSION);
  try { const response = await fetch(request, { cache: 'no-store' }); if (response.ok && response.type === 'basic') await cache.put(request, response.clone()); return response; }
  catch { return (await cache.match(request, { ignoreSearch: true })) || (fallbackUrl ? await cache.match(fallbackUrl) : null) || Response.error(); }
}
async function cacheFirst(request){
  const cache = await caches.open(CACHE_VERSION); const cached = await cache.match(request, { ignoreSearch: true }); if (cached) return cached;
  try { const response = await fetch(request); if (response.ok && response.type === 'basic') await cache.put(request, response.clone()); return response; } catch { return Response.error(); }
}
self.addEventListener('fetch', event => {
  const { request } = event; if (request.method !== 'GET') return; const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_BASE.pathname)) return;
  if (request.mode === 'navigate') { event.respondWith(networkFirst(request, appUrl('./offline.html'))); return; }
  event.respondWith(/\.(?:js|mjs|css|json|webmanifest)$/i.test(url.pathname) ? networkFirst(request) : cacheFirst(request));
});