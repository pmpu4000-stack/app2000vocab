// =====================================================================
// wordbank.js — loads the graded word bank + the dictionary meanings,
// merges in the curated "featured" data, and produces the master
// WORDS array the app uses.
//
//   data/words2000.json  → { w, t (trap indices), lv }   (grading + mask)
//   data/meanings.json   → word → { zh, ph, sent }        (ECDICT meaning +
//                          phonetic + a grounded example sentence)
//   src/data.js FEATURED → hand-verified 中文 + example + mask (wins)
// =====================================================================
import { FEATURED } from "./data.js";

function maskFromTrap(len, trap) {
  const m = new Array(len).fill(false);
  for (const i of trap) if (i >= 0 && i < len) m[i] = true;
  return m;
}

// 🚀 IndexedDB 高效能單字資料庫：結構化物件存取，免除每次反覆 JSON.parse 運算負擔
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
}

const IPA_OVERRIDE = {
  flu: 'fluː', go: 'ɡoʊ', gold: 'ɡoʊld', hold: 'hoʊld', host: 'hoʊst',
  most: 'moʊst', no: 'noʊ', old: 'oʊld', ski: 'skiː', so: 'soʊ'
};

let _wordBankPromise = null;

// A word object:
//   { id, word (lowercase), display (proper case), level, mask[], featured,
//     zh, sent, ph (phonetic), cat? }
export function loadWordBank() {
  if (!_wordBankPromise) {
    _wordBankPromise = (async () => {
      const [bank, meanings] = await Promise.all([
        fetchWithCache("data/words2000.json"),
        fetchWithCache("data/meanings.json", true)
      ]);

      const byLevel = { 1: [], 2: [], 3: [], 4: [], 5: [] };
      const byWord = new Map();
      const byId = new Map();

      const words = bank.map((entry, i) => {
        const display = entry.w;
        const word = display.toLowerCase();
        const feat = FEATURED.get(word);          // hand-verified (mask + zh + sent + cat)
        const m = meanings[display] || meanings[word] || {}; // dictionary meaning + phonetic + sentence
        const obj = {
          id: "w" + i,
          word,
          display,
          level: entry.lv,
          mask: feat ? feat.mask : maskFromTrap(word.length, entry.t),
          featured: !!feat,
          zh: (m && m.zh) ? m.zh : (feat ? feat.zh : null),
          sent: feat ? feat.sent : (m.sent || null),
          sentZh: feat ? (feat.sentZh || null) : (m.sentZh || null),
          sentSrc: feat ? "Curated" : (m.sentSrc || null),
          sents: (Array.isArray(m.sents) && m.sents.length > 0) ? m.sents : (m.sent ? [{ level: 'normal', levelName: '普通', sent: m.sent, sentZh: m.sentZh || '', src: m.sentSrc || '' }] : []),
          ph: IPA_OVERRIDE[word] || m.ph || null,
          cat: feat ? feat.cat : null,
        };
        if (byLevel[obj.level]) byLevel[obj.level].push(obj);
        byWord.set(word, obj);
        byId.set(obj.id, obj);
        return obj;
      });

      words._byLevel = byLevel;
      words._byWord = byWord;
      words._byId = byId;
      return words;
    })();
  }
  return _wordBankPromise;
}

export const wordsAtLevel = (words, level) =>
  (words && words._byLevel && words._byLevel[level]) || (Array.isArray(words) ? words.filter((w) => w.level === level) : []);

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

