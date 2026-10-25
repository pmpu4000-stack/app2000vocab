// =====================================================================
// app.js — the controller. Boots the word bank, runs the placement test,
// drives level-based practice, gates progression behind challenges,
// and manages teacher-assigned tasks & weekend mistake remediation.
// =====================================================================
import { loadWordBank, wordsAtLevel } from "./wordbank.js?v=20261025_1618";
import * as store from "./store.js?v=20261019_v228";
import { normalizeDateStr } from "./store.js?v=20261019_v228";
import { nextWord } from "./srs.js?v=20261019_v228";
import * as ui from "./ui.js?v=20261025_2049";
import { burst } from "./confetti.js?v=20261019_v228";
import {
  LEVELS, levelColor, levelName, sample,
  PASS_RATE, GATE_MIN_ATTEMPTS, CHALLENGE_LEN, PLACEMENT_PER_LEVEL, DAILY_GOAL,
} from "./levels.js?v=20261019_v228";

let WORDS = [];
const state = { mode: "listen", word: null, answered: false, round: null, activeRepairRequired: false };

// ── 今日指定任務與週末錯題狀態 ──
const taskState = {
  active       : false,
  pending      : false,
  index        : 0,
  pool         : [],
  correct      : 0,
  task         : null,
  correctWords : [],
  wrongWords   : [],
  hadCorrectThenWrong: []
};

// ── 隨時保存任務中途進度（中途存檔或強制關閉防護） ──
let taskCloudSyncTimer = null;
function scheduleCloudTaskSync() {
  if (taskCloudSyncTimer) clearTimeout(taskCloudSyncTimer);
  taskCloudSyncTimer = setTimeout(() => {
    taskCloudSyncTimer = null;
    if (typeof window !== "undefined" && typeof window.uploadLocalStorageData === "function") {
      window.uploadLocalStorageData(true, true);
    }
  }, 1000);
}

function persistTaskProgress() {
  if (!taskState.task || !taskState.pool || taskState.pool.length === 0) return;
  try {
    const todayDash = todayDateStr();
    const todaySlash = todayDash.replace(/-/g, "/");
    const currentUser = (localStorage.getItem("current_user") || "").trim();
    const poolWords = taskState.pool.map(w => {
      const str = typeof w === "string" ? w : (w.word || w.display || w.w);
      return String(str || "").trim().toLowerCase();
    }).filter(Boolean);

    const saveObj = {
      date                : todayDash,
      username            : currentUser,
      task                : taskState.task,
      pool                : taskState.pool,
      words               : poolWords,
      index               : taskState.index,
      correct             : taskState.correct,
      correctWords        : taskState.correctWords || [],
      wrongWords          : taskState.wrongWords || [],
      hadCorrectThenWrong : taskState.hadCorrectThenWrong || []
    };
    const jsonStr = JSON.stringify(saveObj);
    localStorage.setItem("today_task_in_progress", jsonStr);
    if (currentUser) {
      localStorage.setItem("today_task_in_progress_" + currentUser.toLowerCase(), jsonStr);
    }
    if (poolWords.length > 0) {
      localStorage.setItem("task_words_" + todayDash, JSON.stringify(poolWords));
      localStorage.setItem("task_words_" + todaySlash, JSON.stringify(poolWords));
    }

    // 標記有新進度待同步，並排程自動上傳雲端試算表
    window.hasUnsavedChanges = true;
    scheduleCloudTaskSync();
  } catch(e) {
    console.error("persistTaskProgress error:", e);
  }
}

const wordsAt = (level) => wordsAtLevel(WORDS, level);

const todayDateStr = () => store.formatDateYMD();
const getWeekMondayDate = () => store.getWeekRangeDates().monday;
const getWeekFridayDate = () => store.getWeekRangeDates().friday;
const getWeekSaturdayDate = () => store.getWeekRangeDates().saturday;
const getWeekSundayDate = () => store.getWeekRangeDates().sunday;

function getSaturdayRemedyRecord() {
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
    const rawHist = localStorage.getItem("student_task_history");
    if (rawHist) {
      const hist = JSON.parse(rawHist);
      if (Array.isArray(hist)) {
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
    }
  } catch(_) {}

  return null;
}

// ── 寒暑假判定與假日弱點補強題庫管理 ──
function getVacationInfo(d = new Date()) {
  const forceMode = localStorage.getItem("is_vacation_mode");
  if (forceMode === "winter") return { isVacation: true, type: "winter", name: "寒假" };
  if (forceMode === "summer") return { isVacation: true, type: "summer", name: "暑假" };
  if (forceMode === "true")   return { isVacation: true, type: "vacation", name: "假期" };

  const m = d.getMonth() + 1; // 1 ~ 12
  const date = d.getDate();

  // 暑假：7月、8月
  if (m === 7 || m === 8) {
    return { isVacation: true, type: "summer", name: "暑假" };
  }
  // 寒假：1月中旬 ~ 2月下旬 (約1/15 ~ 2/25)
  if ((m === 1 && date >= 15) || (m === 2 && date <= 25)) {
    return { isVacation: true, type: "winter", name: "寒假" };
  }

  return { isVacation: false, type: "", name: "" };
}

// 星期日補考測驗仍答錯的單字，存入寒暑假平日補強庫
function recordSundayRemainingMistakes(words) {
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

// 若在施測後自主練習答對，則登記為已學會，從假日與寒暑假指派測驗中移除
function markWordLearnedInFreePractice(word) {
  const cleanWord = String(word).trim().toLowerCase();
  if (!cleanWord) return;

  try {
    // 1. 登記為已學會 (remedy_learned_words)
    const rawLearned = localStorage.getItem("remedy_learned_words");
    const learnedList = rawLearned ? JSON.parse(rawLearned) : [];
    if (!learnedList.includes(cleanWord)) {
      learnedList.push(cleanWord);
      localStorage.setItem("remedy_learned_words", JSON.stringify(learnedList));
    }

    // 2. 從寒暑假待補強題庫 (vacation_pending_mistakes) 中移除
    const rawVacation = localStorage.getItem("vacation_pending_mistakes");
    if (rawVacation) {
      const vList = JSON.parse(rawVacation);
      if (Array.isArray(vList) && vList.includes(cleanWord)) {
        const filtered = vList.filter(w => w !== cleanWord);
        localStorage.setItem("vacation_pending_mistakes", JSON.stringify(filtered));
        console.log(`[Remedy] 單字 "${cleanWord}" 已在自主練習中答對，登記為已學會，已從寒暑假補強題庫移除！`);
      }
    }

    // 3. 從週末錯題庫 (weekTaskMistakes) 中移除，不加入假日指派測驗
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
        console.log(`[Remedy] 單字 "${cleanWord}" 已從週末錯題庫移除，不加入假日指派測驗！`);
      }
    }

    // 4. 從週六補救紀錄 (weekend_remedy_) 中移除，確保週日不指派
    const mondayStr = getWeekMondayDate();
    const rawRemedy = localStorage.getItem("weekend_remedy_" + mondayStr);
    if (rawRemedy) {
      const rObj = JSON.parse(rawRemedy);
      if (rObj && Array.isArray(rObj.satWrongWords) && rObj.satWrongWords.includes(cleanWord)) {
        rObj.satWrongWords = rObj.satWrongWords.filter(w => w !== cleanWord);
        localStorage.setItem("weekend_remedy_" + mondayStr, JSON.stringify(rObj));
      }
    }

    // 5. 即時更新「本週待攻克單字」介面區塊
    try {
      if (typeof ui !== "undefined" && typeof ui.updateWeekConquerSection === "function") {
        ui.updateWeekConquerSection();
      }
    } catch(_) {}
  } catch(_) {}
}

// 寒假暑假星期一到五：平均分配每日指派測驗內容
function getVacationDayAssignedWords(dayOfWeek) {
  // dayOfWeek: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
  if (dayOfWeek < 1 || dayOfWeek > 5) return [];

  try {
    const raw = localStorage.getItem("vacation_pending_mistakes");
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return [];

    // 剔除已學會的單字
    const learnedRaw = localStorage.getItem("remedy_learned_words");
    const learnedList = learnedRaw ? JSON.parse(learnedRaw) : [];
    const activeList = list.filter(w => !learnedList.includes(String(w).trim().toLowerCase()));

    if (activeList.length === 0) return [];

    // 平均分配到星期一到五：依索引模 5 分配給週一至週五
    const slot = dayOfWeek - 1; // 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri
    const assigned = activeList.filter((_, idx) => (idx % 5) === slot);
    return assigned;
  } catch(_) {
    return [];
  }
}

// ── 錯題記錄：記錄平日測驗與自由練習中答錯的單字（滾入週末消滅戰） ──
function getConquerRollSettings() {
  try {
    const raw = localStorage.getItem("conquer_roll_settings");
    if (raw) return JSON.parse(raw);
  } catch(_) {}
  return { rollTaskMistakes: true, rollFreeMistakes: false };
}

