// =====================================================================
// store.js — the model. Progress state, localStorage, grading rules,
// per-level accounting, and derived statistics. No DOM in here.
// =====================================================================
import { CATS } from "./data.js";
import { getWordLevel } from "./levels.js";

const LS_KEY = "spellAgent.v2"; // bumped: added level progression

// Standard calendar date "YYYY-MM-DD"
export function normalizeDateStr(ds) {
  if (!ds) return "";
  const clean = String(ds).trim().split(/[T\s]/)[0];
  const parts = clean.replace(/\//g, "-").split("-");
  if (parts.length === 3) {
    const y = parts[0];
    const m = parts[1].padStart(2, "0");
    const d = parts[2].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return clean;
}

// Calendar date without leading zeros "YYYY-M-D"
export function unpadDateStr(ds) {
  if (!ds) return "";
  const clean = String(ds).trim().split(/[T\s]/)[0];
  const parts = clean.replace(/\//g, "-").split("-");
  if (parts.length === 3) {
    const y = parts[0];
    const m = String(parseInt(parts[1], 10));
    const d = String(parseInt(parts[2], 10));
    return `${y}-${m}-${d}`;
  }
  return clean;
}

// Local calendar date "YYYY-MM-DD" (used to scope a training session or daily practice).
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
// The calendar date `offset` days before today, as { key, dnum }.
function dayAgo(offset) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return { key: `${y}-${m}-${day}`, dnum: d.getDate() };
}

// box (Leitner): 0 new · 1 learning · 2 practicing · 3 mastered
// stat[id]: { a: attempts, c: corrects, ew: everWrong }
// lstat[level]: { a, c } — per-level attempts/corrects (drives the 80% gate)
// level: { current, unlocked, placed }
function fresh() {
  return {
    box: {}, stat: {}, lstat: {},
    mstat: { listen: { a: 0, c: 0 }, pick: { a: 0, c: 0 }, scramble: { a: 0, c: 0 }, trap: { a: 0, c: 0 } },
    level: { current: 1, unlocked: 1, placed: true },
    // one day's training run; counters reset each time you "start today's training"
    session: { active: false, date: null, answered: 0, correct: 0, incorrect: 0, ids: {}, mastered: 0 },
    // per-day practice log, keyed by date -> { a: answered, c: correct, w: wrong, m: newly mastered }
    history: {},
    // per-day free practice detailed log, keyed by date -> { date, attempts, correct, wrong, words: { [word]: { word, attempts, correct, wrong, passed } } }
    dailyPractice: {},
    points: 0, streak: 0, best: 0, attempts: 0, correct: 0,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return fresh();
    let d = null;
    try {
      d = (typeof raw === "string") ? JSON.parse(raw) : raw;
      if (typeof d === "string") { try { d = JSON.parse(d); } catch(_) {} }
    } catch(_) {}
    if (!d || typeof d !== "object") return fresh();
    const base = fresh();
    const merged = {
      ...base, ...d,
      mstat: { ...base.mstat, ...(d.mstat || {}) },
      level: { ...base.level, ...(d.level || {}), placed: true },
      session: { ...base.session, ...(d.session || {}) },
      history: d.history || {},
      dailyPractice: d.dailyPractice || {},
    };
    // 清理過去因累積題數誤回填而產生但無實際當日 history 的幽靈日期紀錄
    const hasValidActivity = (item) => {
      if (!item) return false;
      if (typeof item.a === "number" && item.a > 0) return true;
      if (typeof item.attempts === "number" && item.attempts > 0) return true;
      if (item.words && typeof item.words === "object" && Object.keys(item.words).length > 0) return true;
      return false;
    };
    const histKeysWithAtt = Object.keys(merged.history).filter(hk => hasValidActivity(merged.history[hk])).map(normalizeDateStr);
    if (histKeysWithAtt.length > 0 && merged.dailyPractice) {
      Object.keys(merged.dailyPractice).forEach(dpKey => {
        const normDp = normalizeDateStr(dpKey);
        const hasRealHist = histKeysWithAtt.includes(normDp);
        const hasRealDp = hasValidActivity(merged.dailyPractice[dpKey]);
        const isSessionToday = (normDp === todayStr() && merged.session && merged.session.date === todayStr() && merged.session.answered > 0);
        // 唯有既無 history、又無 dailyPractice 實質內容、且非今日 session 者，才判定為幽靈
        if (!hasRealHist && !hasRealDp && !isSessionToday) {
          delete merged.dailyPractice[dpKey];
        }
      });
    }
    // 嚴格校準：若單字從未答對過 (st.c === 0)，將 box 設為 0，避免被誤計為學習中
    if (merged.box && merged.stat) {
      for (const id in merged.box) {
        if (!merged.stat[id] || !merged.stat[id].c || merged.stat[id].c <= 0) {
          merged.box[id] = 0;
        }
      }
    }

    // 自動歷史單字相容回填至 mwords.listen：
    // 若單字庫 stat 中有已作答單字，但在四大模式細項中尚未登錄任何模式，自動歸入預設之「聽與拼」模式
    if (merged.stat && Object.keys(merged.stat).length > 0) {
      if (!merged.mwords) merged.mwords = { listen: {}, pick: {}, scramble: {}, trap: {} };
      if (!merged.mwords.listen) merged.mwords.listen = {};
      if (!merged.mwords.pick) merged.mwords.pick = {};
      if (!merged.mwords.scramble) merged.mwords.scramble = {};
      if (!merged.mwords.trap) merged.mwords.trap = {};
      const mwOther = new Set([
        ...Object.keys(merged.mwords.pick),
        ...Object.keys(merged.mwords.scramble),
        ...Object.keys(merged.mwords.trap)
      ]);
      for (const [id, st] of Object.entries(merged.stat)) {
        if (!st || st.a <= 0) continue;
        if (!merged.mwords.listen[id] && !mwOther.has(id)) {
          merged.mwords.listen[id] = { a: st.a, c: st.c };
        }
      }
    }

    // a session left open from a previous day is over
    if (merged.session.active && merged.session.date !== todayStr()) merged.session.active = false;
    return merged;
  } catch {
    return fresh();
  }
}

let DB = load();
export function reload() { DB = load(); return DB; }
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(DB)); } catch { /* storage off */ } }

