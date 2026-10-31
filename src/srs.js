// =====================================================================
// srs.js — Spaced Repetition System (Leitner 1/3/7 天記憶曲線排程)
// 1. Box 0 (新字): 立即高頻滾出 (權重 8)
// 2. Box 1 (昨日/前次出錯): 1天內急迫複習 (權重 12)
// 3. Box 2 (初掌握): 3天記憶衰退點強化複習 (權重 6)
// 4. Box 3 (精通/長效): 7天長程固化排程抽測 (權重 2)
// 5. 結合最後答錯時間差動態調升逾期複習權重，精準消滅弱項單字！
// =====================================================================
import { box, everWrong, getWordReviewState } from "./store.js";
import { wordsAtLevel } from "./wordbank.js";

// Leitner 箱間隔曲線 (天數): Box 1 -> 1天, Box 2 -> 3天, Box 3 -> 7天
const LEITNER_INTERVAL_DAYS = { 0: 0, 1: 1, 2: 3, 3: 7 };
const BASE_WEIGHT = { 0: 6, 1: 12, 2: 5, 3: 1 };

export function calculateSrsWeight(wordId) {
  const b = box(wordId);
  let wt = BASE_WEIGHT[b] ?? 3;
  const isWrong = everWrong(wordId);
  if (isWrong) wt += 8;

  // 結合時間差計算間隔衰退權重
  if (typeof getWordReviewState === 'function') {
    const rev = getWordReviewState(wordId);
    if (rev && rev.lastTested) {
      const daysSince = (Date.now() - rev.lastTested) / (24 * 60 * 60 * 1000);
      const idealInterval = LEITNER_INTERVAL_DAYS[b] ?? 1;
      if (daysSince >= idealInterval) {
        // 逾期未複習，記憶曲線處於易忘危險期，依逾期天數額外加權
        wt += Math.min(15, Math.floor(daysSince - idealInterval + 1) * 3);
      }
    }
  }
  return wt;
}

export function nextWord(words, level, currentId) {
  const pool = wordsAtLevel(words, level);
  const len = pool.length;
  if (!len) return null;
  if (len === 1) return pool[0];

  let totalWeight = 0;
  for (let i = 0; i < len; i++) {
    const w = pool[i];
    if (currentId && w.id === currentId) continue;
    totalWeight += calculateSrsWeight(w.id);
  }
  if (totalWeight <= 0) return pool[0];

  let r = Math.random() * totalWeight;
  for (let i = 0; i < len; i++) {
    const w = pool[i];
    if (currentId && w.id === currentId) continue;
    const wt = calculateSrsWeight(w.id);
    r -= wt;
    if (r <= 0) return w;
  }
  return pool[0];
}
