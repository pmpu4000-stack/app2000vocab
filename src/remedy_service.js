// =====================================================================
// remedy_service.js — 週末消滅戰、寒暑假補強題庫與平日錯題滾入服務模組
// =====================================================================
import * as store from "./store.js";
import { normalizeDateStr } from "./store.js";
import { updateWeekConquerSection } from "./ui_conquer.js";

const todayDateStr = () => store.formatDateYMD();
const getWeekMondayDate = () => store.getWeekRangeDates().monday;
const getWeekFridayDate = () => store.getWeekRangeDates().friday;
const getWeekSaturdayDate = () => store.getWeekRangeDates().saturday;

export function getSaturdayRemedyRecord() {
  const satDateStr = getWeekSaturdayDate();
  const mondayStr = getWeekMondayDate();

  // 1. 本地記錄 weekend_remedy_${mondayStr}
  try {
    const rawRemedy = localStorage.getItem("weekend_remedy_" + mondayStr);
    if (rawRemedy) {
      const data = JSON.parse(rawRemedy);
      if (data && data.satCompleted) {
        return {
          completed: true,
          wrongWords: Array.isArray(data.satWrongWords) ? data.satWrongWords : [],
          correctWords: Array.isArray(data.satCorrectWords) ? data.satCorrectWords : [],
          score: data.satScore || "",
          rate: data.satRate || "",
          date: satDateStr
        };
      }
    }
  } catch(_) {}

  // 2. 本地 task_summary_${satDateStr}
  try {
    const rawSummary = localStorage.getItem("task_summary_" + satDateStr);
    if (rawSummary) {
      const summary = JSON.parse(rawSummary);
      if (summary && summary.completed) {
        return {
          completed: true,
          wrongWords: Array.isArray(summary.wrongWords) ? summary.wrongWords : [],
          correctWords: Array.isArray(summary.correctWords) ? summary.correctWords : [],
          score: `${summary.score}/${summary.total}`,
          rate: summary.rate || "",
          date: satDateStr
        };
      }
    }
  } catch(_) {}

  // 3. student_task_history
  try {
    const hist = store.getCachedTaskHistory();
    if (Array.isArray(hist) && hist.length > 0) {
      const satItem = hist.find(item => {
        if (!item || !item.date) return false;
        const nd = normalizeDateStr(item.date);
        return nd === satDateStr && (String(item.taskName || "").includes("週末") || item.isWeekend);
      });
      if (satItem) {
        return {
          completed: true,
          wrongWords: Array.isArray(satItem.wrongWords) ? satItem.wrongWords : [],
          correctWords: Array.isArray(satItem.correctWords) ? satItem.correctWords : [],
          score: satItem.score || "",
          rate: satItem.rate || "",
          date: satDateStr
        };
      }
    }
  } catch(_) {}

  return null;
}

// ── 寒暑假判定與假日弱點補強題庫管理 ──
export function getVacationInfo(d = new Date()) {
  const forceMode = localStorage.getItem("is_vacation_mode");
  if (forceMode === "winter") return { isVacation: true, type: "winter", name: "寒假" };
  if (forceMode === "summer") return { isVacation: true, type: "summer", name: "暑假" };
  if (forceMode === "true")   return { isVacation: true, type: "vacation", name: "假期" };

  const m = d.getMonth() + 1;
  const date = d.getDate();

  if (m === 7 || m === 8) {
    return { isVacation: true, type: "summer", name: "暑假" };
  }
  if ((m === 1 && date >= 15) || (m === 2 && date <= 25)) {
    return { isVacation: true, type: "winter", name: "寒假" };
  }

  return { isVacation: false, type: "", name: "" };
}

