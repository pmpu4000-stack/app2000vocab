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

// 2055 單字關卡等級對應表 (Index 0 ~ 2054)
export const WORD_LEVELS = "145453333454155534514335334335341133115444533351433335435355533413333435311355554453321433451345513313541453145335314415114524411431155335112412112153431411133553342331235425125141424224322221121313114433142134411411222242232244222341241312155531454114551152141313333141115534441141224551354534225245222222252534244413455224442351355552223532234231221441314435315345454445545455554445551313134142324342233131232552324215511544235113343514511111125535541133554553434314351455115555155455353554515543413512443113525144433531323424314112134331313124113311541354333555413555314543543435553344513553345553355335535333554431115112245135113515513532515111445314333213511331521514115532235121314411415155335113334141214442324425411221214551134314355335551321141342111111311352521555423123222213443341113154125154153413441351411142412133354141113141113512141411514135155453115251143125515133335433134141153131555554155143455551333445555555555353533413133153525211111512231151514111255151424143333533313131144521433431313131222113134144351111135143111131434451313411131141323415351413133153431213344513312145121114415531435534333354531541133343413353334215511451355542215351113351131134555551351413554351135511514152315414123131121115433513214333511443111311133355133531151443355513114114241531323333154243352224421125221353444335134323512133415224222324422442442322355345222154552555541423342254455422525552452544545444424332434342214425222224234424432213223244353555153353553233354525444442223223213233552222221122331212424335224245542142252544221424245455122444435252555424135552322221222222225222242242212253354445424244214114324135242124422223233222242431244553355422455512254222225252442232442222222222245522222344522422452434252222243434444524342414435442245542422242445524524253522231245242555354142255242252142225225222222224442244422423444313323133123135445251224413324332122554252254422422442242213124442424212435335555555455314344114355545254325345435525222452234212222355211224452444432132222423213212223124324422241235522224422423343223415112224524331";

export function getWordLevel(wKey) {
  if (!wKey) return 1;
  const m = String(wKey).trim().match(/^w?(\d+)$/i);
  if (m) {
    const idx = parseInt(m[1], 10);
    if (idx >= 0 && idx < WORD_LEVELS.length) {
      return parseInt(WORD_LEVELS.charAt(idx), 10) || 1;
    }
  }
  return 1;
}

// 各等級精通自動升級門檻字數（約達 80% 即平滑自動晉級，免挑戰測驗）
export const AUTO_PROMOTE_THRESHOLDS = {
  1: 200,
  2: 300,
  3: 400,
  4: 450
};

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
