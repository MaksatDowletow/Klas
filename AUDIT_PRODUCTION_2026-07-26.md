# Klas production audit — 2026-07-26

## Critical

1. `klas-admin-profile-media.js` observes the whole document body while `renderAdminProfile()` rewrites `innerHTML` on every refresh. The observer therefore schedules another refresh for its own mutation and may create a continuous microtask/DOM mutation loop.
2. The root `index.html` asset query token predates the current 6.7.0 runtime. Browser HTTP cache can therefore keep an older root script graph even when the Service Worker shell has been updated.

## High

3. Automatic cache recovery currently receives every global runtime report. Firestore permission/index failures and user-action failures are not cache-corruption signals and should not cause a reload.
4. Global `window.error` handling should distinguish executable JavaScript failures from ordinary image/video resource failures.

## Corrections

- use a coalesced animation-frame refresh and observe only relevant containers;
- render the admin profile only when its signature changes;
- update root asset release tokens;
- restrict cache recovery to version/module/bootstrap failure signatures;
- keep Firebase/Cloudinary operational errors visible without reload;
- add regression tests for observer feedback, release-token alignment and recovery classification.