export function recordSundayRemainingMistakes(words) {
  if (!Array.isArray(words) || words.length === 0) return;
  try {
    const raw = localStorage.getItem("vacation_pending_mistakes");
    const list = raw ? JSON.parse(raw) : [];
    const learnedRaw = localStorage.getItem("remedy_learned_words");
    const learnedList = learnedRaw ? JSON.parse(learnedRaw) : [];

    let addedCount = 0;
    words.forEach(w => {
      const cw = String(w).trim().toLowerCase();
      if (cw && !learnedList.includes(cw) && !list.includes(cw)) {
        list.push(cw);
        addedCount++;
      }
    });
    localStorage.setItem("vacation_pending_mistakes", JSON.stringify(list));
    console.log(`[Remedy] 週日剩餘錯題共 ${words.length} 題，已納入寒暑假平日補強題庫（新增 ${addedCount} 題，現有總數 ${list.length} 題）`);
  } catch(_) {}
}

export function markWordLearnedInFreePractice(word) {
  const cleanWord = String(word).trim().toLowerCase();
  if (!cleanWord) return;

  try {
    const rawLearned = localStorage.getItem("remedy_learned_words");
    const learnedList = rawLearned ? JSON.parse(rawLearned) : [];
    if (!learnedList.includes(cleanWord)) {
      learnedList.push(cleanWord);
      localStorage.setItem("remedy_learned_words", JSON.stringify(learnedList));
      if (typeof store.invalidateRemedyLearnedCache === "function") store.invalidateRemedyLearnedCache();
    }

    const rawVacation = localStorage.getItem("vacation_pending_mistakes");
    if (rawVacation) {
      const vList = JSON.parse(rawVacation);
      if (Array.isArray(vList) && vList.includes(cleanWord)) {
        const filtered = vList.filter(w => w !== cleanWord);
        localStorage.setItem("vacation_pending_mistakes", JSON.stringify(filtered));
      }
    }

    const rawMistakes = localStorage.getItem("weekTaskMistakes");
    if (rawMistakes) {
      const map = JSON.parse(rawMistakes);
      let changed = false;
      for (const dKey in map) {
        if (Array.isArray(map[dKey]) && map[dKey].includes(cleanWord)) {
          map[dKey] = map[dKey].filter(w => w !== cleanWord);
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem("weekTaskMistakes", JSON.stringify(map));
      }
    }

    const mondayStr = getWeekMondayDate();
    const rawRemedy = localStorage.getItem("weekend_remedy_" + mondayStr);
    if (rawRemedy) {
      const rObj = JSON.parse(rawRemedy);
      if (rObj && Array.isArray(rObj.satWrongWords) && rObj.satWrongWords.includes(cleanWord)) {
        rObj.satWrongWords = rObj.satWrongWords.filter(w => w !== cleanWord);
        localStorage.setItem("weekend_remedy_" + mondayStr, JSON.stringify(rObj));
      }
    }

    try {
      if (typeof document !== "undefined" && typeof updateWeekConquerSection === "function") {
        updateWeekConquerSection();
      }
    } catch(_) {}
  } catch(_) {}
}

export function getVacationDayAssignedWords(dayOfWeek) {
  if (dayOfWeek < 1 || dayOfWeek > 5) return [];

  try {
    const raw = localStorage.getItem("vacation_pending_mistakes");
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return [];

    const learnedSet = store.getRemedyLearnedSet();
    const activeList = list.filter(w => !learnedSet.has(String(w).trim().toLowerCase()));

    if (activeList.length === 0) return [];

    const slot = dayOfWeek - 1;
    return activeList.filter((_, idx) => (idx % 5) === slot);
  } catch(_) {
    return [];
  }
}

export function getConquerRollSettings() {
  return store.getConquerRollSettings();
}

export function recordTaskMistake(word) {
  try {
    const raw = localStorage.getItem("weekTaskMistakes");
    const map = raw ? JSON.parse(raw) : {};
    const tStr = todayDateStr();
    if (!map[tStr]) map[tStr] = [];
    const cleanWord = String(word).trim().toLowerCase();
    if (!map[tStr].includes(cleanWord)) {
      map[tStr].push(cleanWord);
    }
    localStorage.setItem("weekTaskMistakes", JSON.stringify(map));
  } catch(_) {}
}

export function unmarkWordLearnedInFreePractice(word) {
  try {
    const raw = localStorage.getItem("remedy_learned_words");
    if (!raw) return;
    const list = JSON.parse(raw);
    const cleanWord = String(word).trim().toLowerCase();
    if (Array.isArray(list) && list.includes(cleanWord)) {
      const updated = list.filter(w => w !== cleanWord);
      localStorage.setItem("remedy_learned_words", JSON.stringify(updated));
      if (typeof store.invalidateRemedyLearnedCache === "function") store.invalidateRemedyLearnedCache();
    }
  } catch(_) {}
}

export function getMonToFriUnfinishedWords() {
  const unfinishedWords = new Set();
  const mondayStr = getWeekMondayDate();
  const fridayStr = getWeekFridayDate();

  try {
    const historyList = store.getCachedTaskHistory();
    if (Array.isArray(historyList) && historyList.length > 0) {
      historyList.forEach(item => {
        if (!item || !item.date) return;
        const iDate = String(item.date).trim().replace(/\//g, "-");
        if (iDate >= mondayStr && iDate <= fridayStr) {
          if (Array.isArray(item.wrongWords)) {
            item.wrongWords.forEach(w => {
              const cw = String(w).trim().toLowerCase();
              if (cw) unfinishedWords.add(cw);
            });
          }
          if (Array.isArray(item.freeWrongWords)) {
            item.freeWrongWords.forEach(w => {
              const cw = String(w).trim().toLowerCase();
              if (cw) unfinishedWords.add(cw);
            });
          }
          const status = String(item.status || "");
          const score = String(item.score || "");
          const isUnattempted = !status.includes("已完成") || score === "—" || score === "尚未開始";
          if (isUnattempted && Array.isArray(item.words)) {
            item.words.forEach(w => {
              const cw = String(w).trim().toLowerCase();
              if (cw) unfinishedWords.add(cw);
            });
          }
        }
      });
    }
  } catch(_) {}

  try {
    const rawMistakes = localStorage.getItem("weekTaskMistakes");
    if (rawMistakes) {
      const map = JSON.parse(rawMistakes);
      for (const dateKey in map) {
        if (dateKey >= mondayStr && dateKey <= fridayStr) {
          const d = new Date(dateKey.replace(/-/g, "/"));
          const dayOfWeek = d.getDay();
          if (dayOfWeek >= 1 && dayOfWeek <= 5 && Array.isArray(map[dateKey])) {
            map[dateKey].forEach(w => {
              const cw = String(w).trim().toLowerCase();
              if (cw) unfinishedWords.add(cw);
            });
          }
        }
      }
    }
  } catch(_) {}

  try {
    const rollCfg = getConquerRollSettings();
    if (rollCfg && rollCfg.rollFreeMistakes) {
      const dpMap = (typeof store.getDailyPracticeMap === "function") ? store.getDailyPracticeMap() : null;
      if (dpMap) {
        for (const dateKey in dpMap) {
          const normD = String(dateKey).trim().split(" ")[0].replace(/\//g, "-");
          if (normD >= mondayStr && normD <= fridayStr) {
            const dp = dpMap[dateKey];
            if (dp && dp.words) {
              for (const wKey in dp.words) {
                const info = dp.words[wKey];
                if (info && (info.wrong > 0 || info.lastResult === "wrong" || info.hadCorrectThenWrong)) {
                  const cw = String(wKey).trim().toLowerCase();
                  if (cw) unfinishedWords.add(cw);
                }
              }
            }
          }
        }
      }
    }
  } catch(_) {}

  try {
    const learnedSet = store.getRemedyLearnedSet();
    if (learnedSet && learnedSet.size > 0) {
      return Array.from(unfinishedWords).filter(w => !learnedSet.has(w));
    }
  } catch(_) {}

  return Array.from(unfinishedWords);
}

export const getMonToFriMistakes = getMonToFriUnfinishedWords;
