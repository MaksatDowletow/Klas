(function initialiseKlasCacheRecovery(root) {
  'use strict';

  if (!root?.document || root.KlasCacheRecovery) return;

  const MARKER_KEY = 'klas-cache-recovery';
  const COOLDOWN_MS = 10 * 60 * 1000;
  const CACHE_PREFIX = 'klas-shell-';
  let recoveryPromise = null;

  function sessionStore() {
    try { return root.sessionStorage; }
    catch { return null; }
  }

  function lastRecovery() {
    const value = Number(sessionStore()?.getItem(MARKER_KEY) || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function markRecovery(time = Date.now()) {
    try { sessionStore()?.setItem(MARKER_KEY, String(time)); }
    catch { /* Recovery must also work when sessionStorage is unavailable. */ }
  }

  function isCoolingDown(now = Date.now()) {
    return now - lastRecovery() < COOLDOWN_MS;
  }

  async function clearApplicationCaches() {
    if (!root.caches?.keys) return [];
    const keys = await root.caches.keys();
    const targets = keys.filter(key => key.startsWith(CACHE_PREFIX));
    await Promise.allSettled(targets.map(key => root.caches.delete(key)));
    return targets;
  }

  async function refreshServiceWorkers() {
    if (!root.navigator?.serviceWorker?.getRegistrations) return [];
    const registrations = await root.navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(registrations.map(async registration => {
      await registration.update().catch(() => {});
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    }));
    return registrations;
  }

  function recoveryUrl() {
    const url = new URL(root.location.href);
    url.searchParams.set('klasRecovery', String(Date.now()));
    return url.href;
  }

  async function recover(reason = 'runtime-error') {
    if (recoveryPromise) return recoveryPromise;
    if (isCoolingDown()) return { recovered: false, reason: 'cooldown' };

    markRecovery();
    recoveryPromise = (async () => {
      root.document.documentElement.dataset.klasRecovery = 'running';
      const bannerText = root.document.getElementById('appErrorText');
      if (bannerText) bannerText.textContent = 'Programma keşi awtomatik täzelenýär. Sahypa gaýtadan açylar…';

      const [cacheResult, workerResult] = await Promise.allSettled([
        clearApplicationCaches(),
        refreshServiceWorkers()
      ]);

      root.dispatchEvent(new CustomEvent('klas:cache-recovery', {
        detail: { reason, cacheResult, workerResult, recoveredAt: new Date().toISOString() }
      }));

      await new Promise(resolve => root.setTimeout(resolve, 450));
      root.location.replace(recoveryUrl());
      return { recovered: true };
    })();

    try { return await recoveryPromise; }
    finally { recoveryPromise = null; }
  }

  function removeRecoveryQuery() {
    const url = new URL(root.location.href);
    if (!url.searchParams.has('klasRecovery')) return;
    url.searchParams.delete('klasRecovery');
    root.history.replaceState(root.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  root.addEventListener('klas:error', event => {
    recover(event.detail?.context || 'runtime-error').catch(error => {
      root.console?.error?.('[Klas:cache-recovery]', error);
    });
  });

  removeRecoveryQuery();
  root.KlasCacheRecovery = Object.freeze({
    recover,
    clearApplicationCaches,
    refreshServiceWorkers,
    isCoolingDown,
    cooldownMs: COOLDOWN_MS
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
