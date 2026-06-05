/* =============================================================================
   sw.js — offline cache for the Preop Guide (bullgator1.github.io/preop-guidance/)

   Behaviour:
     • Online  → ALWAYS serves the freshest file from the network, and refreshes
                 its cached copy in the background. (network-first)
     • Offline → serves the last copy it saw (WiFi dead zones / the OR).

   Why network-first: a cache-first worker can "freeze" an old page forever even
   after you fix the deploy. Network-first means the server is the source of
   truth whenever you have signal, so the app self-updates on every online open.

   Scope: this file lives at /preop-guidance/sw.js, so its scope is
   /preop-guidance/ ONLY. It will NEVER touch your other bullgator1.github.io
   projects. Do not move this file to the repo root and do not register it with
   a '/' scope, or it would try to control the whole github.io origin.

   On activate it deletes every cache except its own — this is what clears the
   stale cache that is currently serving the wrong app.
   ============================================================================= */

const CACHE = 'preop-guide-v1';   // bump to v2, v3… only if you ever want to force a hard cache reset

/* Minimal shell so the first offline open works. allSettled => a missing file
   never breaks install. Paths are relative, so they resolve under /preop-guidance/. */
const SHELL = ['./', './index.html', './manifest.json',
  './apple-touch-icon.png', './icon-192.png', './icon-512.png',
  './icon-512-maskable.png', './favicon-32.png', './favicon-16.png', './favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
    self.skipWaiting();   // take over as soon as possible
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Delete ALL other caches on this origin's scope — including any stale cache
    // left over from the earlier mix-up that is serving the wrong app.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();   // control open pages immediately, no extra reload needed
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle same-origin GET requests within our scope. Everything else
  // (POSTs, cross-origin font/CDN requests, etc.) goes straight to the network.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isDoc = req.mode === 'navigate'
             || req.destination === 'document'
             || url.pathname.endsWith('/')
             || url.pathname.endsWith('index.html');

  if (isDoc) {
    // NETWORK-FIRST for the page itself — the deploy is always the source of truth.
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE);
        return (await cache.match(req))
            || (await cache.match('./index.html'))
            || Response.error();
      }
    })());
    return;
  }

  // Other in-scope assets: network-first, fall back to cache when offline.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(req);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      return (await cache.match(req)) || Response.error();
    }
  })());
});
