// =====================================================================
// ui_conquer.js — 待攻克單字 (Conquer) 與單字卡渲染獨立模組
// =====================================================================
import { say, sayWord, parseDialogue } from "./audio.js";
import { levelColor, levelName } from "./levels.js";
import { escapeHtml } from "./wordbank.js";
import { getBiweeklyCycleInfo, getCachedTaskHistory, getConquerRollSettings, getRemedyLearnedSet } from "./store.js";

if (typeof window !== "undefined") {
  window.__saySentence = (s) => {
    if (!s) return;
    say(s, 0.85, null, true);
  };
  window.__sayWord = (w) => sayWord(w);
  window.__playPhonicsKaraoke = (word, elemId) => {
    if (!word) return;
    const container = document.getElementById(elemId);
    if (!container) {
      sayWord(word);
      return;
    }
    const chunks = Array.from(container.querySelectorAll(".syllable-chunk"));
    if (chunks.length === 0) {
      sayWord(word);
      return;
    }

    let activeTimers = [];
    const clearKaraokeTimers = () => {
      activeTimers.forEach(t => clearTimeout(t));
      activeTimers = [];
    };

    const cleanup = () => {
      clearKaraokeTimers();
      chunks.forEach(c => c.classList.remove("karaoke-active"));
    };

    if (chunks.length === 1) {
      sayWord(word, 0.85, cleanup, null, 2, (passNum, rate) => {
        clearKaraokeTimers();
        chunks[0].classList.add("karaoke-active");
        const dur = (rate === 0.7) ? 800 : 650;
        const t = setTimeout(() => chunks[0].classList.remove("karaoke-active"), dur);
        activeTimers.push(t);
      });
      return;
    }

    let charOffset = 0;
    const chunkRanges = chunks.map((c) => {
      const text = c.textContent || "";
      const start = charOffset;
      const end = charOffset + text.length;
      charOffset = end;
      return { element: c, start, end, len: text.length };
    });
    const totalChars = Math.max(1, charOffset);

    let currentActiveIdx = -1;
    const activateChunk = (idx) => {
      if (idx === currentActiveIdx) return;
      chunks.forEach((c, i) => {
        if (i === idx) {
          c.classList.add("karaoke-active");
        } else {
          c.classList.remove("karaoke-active");
        }
      });
      currentActiveIdx = idx;
    };

    const chunkTexts = chunks.map(c => c.textContent || "");

    const onPassStart = (passNum, rate, syllableIdx = 0) => {
      clearKaraokeTimers();

      if (passNum === 2) {
        // 第二次播放：依照音節單獨朗讀與逐一高亮
        activateChunk(syllableIdx);
        return;
      }

      // 第一次播放：全字連續朗讀，依音節長度比例平滑推進
      currentActiveIdx = -1;
      activateChunk(0);

      const estimatedTotalMs = 750;
      let accumTime = 0;
      chunkRanges.forEach((r, idx) => {
        if (idx === 0) {
          accumTime += Math.max(200, (r.len / totalChars) * estimatedTotalMs);
          return;
        }
        const scheduleAt = accumTime;
        accumTime += Math.max(200, (r.len / totalChars) * estimatedTotalMs);
        const t = setTimeout(() => {
          activateChunk(idx);
        }, scheduleAt);
        activeTimers.push(t);
      });

      const endTimer = setTimeout(() => {
        chunks.forEach(c => c.classList.remove("karaoke-active"));
      }, estimatedTotalMs + 100);
      activeTimers.push(endTimer);
    };

    sayWord(word, 0.85, cleanup, (evt) => {
      const charIndex = (evt && typeof evt.charIndex === "number") ? evt.charIndex : -1;
      if (charIndex > 0) {
        const targetIdx = chunkRanges.findIndex(r => charIndex >= r.start && charIndex < r.end);
        if (targetIdx !== -1) {
          activateChunk(targetIdx);
        }
      }
    }, 2, onPassStart, chunkTexts);
  };
  window.__toggleConquerRecall = (cardId) => {
    const card = document.getElementById(cardId);
    if (!card) return;
    card.classList.toggle("recall-mode");
  };
}

