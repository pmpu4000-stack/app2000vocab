// =====================================================================
// srs.js — spaced repetition, scoped to one level. Struggling words
// (low Leitner box & ever-wrong/conquer words) come up more often than mastered ones.
// =====================================================================
import { box, everWrong } from "./store.js";
import { wordsAtLevel } from "./wordbank.js";

// 基準權重：Box 0 (新字)=5, Box 1 (學習中)=8, Box 2 (練習中)=3, Box 3 (精通)=1
const BASE_WEIGHT = { 0: 5, 1: 8, 2: 3, 3: 1 };

export function nextWord(words, level, currentId) {
  const pool = wordsAtLevel(words, level);
  const len = pool.length;
  if (!len) return null;
  if (len === 1) return pool[0];

  let totalWeight = 0;
  for (let i = 0; i < len; i++) {
    const w = pool[i];
    if (currentId && w.id === currentId) continue;
    let wt = BASE_WEIGHT[box(w.id)] ?? 2;
    // 若該單字曾答錯過 (everWrong)，出題權重額外翻倍 (+6)，確保滾入自由練習優先被複習強化
    if (everWrong(w.id)) wt += 6;
    totalWeight += wt;
  }
  if (totalWeight <= 0) return pool[0];

  let r = Math.random() * totalWeight;
  for (let i = 0; i < len; i++) {
    const w = pool[i];
    if (currentId && w.id === currentId) continue;
    let wt = BASE_WEIGHT[box(w.id)] ?? 2;
    if (everWrong(w.id)) wt += 6;
    r -= wt;
    if (r <= 0) return w;
  }
  return pool[0];
}

