// =====================================================================
// srs.js — spaced repetition, scoped to one level. Struggling words
// (low Leitner box) come up more often than mastered ones.
// =====================================================================
import { box } from "./store.js";

const WEIGHT = { 0: 5, 1: 6, 2: 3, 3: 1 };

export function nextWord(words, level, currentId) {
  const pool = words.filter((w) => w.level === level);
  if (!pool.length) return null;

  const bag = [];
  for (const w of pool) {
    if (currentId && w.id === currentId && pool.length > 1) continue; // avoid immediate repeat
    const weight = WEIGHT[box(w.id)] ?? 1;
    for (let k = 0; k < weight; k++) bag.push(w);
  }
  return bag[Math.floor(Math.random() * bag.length)] || pool[0];
}