// 劍橋辭典 (Cambridge Dictionary)、韋氏辭典 (Merriam-Webster) 與牛津辭典 (Oxford) 權威音節常規對齊表
const CAMBRIDGE_SYLLABLES = {
  highway: ["high", "way"],
  able: ["a", "ble"],
  abroad: ["a", "broad"],
  across: ["a", "cross"],
  agree: ["a", "gree"],
  angel: ["an", "gel"],
  anger: ["an", "ger"],
  anyone: ["an", "y", "one"],
  anything: ["an", "y", "thing"],
  anywhere: ["an", "y", "where"],
  apologize: ["a", "pol", "o", "gize"],
  appreciate: ["ap", "pre", "ci", "ate"],
  april: ["A", "pril"],
  area: ["ar", "e", "a"],
  asleep: ["a", "sleep"],
  available: ["a", "vail", "a", "ble"],
  backpack: ["back", "pack"],
  backward: ["back", "ward"],
  bakery: ["bak", "er", "y"],
  beginning: ["be", "gin", "ning"],
  between: ["be", "tween"],
  beyond: ["be", "yond"],
  bicycle: ["bi", "cy", "cle"],
  biology: ["bi", "ol", "o", "gy"],
  birthday: ["birth", "day"],
  body: ["bod", "y"],
  bother: ["both", "er"],
  brother: ["broth", "er"],
  bucket: ["buck", "et"],
  business: ["busi", "ness"],
  businessman: ["busi", "ness", "man"],
  busy: ["bus", "y"],
  butterfly: ["but", "ter", "fly"],
  cable: ["ca", "ble"],
  cafeteria: ["caf", "e", "te", "ri", "a"],
  calendar: ["cal", "en", "dar"],
  camera: ["cam", "er", "a"],
  celebrate: ["cel", "e", "brate"],
  cereal: ["ce", "re", "al"],
  character: ["char", "ac", "ter"],
  chemistry: ["chem", "is", "try"],
  chicken: ["chick", "en"],
  childhood: ["child", "hood"],
  childish: ["child", "ish"],
  childlike: ["child", "like"],
  christmas: ["Christ", "mas"],
  city: ["cit", "y"],
  clever: ["clev", "er"],
  closet: ["clos", "et"],
  cockroach: ["cock", "roach"],
  color: ["col", "or"],
  colorful: ["col", "or", "ful"],
  comic: ["com", "ic"],
  congratulation: ["con", "grat", "u", "la", "tion"],
  consider: ["con", "sid", "er"],
  considerate: ["con", "sid", "er", "ate"],
  copy: ["cop", "y"],
  couple: ["cou", "ple"],
  courage: ["cour", "age"],
  cousin: ["cous", "in"],
  cover: ["cov", "er"],
  crayon: ["cray", "on"],
  create: ["cre", "ate"],
  cruel: ["cru", "el"],
  customer: ["cus", "tom", "er"],
  factory: ["fac", "to", "ry"],
  history: ["his", "to", "ry"],
  memory: ["mem", "o", "ry"],
  table: ["ta", "ble"],
  people: ["peo", "ple"],
  restaurant: ["res", "tau", "rant"],
  umbrella: ["um", "brel", "la"],
  yesterday: ["yes", "ter", "day"],
  tomorrow: ["to", "mor", "row"],
  computer: ["com", "pu", "ter"],
  hospital: ["hos", "pi", "tal"],
  beautiful: ["beau", "ti", "ful"],
  important: ["im", "por", "tant"],
  different: ["dif", "fer", "ent"],
  together: ["to", "geth", "er"],
  remember: ["re", "mem", "ber"],
  understand: ["un", "der", "stand"],
  afternoon: ["af", "ter", "noon"],
  evening: ["eve", "ning"],
  morning: ["morn", "ing"],
  breakfast: ["break", "fast"],
  supermarket: ["su", "per", "mar", "ket"],
  vegetable: ["veg", "e", "ta", "ble"],
  chocolate: ["choc", "o", "late"],
  favorite: ["fa", "vor", "ite"],
  interesting: ["in", "ter", "est", "ing"],
  difficult: ["dif", "fi", "cult"],
  comfortable: ["com", "fort", "a", "ble"],
  information: ["in", "for", "ma", "tion"],
  exercise: ["ex", "er", "cise"],
  basketball: ["bas", "ket", "ball"],
  badminton: ["bad", "min", "ton"],
  dinosaur: ["di", "no", "saur"],
  telephone: ["tel", "e", "phone"],
  dictionary: ["dic", "tion", "ar", "y"],
  library: ["li", "brar", "y"],
  elementary: ["el", "e", "men", "ta", "ry"],
  helicopter: ["hel", "i", "cop", "ter"],
  refrigerator: ["re", "frig", "er", "a", "tor"],
  hamburger: ["ham", "bur", "ger"],
  sandwich: ["sand", "wich"],
  spaghetti: ["spa", "ghet", "ti"],
  strawberry: ["straw", "ber", "ry"],
  watermelon: ["wa", "ter", "mel", "on"],
  airplane: ["air", "plane"],
  airline: ["air", "line"],
  airport: ["air", "port"],
  baseball: ["base", "ball"],
  bathroom: ["bath", "room"],
  bedroom: ["bed", "room"],
  blackboard: ["black", "board"],
  bookcase: ["book", "case"],
  bookstore: ["book", "store"],
  classmate: ["class", "mate"],
  classroom: ["class", "room"],
  countryside: ["coun", "try", "side"],
  earthquake: ["earth", "quake"],
  everyone: ["ev", "ery", "one"],
  everything: ["ev", "ery", "thing"],
  everywhere: ["ev", "ery", "where"],
  firefighter: ["fire", "fight", "er"],
  football: ["foot", "ball"],
  gentleman: ["gen", "tle", "man"],
  granddaughter: ["grand", "daugh", "ter"],
  grandfather: ["grand", "fa", "ther"],
  grandmother: ["grand", "moth", "er"],
  grandson: ["grand", "son"],
  handkerchief: ["hand", "ker", "chief"],
  headache: ["head", "ache"],
  motorcycle: ["mo", "tor", "cy", "cle"],
  newspaper: ["news", "pa", "per"],
  nobody: ["no", "bod", "y"],
  notebook: ["note", "book"],
  outside: ["out", "side"],
  playground: ["play", "ground"],
  policeman: ["po", "lice", "man"],
  postman: ["post", "man"],
  railway: ["rail", "way"],
  rainbow: ["rain", "bow"],
  salesman: ["sales", "man"],
  seafood: ["sea", "food"],
  seashell: ["sea", "shell"],
  seashore: ["sea", "shore"],
  sidewalk: ["side", "walk"],
  skateboard: ["skate", "board"],
  snowman: ["snow", "man"],
  someone: ["some", "one"],
  something: ["some", "thing"],
  sometimes: ["some", "times"],
  somewhere: ["some", "where"],
  sunflower: ["sun", "flow", "er"],
  sunglasses: ["sun", "glas", "ses"],
  sunlight: ["sun", "light"],
  tablecloth: ["ta", "ble", "cloth"],
  teammate: ["team", "mate"],
  toothbrush: ["tooth", "brush"],
  toothpaste: ["tooth", "paste"],
  volleyball: ["vol", "ley", "ball"],
  wheelchair: ["wheel", "chair"],
  windsurfing: ["wind", "surf", "ing"],
  besides: ["be", "sides"],
  surprised: ["sur", "prised"],
  married: ["mar", "ried"],
  succeed: ["suc", "ceed"]
};

// 三大字典公認單音節字（Silent 'e' 或不獨立成音節之詞尾）
const DICT_MONOSYLLABLES = new Set([
  "glove", "love", "give", "live", "have", "make", "take", "time", "like", "home",
  "hope", "life", "line", "name", "nice", "nose", "page", "plane", "ride", "safe",
  "same", "save", "side", "size", "smoke", "tape", "use", "wave", "white", "wife",
  "write", "file", "hole", "male", "mile", "pale", "pile", "role", "rule", "sale",
  "smile", "style", "whale", "while", "whole", "bored", "pleased", "scared", "tired",
  "clothes", "fries"
]);