export function box(id) { return DB.box[id] || 0; }
export function everWrong(id) { return !!(DB.stat[id] && DB.stat[id].ew); }
export function correctCount(id) { return DB.stat[id] ? DB.stat[id].c : 0; }

// Grade one practice attempt. `level` (optional) also updates that level's tally. `mode` (optional) tracks 4 practice modes.
// `wordStr` (optional) tracks the specific word tested. `isFree` (default true) catalogs it into daily free practice log.
export function grade(id, correct, level, mode, wordStr = null, isFree = true) {
  const before = box(id);
  const st = DB.stat[id] || (DB.stat[id] = { a: 0, c: 0, ew: false });
  st.a++; DB.attempts++;

  let gain = 0, newlyMastered = false;
  if (correct) {
    st.c++; DB.correct++;
    DB.box[id] = Math.min(3, Math.max(1, before + 1));
    DB.streak++; DB.best = Math.max(DB.best, DB.streak);
    gain = 8 + Math.min(12, DB.streak * 2);
    DB.points += gain;
    if (DB.box[id] === 3 && before < 3) newlyMastered = true;
  } else {
    st.ew = true;
    // 若該單字曾答對過，降回 Box 1 學習中；若從未答對過，維持 Box 0 生字狀態（不虛增學習成果）
    DB.box[id] = (st.c > 0) ? 1 : 0;
    DB.streak = 0;
  }
  if (level) {
    const ls = DB.lstat[level] || (DB.lstat[level] = { a: 0, c: 0 });
    ls.a++; if (correct) ls.c++;
  }
  const targetMode = mode || "listen";
  if (!DB.mstat) DB.mstat = { listen: { a: 0, c: 0 }, pick: { a: 0, c: 0 }, scramble: { a: 0, c: 0 }, trap: { a: 0, c: 0 } };
  const ms = DB.mstat[targetMode] || (DB.mstat[targetMode] = { a: 0, c: 0 });
  ms.a++; if (correct) ms.c++;

  // 四大模式不重複單字統計（記錄每個模式受測與答對之單字）
  if (!DB.mwords) DB.mwords = { listen: {}, pick: {}, scramble: {}, trap: {} };
  const mw = DB.mwords[targetMode] || (DB.mwords[targetMode] = {});
  const mwEntry = mw[id] || (mw[id] = { a: 0, c: 0 });
  mwEntry.a++; if (correct) mwEntry.c++;

  // 自由練習每日紀錄 (包含當日受測單字與作答成果) — 僅限自由練習 (isFree === true) 寫入
  if (isFree) {
    const tKey = todayStr();
    if (!DB.dailyPractice) DB.dailyPractice = {};
    const dp = DB.dailyPractice[tKey] || (DB.dailyPractice[tKey] = {
      date: tKey,
      attempts: 0,
      correct: 0,
      wrong: 0,
      words: {}
    });
    dp.attempts++;
    if (correct) dp.correct++; else dp.wrong++;

    if (wordStr) {
      const wKey = String(wordStr).trim().toLowerCase();
      const we = dp.words[wKey] || (dp.words[wKey] = {
        word: wKey,
        attempts: 0,
        correct: 0,
        wrong: 0,
        passed: false,
        hadCorrectThenWrong: false,
        lastResult: ''
      });
      we.attempts++;
      if (correct) {
        we.correct++;
        we.passed = true;
        we.lastResult = 'correct';
        we.hadCorrectThenWrong = false;
      } else {
        we.wrong++;
        if (we.correct > 0) {
          we.hadCorrectThenWrong = true;
        }
        we.lastResult = 'wrong';
      }
    }

    // 自由練習亦同步記入 history 以支援自由練習熱力圖（不重複計算）
    const h = DB.history[tKey] || (DB.history[tKey] = { a: 0, c: 0, w: 0, m: 0 });
    h.a++; if (correct) h.c++; else h.w++; if (newlyMastered) h.m++;

    if (DB.session.active) {
      const s = DB.session;
      s.answered++;
      if (correct) s.correct++; else s.incorrect++;
      s.ids[id] = 1;
      if (newlyMastered) s.mastered++;
    }
  }
  save();
  return { correct, gain, streak: DB.streak, box: DB.box[id], newlyMastered };
}

