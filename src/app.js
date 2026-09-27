// =====================================================================
// app.js — the controller. Boots the word bank, runs the placement test,
// drives level-based practice, gates progression behind challenges,
// and manages teacher-assigned tasks & weekend mistake remediation.
// =====================================================================
import { loadWordBank } from "./wordbank.js";
import * as store from "./store.js";
import { nextWord } from "./srs.js";
import * as ui from "./ui.js";
import { burst } from "./confetti.js";
import {
  LEVELS, levelColor, levelName, sample,
  PASS_RATE, GATE_MIN_ATTEMPTS, CHALLENGE_LEN, PLACEMENT_PER_LEVEL, DAILY_GOAL,
} from "./levels.js";

let WORDS = [];
const state = { mode: "listen", word: null, answered: false, round: null };

// ── 今日指定任務與週末錯題狀態 ──
const taskState = {
  active  : false,
  index   : 0,
  pool    : [],
  correct : 0,
  task    : null
};

const wordsAt = (level) => WORDS.filter((w) => w.level === level);

function todayDateStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function getWeekMondayDate() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.getFullYear() + "-" + String(monday.getMonth() + 1).padStart(2, "0") + "-" + String(monday.getDate()).padStart(2, "0");
}

// ── 錯題記錄：只記錄「今日指定練習」中答錯的單字 ──
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

// ── 取得本週週一至週五指定任務答錯的所有單字 ──
function getMonToFriMistakes() {
  try {
    const raw = localStorage.getItem("weekTaskMistakes");
    if (!raw) return [];
    const map = JSON.parse(raw);
    const mondayStr = getWeekMondayDate();
    const mistakes = [];

    for (const dateKey in map) {
      if (dateKey >= mondayStr && dateKey <= todayDateStr()) {
        const d = new Date(dateKey.replace(/-/g, "/"));
        const dayOfWeek = d.getDay();
        // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          mistakes.push(...map[dateKey]);
        }
      }
    }
    return [...new Set(mistakes)];
  } catch(_) { return []; }
}

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
  ui.renderSession(store.sessionState(), DAILY_GOAL, onSessionStart, onSessionEnd);
  ui.renderProgress(store.stats(WORDS));
  ui.renderLevelBar(levelInfo(), pickLevel);
  const cur = store.progress().current;
  const ls = store.levelStats(cur);
  const ready = ls.attempts >= GATE_MIN_ATTEMPTS && ls.rate >= PASS_RATE;
  let hint;
  if (ready) hint = "🎉 已達標！挑戰成功就能升級到下一關。";
  else if (ls.attempts < GATE_MIN_ATTEMPTS) hint = `再練習 ${GATE_MIN_ATTEMPTS - ls.attempts} 題（正確率保持 ≥80%）就能挑戰。`;
  else hint = "正確率再高一點（需 ≥80%）就能挑戰本關。";
  ui.renderBanner(cur, ls, ready, hint, startChallenge);
  if (!ui.summaryHidden()) ui.renderSummary(store.summary(WORDS));
}

function renderCurrent() {
  state.round = ui.renderRound(state.word, state.mode, { onAnswer: answer, onCheck: check });
  
  // 若為任務模式，更新頂部提示
  if (taskState.active && taskState.task) {
    const catLabel = document.getElementById("catlabel");
    const modeHint = document.getElementById("modehint");
    if (catLabel) catLabel.textContent = `🎯 今日任務 (${taskState.index + 1}/${taskState.pool.length})`;
    if (modeHint) modeHint.textContent = `【${taskState.task.taskName}】純聽拼測驗中`;
  }
}

