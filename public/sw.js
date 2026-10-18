// Cache only the public shell/assets. Internal API/media always use the network.
const VERSION = "v5";
const STATIC_CACHE = `family-static-${VERSION}`;
const APP_SHELL = ["/", "/manifest.webmanifest", "/pwa-icon.svg"];
const isOwnedCache = key => key.startsWith("family-static-") || key.startsWith("family-api-") || key.startsWith("family-private-");

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await (await caches.open(STATIC_CACHE)).addAll(APP_SHELL);
    // One security migration: replace workers that stored private API/media.
    // Once migrated, ordinary updates keep the existing explicit waiting flow.
    if (keys.some(key => /^family-static-v[1-4]$/.test(key) || key.startsWith("family-api-"))) await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => isOwnedCache(key) && key !== STATIC_CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  if (event.data === "GET_PRIVACY_POLICY") event.ports?.[0]?.postMessage({privacyPolicy:1});
});

function cacheable(request, response) {
  const directive = response.headers.get("Cache-Control") || "";
  const vary = response.headers.get("Vary") || "";
  return response.ok && !request.headers.has("Authorization") &&
    !/(?:^|,)\s*(?:no-store|private)(?:\s|,|=|$)/i.test(directive) &&
    !/(?:^|,)\s*(?:Authorization|\*)(?:\s|,|$)/i.test(vary) &&
    !response.headers.has("Set-Cookie");
}
function isStaticAsset(url) {
  return url.pathname.startsWith("/assets/") || APP_SHELL.includes(url.pathname);
}
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.headers.has("Authorization")) return;
  if (/^\/(?:api|uploads)(?:\/|$)/.test(url.pathname)) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(async response => {
      if (cacheable(request,response)) await (await caches.open(STATIC_CACHE)).put("/",response.clone());
      return response;
    }).catch(() => caches.match("/")));
    return;
  }
  if (isStaticAsset(url) && !url.search) {
    event.respondWith(caches.match(request).then(cached => {
      const network = fetch(request).then(async response => {
        if (cacheable(request,response)) await (await caches.open(STATIC_CACHE)).put(request,response.clone());
        return response;
      }).catch(() => cached);
      return cached || network;
    }));
  }
});

// --- WEB PUSH: show a system notification + update the app-icon badge ---
// Fired when the server sends a push (even while the PWA is closed).
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }

  const title = data.title || "Family Organizer";
  const options = {
    body: data.body || "",
    icon: "/pwa-icon.svg",
    badge: "/pwa-icon.svg",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { tab: data.tab || "", url: data.url || "/" }
  };

  const jobs = [self.registration.showNotification(title, options)];

  // App-icon badge (iOS 16.4+ / supporting platforms). Best-effort.
  if (typeof data.badge === "number" && self.navigator && "setAppBadge" in self.navigator) {
    jobs.push(
      (data.badge > 0
        ? self.navigator.setAppBadge(data.badge)
        : self.navigator.clearAppBadge()
      ).catch(() => {})
    );
  }

  event.waitUntil(Promise.all(jobs));
});

// Tapping a notification focuses the app (or opens it), deep-linking to the tab.
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const tab = (event.notification.data && event.notification.data.tab) || "";
  const targetUrl = tab ? `/?notif_tab=${encodeURIComponent(tab)}` : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if (tab) client.postMessage({ type: "NOTIF_NAV", tab });
          return undefined;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    })
  );
});
