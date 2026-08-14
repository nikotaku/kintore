// オフラインキャッシュ（コードはnetwork-first、静的素材はstale-while-revalidate）
const CACHE = "kintore-memo-v5";
const ASSETS = [
  ".",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/store.js",
  "js/data.js",
  "js/util.js",
  "js/charts.js",
  "js/video-store.js",
  "js/cloud-sync.js",
  "js/vendor/supabase-2.75.0.js",
  "manifest.json",
  "icons/icon.svg",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      // An already-open page can still be running the previous upload-only code.
      // Reload controlled windows once so the pull-first client takes over immediately.
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then(clients => Promise.all(clients.map(client =>
        Promise.resolve(client.navigate(client.url)).catch(() => null)
      )))
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const shouldUseNetworkFirst = e.request.mode === "navigate"
    || /\.(?:html|js|css)$/.test(url.pathname);

  if (shouldUseNetworkFirst) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok && url.origin === location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request)
        .then(res => {
          if (res.ok && new URL(e.request.url).origin === location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
