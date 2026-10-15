// =====================================================================
// app.js ??the controller. Boots the word bank, runs the placement test,
// drives level-based practice, gates progression behind challenges,
// and manages teacher-assigned tasks & weekend mistake remediation.
// =====================================================================
import { loadWordBank } from "./wordbank.js?v=20261015_2028";
import * as store from "./store.js?v=20261015_2028";
import { nextWord } from "./srs.js?v=20261015_2028";
import * as ui from "./ui.js?v=20261015_2028";
import { burst } from "./confetti.js?v=20261015_2028";
import {
  LEVELS, levelColor, levelName, sample,
  PASS_RATE, GATE_MIN_ATTEMPTS, CHALLENGE_LEN, PLACEMENT_PER_LEVEL, DAILY_GOAL,
} from "./levels.js?v=20261015_2028";

let WORDS = [];
const state = { mode: "listen", word: null, answered: false, round: null };

// ?€?€ ä»Šæ—¥?‡å?ä»»å??‡é€±æœ«?¯é??€???€?€
const taskState = {
  active       : false,
  pending      : false,
  index        : 0,
  pool         : [],
  correct      : 0,
  task         : null,
  correctWords : [],
  wrongWords   : []
};

// ?€?€ ?¨æ?ä¿å?ä»»å?ä¸­é€”é€²åº¦ï¼ˆä¸­?”å?æª”æ?å¼·åˆ¶?œé??²è­·ï¼??€?€
function persistTaskProgress() {
  if (!taskState.task || !taskState.pool || taskState.pool.length === 0) return;
  try {
    const todayDash = todayDateStr();
    const todaySlash = todayDash.replace(/-/g, "/");
    const poolWords = taskState.pool.map(w => {
      const str = typeof w === "string" ? w : (w.word || w.display || w.w);
      return String(str || "").trim().toLowerCase();
    }).filter(Boolean);

    const saveObj = {
      date         : todayDash,
      username     : localStorage.getItem("current_user") || "",
      task         : taskState.task,
      pool         : taskState.pool,
      words        : poolWords,
      index        : taskState.index,
      correct      : taskState.correct,
      correctWords : taskState.correctWords || [],
      wrongWords   : taskState.wrongWords || []
    };
    localStorage.setItem("today_task_in_progress", JSON.stringify(saveObj));
    if (poolWords.length > 0) {
      localStorage.setItem("task_words_" + todayDash, JSON.stringify(poolWords));
      localStorage.setItem("task_words_" + todaySlash, JSON.stringify(poolWords));
    }

    // æ¨™è??‰æ–°?²åº¦å¾…å?æ­¥ï???5 ?†é?å®šæ??¨ã€é›¢?‹é??¢ã€æ?å®Œæ??‡å?æ¸¬é??‚çµ±ä¸€?Œæ­¥ï¼?
    window.hasUnsavedChanges = true;
  } catch(e) {
    console.error("persistTaskProgress error:", e);
  }
}

const wordsAt = (level) => WORDS.filter((w) => w.level === level);

function todayDateStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function getWeekMondayDate() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 6=Sat
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.getFullYear(), d.getMonth(), diff);
  return monday.getFullYear() + "-" + String(monday.getMonth() + 1).padStart(2, "0") + "-" + String(monday.getDate()).padStart(2, "0");
}

function getWeekFridayDate() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) + 4;
  const friday = new Date(d.getFullYear(), d.getMonth(), diff);
  return friday.getFullYear() + "-" + String(friday.getMonth() + 1).padStart(2, "0") + "-" + String(friday.getDate()).padStart(2, "0");
}

// ?€?€ ?¯é?è¨˜é?ï¼šåªè¨˜é??Œä??¥æ?å®šç·´ç¿’ã€ä¸­ç­”éŒ¯?„å–®å­??€?€
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