export function reset() { DB = fresh(); save(); }

// ---- today's training session ----
export function sessionStart() {
  DB.session = { active: true, date: todayStr(), answered: 0, correct: 0, incorrect: 0, ids: {}, mastered: 0 };
  save();
}
export function sessionEnd() {
  const s = DB.session;
  const summary = {
    answered: s.answered, correct: s.correct, incorrect: s.incorrect,
    distinct: Object.keys(s.ids).length, mastered: s.mastered,
    rate: s.answered ? Math.round((s.correct / s.answered) * 100) : 0,
  };
  DB.session.active = false;
  save();
  return summary;
}

// 判斷單字物件是否為真實當日自由練習紀錄（而非舊版從累積單字自動回填的虛擬物件）
function isRealDailyWordsMap(wordsObj) {
  if (!wordsObj || typeof wordsObj !== "object") return false;
  const vals = Object.values(wordsObj).filter(Boolean);
  if (vals.length === 0) return false;
  return vals.some(w => (w.lastResult === "correct" || w.lastResult === "wrong" || w.a !== undefined));
}

// Practice history for the last `n` days + streaks, for the calendar heatmap.
export function historyData(n = 28) {
  let taskHistory = [];
  try {
    const raw = localStorage.getItem("student_task_history");
    if (raw) taskHistory = JSON.parse(raw) || [];
  } catch(_) {}

  // 取得特定日期的自由練習作答單字數與答對數（嚴格排除指定測驗紀錄）
  const getDayStat = (dateStr) => {
    const norm = normalizeDateStr(dateStr);
    const unpad = unpadDateStr(dateStr);
    const slash = norm.replace(/-/g, "/");

    let a = 0, c = 0;

    // 先檢查雲端同步之 student_task_history 是否有該日自由練習紀錄
    let thRow = null;
    let thFreeAtt = 0, thFreeCor = 0;
    if (Array.isArray(taskHistory)) {
      thRow = taskHistory.find(item => item && item.date && normalizeDateStr(item.date) === norm) || null;
      if (thRow) {
        const isSelfRow = (thRow.taskName === "自主練習");
        thFreeAtt = parseInt(thRow.freeTested !== undefined ? thRow.freeTested : (isSelfRow ? thRow.attempts : 0)) || 0;
        thFreeCor = parseInt(thRow.freeCorrect !== undefined ? thRow.freeCorrect : (isSelfRow ? thRow.correct : 0)) || 0;
      }
    }

    // 1. 檢查 dailyPractice (僅採納具有真實當日單字紀錄，或與試算表自由練習吻合者)
    let hasRealDpWords = false;
    if (DB.dailyPractice) {
      const dp = DB.dailyPractice[norm] || DB.dailyPractice[unpad] || DB.dailyPractice[slash] || DB.dailyPractice[dateStr];
      if (dp) {
        hasRealDpWords = isRealDailyWordsMap(dp.words);
        if (hasRealDpWords) {
          const wVals = Object.values(dp.words).filter(Boolean);
          const dpAtt = wVals.length;
          const dpCor = wVals.filter(w => {
            const wCor = (w.correct !== undefined) ? w.correct : (w.c || 0);
            const wWrg = (w.wrong !== undefined) ? w.wrong : Math.max(0, (w.a || 0) - wCor);
            const isStillWrong = w.hadCorrectThenWrong || (w.lastResult === "wrong" && wCor > 0) || (w.lastResult === "wrong") || (wWrg > 0 && wCor === 0);
            return !isStillWrong && (w.lastResult === "correct" || wCor > 0 || w.passed);
          }).length;
          if (dpAtt > 0) {
            a = Math.max(a, dpAtt);
            c = Math.max(c, dpCor);
          }
        } else if ((!dp.words || Object.keys(dp.words).length === 0) && dp.attempts > 0 && (!thRow || thFreeAtt > 0)) {
          a = Math.max(a, dp.attempts || 0);
          c = Math.max(c, dp.correct || 0);
        }
      }
    }

    // 2. 檢查 DB.history（若試算表已明確記載該日自由練習為 0 且無真實 dp.words，代表 DB.history 為舊版指定測驗誤記，不予採計）
    const sheetExplicitlyZeroFree = !!(thRow && thFreeAtt === 0 && !hasRealDpWords);
    if (DB.history && !sheetExplicitlyZeroFree && !hasRealDpWords) {
      const h = DB.history[norm] || DB.history[unpad] || DB.history[slash] || DB.history[dateStr];
      if (h) {
        const dpForCheck = DB.dailyPractice && (DB.dailyPractice[norm] || DB.dailyPractice[unpad] || DB.dailyPractice[slash] || DB.dailyPractice[dateStr]);
        const isFabricatedOnly = dpForCheck && dpForCheck.words && Object.keys(dpForCheck.words).length > 0 && !isRealDailyWordsMap(dpForCheck.words);
        if (!isFabricatedOnly) {
          let hAtt = (h.a !== undefined) ? h.a : (h.attempts !== undefined ? h.attempts : 0);
          let hCor = (h.c !== undefined) ? h.c : (h.correct !== undefined ? h.correct : 0);
          if (hAtt > 0) {
            a = Math.max(a, hAtt);
            c = Math.max(c, hCor);
          }
        }
      }
    }

    // 3. 採用雲端同步之自由練習欄位 (freeTested / freeCorrect)
    if (thFreeAtt > 0 && !hasRealDpWords) {
      a = Math.max(a, thFreeAtt);
      c = Math.max(c, thFreeCor);
    }

    return { a, c };
  };

  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const { key, dnum } = dayAgo(i);
    const { a, c } = getDayStat(key);
    const rate = a ? Math.round((c / a) * 100) : 0;
    const level = a === 0 ? 0 : rate < 60 ? 1 : rate < 70 ? 2 : rate < 80 ? 3 : rate < 90 ? 4 : rate < 100 ? 5 : 6;
    days.push({ key, dnum, a, c, rate, level });
  }

  // 連續天數 (streak)
  let streak = 0;
  const has = (off) => {
    const k = dayAgo(off).key;
    return getDayStat(k).a > 0;
  };
  let start = has(0) ? 0 : has(1) ? 1 : null;
  if (start !== null) {
    let k = start;
    while (has(k)) { streak++; k++; }
  }

  // 收集所有曾進行自由練習之不重複日期
  const candidateDates = new Set();
  if (DB.dailyPractice) {
    Object.keys(DB.dailyPractice).forEach(k => candidateDates.add(normalizeDateStr(k)));
  }
  if (DB.history) {
    Object.keys(DB.history).forEach(k => candidateDates.add(normalizeDateStr(k)));
  }
  if (Array.isArray(taskHistory)) {
    taskHistory.forEach(th => {
      if (th && th.date) candidateDates.add(normalizeDateStr(th.date));
    });
  }
  const activeDateSet = new Set();
  candidateDates.forEach(dKey => {
    if (dKey && getDayStat(dKey).a > 0) activeDateSet.add(dKey);
  });

  // 計算最佳連續天數
  const toIdx = (ds) => {
    const clean = normalizeDateStr(ds);
    const [y, m, d] = clean.split("-").map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return Math.round(new Date(y, m - 1, d).getTime() / 86400000);
  };

  const idxs = Array.from(activeDateSet).map(toIdx).filter(x => x !== null && !isNaN(x)).sort((x, y) => x - y);
  let best = 0, cur = 0, prev = null;
  for (const i of idxs) {
    cur = (prev !== null && i === prev + 1) ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = i;
  }
  best = Math.max(best, streak);

  return { days, streak, best, total: idxs.length };
}