export function splitIntoPhonicsChunks(word) {
  if (!word || typeof word !== "string") return [word || ""];
  const clean = word.trim();
  if (clean.length <= 3 || clean.includes(" ") || clean.includes("-")) return [clean];

  const lower = clean.toLowerCase();
  if (DICT_MONOSYLLABLES.has(lower)) {
    return [clean];
  }
  if (CAMBRIDGE_SYLLABLES[lower]) {
    // 依原字大小寫還原音節
    const ref = CAMBRIDGE_SYLLABLES[lower];
    let offset = 0;
    return ref.map(part => {
      const seg = clean.slice(offset, offset + part.length);
      offset += part.length;
      return seg || part;
    });
  }

  const prefixes = ["re", "un", "dis", "mis", "pre", "pro", "sub", "in", "im", "non", "anti", "auto", "de", "ex", "en", "em"];
  const suffixes = ["ing", "tion", "sion", "ment", "ness", "ful", "less", "able", "ible", "ous", "tive", "ture", "ize", "ly", "est", "ist", "ory", "ary"];

  const syllables = [];
  let w = clean;
  let prefixPart = "";
  let suffixPart = "";

  for (const p of prefixes) {
    if (lower.startsWith(p) && lower.length > p.length + 2) {
      prefixPart = clean.slice(0, p.length);
      w = clean.slice(p.length);
      break;
    }
  }

  const wLower = w.toLowerCase();
  for (const s of suffixes) {
    if (wLower.endsWith(s) && wLower.length > s.length + 2) {
      suffixPart = w.slice(w.length - s.length);
      w = w.slice(0, w.length - s.length);
      break;
    }
  }

  const vowelGroupRegex = /([aeiouy]+)/gi;
  const parts = [];
  let match;
  let vowels = [];
  while ((match = vowelGroupRegex.exec(w)) !== null) {
    vowels.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }

  // 處理英語發音關鍵規則：字尾不發音的 silent 'e'（如 make, time, plane, line, home, like, cute 等不是獨立音節，le 除外）
  if (vowels.length > 1 && w.toLowerCase().endsWith('e') && !w.toLowerCase().endsWith('le') && !w.toLowerCase().endsWith('ee')) {
    const lastV = vowels[vowels.length - 1];
    if (lastV.text.toLowerCase() === 'e' && lastV.end === w.length) {
      vowels.pop();
    }
  }

  if (vowels.length <= 1) {
    parts.push(w);
  } else {
    let splitPoints = [];
    for (let i = 0; i < vowels.length - 1; i++) {
      const v1End = vowels[i].end;
      const v2Start = vowels[i + 1].start;
      const consonantCount = v2Start - v1End;

      if (consonantCount <= 0) {
        splitPoints.push(v1End);
      } else if (consonantCount === 1) {
        splitPoints.push(v1End);
      } else if (consonantCount === 2) {
        const dig = w.slice(v1End, v1End + 2).toLowerCase();
        const digraphs = ["th", "sh", "ch", "ph", "wh", "ck", "ng", "qu"];
        if (digraphs.includes(dig)) {
          splitPoints.push(v1End);
        } else {
          splitPoints.push(v1End + 1);
        }
      } else {
        splitPoints.push(v1End + Math.floor(consonantCount / 2));
      }
    }

    let prev = 0;
    for (const pt of splitPoints) {
      if (pt > prev && pt < w.length) {
        parts.push(w.slice(prev, pt));
        prev = pt;
      }
    }
    if (prev < w.length) parts.push(w.slice(prev));
  }

  const result = [];
  if (prefixPart) result.push(prefixPart);
  result.push(...parts.filter(Boolean));
  if (suffixPart) result.push(suffixPart);

  return result.length > 0 ? result : [clean];
}

const SVG_SPEAKER = '<svg class="icon-speaker" viewBox="0 0 24 24" width="17" height="17" fill="currentColor" style="vertical-align:middle;display:inline-block;"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';

let _lastSummaryWords = null;
export function setConquerWordsRef(words) {
  if (words) _lastSummaryWords = words;
}

