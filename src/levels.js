// =====================================================================
// levels.js — level definitions and pure spelling helpers (no DOM).
// =====================================================================

// 5 levels, easiest → hardest. Colors are used across the level bar & quizzes.
export const LEVELS = [
  { n: 1, name: "入門", en: "Starter",   color: "#2FB47C" },
  { n: 2, name: "基礎", en: "Basic",     color: "#2D9CDB" },
  { n: 3, name: "進階", en: "Rising",    color: "#6C4CE0" },
  { n: 4, name: "挑戰", en: "Challenge", color: "#E8892B" },
  { n: 5, name: "精熟", en: "Master",    color: "#E0567B" },
];
export const levelColor = (n) => (LEVELS[n - 1] || LEVELS[0]).color;
export const levelName = (n) => (LEVELS[n - 1] || LEVELS[0]).name;

export const DAILY_GOAL = 20;         // questions that fill the daily session bar
export const PASS_RATE = 0.8;         // ≥80% to clear a level challenge
export const GATE_MIN_ATTEMPTS = 12;  // practice this many before the gate opens
export const CHALLENGE_LEN = 8;       // questions in a level challenge
export const PLACEMENT_PER_LEVEL = 3; // questions per level in the placement ladder

// Split a "cased" word ("neCeSSary") into { word, mask } where uppercase = trap.
export function parseCased(cased) {
  let word = "";
  const mask = [];
  for (const ch of cased) {
    const low = ch.toLowerCase();
    mask.push(ch !== low && ch >= "A" && ch <= "Z");
    word += low;
  }
  return { word, mask };
}

// Fisher–Yates shuffle (returns a new array).
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick `n` items at random.
export function sample(arr, n) {
  return shuffle(arr).slice(0, n);
}

const VOWELS = "aeiou";

// Generate up to `n` plausible misspellings of a word (distractors for pick-the-spelling).
export function misspellings(word, n = 3) {
  const cands = new Set();
  const add = (s) => { if (s && s !== word && /^[a-z][a-z' -]*$/.test(s)) cands.add(s); };

  const dbl = word.match(/([a-z])\1/);            // singleize a double letter
  if (dbl) { const i = word.indexOf(dbl[0]); add(word.slice(0, i) + word.slice(i + 1)); }

  for (let i = 1; i < word.length - 1; i++) {     // double a consonant between vowels
    if (!VOWELS.includes(word[i]) && VOWELS.includes(word[i - 1]) && VOWELS.includes(word[i + 1])) {
      add(word.slice(0, i + 1) + word[i] + word.slice(i + 1));
      break;
    }
  }
  for (let i = 0; i < word.length; i++) {         // swap one vowel for another
    if (VOWELS.includes(word[i])) for (const v of VOWELS) if (v !== word[i]) add(word.slice(0, i) + v + word.slice(i + 1));
  }
  add(word.replace("ie", "ei"));                  // the classic ie/ei flip
  add(word.replace("ei", "ie"));
  for (let i = 0; i < word.length - 1; i++) {      // swap two adjacent letters
    if (word[i] !== word[i + 1] && word[i] !== " " && word[i + 1] !== " ") {
      add(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2));
    }
  }
  for (let i = 1; i < word.length; i++) if (word[i] !== " ") add(word.slice(0, i) + word.slice(i + 1)); // drop a letter

  // Prefer distractors close in length to the real word (harder to eyeball).
  const pool = [...cands].sort((a, b) => Math.abs(a.length - word.length) - Math.abs(b.length - word.length))
    .slice(0, Math.max(6, n * 3));

  const picked = [];
  while (picked.length < n && pool.length) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  let k = 0;
  while (picked.length < n) picked.push(word + "e".repeat(++k)); // last-resort padding
  return picked.slice(0, n);
}
