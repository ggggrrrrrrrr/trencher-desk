/* Service worker stub. Web Push subscription is hooked up in STEP 8. */
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