function newRound() {
  // ── 如果今日任務進行中 ──
  if (taskState.active) {
    if (taskState.index < taskState.pool.length) {
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

  // ── 一般自由闖關 ──
  state.word = nextWord(WORDS, store.progress().current, state.word?.id);
  state.answered = false;
  renderCurrent();
}

function check() {
  if (state.answered) { newRound(); return; }
  const getGuess = state.round.getGuess;
  if (!getGuess) return;
  const guess = getGuess();
  if (!guess) { ui.note("先拼拼看再檢查喔 ✏️"); return; }
  const correct = guess.trim().toLowerCase() === state.word.word.toLowerCase();
  state.round.applyTypedResult(correct);
  answer(correct);
}

function answer(correct) {
  if (state.answered) return;
  state.answered = true;

  // ── 若在指定任務中 ──
  if (taskState.active) {
    if (correct) {
      taskState.correct++;
      burst();
    } else {
      // ⚠️ 僅在指定任務中答錯，才收錄進週末錯題補救庫！
      recordTaskMistake(state.word.word);
    }
    
    // 依然更新背單字進度
    const info = store.grade(state.word.id, correct, store.progress().current);
    ui.showResult(correct, state.word, info);
    taskState.index++;
    ui.setActionNext();
    return;
  }

  // ── 自由闖關中答錯：正常升降級，但不收錄至週末錯題庫 ──
  const info = store.grade(state.word.id, correct, store.progress().current);
  ui.showResult(correct, state.word, info);
  if (correct) burst();
  refreshChrome();
  ui.setActionNext();
}

function pickLevel(n) { 
  if (taskState.active) {
    alert("目前正在進行今日指定測驗，完成後即可自由選擇關卡！");
    return;
  }
  store.setCurrentLevel(n); 
  refreshChrome(); 
  newRound(); 
}

function onSessionStart() { store.sessionStart(); refreshChrome(); }
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
  if (taskState.active) {
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
// 核心：今日任務與週末錯題補救測驗流程
// ════════════════════════════════════════════════════════════════════

function checkAndStartDailyTask() {
  const todaySlash = todayDateStr(); // yyyy-mm-dd or yyyy/mm/dd
  const todayAlt   = todaySlash.includes("/") ? todaySlash.replace(/\//g, "-") : todaySlash.replace(/-/g, "/");

  // 1. 本地完成標記檢查
  const isDoneLocal = (localStorage.getItem("task_done_" + todaySlash) === "true") ||
                      (localStorage.getItem("task_done_" + todayAlt) === "true");

  // 2. 雲端試算表回傳之「今日已完成」標記檢查
  const rawAssigned = sessionStorage.getItem("assigned_task");
  let assignedTaskObj = null;
  if (rawAssigned) {
    try { assignedTaskObj = JSON.parse(rawAssigned); } catch(_) {}
  }
  const isDoneRemote = !!(assignedTaskObj && assignedTaskObj.alreadyCompleted === true);

  // 【核心規則】：當日一旦完成，當日即不再開放使用該功能，直接開放自由闖關！
  if (isDoneLocal || isDoneRemote) {
    localStorage.setItem("task_done_" + todaySlash, "true");
    localStorage.setItem("task_done_" + todayAlt, "true");

    // 確保按鈕恢復自由模式
    const peekBtn = document.getElementById("peekBtn");
    if (peekBtn) peekBtn.style.display = "";
    const modesEl = document.getElementById("modes");
    if (modesEl) modesEl.style.display = "";

    const catLabel = document.getElementById("catlabel");
    if (catLabel) catLabel.textContent = "✅ 今日指定練習已完成，明天再繼續！已開放自由升級闖關";

    console.log("今日指定練習已完成，當日不再開放重複使用，進入自由闖關模式。");
    newRound();
    return;
  }

  const d = new Date();
  const day = d.getDay(); // 0=Sun, 6=Sat
  const isWeekend = (day === 0 || day === 6);

  let taskToRun = null;

  // 1. 週末優先檢查是否有「本週指定進度錯題」
  if (isWeekend) {
    const mistakes = getMonToFriMistakes();
    if (mistakes.length > 0) {
      taskToRun = {
        taskName : "本週指定錯題消滅戰",
        words    : mistakes,
        count    : "ALL",
        isWeekend: true
      };
    }
  }

  // 2. 若平日（或週末無錯題），檢查是否有老師指定的單字任務
  if (!taskToRun) {
    const rawAssigned = sessionStorage.getItem("assigned_task");
    if (rawAssigned) {
      try {
        const parsed = JSON.parse(rawAssigned);
        if (parsed && parsed.hasTask && parsed.words && parsed.words.length > 0) {
          taskToRun = parsed;
        }
      } catch(_) {}
    }
  }

  // 3. 若有任務，啟動嚴格測驗模式
  if (taskToRun) {
    startTaskMode(taskToRun);
  } else {
    newRound();
  }
}

function startTaskMode(task) {
  // 從總字庫尋找符合的單字物件
  const targetWordsLower = task.words.map(w => String(w).trim().toLowerCase());
  let pool = WORDS.filter(w => targetWordsLower.includes(w.word.toLowerCase()));

  // 若字庫中找不滿，以簡易單字物件補齊
  if (pool.length === 0) {
    pool = targetWordsLower.map(w => ({
      id: "cust_" + w, word: w, level: 1, zh: "指定測驗單字", sent: `Spell the word "${w}".`
    }));
  }

  // 依題數抽題或全考
  if (task.count !== "ALL" && Number(task.count) < pool.length) {
    pool = sample(pool, Number(task.count));
  } else {
    pool = sample(pool, pool.length); // 隨機洗牌
  }

  taskState.active  = true;
  taskState.index   = 0;
  taskState.pool    = pool;
  taskState.correct = 0;
  taskState.task    = task;

  // ── 嚴格模式：隱藏偷看按鈕，鎖定為純聽拼 ──
  const peekBtn = document.getElementById("peekBtn");
  if (peekBtn) peekBtn.style.display = "none";
  
  const modesEl = document.getElementById("modes");
  if (modesEl) modesEl.style.display = "none";

  state.mode = "listen"; // 強制純聽音拼字
  ui.setScreen("play");
  refreshChrome();

  alert(`🎯 今日任務開始：【${task.taskName}】\n\n⚠️ 測驗規則：純聽音拼字，無偷看功能。\n完成共 ${pool.length} 題後，將解鎖自由闖關！`);
  newRound();
}

function finishTaskMode() {
  taskState.active = false;
  const task = taskState.task;
  const total = taskState.pool.length;
  const correct = taskState.correct;
  const rate = total > 0 ? Math.round((correct / total) * 100) : 0;

  // 標記今日任務已完成（當日即不再開放使用該功能）
  const todaySlash = todayDateStr();
  const todayAlt   = todaySlash.includes("/") ? todaySlash.replace(/\//g, "-") : todaySlash.replace(/-/g, "/");
  localStorage.setItem("task_done_" + todaySlash, "true");
  localStorage.setItem("task_done_" + todayAlt, "true");
  sessionStorage.setItem("assigned_task", JSON.stringify({ hasTask: false, alreadyCompleted: true }));

  // 儲存今日任務成績摘要（供上傳試算表時附帶）
  const summaryObj = {
    taskName  : task.taskName,
    score     : correct,
    total     : total,
    rate      : rate + "%",
    isWeekend : !!task.isWeekend,
    date      : todayDateStr()
  };
  localStorage.setItem("today_task_summary", JSON.stringify(summaryObj));

  // 還原偷看按鈕與模式切換
  const peekBtn = document.getElementById("peekBtn");
  if (peekBtn) peekBtn.style.display = "";

  const modesEl = document.getElementById("modes");
  if (modesEl) modesEl.style.display = "";

  burst();

  // 顯示測驗結算彈窗
  ui.setScreen("quiz");
  ui.quizResult({
    emoji: rate >= 80 ? "🏆" : "💪",
    color: rate >= 80 ? "var(--green)" : "var(--coral)",
    headline: `恭喜完成「${task.taskName}」！`,
    sub: `本次測驗答對 ${correct}／${total} 題（正確率 ${rate}%）`,
    extraHtml: `
      <div style="margin:16px 0; font-size:14px; color:#475569; line-height:1.6;">
        ${task.isWeekend ? "✨ 週末錯題消滅成功！弱點單字已補強。" : "✨ 今日指定進度已達標！"}<br>
        現在為您解鎖<b>「自由闖關模式」</b>，快去賺取更多星號吧！
      </div>
      <div style="font-size:12px; color:#64748b;">（成績已暫存，按上傳紀錄將即時同步至試算表）</div>
    `,
    btnLabel: "開始自由闖關 →",
  }, () => {
    ui.setScreen("play");
    refreshChrome();
    newRound();
    // 自動提示上傳
    if (window.uploadLocalStorageData) {
      window.uploadLocalStorageData(true); // 傳入 true 表示測驗完成自動靜默同步
    }
  });
}

// ---- wiring ----
ui.initModes(state.mode, (mode) => {
  if (taskState.active) {
    alert("測驗進行中，不可更換模式！");
    return;
  }
  state.mode = mode; 
  state.answered = false; 
  renderCurrent(); 
});

ui.onCheckClick(check);
ui.onPeek(() => { 
  if (taskState.active) return; // 任務模式中禁止偷看
  if (state.word) ui.peek(state.word); 
});

ui.onReset(() => { 
  if (confirm("確定要清除所有進度嗎？（會重新測程度）")) { 
    store.reset(); 
    startPlacement(); 
  } 
});

ui.onSummary(() => ui.toggleSummary(store.summary(WORDS)));
ui.onPlace(() => startPlacement());

// ---- boot ----
(async function boot() {
  try {
    WORDS = await loadWordBank();
  } catch (e) {
    document.querySelector("#stage").innerHTML =
      `<p style="color:var(--coral);font-weight:700">載入單字失敗：${e.message}<br>請用伺服器開啟（見 README）。</p>`;
    return;
  }
  if (store.progress().placed) { 
    ui.setScreen("play"); 
    refreshChrome(); 
    checkAndStartDailyTask(); 
  } else {
    startPlacement();
  }
})();
