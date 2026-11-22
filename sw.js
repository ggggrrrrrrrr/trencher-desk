/* desk-static-v36: app shell cached for instant start; index network-first (2.5s);
   versioned assets + fonts stale-while-revalidate; never cache /d/ data (including 404s). */
const CACHE = "desk-static-v36";
const SHELL = ["./", "index.html", "app.css?v=36", "app.js?v=36", "manifest.json?v=36", "icons/icon-192.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try { const c = await caches.open(CACHE); await c.addAll(SHELL); } catch (e) {}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isDataRequest(url) {
  try { return new URL(url).pathname.includes("/d/"); } catch (e) { return false; }
}

async function put(request, response) {
  if (response && response.ok && response.type !== "opaque") {
    const c = await caches.open(CACHE); await c.put(request, response.clone());
  }
  return response;
}

async function networkFirstPage(request) {
  const net = fetch(request).then((r) => put(request, r));
  const timeout = new Promise((res) => setTimeout(res, 2500));
  try {
    const r = await Promise.race([net, timeout]);
    if (r) return r;
  } catch (e) {}
  const cached = await caches.match(request, { ignoreSearch: true }) || await caches.match("index.html");
  if (cached) return cached;
  return net;
}

async function staleWhileRevalidate(event, request) {
  const cached = await caches.match(request);
  const net = fetch(request).then((r) => put(request, r));
  if (cached) { event.waitUntil(net.catch(() => {})); return cached; }
  return net;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url; try { url = new URL(req.url); } catch (e) { return; }
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  // Live prices and other cross-origin calls go straight to the network.
  if (url.origin !== self.location.origin && !font) return;
  if (isDataRequest(req.url)) { event.respondWith(fetch(req, { cache: "no-store" })); return; }
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/")) { event.respondWith(networkFirstPage(req)); return; }
  if (font || url.searchParams.has("v") || url.pathname.includes("/icons/")) { event.respondWith(staleWhileRevalidate(event, req)); return; }
  event.respondWith(fetch(req).then((r) => put(req, r)).catch(async () => (await caches.match(req)) || Response.error()));
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