function recordTaskMistake(word) {
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

function unmarkWordLearnedInFreePractice(word) {
  try {
    const raw = localStorage.getItem("remedy_learned_words");
    if (!raw) return;
    const list = JSON.parse(raw);
    const cleanWord = String(word).trim().toLowerCase();
    if (Array.isArray(list) && list.includes(cleanWord)) {
      const updated = list.filter(w => w !== cleanWord);
      localStorage.setItem("remedy_learned_words", JSON.stringify(updated));
    }
  } catch(_) {}
}

// ── 取得學生於星期一到星期五沒有答對（包含沒有作答/缺考/自由練習寫錯）的所有單字 ──
function getMonToFriUnfinishedWords() {
  const unfinishedWords = new Set();
  const mondayStr = getWeekMondayDate();
  const fridayStr = getWeekFridayDate();

  // 1. 從 student_task_history（由雲端試算表歷程同步）讀取本週一至週五任務與自由練習錯題
  try {
    const rawHist = localStorage.getItem("student_task_history");
    if (rawHist) {
      const historyList = JSON.parse(rawHist);
      if (Array.isArray(historyList)) {
        historyList.forEach(item => {
          if (!item || !item.date) return;
          const iDate = String(item.date).trim().replace(/\//g, "-");
          if (iDate >= mondayStr && iDate <= fridayStr) {
            // (a) 指定測驗中答錯的單字
            if (Array.isArray(item.wrongWords)) {
              item.wrongWords.forEach(w => {
                const cw = String(w).trim().toLowerCase();
                if (cw) unfinishedWords.add(cw);
              });
            }
            // (b) 自由練習中答錯的單字
            if (Array.isArray(item.freeWrongWords)) {
              item.freeWrongWords.forEach(w => {
                const cw = String(w).trim().toLowerCase();
                if (cw) unfinishedWords.add(cw);
              });
            }
            // (c) 若該任務狀態未完成、缺考或沒有作答（例如尚未開始或 score 為 "—"）
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
    }
  } catch(_) {}

  // 2. 從 weekTaskMistakes（本機即時記錄）讀取本週一至週五的錯題（包含自由練習答錯單字）
  try {
    const rawMistakes = localStorage.getItem("weekTaskMistakes");
    if (rawMistakes) {
      const map = JSON.parse(rawMistakes);
      for (const dateKey in map) {
        if (dateKey >= mondayStr && dateKey <= fridayStr) {
          const d = new Date(dateKey.replace(/-/g, "/"));
          const dayOfWeek = d.getDay();
          if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            if (Array.isArray(map[dateKey])) {
              map[dateKey].forEach(w => {
                const cw = String(w).trim().toLowerCase();
                if (cw) unfinishedWords.add(cw);
              });
            }
          }
        }
      }
    }
  } catch(_) {}

  // 3. 從 dailyPractice（自由練習作答歷程）讀取本週一至週五答錯的單字
  try {
    const rawData = localStorage.getItem("app2000vocab_data");
    if (rawData) {
      const dbObj = JSON.parse(rawData);
      if (dbObj && dbObj.dailyPractice) {
        for (const dateKey in dbObj.dailyPractice) {
          const normD = String(dateKey).trim().split(" ")[0].replace(/\//g, "-");
          if (normD >= mondayStr && normD <= fridayStr) {
            const dp = dbObj.dailyPractice[dateKey];
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

  // 4. 排除已在自主練習中答對並登記為已學會的單字（不加入假日指派測驗）
  try {
    const rawLearned = localStorage.getItem("remedy_learned_words");
    const learnedList = rawLearned ? JSON.parse(rawLearned) : [];
    if (Array.isArray(learnedList) && learnedList.length > 0) {
      const learnedSet = new Set(learnedList.map(w => String(w).trim().toLowerCase()));
      return Array.from(unfinishedWords).filter(w => !learnedSet.has(w));
    }
  } catch(_) {}

  return Array.from(unfinishedWords);
}

const getMonToFriMistakes = getMonToFriUnfinishedWords;

function levelInfo() {
  const prog = store.progress();
  return LEVELS.map((L) => {
    const ws = wordsAt(L.n);
    const mast = ws.filter((w) => store.box(w.id) >= 3).length;
    const st = L.n > prog.unlocked ? "locked" : L.n === prog.current ? "current" : "open";
    return { n: L.n, name: L.name, color: L.color, state: st, pct: ws.length ? Math.round((mast / ws.length) * 100) : 0 };
  });
}

function refreshChrome() {
  if (typeof window !== "undefined") window.refreshChrome = refreshChrome;
  const taskGoal = (taskState.pool && taskState.pool.length > 0) 
    ? taskState.pool.length 
    : (taskState.task && taskState.task.words ? taskState.task.words.length : DAILY_GOAL);

  let sessionS = store.sessionState();
  let sessionGoal = DAILY_GOAL;
  let sessionTitle = null;

  if (taskState.active && taskState.task) {
    sessionGoal = taskGoal;
    const ansCount = taskState.index;
    const correctCount = taskState.correct;
    const incorrCount = ansCount - correctCount;
    const rRate = ansCount > 0 ? Math.round((correctCount / ansCount) * 100) : 0;
    sessionS = {
      active: true,
      answered: ansCount,
      correct: correctCount,
      incorrect: incorrCount,
      rate: rRate
    };
    sessionTitle = `今日指定測驗 <span>【${taskState.task.taskName}】目標 ${taskGoal} 字</span>`;
  } else if (taskState.pending && taskState.task) {
    sessionGoal = taskGoal;
    sessionTitle = `今日指定測驗 <span>【${taskState.task.taskName}】目標 ${taskGoal} 字</span>`;
  }

  ui.renderSession(sessionS, sessionGoal, onSessionStart, onSessionEnd, sessionTitle);
  ui.renderProgress(store.summary(WORDS));
  ui.renderLevelBar(levelInfo(), pickLevel);
  const cur = store.progress().current;
  const ls = store.levelStats(cur, WORDS);
  const ready = ls.attempts >= GATE_MIN_ATTEMPTS && ls.rate >= PASS_RATE;
  let hint;
  if (ready) hint = "🎉 已達標！挑戰成功就能升級到下一關。";
  else if (ls.attempts < GATE_MIN_ATTEMPTS) hint = `再練習 ${GATE_MIN_ATTEMPTS - ls.attempts} 字（正確率保持 ≥80%）就能挑戰。`;
  else hint = "單字正確率再高一點（需 ≥80%）就能挑戰本關。";
  ui.renderBanner(cur, ls, ready, hint, startChallenge);
  if (typeof ui.initExportRecordsCard === "function") {
    ui.initExportRecordsCard(() => store.summary(WORDS));
  }
  const isLocked = (typeof window !== "undefined") && (window.__dailyUsageTimeIsUp || (window.dailyUsageState && window.dailyUsageState.isLockedDown) || document.body.classList.contains("daily-limit-reached"));
  if (!isLocked && !ui.summaryHidden()) ui.renderSummary(store.summary(WORDS));

  // ⚠️ 今日指定測驗進行中、待開始或尚未結束：強制隱藏模式列、關卡列與等級挑戰橫幅
  if (taskState.active || taskState.pending || isDesignatedTaskPendingToday()) {
    const modesEl = document.getElementById("modes");
    if (modesEl) modesEl.style.display = "none";
    const levelBar = document.getElementById("levelbar");
    if (levelBar) levelBar.style.display = "none";
    const bannerEl = document.getElementById("banner");
    if (bannerEl) bannerEl.style.display = "none";
  }

  // ⚠️ 今日練習時間已結束：一併隱藏模式列、關卡列與等級挑戰橫幅，留下乾淨清爽畫面
  if (window.__dailyUsageTimeIsUp || (window.dailyUsageState && window.dailyUsageState.isLockedDown) || document.body.classList.contains("daily-limit-reached")) {
    const modesEl = document.getElementById("modes");
    if (modesEl) modesEl.style.display = "none";
    const levelBar = document.getElementById("levelbar");
    if (levelBar) levelBar.style.display = "none";
    const bannerEl = document.getElementById("banner");
    if (bannerEl) bannerEl.style.display = "none";
  }

  // 作答開始或題目切換時，讓題卡上緣距離螢幕邊界與左右兩邊距離螢幕邊界相等
  const cardEl = document.getElementById("card");
  if (cardEl) {
    const rect = cardEl.getBoundingClientRect();
    const sideMargin = Math.max(0, rect.left);
    const targetY = window.pageYOffset + rect.top - sideMargin;
    window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
  }
}

function renderCurrent() {
  const isTask = taskState.active;
  state.round = ui.renderRound(state.word, state.mode, { 
    onAnswer: answer, 
    onCheck: check
  });
  
  // ── 若為今日任務模式：嚴格鎖定純聽拼、隱藏模式與關卡 ──
  if (isTask && taskState.task) {
    const catLabel = document.getElementById("catlabel");
    const modeHint = document.getElementById("modehint");
    const isWeekendTask = !!taskState.task.isWeekend;
    if (catLabel) {
      catLabel.textContent = isWeekendTask
        ? `🔥 週末任務 (${taskState.index + 1}/${taskState.pool.length})`
        : `🎯 今日任務 (${taskState.index + 1}/${taskState.pool.length})`;
      catLabel.style.background = isWeekendTask
        ? "linear-gradient(135deg, #ef4444, #f59e0b)"
        : "linear-gradient(135deg, #6366f1, #8b5cf6)";
    }
    if (modeHint) {
      modeHint.textContent = `【${taskState.task.taskName}】${isWeekendTask ? "弱點衝刺拼字中" : "純聽拼測驗中"}`;
    }

    // 嚴格強制隱藏關卡/模式列與挑戰橫幅
    const modesEl = document.getElementById("modes");
    if (modesEl) modesEl.style.display = "none";
    const levelBar = document.getElementById("levelbar");
    if (levelBar) levelBar.style.display = "none";
    const bannerEl = document.getElementById("banner");
    if (bannerEl) bannerEl.style.display = "none";
  }

  // 作答開始或題目切換時，讓題卡上緣距離螢幕邊界與左右兩邊距離螢幕邊界相等
  const cardEl = document.getElementById("card");
  if (cardEl) {
    const rect = cardEl.getBoundingClientRect();
    const sideMargin = Math.max(0, rect.left);
    const targetY = window.pageYOffset + rect.top - sideMargin;
    window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
  }
}

// ── 學生使用時間管制 (支援全校預設與個別學生設定) ──
function isCurfewActive() {
  const role = localStorage.getItem("user_role") || "student";
  if (role === "teacher" || role === "admin") return false;
  const isUnlocked = sessionStorage.getItem("time_restriction_unlocked") === "true";
  if (isUnlocked) return false;
  const sTime = sessionStorage.getItem("user_start_time") || "07:30";
  const eTime = sessionStorage.getItem("user_end_time") || "22:00";
  const sp = sTime.split(":");
  const ep = eTime.split(":");
  const startMin = (Number(sp[0]) || 7) * 60 + (Number(sp[1]) || 30);
  const endMin = (Number(ep[0]) || 22) * 60 + (Number(ep[1]) || 0);
  const d = new Date();
  const mins = d.getHours() * 60 + d.getMinutes();
  return (mins < startMin || mins > endMin);
}


// ── 自動 3 秒進入下一題計時器 ──
let autoNextTimer = null;
let autoNextInterval = null;

function clearAutoNextTimer() {
  if (autoNextTimer) {
    clearTimeout(autoNextTimer);
    autoNextTimer = null;
  }
  if (autoNextInterval) {
    clearInterval(autoNextInterval);
    autoNextInterval = null;
  }
}

function scheduleAutoNext() {
  // 自動倒數跳下一題與秒數倒數已依需求全面移除，作答後由使用者主動點擊按鈕推進下一題
  clearAutoNextTimer();
}

function newRound() {
  clearAutoNextTimer();
  if (typeof window !== "undefined" && window.__dailyUsageTimeIsUp === true) {
    return;
  }
  if (isCurfewActive()) {
    const curfewEl = document.getElementById("curfew-overlay");
    if (curfewEl) curfewEl.style.display = "flex";
    return;
  }

  // ── 如果今日任務進行中 ──
  if (taskState.active) {
    if (taskState.pool && taskState.pool.length > 0 && taskState.index < taskState.pool.length) {
      state.word = taskState.pool[taskState.index];
      state.answered = false;
      renderCurrent();
      return;
    } else {
      // 任務所有題目作答完畢！
      finishTaskMode();
      return;
    }
  }

  // ★ 核心守衛：若今日有指定測驗尚未結束（待開始、中途未完成、有登入無作答），絕對禁止產生自由練習題目！
  if (isDesignatedTaskPendingToday()) {
    if (taskState.task && taskState.pool && taskState.pool.length > 0) {
      startTaskExecution();
      return;
    } else {
      checkAndStartDailyTask();
      if (taskState.task && taskState.pool && taskState.pool.length > 0) {
        startTaskExecution();
        return;
      }
    }
  }

  // ── 一般自由闖關（唯有今日指定測驗完全結束後才開放）──
  state.word = nextWord(WORDS, store.progress().current, state.word?.id);
  state.answered = false;
  renderCurrent();
}

function check() {
  if (state.activeRepairRequired) {
    ui.focusActiveRepair();
    return;
  }
  if (state.answered) { clearAutoNextTimer(); newRound(); return; }
  const getGuess = state.round.getGuess;
  if (!getGuess) return;
  const guess = getGuess();
  if (!guess) { ui.note("先拼拼看再檢查喔 ✏️"); return; }
  const correct = guess.trim().toLowerCase() === state.word.word.toLowerCase();
  state.round.applyTypedResult(correct);
  answer(correct, guess);
}

function answer(correct, guessVal) {
  if (state.answered) return;
  state.answered = true;

  // ── 若在指定任務中 ──
  if (taskState.active) {
    const w = String(state.word.word).trim().toLowerCase();
    taskState.correctWords = taskState.correctWords || [];
    taskState.wrongWords = taskState.wrongWords || [];
    taskState.hadCorrectThenWrong = taskState.hadCorrectThenWrong || [];

    if (correct) {
      taskState.correct++;
      if (!taskState.correctWords.includes(w)) {
        taskState.correctWords.push(w);
      }
      // 依需求取消答對單字灑花特效
    } else {
      if (!taskState.wrongWords.includes(w)) {
        taskState.wrongWords.push(w);
      }
      if (taskState.correctWords.includes(w) && !taskState.hadCorrectThenWrong.includes(w)) {
        taskState.hadCorrectThenWrong.push(w);
      }
      // 週末消滅戰錯題補救庫：記錄答錯單字
      recordTaskMistake(w);
    }
    
    // 依然更新背單字進度 (指定任務模式 isFree=false，優先記錄該單字所屬正確關卡 Level)
    const wordLevel = (state.word && state.word.level) || store.progress().current;
    const info = store.grade(state.word.id, correct, wordLevel, state.mode, state.word.word, false);
    taskState.index++;
    // 每作答完一題立即更新持久化進度並同步雲端！
    persistTaskProgress();
    refreshChrome();

    if (correct) {
      ui.showResult(true, state.word, info);
      ui.setActionNext();
      scheduleAutoNext();
    } else {
      state.activeRepairRequired = true;
      ui.showResult(false, state.word, info, guessVal, () => {
        state.activeRepairRequired = false;
      });
    }
    return;
  }

  // ── 自由闖關中作答：正常升降級，同步收錄至每日自由練習作答歷程 ──
  const wordLevel = (state.word && state.word.level) || store.progress().current;
  const info = store.grade(state.word.id, correct, wordLevel, state.mode, state.word.word, true);
  
  if (state.word && state.word.word) {
    const w = String(state.word.word).trim().toLowerCase();
    if (correct) {
      // ★ 核心規則：如果在自由練習中答對，則登記為已學會，從待攻克單字中消滅！
      markWordLearnedInFreePractice(w);
    } else {
      // ★ 核心新規範：自由練習純屬自由探索，答錯不懲罰、不滾入週末或雙週待攻克測驗！
      // 唯若此字先前曾暫時標記學會，則在此次答錯時復原狀態
      unmarkWordLearnedInFreePractice(w);
    }
    try {
      if (typeof ui !== "undefined" && typeof ui.updateWeekConquerSection === "function") {
        ui.updateWeekConquerSection();
      }
    } catch(_) {}
  }

  // 依需求取消答對單字灑花特效
  refreshChrome();

  // 標記有自由練習進度待同步（由 5 分鐘定時器、離開頁面、或手動按鈕統一同步）
  window.hasUnsavedChanges = true;

  if (correct) {
    ui.showResult(true, state.word, info);
    ui.setActionNext();
    scheduleAutoNext();
  } else {
    state.activeRepairRequired = true;
    ui.showResult(false, state.word, info, guessVal, () => {
      state.activeRepairRequired = false;
    });
  }
}

function pickLevel(n) {
  clearAutoNextTimer(); 
  if (taskState.active || taskState.pending || isDesignatedTaskPendingToday()) {
    alert("請先完成今日指定測驗，完成後即可自由選擇關卡！");
    return;
  }
  store.setCurrentLevel(n); 
  refreshChrome(); 
  newRound(); 
}

function onSessionStart() {
  store.sessionStart();

  // ★ 核心修復：如果今日有指派任務待開始（或中途進度）：點擊「開始今天的練習」立即啟動純聽拼測驗！
  if (taskState.pending || (taskState.task && !taskState.active)) {
    startTaskExecution();
    return;
  }

  // ★ 檢查 storage 中是否有未初始化的指派任務或中途進度
  const rawAssigned = sessionStorage.getItem("assigned_task") || 
                      localStorage.getItem("assigned_task_active") ||
                      localStorage.getItem("assigned_task_backup");
  const rawSaved = localStorage.getItem("today_task_in_progress");
  if (rawAssigned || rawSaved) {
    checkAndStartDailyTask();
    if (taskState.pending || taskState.task) {
      startTaskExecution();
      return;
    }
  }

  // ★ 一般自由練習
  refreshChrome();
  newRound();
}
function onSessionEnd() { showSessionSummary(store.sessionEnd()); }

function showSessionSummary(sum) {
  ui.setScreen("quiz");
  ui.quizResult({
    emoji: sum.answered ? "🌟" : "⏳",
    color: "var(--violet)",
    headline: sum.answered ? "今日訓練完了！" : "今天還沒有練習",
    sub: sum.answered
      ? `作答 ${sum.answered} 題 · 對 ${sum.correct} · 錯 ${sum.incorrect} · 正確率 ${sum.rate}%`
      : "下次按「開始今天訓練」再來計分",
    extraHtml: sum.answered
      ? `<div class="sub">接觸 ${sum.distinct} 個單字${sum.mastered ? ` · 新精通 ${sum.mastered} 字 ⭐` : ""}</div>
         <div class="sub" style="color:var(--catD)">連續修練 ${store.historyData().streak} 天</div>`
      : "",
    btnLabel: "完成",
  }, () => { ui.setScreen("play"); refreshChrome(); newRound(); });
}

async function startPlacement() {
  ui.setScreen("quiz");
  const total = 5 * PLACEMENT_PER_LEVEL;
  let start = 5;
  for (let lv = 1; lv <= 5; lv++) {
    const qs = sample(wordsAt(lv), PLACEMENT_PER_LEVEL);
    let got = 0;
    for (let i = 0; i < qs.length; i++) {
      const index = (lv - 1) * PLACEMENT_PER_LEVEL + i + 1;
      const ok = await ui.askPick(qs[i], { title: `程度測驗 · Level ${lv}`, color: levelColor(lv), index, total });
      if (ok) got++;
    }
    if (got < 2) { start = lv; break; }
    if (lv === 5) start = 5;
  }
  store.completePlacement(start);
  const color = levelColor(start);
  ui.quizResult({
    emoji: "🎯", color,
    headline: `你的程度：Level ${start}`,
    sub: `「${levelName(start)}」— 就從這一關開始練習吧！`,
    extraHtml: `<div class="lvpill" style="background:${color}">LEVEL ${start} · ${levelName(start)}</div>`,
    btnLabel: "開始練習 →",
  }, () => { 
    ui.setScreen("play"); 
    refreshChrome(); 
    checkAndStartDailyTask(); 
  });
}

async function startChallenge() {
  if (taskState.active || taskState.pending || isDesignatedTaskPendingToday()) {
    alert("請先完成今日指定測驗再進行等級挑戰！");
    return;
  }
  const lv = store.progress().current;
  const qs = sample(wordsAt(lv), Math.min(CHALLENGE_LEN, wordsAt(lv).length));
  ui.setScreen("quiz");
  let got = 0;
  for (let i = 0; i < qs.length; i++) {
    const ok = await ui.askPick(qs[i], { title: `Level ${lv} 挑戰`, color: levelColor(lv), index: i + 1, total: qs.length });
    if (ok) got++;
  }
  const rate = got / qs.length;
  const backToPlay = () => { ui.setScreen("play"); refreshChrome(); newRound(); };

  if (rate >= PASS_RATE) {
    const next = store.promote();
    const promoted = next !== lv;
    burst();
    const color = levelColor(next);
    ui.quizResult({
      emoji: "🏆", color,
      headline: promoted ? `過關！升級到 Level ${next}` : "太強了！你已在最高關",
      sub: `答對 ${got}／${qs.length}（${Math.round(rate * 100)}%）`,
      extraHtml: promoted ? `<div class="lvpill" style="background:${color}">LEVEL ${next} · ${levelName(next)}</div>` : "",
      btnLabel: "繼續 →",
    }, backToPlay);
  } else {
    ui.quizResult({
      emoji: "💪", color: levelColor(lv),
      headline: "差一點！再練一下",
      sub: `答對 ${got}／${qs.length}（${Math.round(rate * 100)}%）· 需要 80% 才能升級`,
      btnLabel: "回去練習 →",
    }, backToPlay);
  }
}

// ════════════════════════════════════════════════════════════════════
// 核心：判定今日指定測驗是否尚未完成（嚴格阻擋自由練習出題）
// ════════════════════════════════════════════════════════════════════

function isDesignatedTaskPendingToday() {
  const todayDash = todayDateStr();
  const todaySlash = todayDash.replace(/-/g, "/");

  // 1. 本地已明確標記完成
  const isDoneLocal = (localStorage.getItem("task_done_" + todayDash) === "true") ||
                      (localStorage.getItem("task_done_" + todaySlash) === "true");
  if (isDoneLocal) return false;

  // 2. 雲端已標記完成
  const rawAssigned = sessionStorage.getItem("assigned_task") || 
                      localStorage.getItem("assigned_task_active") ||
                      localStorage.getItem("assigned_task_backup");
  let assignedTaskObj = null;
  if (rawAssigned) {
    try { assignedTaskObj = JSON.parse(rawAssigned); } catch(_) {}
  }
  if (assignedTaskObj && assignedTaskObj.alreadyCompleted === true) {
    return false;
  }

  // 3. 今日有指派任務未完成
  if (assignedTaskObj && assignedTaskObj.hasTask && Array.isArray(assignedTaskObj.words) && assignedTaskObj.words.length > 0) {
    return true;
  }

  // 4. 今日有進行中未完成進度
  try {
    const rawSaved = localStorage.getItem("today_task_in_progress");
    if (rawSaved) {
      const parsed = JSON.parse(rawSaved);
      const parsedDate = String(parsed.date || "").replace(/\//g, "-");
      const currentUser = String(localStorage.getItem("current_user") || "").trim().toLowerCase();
      const parsedUser = String(parsed.username || "").trim().toLowerCase();
      if (parsedDate === todayDash && (!parsedUser || parsedUser === currentUser) && parsed.pool && parsed.index < parsed.pool.length) {
        return true;
      }
    }
  } catch(_) {}

  // 5. 週末補救測驗判定
  const d = new Date();
  const day = d.getDay();
  if (day === 6) {
    const unfin = getMonToFriUnfinishedWords();
    if (unfin && unfin.length > 0) return true;
  } else if (day === 0) {
    const satRec = getSaturdayRemedyRecord();
    if (satRec && satRec.completed) {
      if (satRec.wrongWords && satRec.wrongWords.length > 0) return true;
    } else {
      const unfin = getMonToFriUnfinishedWords();
      if (unfin && unfin.length > 0) return true;
    }
  }

  // 6. 寒暑假平日指派判定
  if (day >= 1 && day <= 5) {
    const vacInfo = getVacationInfo(d);
    if (vacInfo && vacInfo.isVacation) {
      const vacWords = getVacationDayAssignedWords(day);
      if (vacWords && vacWords.length > 0) return true;
    }
  }

  // 7. 當前 taskState 本身標記進行中或待開始
  if (taskState.active || (taskState.pending && taskState.task)) {
    return true;
  }

  return false;
}

// ════════════════════════════════════════════════════════════════════
// 核心：今日任務與週末錯題補救測驗流程
// ════════════════════════════════════════════════════════════════════

function checkAndStartDailyTask() {
  if (isCurfewActive()) {
    const curfewEl = document.getElementById("curfew-overlay");
    if (curfewEl) curfewEl.style.display = "flex";
    return;
  }

  const todayDash = todayDateStr(); // yyyy-mm-dd
  const todaySlash = todayDash.replace(/-/g, "/");

  // 1. 本地完成標記檢查
  const isDoneLocal = (localStorage.getItem("task_done_" + todayDash) === "true") ||
                      (localStorage.getItem("task_done_" + todaySlash) === "true");

  // 2. 雲端試算表回傳之「今日已完成」標記檢查
  const rawAssigned = sessionStorage.getItem("assigned_task") || 
                      localStorage.getItem("assigned_task_active") ||
                      localStorage.getItem("assigned_task_backup");
  let assignedTaskObj = null;
  if (rawAssigned) {
    try { assignedTaskObj = JSON.parse(rawAssigned); } catch(_) {}
  }
  const isDoneRemote = !!(assignedTaskObj && assignedTaskObj.alreadyCompleted === true);
  const hasActiveAssignedTask = !!(assignedTaskObj && assignedTaskObj.hasTask && assignedTaskObj.words && assignedTaskObj.words.length > 0 && !assignedTaskObj.alreadyCompleted);
  const hasInProgressTask = (() => {
    try {
      const rawSaved = localStorage.getItem("today_task_in_progress");
      if (!rawSaved) return false;
      const parsed = JSON.parse(rawSaved);
      const parsedDate = String(parsed.date || "").replace(/\//g, "-");
      const currentUser = String(localStorage.getItem("current_user") || "").trim().toLowerCase();
      const parsedUser = String(parsed.username || "").trim().toLowerCase();
      return (parsedDate === todayDash && (!parsedUser || parsedUser === currentUser) && parsed.pool && parsed.index < parsed.pool.length);
    } catch(_) { return false; }
  })();

  // 【核心規則 1】：當日一旦完成，當日即不再開放使用該功能，直接進入自由闖關！
  // ⚠️ 關鍵保護：若老師明確指派了尚未完成之任務或有中途進行中進度，不應被舊的本地殘留旗標誤鎖定
  if (isDoneRemote || (isDoneLocal && !hasActiveAssignedTask && !hasInProgressTask)) {
    localStorage.setItem("task_done_" + todayDash, "true");
    localStorage.setItem("task_done_" + todaySlash, "true");
    localStorage.removeItem("today_task_in_progress");

    taskState.active = false;
    taskState.pending = false;

    // 確保按鈕恢復自由模式（若每日時間已到則維持隱藏）
    const isTimeUp = window.__dailyUsageTimeIsUp || (window.dailyUsageState && window.dailyUsageState.isLockedDown) || document.body.classList.contains("daily-limit-reached");
    const checkBtn = document.getElementById("checkBtn");
    if (checkBtn) checkBtn.style.display = isTimeUp ? "none" : "";
    const modesEl = document.getElementById("modes");
    if (modesEl) modesEl.style.display = isTimeUp ? "none" : "";
    const levelBar = document.getElementById("levelbar");
    if (levelBar) levelBar.style.display = isTimeUp ? "none" : "";
    const bannerEl = document.getElementById("banner");
    if (bannerEl) bannerEl.style.display = isTimeUp ? "none" : "";

    const catLabel = document.getElementById("catlabel");
    if (catLabel) {
      const dNow = new Date();
      const dayNow = dNow.getDay();
      if (dayNow === 6) {
        const satRecord = getSaturdayRemedyRecord();
        if (satRecord && satRecord.wrongWords && satRecord.wrongWords.length > 0) {
          catLabel.textContent = `💪 週六錯題已消滅，剩餘 ${satRecord.wrongWords.length} 題明天（週日）繼續施測！已開放自由闖關`;
        } else {
          catLabel.textContent = "🌟 本週錯題已全數消滅！週末已開放自由闖關";
        }
      } else if (dayNow === 0) {
        const satRecord = getSaturdayRemedyRecord();
        if (satRecord && satRecord.completed && (!satRecord.wrongWords || satRecord.wrongWords.length === 0)) {
          catLabel.textContent = "🌟 本週錯題已於週六全數消滅！週末已開放自由闖關";
        } else {
          catLabel.textContent = "✅ 週末錯題補救測驗已完成，已開放自由闖關！";
        }
      } else {
        catLabel.textContent = "✅ 今日指定練習已完成，明天再繼續！已開放自由升級闖關";
      }
    }

    console.log("今日指定練習已完成，當日不再開放重複使用，進入自由闖關模式。");
    newRound();
    return;
  }

  const d = new Date();
  const day = d.getDay(); // 0=Sun, 6=Sat
  const isWeekend = (day === 0 || day === 6);

  let taskToRun = null;

  // 週末自動檢核：
  // 週六：週一至週五未答對（包含沒有作答/缺考）的單字
  // 週日：若週六測試仍有錯題，則週日繼續施測剩餘錯題；若週六全數答對，則週日無須再測
  if (isWeekend) {
    if (assignedTaskObj && assignedTaskObj.hasTask && assignedTaskObj.isWeekend && Array.isArray(assignedTaskObj.words) && assignedTaskObj.words.length > 0) {
      taskToRun = assignedTaskObj;
    } else {
      if (day === 6) {
        // ── 週六：以週一至週五未答對/缺考單字進行消滅戰 ──
        const unfinished = getMonToFriUnfinishedWords();
        if (unfinished.length > 0) {
          taskToRun = {
            taskName  : "週末指定單字消滅戰",
            words     : unfinished,
            count     : "ALL",
            isWeekend : true,
            weekendStage: "sat"
          };
        }
      } else if (day === 0) {
        // ── 週日：檢查週六測試結果 ──
        const satRecord = getSaturdayRemedyRecord();
        if (satRecord && satRecord.completed) {
          if (satRecord.wrongWords.length > 0) {
            // 週六仍有錯題 -> 週日繼續施測！
            taskToRun = {
              taskName  : "週末錯題接續消滅戰",
              words     : satRecord.wrongWords,
              count     : "ALL",
              isWeekend : true,
              weekendStage: "sun_remedy"
            };
          } else {
            // 週六全數答對消滅 -> 週日直接解鎖自由闖關，無須再測
            taskToRun = null;
            localStorage.setItem("task_done_" + todayDash, "true");
            localStorage.setItem("task_done_" + todaySlash, "true");
            sessionStorage.removeItem("assigned_task");
            localStorage.removeItem("assigned_task_active");
            localStorage.removeItem("assigned_task_backup");
            assignedTaskObj = null;
          }
        } else {
          // 週六無測驗紀錄 -> 週日直接以週一至週五未答對單字進行消滅戰
          const unfinished = getMonToFriUnfinishedWords();
          if (unfinished.length > 0) {
            taskToRun = {
              taskName  : "週末指定單字消滅戰",
              words     : unfinished,
              count     : "ALL",
              isWeekend : true,
              weekendStage: "sun_initial"
            };
          }
        }
      }
    }
  }

  // 檢查若為週日且週六已全數消滅，徹底封鎖任何指派或殘留週末任務
  const satRecOnSun = (day === 0) ? getSaturdayRemedyRecord() : null;
  const isSatClearedOnSun = (day === 0 && satRecOnSun && satRecOnSun.completed && (!satRecOnSun.wrongWords || satRecOnSun.wrongWords.length === 0));
  if (isSatClearedOnSun) {
    taskToRun = null;
    if (assignedTaskObj && (assignedTaskObj.isWeekend || String(assignedTaskObj.taskName || "").includes("週末"))) {
      assignedTaskObj = null;
    }
  }

  // 若平日（或週末有老師當日特別指派之非補強任務），檢查是否有老師指定的單字任務
  if (!taskToRun && !isSatClearedOnSun && assignedTaskObj && assignedTaskObj.hasTask && assignedTaskObj.words && assignedTaskObj.words.length > 0) {
    taskToRun = assignedTaskObj;
  }

  // ── 寒假暑假星期一到五：若當日無老師特別指派，平均分配週日補考仍答錯之單字 ──
  if (!taskToRun && !isWeekend) {
    const vacInfo = getVacationInfo(d);
    if (vacInfo.isVacation) {
      const vacWordsToday = getVacationDayAssignedWords(day);
      if (vacWordsToday.length > 0) {
        taskToRun = {
          taskName  : `${vacInfo.name}每日單字指派測驗`,
          words     : vacWordsToday,
          count     : "ALL",
          isVacation: true
        };
      }
    }
  }

  // 若 sessionStorage 遺失（如重新開啟分頁），優先從今日未完成進度恢復 taskToRun
  if (!taskToRun) {
    const rawSaved = localStorage.getItem("today_task_in_progress");
    if (rawSaved) {
      try {
        const parsed = JSON.parse(rawSaved);
        const parsedDate = String(parsed.date || "").replace(/\//g, "-");
        const currentUser = String(localStorage.getItem("current_user") || "").trim().toLowerCase();
        const parsedUser = String(parsed.username || "").trim().toLowerCase();
        if (parsedDate === todayDash && (!parsedUser || parsedUser === currentUser) && parsed.task && parsed.pool && parsed.pool.length > 0 && parsed.index < parsed.pool.length) {
          taskToRun = parsed.task;
        }
      } catch(_) {}
    }
  }

  // 若今日完全無任務，直接進入一般自由闖關
  if (!taskToRun) {
    taskState.active = false;
    taskState.pending = false;
    const isTimeUp = window.__dailyUsageTimeIsUp || (window.dailyUsageState && window.dailyUsageState.isLockedDown) || document.body.classList.contains("daily-limit-reached");
    const checkBtn = document.getElementById("checkBtn");
    if (checkBtn) checkBtn.style.display = isTimeUp ? "none" : "";
    const modesEl = document.getElementById("modes");
    if (modesEl) modesEl.style.display = isTimeUp ? "none" : "";
    const levelBar = document.getElementById("levelbar");
    if (levelBar) levelBar.style.display = isTimeUp ? "none" : "";
    const bannerEl = document.getElementById("banner");
    if (bannerEl) bannerEl.style.display = isTimeUp ? "none" : "";
    const catLabel = document.getElementById("catlabel");
    if (catLabel) {
      const satRecord = (day === 0) ? getSaturdayRemedyRecord() : null;
      if (day === 0 && satRecord && satRecord.completed && satRecord.wrongWords.length === 0) {
        catLabel.textContent = "🌟 本週錯題已在週六全數消滅！今日直接開放自由闖關";
      } else if (isWeekend) {
        catLabel.textContent = "🌟 本週無待補強錯題，週末已開放自由闖關！";
      } else {
        catLabel.textContent = "💡 今日尚無指派任務，已開放自由闖關升級";
      }
    }
    newRound();
    return;
  }

  // 【核心規則 2】：今日有任務！必須點選「開始今天的練習」才開始（支援中斷接續）
  showTaskIntroScreen(taskToRun);
}

function showTaskIntroScreen(task) {
  // 檢查是否有中途儲存的未完成進度
  let savedProgress = null;
  const rawSaved = localStorage.getItem("today_task_in_progress");
  const currentUser = String(localStorage.getItem("current_user") || "").trim().toLowerCase();
  const todayDash = todayDateStr();

  if (rawSaved) {
    try {
      const parsed = JSON.parse(rawSaved);
      const parsedDate = String(parsed.date || "").replace(/\//g, "-");
      const parsedUser = String(parsed.username || "").trim().toLowerCase();
      if ((parsedDate === todayDash) &&
          (!parsedUser || parsedUser === currentUser) &&
          parsed.pool && parsed.pool.length > 0 &&
          parsed.index < parsed.pool.length) {
        savedProgress = parsed;
      }
    } catch(_) {}
  }

  let pool = null;
  let resumeIndex = 0;
  let resumeCorrect = 0;

  if (savedProgress) {
    pool = savedProgress.pool;
    resumeIndex = savedProgress.index || 0;
    resumeCorrect = savedProgress.correct || 0;
    if (pool && pool.length > 0 && resumeIndex >= pool.length) {
      taskState.task = task;
      taskState.pool = pool;
      taskState.correct = resumeCorrect;
      taskState.correctWords = (savedProgress && Array.isArray(savedProgress.correctWords)) ? savedProgress.correctWords : [];
      taskState.wrongWords = (savedProgress && Array.isArray(savedProgress.wrongWords)) ? savedProgress.wrongWords : [];
      taskState.hadCorrectThenWrong = (savedProgress && Array.isArray(savedProgress.hadCorrectThenWrong)) ? savedProgress.hadCorrectThenWrong : [];
      finishTaskMode();
      return;
    }
  } else {
    // 首次準備字庫：100% 完整對應老師勾選之單字清單
    const targetWordsLower = task.words.map(w => String(w).trim().toLowerCase());
    let matched = targetWordsLower.map(tw => {
      const found = (WORDS._byWord && WORDS._byWord.get(tw)) || WORDS.find(w => w.word === tw);
      if (found) return found;
      return {
        id: "task_" + tw,
        word: tw,
        display: tw,
        level: 1,
        zh: "指定測驗單字",
        sent: `Spell the word "${tw}".`,
        mask: new Array(tw.length).fill(false)
      };
    });
    if (task.mode !== "ALL" && task.count !== "ALL" && Number(task.count) > 0 && Number(task.count) < matched.length) {
      pool = sample(matched, Number(task.count));
    } else {
      // 全考或未抽測：100% 依教師指派之單字順序直接出題
      pool = [...matched];
    }
  }

  // 設定待開始狀態
  taskState.active              = false;
  taskState.pending             = true;
  taskState.task                = task;
  taskState.pool                = pool;
  taskState.index               = resumeIndex;
  taskState.correct             = resumeCorrect;
  taskState.correctWords        = (savedProgress && Array.isArray(savedProgress.correctWords)) ? savedProgress.correctWords : [];
  taskState.wrongWords          = (savedProgress && Array.isArray(savedProgress.wrongWords)) ? savedProgress.wrongWords : [];
  taskState.hadCorrectThenWrong = (savedProgress && Array.isArray(savedProgress.hadCorrectThenWrong)) ? savedProgress.hadCorrectThenWrong : [];

  // 隱藏自由模式按鈕
  const checkBtn = document.getElementById("checkBtn");
  if (checkBtn) checkBtn.style.display = "none";
  const modesEl = document.getElementById("modes");
  if (modesEl) modesEl.style.display = "none";
  const levelBar = document.getElementById("levelbar");
  if (levelBar) levelBar.style.display = "none";

  const catLabel = document.getElementById("catlabel");
  if (catLabel) catLabel.textContent = "🎯 今日任務待開始";
  const modeHint = document.getElementById("modehint");
  if (modeHint) modeHint.textContent = `【${task.taskName}】`;

  const zhEl = document.getElementById("zh");
  if (zhEl) zhEl.innerHTML = "";
  const sentEl = document.getElementById("sent");
  if (sentEl) sentEl.innerHTML = "";
  const fbEl = document.getElementById("feedback");
  if (fbEl) fbEl.innerHTML = "";

  const isResumed = savedProgress !== null;
  const isWeekendTask = !!task.isWeekend;
  const dNow = new Date();
  const dayNow = dNow.getDay();
  const isSaturday = (dayNow === 6);
  const isSunday = (dayNow === 0);

  const modalIcon = isWeekendTask ? "🔥" : "🎯";
  const modalTag = isWeekendTask ? "WEEKEND CHALLENGE" : "TODAY'S MISSION";
  const modalTitle = isWeekendTask 
    ? (isSunday ? "週末錯題接續消滅戰" : "週末弱點單字消滅戰")
    : "今日指定單字練習";

  const reminderText = isWeekendTask
    ? (isSaturday 
        ? "💡 <b>貼心提醒</b>：今天先挑戰這週的錯題，若有未過關的單字，<b>明天（週日）會繼續施測</b>；全數消滅即可提早解鎖自由闖關！"
        : isSunday 
          ? "💡 <b>貼心提醒</b>：接續昨天未過關的錯題繼續挑戰！今天全數作答完畢後，立即解鎖自由闖關！"
          : "💡 <b>貼心提醒</b>：把這週沒記熟的單字消滅掉，全數作答完成後立即開放自由闖關！")
    : "※ 途中存檔或強制結束不代表結束；全數作答完成後立即開放自由闖關！";

  const btnText = isResumed 
    ? `▶️ 開始練習（接續第 ${resumeIndex + 1} 題）`
    : isWeekendTask 
      ? `🔥 開始消滅弱點單字` 
      : `🎯 開始今天的練習`;

  const resumeHtml = isResumed ? `
    <div style="background:rgba(245, 158, 11, 0.15); border:1.5px solid #f59e0b; border-radius:10px; padding:10px 14px; margin-bottom:16px; text-align:left; color:#fbbf24; font-size:13.5px; line-height:1.5;">
      ⚡ <b>偵測到上次未完成進度</b><br>
      已作答至第 <b>${resumeIndex + 1}</b> 題 / 共 ${pool.length} 題（目前已答對 ${resumeCorrect} 題）。<br>
      <span style="font-size:12px; color:#fde68a;">※ 途中存檔或強制關閉不代表作答結束，點擊下方按鈕即可接續測驗！</span>
    </div>
  ` : "";

  const stageEl = document.getElementById("stage");
  if (stageEl) {
    stageEl.innerHTML = `
      <div style="width:100%; max-width:440px; margin:0 auto; text-align:center; padding:18px 16px; background:rgba(30, 41, 59, 0.6); border:1.5px solid ${isWeekendTask ? '#f59e0b' : '#6366f1'}; border-radius:16px; box-shadow:0 8px 24px rgba(0,0,0,0.25);">
        <div style="font-size:44px; margin-bottom:8px;">${modalIcon}</div>
        <div style="font-size:11px; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:${isWeekendTask ? '#fcd34d' : '#a5b4fc'}; margin-bottom:4px;">${modalTag}</div>
        <h2 style="font-size:20px; font-weight:800; color:#fff; margin:0 0 8px;">${modalTitle}</h2>
        <div style="font-size:16px; font-weight:700; color:${isWeekendTask ? '#fde047' : '#38bdf8'}; margin-bottom:14px;">
          【${task.taskName}】
        </div>

        ${resumeHtml}

        <div style="text-align:left; background:rgba(15, 23, 42, 0.65); border-radius:10px; padding:12px 14px; margin-bottom:18px; font-size:13.5px; line-height:1.7; color:#cbd5e1; border:1px solid rgba(255,255,255,0.06);">
          <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
            <span>📝 測驗題數：</span>
            <b style="color:#fff;">共 ${pool.length} 題</b>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
            <span>🎧 測驗模式：</span>
            <b style="color:${isWeekendTask ? '#fbbf24' : '#6366f1'};">純聽音拼字</b>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>💾 隨時存檔防護：</span>
            <b style="color:#10b981;">自動記憶中途進度</b>
          </div>
          <div style="font-size:12px; color:#94a3b8; margin-top:8px; border-top:1px dashed #334155; padding-top:6px;">
            ${reminderText}
          </div>
        </div>

        <button id="btn-start-today-task" style="width:100%; padding:14px 20px; font-size:16.5px; font-weight:800; color:#fff; background:${isWeekendTask ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)'}; border:none; border-radius:12px; cursor:pointer; box-shadow:0 4px 15px ${isWeekendTask ? 'rgba(239, 68, 68, 0.4)' : 'rgba(99, 102, 241, 0.4)'}; transition:transform 0.1s, box-shadow 0.1s;">
          ${btnText}
        </button>
      </div>
    `;

    const startBtn = document.getElementById("btn-start-today-task");
    if (startBtn) {
      startBtn.onclick = () => {
        startTaskExecution();
      };
    }
  }
}

function startTaskExecution() {
  store.sessionStart();
  taskState.pending = false;
  taskState.active  = true;
  state.mode        = "listen"; // 強制純聽音拼字

  // 還原檢查按鈕
  const checkBtn = document.getElementById("checkBtn");
  if (checkBtn) checkBtn.style.display = "";
  const modesEl = document.getElementById("modes");
  if (modesEl) modesEl.style.display = "none";
  const levelBar = document.getElementById("levelbar");
  if (levelBar) levelBar.style.display = "none";
  const bannerEl = document.getElementById("banner");
  if (bannerEl) bannerEl.style.display = "none";

  persistTaskProgress();
  refreshChrome();
  newRound();
}

function finishTaskMode() {
  taskState.active = false;
  taskState.pending = false;
  const task = taskState.task;
  const total = taskState.pool.length;
  const correct = taskState.correct;
  const rate = total > 0 ? Math.round((correct / total) * 100) : 0;

  // 1. 清除中途進度暫存
  localStorage.removeItem("today_task_in_progress");

  // 2. 標記今日任務已完成（當日即不再開放使用該功能）
  const todayDash = todayDateStr();
  const todaySlash = todayDash.replace(/-/g, "/");
  localStorage.setItem("task_done_" + todayDash, "true");
  localStorage.setItem("task_done_" + todaySlash, "true");

  const allTaskWords = (taskState.pool || []).map(w => {
    const str = typeof w === "string" ? w : (w.word || w.display || w.w);
    return String(str || "").trim().toLowerCase();
  }).filter(Boolean);
  const cleanWrongWords = Array.from(new Set(
    (taskState.wrongWords || []).map(w => String(w).trim().toLowerCase()).filter(Boolean)
  ));
  const cleanCorrectWords = Array.from(new Set(
    (taskState.correctWords || []).map(w => String(w).trim().toLowerCase()).filter(Boolean)
  ));
  const cleanHadCorrectThenWrong = Array.from(new Set(
    (taskState.hadCorrectThenWrong || []).map(w => String(w).trim().toLowerCase()).filter(Boolean)
  ));

  // 若為週末測驗，精準判斷週六或週日階段，並對齊有效日期防跨日誤植
  const isWeekendTask = !!task.isWeekend;
  const dNow = new Date();
  const dayNow = dNow.getDay();
  const isSat = (task.weekendStage === "sat") || (dayNow === 6);
  const isSun = (task.weekendStage === "sun_remedy" || task.weekendStage === "sun_initial" || (!isSat && dayNow === 0));
  const wrongCount = cleanWrongWords.length;
  const mondayStr = getWeekMondayDate();

  let effectiveTaskDate = todayDash;
  if (isWeekendTask && isSat) {
    effectiveTaskDate = getWeekSaturdayDate();
  } else if (isWeekendTask && isSun) {
    effectiveTaskDate = getWeekSundayDate();
  }

  const finishedTaskPayload = {
    hasTask             : false,
    alreadyCompleted    : true,
    taskName            : task.taskName,
    words               : allTaskWords,
    wrongWords          : cleanWrongWords,
    correctWords        : cleanCorrectWords,
    hadCorrectThenWrong : cleanHadCorrectThenWrong,
    score               : `${correct}/${total}`,
    rate                : rate + "%",
    date                : effectiveTaskDate
  };
  sessionStorage.setItem("assigned_task", JSON.stringify(finishedTaskPayload));
  localStorage.setItem("assigned_task_active", JSON.stringify(finishedTaskPayload));

  if (allTaskWords.length > 0) {
    localStorage.setItem("task_words_" + effectiveTaskDate, JSON.stringify(allTaskWords));
    localStorage.setItem("task_words_" + effectiveTaskDate.replace(/-/g, "/"), JSON.stringify(allTaskWords));
  }

  // 3. 儲存今日任務成績摘要（標記 completed: true）
  const nowTs = new Date().toLocaleString("zh-TW", { hour12: false });
  const summaryObj = {
    taskName            : task.taskName,
    score               : correct,
    total               : total,
    rate                : rate + "%",
    completed           : true,
    isWeekend           : !!task.isWeekend,
    date                : effectiveTaskDate,
    wrongWords          : cleanWrongWords,
    correctWords        : cleanCorrectWords,
    hadCorrectThenWrong : cleanHadCorrectThenWrong,
    words               : allTaskWords,
    updatedAt           : nowTs
  };
  localStorage.setItem("today_task_summary", JSON.stringify(summaryObj));
  localStorage.setItem("task_summary_" + effectiveTaskDate, JSON.stringify(summaryObj));

  try {
    const rawHist = localStorage.getItem("student_task_history");
    const histList = rawHist ? JSON.parse(rawHist) : [];
    let filtered = histList.filter(item => !(normalizeDateStr(item.date) === effectiveTaskDate && item.taskName === task.taskName));

    // 若為週末週六測驗且全數答對（0 錯題），清除任何誤植於該週週日的週末測驗紀錄
    if (isWeekendTask && isSat && cleanWrongWords.length === 0) {
      const sunDateStr = getWeekSundayDate();
      filtered = filtered.filter(item => !(normalizeDateStr(item.date) === sunDateStr && (String(item.taskName || "").includes("週末") || item.isWeekend)));
      localStorage.removeItem("task_summary_" + sunDateStr);
    }

    filtered.unshift({
      date                : effectiveTaskDate,
      taskName            : task.taskName,
      score               : `${correct}/${total}`,
      rate                : rate + "%",
      status              : "🟢 已完成",
      updatedAt           : nowTs,
      wrongWords          : cleanWrongWords,
      correctWords        : cleanCorrectWords,
      hadCorrectThenWrong : cleanHadCorrectThenWrong,
      words               : allTaskWords
    });
    localStorage.setItem("student_task_history", JSON.stringify(filtered));
  } catch(_) {}

  // 4. 還原自由模式按鈕（若每日時間已到則維持隱藏）
  const isTimeUp = window.__dailyUsageTimeIsUp || (window.dailyUsageState && window.dailyUsageState.isLockedDown) || document.body.classList.contains("daily-limit-reached");
  const checkBtn = document.getElementById("checkBtn");
  if (checkBtn) checkBtn.style.display = isTimeUp ? "none" : "";
  const modesEl = document.getElementById("modes");
  if (modesEl) modesEl.style.display = isTimeUp ? "none" : "";
  const levelBar = document.getElementById("levelbar");
  if (levelBar) levelBar.style.display = isTimeUp ? "none" : "";
  const bannerEl = document.getElementById("banner");
  if (bannerEl) bannerEl.style.display = isTimeUp ? "none" : "";

  // 若為週末測驗，記錄週末補救進度至本機並剔除已消滅單字
  if (isWeekendTask) {
    try {
      const rawRemedy = localStorage.getItem("weekend_remedy_" + mondayStr);
      const remedyMap = rawRemedy ? JSON.parse(rawRemedy) : {};
      if (isSat) {
        remedyMap.satCompleted = true;
        remedyMap.satScore = `${correct}/${total}`;
        remedyMap.satRate = rate + "%";
        remedyMap.satWrongWords = cleanWrongWords;
        remedyMap.satCorrectWords = cleanCorrectWords;
        remedyMap.satTotal = total;

        // ★ 若週六已全數答對消滅（0 錯題），週日無須測驗，徹底清理任何殘留的週日完成旗標與成績！
        if (cleanWrongWords.length === 0) {
          delete remedyMap.sunCompleted;
          delete remedyMap.sunScore;
          delete remedyMap.sunRate;
          delete remedyMap.sunWrongWords;
          delete remedyMap.sunCorrectWords;
          delete remedyMap.sunTotal;
        }
      } else if (isSun) {
        remedyMap.sunCompleted = true;
        remedyMap.sunScore = `${correct}/${total}`;
        remedyMap.sunRate = rate + "%";
        remedyMap.sunWrongWords = cleanWrongWords;
        remedyMap.sunCorrectWords = cleanCorrectWords;

        // ★ 核心規則：星期日補考測驗仍有答錯的單字，存入寒暑假平日補強庫！
        if (cleanWrongWords.length > 0) {
          recordSundayRemainingMistakes(cleanWrongWords);
        }
      }
      remedyMap.updatedAt = nowTs;
      localStorage.setItem("weekend_remedy_" + mondayStr, JSON.stringify(remedyMap));
    } catch(_) {}

    // 從本機 weekTaskMistakes 中剔除已成功答對消滅的單字
    if (cleanCorrectWords.length > 0) {
      try {
        const rawMistakes = localStorage.getItem("weekTaskMistakes");
        if (rawMistakes) {
          const map = JSON.parse(rawMistakes);
          let changed = false;
          for (const dKey in map) {
            if (Array.isArray(map[dKey])) {
              const origLen = map[dKey].length;
              map[dKey] = map[dKey].filter(cw => !cleanCorrectWords.includes(String(cw).trim().toLowerCase()));
              if (map[dKey].length !== origLen) changed = true;
            }
          }
          if (changed) {
            localStorage.setItem("weekTaskMistakes", JSON.stringify(map));
          }
        }
      } catch(_) {}
    }
  }

  // 若為寒暑假指派任務，已答對單字從寒暑假補強庫中剔除
  if (task.isVacation && cleanCorrectWords.length > 0) {
    try {
      const rawV = localStorage.getItem("vacation_pending_mistakes");
      if (rawV) {
        let vList = JSON.parse(rawV);
        if (Array.isArray(vList)) {
          vList = vList.filter(w => !cleanCorrectWords.includes(String(w).trim().toLowerCase()));
          localStorage.setItem("vacation_pending_mistakes", JSON.stringify(vList));
        }
      }
    } catch(_) {}
  }

  burst();

  // 5. 顯示結算視窗並自動同步上傳試算表
  ui.setScreen("quiz");

  let resEmoji = "💪";
  let resColor = "var(--coral, #f59e0b)";
  let resHeadline = `恭喜完成「${task.taskName}」！`;
  let resSub = `本次測驗答對 ${correct}／${total} 題（正確率 ${rate}%）`;
  let resHtml = "";
  let resBtnLabel = "開始自由闖關 →";
  let postCatLabel = "✅ 今日指定練習已完成，明天再繼續！已開放自由升級闖關";

  if (isWeekendTask) {
    if (wrongCount === 0 || rate >= 100) {
      // 週末全數消滅成功
      resEmoji = "🎉";
      resColor = "var(--green, #10b981)";
      resHeadline = "太厲害了！本週錯題全部消滅！";
      resSub = `本次測驗 ${total} 題全部答對（正確率 100%）！`;
      resHtml = `
        <div style="margin:16px 0; font-size:15px; color:var(--ink, #334155); line-height:1.7;">
          太強了！這禮拜的所有錯題單字，已經被你<b>全部消滅乾淨</b>囉！🌟<br>
          這個週末你的弱點單字已經全部過關${isSat ? "，明天週日不用再補考囉" : ""}，好好放鬆一下吧！<br>
          <span style="font-size:13px; color:var(--ink3, #64748b); display:inline-block; margin-top:8px;">
            現在已為你解鎖<b>「自由闖關模式」</b>，快去賺取更多星星吧！
          </span>
        </div>
        <div style="font-size:12px; color:var(--ink3, #94a3b8);">（全數消滅紀錄已自動同步寫入雲端）</div>
      `;
      resBtnLabel = "太棒了，前往自由闖關 →";
      postCatLabel = "🌟 本週錯題已全數消滅！週末已開放自由闖關";
    } else if (isSat) {
      // 週六結算且仍有錯題
      resEmoji = "💪";
      resColor = "var(--coral, #f59e0b)";
      resHeadline = "週六錯題消滅戰告一段落！";
      resSub = `本次答對 ${correct}／${total} 題（正確率 ${rate}%）`;
      resHtml = `
        <div style="margin:16px 0; font-size:15px; color:var(--ink, #334155); line-height:1.7;">
          今天先成功消滅了 <b style="color:var(--green, #10b981);">${correct}</b> 個弱點單字，表現很棒！👏<br>
          還有 <b style="color:#ef4444;">${wrongCount}</b> 個單字還沒記熟，別灰心，<b>明天（週日）會繼續施測這幾題</b>，把它們徹底消滅！<br>
          <span style="font-size:13px; color:var(--ink3, #64748b); display:inline-block; margin-top:8px;">
            今天任務已結束，現在可以去<b>「自由闖關」</b>放鬆練習、多賺點星星喔！
          </span>
        </div>
        <div style="font-size:12px; color:var(--ink3, #94a3b8);">（週六進度已存檔，剩餘錯題將於週日接續施測）</div>
      `;
      resBtnLabel = "好的，去自由闖關 →";
      postCatLabel = `💪 週六已消滅 ${correct} 題，剩餘 ${wrongCount} 題明天（週日）繼續施測！已開放自由闖關`;
    } else {
      // 週日結算
      resEmoji = rate >= 70 ? "👏" : "💪";
      resColor = rate >= 70 ? "var(--green, #10b981)" : "var(--coral, #f59e0b)";
      resHeadline = "週日錯題補救測驗完成！";
      resSub = `本次答對 ${correct}／${total} 題（正確率 ${rate}%）`;
      resHtml = `
        <div style="margin:16px 0; font-size:15px; color:var(--ink, #334155); line-height:1.7;">
          週末這兩天的錯題消滅挑戰辛苦了！這次又救回了 <b style="color:var(--green, #10b981);">${correct}</b> 個單字！<br>
          ${wrongCount > 0 ? `還有 <b style="color:#ef4444;">${wrongCount}</b> 個單字尚未過關，系統已安排平均分配於<b>寒暑假平日（週一至週五）</b>繼續複習消滅！` : `本週所有弱點單字都已經補強完畢囉！`}<br>
          <span style="font-size:13px; color:var(--ink3, #64748b); display:inline-block; margin-top:8px;">
            💡 <b>貼心提醒</b>：隨時可以到<b>「自由闖關」</b>自主練習這些單字，只要在自主練習中答對，就會直接登記為已學會，假期就不會再加入指派測驗囉！
          </span>
        </div>
        <div style="font-size:12px; color:var(--ink3, #94a3b8);">（週末成績已自動同步寫入雲端每日任務紀錄）</div>
      `;
      resBtnLabel = "辛苦了，前往自由闖關 →";
      postCatLabel = "✅ 週末錯題補救測驗已完成，已開放自由闖關！";
    }
  } else if (task.isVacation) {
    // 寒暑假平日指定練習
    resEmoji = rate >= 80 ? "🏆" : "💪";
    resColor = rate >= 80 ? "var(--green, #10b981)" : "var(--coral, #f59e0b)";
    resHeadline = `${task.taskName}完成！`;
    resSub = `本次測驗答對 ${correct}／${total} 題（正確率 ${rate}%）`;
    resHtml = `
      <div style="margin:16px 0; font-size:15px; color:var(--ink, #334155); line-height:1.7;">
        今天假期指派的單字練習已經順利達標囉！🎉<br>
        ${wrongCount > 0 ? `今天未答對的 <b style="color:#ef4444;">${wrongCount}</b> 個單字，將自動加入本週<b>六日的週末消滅戰</b>繼續補強！` : `今天的弱點單字已經全部消滅學會囉！`}<br>
        <span style="font-size:13px; color:var(--ink3, #64748b); display:inline-block; margin-top:8px;">
          今日指派已完成，現在為你解鎖<b>「自由闖關模式」</b>，快去賺取更多星星吧！
        </span>
      </div>
      <div style="font-size:12px; color:var(--ink3, #94a3b8);">（成績已自動同步寫入雲端每日任務紀錄）</div>
    `;
    resBtnLabel = "開始自由闖關 →";
    postCatLabel = "✅ 今日假期指派練習已完成，已開放自由升級闖關！";
  } else {
    // 平日指定練習
    resEmoji = rate >= 80 ? "🏆" : "💪";
    resColor = rate >= 80 ? "var(--green, #10b981)" : "var(--coral, #f59e0b)";
    resHeadline = "今日指定練習完成囉！";
    resSub = `本次測驗答對 ${correct}／${total} 題（正確率 ${rate}%）`;
    resHtml = `
      <div style="margin:16px 0; font-size:15px; color:var(--ink, #334155); line-height:1.7;">
        今天的指定單字練習已經順利達標囉！🎉<br>
        今日測驗已鎖定，現在為你解鎖<b>「自由闖關模式」</b>，快去挑戰賺取更多星星吧！
      </div>
      <div style="font-size:12px; color:var(--ink3, #94a3b8);">（成績已自動同步寫入雲端每日任務紀錄）</div>
    `;
    resBtnLabel = "開始自由闖關 →";
    postCatLabel = "✅ 今日指定練習已完成，明天再繼續！已開放自由升級闖關";
  }

  ui.quizResult({
    emoji: resEmoji,
    color: resColor,
    headline: resHeadline,
    sub: resSub,
    extraHtml: resHtml,
    btnLabel: resBtnLabel,
  }, () => {
    ui.setScreen("play");
    refreshChrome();
    const catLabel = document.getElementById("catlabel");
    if (catLabel) catLabel.textContent = postCatLabel;
    newRound();
  });

  // 自動觸發背景靜默同步上傳（交卷最高優先級立即送出）
  if (typeof window.uploadLocalStorageData === "function") {
    window.uploadLocalStorageData(true, true);
  }
}

// ---- wiring ----
ui.initModes(state.mode, (mode) => {
  if (taskState.active || taskState.pending || isDesignatedTaskPendingToday()) {
    alert("今日指定練習進行中，不可更換模式！");
    return;
  }
  state.mode = mode; 
  state.answered = false; 
  renderCurrent(); 
});

ui.onCheckClick(check);
ui.onSummary(() => ui.toggleSummary(store.summary(WORDS)));
ui.initProgressCard();
ui.initConquerCard();


// ---- boot ----
(async function boot() {
  // 1. 優先完整載入單字庫，確保各關卡、答對率與學習進度正確計算
  try {
    WORDS = await loadWordBank();
    window.__WORDS = WORDS;
    window.__store = store;
  } catch (e) {
    document.querySelector("#stage").innerHTML =
      `<p style="color:var(--coral);font-weight:700">載入單字失敗：${e.message}<br>請用伺服器開啟（見 README）。</p>`;
    return;
  }

  // 2. 確保存檔模組與 LocalStorage 最新同步
  if (typeof store.reload === "function") store.reload();

  // 3. ── 若今日練習時間已用盡，直接鎖定作答並正常呈現學習進度與紀錄 ──
  const isTimeLocked = () => {
    if (typeof window !== "undefined" && window.__dailyUsageTimeIsUp === true) return true;
    const u = localStorage.getItem("current_user");
    if (!u) return false;
    const unlocked = localStorage.getItem(`daily_usage_${u}_unlocked`) === "true";
    if (unlocked) return false;
    const firstLogin = Number(localStorage.getItem(`daily_usage_${u}_first_login_time`));
    if (!firstLogin) return false;
    const lim = Number(localStorage.getItem(`daily_usage_${u}_limit_minutes`)) || 10;
    const ext = Number(localStorage.getItem(`daily_usage_${u}_extended_minutes`)) || 0;
    return ((lim + ext) * 60 * 1000 - (Date.now() - firstLogin)) <= 0;
  };

  if (isTimeLocked()) {
    if (typeof window !== "undefined") window.__dailyUsageTimeIsUp = true;
    ui.setScreen("play");
    refreshChrome();
    if (typeof window !== "undefined" && typeof window.ensureLockdownVisuals === "function") {
      window.ensureLockdownVisuals();
    }
    console.log("⏰ 帳號今日練習時間已達上限，已略過出題與錄音播放，正常顯示學習進度與紀錄");
    return;
  }
  // 優先檢查是否有今日指定任務或進行中進度
  const rawAssigned = sessionStorage.getItem("assigned_task") || 
                      localStorage.getItem("assigned_task_active") ||
                      localStorage.getItem("assigned_task_backup");
  let assignedTaskObj = null;
  if (rawAssigned) {
    try { assignedTaskObj = JSON.parse(rawAssigned); } catch(_) {}
  }
  const hasInProgress = !!localStorage.getItem("today_task_in_progress");

  // ── 當天每日測驗自動啟動核心判定 ──
  // 1. 若有中途斷線未完成之進度：直接無縫接續作答
  // 2. 若當天尚未結束指定測驗（有登入無作答、作答中斷、或有指派任務）：一登入就直接開始每日測驗，直到測驗結束才開放自由練習！
  if (hasInProgress) {
    ui.setScreen("play"); 
    checkAndStartDailyTask(); 
    // 斷線或關閉後重新登入，直接自動無縫接續未完進度！
    startTaskExecution();
  } else if (isDesignatedTaskPendingToday()) {
    ui.setScreen("play"); 
    checkAndStartDailyTask(); 
    // ★ 當天有指定測驗未結束，一登入就立即開始每日測驗，直到結束才能進行自由練習！
    startTaskExecution();
  } else { 
    ui.setScreen("play"); 
    refreshChrome(); 
    checkAndStartDailyTask(); 
  }
})();

// 暴露全域給老師出題預覽施測直接呼叫（一鍵直接開始測驗展示）
window.triggerDailyTaskIntro = (task) => {
  ui.setScreen("play");
  showTaskIntroScreen(task);
  startTaskExecution();
};
