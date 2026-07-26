(function initialiseKlasRuntime(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root?.document) root.KlasRuntime = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this, root => {
  'use strict';

  const APP_VERSION = '6.3.0';
  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = 'klas-v4-state';
  const STORAGE_MARKER = 'klas-store';
  const ERROR_LIMIT = 20;
  const PAGES = Object.freeze([
    'feed',
    'room',
    'classmates',
    'messages',
    'groups',
    'media',
    'events',
    'saved',
    'notifications',
    'settings'
  ]);
  const EVENTS = Object.freeze({
    stateChange: 'klas:statechange',
    pageChange: 'klas:pagechange',
    runtimeError: 'klas:error',
    diagnostics: 'klas:diagnostics'
  });
  const pageSet = new Set(PAGES);
  const errors = [];
  let booted = false;
  let dismissedErrorId = '';

  function eventName(name) {
    const value = String(name || '').trim();
    return value.startsWith('klas:') ? value : `klas:${value}`;
  }

  function normalizePage(value) {
    const page = String(value || '').trim().toLowerCase().replace(/^#/, '');
    return pageSet.has(page) ? page : 'feed';
  }

  function pageFromHash(hash) {
    return normalizePage(String(hash || '').split('?')[0]);
  }

  function normaliseError(error, context = 'runtime') {
    const rawMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
    const message = rawMessage
      .replace(/https?:\/\/\S+/gi, '[URL]')
      .replace(/[\r\n\t]+/g, ' ')
      .trim()
      .slice(0, 240) || 'Unknown error';
    return Object.freeze({
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
      context: String(context || 'runtime').slice(0, 80),
      name: error?.name || 'Error',
      message,
      occurredAt: new Date().toISOString()
    });
  }

  function safeClone(value) {
    if (value === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  function createStorage({ storage = null, key = STORAGE_KEY, onError = () => {} } = {}) {
    let lastError = null;

    const fail = (error, operation) => {
      lastError = normaliseError(error, `storage:${operation}`);
      try { onError(lastError); } catch { /* A storage error reporter must never break the app. */ }
      return false;
    };

    return Object.freeze({
      read(fallback = null) {
        if (!storage) return safeClone(fallback);
        try {
          const raw = storage.getItem(key);
          if (!raw) return safeClone(fallback);
          const parsed = JSON.parse(raw);
          lastError = null;
          if (parsed?.marker === STORAGE_MARKER && 'data' in parsed) return parsed.data;
          return parsed;
        } catch (error) {
          fail(error, 'read');
          return safeClone(fallback);
        }
      },
      write(value) {
        if (!storage) return fail(new Error('Storage is unavailable'), 'write');
        try {
          storage.setItem(key, JSON.stringify({
            marker: STORAGE_MARKER,
            schema: SCHEMA_VERSION,
            savedAt: new Date().toISOString(),
            data: value
          }));
          lastError = null;
          return true;
        } catch (error) {
          return fail(error, 'write');
        }
      },
      remove() {
        if (!storage) return fail(new Error('Storage is unavailable'), 'remove');
        try {
          storage.removeItem(key);
          lastError = null;
          return true;
        } catch (error) {
          return fail(error, 'remove');
        }
      },
      diagnostics() {
        return Object.freeze({
          available: Boolean(storage),
          key,
          schema: SCHEMA_VERSION,
          lastError
        });
      }
    });
  }

  function emit(name, detail = {}) {
    if (typeof root?.dispatchEvent !== 'function' || typeof root?.CustomEvent !== 'function') return false;
    root.dispatchEvent(new root.CustomEvent(eventName(name), { detail }));
    return true;
  }

  function on(name, handler, options) {
    if (typeof root?.addEventListener !== 'function' || typeof handler !== 'function') return () => {};
    const type = eventName(name);
    root.addEventListener(type, handler, options);
    return () => root.removeEventListener(type, handler, options);
  }

  function getBrowserStorage() {
    try { return root?.localStorage || null; }
    catch { return null; }
  }

  const stateStore = createStorage({
    storage: getBrowserStorage(),
    key: STORAGE_KEY,
    onError: entry => {
      errors.push(entry);
      if (errors.length > ERROR_LIMIT) errors.shift();
    }
  });

  function diagnostics() {
    const result = {
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      online: root?.navigator?.onLine !== false,
      storage: stateStore.diagnostics(),
      errorCount: errors.length,
      checkedAt: new Date().toISOString()
    };

    const storage = getBrowserStorage();
    if (storage) {
      const probeKey = 'klas-runtime-probe';
      try {
        storage.setItem(probeKey, result.checkedAt);
        storage.removeItem(probeKey);
        result.storageWritable = true;
      } catch (error) {
        result.storageWritable = false;
        result.storageProbeError = normaliseError(error, 'storage:probe');
      }
    } else {
      result.storageWritable = false;
    }
    return Object.freeze(result);
  }

  function updateRuntimeUI(result = diagnostics()) {
    const document = root?.document;
    if (!document) return result;
    const status = document.getElementById('appRuntimeStatus');
    const version = document.getElementById('appRuntimeVersion');
    const banner = document.getElementById('appErrorBanner');
    const bannerText = document.getElementById('appErrorText');
    const latest = errors.at(-1);
    const healthy = result.storageWritable && (!latest || latest.id === dismissedErrorId);

    document.documentElement.dataset.klasRuntime = healthy ? 'ready' : 'degraded';
    document.documentElement.dataset.klasVersion = APP_VERSION;
    if (version) version.textContent = `Klas ${APP_VERSION} · Runtime ${SCHEMA_VERSION}`;
    if (status) {
      status.textContent = `${result.online ? 'Online' : 'Offline'} · ${result.storageWritable ? 'ýerli maglumatlar taýýar' : 'ýerli saklanyş bloklanan'}`;
      status.dataset.state = healthy ? 'ready' : 'degraded';
    }
    if (banner && bannerText) {
      const visible = Boolean(latest && latest.id !== dismissedErrorId);
      banner.hidden = !visible;
      if (visible) bannerText.textContent = 'Programmada garaşylmadyk näsazlyk boldy. Maglumatlaryňyz saklandy; täzeden synanyşyň.';
    }
    return result;
  }

  function reportError(error, context = 'runtime') {
    const entry = normaliseError(error, context);
    errors.push(entry);
    if (errors.length > ERROR_LIMIT) errors.shift();
    emit(EVENTS.runtimeError, entry);
    updateRuntimeUI();
    root?.console?.error?.(`[Klas:${entry.context}]`, error);
    return entry;
  }

  function guard(context, handler) {
    if (typeof handler !== 'function') throw new TypeError('guard() requires a function');
    return async function guardedHandler(...args) {
      try {
        return await handler.apply(this, args);
      } catch (error) {
        reportError(error, context);
        const message = error?.message || 'Ýalňyşlyk ýüze çykdy.';
        if (root?.KlasBridge?.toast) root.KlasBridge.toast(message);
        else if (typeof root?.toast === 'function') root.toast(message);
        return undefined;
      }
    };
  }

  function boot() {
    if (booted || !root?.document) return diagnostics();
    booted = true;
    const document = root.document;
    const refresh = () => {
      const result = updateRuntimeUI();
      emit(EVENTS.diagnostics, result);
      return result;
    };

    document.getElementById('appRuntimeCheckBtn')?.addEventListener('click', () => {
      const result = refresh();
      const message = result.storageWritable
        ? 'Ýerli maglumat saklanyşy kadaly.'
        : 'Brauzeriň ýerli saklanyş rugsadyny barlaň.';
      if (root?.KlasBridge?.toast) root.KlasBridge.toast(message);
      else if (typeof root?.toast === 'function') root.toast(message);
    });
    document.getElementById('appErrorDismissBtn')?.addEventListener('click', () => {
      dismissedErrorId = errors.at(-1)?.id || '';
      updateRuntimeUI();
    });
    root.addEventListener('online', refresh);
    root.addEventListener('offline', refresh);
    root.addEventListener('error', event => reportError(event.error || new Error(event.message), 'window'));
    root.addEventListener('unhandledrejection', event => reportError(event.reason, 'promise'));
    return refresh();
  }

  const api = {
    APP_VERSION,
    SCHEMA_VERSION,
    STORAGE_KEY,
    PAGES,
    EVENTS,
    eventName,
    normalizePage,
    pageFromHash,
    normaliseError,
    createStorage,
    stateStore,
    emit,
    on,
    diagnostics,
    updateRuntimeUI,
    reportError,
    guard,
    boot,
    getErrors: () => errors.map(entry => ({ ...entry }))
  };

  if (root?.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot, { once: true });
    else root.setTimeout(boot, 0);
  }
  return api;
});
