/// <reference types="@sveltejs/kit" />
// Minimal, safe PWA service worker (auto-registered by SvelteKit in the built app). Its job is
// installability + a fast/offline app shell — NOT caching live data. Content-hashed build assets are
// cache-first; navigations are network-first (so the shell is never stale) with an offline fallback;
// cross-origin requests (Supabase relay, ForgeFX API, fonts) are never intercepted.
import { build, files, version } from '$service-worker';

const CACHE = `axis-${version}`;
const PRECACHE = [...build, ...files];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // relay / API / fonts → leave untouched

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // content-hashed build + static assets → cache-first (safe, filenames change per version)
      if (PRECACHE.includes(url.pathname)) {
        const hit = await cache.match(url.pathname);
        if (hit) return hit;
      }
      try {
        const res = await fetch(request);
        if (request.mode === 'navigate' && res.ok) cache.put(request, res.clone()); // keep a shell for offline
        return res;
      } catch {
        const cached = (await cache.match(request)) || (request.mode === 'navigate' && (await cache.match('/')));
        if (cached) return cached;
        throw new Error('offline and uncached');
      }
    })()
  );
});