export function sessionState() {
  const s = DB.session;
  return {
    active: s.active, answered: s.answered, correct: s.correct, incorrect: s.incorrect,
    distinct: Object.keys(s.ids).length,
    rate: s.answered ? Math.round((s.correct / s.answered) * 100) : 0,
  };
}

// ---- level progression ----
export function progress() { return { ...DB.level }; }

export function levelStats(level, words) {
  let a = 0, c = 0;
  if (Array.isArray(words) && words.length > 0) {
    const ws = words.filter(w => w.level === level);
    for (const w of ws) {
      const st = DB.stat[w.id];
      if (st && st.a > 0) a++;
      if (st && st.c > 0) c++;
    }
  } else if (DB && DB.stat) {
    for (const [id, st] of Object.entries(DB.stat)) {
      if (!st) continue;
      if (getWordLevel(id) === level) {
        if (st.a > 0) a++;
        if (st.c > 0) c++;
      }
    }
  }
  if (a > 0) {
    return { attempts: a, correct: c, rate: c / a };
  }
  return { attempts: 0, correct: 0, rate: 0 };
}

export function setCurrentLevel(n) {
  DB.level.current = n;
  if (n > DB.level.unlocked) DB.level.unlocked = n;
  save();
}

export function completePlacement(startLevel) {
  DB.level.placed = true;
  DB.level.current = startLevel;
  DB.level.unlocked = Math.max(DB.level.unlocked, startLevel);
  save();
}

