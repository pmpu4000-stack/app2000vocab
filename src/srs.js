// =====================================================================
// srs.js — spaced repetition, scoped to one level. Struggling words
// (low Leitner box) come up more often than mastered ones.
// =====================================================================
import { box } from "./store.js";
import { wordsAtLevel } from "./wordbank.js";

const WEIGHT = { 0: 5, 1: 6, 2: 3, 3: 1 };

export function nextWord(words, level, currentId) {
  const pool = wordsAtLevel(words, level);
  const len = pool.length;
  if (!len) return null;
  if (len === 1) return pool[0];

  let totalWeight = 0;
  for (let i = 0; i < len; i++) {
    const w = pool[i];
    if (currentId && w.id === currentId) continue;
    totalWeight += (WEIGHT[box(w.id)] ?? 1);
  }
  if (totalWeight <= 0) return pool[0];

  let r = Math.random() * totalWeight;
  for (let i = 0; i < len; i++) {
    const w = pool[i];
    if (currentId && w.id === currentId) continue;
    r -= (WEIGHT[box(w.id)] ?? 1);
    if (r <= 0) return w;
  }
  return pool[0];
}

