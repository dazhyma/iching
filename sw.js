/* Офлайн-кэш.
   Стратегия: код и разметка — сначала сеть, кэш только как офлайн-запас.
   Иначе после правок пользователь видит старую версию и не понимает почему.
   Картинки и шрифты — из кэша: они не меняются и грузятся мгновенно. */

const CACHE = "iching-v16";
const ASSETS = ["./", "fonts/Jura.ttf", "fonts/Manrope.ttf", "index.html", "app.css", "app.js",
  "engine.js", "data.js", "lines.js", "fuzzy.js", "topics.js", "typo.js", "subject.js", "intent.js", "profiles.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

const NETWORK_FIRST = /(\/|\.html|\.js|\.css|\.webmanifest)$/;
const CACHE_FIRST = /\.(png|jpg|jpeg|svg|webp|ttf|woff2?|otf)$/;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* Код и разметка: сначала сеть. При офлайне — из кэша. */
  if (!CACHE_FIRST.test(url.pathname)) {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match("index.html")))
    );
    return;
  }

  /* Шрифты и картинки: сначала кэш. */
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }))
  );
});