// Promote after clearing a challenge; returns the new current level.
export function promote() {
  const next = Math.min(5, DB.level.current + 1);
  DB.level.unlocked = Math.max(DB.level.unlocked, next);
  DB.level.current = next;
  save();
  return next;
}

// ---- header + progress-bar numbers ----
export function stats(words) {
  const wList = (Array.isArray(words) && words.length > 0) ? words : [];
  let learn = 0, prac = 0, mast = 0;
  for (const w of wList) {
    const b = box(w.id);
    const st = DB.stat[w.id];
    // 嚴格準則：單字必須實際曾答對過 (st && st.c > 0)，方能計入學習成果
    if (st && st.c > 0) {
      if (b >= 3) mast++;
      else if (b === 2) prac++;
      else learn++;
    }
  }
  // 若單字庫尚未完全載入完成，直接由 DB.stat 與 DB.box 統計
  if (wList.length === 0 && DB && DB.stat) {
    for (const [id, st] of Object.entries(DB.stat)) {
      if (st && st.c > 0) {
        const b = box(id);
        if (b >= 3) mast++;
        else if (b === 2) prac++;
        else learn++;
      }
    }
  }
  const distinctCorrect = mast + prac + learn;
  // 累積受測單字數：凡有作答受測過 (stat.a > 0 或曾列入 box) 的不重複單字
  const testedVocab = Math.max(
    distinctCorrect,
    Object.values(DB.stat || {}).filter((s) => s && s.a > 0).length,
    Object.keys(DB.stat || {}).length,
    Object.keys(DB.box || {}).length
  );
  const passRate = testedVocab > 0 ? Math.round((distinctCorrect / testedVocab) * 100) : 0;
  const total = wList.length || 2055;
  return {
    learn, prac, mast, total,
    currentLevel: (DB.level && DB.level.current) || 1, streak: DB.streak || 0,
    distinctCorrect, testedVocab, passRate, attempts: testedVocab, correct: distinctCorrect,
    points: DB.points || 0,
  };
}