export function getWeekPendingConquerWords(cycleParam = "current") {
  const unfinishedWords = new Set();
  const learnedWords = new Set();
  const cycleInfo = getBiweeklyCycleInfo();

  let scanStartStr, scanEndStr;
  if (typeof cycleParam === "string" && cycleParam.startsWith("week_")) {
    const targetW = parseInt(cycleParam.replace("week_", ""), 10) || 1;
    const curW = cycleInfo.semesterWeek || 1;
    const diffW = targetW - curW;
    const dNow = new Date();
    const day = dNow.getDay();
    const diffToMon = dNow.getDate() - day + (day === 0 ? -6 : 1);
    const targetMon = new Date(dNow.getFullYear(), dNow.getMonth(), diffToMon + diffW * 7);
    const targetFri = new Date(dNow.getFullYear(), dNow.getMonth(), diffToMon + diffW * 7 + 4);
    const prevWeekMon = new Date(dNow.getFullYear(), dNow.getMonth(), diffToMon + (diffW - 1) * 7);
    const formatD = (dt) => dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
    scanStartStr = (targetW % 2 === 0) ? formatD(prevWeekMon) : formatD(targetMon);
    scanEndStr = formatD(targetFri);
  } else if (cycleParam === "previous" || cycleParam === "prevWeek") {
    scanStartStr = cycleInfo.prevWeek.monday;
    scanEndStr = cycleInfo.prevWeek.friday;
  } else if (cycleParam === "nextWeek") {
    const dNow = new Date();
    const day = dNow.getDay();
    const diffToMon = dNow.getDate() - day + (day === 0 ? -6 : 1);
    const nextMon = new Date(dNow.getFullYear(), dNow.getMonth(), diffToMon + 7);
    const nextFri = new Date(dNow.getFullYear(), dNow.getMonth(), diffToMon + 11);
    const formatD = (dt) => dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
    scanStartStr = formatD(nextMon);
    scanEndStr = formatD(nextFri);
  } else if (cycleParam === "prevBiweekly") {
    const dNow = new Date();
    const day = dNow.getDay();
    const diffToMon = dNow.getDate() - day + (day === 0 ? -6 : 1);
    const twoWeeksAgoMon = new Date(dNow.getFullYear(), dNow.getMonth(), diffToMon - 14);
    const lastWeekFri = new Date(dNow.getFullYear(), dNow.getMonth(), diffToMon - 3);
    const formatD = (dt) => dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
    scanStartStr = formatD(twoWeeksAgoMon);
    scanEndStr = formatD(lastWeekFri);
  } else {
    scanStartStr = cycleInfo.scanStartStr;
    scanEndStr = cycleInfo.scanEndStr;
  }

  const normalizeCleanWord = (w) => {
    if (!w) return "";
    return String(w).replace(/\(.*?\)/g, "").trim().toLowerCase();
  };

  const conquerSettings = getConquerRollSettings();
  try {
    const historyList = getCachedTaskHistory();
    if (Array.isArray(historyList)) {
      historyList.forEach(item => {
        if (!item || !item.date) return;
        const iDate = String(item.date).trim().split(" ")[0].replace(/\//g, "-");
        if (iDate >= scanStartStr && iDate <= scanEndStr) {
          const tName = String(item.taskName || "").trim();
          if (tName === "自主練習" || tName.includes("自由練習")) {
            if (!conquerSettings.rollFreeMistakes) return;
          }

          const correctSet = new Set();
          if (Array.isArray(item.correctWords)) {
            item.correctWords.forEach(w => {
              const cw = normalizeCleanWord(w);
              if (cw) correctSet.add(cw);
            });
          }

          if (Array.isArray(item.wrongWords)) {
            const isFreeTask = (tName === "自主練習" || tName.includes("自由練習"));
            const shouldRoll = isFreeTask ? conquerSettings.rollFreeMistakes === true : (conquerSettings.rollTaskMistakes !== false);
            if (shouldRoll) {
              item.wrongWords.forEach(w => {
                const cw = normalizeCleanWord(w);
                if (cw && !correctSet.has(cw)) unfinishedWords.add(cw);
              });
            }
          }

          const status = String(item.status || "");
          const score = String(item.score || "");
          const isTotallyUntested = status.includes("未受測") || status.includes("缺席") || status.includes("缺考") || score === "—" || score === "尚未開始";

          if (Array.isArray(item.words)) {
            if (isTotallyUntested && correctSet.size === 0 && (!item.wrongWords || item.wrongWords.length === 0)) {
              item.words.forEach(w => {
                const cw = normalizeCleanWord(w);
                if (cw) unfinishedWords.add(cw);
              });
            } else if (!isTotallyUntested) {
              const wrongSet = new Set((item.wrongWords || []).map(normalizeCleanWord));
              item.words.forEach(w => {
                const cw = normalizeCleanWord(w);
                if (cw && !correctSet.has(cw) && !wrongSet.has(cw)) {
                  unfinishedWords.add(cw);
                }
              });
            }
          }
        }
      });
    }
  } catch(_) {}

  try {
    const rawMistakes = conquerSettings.rollTaskMistakes === false ? null : localStorage.getItem("weekTaskMistakes");
    if (rawMistakes) {
      const map = JSON.parse(rawMistakes);
      for (const dateKey in map) {
        if (dateKey >= scanStartStr && dateKey <= scanEndStr && Array.isArray(map[dateKey])) {
          map[dateKey].forEach(w => {
            const cw = normalizeCleanWord(w);
            if (cw) unfinishedWords.add(cw);
          });
        }
      }
    }
  } catch(_) {}

  try {
    const rawTodayTask = localStorage.getItem("today_task_result");
    if (rawTodayTask) {
      const todayRes = JSON.parse(rawTodayTask);
      const _tn = new Date();
      const _todayStr = _tn.getFullYear() + "-" + String(_tn.getMonth() + 1).padStart(2, "0") + "-" + String(_tn.getDate()).padStart(2, "0");
      if (conquerSettings.rollTaskMistakes !== false && _todayStr >= scanStartStr && _todayStr <= scanEndStr && todayRes && Array.isArray(todayRes.wrongWords)) {
        todayRes.wrongWords.forEach(w => {
          const cw = normalizeCleanWord(w);
          if (cw) unfinishedWords.add(cw);
        });
      }
    }
  } catch(_) {}

  try {
    const storeLearned = getRemedyLearnedSet();
    storeLearned.forEach(cw => learnedWords.add(cw));
  } catch(_) {}

  return Array.from(unfinishedWords).filter(w => !learnedWords.has(w)).sort();
}

export function _resolveConquerWordLevel(wordStr, d) {
  const clean = String(wordStr || "").trim().toLowerCase();
  if (!clean) return 1;
  const wordsRef = (d && d.words) ? d.words : _lastSummaryWords;
  if (wordsRef) {
    if (wordsRef._byWord && wordsRef._byWord.has(clean)) {
      return wordsRef._byWord.get(clean).level || 1;
    }
    if (Array.isArray(wordsRef)) {
      const found = wordsRef.find(x => x && x.word === clean);
      if (found && found.level) return found.level;
    }
  }
  if (typeof window !== "undefined") {
    if (window.__WORDS && window.__WORDS._byWord && window.__WORDS._byWord.has(clean)) {
      return window.__WORDS._byWord.get(clean).level || 1;
    }
    if (Array.isArray(window.__WORDS)) {
      const found = window.__WORDS.find(x => x && x.word === clean);
      if (found && found.level) return found.level;
    }
    if (!window._wordBankLevelMap && Array.isArray(window.WORD_BANK_2000)) {
      window._wordBankLevelMap = new Map();
      for (let i = 0; i < window.WORD_BANK_2000.length; i++) {
        window._wordBankLevelMap.set(String(window.WORD_BANK_2000[i][0]).toLowerCase(), window.WORD_BANK_2000[i][2]);
      }
    }
    if (window._wordBankLevelMap && window._wordBankLevelMap.has(clean)) {
      return window._wordBankLevelMap.get(clean) || 1;
    }
  }
  return 1;
}

let _activeConquerCycle = "current";
let _activeConquerLevelFilter = "all";
const _conquerActiveWordByLevel = { 1: null, 2: null, 3: null, 4: null, 5: null };
const _conquerViewModeByLevel = { 1: "single", 2: "single", 3: "single", 4: "single", 5: "single" };

export function _renderConquerWordCard(wordStr, d) {
  const clean = String(wordStr || "").trim().toLowerCase();
  const wordsRef = (d && d.words) ? d.words : (_lastSummaryWords || (typeof window !== "undefined" ? window.__WORDS : null));
  let obj = null;
  if (wordsRef) {
    if (wordsRef._byWord && wordsRef._byWord.has(clean)) {
      obj = wordsRef._byWord.get(clean);
    } else if (Array.isArray(wordsRef)) {
      obj = wordsRef.find(x => x && (x.word === clean || (x.display && x.display.toLowerCase() === clean)));
    }
  }
  if (!obj) {
    obj = {
      word: clean,
      display: clean.charAt(0).toUpperCase() + clean.slice(1),
      zh: "a. 能夠的",
      sents: [
        { level: "simple", levelName: "簡單", sent: "I'm able to swim.", sentZh: "我會游泳。" }
      ]
    };
  }

  const posMap = {
    n: "名詞", v: "動詞", vt: "及物動詞", vi: "不及物動詞",
    adj: "形容詞", a: "形容詞", adv: "副詞", ad: "副詞",
    prep: "介系詞", conj: "連接詞", pron: "代名詞",
    interj: "感嘆詞", int: "感嘆詞", art: "冠詞", num: "數詞",
    phr: "片語", aux: "助動詞"
  };
  let posList = [];
  let defText = "";
  const rawZh = obj.zh || "";
  if (rawZh) {
    const parts = rawZh.split('；');
    const transList = [];
    for (const part of parts) {
      const trimmed = part.trim();
      const m = trimmed.match(/^([a-zA-Z\.\s\/]+?)[\s\.\．]+(.*)$/);
      if (m) {
        const posStr = m[1].trim();
        const defStr = m[2].trim();
        if (defStr && !transList.includes(defStr)) transList.push(defStr);
        const tags = posStr.split(/[\/\s]+/).map(p => p.replace(/\./g, "").trim()).filter(Boolean);
        tags.forEach(t => {
          const zhPos = posMap[t.toLowerCase()] || t;
          if (!posList.includes(zhPos)) posList.push(zhPos);
        });
      } else {
        if (trimmed && !transList.includes(trimmed)) transList.push(trimmed);
      }
    }
    defText = transList.join("；");
  }
  if (obj.pos && posList.length === 0) {
    const p = posMap[String(obj.pos).toLowerCase().replace(/\./g, "")] || obj.pos;
    posList.push(p);
  }

  const cleanPh = String(obj.ph || obj.ipa || "").replace(/^[\/\[\s]+|[\/\]\s]+$/g, "");
  const phonHtml = cleanPh ? `<span class="phon">/${cleanPh}/</span>` : "";

  const wordDisplay = obj.display || obj.word || clean;
  const posHtml = posList.length > 0 ? `<span class="zh-pos">${posList.join(" · ")}</span>` : "";
  const defHtml = defText ? `<b class="zh-def">${defText}</b>` : "";

  let sentsList = (Array.isArray(obj.sents) && obj.sents.length > 0)
    ? [...obj.sents]
    : (obj.sent ? [{ level: "simple", levelName: "簡單", sent: obj.sent, sentZh: obj.sentZh || "" }] : []);

  if (sentsList.length === 0) {
    sentsList = [
      { level: "simple", levelName: "簡單", sent: "Practice using \"" + wordDisplay + "\" in daily communication.", sentZh: "在日常溝通中練習使用「" + wordDisplay + "」。" }
    ];
  }

  const levelOrder = { simple: 1, normal: 2, advanced: 3, dialogue: 4 };
  sentsList.sort((a, b) => (levelOrder[a.level] || 9) - (levelOrder[b.level] || 9));

  let wordLevel = (obj && obj.level) ? obj.level : 1;
  if (typeof window !== "undefined" && window.__WORDS && window.__WORDS._byWord) {
    const wObj = window.__WORDS._byWord.get(clean);
    if (wObj && wObj.level) wordLevel = wObj.level;
  }
  const lv = Number(wordLevel) || 1;
  const targetLevel = (lv >= 4) ? 'advanced' : (lv === 3) ? 'normal' : 'simple';
  let defaultIdx = sentsList.findIndex(s => s.level === targetLevel);
  if (defaultIdx === -1) {
    if (targetLevel === 'advanced') {
      defaultIdx = sentsList.findIndex(s => s.level === 'normal');
      if (defaultIdx === -1) defaultIdx = sentsList.findIndex(s => s.level === 'simple');
    } else if (targetLevel === 'normal') {
      defaultIdx = sentsList.findIndex(s => s.level === 'simple');
      if (defaultIdx === -1) defaultIdx = sentsList.findIndex(s => s.level === 'advanced');
    } else {
      defaultIdx = sentsList.findIndex(s => s.level === 'normal');
      if (defaultIdx === -1) defaultIdx = sentsList.findIndex(s => s.level === 'advanced');
    }
  }
  if (defaultIdx === -1) defaultIdx = 0;

  const escapedWord = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp("\\b(" + escapedWord + ")\\b", "gi");

  const s = sentsList[defaultIdx];
  const isDlg = Boolean(parseDialogue(s.sent) || s.level === 'dialogue');
  const levelCls = s.level === 'simple' ? 'level-simple' : s.level === 'advanced' ? 'level-advanced' : isDlg ? 'level-dialogue' : 'level-normal';
  const levelText = escapeHtml(s.levelName || (isDlg ? '對話' : s.level === 'simple' ? '簡單' : s.level === 'advanced' ? '進階' : '普通'));
  const safeSentAttr = escapeHtml(s.sent || "");
  const highlightedSent = escapeHtml(s.sent || "").replace(regex, `<b class="conquer-sent-word task-title-free" style="font-weight:800;">$1</b>`);

  const sentsHtml = `
    <div class="sent-row conquer-sent-variant" data-idx="${defaultIdx}" data-sent="${safeSentAttr}" onclick="event.stopPropagation(); if (typeof window.__saySentence === 'function') window.__saySentence(this.getAttribute('data-sent'));" style="cursor:pointer; display:flex;">
      <button type="button" class="sent-speaker-btn ${levelCls}" data-sent="${safeSentAttr}" onclick="event.stopPropagation(); if (typeof window.__saySentence === 'function') window.__saySentence(this.getAttribute('data-sent'));" aria-label="${levelText}例句朗讀" title="${levelText}例句朗讀">${SVG_SPEAKER}</button>
      <div class="sent-text-wrap" data-sent="${safeSentAttr}">
        <div class="sent-en">${highlightedSent}</div>
        ${s.sentZh ? `<div class="sent-zh">${escapeHtml(s.sentZh)}</div>` : ""}
      </div>
    </div>
  `;

  const cardId = "cq-card-" + clean.replace(/[^a-zA-Z0-9_-]/g, "_") + "-" + Math.floor(Math.random() * 10000);
  const chunks = splitIntoPhonicsChunks(wordDisplay);
  const phonicsChunksHtml = chunks.map((chk, i) => {
    return `<span class="syllable-chunk" data-chunk="${escapeHtml(chk)}" title="點擊聆聽整字發音" onclick="event.stopPropagation(); if (typeof window.__playPhonicsKaraoke === 'function') window.__playPhonicsKaraoke('${escapeHtml(clean)}', '${cardId}'); else if (typeof window.__sayWord === 'function') window.__sayWord('${escapeHtml(clean)}');">${escapeHtml(chk)}</span>`;
  }).join('<span class="syllable-dot" aria-hidden="true">·</span>');

  const clozeChunksHtml = chunks.map((chk, i) => {
    if (i === 0 && chunks.length > 1) {
      return `<span class="cloze-hint">${escapeHtml(chk.charAt(0))}${escapeHtml('_'.repeat(Math.max(1, chk.length - 1)))}</span>`;
    }
    return `<span class="cloze-mask">${escapeHtml('_'.repeat(chk.length))}</span>`;
  }).join('<span class="syllable-dot" aria-hidden="true">·</span>');

  return `
    <div id="${cardId}" class="conquer-word-card" style="width:100%; box-sizing:border-box; content-visibility:auto; contain-intrinsic-size:auto 92px; background:var(--card, #fff); border:1.5px solid var(--line, #e2e8f0); border-radius:12px; padding:10px 12px; margin-bottom:6px; box-shadow:0 1px 4px rgba(0,0,0,0.03);">
      <div class="zh-row" style="margin-bottom:6px;">
        <button type="button" class="word-speech-btn" data-word="${escapeHtml(clean)}" onclick="event.stopPropagation(); if (typeof window.__playPhonicsKaraoke === 'function') window.__playPhonicsKaraoke('${escapeHtml(clean)}', '${cardId}'); else if (typeof window.__sayWord === 'function') window.__sayWord(this.getAttribute('data-word'));" aria-label="播放音節節奏發音" title="播放音節節奏發音">${SVG_SPEAKER}</button>
        <div class="zh-text" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; flex:1;">
          <div class="conquer-phonics-wrap task-title-free" id="${cardId}-phonics">
            <div class="phonics-display-row">${phonicsChunksHtml}</div>
            <div class="cloze-display-row">${clozeChunksHtml}</div>
          </div>
          ${phonHtml}
          ${defHtml}
          ${posHtml}
          <button type="button" class="conquer-recall-toggle" onclick="event.stopPropagation(); if (typeof window.__toggleConquerRecall === 'function') window.__toggleConquerRecall('${cardId}');" title="切換自主抽測記憶提取" aria-label="自主記憶小測驗">
            <span class="recall-label-normal">⚡ 抽測</span>
            <span class="recall-label-active">👁 看答案</span>
          </button>
        </div>
      </div>
      <div class="sents-vertical-list" style="margin:0;">
        ${sentsHtml}
      </div>
    </div>
  `;
}

if (typeof window !== "undefined") window._renderConquerWordCard = _renderConquerWordCard;

export function buildWeekPendingConquerHtml(words, d = null, cycleParam = _activeConquerCycle) {
  const pendingWords = Array.isArray(words) ? words : getWeekPendingConquerWords(cycleParam);
  const count = pendingWords.length;
  const cycleInfo = getBiweeklyCycleInfo();
  const isPrevious = (cycleParam === "previous");
  const isBoss = cycleInfo.isBiweeklyBossWeek && !isPrevious;

  const levelStandardDetailsHtml = `
    <details class="level-standard-panel">
      <summary style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none; font-size:12px; font-weight:700; color:var(--ink2); list-style:none;">
        <span style="display:flex; align-items:center; gap:5px;">
          <span style="font-size:13px;">📊</span>
          <span style="font-weight:800; color:var(--ink);">Level 1~5 單字分級標準與特徵一覽</span>
          <span style="font-size:11px; color:var(--ink3); font-weight:normal;">(點擊展開/收合)</span>
        </span>
        <span style="font-size:11px; color:var(--ink3);">全書 2,055 字 · 5 大關卡階梯 ▾</span>
      </summary>
      <div class="level-standard-grid" style="margin-top:8px;">
        <div class="level-standard-item" style="border-left:3px solid #2FB47C;">
          <div class="level-standard-head" style="color:#2FB47C;"><span>🟢</span><span>Lv.1 入門</span></div>
          <div class="level-standard-sub">3~4 字母極短字 · 411 字</div>
          <div class="level-standard-trap">自然發音基礎、CVC短單字、生活高頻必備詞</div>
        </div>
        <div class="level-standard-item" style="border-left:3px solid #2D9CDB;">
          <div class="level-standard-head" style="color:#2D9CDB;"><span>🔵</span><span>Lv.2 基礎</span></div>
          <div class="level-standard-sub">4~5 字母常用字 · 411 字</div>
          <div class="level-standard-trap">常見長母音、Magic e字尾、基礎日常詞彙</div>
        </div>
        <div class="level-standard-item" style="border-left:3px solid #6C4CE0;">
          <div class="level-standard-head" style="color:#6C4CE0;"><span>🟣</span><span>Lv.3 進階</span></div>
          <div class="level-standard-sub">5~6 字母雙音節 · 411 字</div>
          <div class="level-standard-trap">雙音節單字、複合名詞、常見詞類衍生變化</div>
        </div>
        <div class="level-standard-item" style="border-left:3px solid #E8892B;">
          <div class="level-standard-head" style="color:#E8892B;"><span>🟠</span><span>Lv.4 挑戰</span></div>
          <div class="level-standard-sub">6~8 字母中長字 · 411 字</div>
          <div class="level-standard-trap">雙子音/不發音字母、連音變化、學科核心詞彙</div>
        </div>
        <div class="level-standard-item" style="border-left:3px solid #E0567B;">
          <div class="level-standard-head" style="color:#E0567B;"><span>🔴</span><span>Lv.5 精熟</span></div>
          <div class="level-standard-sub">8 字母以上長單字 · 411 字</div>
          <div class="level-standard-trap">多音節長單字、字根字首派生、進階易混淆字</div>
        </div>
      </div>
    </details>
  `;

  const curSemWeek = cycleInfo.semesterWeek || 1;
  let activeW = curSemWeek;
  if (typeof cycleParam === "string" && cycleParam.startsWith("week_")) {
    activeW = parseInt(cycleParam.replace("week_", ""), 10) || curSemWeek;
  } else if (cycleParam === "prevWeek" || cycleParam === "previous") {
    activeW = Math.max(1, curSemWeek - 1);
  } else if (cycleParam === "nextWeek") {
    activeW = Math.min(20, curSemWeek + 1);
  }

  let weekOptionsHtml = "";
  for (let w = 1; w <= 20; w++) {
    const val = "week_" + w;
    const selected = (activeW === w);
    weekOptionsHtml += `<option value="${val}" ${selected ? 'selected' : ''}>${w}</option>`;
  }

  const isCurrentActive = (activeW === curSemWeek);
  const cycleSelectBarHtml = `
    <div class="conquer-cycle-nav-bar">
      <label class="conquer-cycle-selector-wrap" for="conquer-cycle-select" title="點擊選擇學期週次">
        <span>📅 第 ${activeW} 週</span>
        <select id="conquer-cycle-select" class="task-date-selector" title="選擇查看學期週次">
          ${weekOptionsHtml}
        </select>
      </label>
      <div class="conquer-cycle-toggle-group">
        <button type="button" id="btn-conquer-cycle-prev" class="conquer-nav-btn date-nav-btn" ${activeW <= 1 ? 'disabled' : ''} title="查看上一週（第 ${Math.max(1, activeW - 1)} 週）待攻克單字">◀ 上一週</button>
        <button type="button" id="btn-conquer-cycle-current" class="conquer-nav-btn date-nav-btn today-btn ${isCurrentActive ? 'active' : ''}" title="切換回本週（第 ${curSemWeek} 週）">本週</button>
        <button type="button" id="btn-conquer-cycle-next" class="conquer-nav-btn date-nav-btn" ${activeW >= 20 ? 'disabled' : ''} title="查看下一週（第 ${Math.min(20, activeW + 1)} 週）待攻克單字">下一週 ▶</button>
      </div>
    </div>
  `;

  if (count === 0) {
    const emptyTitle = isPrevious
      ? "太棒了！上週平日測驗無遺留待攻克單字"
      : `太棒了！${isBoss ? "雙週" : "本週"}目前無待攻克單字`;
    const emptyDesc = isPrevious
      ? "上週平日測驗的所有單字皆已掌握或已於自由練習中全數攻克！"
      : (isBoss ? "雙週平日測驗單字皆已掌握或已於自由練習中全數攻克，" : "本週平日測驗單字皆已掌握或已於自由練習中全數攻克，");
    const emptySub = isPrevious
      ? "上週的錯題庫已完全清空！"
      : (isBoss ? "週末無須進行雙週大魔王消滅戰！" : "週末無須進行錯題補強測驗！");

    return `
      <div class="week-conquer-wrap" style="display:flex; flex-direction:column; gap:8px;">
        ${cycleSelectBarHtml}
        <div class="task-empty-notice" style="padding:14px 16px; margin:0; background:rgba(30,154,102,0.06); border:1.5px solid rgba(30,154,102,0.22); border-radius:12px; display:flex; flex-direction:column; gap:6px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:18px; line-height:1; flex-shrink:0;">✨</span>
            <span style="color:#1E9A66; font-size:14px; font-weight:800; line-height:1.4;">${emptyTitle}</span>
          </div>
          <div class="task-empty-notice-desc" style="color:var(--ink2); font-size:12.5px; line-height:1.65; padding-left:26px; max-width:100%; margin:0;">
            <div>${emptyDesc}</div>
            <div style="margin-top:2px;">${emptySub}</div>
          </div>
        </div>
        ${levelStandardDetailsHtml}
      </div>
    `;
  }

  const byLv = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  pendingWords.forEach(w => {
    const lv = _resolveConquerWordLevel(w, d);
    const targetLv = (lv >= 1 && lv <= 5) ? lv : 1;
    byLv[targetLv].push(w);
  });

  const levelFilterBarHtml = `
    <div class="conquer-level-filter-bar">
      <button type="button" class="conquer-level-tab-btn ${_activeConquerLevelFilter === 'all' ? 'is-active' : ''}" data-lv-filter="all">
        <span class="cl-full-label">全部</span><span class="cl-short-label">全</span>
        <span class="cl-badge-count">(${pendingWords.length})</span>
      </button>
      ${[1, 2, 3, 4, 5].map(lv => {
        const cnt = (byLv[lv] || []).length;
        const isDis = cnt === 0;
        const isAct = (_activeConquerLevelFilter === String(lv));
        return `
          <button type="button" class="conquer-level-tab-btn ${isAct ? 'is-active' : ''}" data-lv-filter="${lv}" ${isDis ? 'disabled' : ''}>
            <span class="cl-full-label">Level ${lv}</span><span class="cl-short-label">L${lv}</span>
            <span class="cl-badge-count">(${cnt})</span>
          </button>
        `;
      }).join("")}
    </div>
  `;

  const filteredLevels = (_activeConquerLevelFilter === "all")
    ? [1, 2, 3, 4, 5]
    : [parseInt(_activeConquerLevelFilter, 10)];

  const levelSectionsHtml = filteredLevels.map(lv => {
    const list = byLv[lv] || [];
    const lvDotColor = levelColor(lv);
    const lvTitle = `Level ${lv}「${levelName(lv)}」`;
    let contentHtml = "";
    const isAllMode = (_conquerViewModeByLevel[lv] === "all");
    const toggleBtnHtml = (list.length > 1)
      ? `<button type="button" class="conquer-mode-toggle-btn" data-lv="${lv}" style="display:inline-flex; align-items:center; justify-content:center; text-align:center; min-width:44px; height:22px; padding:0 8px; line-height:1;" title="${isAllMode ? '收合單字卡' : '展開全部單字卡'}">${isAllMode ? '收合' : '展開'}</button>`
      : "";

    if (list.length > 0) {
      if (!_conquerActiveWordByLevel[lv] || !list.includes(_conquerActiveWordByLevel[lv])) {
        _conquerActiveWordByLevel[lv] = list[0];
      }
      const activeWord = _conquerActiveWordByLevel[lv];

      if (list.length === 1) {
        contentHtml = `<div style="margin-top:6px;">${_renderConquerWordCard(list[0], d)}</div>`;
      } else if (isAllMode) {
        contentHtml = `<div class="conquer-all-cards-wrap" style="display:flex; flex-direction:column; gap:6px; margin-top:6px;">${list.map(w => _renderConquerWordCard(w, d)).join("")}</div>`;
      } else {
        contentHtml = `
          <div class="conquer-active-card-wrap" data-lv="${lv}" style="margin-top:6px;">
            ${_renderConquerWordCard(activeWord, d)}
          </div>
          <div class="conquer-level-nav" style="display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-top:8px;">
            <div class="conquer-chip-list">
              ${list.map(w => {
                const isAct = (w === activeWord);
                return `<button type="button" class="conquer-word-tab ${isAct ? 'is-active' : ''}" data-lv="${lv}" data-word="${w}" title="點擊檢視單字卡並朗讀發音">${w}</button>`;
              }).join("")}
            </div>
          </div>
        `;
      }
    } else {
      contentHtml = `<div style="font-size:12px; color:var(--ink3); font-style:italic; padding:1px 0;">（本關卡目前無待攻克單字）</div>`;
    }

    return `
      <div class="conquer-level-row">
        <div class="conquer-level-head">
          <span style="display:inline-flex; align-items:center; gap:6px;">
            <span style="color:${lvDotColor};">●</span>
            <b>${lvTitle}</b>
          </span>
          <div style="display:inline-flex; align-items:center; gap:6px;">
            ${toggleBtnHtml}
            <span class="conquer-level-count">${list.length} 字</span>
          </div>
        </div>
        ${contentHtml}
      </div>
    `;
  }).join("");

  const tipText = isPrevious
    ? `檢視<b>上週平日測驗</b>遺留的 <b>${count}</b> 個待攻克單字。在<b>自由練習</b>中只要拼對該單字，系統即判定為已學會並自動移除！`
    : (isBoss
      ? `雙週（第 2 週大消滅週期）累積 <b>${count}</b> 個待攻克單字。在<b>自由練習</b>中只要拼對該單字，系統即判定為已學會並自動移除！<b>自由練習答錯不計入待攻克</b>，週末將進行雙週大魔王消滅戰。`
      : `本週（雙週週期第 1 週）累積 <b>${count}</b> 個待攻克單字。在<b>自由練習</b>中只要拼對該單字，系統即判定為已學會並自動移除！<b>自由練習答錯不計入待攻克</b>，週末未消滅之單字將滾入雙週大魔王儲備池。`);

  return `
    <div class="week-conquer-wrap" style="display:flex; flex-direction:column; gap:8px;">
      ${cycleSelectBarHtml}
      ${levelFilterBarHtml}
      <div class="conquer-level-groups">${levelSectionsHtml}</div>
      ${levelStandardDetailsHtml}
      <div class="week-conquer-tip" style="display:flex; align-items:flex-start; gap:8px; padding:6px 4px 2px; font-size:12px; line-height:1.55; color:var(--ink3, #64748B); border-top:1px dashed var(--line, rgba(148,163,184,0.25)); margin-top:2px;">
        <span style="font-size:14px; flex-shrink:0; line-height:1.3;">💡</span>
        <div style="flex:1; line-height:1.55;">${tipText}</div>
      </div>
    </div>
  `;
}

export function updateWeekConquerSection(cycleParam = _activeConquerCycle) {
  _activeConquerCycle = cycleParam;
  const titleEl = document.querySelector("#week-conquer-title") || document.querySelector("#week-conquer-card-title");
  const detailsEl = document.querySelector("#week-conquer-details");
  if (!detailsEl) return;
  const words = getWeekPendingConquerWords(_activeConquerCycle);

  if (titleEl) {
    titleEl.innerHTML = `待攻克單字<small class="en-sub">Conquer</small>`;
  }

  detailsEl.innerHTML = buildWeekPendingConquerHtml(words, null, _activeConquerCycle);

  const selectEl = detailsEl.querySelector("#conquer-cycle-select");
  if (selectEl) {
    selectEl.onchange = (e) => updateWeekConquerSection(e.target.value);
  }
  const btnCur = detailsEl.querySelector("#btn-conquer-cycle-current");
  const btnPrev = detailsEl.querySelector("#btn-conquer-cycle-prev");
  const btnNext = detailsEl.querySelector("#btn-conquer-cycle-next");
  const cycleInfo = getBiweeklyCycleInfo();
  const curSemWeek = cycleInfo.semesterWeek || 1;
  const getActiveW = () => {
    if (typeof _activeConquerCycle === "string" && _activeConquerCycle.startsWith("week_")) {
      return parseInt(_activeConquerCycle.replace("week_", ""), 10) || curSemWeek;
    }
    return curSemWeek;
  };
  if (btnPrev) btnPrev.onclick = (e) => {
    e.stopPropagation();
    updateWeekConquerSection("week_" + Math.max(1, getActiveW() - 1));
  };
  if (btnCur) btnCur.onclick = (e) => {
    e.stopPropagation();
    updateWeekConquerSection("week_" + curSemWeek);
  };
  if (btnNext) btnNext.onclick = (e) => {
    e.stopPropagation();
    updateWeekConquerSection("week_" + Math.min(20, getActiveW() + 1));
  };

  detailsEl.querySelectorAll(".conquer-level-tab-btn:not(:disabled)").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const filter = btn.getAttribute("data-lv-filter");
      if (filter) {
        _activeConquerLevelFilter = filter;
        updateWeekConquerSection(_activeConquerCycle);
      }
    };
  });

  detailsEl.querySelectorAll(".conquer-word-tab").forEach(tab => {
    tab.onclick = (e) => {
      e.stopPropagation();
      const lv = tab.getAttribute("data-lv");
      const w = tab.getAttribute("data-word");
      if (lv && w) {
        _conquerActiveWordByLevel[lv] = w;
        sayWord(w);
        updateWeekConquerSection(_activeConquerCycle);
      }
    };
  });

  detailsEl.querySelectorAll(".conquer-mode-toggle-btn").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const lv = btn.getAttribute("data-lv");
      if (lv) {
        _conquerViewModeByLevel[lv] = (_conquerViewModeByLevel[lv] === "all" ? "single" : "all");
        updateWeekConquerSection(_activeConquerCycle);
      }
    };
  });

  detailsEl.querySelectorAll(".sent-row, .sent-speaker-btn").forEach(elem => {
    elem.onclick = (e) => {
      e.stopPropagation();
      const sent = elem.getAttribute("data-sent");
      if (sent) {
        say(sent, 0.85, null, true);
        return;
      }
    };
  });
}

export function initConquerCard() {
  const sec = document.getElementById("week-conquer-section");
  const container = document.getElementById("week-conquer-container");
  const toggleBtn = document.getElementById("btn-toggle-conquer-card");
  if (!sec || !toggleBtn) return;

  updateWeekConquerSection("current");

  if (sec.__conquerBound) return;
  sec.__conquerBound = true;

  toggleBtn.onclick = (e) => {
    e.preventDefault();
    const isHidden = (container && container.style.display === "none") || sec.classList.contains("is-collapsed");
    if (isHidden) {
      if (container) container.style.display = "block";
      sec.classList.remove("is-collapsed");
      toggleBtn.innerHTML = "收合";
      updateWeekConquerSection();
      sec.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      if (container) container.style.display = "none";
      sec.classList.add("is-collapsed");
      toggleBtn.innerHTML = "展開";
    }
  };
}

if (typeof window !== "undefined") {
  window.updateWeekConquerSection = updateWeekConquerSection;
  window.getWeekPendingConquerWords = getWeekPendingConquerWords;
}
