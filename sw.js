// =====================================================================
// sw.js — 拼字小特工 PWA Service Worker 離線快取引擎
// 1. 核心靜態資源 Cache-First 離線秒開
// 2. Google Apps Script API 請求 Network-First 保持資料即時性
// 3. 單字庫與音檔永久快取
// =====================================================================

const CACHE_NAME = 'spelling-app-shell-v282';
const MAX_CACHE_ENTRIES = 120;
const STATIC_ASSETS = [
  './',
  'index.html',
  'css/styles.css',
  'src/auth_sync.js',
  'src/config.js',
  'src/time_limits.js',
  'src/app.js',
  'src/remedy_service.js',
  'src/ui.js',
  'src/ui_summary.js',
  'src/ui_conquer.js',
  'src/ui_weak_words.js',
  'src/store.js',
  'src/audio.js',
  'src/wordbank.js',
  'src/levels.js',
  'src/data.js',
  'src/diagnostics.js',
  'src/srs.js',
  'data/words2000.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn(`[SW] Pre-caching failed for: ${asset}`, err);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key.startsWith('spelling-app-shell-')) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  if (url.hostname.includes('script.google.com') || url.hostname.includes('script.googleusercontent.com')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  if (url.pathname.endsWith('.mp3') || url.pathname.includes('/data/words2000.json')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.status === 200) {
            cache.put(req, res.clone());
          }
          return res;
        } catch (e) {
          return cached;
        }
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return res;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