// ---- daily free practice helpers ----
export function getDailyPractice(dateStr) {
  const norm = normalizeDateStr(dateStr);
  const unpadded = unpadDateStr(dateStr);
  const slashed = norm.replace(/-/g, "/");
  let dp = (DB.dailyPractice && (DB.dailyPractice[norm] || DB.dailyPractice[unpadded] || DB.dailyPractice[slashed] || DB.dailyPractice[dateStr])) || null;
  if (dp && dp.words && Object.keys(dp.words).length > 0 && !isRealDailyWordsMap(dp.words)) {
    dp = null;
  }
  if (!dp || (!dp.attempts && (!dp.words || Object.keys(dp.words).length === 0))) {
    const h = (DB.history && (DB.history[norm] || DB.history[unpadded] || DB.history[slashed] || DB.history[dateStr])) || null;
    if (h) {
      const hAtt = (h.a !== undefined) ? h.a : (h.attempts !== undefined ? h.attempts : (h.words ? Object.keys(h.words).length : 0));
      const hCor = (h.c !== undefined) ? h.c : (h.correct !== undefined ? h.correct : 0);
      if (hAtt > 0) {
        dp = {
          date: norm,
          attempts: hAtt,
          correct: hCor,
          wrong: (h.w !== undefined) ? h.w : (h.wrong !== undefined ? h.wrong : Math.max(0, hAtt - hCor)),
          words: (dp && dp.words) ? dp.words : (h.words || {})
        };
      }
    }
  }
  if (dp && dp.words && Object.keys(dp.words).length > 0) {
    const wList = Object.values(dp.words).filter(Boolean);
    dp.distinctAttempts = wList.length;
    dp.distinctCorrect = wList.filter(w => {
      const wCor = (w.correct !== undefined) ? w.correct : (w.c || 0);
      const wWrg = (w.wrong !== undefined) ? w.wrong : Math.max(0, (w.a || 0) - wCor);
      const isWrong = w.hadCorrectThenWrong || (w.lastResult === 'wrong' && wCor > 0) || (w.lastResult === 'wrong') || (wWrg > 0 && wCor === 0);
      return !isWrong && (w.lastResult === 'correct' || wCor > 0 || w.passed);
    }).length;
  }
  return dp;
}

export function getPracticeDates() {
  const set = new Set();
  if (DB.dailyPractice) {
    Object.keys(DB.dailyPractice).forEach(k => {
      const dp = DB.dailyPractice[k];
      if (!k || !dp) return;
      if (dp.words && Object.keys(dp.words).length > 0 && !isRealDailyWordsMap(dp.words)) return;
      if ((dp.attempts > 0) || (dp.words && Object.keys(dp.words).length > 0)) set.add(normalizeDateStr(k));
    });
  }
  if (DB.history) {
    Object.keys(DB.history).forEach(k => {
      const h = DB.history[k];
      if (k && h && ((h.a > 0) || (h.attempts > 0) || (h.words && Object.keys(h.words).length > 0))) set.add(normalizeDateStr(k));
    });
  }
  return Array.from(set);
}

