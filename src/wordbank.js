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

// A word object:
//   { id, word (lowercase), display (proper case), level, mask[], featured,
//     zh, sent, ph (phonetic), cat? }
export async function loadWordBank() {
  const [bank, meanings] = await Promise.all([
    fetch("data/words2000.json").then((r) => {
      if (!r.ok) throw new Error("words2000.json " + r.status);
      return r.json();
    }),
    fetch("data/meanings.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
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
      ph: m.ph || null,
      cat: feat ? feat.cat : null,
    };
  });
}

export const wordsAtLevel = (words, level) => words.filter((w) => w.level === level);
