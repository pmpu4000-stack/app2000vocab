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

// 瀏覽器原生 CacheStorage 快取層：首次下載後本機零延遲讀取，大幅降低等待時間
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
}

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

      return bank.map((entry, i) => {
        const display = entry.w;
        const word = display.toLowerCase();
        const feat = FEATURED.get(word);          // hand-verified (mask + zh + sent + cat)
        const m = meanings[display] || meanings[word] || {}; // dictionary meaning + phonetic + sentence
        return {
          id: "w" + i,
          word,
          display,
          level: entry.lv,
          mask: feat ? feat.mask : maskFromTrap(word.length, entry.t),
          featured: !!feat,
          zh: feat ? feat.zh : (m.zh || null),
          sent: feat ? feat.sent : (m.sent || null),
          sentZh: feat ? (feat.sentZh || null) : (m.sentZh || null),
          sentSrc: feat ? "Curated" : (m.sentSrc || null),
          sents: (Array.isArray(m.sents) && m.sents.length > 0) ? m.sents : (m.sent ? [{ level: 'normal', levelName: '普通', sent: m.sent, sentZh: m.sentZh || '', src: m.sentSrc || '' }] : []),
          ph: m.ph || null,
          cat: feat ? feat.cat : null,
        };
      });
    })();
  }
  return _wordBankPromise;
}

export const wordsAtLevel = (words, level) => words.filter((w) => w.level === level);