// Everything the summary panel needs, as plain data.
export function summary(words) {
  const s = stats(words);
  const mastered = words.filter((w) => box(w.id) >= 3 && DB.stat[w.id]?.c > 0);
  const fixed = words.filter((w) => box(w.id) >= 3 && everWrong(w.id) && DB.stat[w.id]?.c > 0);
  const levels = [1, 2, 3, 4, 5].map((lv) => {
    const ws = words.filter((w) => w.level === lv);
    const ls = levelStats(lv);
    let learn = 0, prac = 0, mast = 0, testedCount = 0;
    for (const w of ws) {
      const st = DB.stat[w.id];
      if (st && st.a > 0) testedCount++;
      if (st && st.c > 0) {
        const b = box(w.id);
        if (b >= 3) mast++;
        else if (b === 2) prac++;
        else learn++;
      }
    }
    const correctWordCount = learn + prac + mast;
    const wordRate = testedCount > 0 ? Math.round((correctWordCount / testedCount) * 100) : 0;
    return {
      level: lv, total: ws.length,
      mast, prac, learn,
      correct: correctWordCount,
      testedCount: testedCount,
      rate: wordRate, attempts: ls.attempts,
    };
  });
  const catCounts = Object.keys(CATS).map((k) => {
    const ws = words.filter((w) => w.cat === k);
    return { name: CATS[k].name, color: CATS[k].color, total: ws.length, mast: ws.filter((w) => box(w.id) >= 3 && DB.stat[w.id]?.c > 0).length };
  });

  const modeStats = {
    listen: { a: 0, c: 0 },
    pick: { a: 0, c: 0 },
    scramble: { a: 0, c: 0 },
    trap: { a: 0, c: 0 }
  };
  const mwords = DB.mwords || {};
  // 確保歷史單字完整繼承至聽與拼模式
  if (DB.stat && Object.keys(DB.stat).length > 0) {
    if (!mwords.listen) mwords.listen = {};
    const mwOther = new Set([
      ...Object.keys(mwords.pick || {}),
      ...Object.keys(mwords.scramble || {}),
      ...Object.keys(mwords.trap || {})
    ]);
    for (const [id, st] of Object.entries(DB.stat)) {
      if (!st || st.a <= 0) continue;
      if (!mwords.listen[id] && !mwOther.has(id)) {
        mwords.listen[id] = { a: st.a, c: st.c };
      }
    }
  }

  let hasValidMwords = false;
  ["listen", "pick", "scramble", "trap"].forEach(m => {
    if (mwords[m] && Object.values(mwords[m]).some(e => e && e.a > 0)) {
      hasValidMwords = true;
    }
  });

  const totTestedWords = Object.values(DB.stat || {}).filter(s => s && s.a > 0).length;
  const totCorrWords = Object.values(DB.stat || {}).filter(s => s && s.c > 0).length;
  const activeModes = ["listen", "pick", "scramble", "trap"].filter(m => DB.mstat && DB.mstat[m] && DB.mstat[m].a > 0);

  ["listen", "pick", "scramble", "trap"].forEach(m => {
    if (mwords[m] && Object.keys(mwords[m]).length > 0) {
      // 依使用者規範：只記錄施測單字數和答對單字數，不論施測次數和答對次數
      const entries = Object.values(mwords[m]);
      modeStats[m].a = entries.filter(e => e && e.a > 0).length;
      modeStats[m].c = entries.filter(e => e && e.c > 0).length;
    } else if (!hasValidMwords && activeModes.length === 1 && activeModes[0] === m) {
      modeStats[m].a = totTestedWords;
      modeStats[m].c = totCorrWords;
    } else if (DB.mstat && DB.mstat[m]) {
      modeStats[m].a = Math.min(totTestedWords, DB.mstat[m].a || 0);
      modeStats[m].c = Math.min(totCorrWords, DB.mstat[m].c || 0);
    }
  });

  // 1. 整理 DB.stat 中所有曾作答過之單字成果
  const allPracticedWords = [];
  for (const w of words) {
    const st = DB.stat[w.id];
    if (st && st.a > 0) {
      allPracticedWords.push({
        word: w.word,
        attempts: st.a,
        correct: st.c,
        wrong: Math.max(0, st.a - st.c),
        ew: !!st.ew
      });
    }
  }

  // 2. 自動清理舊版誤由指定測驗或累積單字回填產生的幽靈 dailyPractice / history 紀錄（絕不跨日偽造單字）
  if (!DB.dailyPractice) DB.dailyPractice = {};
  if (!DB.history) DB.history = {};
  let changed = false;

  let taskHistory = [];
  try {
    const raw = localStorage.getItem("student_task_history");
    if (raw) taskHistory = JSON.parse(raw) || [];
  } catch(_) {}

  Object.keys(DB.dailyPractice).forEach(dpKey => {
    const dp = DB.dailyPractice[dpKey];
    const normDp = normalizeDateStr(dpKey);
    if (!dp) {
      delete DB.dailyPractice[dpKey];
      changed = true;
      return;
    }
    const hasWords = dp.words && typeof dp.words === "object" && Object.keys(dp.words).length > 0;
    const isFabricatedWords = hasWords && !isRealDailyWordsMap(dp.words);
    if (isFabricatedWords) {
      const thRow = Array.isArray(taskHistory) ? taskHistory.find(item => item && item.date && normalizeDateStr(item.date) === normDp) : null;
      const isSelfRow = thRow && thRow.taskName === "自主練習";
      const thFreeAtt = thRow ? (parseInt(thRow.freeTested !== undefined ? thRow.freeTested : (isSelfRow ? thRow.attempts : 0)) || 0) : 0;
      if (thFreeAtt > 0) {
        dp.attempts = thFreeAtt;
        dp.correct = parseInt(thRow.freeCorrect !== undefined ? thRow.freeCorrect : (isSelfRow ? thRow.correct : 0)) || 0;
        dp.wrong = Math.max(0, dp.attempts - dp.correct);
        dp.words = {};
      } else {
        delete DB.dailyPractice[dpKey];
        if (DB.history[normDp] || DB.history[dpKey]) {
          delete DB.history[normDp];
          delete DB.history[dpKey];
        }
      }
      changed = true;
    } else if (!hasWords && (!dp.attempts || dp.attempts <= 0)) {
      delete DB.dailyPractice[dpKey];
      changed = true;
    }
  });

  if (Array.isArray(taskHistory) && taskHistory.length > 0) {
    Object.keys(DB.history).forEach(hKey => {
      const normH = normalizeDateStr(hKey);
      const dp = DB.dailyPractice[normH] || DB.dailyPractice[hKey];
      const hasRealDp = dp && isRealDailyWordsMap(dp.words);
      if (hasRealDp) return;
      const thRow = taskHistory.find(item => item && item.date && normalizeDateStr(item.date) === normH);
      if (thRow) {
        const isSelfRow = (thRow.taskName === "自主練習");
        const thFreeAtt = parseInt(thRow.freeTested !== undefined ? thRow.freeTested : (isSelfRow ? thRow.attempts : 0)) || 0;
        if (thFreeAtt === 0) {
          delete DB.history[hKey];
          if (DB.dailyPractice[normH] || DB.dailyPractice[hKey]) {
            delete DB.dailyPractice[normH];
            delete DB.dailyPractice[hKey];
          }
          changed = true;
        }
      }
    });
  }

  if (changed) save();

  return {
    passRate: s.passRate, distinctCorrect: s.distinctCorrect,
    attempts: s.attempts, correct: s.correct, total: s.total,
    mastered, fixed, levels, catCounts, history: historyData(),
    modeStats,
    dailyPractice: DB.dailyPractice || {},
    practiceDates: getPracticeDates(),
    rawHistory: DB.history || {},
    allPracticedWords,
    words,
  };
}

