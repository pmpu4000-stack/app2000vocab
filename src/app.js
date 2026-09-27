// =====================================================================
// app.js — the controller. Boots the word bank, runs the placement test,
// drives level-based practice, and gates progression behind challenges.
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

const wordsAt = (level) => WORDS.filter((w) => w.level === level);

function levelInfo() {
  const prog = store.progress();
  return LEVELS.map((L) => {
    const ws = wordsAt(L.n);
    const mast = ws.filter((w) => store.box(w.id) >= 3).length;
    const st = L.n > prog.unlocked ? "locked" : L.n === prog.current ? "current" : "open";
    return { n: L.n, name: L.name, color: L.color, state: st, pct: ws.length ? Math.round((mast / ws.length) * 100) : 0 };
  });
}

// Repaint the level bar, header stats, and the gate banner.
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
}
function newRound() {
  state.word = nextWord(WORDS, store.progress().current, state.word?.id);
  state.answered = false;
  renderCurrent();
}

function check() {
  if (state.answered) { newRound(); return; }
  const getGuess = state.round.getGuess;
  if (!getGuess) return;                       // pick mode answers on click
  const guess = getGuess();
  if (!guess) { ui.note("先拼拼看再檢查喔 ✏️"); return; }
  const correct = guess === state.word.word;
  state.round.applyTypedResult(correct);
  answer(correct);
}

function answer(correct) {
  if (state.answered) return;
  state.answered = true;
  const info = store.grade(state.word.id, correct, store.progress().current);
  ui.showResult(correct, state.word, info);
  if (correct) burst();
  refreshChrome();
  ui.setActionNext();
}

function pickLevel(n) { store.setCurrentLevel(n); refreshChrome(); newRound(); }

// ---- today's training session ----
function onSessionStart() { store.sessionStart(); refreshChrome(); }
function onSessionEnd() { showSessionSummary(store.sessionEnd()); }

function showSessionSummary(sum) {
  ui.setScreen("quiz");
  ui.quizResult({
    emoji: sum.answered ? "🎉" : "👋",
    color: "var(--violet)",
    headline: sum.answered ? "今天辛苦了！" : "今天還沒有練習",
    sub: sum.answered
      ? `作答 ${sum.answered} 題 · ✅ ${sum.correct} · ❌ ${sum.incorrect} · 正確率 ${sum.rate}%`
      : "下次按「開始今天的練習」再開始吧",
    extraHtml: sum.answered
      ? `<div class="sub">練了 ${sum.distinct} 個不同的字${sum.mastered ? ` · 新精通 ${sum.mastered} 字 ⭐` : ""}</div>
         <div class="sub" style="color:var(--catD)">🔥 連續練習 ${store.historyData().streak} 天</div>`
      : "",
    btnLabel: "完成 →",
  }, () => { ui.setScreen("play"); refreshChrome(); newRound(); });
}

// ---- placement: a spelling ladder that finds where accuracy drops ----
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
    if (got < 2) { start = lv; break; }        // struggled here → train from this level
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
  }, () => { ui.setScreen("play"); refreshChrome(); newRound(); });
}

// ---- level challenge: pass ≥80% to climb ----
async function startChallenge() {
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

// ---- wiring ----
ui.initModes(state.mode, (mode) => { state.mode = mode; state.answered = false; renderCurrent(); });
ui.onCheckClick(check);
ui.onPeek(() => { if (state.word) ui.peek(state.word); });
ui.onReset(() => { if (confirm("確定要清除所有進度嗎？（會重新測程度）")) { store.reset(); startPlacement(); } });
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
  if (store.progress().placed) { ui.setScreen("play"); refreshChrome(); newRound(); }
  else startPlacement();
})();