// ?€?€ ?–å?å­¸ç??¼æ??Ÿä??°æ??Ÿä?æ²’æ?ç­”å?ï¼ˆå??«æ??‰ä?ç­?ç¼ºè€ƒï??„æ??‰å–®å­??€?€
function getMonToFriUnfinishedWords() {
  const unfinishedWords = new Set();
  const mondayStr = getWeekMondayDate();
  const fridayStr = getWeekFridayDate();

  // 1. å¾?student_task_historyï¼ˆç”±?²ç«¯è©¦ç?è¡¨æ­·ç¨‹å?æ­¥ï?è®€?–æœ¬?±ä??³é€±ä?ä»»å?
  try {
    const rawHist = localStorage.getItem("student_task_history");
    if (rawHist) {
      const historyList = JSON.parse(rawHist);
      if (Array.isArray(historyList)) {
        historyList.forEach(item => {
          if (!item || !item.date) return;
          const iDate = String(item.date).trim().replace(/\//g, "-");
          if (iDate >= mondayStr && iDate <= fridayStr) {
            // (a) è©²æ¸¬é©—ä¸­ç­”éŒ¯?„å–®å­?
            if (Array.isArray(item.wrongWords)) {
              item.wrongWords.forEach(w => {
                const cw = String(w).trim().toLowerCase();
                if (cw) unfinishedWords.add(cw);
              });
            }
            // (b) ?¥è©²ä»»å??€?‹æœªå®Œæ??ç¼º?ƒæ?æ²’æ?ä½œç?ï¼ˆä?å¦‚å??ªé?å§‹æ? score ??"??ï¼?
            const status = String(item.status || "");
            const score = String(item.score || "");
            const isUnattempted = !status.includes("å·²å???) || score === "?? || score === "å°šæœª?‹å?";
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

  // 2. å¾?weekTaskMistakesï¼ˆæœ¬æ©Ÿå³?‚è??„ï?è®€?–æœ¬?±ä??³é€±ä??„éŒ¯é¡?
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
    sessionTitle = `ä»Šæ—¥?‡å?æ¸¬é? <span>??{taskState.task.taskName}?‘ç›®æ¨?${taskGoal} å­?/span>`;
  } else if (taskState.pending && taskState.task) {
    sessionGoal = taskGoal;
    sessionTitle = `ä»Šæ—¥?‡å?æ¸¬é? <span>??{taskState.task.taskName}?‘ç›®æ¨?${taskGoal} å­?/span>`;
  }

  ui.renderSession(sessionS, sessionGoal, onSessionStart, onSessionEnd, sessionTitle);
  ui.renderProgress(store.stats(WORDS));
  ui.renderLevelBar(levelInfo(), pickLevel);
  const cur = store.progress().current;
  const ls = store.levelStats(cur, WORDS);
  const ready = ls.attempts >= GATE_MIN_ATTEMPTS && ls.rate >= PASS_RATE;
  let hint;
  if (ready) hint = "?? å·²é?æ¨™ï??‘æˆ°?å?å°±èƒ½?‡ç??°ä?ä¸€?œã€?;
  else if (ls.attempts < GATE_MIN_ATTEMPTS) hint = `?ç·´ç¿?${GATE_MIN_ATTEMPTS - ls.attempts} å­—ï?æ­?¢º?‡ä?????0%ï¼‰å°±?½æ??°ã€‚`;
  else hint = "?®å?æ­?¢º?‡å?é«˜ä?é»ï??€ ??0%ï¼‰å°±?½æ??°æœ¬?œã€?;
  ui.renderBanner(cur, ls, ready, hint, startChallenge);
  if (typeof ui.initExportRecordsCard === "function") {
    ui.initExportRecordsCard(() => store.summary(WORDS));
  }
  if (!ui.summaryHidden()) ui.renderSummary(store.summary(WORDS));

  // ? ï? ä»Šæ—¥?‡å?æ¸¬é??²è?ä¸­æ?å¾…é?å§‹ï?å¼·åˆ¶?±è?æ¨¡å??—ã€é??¡å??‡ç?ç´šæ??°æ©«å¹?
  if (taskState.active || taskState.pending) {
    const modesEl = document.getElementById("modes");
    if (modesEl) modesEl.style.display = "none";
    const levelBar = document.getElementById("levelbar");
    if (levelBar) levelBar.style.display = "none";
    const bannerEl = document.getElementById("banner");
    if (bannerEl) bannerEl.style.display = "none";
  }

  // ? ï? ä»Šæ—¥ç·´ç??‚é?å·²ç??Ÿï?ä¸€ä½µéš±?æ¨¡å¼å??é??¡å??‡ç?ç´šæ??°æ©«å¹…ï??™ä?ä¹¾æ·¨æ¸…çˆ½?«é¢
  if (window.__dailyUsageTimeIsUp || (window.dailyUsageState && window.dailyUsageState.isLockedDown) || document.body.classList.contains("daily-limit-reached")) {
    const modesEl = document.getElementById("modes");
    if (modesEl) modesEl.style.display = "none";
    const levelBar = document.getElementById("levelbar");
    if (levelBar) levelBar.style.display = "none";
    const bannerEl = document.getElementById("banner");
    if (bannerEl) bannerEl.style.display = "none";
  }
}

function renderCurrent() {
  const isTask = taskState.active;
  state.round = ui.renderRound(state.word, state.mode, { 
    onAnswer: answer, 
    onCheck: check,
    disablePeek: true 
  });
  
  // ?€?€ ?¥ç‚ºä»Šæ—¥ä»»å?æ¨¡å?ï¼šåš´?¼é?å®šç??½æ‹¼?éš±?æ¨¡å¼è??œå¡ ?€?€
  if (isTask && taskState.task) {
    const catLabel = document.getElementById("catlabel");
    const modeHint = document.getElementById("modehint");
    if (catLabel) {
      catLabel.textContent = `?¯ ä»Šæ—¥ä»»å? (${taskState.index + 1}/${taskState.pool.length})`;
      catLabel.style.background = "linear-gradient(135deg, #6366f1, #8b5cf6)";
    }
    if (modeHint) modeHint.textContent = `??{taskState.task.taskName}?‘ç??½æ‹¼æ¸¬é?ä¸­`;

    // ?´æ ¼å¼·åˆ¶?±è??œå¡/æ¨¡å??—è??‘æˆ°æ©«å?
    const modesEl = document.getElementById("modes");
    if (modesEl) modesEl.style.display = "none";
    const levelBar = document.getElementById("levelbar");
    if (levelBar) levelBar.style.display = "none";
    const bannerEl = document.getElementById("banner");
    if (bannerEl) bannerEl.style.display = "none";
  }
}

// ?€?€ å­¸ç?ä½¿ç”¨?‚é?ç®¡åˆ¶ (?¯æ´?¨æ ¡?è¨­?‡å€‹åˆ¥å­¸ç?è¨­å?) ?€?€
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


// ?€?€ ?ªå? 3 ç§’é€²å…¥ä¸‹ä?é¡Œè??‚å™¨ ?€?€
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
  clearAutoNextTimer();
  let remainingSeconds = 3;
  ui.setNextBtnCountdown(remainingSeconds);

  autoNextInterval = setInterval(() => {
    remainingSeconds--;
    if (remainingSeconds > 0) {
      ui.setNextBtnCountdown(remainingSeconds);
    } else {
      clearAutoNextTimer();
    }
  }, 1000);

  autoNextTimer = setTimeout(() => {
    clearAutoNextTimer();
    if (state.answered) {
      newRound();
    }
  }, 3000);
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

  // ?€?€ å¦‚æ?ä»Šæ—¥ä»»å??²è?ä¸??€?€
  if (taskState.active) {
    if (taskState.pool && taskState.pool.length > 0 && taskState.index < taskState.pool.length) {
      state.word = taskState.pool[taskState.index];
      state.answered = false;
      renderCurrent();
      return;
    } else {
      // ä»»å??€?‰é??®ä?ç­”å??¢ï?
      finishTaskMode();
      return;
    }
  }

  // ?€?€ ä¸€?¬è‡ª?±é????€?€
  state.word = nextWord(WORDS, store.progress().current, state.word?.id);
  state.answered = false;
  renderCurrent();
}

function check() {
  if (state.answered) { clearAutoNextTimer(); newRound(); return; }
  const getGuess = state.round.getGuess;
  if (!getGuess) return;
  const guess = getGuess();
  if (!guess) { ui.note("?ˆæ‹¼?¼ç??æª¢?¥å? ?ï?"); return; }
  const correct = guess.trim().toLowerCase() === state.word.word.toLowerCase();
  state.round.applyTypedResult(correct);
  answer(correct, guess);
}

function answer(correct, guessVal) {
  if (state.answered) return;
  state.answered = true;

  // ?€?€ ?¥åœ¨?‡å?ä»»å?ä¸??€?€
  if (taskState.active) {
    if (correct) {
      taskState.correct++;
      const cw = String(state.word.word).trim().toLowerCase();
      taskState.correctWords = taskState.correctWords || [];
      if (!taskState.correctWords.includes(cw)) {
        taskState.correctWords.push(cw);
      }
      // ä¾é?æ±‚å?æ¶ˆç?å°å–®å­—ç??±ç‰¹??
    } else {
      const w = String(state.word.word).trim().toLowerCase();
      taskState.wrongWords = taskState.wrongWords || [];
      if (!taskState.wrongWords.includes(w)) {
        taskState.wrongWords.push(w);
      }
      // ? ï? ?…åœ¨?‡å?ä»»å?ä¸­ç??¯ï??æ”¶?„é€²é€±æœ«?¯é?è£œæ?åº«ï?
      recordTaskMistake(w);
    }
    
    // ä¾ç„¶?´æ–°?Œå–®å­—é€²åº¦ (?‡å?ä»»å?æ¨¡å? isFree=false)
    const info = store.grade(state.word.id, correct, store.progress().current, state.mode, state.word.word, false);
    ui.showResult(correct, state.word, info);
    taskState.index++;
    // æ¯ä?ç­”å?ä¸€é¡Œç??³æ›´?°æ?ä¹…å??²åº¦ä¸¦å?æ­¥é›²ç«¯ï?
    persistTaskProgress();
    refreshChrome();

    ui.setActionNext();
    scheduleAutoNext();
    return;
  }

  // ?€?€ ?ªç”±?–é?ä¸­ç??¯ï?æ­?¸¸?‡é?ç´šï??Œæ­¥?¶é??³æ??¥è‡ª?±ç·´ç¿’ä?ç­”æ­·ç¨??€?€
  const info = store.grade(state.word.id, correct, store.progress().current, state.mode, state.word.word, true);
  ui.showResult(correct, state.word, info);
  // ä¾é?æ±‚å?æ¶ˆç?å°å–®å­—ç??±ç‰¹??
  refreshChrome();

  // æ¨™è??‰è‡ª?±ç·´ç¿’é€²åº¦å¾…å?æ­¥ï???5 ?†é?å®šæ??¨ã€é›¢?‹é??¢ã€æ??‹å??‰é?çµ±ä??Œæ­¥ï¼?
  window.hasUnsavedChanges = true;

  ui.setActionNext();
  scheduleAutoNext();
}

function pickLevel(n) {
  clearAutoNextTimer(); 
  if (taskState.active || taskState.pending) {
    alert("è«‹å?å®Œæ?ä»Šæ—¥?‡å?æ¸¬é?ï¼Œå??å??³å¯?ªç”±?¸æ??œå¡ï¼?);
    return;
  }
  store.setCurrentLevel(n); 
  refreshChrome(); 
  newRound(); 
}

function onSessionStart() {
  store.sessionStart();

  // ???¸å?ä¿®å¾©ï¼šå??œä??¥æ??‡æ´¾ä»»å?å¾…é?å§‹ï??–ä¸­?”é€²åº¦ï¼‰ï?é»æ??Œé?å§‹ä?å¤©ç?ç·´ç??ç??³å??•ç??½æ‹¼æ¸¬é?ï¼?
  if (taskState.pending || (taskState.task && !taskState.active)) {
    startTaskExecution();
    return;
  }

  // ??æª¢æŸ¥ storage ä¸­æ˜¯?¦æ??ªå?å§‹å??„æ?æ´¾ä»»?™æ?ä¸­é€”é€²åº¦
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

  // ??ä¸€?¬è‡ª?±ç·´ç¿?
  refreshChrome();
  newRound();
}
function onSessionEnd() { showSessionSummary(store.sessionEnd()); }

function showSessionSummary(sum) {
  ui.setScreen("quiz");
  ui.quizResult({
    emoji: sum.answered ? "??" : "??,
    color: "var(--violet)",
    headline: sum.answered ? "ä»Šæ—¥è¨“ç·´å®Œä?ï¼? : "ä»Šå¤©?„æ??‰ç·´ç¿?,
    sub: sum.answered
      ? `ä½œç? ${sum.answered} é¡?Â· å°?${sum.correct} Â· ??${sum.incorrect} Â· æ­?¢º??${sum.rate}%`
      : "ä¸‹æ¬¡?‰ã€Œé?å§‹ä?å¤©è?ç·´ã€å?ä¾†è???,
    extraHtml: sum.answered
      ? `<div class="sub">?¥è§¸ ${sum.distinct} ?‹å–®å­?{sum.mastered ? ` Â· ?°ç²¾??${sum.mastered} å­?â­` : ""}</div>
         <div class="sub" style="color:var(--catD)">???ä¿®ç·´ ${store.historyData().streak} å¤?/div>`
      : "",
    btnLabel: "å®Œæ?",
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
      const ok = await ui.askPick(qs[i], { title: `ç¨‹åº¦æ¸¬é? Â· Level ${lv}`, color: levelColor(lv), index, total });
      if (ok) got++;
    }
    if (got < 2) { start = lv; break; }
    if (lv === 5) start = 5;
  }
  store.completePlacement(start);
  const color = levelColor(start);
  ui.quizResult({
    emoji: "?¯", color,
    headline: `ä½ ç?ç¨‹åº¦ï¼šLevel ${start}`,
    sub: `??{levelName(start)}?â€?å°±å??™ä??œé?å§‹ç·´ç¿’å§ï¼`,
    extraHtml: `<div class="lvpill" style="background:${color}">LEVEL ${start} Â· ${levelName(start)}</div>`,
    btnLabel: "?‹å?ç·´ç? ??,
  }, () => { 
    ui.setScreen("play"); 
    refreshChrome(); 
    checkAndStartDailyTask(); 
  });
}

async function startChallenge() {
  if (taskState.active || taskState.pending) {
    alert("è«‹å?å®Œæ?ä»Šæ—¥?‡å?æ¸¬é??é€²è?ç­‰ç??‘æˆ°ï¼?);
    return;
  }
  const lv = store.progress().current;
  const qs = sample(wordsAt(lv), Math.min(CHALLENGE_LEN, wordsAt(lv).length));
  ui.setScreen("quiz");
  let got = 0;
  for (let i = 0; i < qs.length; i++) {
    const ok = await ui.askPick(qs[i], { title: `Level ${lv} ?‘æˆ°`, color: levelColor(lv), index: i + 1, total: qs.length });
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
      emoji: "??", color,
      headline: promoted ? `?é?ï¼å?ç´šåˆ° Level ${next}` : "å¤ªå¼·äº†ï?ä½ å·²?¨æ?é«˜é?",
      sub: `ç­”å? ${got}ï¼?{qs.length}ï¼?{Math.round(rate * 100)}%ï¼‰`,
      extraHtml: promoted ? `<div class="lvpill" style="background:${color}">LEVEL ${next} Â· ${levelName(next)}</div>` : "",
      btnLabel: "ç¹¼ç? ??,
    }, backToPlay);
  } else {
    ui.quizResult({
      emoji: "?’ª", color: levelColor(lv),
      headline: "å·®ä?é»ï??ç·´ä¸€ä¸?,
      sub: `ç­”å? ${got}ï¼?{qs.length}ï¼?{Math.round(rate * 100)}%ï¼‰Â??€è¦?80% ?èƒ½?‡ç?`,
      btnLabel: "?å»ç·´ç? ??,
    }, backToPlay);
  }
}

// ?â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â?
// ?¸å?ï¼šä??¥ä»»?™è??±æœ«?¯é?è£œæ?æ¸¬é?æµç?
// ?â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â?

function checkAndStartDailyTask() {
  if (isCurfewActive()) {
    const curfewEl = document.getElementById("curfew-overlay");
    if (curfewEl) curfewEl.style.display = "flex";
    return;
  }

  const todayDash = todayDateStr(); // yyyy-mm-dd
  const todaySlash = todayDash.replace(/-/g, "/");

  // 1. ?¬åœ°å®Œæ?æ¨™è?æª¢æŸ¥
  const isDoneLocal = (localStorage.getItem("task_done_" + todayDash) === "true") ||
                      (localStorage.getItem("task_done_" + todaySlash) === "true");

  // 2. ?²ç«¯è©¦ç?è¡¨å??³ä??Œä??¥å·²å®Œæ??æ?è¨˜æª¢??
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

  // ?æ ¸å¿ƒè???1?‘ï??¶æ—¥ä¸€?¦å??ï??¶æ—¥?³ä??é??¾ä½¿?¨è©²?Ÿèƒ½ï¼Œç›´?¥é€²å…¥?ªç”±?–é?ï¼?
  // ? ï? ?œéµä¿è­·ï¼šè‹¥?å¸«?ç¢º?‡æ´¾äº†å??ªå??ä?ä»»å??–æ?ä¸­é€”é€²è?ä¸­é€²åº¦ï¼Œä??‰è¢«?Šç??¬åœ°æ®˜ç??—æ?èª¤é?å®?
  if (isDoneRemote || (isDoneLocal && !hasActiveAssignedTask && !hasInProgressTask)) {
    localStorage.setItem("task_done_" + todayDash, "true");
    localStorage.setItem("task_done_" + todaySlash, "true");
    localStorage.removeItem("today_task_in_progress");

    taskState.active = false;
    taskState.pending = false;

    // ç¢ºä??‰é??¢å¾©?ªç”±æ¨¡å?ï¼ˆè‹¥æ¯æ—¥?‚é?å·²åˆ°?‡ç¶­?éš±?ï?
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
    if (catLabel) catLabel.textContent = "??ä»Šæ—¥?‡å?ç·´ç?å·²å??ï??å¤©?ç¹¼çºŒï?å·²é??¾è‡ª?±å?ç´šé???;

    console.log("ä»Šæ—¥?‡å?ç·´ç?å·²å??ï??¶æ—¥ä¸å??‹æ”¾?è?ä½¿ç”¨ï¼Œé€²å…¥?ªç”±?–é?æ¨¡å???);
    newRound();
    return;
  }

  const d = new Date();
  const day = d.getDay(); // 0=Sun, 6=Sat
  const isWeekend = (day === 0 || day === 6);

  let taskToRun = null;

  // ?±æœ«?ªå?æª¢æ ¸ï¼šå­¸?Ÿæ–¼?Ÿæ?ä¸€?°æ??Ÿä?æ²’æ?ç­”å?ï¼ˆå??«æ??‰ä?ç­?ç¼ºè€ƒï??„å–®å­—ä?å¾‹è‡ª?•è??å…­?¥ç??‡æ´¾?®å?æ¸¬é?
  if (isWeekend) {
    if (assignedTaskObj && assignedTaskObj.hasTask && assignedTaskObj.isWeekend && Array.isArray(assignedTaskObj.words) && assignedTaskObj.words.length > 0) {
      taskToRun = assignedTaskObj;
    } else {
      const unfinished = getMonToFriUnfinishedWords();
      if (unfinished.length > 0) {
        taskToRun = {
          taskName  : "?±æœ«?‡å??®å?æ¶ˆæ???,
          words     : unfinished,
          count     : "ALL",
          isWeekend : true
        };
      }
    }
  }

  // ?¥å¹³?¥ï??–é€±æœ«?‰è€å¸«?¶æ—¥?¹åˆ¥?‡æ´¾ä¹‹é?è£œå¼·ä»»å?ï¼‰ï?æª¢æŸ¥?¯å¦?‰è€å¸«?‡å??„å–®å­—ä»»??
  if (!taskToRun && assignedTaskObj && assignedTaskObj.hasTask && assignedTaskObj.words && assignedTaskObj.words.length > 0) {
    taskToRun = assignedTaskObj;
  }

  // ??sessionStorage ?ºå¤±ï¼ˆå??æ–°?‹å??†é?ï¼‰ï??ªå?å¾ä??¥æœªå®Œæ??²åº¦?¢å¾© taskToRun
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

  // ?¥ä??¥å??¨ç„¡ä»»å?ï¼Œç›´?¥é€²å…¥ä¸€?¬è‡ª?±é???
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
      catLabel.textContent = "?’¡ ä»Šæ—¥å°šç„¡?‡æ´¾ä»»å?ï¼Œå·²?‹æ”¾?ªç”±?–é??‡ç?";
    }
    newRound();
    return;
  }

  // ?æ ¸å¿ƒè???2?‘ï?ä»Šæ—¥?‰ä»»?™ï?å¿…é?é»é¸?Œé?å§‹ä?å¤©ç?ç·´ç??æ??‹å?ï¼ˆæ”¯?´ä¸­?·æ¥çºŒï?
  showTaskIntroScreen(taskToRun);
}

function showTaskIntroScreen(task) {
  // æª¢æŸ¥?¯å¦?‰ä¸­?”å„²å­˜ç??ªå??é€²åº¦
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
      finishTaskMode();
      return;
    }
  } else {
    // é¦–æ¬¡æº–å?å­—åº«ï¼?00% å®Œæ•´å°æ??å¸«?¾é¸ä¹‹å–®å­—æ???
    const targetWordsLower = task.words.map(w => String(w).trim().toLowerCase());
    let matched = targetWordsLower.map(tw => {
      const found = WORDS.find(w => w.word.toLowerCase() === tw);
      if (found) return found;
      return {
        id: "task_" + tw,
        word: tw,
        display: tw,
        level: 1,
        zh: "?‡å?æ¸¬é??®å?",
        sent: `Spell the word "${tw}".`,
        mask: new Array(tw.length).fill(false)
      };
    });
    if (task.mode !== "ALL" && task.count !== "ALL" && Number(task.count) > 0 && Number(task.count) < matched.length) {
      pool = sample(matched, Number(task.count));
    } else {
      // ?¨è€ƒæ??ªæŠ½æ¸¬ï?100% ä¾æ?å¸«æ?æ´¾ä??®å??†å??´æ¥?ºé?
      pool = [...matched];
    }
  }

  // è¨­å?å¾…é?å§‹ç???
  taskState.active       = false;
  taskState.pending      = true;
  taskState.task         = task;
  taskState.pool         = pool;
  taskState.index        = resumeIndex;
  taskState.correct      = resumeCorrect;
  taskState.correctWords = (savedProgress && Array.isArray(savedProgress.correctWords)) ? savedProgress.correctWords : [];
  taskState.wrongWords   = (savedProgress && Array.isArray(savedProgress.wrongWords)) ? savedProgress.wrongWords : [];

  // ?±è??ªç”±æ¨¡å??‰é?
  const checkBtn = document.getElementById("checkBtn");
  if (checkBtn) checkBtn.style.display = "none";
  const modesEl = document.getElementById("modes");
  if (modesEl) modesEl.style.display = "none";
  const levelBar = document.getElementById("levelbar");
  if (levelBar) levelBar.style.display = "none";

  const catLabel = document.getElementById("catlabel");
  if (catLabel) catLabel.textContent = "?¯ ä»Šæ—¥ä»»å?å¾…é?å§?;
  const modeHint = document.getElementById("modehint");
  if (modeHint) modeHint.textContent = `??{task.taskName}?‘`;

  const zhEl = document.getElementById("zh");
  if (zhEl) zhEl.innerHTML = "";
  const sentEl = document.getElementById("sent");
  if (sentEl) sentEl.innerHTML = "";
  const fbEl = document.getElementById("feedback");
  if (fbEl) fbEl.innerHTML = "";

  const isResumed = savedProgress !== null;
  const resumeHtml = isResumed ? `
    <div style="background:rgba(245, 158, 11, 0.15); border:1.5px solid #f59e0b; border-radius:10px; padding:10px 14px; margin-bottom:16px; text-align:left; color:#fbbf24; font-size:13.5px; line-height:1.5;">
      ??<b>?µæ¸¬?°ä?æ¬¡æœªå®Œæ??²åº¦</b><br>
      å·²ä?ç­”è‡³ç¬?<b>${resumeIndex + 1}</b> é¡?/ ??${pool.length} é¡Œï??®å?å·²ç?å°?${resumeCorrect} é¡Œï???br>
      <span style="font-size:12px; color:#fde68a;">???”ä¸­å­˜æ??–å¼·?¶é??‰ä?ä»?¡¨ä½œç?çµæ?ï¼Œé??Šä??¹æ??•å³?¯æ¥çºŒæ¸¬é©—ï?</span>
    </div>
  ` : "";

  const btnText = isResumed 
    ? `?¶ï? ?‹å?ä»Šå¤©?„ç·´ç¿’ï?ç¹¼ç?ç¬?${resumeIndex + 1} é¡Œï?`
    : `?¯ ?‹å?ä»Šå¤©?„ç·´ç¿’`;

  const stageEl = document.getElementById("stage");
  if (stageEl) {
    stageEl.innerHTML = `
      <div style="width:100%; max-width:440px; margin:0 auto; text-align:center; padding:18px 16px; background:rgba(30, 41, 59, 0.6); border:1.5px solid #6366f1; border-radius:16px; box-shadow:0 8px 24px rgba(0,0,0,0.25);">
        <div style="font-size:44px; margin-bottom:8px;">?¯</div>
        <div style="font-size:11px; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:#a5b4fc; margin-bottom:4px;">TODAY'S MISSION</div>
        <h2 style="font-size:20px; font-weight:800; color:#fff; margin:0 0 8px;">ä»Šæ—¥?‡å??®å?ç·´ç?</h2>
        <div style="font-size:16px; font-weight:700; color:#38bdf8; margin-bottom:14px;">
          ??{task.taskName}??
        </div>

        ${resumeHtml}

        <div style="text-align:left; background:rgba(15, 23, 42, 0.65); border-radius:10px; padding:12px 14px; margin-bottom:18px; font-size:13.5px; line-height:1.7; color:#cbd5e1; border:1px solid rgba(255,255,255,0.06);">
          <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
            <span>?? æ¸¬é?é¡Œæ•¸ï¼?/span>
            <b style="color:#fff;">??${pool.length} é¡?/b>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
            <span>?§ æ¸¬é?æ¨¡å?ï¼?/span>
            <b style="color:#6366f1;">ç´”è½?³æ‹¼å­?/b>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>?’¾ ?¨æ?å­˜æ??²è­·ï¼?/span>
            <b style="color:#10b981;">?ªå?è¨˜æ†¶ä¸­é€”é€²åº¦</b>
          </div>
          <div style="font-size:12px; color:#94a3b8; margin-top:8px; border-top:1px dashed #334155; padding-top:6px;">
            ???”ä¸­å­˜æ??–å¼·?¶ç??Ÿä?ä»?¡¨çµæ?ï¼›å…¨?¸ä?ç­”å??å?ç«‹å³?‹æ”¾?ªç”±?–é?ï¼?
          </div>
        </div>

        <button id="btn-start-today-task" style="width:100%; padding:14px 20px; font-size:16.5px; font-weight:800; color:#fff; background:linear-gradient(135deg, #6366f1, #8b5cf6); border:none; border-radius:12px; cursor:pointer; box-shadow:0 4px 15px rgba(99, 102, 241, 0.4); transition:transform 0.1s, box-shadow 0.1s;">
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
  state.mode        = "listen"; // å¼·åˆ¶ç´”è½?³æ‹¼å­?

  // ?„å?æª¢æŸ¥?‰é?
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

  // 1. æ¸…é™¤ä¸­é€”é€²åº¦?«å?
  localStorage.removeItem("today_task_in_progress");

  // 2. æ¨™è?ä»Šæ—¥ä»»å?å·²å??ï??¶æ—¥?³ä??é??¾ä½¿?¨è©²?Ÿèƒ½ï¼?
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

  const finishedTaskPayload = {
    hasTask: false,
    alreadyCompleted: true,
    taskName: task.taskName,
    words: allTaskWords,
    wrongWords: cleanWrongWords,
    correctWords: cleanCorrectWords,
    score: `${correct}/${total}`,
    rate: rate + "%",
    date: todayDash
  };
  sessionStorage.setItem("assigned_task", JSON.stringify(finishedTaskPayload));
  localStorage.setItem("assigned_task_active", JSON.stringify(finishedTaskPayload));

  if (allTaskWords.length > 0) {
    localStorage.setItem("task_words_" + todayDash, JSON.stringify(allTaskWords));
    localStorage.setItem("task_words_" + todaySlash, JSON.stringify(allTaskWords));
  }

  // 3. ?²å?ä»Šæ—¥ä»»å??ç¸¾?˜è?ï¼ˆæ?è¨?completed: trueï¼?
  const nowTs = new Date().toLocaleString("zh-TW", { hour12: false });
  const summaryObj = {
    taskName     : task.taskName,
    score        : correct,
    total        : total,
    rate         : rate + "%",
    completed    : true,
    isWeekend    : !!task.isWeekend,
    date         : todayDash,
    wrongWords   : cleanWrongWords,
    correctWords : cleanCorrectWords,
    words        : allTaskWords,
    updatedAt    : nowTs
  };
  localStorage.setItem("today_task_summary", JSON.stringify(summaryObj));

  try {
    const rawHist = localStorage.getItem("student_task_history");
    const histList = rawHist ? JSON.parse(rawHist) : [];
    const filtered = histList.filter(item => !(normalizeDateStr(item.date) === todayDash && item.taskName === task.taskName));
    filtered.unshift({
      date: todayDash,
      taskName: task.taskName,
      score: `${correct}/${total}`,
      rate: rate + "%",
      status: "?Ÿ¢ å·²å???,
      updatedAt: nowTs,
      wrongWords: cleanWrongWords,
      correctWords: cleanCorrectWords,
      words: allTaskWords
    });
    localStorage.setItem("student_task_history", JSON.stringify(filtered));
  } catch(_) {}

  // 4. ?„å??ªç”±æ¨¡å??‰é?ï¼ˆè‹¥æ¯æ—¥?‚é?å·²åˆ°?‡ç¶­?éš±?ï?
  const isTimeUp = window.__dailyUsageTimeIsUp || (window.dailyUsageState && window.dailyUsageState.isLockedDown) || document.body.classList.contains("daily-limit-reached");
  const checkBtn = document.getElementById("checkBtn");
  if (checkBtn) checkBtn.style.display = isTimeUp ? "none" : "";
  const modesEl = document.getElementById("modes");
  if (modesEl) modesEl.style.display = isTimeUp ? "none" : "";
  const levelBar = document.getElementById("levelbar");
  if (levelBar) levelBar.style.display = isTimeUp ? "none" : "";
  const bannerEl = document.getElementById("banner");
  if (bannerEl) bannerEl.style.display = isTimeUp ? "none" : "";

  burst();

  // 5. é¡¯ç¤ºçµç?è¦–ç?ä¸¦è‡ª?•å?æ­¥ä??³è©¦ç®—è¡¨
  ui.setScreen("quiz");
  ui.quizResult({
    emoji: rate >= 80 ? "??" : "?’ª",
    color: rate >= 80 ? "var(--green)" : "var(--coral)",
    headline: `?­å?å®Œæ???{task.taskName}?ï?`,
    sub: `?¬æ¬¡æ¸¬é?ç­”å? ${correct}ï¼?{total} é¡Œï?æ­?¢º??${rate}%ï¼‰`,
    extraHtml: `
      <div style="margin:16px 0; font-size:14px; color:#475569; line-height:1.6;">
        ${task.isWeekend ? "???±æœ«?¯é?æ¶ˆæ??å?ï¼å¼±é»å–®å­—å·²è£œå¼·?? : "??ä»Šæ—¥?‡å??²åº¦å·²é?æ¨™ï?"}<br>
        ä»Šæ—¥æ¸¬é?å·²é?å®šï??¾åœ¨?ºæ‚¨è§??<b>?Œè‡ª?±é??œæ¨¡å¼ã€?/b>ï¼Œå¿«?»è³º?–æ›´å¤šæ??Ÿå§ï¼?
      </div>
      <div style="font-size:12px; color:#64748b;">ï¼ˆæ?ç¸¾å·²?ªå??Œæ­¥å¯«å…¥?²ç«¯æ¯æ—¥ä»»å?ç´€?„ï?</div>
    `,
    btnLabel: "?‹å??ªç”±?–é? ??,
  }, () => {
    ui.setScreen("play");
    refreshChrome();
    const catLabel = document.getElementById("catlabel");
    if (catLabel) catLabel.textContent = "??ä»Šæ—¥?‡å?ç·´ç?å·²å??ï??å¤©?ç¹¼çºŒï?å·²é??¾è‡ª?±å?ç´šé???;
    newRound();
  });

  // ?ªå?è§¸ç™¼?Œæ™¯?œé??Œæ­¥ä¸Šå‚³ï¼ˆäº¤?·æ?é«˜å„ª?ˆç?ç«‹å³?å‡ºï¼?
  if (typeof window.uploadLocalStorageData === "function") {
    window.uploadLocalStorageData(true, true);
  }
}

// ---- wiring ----
ui.initModes(state.mode, (mode) => {
  if (taskState.active || taskState.pending) {
    alert("ä»Šæ—¥?‡å?ç·´ç??²è?ä¸­ï?ä¸å¯?´æ?æ¨¡å?ï¼?);
    return;
  }
  state.mode = mode; 
  state.answered = false; 
  renderCurrent(); 
});

ui.onCheckClick(check);
ui.onSummary(() => ui.toggleSummary(store.summary(WORDS)));
ui.initProgressCard();

// ---- boot ----
(async function boot() {
  // 1. ?ªå?å®Œæ•´è¼‰å…¥?®å?åº«ï?ç¢ºä??„é??¡ã€ç?å°ç??‡å­¸ç¿’é€²åº¦æ­?¢ºè¨ˆç?
  try {
    WORDS = await loadWordBank();
    window.__WORDS = WORDS;
    window.__store = store;
  } catch (e) {
    document.querySelector("#stage").innerHTML =
      `<p style="color:var(--coral);font-weight:700">è¼‰å…¥?®å?å¤±æ?ï¼?{e.message}<br>è«‹ç”¨ä¼ºæ??¨é??Ÿï?è¦?READMEï¼‰ã€?/p>`;
    return;
  }

  // 2. ç¢ºä?å­˜æ?æ¨¡ç???LocalStorage ?€?°å?æ­?
  if (typeof store.reload === "function") store.reload();

  // 3. ?€?€ ?¥ä??¥ç·´ç¿’æ??“å·²?¨ç›¡ï¼Œç›´?¥é?å®šä?ç­”ä¸¦æ­?¸¸?ˆç¾å­¸ç??²åº¦?‡ç????€?€
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
    console.log("??å¸³è?ä»Šæ—¥ç·´ç??‚é?å·²é?ä¸Šé?ï¼Œå·²?¥é??ºé??‡é??³æ’­?¾ï?æ­?¸¸é¡¯ç¤ºå­¸ç??²åº¦?‡ç???);
    return;
  }
  // ?ªå?æª¢æŸ¥?¯å¦?‰ä??¥æ?å®šä»»?™æ??²è?ä¸­é€²åº¦
  const rawAssigned = sessionStorage.getItem("assigned_task") || 
                      localStorage.getItem("assigned_task_active") ||
                      localStorage.getItem("assigned_task_backup");
  let assignedTaskObj = null;
  if (rawAssigned) {
    try { assignedTaskObj = JSON.parse(rawAssigned); } catch(_) {}
  }
  const hasInProgress = !!localStorage.getItem("today_task_in_progress");

  // ?€?€ ?¶å¤©æ¯æ—¥æ¸¬é??ªå??Ÿå??¸å??¤å? ?€?€
  // 1. ?¥æ?ä¸­é€”æ–·ç·šæœªå®Œæ?ä¹‹é€²åº¦ï¼šç›´?¥ç„¡ç¸«æ¥çºŒä?ç­?
  // 2. ?¥ç•¶å¤©å??ªé?å§‹æ¸¬é©—ä??‰æ?æ´¾ä»»?™ï?ä¸€?»å…¥å°±ç›´?¥é?å§‹æ??¥æ¸¬é©—ï??´æ¥é¡¯ç¤º?¶å¤©?‡æ´¾?®å?ï¼Œç?ä¸å??ªç”±ç·´ç??ºé?å½±éŸ¿ï¼?
  if (hasInProgress) {
    ui.setScreen("play"); 
    checkAndStartDailyTask(); 
    // ?·ç??–é??‰å??æ–°?»å…¥ï¼Œç›´?¥è‡ª?•ç„¡ç¸«æ¥çºŒæœªå®Œé€²åº¦ï¼?
    startTaskExecution();
  } else if (assignedTaskObj && assignedTaskObj.hasTask && !assignedTaskObj.alreadyCompleted) {
    const todayDash = todayDateStr();
    const isDone = (localStorage.getItem("task_done_" + todayDash) === "true") ||
                   (localStorage.getItem("task_done_" + todayDash.replace(/-/g, "/")) === "true");
    if (!isDone) {
      ui.setScreen("play"); 
      checkAndStartDailyTask(); 
      // ???¸å?ä¿®å¾©ï¼šç•¶å¤©é?æ²’é?å§‹æ??¥æ¸¬é©—ï?ä¸€?»å…¥å°±ç??³é?å§‹æ??¥æ¸¬é©—ï??´æ¥é¡¯ç¤º?¶å¤©?‡æ´¾?®å?ï¼ˆç¬¬ 1 é¡Œï?ï¼Œç?ä¸å??°è‡ª?±ç·´ç¿’å‡ºé¡Œå½±?¿ï?
      startTaskExecution();
    } else {
      ui.setScreen("play"); 
      refreshChrome(); 
      checkAndStartDailyTask(); 
    }
  } else { 
    ui.setScreen("play"); 
    refreshChrome(); 
    checkAndStartDailyTask(); 
  }
})();

// ?´éœ²?¨å?çµ¦è€å¸«?ºé??è¦½?½æ¸¬?´æ¥?¼å«ï¼ˆä??µç›´?¥é?å§‹æ¸¬é©—å?ç¤ºï?
window.triggerDailyTaskIntro = (task) => {
  ui.setScreen("play");
  showTaskIntroScreen(task);
  startTaskExecution();
};
