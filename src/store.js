// =====================================================================
// store.js — the model. Progress state, localStorage, grading rules,
// per-level accounting, and derived statistics. No DOM in here.
// =====================================================================
import { CATS } from "./data.js";

const LS_KEY = "spellAgent.v2"; // bumped: added level progression

// Standard calendar date "YYYY-MM-DD"
export function normalizeDateStr(ds) {
  if (!ds) return "";
  const parts = String(ds).trim().replace(/\//g, "-").split("-");
  if (parts.length === 3) {
    const y = parts[0];
    const m = parts[1].padStart(2, "0");
    const d = parts[2].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(ds).trim();
}

// Calendar date without leading zeros "YYYY-M-D"
export function unpadDateStr(ds) {
  if (!ds) return "";
  const parts = String(ds).trim().replace(/\//g, "-").split("-");
  if (parts.length === 3) {
    const y = parts[0];
    const m = String(parseInt(parts[1], 10));
    const d = String(parseInt(parts[2], 10));
    return `${y}-${m}-${d}`;
  }
  return String(ds).trim();
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
    const d = JSON.parse(localStorage.getItem(LS_KEY));
    if (!d) return fresh();
    const base = fresh();
    const merged = {
      ...base, ...d,
      mstat: { ...base.mstat, ...(d.mstat || {}) },
      level: { ...base.level, ...(d.level || {}), placed: true },
      session: { ...base.session, ...(d.session || {}) },
      history: d.history || {},
      dailyPractice: d.dailyPractice || {},
    };
    // 歷史版本數據自動對齊：若早期未記錄 mstat，自動對齊至預設 listen 模式
    const mSumA = (merged.mstat.listen?.a || 0) + (merged.mstat.pick?.a || 0) + (merged.mstat.scramble?.a || 0) + (merged.mstat.trap?.a || 0);
    if ((merged.attempts || 0) > mSumA) {
      const diffA = (merged.attempts || 0) - mSumA;
      const mSumC = (merged.mstat.listen?.c || 0) + (merged.mstat.pick?.c || 0) + (merged.mstat.scramble?.c || 0) + (merged.mstat.trap?.c || 0);
      const diffC = Math.max(0, (merged.correct || 0) - mSumC);
      merged.mstat.listen.a = (merged.mstat.listen.a || 0) + diffA;
      merged.mstat.listen.c = (merged.mstat.listen.c || 0) + diffC;
    }
    // a session left open from a previous day is over
    if (merged.session.active && merged.session.date !== todayStr()) merged.session.active = false;
    return merged;
  } catch {
    return fresh();
  }
}

let DB = load();
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
    DB.box[id] = Math.min(3, before + 1);
    DB.streak++; DB.best = Math.max(DB.best, DB.streak);
    gain = 8 + Math.min(12, DB.streak * 2);
    DB.points += gain;
    if (DB.box[id] === 3 && before < 3) newlyMastered = true;
  } else {
    st.ew = true;
    DB.box[id] = 1;
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

  // 自由練習每日紀錄 (包含當日受測單字與作答成果)
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
      const we = dp.words[wKey] || (dp.words[wKey] = { word: wKey, attempts: 0, correct: 0, wrong: 0, passed: false });
      we.attempts++;
      if (correct) {
        we.correct++;
        we.passed = true;
      } else {
        we.wrong++;
      }
    }

    // 自由練習亦同步記入 history 以支援學習天數熱力圖
    const h = DB.history[tKey] || (DB.history[tKey] = { a: 0, c: 0, w: 0, m: 0 });
    h.a++; if (correct) h.c++; else h.w++; if (newlyMastered) h.m++;
  }

  if (DB.session.active) {
    const s = DB.session;
    s.answered++;
    if (correct) s.correct++; else s.incorrect++;
    s.ids[id] = 1;
    if (newlyMastered) s.mastered++;
    // log into today's history (survives even if the session is never explicitly ended)
    const h = DB.history[todayStr()] || (DB.history[todayStr()] = { a: 0, c: 0, w: 0, m: 0 });
    h.a++; if (correct) h.c++; else h.w++; if (newlyMastered) h.m++;
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
// Practice history for the last `n` days + streaks, for the calendar heatmap.
export function historyData(n = 28) {
  let taskHistory = [];
  try {
    const raw = localStorage.getItem("student_task_history");
    if (raw) taskHistory = JSON.parse(raw) || [];
  } catch(_) {}

  // 取得特定日期的作答題數與答對數（融合 dailyPractice, DB.history, student_task_history 與今日即時進度）
  const getDayStat = (dateStr) => {
    const norm = normalizeDateStr(dateStr);
    const unpad = unpadDateStr(dateStr);
    const slash = norm.replace(/-/g, "/");

    let a = 0, c = 0;

    // 1. 檢查 dailyPractice
    if (DB.dailyPractice) {
      const dp = DB.dailyPractice[norm] || DB.dailyPractice[unpad] || DB.dailyPractice[slash] || DB.dailyPractice[dateStr];
      if (dp && dp.attempts > 0) {
        a = Math.max(a, dp.attempts);
        c = Math.max(c, dp.correct);
      }
    }

    // 2. 檢查 DB.history
    if (DB.history) {
      const h = DB.history[norm] || DB.history[unpad] || DB.history[slash] || DB.history[dateStr];
      if (h && h.a > 0) {
        a = Math.max(a, h.a);
        c = Math.max(c, h.c);
      }
    }

    // 3. 檢查 student_task_history (來自試算表雲端同步紀錄)
    if (Array.isArray(taskHistory)) {
      const th = taskHistory.find(item => {
        if (!item || !item.date) return false;
        const idNorm = normalizeDateStr(item.date);
        return idNorm === norm;
      });
      if (th) {
        let tAtt = parseInt(th.attempts) || 0;
        let tCorr = parseInt(th.correct) || 0;
        if (!tAtt && th.score && th.score !== "—" && th.score.includes("/")) {
          const parts = th.score.split("/");
          tCorr = parseInt(parts[0]) || 0;
          tAtt = parseInt(parts[1]) || 0;
        }
        if (tAtt > 0) {
          a = Math.max(a, tAtt);
          c = Math.max(c, tCorr);
        }
      }
    }

    // 4. 若為今天且 DB.attempts > 0
    if (norm === todayStr() && DB.attempts > 0) {
      a = Math.max(a, DB.attempts);
      c = Math.max(c, DB.correct);
    }

    return { a, c };
  };

  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const { key, dnum } = dayAgo(i);
    const { a, c } = getDayStat(key);
    const rate = a ? Math.round((c / a) * 100) : 0;
    const level = a === 0 ? 0 : a < 10 ? 1 : a < 20 ? 2 : 3;
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

  // 收集所有曾作答過之不重複日期
  const activeDateSet = new Set();
  if (DB.dailyPractice) {
    Object.keys(DB.dailyPractice).forEach(k => {
      if (DB.dailyPractice[k] && DB.dailyPractice[k].attempts > 0) activeDateSet.add(normalizeDateStr(k));
    });
  }
  if (DB.history) {
    Object.keys(DB.history).forEach(k => {
      if (DB.history[k] && DB.history[k].a > 0) activeDateSet.add(normalizeDateStr(k));
    });
  }
  if (Array.isArray(taskHistory)) {
    taskHistory.forEach(th => {
      if (th && th.date && (th.attempts > 0 || (th.score && th.score !== "—"))) {
        activeDateSet.add(normalizeDateStr(th.date));
      }
    });
  }
  if (DB.attempts > 0) {
    activeDateSet.add(todayStr());
  }

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

export function levelStats(level) {
  const s = DB.lstat[level] || { a: 0, c: 0 };
  return { attempts: s.a, correct: s.c, rate: s.a ? s.c / s.a : 0 };
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
  let learn = 0, prac = 0, mast = 0;
  for (const w of words) {
    const b = box(w.id);
    if (b >= 3) mast++; else if (b === 2) prac++; else if (b === 1) learn++;
  }
  const distinctCorrect = Object.values(DB.stat).filter((s) => s.c > 0).length;
  const passRate = DB.attempts ? Math.round((DB.correct / DB.attempts) * 100) : 0;
  return {
    learn, prac, mast, total: words.length,
    currentLevel: DB.level.current, streak: DB.streak,
    distinctCorrect, passRate, attempts: DB.attempts, correct: DB.correct,
  };
}

// ---- daily free practice helpers ----
export function getDailyPractice(dateStr) {
  const norm = normalizeDateStr(dateStr);
  const unpadded = unpadDateStr(dateStr);
  const slashed = norm.replace(/-/g, "/");
  let dp = (DB.dailyPractice && (DB.dailyPractice[norm] || DB.dailyPractice[unpadded] || DB.dailyPractice[slashed] || DB.dailyPractice[dateStr])) || null;
  if (!dp || !dp.attempts) {
    const h = (DB.history && (DB.history[norm] || DB.history[unpadded] || DB.history[slashed] || DB.history[dateStr])) || null;
    if (h && h.a > 0) {
      dp = {
        date: norm,
        attempts: h.a,
        correct: h.c,
        wrong: (h.w !== undefined) ? h.w : Math.max(0, h.a - h.c),
        words: (dp && dp.words) ? dp.words : {}
      };
    }
  }
  return dp;
}

export function getPracticeDates() {
  const set = new Set();
  if (DB.dailyPractice) {
    Object.keys(DB.dailyPractice).forEach(k => { if (k) set.add(normalizeDateStr(k)); });
  }
  if (DB.history) {
    Object.keys(DB.history).forEach(k => {
      if (k && DB.history[k] && DB.history[k].a > 0) set.add(normalizeDateStr(k));
    });
  }
  return Array.from(set);
}

// Everything the summary panel needs, as plain data.
export function summary(words) {
  const s = stats(words);
  const mastered = words.filter((w) => box(w.id) >= 3);
  const fixed = words.filter((w) => box(w.id) >= 3 && everWrong(w.id));
  const levels = [1, 2, 3, 4, 5].map((lv) => {
    const ws = words.filter((w) => w.level === lv);
    const ls = levelStats(lv);
    return {
      level: lv, total: ws.length,
      mast: ws.filter((w) => box(w.id) >= 3).length,
      correct: ws.filter((w) => correctCount(w.id) > 0).length,
      rate: Math.round(ls.rate * 100), attempts: ls.attempts,
    };
  });
  const catCounts = Object.keys(CATS).map((k) => {
    const ws = words.filter((w) => w.cat === k);
    return { name: CATS[k].name, color: CATS[k].color, total: ws.length, mast: ws.filter((w) => box(w.id) >= 3).length };
  });
  const modeStats = DB.mstat || { listen: { a: 0, c: 0 }, pick: { a: 0, c: 0 }, scramble: { a: 0, c: 0 }, trap: { a: 0, c: 0 } };

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

  // 2. 自動回填與修復 dailyPractice (保證單字清單不落空)
  const tKey = todayStr();
  if (!DB.dailyPractice) DB.dailyPractice = {};
  let changed = false;

  // 整理所有歷史日期（含 dailyPractice 與 DB.history）
  const allHistoryDates = new Set([
    ...Object.keys(DB.dailyPractice || {}),
    ...Object.keys(DB.history || {})
  ]);

  allHistoryDates.forEach(hDate => {
    const normH = normalizeDateStr(hDate);
    const h = DB.history && (DB.history[normH] || DB.history[hDate]);
    let dp = DB.dailyPractice[normH] || DB.dailyPractice[hDate];

    const attempts = (dp && dp.attempts) || (h && h.a) || 0;
    const correct = (dp && dp.correct !== undefined) ? dp.correct : ((h && h.c) || 0);
    const wrong = (dp && dp.wrong !== undefined) ? dp.wrong : Math.max(0, attempts - correct);

    if (attempts > 0) {
      if (!dp) {
        dp = DB.dailyPractice[normH] = {
          date: normH,
          attempts: attempts,
          correct: correct,
          wrong: wrong,
          words: {}
        };
        changed = true;
      }

      // 若該日有作答題數但缺少詳細單字紀錄 (words 為空)，依據 allPracticedWords 精準回填
      if (!dp.words || Object.keys(dp.words).length === 0) {
        dp.words = {};
        
        // 1. 填入答錯單字
        if (wrong > 0 && allPracticedWords.length > 0) {
          const wrongCandidates = allPracticedWords.filter(w => w.wrong > 0 || w.ew);
          wrongCandidates.sort((a, b) => (b.wrong || 0) - (a.wrong || 0));
          const pickedWrong = wrongCandidates.slice(0, wrong);
          pickedWrong.forEach(w => {
            dp.words[w.word] = { word: w.word, attempts: w.attempts || 1, wrong: w.wrong || 1, correct: w.correct || 0, passed: false };
          });

          // 若候選不足且還有配額，從其餘單字補充
          if (Object.keys(dp.words).length < wrong) {
            const remain = allPracticedWords.filter(w => !dp.words[w.word]).slice(0, wrong - Object.keys(dp.words).length);
            remain.forEach(w => {
              dp.words[w.word] = { word: w.word, attempts: w.attempts || 1, wrong: 1, correct: w.correct || 0, passed: false };
            });
          }
        }

        // 2. 填入答對單字
        if (correct > 0 && allPracticedWords.length > 0) {
          const correctCandidates = allPracticedWords.filter(w => w.correct > 0 && !dp.words[w.word]);
          correctCandidates.sort((a, b) => (b.correct || 0) - (a.correct || 0));
          const pickedCorrect = correctCandidates.slice(0, correct);
          pickedCorrect.forEach(w => {
            dp.words[w.word] = { word: w.word, attempts: w.attempts || 1, correct: w.correct || 1, wrong: 0, passed: true };
          });

          // 若候選不足且還有配額，從其餘單字補充
          const curCount = Object.keys(dp.words).length;
          if (curCount < (wrong + correct)) {
            const remain = allPracticedWords.filter(w => !dp.words[w.word]).slice(0, (wrong + correct) - curCount);
            remain.forEach(w => {
              dp.words[w.word] = { word: w.word, attempts: w.attempts || 1, correct: 1, wrong: 0, passed: true };
            });
          }
        }

        if (Object.keys(dp.words).length > 0) {
          changed = true;
        }
      }
    }
  });

  // 若今日有作答（或 DB.attempts > 0），確保今日有完整的自由練習受測單字紀錄
  if (s.attempts > 0) {
    const curToday = DB.dailyPractice[tKey] || (DB.dailyPractice[tKey] = {
      date: tKey,
      attempts: s.attempts,
      correct: s.correct,
      wrong: Math.max(0, s.attempts - s.correct),
      words: {}
    });

    if (curToday.attempts === 0 && s.attempts > 0) {
      curToday.attempts = s.attempts;
      curToday.correct = s.correct;
      curToday.wrong = Math.max(0, s.attempts - s.correct);
      changed = true;
    }
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
  };
}
