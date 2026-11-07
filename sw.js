// =====================================================================
// sw.js — 拼字小特工 PWA Service Worker 離線快取引擎
// 1. 核心靜態資源 Cache-First 離線秒開
// 2. Google Apps Script API 請求 Network-First 保持資料即時性
// 3. 單字庫與音檔永久快取
// =====================================================================

const CACHE_NAME = 'spelling-app-shell-v13';
const STATIC_ASSETS = [
  './',
  'index.html',
  'history.html',
  'css/styles.css',
  'src/time_limits.js',
  'src/app.js',
  'src/ui.js',
  'src/ui_export.js',
  'src/ui_weak_words.js',
  'src/store.js',
  'src/audio.js',
  'src/wordbank.js',
  'src/levels.js',
  'src/data.js',
  'src/diagnostics.js',
  'src/srs.js',
  'src/confetti.js',
  'data/words2000.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('SW pre-cache error:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && !key.startsWith('spelling-audio-cache') && !key.startsWith('spelling-vocab-cache')) {
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

  // 1. Google Apps Script 或外部 API：Network-First，絕不快取過期狀態
  if (url.origin.includes('script.google.com') || url.origin.includes('script.googleusercontent.com')) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // 2. 音檔與單字庫由專屬快取層處理
  if (url.pathname.includes('/sounds/') || url.pathname.includes('meanings.json')) {
    return;
  }

  // 3. 本機靜態資源：HTML 與 JS/CSS 採 Network-First（確保版本更新立即生效），其餘採 Stale-While-Revalidate
  if (req.method === 'GET' && url.origin === location.origin) {
    if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
      event.respondWith(
        fetch(req, { cache: 'no-cache' }).then((networkResp) => {
          if (networkResp && networkResp.ok) {
            const clone = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResp;
        }).catch(() => caches.match(req))
      );
      return;
    }
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        const fetchPromise = fetch(req).then((networkResp) => {
          if (networkResp && networkResp.ok) {
            cache.put(req, networkResp.clone());
          }
          return networkResp;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
