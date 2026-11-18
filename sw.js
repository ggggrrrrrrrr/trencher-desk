/* desk-static-v9: network-first; never cache /d/ data (including 404s). */
const CACHE = "desk-static-v9";

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
  // Live prices and other cross-origin calls go straight to the network.
  try { if (new URL(req.url).origin !== self.location.origin && !/fonts\.(googleapis|gstatic)\.com$/.test(new URL(req.url).hostname)) return; } catch (e) { return; }
  if (isDataRequest(req.url)) {
    event.respondWith(networkFirstData(req));
    return;
  }
  event.respondWith(networkFirstStatic(req));
});

/* v9: win notifications (Web Push). */
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: "trencher desk", body: event.data ? event.data.text() : "" }; }
  const title = d.title || "trencher desk";
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    tag: d.tag || undefined,
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    data: { url: d.url || self.registration.scope },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope) && "focus" in w) { return w.focus(); }
    }
    return self.clients.openWindow(target);
  })());
});
