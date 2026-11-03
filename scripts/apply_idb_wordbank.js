const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../src/wordbank.js");
let code = fs.readFileSync(file, "utf8");

const isCRLF = code.includes("\r\n");
code = code.replace(/\r\n/g, "\n");

const oldFetchWithCache = `// 瀏覽器原生 CacheStorage 快取層：首次下載後本機零延遲讀取，大幅降低等待時間
async function fetchWithCache(url, isOptional = false) {
  const cacheName = "spelling-vocab-cache-v1";
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const cache = await caches.open(cacheName);
      const cachedResp = await cache.match(url);
      if (cachedResp) {
        // 背景非同步檢查更新，不阻礙前景即刻使用
        fetch(url).then(async (freshResp) => {
          if (freshResp && freshResp.ok) {
            await cache.put(url, freshResp.clone());
          }
        }).catch(() => {});
        return await cachedResp.json();
      }
      const netResp = await fetch(url);
      if (!netResp.ok) {
        if (isOptional) return {};
        throw new Error(url + " " + netResp.status);
      }
      await cache.put(url, netResp.clone());
      return await netResp.json();
    } catch(e) {
      console.warn("CacheStorage fallback to network:", e);
    }
  }
  const r = await fetch(url);
  if (!r.ok) {
    if (isOptional) return {};
    throw new Error(url + " " + r.status);
  }
  return await r.json();
}`;

const newFetchWithCache = `// 🚀 IndexedDB 高效能單字資料庫：結構化物件存取，免除每次反覆 JSON.parse 運算負擔
const IDB_CONFIG = { dbName: "App2000VocabDB", storeName: "wordbank_store", version: 1 };

function openIDB() {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) return resolve(null);
    try {
      const req = indexedDB.open(IDB_CONFIG.dbName, IDB_CONFIG.version);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_CONFIG.storeName)) {
          db.createObjectStore(IDB_CONFIG.storeName);
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}

async function getFromIDB(key) {
  const db = await openIDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_CONFIG.storeName, "readonly");
      const store = tx.objectStore(IDB_CONFIG.storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}

async function saveToIDB(key, value) {
  const db = await openIDB();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_CONFIG.storeName, "readwrite");
    const store = tx.objectStore(IDB_CONFIG.storeName);
    store.put(value, key);
  } catch (_) {}
}

// 雙層快取策略：優先讀取 IndexedDB (0 CPU JSON 解析損耗，1ms 秒開) ➜ 備援 CacheStorage ➜ 網路取得
async function fetchWithCache(url, isOptional = false) {
  try {
    const idbData = await getFromIDB(url);
    if (idbData) {
      // 背景非同步檢查更新，確保資料為最新版本
      fetch(url).then(async (fresh) => {
        if (fresh && fresh.ok) {
          const freshData = await fresh.json();
          saveToIDB(url, freshData);
        }
      }).catch(() => {});
      return idbData;
    }
  } catch (_) {}

  const cacheName = "spelling-vocab-cache-v1";
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const cache = await caches.open(cacheName);
      const cachedResp = await cache.match(url);
      if (cachedResp) {
        fetch(url).then(async (freshResp) => {
          if (freshResp && freshResp.ok) {
            await cache.put(url, freshResp.clone());
            const json = await freshResp.json();
            saveToIDB(url, json);
          }
        }).catch(() => {});
        const parsed = await cachedResp.json();
        saveToIDB(url, parsed);
        return parsed;
      }
      const netResp = await fetch(url);
      if (!netResp.ok) {
        if (isOptional) return {};
        throw new Error(url + " " + netResp.status);
      }
      await cache.put(url, netResp.clone());
      const data = await netResp.json();
      saveToIDB(url, data);
      return data;
    } catch(e) {
      console.warn("CacheStorage fallback to network:", e);
    }
  }
  const r = await fetch(url);
  if (!r.ok) {
    if (isOptional) return {};
    throw new Error(url + " " + r.status);
  }
  const result = await r.json();
  saveToIDB(url, result);
  return result;
}`;

if (code.includes(oldFetchWithCache)) {
  code = code.replace(oldFetchWithCache, newFetchWithCache);
  if (isCRLF) code = code.replace(/\n/g, "\r\n");
  fs.writeFileSync(file, code, "utf8");
  console.log("wordbank.js IndexedDB upgrade applied successfully.");
} else {
  console.log("oldFetchWithCache not found.");
}