/**
 * 🚀 輕量快取摘要：提供登入與上傳時直接存取，零延遲免重新計算
 */
export function getPrecomputedSummary(words) {
  const s = stats(words);
  const modeStats = s.modes || {
    listen: { a: 0, c: 0 },
    pick: { a: 0, c: 0 },
    scramble: { a: 0, c: 0 },
    trap: { a: 0, c: 0 }
  };

  const levels = {};
  if (Array.isArray(words) && words.length > 0) {
    for (let lv = 1; lv <= 5; lv++) {
      const ws = words.filter(w => w.level === lv);
      let c = 0, a = 0;
      for (const w of ws) {
        const st = DB.stat[w.id];
        if (st && st.a > 0) a++;
        if (st && st.c > 0) c++;
      }
      levels[lv] = `${c}/${a}`;
    }
  } else if (DB && DB.stat) {
    const levelTested = [0, 0, 0, 0, 0, 0];
    const levelCorr = [0, 0, 0, 0, 0, 0];
    for (const [id, st] of Object.entries(DB.stat)) {
      if (!st) continue;
      const lv = getWordLevel(id);
      if (st.a > 0) levelTested[lv]++;
      if (st.c > 0) levelCorr[lv]++;
    }
    for (let lv = 1; lv <= 5; lv++) {
      levels[lv] = `${levelCorr[lv]}/${levelTested[lv]}`;
    }
  }

  return {
    testedVocab: s.testedVocab,
    distinctCorrect: s.distinctCorrect,
    passRate: s.passRate + "%",
    mastered: s.mast,
    practicing: s.prac,
    learning: s.learn,
    levels,
    modes: {
      listen: `${modeStats.listen.c}/${modeStats.listen.a}`,
      pick: `${modeStats.pick.c}/${modeStats.pick.a}`,
      scramble: `${modeStats.scramble.c}/${modeStats.scramble.a}`,
      trap: `${modeStats.trap.c}/${modeStats.trap.a}`
    }
  };
}
