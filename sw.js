/* desk-static-v4: network-first; never cache /d/ data (including 404s). */
const CACHE = "desk-static-v4";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isDataRequest(url) {
  try {
    const path = new URL(url).pathname;
    return path.includes("/d/");
  } catch (e) {
    return false;
  }
}

async function networkFirstStatic(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type !== "opaque") {
      const copy = response.clone();
      const cache = await caches.open(CACHE);
      await cache.put(request, copy);
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function networkFirstData(request) {
  // Always hit the network. Never write data or 404s into the cache.
  return fetch(request, { cache: "no-store" });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (isDataRequest(req.url)) {
    event.respondWith(networkFirstData(req));
    return;
  }
  event.respondWith(networkFirstStatic(req));
});
