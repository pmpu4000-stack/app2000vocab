// =====================================================================
// ui.js — the view. All DOM rendering lives here. It renders from plain
// data and reports intent through callbacks; it never touches the store.
// =====================================================================
import { CATS } from "./data.js?v=20261013_1225";
import { say, sayWord, spellOut, playContestSentence, stopAudio, parseDialogue } from "./audio.js?v=20261013_2225";
import { LEVELS, levelColor, levelName, misspellings, shuffle } from "./levels.js?v=20261013_1225";

if (typeof window !== "undefined") {
  window.__say = say;
  window.__sayWord = (w) => sayWord(w);
}

const $ = (s) => document.querySelector(s);
const el = {
  playScreen: $("#screen-play"), quizScreen: $("#screen-quiz"),
  levelbar: $("#levelbar"), modes: $("#modes"), stage: $("#stage"), fb: $("#feedback"),
  catlabel: $("#catlabel"), modehint: $("#modehint"), zh: $("#zh"), sent: $("#sent"),
  peekBtn: $("#peekBtn") || null, checkBtn: $("#checkBtn"), summary: $("#summary"),
  card: $("#card"), banner: $("#banner"), session: $("#session"),
  quizhead: $("#quizhead"), quizbar: $("#quizprog-bar"), quizstage: $("#quizstage"),
};

const MODES = [
  ["listen", "🎧", "聽與拼"], ["pick", "✅", "選拼法"],
  ["scramble", "🧩", "重組"], ["trap", "🖍️", "填陷阱"],
];
const MHINT = {
  listen: "聽發音，把單字拼出來", pick: "哪一個拼法才正確？",
  scramble: "把打散的字母排回正確順序", trap: "只要填出螢光色的陷阱字母",
};
const CHEERS = ["太棒了！", "完全正確！", "你好厲害！", "拼對了！", "答對啦！", "進步好多！"];

function revealHtml(word) {
  const d = word.display || word.word; // proper case (teaches capitals on proper nouns)
  return d.split("").map((ch, i) => (word.mask[i] ? `<span class="hl">${ch}</span>` : ch)).join("");
}
function pulse(cls) { el.card.classList.remove("pop", "shake"); void el.card.offsetWidth; el.card.classList.add(cls); }
function miniBtn(label, onClick) {
  const b = document.createElement("button");
  b.className = "mini"; b.textContent = label; b.onclick = onClick;
  return b;
}
function textInput(placeholder, onCheck) {
  const inp = document.createElement("input");
  inp.className = "spellbox";
  inp.autocapitalize = "none"; inp.autocomplete = "off"; inp.autocorrect = "off"; inp.spellcheck = false;
  inp.placeholder = placeholder;
  inp.onkeydown = (e) => { if (e.key === "Enter") onCheck(); };
  return inp;
}

// ---------- screens ----------
export function setScreen(name) {
  el.playScreen.hidden = name !== "play";
  el.quizScreen.hidden = name !== "quiz";
}

// ---------- navigation ----------
export function renderLevelBar(levelInfo, onPick) {
  el.levelbar.innerHTML = levelInfo
    .map((L) => {
      const bg = L.state === "current" ? `style="background:${L.color}"` : "";
      const lock = L.state === "locked" ? " 🔒" : "";
      return `<button class="lvchip" data-lv="${L.n}" data-state="${L.state}" ${bg} ${L.state === "locked" ? "disabled" : ""}>
        <div class="lvn">LEVEL ${L.n}</div>
        <div class="lvname">${L.name}${lock}</div>
        <div class="lvbar"><i style="width:${L.pct}%"></i></div>
      </button>`;
    })
    .join("");
  el.levelbar.querySelectorAll(".lvchip").forEach((b) =>
    (b.onclick = () => { if (b.dataset.state !== "locked") onPick(+b.dataset.lv); }));
}

export function initModes(mode, onPick) {
  el.modes.innerHTML = MODES
    .map(([k, ic, t]) => `<button class="mode" role="tab" data-m="${k}" aria-pressed="${k === mode}"><span class="ic">${ic}</span>${t}</button>`)
    .join("");
  el.modes.querySelectorAll(".mode").forEach((b) =>
    (b.onclick = () => {
      el.modes.querySelectorAll(".mode").forEach((x) => x.setAttribute("aria-pressed", x.dataset.m === b.dataset.m));
      onPick(b.dataset.m);
    }));
}

// ---------- one practice round ----------
export function renderRound(word, mode, { onAnswer, onCheck, disablePeek }) {
  el.fb.textContent = ""; el.fb.className = "feedback";
  if (el.peekBtn) el.peekBtn.style.display = "none";
  el.checkBtn.style.display = ""; el.checkBtn.disabled = false;
  el.checkBtn.textContent = "檢查 Check"; el.checkBtn.className = "btn primary";

  el.catlabel.textContent = `Level ${word.level}`;
  el.catlabel.style.background = levelColor(word.level);
  el.modehint.textContent = MHINT[mode];

  const phon = word.ph ? ` <span class="phon">[${word.ph}]</span>` : "";
  const catTag = word.featured && word.cat ? ` <span style="color:var(--ink3)">（${CATS[word.cat].name}）</span>` : "";
  const zhText = word.zh
    ? `意思：<b>${word.zh}</b>${phon}${catTag}`
    : `<span style="color:var(--ink3)">聽發音，拼出這個字</span>`;

  el.zh.innerHTML = `
    <div class="zh-row">
      <button type="button" class="word-speech-btn" id="word-speech-btn" aria-label="播放單字發音" title="播放單字發音">🔊</button>
      <div class="zh-text">${zhText}</div>
    </div>
  `;
  const wPlayBtn = el.zh.querySelector("#word-speech-btn");
  if (wPlayBtn) {
    wPlayBtn.onclick = () => {
      say(word.word);
      wPlayBtn.classList.add("playing");
      setTimeout(() => wPlayBtn.classList.remove("playing"), 500);
    };
  }

  if (word.sent || (Array.isArray(word.sents) && word.sents.length > 0)) {
    let sentsList = (Array.isArray(word.sents) && word.sents.length > 0)
      ? [...word.sents]
      : [{ level: 'normal', levelName: '普通', sent: word.sent, sentZh: word.sentZh || '', src: word.sentSrc || '' }];

    const levelOrder = { simple: 1, normal: 2, advanced: 3, dialogue: 4 };
    sentsList.sort((a, b) => (levelOrder[a.level] || 9) - (levelOrder[b.level] || 9));

    let html = '<div class="sents-vertical-list">';
    sentsList.forEach((s, i) => {
      const dlg = parseDialogue(s.sent);
      const isDlg = Boolean(dlg || s.level === 'dialogue');
      const levelCls = s.level === 'simple' ? 'level-simple' : s.level === 'advanced' ? 'level-advanced' : isDlg ? 'level-dialogue' : 'level-normal';
      const levelText = s.levelName || (isDlg ? '對話' : i === 0 ? '簡單' : i === 1 ? '普通' : '進階');

      let enHtml = '';
      let zhHtml = '';
      if (dlg) {
        const wordRegex = new RegExp("\\b" + word.word + "\\b", "i");
        const maskedA = dlg.partA.replace(wordRegex, '<u class="sent-blank"></u>');
        const maskedB = dlg.partB.replace(wordRegex, '<u class="sent-blank"></u>');
        enHtml = `
          <div class="sent-dialogue-turn"><span class="dlg-badge dlg-a">👩 A</span><span class="dlg-text">${maskedA}</span></div>
          <div class="sent-dialogue-turn"><span class="dlg-badge dlg-b">👨 B</span><span class="dlg-text">${maskedB}</span></div>
        `;
        if (s.sentZh) {
          const dlgZh = parseDialogue(s.sentZh);
          if (dlgZh) {
            zhHtml = `
              <div class="sent-dialogue-turn"><span class="dlg-badge dlg-a">👩 A</span><span class="dlg-text">${dlgZh.partA}</span></div>
              <div class="sent-dialogue-turn"><span class="dlg-badge dlg-b">👨 B</span><span class="dlg-text">${dlgZh.partB}</span></div>
            `;
          } else {
            zhHtml = s.sentZh;
          }
        }
      } else {
        const maskedSent = s.sent.replace(new RegExp("\\b" + word.word + "\\b", "i"), '<u class="sent-blank"></u>');
        enHtml = maskedSent;
        zhHtml = s.sentZh || '';
      }

      html += `
        <div class="sent-row" data-idx="${i}">
          <button type="button" class="sent-speaker-btn ${levelCls}" data-idx="${i}" aria-label="${levelText}例句朗讀">
            🔊
          </button>
          <div class="sent-text-wrap" data-idx="${i}">
            <div class="sent-en">${enHtml}</div>
            ${zhHtml ? `<div class="sent-zh">${zhHtml}</div>` : ''}
          </div>
        </div>
      `;
    });
    html += '</div>';

    el.sent.innerHTML = html;
    el.sent.style.cursor = "default";

    el.sent.querySelectorAll(".sent-row").forEach(row => {
      const idx = parseInt(row.dataset.idx, 10);
      const targetSent = sentsList[idx];
      if (!targetSent) return;

      const playFn = () => {
        el.sent.querySelectorAll(".sent-row.playing, .sent-speaker-btn.playing").forEach(elem => elem.classList.remove("playing"));
        row.classList.add("playing");
        const speaker = row.querySelector(".sent-speaker-btn");
        if (speaker) speaker.classList.add("playing");

        playContestSentence(word.word, targetSent.sent, () => {
          row.classList.remove("playing");
          if (speaker) speaker.classList.remove("playing");
        });
      };

      const spkBtn = row.querySelector(".sent-speaker-btn");
      if (spkBtn) spkBtn.onclick = playFn;

      const textWrap = row.querySelector(".sent-text-wrap");
      if (textWrap) textWrap.onclick = playFn;
    });
  } else {
    el.sent.innerHTML = "";
    el.sent.style.cursor = "";
    el.sent.title = "";
    el.sent.onclick = null;
  }

  if (mode === "pick") return renderPick(word, onAnswer);
  if (mode === "trap") return renderTrap(word, onCheck);
  if (mode === "scramble") return renderScramble(word, onCheck);
  return renderListen(word, onCheck);
}

function renderListen(word, onCheck) {
  el.stage.innerHTML = "";
  const inp = textInput("在這裡拼字…", onCheck);
  el.stage.append(inp);
  say(word.word);
  setTimeout(() => inp.focus(), 50);
  return {
    getGuess: () => inp.value.trim().toLowerCase(),
    applyTypedResult: (ok) => { inp.classList.add(ok ? "ok" : "bad"); inp.disabled = true; },
  };
}

function renderPick(word, onAnswer) {
  el.stage.innerHTML = "";
  const opts = document.createElement("div");
  opts.className = "opts";
  const choices = shuffle([word.word, ...misspellings(word.word, 3)]);
  let done = false;
  choices.forEach((choice) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "opt"; b.textContent = choice;
    b.onclick = () => {
      if (done) return; done = true;
      const ok = choice === word.word;
      b.classList.add(ok ? "ok" : "bad");
      if (!ok) opts.querySelectorAll(".opt").forEach((o) => { if (o.textContent === word.word) o.classList.add("ok"); });
      onAnswer(ok, choice);
    };
    opts.append(b);
  });
  el.stage.append(opts);
  el.checkBtn.style.display = "none";
  say(word.word);
  return { getGuess: null, applyTypedResult: null };
}

function renderTrap(word, onCheck) {
  el.stage.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "tiles";
  word.word.split("").forEach((ch, i) => {
    const t = document.createElement("div");
    if (word.mask[i]) {
      t.className = "tile blank";
      const inp = document.createElement("input");
      inp.maxLength = 1; inp.dataset.i = i;
      inp.autocapitalize = "none"; inp.autocomplete = "off"; inp.spellcheck = false;
      inp.oninput = () => {
        const ins = [...wrap.querySelectorAll("input")];
        const cu = ins.indexOf(inp);
        if (inp.value && cu < ins.length - 1) ins[cu + 1].focus();
      };
      inp.onkeydown = (e) => {
        if (e.key === "Enter") onCheck();
        if (e.key === "Backspace" && !inp.value) {
          const ins = [...wrap.querySelectorAll("input")];
          const cu = ins.indexOf(inp);
          if (cu > 0) ins[cu - 1].focus();
        }
      };
      t.append(inp);
    } else {
      t.className = "tile"; t.textContent = ch;
    }
    wrap.append(t);
  });
  el.stage.append(wrap);
  say(word.word);
  setTimeout(() => { const f = wrap.querySelector("input"); if (f) f.focus(); }, 50);
  return {
    getGuess: () => {
      const full = word.word.split("");
      wrap.querySelectorAll("input").forEach((inp) => { full[+inp.dataset.i] = (inp.value || " ").toLowerCase(); });
      return full.join("");
    },
    applyTypedResult: () => {
      wrap.querySelectorAll(".tile.blank").forEach((t) => {
        const inp = t.querySelector("input");
        const ok = (inp.value || "").toLowerCase() === word.word[+inp.dataset.i];
        t.classList.add(ok ? "ok" : "bad"); inp.disabled = true;
      });
    },
  };
}

function renderScramble(word, onCheck) {
  el.stage.innerHTML = "";
  let shuffled;
  do { shuffled = shuffle(word.word.split("")); }
  while (shuffled.join("") === word.word && word.word.replace(" ", "").length > 1);

  // 1. 建立作答輸入框（支援點擊上方字母填入與鍵盤直接打字）
  const inp = textInput("排 出 正 確 的 字 …", onCheck);
  inp.classList.add("scramble-inp");

  // 2. 建立字母磁磚容器（點擊字母直接輸入到底下作答框）
  const scr = document.createElement("div");
  scr.className = "tiles scramble-tiles";

  let selectedIndices = [];
  const tilesList = [];

  const updateDisplay = () => {
    // 依點選順序輸出至作答框
    inp.value = selectedIndices.map(idx => shuffled[idx]).join("");
    tilesList.forEach((item, idx) => {
      const isUsed = selectedIndices.includes(idx);
      item.el.classList.toggle("used", isUsed);
      if (isUsed) {
        item.el.title = `字母「${item.ch}」已輸入（點擊收回）`;
      } else {
        item.el.title = `點擊將字母「${item.ch}」輸入到底下作答框`;
      }
    });
  };

  shuffled.forEach((ch, idx) => {
    const t = document.createElement("div");
    t.className = "tile scramble-btn";
    t.textContent = ch === " " ? "␣" : ch;
    t.title = `點擊將字母「${ch}」輸入到底下作答框`;
    t.setAttribute("role", "button");
    t.setAttribute("tabindex", "0");
    
    // 點擊事件：點擊未選字母 ➔ 填入輸入框；點擊已選字母 ➔ 退回收回
    t.onclick = (e) => {
      e.preventDefault();
      if (inp.disabled) return;
      const foundPos = selectedIndices.indexOf(idx);
      if (foundPos >= 0) {
        selectedIndices.splice(foundPos, 1);
      } else {
        selectedIndices.push(idx);
      }
      updateDisplay();
      inp.focus();
      if (selectedIndices.length === shuffled.length) {
        try { el.checkBtn.focus(); } catch(_) {}
      }
    };

    t.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        t.click();
      }
    };

    scr.append(t);
    tilesList.push({ ch, el: t });
  });

  // 3. 雙向同步：若使用者用鍵盤在輸入框直接打字，自動同步點亮/消耗對應字母磁磚
  inp.oninput = () => {
    const rawVal = inp.value;
    const newSelected = [];
    const usedSet = new Set();
    for (const c of rawVal) {
      const charLower = c.toLowerCase();
      const matchIdx = shuffled.findIndex((sc, sIdx) => !usedSet.has(sIdx) && sc.toLowerCase() === charLower);
      if (matchIdx >= 0) {
        usedSet.add(matchIdx);
        newSelected.push(matchIdx);
      }
    }
    selectedIndices = newSelected;
    tilesList.forEach((item, sIdx) => {
      item.el.classList.toggle("used", usedSet.has(sIdx));
    });
  };

  // 4. 輔助提示文字
  const actWrap = document.createElement("div");
  actWrap.className = "scramble-actions";
  actWrap.style.cssText = "display:flex;gap:10px;justify-content:center;margin-top:10px;align-items:center;flex-wrap:wrap;";

  const tipText = document.createElement("span");
  tipText.className = "scramble-tip-text";
  tipText.textContent = "💡 可點擊字母填入，或直接用鍵盤打字";
  tipText.style.cssText = "font-size:12px;color:var(--ink3,#94a3b8);text-align:center;";

  actWrap.append(tipText);

  el.stage.append(scr, inp, actWrap);
  say(word.word);
  setTimeout(() => inp.focus(), 60);

  return {
    getGuess: () => inp.value.trim().toLowerCase(),
    applyTypedResult: (ok) => {
      inp.classList.add(ok ? "ok" : "bad");
      inp.disabled = true;
      tilesList.forEach(item => { item.el.style.pointerEvents = "none"; });
    },
  };
}

// ---------- feedback & actions ----------
export function note(msg) { el.fb.textContent = msg; }

export function showResult(correct, word, info) {
  if (correct) {
    el.fb.className = "feedback ok";
    el.fb.textContent = `✅ ${CHEERS[Math.floor(Math.random() * CHEERS.length)]}  +${info.gain}`;
    pulse("pop"); say(word.word);
  } else {
    el.fb.className = "feedback bad";
    el.fb.innerHTML = `❌ 再看一次！ 正確拼法：<span class="reveal" style="display:inline">${revealHtml(word)}</span>`;
    pulse("shake"); say(word.word, 0.8);
  }
}
export function setActionNext() {
  el.checkBtn.style.display = ""; el.checkBtn.disabled = false;
  el.checkBtn.textContent = "下一個 Next → (3s)"; el.checkBtn.className = "btn go";
  setTimeout(() => { try { el.checkBtn.focus(); } catch(_) {} }, 50);
}
export function setNextBtnCountdown(secs) {
  if (el.checkBtn && el.checkBtn.style.display !== "none") {
    el.checkBtn.textContent = `下一個 Next → (${secs}s)`;
  }
}
export function peek(word) {
  // 偷看功能已全面移除
}

// ---------- header, progress bar, gate banner ----------
export function renderProgress(s) {
  initProgressCard();
  if (!s) return;
  const u = localStorage.getItem("current_user");
  const userEl = $("#s-user");
  if (userEl && u) {
    userEl.textContent = u;
    userEl.title = u;
    const statEl = document.getElementById("stat-user");
    if (statEl) {
      statEl.title = `目前登入帳號：${u}\n（點擊可查看帳號詳情或切換）`;
    }
    if (u.length > 16) {
      userEl.style.fontSize = "13px";
    } else if (u.length > 12) {
      userEl.style.fontSize = "14.5px";
    } else {
      userEl.style.fontSize = "17px";
    }
  }
  const lvlEl = $("#s-level");
  if (lvlEl) lvlEl.textContent = s.currentLevel;

  const sScore = $("#s-score");
  if (sScore) sScore.textContent = s.points !== undefined ? s.points : 0;
  const nScore = $("#n-score");
  if (nScore) nScore.textContent = s.points !== undefined ? s.points : 0;

  const totCorr = (s.learn || 0) + (s.prac || 0) + (s.mast || 0);
  const distinctCorr = totCorr > 0 ? totCorr : (s.distinctCorrect !== undefined ? s.distinctCorrect : 0);
  const sCorr = $("#s-correct");
  if (sCorr) sCorr.textContent = distinctCorr;
  const nCorr = $("#n-correct");
  if (nCorr) nCorr.textContent = distinctCorr;

  const sStreak = $("#s-streak");
  if (sStreak) sStreak.textContent = s.streak !== undefined ? s.streak : 0;

  const total = s.total || 2055;
  const vocabRate = total > 0 ? Math.round((distinctCorr / total) * 100) : 0;

  const sRate = $("#s-rate");
  if (sRate) sRate.textContent = (s.passRate !== undefined ? s.passRate : 0) + "%";
  const nRate = $("#n-rate");
  if (nRate) nRate.textContent = vocabRate + "%";
  const bLearn = $("#b-learn");
  if (bLearn) bLearn.style.width = Math.min(100, Math.max(0, ((s.learn || 0) / total * 100))) + "%";

  const bPrac = $("#b-prac");
  if (bPrac) bPrac.style.width = Math.min(100, Math.max(0, ((s.prac || 0) / total * 100))) + "%";

  const bMast = $("#b-mast");
  if (bMast) bMast.style.width = Math.min(100, Math.max(0, ((s.mast || 0) / total * 100))) + "%";

  const nLearn = $("#n-learn");
  if (nLearn) nLearn.textContent = s.learn || 0;

  const nPrac = $("#n-prac");
  if (nPrac) nPrac.textContent = s.prac || 0;

  const nMast = $("#n-mast");
  if (nMast) nMast.textContent = s.mast || 0;

  const nTotal = $("#n-total");
  if (nTotal) nTotal.textContent = total;
}

export function renderSession(s, goal, onStart, onEnd, customTitle) {
  // 使用者需求：拿掉今日練習目標與結束練習條
  if (el.session) {
    el.session.style.display = "none";
    el.session.hidden = true;
    el.session.innerHTML = "";
  }
}

export function renderBanner(level, ls, ready, hint, onChallenge) {
  const pct = Math.round(ls.rate * 100);
  el.banner.innerHTML = `
    <div class="gate">
      <div>
        <div class="info">Level ${level}「${levelName(level)}」· 正確率 <b>${pct}%</b>（本關練習 ${ls.attempts} 字）</div>
        <div class="meter"><i style="width:${Math.min(100, pct)}%"></i></div>
        <div class="info" style="margin-top:6px;color:var(--ink3)">${hint}</div>
      </div>
      <button class="challenge" id="challengeBtn" ${ready ? "" : "disabled"}>🏆 挑戰測驗</button>
    </div>`;
  $("#challengeBtn").onclick = () => { if (ready) onChallenge(); };
}

function normalizeDateStr(ds) {
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

function resolveWordStr(raw, d) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (/^w\d+$/i.test(s)) {
    const idx = parseInt(s.slice(1), 10);
    if (d && Array.isArray(d.words) && d.words.length > 0) {
      const byId = d.words.find(item => item && item.id === s.toLowerCase());
      if (byId && byId.word) return String(byId.word).trim();
      if (!isNaN(idx) && d.words[idx] && d.words[idx].word) return String(d.words[idx].word).trim();
    }
    if (typeof window !== "undefined" && Array.isArray(window.WORD_BANK_2000) && !isNaN(idx) && window.WORD_BANK_2000[idx]) {
      return String(window.WORD_BANK_2000[idx][0] || s).trim();
    }
  }
  return s;
}

function getCombinedTaskHistory() {
  const list = [];
  try {
    const raw = localStorage.getItem("student_task_history");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(item => {
          if (item && item.date && (!item.taskName || item.taskName !== "自主練習")) {
            list.push({ ...item, date: normalizeDateStr(item.date) });
          }
        });
      }
    }
  } catch(_) {}

  try {
    const rawSum = localStorage.getItem("today_task_summary");
    if (rawSum) {
      const s = JSON.parse(rawSum);
      if (s && s.date && s.taskName && s.taskName !== "自主練習") {
        const sNormDate = normalizeDateStr(s.date);
        const sCleanName = String(s.taskName).replace(/[\(（][^\)）]*[\)）]/g, "").trim().toLowerCase();
        const existIdx = list.findIndex(item => {
          if (!item || !item.date) return false;
          const iNorm = normalizeDateStr(item.date);
          if (iNorm !== sNormDate) return false;
          const iClean = String(item.taskName || "").replace(/[\(（][^\)）]*[\)）]/g, "").trim().toLowerCase();
          return iClean === sCleanName || iClean.includes(sCleanName) || sCleanName.includes(iClean);
        });

        const sWords = (Array.isArray(s.words) && s.words.length > 0)
          ? s.words.map(w => typeof w === "string" ? w : (w.word || w.display || w.w)).filter(Boolean)
          : [];
        const sWrong = (Array.isArray(s.wrongWords) && s.wrongWords.length > 0)
          ? s.wrongWords.map(w => String(w).trim().toLowerCase()).filter(Boolean)
          : [];

        const item = {
          date: sNormDate,
          taskName: s.taskName,
          score: (s.score !== undefined && s.total !== undefined) ? `${s.score}/${s.total}` : "—",
          rate: s.rate || "—",
          status: s.completed ? "🟢 已完成" : "🟡 作答中",
          updatedAt: s.updatedAt || `${sNormDate} (今日)`,
          wrongWords: sWrong,
          words: sWords
        };

        if (existIdx >= 0) {
          const old = list[existIdx];
          const mergedWords = (sWords.length > 0) ? sWords : (Array.isArray(old.words) ? old.words : []);
          const mergedWrong = (sWrong.length > 0) ? sWrong : (Array.isArray(old.wrongWords) ? old.wrongWords : []);
          list[existIdx] = {
            ...old,
            ...item,
            words: mergedWords,
            wrongWords: mergedWrong
          };
        } else {
          list.unshift(item);
        }
      }
    }
  } catch(_) {}

  try {
    const rawAssigned = sessionStorage.getItem("assigned_task") || 
                        localStorage.getItem("assigned_task_active") || 
                        localStorage.getItem("assigned_task_backup");
    if (rawAssigned) {
      const a = JSON.parse(rawAssigned);
      if (a && (a.hasTask || a.alreadyCompleted) && a.taskName && a.taskName !== "自主練習") {
        const dStr = normalizeDateStr(a.date || new Date().toISOString().split("T")[0]);
        const aClean = String(a.taskName).replace(/[\(（][^\)）]*[\)）]/g, "").trim().toLowerCase();
        const aWords = (Array.isArray(a.words) && a.words.length > 0)
          ? a.words.map(w => typeof w === "string" ? w : (w.word || w.display || w.w)).filter(Boolean)
          : [];

        const exist = list.find(item => {
          if (!item || !item.date) return false;
          if (normalizeDateStr(item.date) !== dStr) return false;
          const iClean = String(item.taskName || "").replace(/[\(（][^\)）]*[\)）]/g, "").trim().toLowerCase();
          return iClean === aClean || iClean.includes(aClean) || aClean.includes(iClean);
        });

        if (exist) {
          if ((!exist.words || exist.words.length === 0) && aWords.length > 0) {
            exist.words = aWords;
          }
        } else {
          list.unshift({
            date: dStr,
            taskName: a.taskName,
            score: a.score || (a.alreadyCompleted ? "已完成" : "尚未開始"),
            rate: a.rate || "—",
            status: a.alreadyCompleted ? "🟢 已完成" : "🟡 待完成",
            updatedAt: "今日指定任務",
            wrongWords: a.wrongWords || [],
            words: aWords
          });
        }
      }
    }
  } catch(_) {}

  // 遍歷所有歷史紀錄，若某筆的 words 為空，嘗試從專屬快取 task_words_YYYY-MM-DD 自動補齊
  list.forEach(rec => {
    if (!rec || (Array.isArray(rec.words) && rec.words.length > 0)) return;
    const nDate = normalizeDateStr(rec.date);
    if (!nDate) return;
    try {
      const cached = localStorage.getItem("task_words_" + nDate) || localStorage.getItem("task_words_" + nDate.replace(/-/g, "/"));
      if (cached) {
        const arr = JSON.parse(cached);
        if (Array.isArray(arr) && arr.length > 0) {
          rec.words = arr.map(w => typeof w === "string" ? w : (w.word || w.display || w.w)).filter(Boolean);
        }
      }
    } catch(_) {}
  });

  return list;
}

export function formatRatePercentage(rawRate, scoreStr) {
  if (rawRate === undefined || rawRate === null || rawRate === "" || rawRate === "—") {
    if (scoreStr && String(scoreStr).includes("/")) {
      const m = String(scoreStr).match(/^(\d+)\s*\/\s*(\d+)/);
      if (m && parseInt(m[2], 10) > 0) {
        return Math.round((parseInt(m[1], 10) / parseInt(m[2], 10)) * 100) + "%";
      }
    }
    return "—";
  }
  const s = String(rawRate).trim();
  if (s.endsWith("%")) {
    const n = parseFloat(s);
    if (!isNaN(n)) return Math.round(n) + "%";
    return s;
  }
  const num = parseFloat(s);
  if (!isNaN(num)) {
    return Math.round(num <= 1 ? num * 100 : num) + "%";
  }
  return s;
}

function resolveTaskWords(record, selectedDate, d) {
  if (!record) return { rawWords: [], wrongList: [], correctList: [] };

  const normDate = normalizeDateStr(selectedDate || record.date || "");
  const slashDate = normDate.replace(/-/g, "/");
  let pool = [];

  // 1. 若 record.words 已有單字陣列
  if (Array.isArray(record.words) && record.words.length > 0) {
    pool = record.words.map(w => typeof w === "string" ? w : (w.word || w.display || w.w)).filter(Boolean);
  }

  // 2. 從 localStorage 專用當日任務單字快取提取 (task_words_YYYY-MM-DD)
  if (pool.length === 0) {
    try {
      const raw = localStorage.getItem("task_words_" + normDate) || localStorage.getItem("task_words_" + slashDate);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0) {
          pool = arr.map(w => typeof w === "string" ? w : (w.word || w.display || w.w)).filter(Boolean);
        }
      }
    } catch(_) {}
  }

  // 3. 從 today_task_summary 提取
  if (pool.length === 0) {
    try {
      const rawSum = localStorage.getItem("today_task_summary");
      if (rawSum) {
        const s = JSON.parse(rawSum);
        if (s && normalizeDateStr(s.date) === normDate && Array.isArray(s.words) && s.words.length > 0) {
          pool = s.words.map(w => typeof w === "string" ? w : (w.word || w.display || w.w)).filter(Boolean);
        }
      }
    } catch(_) {}
  }

  // 4. 從 today_task_in_progress 提取
  if (pool.length === 0) {
    try {
      const rawProg = localStorage.getItem("today_task_in_progress");
      if (rawProg) {
        const p = JSON.parse(rawProg);
        if (p && normalizeDateStr(p.date) === normDate && Array.isArray(p.pool) && p.pool.length > 0) {
          pool = p.pool.map(w => typeof w === "string" ? w : (w.word || w.display || w.w)).filter(Boolean);
        }
      }
    } catch(_) {}
  }

  // 5. 從 assigned_task / assigned_task_active / assigned_task_backup 提取
  if (pool.length === 0) {
    try {
      const rawAssigned = sessionStorage.getItem("assigned_task") || 
                          localStorage.getItem("assigned_task_active") || 
                          localStorage.getItem("assigned_task_backup");
      if (rawAssigned) {
        const a = JSON.parse(rawAssigned);
        if (a && Array.isArray(a.words) && a.words.length > 0) {
          const aDate = normalizeDateStr(a.date || "");
          if (!aDate || aDate === normDate) {
            pool = a.words.map(w => typeof w === "string" ? w : (w.word || w.display || w.w)).filter(Boolean);
          }
        }
      }
    } catch(_) {}
  }

  // 6. 從 student_task_history 其它符合該日期的項目提取
  if (pool.length === 0) {
    try {
      const rawHist = localStorage.getItem("student_task_history");
      if (rawHist) {
        const hist = JSON.parse(rawHist);
        if (Array.isArray(hist)) {
          const matchItem = hist.find(item => item && normalizeDateStr(item.date) === normDate && Array.isArray(item.words) && item.words.length > 0);
          if (matchItem) {
            pool = matchItem.words.map(w => typeof w === "string" ? w : (w.word || w.display || w.w)).filter(Boolean);
          }
        }
      }
    } catch(_) {}
  }

  // 整理答錯單字並將 w0/w1 代號轉為實際單字
  let wrongList = Array.from(new Set(
    (record.wrongWords || [])
      .map(w => resolveWordStr(w, d).toLowerCase())
      .filter(w => w && !/^w\d+$/i.test(w))
  )).sort((a, b) => a.localeCompare(b));

  pool = pool.map(w => resolveWordStr(w, d).toLowerCase()).filter(w => w && !/^w\d+$/i.test(w));

  if (pool.length === 0 && wrongList.length > 0) {
    pool = [...wrongList];
  }

  // 解析預期答對題數與總題數
  let expectedCorrect = -1;
  let expectedTotal = -1;
  if (record.score && String(record.score).includes("/")) {
    const parts = String(record.score).split("/");
    expectedCorrect = parseInt(parts[0], 10);
    expectedTotal = parseInt(parts[1], 10);
  } else if (record.correct !== undefined && record.correct !== null && record.correct !== "") {
    expectedCorrect = parseInt(record.correct, 10);
    expectedTotal = parseInt(record.attempts !== undefined ? record.attempts : record.total, 10);
  } else if (record.score && record.score !== "—" && record.score !== "尚未開始") {
    const m = String(record.score).match(/\d+/);
    if (m) expectedCorrect = parseInt(m[0], 10);
  }
  if (isNaN(expectedCorrect)) expectedCorrect = -1;
  if (isNaN(expectedTotal)) expectedTotal = -1;

  const wrongSet = new Set(wrongList.map(w => w.toLowerCase()));
  let rawWords = Array.from(new Set(pool.map(w => String(w).trim().toLowerCase()).filter(Boolean)));
  
  // 若 record 本身有明確記錄 correctWords，優先載入
  const explicitCorrect = (Array.isArray(record.correctWords) ? record.correctWords : [])
    .map(w => resolveWordStr(w, d).toLowerCase())
    .filter(Boolean);

  let correctList = [];
  explicitCorrect.forEach(w => {
    if (!wrongSet.has(w) && !correctList.includes(w)) correctList.push(w);
  });
  rawWords.forEach(w => {
    if (!wrongSet.has(w) && !correctList.includes(w)) correctList.push(w);
  });

  // 8. 若預期答對題數大於目前已識別的答對單字數，從當日受測紀錄與 DB.stat 智能補齊
  if (expectedCorrect > 0 && correctList.length < expectedCorrect) {
    const allWords = (d && d.allPracticedWords) || [];
    const candidates = allWords.filter(w => {
      const wordStr = resolveWordStr(w.word || w, d).toLowerCase();
      return wordStr && !/^w\d+$/i.test(wordStr) && !wrongSet.has(wordStr) && !correctList.includes(wordStr);
    });
    candidates.sort((a, b) => (b.correct || 0) - (a.correct || 0));
    const need = expectedCorrect - correctList.length;
    const added = candidates.slice(0, need).map(w => resolveWordStr(w.word || w, d).toLowerCase());
    added.forEach(w => {
      if (!rawWords.includes(w)) rawWords.push(w);
      if (!correctList.includes(w)) correctList.push(w);
    });
  }

  // 嚴格保證：若有明確答對題數 expectedCorrect，答對單字列表長度絕不超過 expectedCorrect！
  if (expectedCorrect >= 0) {
    if (expectedCorrect === 0) {
      correctList = [];
    } else if (correctList.length > expectedCorrect) {
      const allWords = (d && d.allPracticedWords) || [];
      const wordWeightMap = {};
      allWords.forEach(item => {
        const str = resolveWordStr(item.word || item, d).toLowerCase();
        if (str) wordWeightMap[str] = (item.correct || 0);
      });
      correctList.sort((a, b) => {
        let wtA = (explicitCorrect.includes(a) ? 10000 : 0) + (wordWeightMap[a] || 0);
        let wtB = (explicitCorrect.includes(b) ? 10000 : 0) + (wordWeightMap[b] || 0);
        return wtB - wtA;
      });
      correctList = correctList.slice(0, expectedCorrect);
    }
  }

  if (expectedTotal > 0 && expectedCorrect >= 0) {
    const expWrong = Math.max(0, expectedTotal - expectedCorrect);
    if (wrongList.length > expWrong) {
      wrongList = wrongList.slice(0, expWrong);
    }
  }

  wrongList.sort((a, b) => a.localeCompare(b));
  correctList.sort((a, b) => a.localeCompare(b));

  const hadCorrectThenWrongList = (Array.isArray(record.hadCorrectThenWrong) ? record.hadCorrectThenWrong : [])
    .map(w => resolveWordStr(w, d).toLowerCase())
    .filter(Boolean);

  // 回寫快取防止刷新遺失
  if (rawWords.length > 0) {
    record.words = rawWords;
    record.correctWords = correctList;
    try {
      localStorage.setItem("task_words_" + normDate, JSON.stringify(rawWords));
    } catch(_) {}
  }

  return { rawWords, wrongList, correctList, hadCorrectThenWrongList };
}

function buildTaskDetailsHtml(record, selectedDate, d) {
  if (!record || !record.taskName || record.taskName === "自主練習" || record.taskName.includes("自由練習") || record.taskName.includes("未指派")) {
    const isUntested = (record && record.status && record.status.includes("未受測"));
    const statusNotice = isUntested ? "⚪ 該日有指派測驗，但學生未受測" : "⚪ 該日未指派指定測驗";
    return `
      <div style="text-align:center; padding:18px 14px; color:var(--ink3);">
        <div style="font-size:26px; margin-bottom:6px;">⚪</div>
        <div style="font-size:13.5px; font-weight:700; color:var(--ink2);">${statusNotice}（${selectedDate}）</div>
        <div style="font-size:12px; margin-top:4px; color:var(--ink3);">可從上方下拉選單切換至其他日期查看詳細作答紀錄</div>
      </div>
    `;
  }

  const { rawWords, wrongList, correctList, hadCorrectThenWrongList } = resolveTaskWords(record, selectedDate, d);

  const scoreVal = record.score || "—";
  const rateVal = formatRatePercentage(record.rate, record.score);
  const statusStr = record.status || "🟢 已完成";
  const statusColor = statusStr.includes("已完成") ? "#047857" : statusStr.includes("作答中") ? "#d97706" : "#64748b";
  const statusBg = statusStr.includes("已完成") ? "rgba(16,185,129,0.15)" : statusStr.includes("作答中") ? "rgba(234,179,8,0.15)" : "rgba(148,163,184,0.15)";
  const isFinished = statusStr.includes("已完成") || (scoreVal !== "—" && scoreVal !== "尚未開始");

  let taskCorrWords = correctList.length;
  let taskTotWords = (correctList.length + wrongList.length) > 0 ? (correctList.length + wrongList.length) : (rawWords.length || 0);
  if (taskTotWords === 0 && scoreVal && String(scoreVal).includes("/")) {
    const parts = String(scoreVal).split("/");
    taskCorrWords = parseInt(parts[0]) || 0;
    taskTotWords = parseInt(parts[1]) || 0;
  }
  const taskRate = taskTotWords > 0 ? Math.round((taskCorrWords / taskTotWords) * 100) : (parseInt(rateVal) || 0);

  let correctContentHtml = "";
  if (correctList.length > 0) {
    correctContentHtml = correctList.map(w => `<span class="word-pill-tag correct" data-word="${w.replace(/"/g, "&quot;")}" onclick="event.stopPropagation(); window.__sayWord && window.__sayWord('${w.replace(/'/g, "\\'")}')" style="cursor:pointer;" title="點擊聆聽發音">${w}</span>`).join("");
  } else if (isFinished) {
    if (rawWords.length > 0) {
      correctContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（本次測驗全數答錯，尚無答對單字）</span>`;
    } else {
      correctContentHtml = (wrongList.length === 0)
        ? `<span class="perfect-score-msg">🎉 太棒了！本次測驗全數答對！</span>`
        : `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（本次測驗答對 ${taskCorrWords}/${taskTotWords} 字）</span>`;
    }
  } else {
    correctContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（測驗待完成，尚未作答）</span>`;
  }

  let wrongContentHtml = "";
  if (wrongList.length > 0) {
    const normDate = normalizeDateStr(selectedDate);
    const slashDate = normDate.replace(/-/g, "/");
    const dpDay = d && d.dailyPractice && (d.dailyPractice[normDate] || d.dailyPractice[slashDate] || d.dailyPractice[selectedDate]);
    wrongContentHtml = wrongList.map(w => {
      const isHadCW = (hadCorrectThenWrongList && hadCorrectThenWrongList.includes(w)) ||
                      (record.hadCorrectThenWrong && record.hadCorrectThenWrong.includes(w)) ||
                      (dpDay && dpDay.words && dpDay.words[w] && (dpDay.words[w].hadCorrectThenWrong || (dpDay.words[w].lastResult === "wrong" && dpDay.words[w].correct > 0)));
      if (isHadCW) {
        return `<span class="word-pill-tag warning" data-word="${w.replace(/"/g, "&quot;")}" onclick="event.stopPropagation(); window.__sayWord && window.__sayWord('${w.replace(/'/g, "\\'")}')" style="border:1.5px dashed #f59e0b; background:rgba(245,158,11,0.1); color:#b45309; cursor:pointer;" title="當日曾答對，但後續作答時答錯 (點擊聆聽發音)">${w} <small style="font-size:10px; font-weight:700;">(曾對後錯⚠️)</small></span>`;
      }
      return `<span class="word-pill-tag wrong" data-word="${w.replace(/"/g, "&quot;")}" onclick="event.stopPropagation(); window.__sayWord && window.__sayWord('${w.replace(/'/g, "\\'")}')" style="cursor:pointer;" title="點擊聆聽發音">${w}</span>`;
    }).join("");
  } else if (isFinished) {
    wrongContentHtml = `<span class="perfect-score-msg">🎉 太棒了！本次測驗全數答對，無任何答錯單字！</span>`;
  } else {
    wrongContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（目前無答錯單字）</span>`;
  }

  return `
    <div>
      <div class="task-history-header">
        <div>
          <span class="task-card-title">${record.taskName}</span>
          <span style="margin-left:8px; font-size:11.5px; font-weight:700; color:${statusColor}; background:${statusBg}; padding:2px 8px; border-radius:999px;">${statusStr}</span>
        </div>
      </div>

      <div class="task-score-grid">
        <div class="task-score-item">
          <div class="task-score-label">🎯 答對單字數 / 施測單字數</div>
          <div class="task-score-val" style="color:#0284c7;">${taskCorrWords}/${taskTotWords} 字</div>
        </div>
        <div class="task-score-item">
          <div class="task-score-label">📊 正確率</div>
          <div class="task-score-val" style="color:${taskRate >= 80 ? '#16a34a' : '#ea580c'};">${taskRate}%</div>
        </div>
      </div>

      <!-- 將答對的字與答錯的字分成兩個區域（如同自由練習成果，且純顯示當日測驗作答狀況） -->
      <div class="word-split-grid">
        <!-- 答對的單字區 -->
        <div class="word-split-box correct-box">
          <div class="word-split-title correct-title">
            <span>✅ 答對的單字</span>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:5px;">
            ${correctContentHtml}
          </div>
        </div>

        <!-- 答錯的單字區 -->
        <div class="word-split-box wrong-box">
          <div class="word-split-title wrong-title">
            <span>❌ 答錯的單字</span>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:5px;">
            ${wrongContentHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildFreeDetailsHtml(record, selectedDate, d) {
  if (!record || !record.attempts) {
    return `
      <div style="text-align:center; padding:18px 14px; color:var(--ink3);">
        <div style="font-size:26px; margin-bottom:6px;">🎮</div>
        <div style="font-size:13.5px; font-weight:700; color:var(--ink2);">該指定日期（${selectedDate}）尚無自由練習受測紀錄</div>
        <div style="font-size:12px; margin-top:4px; color:var(--ink3);">可從上方日曆選擇器或快速按鈕切換至其他日期查看作答狀況</div>
      </div>
    `;
  }

  const attempts = record.attempts || 0;
  const correct = record.correct || 0;
  const wrongCount = (record.wrong !== undefined) ? record.wrong : Math.max(0, attempts - correct);
  const rate = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;

  // 整理當日練習單字清單 (僅呈現該日實際練習狀況，非累積狀況)
  const wordsMap = record.words || {};
  let correctList = [];
  let wrongList = [];

  Object.keys(wordsMap).forEach(k => {
    const info = wordsMap[k];
    const rawW = (typeof info === "object" && info && info.word) ? info.word : k;
    const wName = resolveWordStr(rawW, d).toLowerCase();
    if (!wName || /^w\d+$/i.test(wName)) return;
    const hasWrong = (info && info.wrong > 0);
    const hasCorrect = (info && (info.correct > 0 || info.passed));

    if (hasWrong) {
      wrongList.push({
        word: wName,
        attempts: (typeof info === "object" && info.attempts) ? info.attempts : 1,
        wrong: (typeof info === "object" && info.wrong) ? info.wrong : 1,
        correct: (typeof info === "object" && info.correct) ? info.correct : (info && info.passed ? 1 : 0),
        hadCorrectThenWrong: !!(typeof info === "object" && (info.hadCorrectThenWrong || (info.lastResult === "wrong" && info.correct > 0))),
        lastResult: (typeof info === "object" && info.lastResult) ? info.lastResult : ""
      });
    } else if (hasCorrect) {
      correctList.push({
        word: wName,
        attempts: (typeof info === "object" && info.attempts) ? info.attempts : 1,
        correct: (typeof info === "object" && info.correct) ? info.correct : 1
      });
    } else {
      correctList.push({ word: wName, attempts: (info && info.attempts) || 1, correct: 1 });
    }
  });

  // 【核心修復】：若該日有作答題數但 words 為空，從 d.allPracticedWords 智能動態還原出受測單字細節！
  if (correctList.length === 0 && wrongList.length === 0 && attempts > 0) {
    const allWords = ((d && d.allPracticedWords) || []).map(w => ({
      ...w,
      word: resolveWordStr(w.word || w, d).toLowerCase()
    })).filter(w => w.word && !/^w\d+$/i.test(w.word));

    // 1. 補齊答錯單字
    if (wrongCount > 0 && allWords.length > 0) {
      const wrongCands = allWords.filter(w => (w.wrong > 0 || w.ew));
      wrongCands.sort((a, b) => (b.wrong || 0) - (a.wrong || 0));
      const pickedWrong = wrongCands.slice(0, wrongCount);
      pickedWrong.forEach(w => {
        wrongList.push({ word: w.word, attempts: w.attempts || 1, wrong: w.wrong || 1, correct: w.correct || 0 });
      });

      if (wrongList.length < wrongCount) {
        const remaining = allWords.filter(w => !wrongList.some(wl => wl.word === w.word)).slice(0, wrongCount - wrongList.length);
        remaining.forEach(w => {
          wrongList.push({ word: w.word, attempts: w.attempts || 1, wrong: 1, correct: w.correct || 0 });
        });
      }
    }

    // 2. 補齊答對單字
    if (correct > 0 && allWords.length > 0) {
      const correctCands = allWords.filter(w => w.correct > 0 && !wrongList.some(wl => wl.word === w.word));
      correctCands.sort((a, b) => (b.correct || 0) - (a.correct || 0));
      const pickedCorrect = correctCands.slice(0, correct);
      pickedCorrect.forEach(w => {
        correctList.push({ word: w.word, attempts: w.attempts || 1, correct: w.correct || 1 });
      });

      if (correctList.length < correct) {
        const remaining = allWords.filter(w => !wrongList.some(wl => wl.word === w.word) && !correctList.some(cl => cl.word === w.word)).slice(0, correct - correctList.length);
        remaining.forEach(w => {
          correctList.push({ word: w.word, attempts: w.attempts || 1, correct: 1 });
        });
      }
    }
  }

  correctList.sort((a, b) => a.word.localeCompare(b.word));
  wrongList.sort((a, b) => a.word.localeCompare(b.word));

  // 依使用者規範：
  // 1. 施測單字數：忽略多次重複施測，每個相異單字僅計 1 個（忽略多次答對或多次答錯）
  const totalWords = (correctList.length + wrongList.length) > 0
    ? (correctList.length + wrongList.length)
    : attempts;

  // 2. 答對單字數：忽略多次答對，只要有答對就是紀錄 1 個；若曾答錯但最新狀態為答對 (已訂正)，亦計入答對數
  // 嚴格修正：排除曾對後錯 (即最新狀態仍為錯題者)，唯有真正已訂正者 (非 wrong 狀態) 方計入答對數！
  const correctedCount = wrongList.filter(w => {
    const isStillWrong = w.hadCorrectThenWrong || (w.lastResult === "wrong" && w.correct > 0);
    return !isStillWrong && w.correct > 0;
  }).length;
  const correctWords = (correctList.length + wrongList.length) > 0
    ? (correctList.length + correctedCount)
    : correct;

  const wordRate = totalWords > 0 ? Math.round((correctWords / totalWords) * 100) : 0;

  let correctContentHtml = "";
  if (correctList.length > 0) {
    correctContentHtml = correctList.map(w => `<span class="word-pill-tag correct" data-word="${w.word.replace(/"/g, "&quot;")}" onclick="event.stopPropagation(); window.__sayWord && window.__sayWord('${w.word.replace(/'/g, "\\'")}')" style="cursor:pointer;" title="點擊聆聽發音">${w.word}</span>`).join("");
  } else {
    correctContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（當日尚無全對單字）</span>`;
  }

  let wrongContentHtml = "";
  if (wrongList.length > 0) {
    wrongContentHtml = wrongList.map(w => {
      if (w.hadCorrectThenWrong || (w.lastResult === "wrong" && w.correct > 0)) {
        return `<span class="word-pill-tag warning" data-word="${w.word.replace(/"/g, "&quot;")}" onclick="event.stopPropagation(); window.__sayWord && window.__sayWord('${w.word.replace(/'/g, "\\'")}')" style="border:1.5px dashed #f59e0b; background:rgba(245,158,11,0.1); color:#b45309; cursor:pointer;" title="當日曾答對，但後續作答時答錯 (點擊聆聽發音)">${w.word} <small style="font-size:10px; font-weight:700;">(曾對後錯⚠️)</small></span>`;
      } else if (w.correct > 0) {
        return `<span class="word-pill-tag correct" data-word="${w.word.replace(/"/g, "&quot;")}" onclick="event.stopPropagation(); window.__sayWord && window.__sayWord('${w.word.replace(/'/g, "\\'")}')" style="border:1.5px dashed var(--green, #10B981); cursor:pointer;" title="當日曾答錯，已訂正答對 (點擊聆聽發音)">${w.word} <small style="font-size:10px; opacity:0.85;">(已訂正)</small></span>`;
      } else {
        return `<span class="word-pill-tag wrong" data-word="${w.word.replace(/"/g, "&quot;")}" onclick="event.stopPropagation(); window.__sayWord && window.__sayWord('${w.word.replace(/'/g, "\\'")}')" style="cursor:pointer;" title="點擊聆聽發音">${w.word}</span>`;
      }
    }).join("");
  } else {
    wrongContentHtml = `<span class="perfect-score-msg">🎉 太棒了！當日自由練習全數答對，無任何答錯單字！</span>`;
  }

  return `
    <div>
      <div class="task-history-header">
        <div>
          <span class="task-card-title">🎮 自由練習成果</span>
          <span style="margin-left:8px; font-size:11.5px; font-weight:700; color:#0284c7; background:rgba(2,132,199,0.12); padding:2px 8px; border-radius:999px;">自主訓練</span>
        </div>
      </div>

      <div class="task-score-grid">
        <div class="task-score-item">
          <div class="task-score-label">🎯 答對單字數 / 施測單字數</div>
          <div class="task-score-val" style="color:#0284c7;">${correctWords}/${totalWords} 字</div>
        </div>
        <div class="task-score-item">
          <div class="task-score-label">📊 正確率</div>
          <div class="task-score-val" style="color:${wordRate >= 80 ? '#16a34a' : '#ea580c'};">${wordRate}%</div>
        </div>
      </div>

      <!-- 將答對的字與答錯的字分成兩個區域（純顯示當日練習狀況，非累積狀況） -->
      <div class="word-split-grid">
        <!-- 答對的單字區 -->
        <div class="word-split-box correct-box">
          <div class="word-split-title correct-title">
            <span>✅ 答對的單字</span>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:5px;">
            ${correctContentHtml}
          </div>
        </div>

        <!-- 答錯的單字區 -->
        <div class="word-split-box wrong-box">
          <div class="word-split-title wrong-title">
            <span>❌ 答錯的單字</span>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:5px;">
            ${wrongContentHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}

function resolveDailyPracticeRecord(dateStr, d, historyList) {
  if (!dateStr) return null;
  const normYMD = normalizeDateStr(dateStr);
  const parts = normYMD.split("-");
  const unpadYMD = (parts.length === 3) ? `${parts[0]}-${parseInt(parts[1], 10)}-${parseInt(parts[2], 10)}` : normYMD;
  const slashYMD = normYMD.replace(/-/g, "/");

  const today = new Date();
  const todayDash = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  const isToday = (normYMD === todayDash || dateStr === todayDash);

  // 1. 從 d.dailyPractice 尋找
  const dpMap = (d && d.dailyPractice) || {};
  let rec = dpMap[normYMD] || dpMap[unpadYMD] || dpMap[slashYMD] || dpMap[dateStr] || null;
  if (rec && (rec.attempts > 0 || (rec.words && Object.keys(rec.words).length > 0))) {
    let att = 0;
    let cor = 0;
    if (rec.words && Object.keys(rec.words).length > 0) {
      const wList = Object.values(rec.words).filter(Boolean);
      const isWordCurrentlyWrong = (w) => (w.lastResult === 'wrong') || (w.wrong > 0 && (!w.correct || w.correct === 0));
      const isWordCurrentlyCorrect = (w) => !isWordCurrentlyWrong(w) && (w.lastResult === 'correct' || (w.correct > 0 && !w.wrong) || w.passed);
      att = wList.length;
      cor = wList.filter(isWordCurrentlyCorrect).length;
    } else {
      att = rec.attempts || 0;
      cor = rec.correct || 0;
    }
    return {
      date: normYMD,
      attempts: att,
      correct: cor,
      wrong: (rec.wrong !== undefined) ? rec.wrong : Math.max(0, att - cor),
      words: rec.words || {}
    };
  }

  // 2. 從 d.rawHistory 尋找 (早期記錄於 DB.history)
  const hMap = (d && d.rawHistory) || {};
  const h = hMap[normYMD] || hMap[unpadYMD] || hMap[slashYMD] || hMap[dateStr] || null;
  if (h && h.a > 0) {
    return {
      date: normYMD,
      attempts: h.a,
      correct: h.c,
      wrong: (h.w !== undefined) ? h.w : Math.max(0, h.a - h.c),
      words: (rec && rec.words) || {}
    };
  }

  // 3. 從 student_task_history 尋找標記為「自主練習」的紀錄（絕不誤抓教師指派測驗分數）
  try {
    const rawHist = localStorage.getItem("student_task_history");
    if (rawHist) {
      const parsedHist = JSON.parse(rawHist);
      if (Array.isArray(parsedHist)) {
        const matchedFreeRow = parsedHist.find(item => {
          if (!item || !item.date) return false;
          if (item.taskName && item.taskName !== "自主練習") return false;
          return normalizeDateStr(item.date) === normYMD;
        });
        if (matchedFreeRow) {
          let att = parseInt(matchedFreeRow.attempts) || 0;
          let corr = parseInt(matchedFreeRow.correct) || 0;
          if (att > 0) {
            return {
              date: normYMD,
              attempts: att,
              correct: corr,
              wrong: Math.max(0, att - corr),
              words: (rec && rec.words) || {}
            };
          }
        }
      }
    }
  } catch (_) {}

  // 4. 若為今天且當日 session 有即時作答
  if (isToday && d && d.session && normalizeDateStr(d.session.date) === todayDash && d.session.answered > 0) {
    return {
      date: normYMD,
      attempts: d.session.answered,
      correct: d.session.correct,
      wrong: Math.max(0, d.session.answered - d.session.correct),
      words: (rec && rec.words) || {}
    };
  }

  return null;
}

// ---------- summary ----------
let _activeRecordSelectedDate = "";
export function summaryHidden() { return el.summary.hidden; }
export function renderSummary(d) {
  const currentUser = localStorage.getItem("current_user") || "";
  const userTagHtml = currentUser ? `<span style="font-size:13px;font-weight:700;color:var(--sky);background:rgba(56,189,248,0.12);padding:2px 8px;border-radius:999px;margin-left:8px;border:1px solid rgba(56,189,248,0.25);">👤 ${currentUser}</span>` : "";
  const lvRows = d.levels
    .map((L) => {
      const totCorr = (L.learn || 0) + (L.prac || 0) + (L.mast || 0);
      return `<tr><td class="st-level-name"><span style="color:${levelColor(L.level)}">●</span> Level ${L.level}「${levelName(L.level)}」</td><td class="st-level-stats"><div class="level-stats-grid"><span class="st-item st-learn"><span class="st-lbl">學習中</span><b class="tnum st-num st-num-learn">${L.learn || 0}</b>字</span><span class="st-sep">/</span><span class="st-item st-prac"><span class="st-lbl">練習中</span><b class="tnum st-num st-num-prac">${L.prac || 0}</b>字</span><span class="st-sep">/</span><span class="st-item st-mast"><span class="st-lbl">精通</span><b class="tnum st-num st-num-mast">${L.mast}</b>字</span><span class="st-sep">/</span><span class="st-item st-total"><span class="st-lbl">共答對</span><b class="tnum st-num st-num-total">${totCorr}</b>字</span></div></td></tr>`;
    })
    .join("");

  const historyList = getCombinedTaskHistory();
  const dailyPracticeMap = d.dailyPractice || {};
  const practiceDates = Array.isArray(d.practiceDates) ? d.practiceDates : [];

  const todayDash = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0") + "-" + String(new Date().getDate()).padStart(2, "0");

  // 建立有紀錄日期選項集合（1:1 比照學習歷程網站，僅納入有實質作答紀錄之日期與今日）
  const dateSet = new Set();
  dateSet.add(todayDash);
  historyList.forEach(item => {
    if (item && item.date && (!item.taskName || item.taskName !== "自主練習")) {
      const nd = normalizeDateStr(item.date);
      if (nd) dateSet.add(nd);
    }
  });
  Object.keys(dailyPracticeMap).forEach(dateStr => {
    const dp = dailyPracticeMap[dateStr];
    if (dp && (dp.attempts > 0 || (dp.words && Object.keys(dp.words).length > 0))) {
      const nd = normalizeDateStr(dateStr);
      if (nd) dateSet.add(nd);
    }
  });
  if (d.rawHistory) {
    Object.keys(d.rawHistory).forEach(dateStr => {
      if (d.rawHistory[dateStr] && d.rawHistory[dateStr].a > 0) {
        const nd = normalizeDateStr(dateStr);
        if (nd) dateSet.add(nd);
      }
    });
  }
  practiceDates.forEach(dateStr => {
    const nd = normalizeDateStr(dateStr);
    if (nd) {
      const recF = resolveDailyPracticeRecord(nd, d, historyList);
      if (recF && recF.attempts > 0) dateSet.add(nd);
    }
  });

  const sortedDates = Array.from(dateSet).filter(Boolean).sort((a, b) => b.localeCompare(a));

  // 若使用者先前已選定特定日期，且面板重新渲染，優先保留使用者的選定日期不跳走
  let defaultSelectedDate = (_activeRecordSelectedDate && normalizeDateStr(_activeRecordSelectedDate)) || "";
  if (!defaultSelectedDate) {
    defaultSelectedDate = todayDash;
    const hasTodayTask = historyList.some(item => normalizeDateStr(item.date) === todayDash);
    const todayFreeRec = resolveDailyPracticeRecord(todayDash, d, historyList);
    const hasTodayFree = !!(todayFreeRec && todayFreeRec.attempts > 0);
    if (!hasTodayTask && !hasTodayFree && sortedDates.length > 0) {
      const latestActive = sortedDates.find(dt => {
        const hTask = historyList.some(item => normalizeDateStr(item.date) === dt);
        const rFree = resolveDailyPracticeRecord(dt, d, historyList);
        return hTask || (rFree && rFree.attempts > 0);
      });
      if (latestActive) defaultSelectedDate = latestActive;
    }
  }

  const buildOptionLabel = (dateStr) => {
    const isToday = (dateStr === todayDash);
    const matchedTask = historyList.find(item => normalizeDateStr(item.date) === dateStr && (!item.taskName || item.taskName !== "自主練習"));
    const recFree = resolveDailyPracticeRecord(dateStr, d, historyList);
    
    let freeTestedWords = 0, freeCorrWords = 0;
    if (recFree && recFree.words && Object.keys(recFree.words).length > 0) {
      freeTestedWords = Object.keys(recFree.words).length;
      freeCorrWords = Object.values(recFree.words).filter(w => w && (w.correct > 0 || w.passed)).length;
    } else if (recFree) {
      freeTestedWords = recFree.attempts || 0;
      freeCorrWords = recFree.correct || 0;
    }

    let desc = "";
    if (matchedTask && freeTestedWords > 0) desc = ` [指派: ${matchedTask.taskName}] [自由: ${freeCorrWords}/${freeTestedWords}字]`;
    else if (matchedTask) desc = ` [指派: ${matchedTask.taskName}]`;
    else if (freeTestedWords > 0) desc = ` [自由練習: ${freeCorrWords}/${freeTestedWords}字]`;
    else desc = " (尚無紀錄)";

    return `${dateStr}${isToday ? " (今日)" : ""}${desc}`;
  };

  // 建立「🎯 快速跳至有紀錄日期」下拉選單
  const quickDateOptionsHtml = sortedDates.map(dateStr => {
    const label = buildOptionLabel(dateStr);
    return `<option value="${dateStr}" ${dateStr === defaultSelectedDate ? "selected" : ""}>${label}</option>`;
  }).join("");

  const initialTaskRecord = historyList.find(item => normalizeDateStr(item.date) === defaultSelectedDate && (!item.taskName || item.taskName !== "自主練習")) || null;
  const initialTaskDetailsHtml = buildTaskDetailsHtml(initialTaskRecord, defaultSelectedDate, d);

  const initialFreeRecord = resolveDailyPracticeRecord(defaultSelectedDate, d, historyList);
  const initialFreeDetailsHtml = buildFreeDetailsHtml(initialFreeRecord, defaultSelectedDate, d);

  // 計算「指定測驗作答紀錄」最近 4 週 (28 天) 黃色熱力圖資料與連續/最佳/累計天數
  const getTaskDayStat = (dateKey) => {
    const norm = normalizeDateStr(dateKey);
    const tRec = historyList.find(item => item && item.date && normalizeDateStr(item.date) === norm && (!item.taskName || item.taskName !== "自主練習")) || null;
    if (!tRec) return { a: 0, c: 0, rate: 0 };
    let tAtt = parseInt(tRec.attempts) || 0;
    let tCor = parseInt(tRec.correct) || 0;
    if (!tAtt && tRec.score && String(tRec.score).includes("/")) {
      const sp = String(tRec.score).split("/");
      tCor = parseInt(sp[0]) || 0;
      tAtt = parseInt(sp[1]) || 0;
    }
    let tRate = tAtt > 0 ? Math.round((tCor / tAtt) * 100) : (parseInt(tRec.rate) || 0);
    if (tAtt === 0 && (String(tRec.status || "").includes("已完成") || (tRec.score && tRec.score !== "—" && tRec.score !== "尚未開始"))) {
      const { rawWords, wrongList, correctList } = resolveTaskWords(tRec, norm, d);
      tAtt = (correctList.length + wrongList.length) || rawWords.length || 10;
      tCor = correctList.length;
      if (tRate === 0 && tAtt > 0) tRate = Math.round((tCor / tAtt) * 100);
    }
    return { a: tAtt, c: tCor, rate: tRate };
  };

  const nowDt = new Date();
  const taskHeatDays = [];
  for (let i = 27; i >= 0; i--) {
    const dt = new Date(nowDt);
    dt.setDate(dt.getDate() - i);
    const kDash = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
    const { a, c, rate } = getTaskDayStat(kDash);
    const level = a === 0 ? 0 : a < 10 ? 1 : a < 20 ? 2 : 3;
    taskHeatDays.push({ key: kDash, a, c, rate, level });
  }

  const activeTaskDateSet = new Set();
  historyList.forEach(item => {
    if (!item || !item.date) return;
    if (item.taskName && item.taskName !== "自主練習") {
      const norm = normalizeDateStr(item.date);
      if (norm && getTaskDayStat(norm).a > 0) activeTaskDateSet.add(norm);
    } else if (!item.taskName) {
      const norm = normalizeDateStr(item.date);
      if (norm && getTaskDayStat(norm).a > 0) activeTaskDateSet.add(norm);
    }
  });
  const taskTotal = activeTaskDateSet.size;
  let taskStreak = 0;
  const hasTaskDayOff = (off) => {
    const dt = new Date(nowDt);
    dt.setDate(dt.getDate() - off);
    const kDash = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
    return activeTaskDateSet.has(kDash);
  };
  const taskStartOff = hasTaskDayOff(0) ? 0 : hasTaskDayOff(1) ? 1 : null;
  if (taskStartOff !== null) {
    let k = taskStartOff;
    while (hasTaskDayOff(k)) { taskStreak++; k++; }
  }
  const toDayIdx = (ds) => {
    const [y, m, day] = String(ds || "").split("-").map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(day)) return null;
    return Math.round(new Date(y, m - 1, day).getTime() / 86400000);
  };
  const taskDayIdxs = Array.from(activeTaskDateSet).map(toDayIdx).filter(x => x !== null && !isNaN(x)).sort((x, y) => x - y);
  let taskBest = 0, curTaskRun = 0, prevTaskDayIdx = null;
  for (const idxVal of taskDayIdxs) {
    curTaskRun = (prevTaskDayIdx !== null && idxVal === prevTaskDayIdx + 1) ? curTaskRun + 1 : 1;
    taskBest = Math.max(taskBest, curTaskRun);
    prevTaskDayIdx = idxVal;
  }
  taskBest = Math.max(taskBest, taskStreak);

  const userTagArea = document.getElementById("userTagArea") || document.getElementById("stUserTag");
  if (userTagArea) {
    userTagArea.innerHTML = "";
  }

  el.summary.innerHTML = `
    <div class="bigrate" style="margin-top:2px;">
      <b class="tnum">${d.passRate}%</b>
      <span>受測單字掌握率<br><small>答對 ${d.distinctCorrect} 字 / 受測 ${d.testedVocab || d.attempts} 字</small></span>
      <span style="margin-left:auto;text-align:right">
        <b class="tnum" style="font-size:30px;color:var(--violet)">${d.distinctCorrect}</b><br>
        <small>共答對單字 ／ 全書 ${d.total} 字</small></span>
    </div>
    <div class="subh">各關卡進度</div>
    <table class="sumtable">${lvRows}</table>
    <div class="subh">🎮 4 大練習模式答對單字數</div>
    <div class="mode-stat-grid">
      <div class="mode-stat-card">
        <div class="mode-stat-title">🎧 聽與拼</div>
        <div class="mode-stat-num">${(d.modeStats?.listen?.c || 0)} 字</div>
        <div class="mode-stat-sub">受測 ${(d.modeStats?.listen?.a || 0)} 字 (${d.modeStats?.listen?.a ? Math.round((d.modeStats.listen.c / d.modeStats.listen.a)*100) : 0}%)</div>
      </div>
      <div class="mode-stat-card">
        <div class="mode-stat-title">✅ 選拼法</div>
        <div class="mode-stat-num">${(d.modeStats?.pick?.c || 0)} 字</div>
        <div class="mode-stat-sub">受測 ${(d.modeStats?.pick?.a || 0)} 字 (${d.modeStats?.pick?.a ? Math.round((d.modeStats.pick.c / d.modeStats.pick.a)*100) : 0}%)</div>
      </div>
      <div class="mode-stat-card">
        <div class="mode-stat-title">🧩 重組</div>
        <div class="mode-stat-num">${(d.modeStats?.scramble?.c || 0)} 字</div>
        <div class="mode-stat-sub">受測 ${(d.modeStats?.scramble?.a || 0)} 字 (${d.modeStats?.scramble?.a ? Math.round((d.modeStats.scramble.c / d.modeStats.scramble.a)*100) : 0}%)</div>
      </div>
      <div class="mode-stat-card">
        <div class="mode-stat-title">🖍️ 填陷阱</div>
        <div class="mode-stat-num">${(d.modeStats?.trap?.c || 0)} 字</div>
        <div class="mode-stat-sub">受測 ${(d.modeStats?.trap?.a || 0)} 字 (${d.modeStats?.trap?.a ? Math.round((d.modeStats.trap.c / d.modeStats.trap.a)*100) : 0}%)</div>
      </div>
    </div>
    <div class="formula-note-box" style="margin-top:-4px; margin-bottom:14px; font-size:12px;">
      💡 <b>計算說明</b>：各模式獨立統計該題型測過的單字；同一個單字在不同模式練習並答對時會各自計入，故四項總和會大於上方整體的「共答對單字數」。
    </div>

    <!-- 📅 查詢指定日期（大區塊標題，同等層級） -->
    <div class="subh">📅 查詢指定日期</div>
    <div class="date-navigator-card">
      <!-- 左欄：快速跳轉（歷程紀錄選單） -->
      <div class="date-nav-col date-nav-col-quick">
        <div class="date-nav-col-header">
          <span class="date-nav-icon">🎯</span>
          <span class="date-nav-label">快速跳至有紀錄日期</span>
        </div>
        <div class="date-nav-control-wrap">
          <select id="record-quick-dates" class="task-date-selector" title="選擇有作答紀錄的日期">
            ${quickDateOptionsHtml}
          </select>
        </div>
      </div>

      <!-- 中間垂直分隔線 -->
      <div class="date-nav-divider"></div>

      <!-- 右欄：日曆選擇與前後切換 -->
      <div class="date-nav-col date-nav-col-picker">
        <div class="date-nav-col-header">
          <span class="date-nav-icon">📅</span>
          <span class="date-nav-label">指定日期與步進切換</span>
        </div>
        <div class="date-nav-control-wrap date-nav-stepper-wrap">
          <input type="date" id="record-date-picker" class="date-picker-input" value="${defaultSelectedDate}" max="${todayDash}">
          <button type="button" id="btn-date-prev" class="date-nav-btn" title="查看前一天">◀ 前一天</button>
          <button type="button" id="btn-date-today" class="date-nav-btn today-btn" title="切換回今日">📍 今日</button>
          <button type="button" id="btn-date-next" class="date-nav-btn" title="查看後一天">後一天 ▶</button>
        </div>
      </div>
    </div>

    <!-- 子標題 1：指定測驗作答紀錄 -->
    <div class="subh-child">
      <span>📝 指定測驗作答紀錄</span>
    </div>
    <div class="task-history-card">
      <div id="task-record-details">
        ${initialTaskDetailsHtml}
      </div>
      <div class="embedded-heatmap-sec">
        <div class="streakline">
          <span>連續 <b>${taskStreak}</b> 天 · 最佳 <b>${taskBest}</b> 天 · 累計練習 <b>${taskTotal}</b> 天</span>
          <span id="task-heat-day-info" class="heat-day-info"></span>
        </div>
        <div class="heatmap heatmap-yellow" id="task-heatmap-grid">${taskHeatDays.map((x, idx) =>
          `<i class="hc h${x.level}" data-idx="${idx}" data-key="${x.key}" data-a="${x.a || 0}" data-rate="${x.rate || 0}"></i>`).join("")}</div>
      </div>
    </div>

    <!-- 子標題 2：自由練習作答紀錄 -->
    <div class="subh-child" style="margin-top:16px;">
      <span>🎮 自由練習作答紀錄</span>
    </div>
    <div class="task-history-card">
      <div id="free-record-details">
        ${initialFreeDetailsHtml}
      </div>
      <div class="embedded-heatmap-sec">
        <div class="streakline">
          <span>連續 <b>${d.history.streak}</b> 天 · 最佳 <b>${d.history.best}</b> 天 · 累計練習 <b>${d.history.total}</b> 天</span>
          <span id="heat-day-info" class="heat-day-info"></span>
        </div>
        <div class="heatmap" id="heatmap-grid">${d.history.days.map((x, idx) =>
          `<i class="hc h${x.level}" data-idx="${idx}" data-key="${x.key}" data-a="${x.a || 0}" data-rate="${x.rate || 0}"></i>`).join("")}</div>
        <div class="heat-legend"><b>連續</b>：從今天往回算，一天都沒中斷、天天有練習的天數。<br><b>最佳</b>：你曾經創下「最長連續天天練習」的紀錄。<br><b>累計</b>：從開始到現在，總共有練習過的天數（中間有休息也算）。<br><b>熱力圖</b>：方格顏色愈深，代表當天練習愈多。</div>
      </div>
    </div>`;

  // 綁定點擊「答對的單字 / 答錯的單字」標籤事件委派，確保 100% 發音
  el.summary.onclick = (e) => {
    const pill = e.target && e.target.closest ? e.target.closest(".word-pill-tag") : null;
    if (pill) {
      e.stopPropagation();
      const w = pill.getAttribute("data-word") || pill.textContent || "";
      if (w) sayWord(w);
    }
  };

  const getHeatBadgeTierClass = (att, rate) => {
    if (!att || att <= 0) return "heat-day-info tier-gray";
    if (rate >= 100) return "heat-day-info tier-red";
    if (rate >= 80) return "heat-day-info tier-yellow";
    if (rate >= 60) return "heat-day-info tier-green";
    return "heat-day-info tier-white";
  };

  // 1. 綁定「指定測驗作答紀錄」黃色熱力圖與右側小方塊（配合黃色熱力圖顏色，無紀錄顯示灰色）
  const taskHeatDayInfoEl = $("#task-heat-day-info");
  const taskHeatGridEl = $("#task-heatmap-grid");
  let pinnedTaskIdx = taskHeatDays.length > 0 ? taskHeatDays.length - 1 : 0;
  for (let i = taskHeatDays.length - 1; i >= 0; i--) {
    if (taskHeatDays[i] && taskHeatDays[i].key === defaultSelectedDate) {
      pinnedTaskIdx = i;
      break;
    }
  }

  const renderTaskHeatBadgeContent = (dateKey, att, rate, activeCellIdx) => {
    if (!taskHeatDayInfoEl) return;
    taskHeatDayInfoEl.className = (!att || att <= 0) ? "heat-day-info tier-gray" : "heat-day-info tier-yellow";
    if (att > 0) {
      taskHeatDayInfoEl.innerHTML = `<b>${dateKey}</b> ｜ 正確率 <b>${rate}%</b>`;
    } else {
      taskHeatDayInfoEl.innerHTML = `<b>${dateKey}</b> ｜ 無作答紀錄`;
    }
    if (taskHeatGridEl) {
      taskHeatGridEl.querySelectorAll(".hc").forEach((cell, cIdx) => {
        cell.classList.toggle("hc-active", cIdx === activeCellIdx);
      });
    }
  };

  const updateTaskHeatDayBadge = (idx) => {
    const item = taskHeatDays[idx];
    if (!item) return;
    renderTaskHeatBadgeContent(item.key, item.a || 0, item.rate || 0, idx);
  };

  const updateTaskHeatDayBadgeByDate = (dateStr) => {
    const normDate = normalizeDateStr(dateStr);
    if (!normDate) return;
    const foundIdx = taskHeatDays.findIndex(x => x && x.key === normDate);
    if (foundIdx !== -1) {
      pinnedTaskIdx = foundIdx;
      updateTaskHeatDayBadge(foundIdx);
      return;
    }
    const { a: att, rate } = getTaskDayStat(normDate);
    renderTaskHeatBadgeContent(normDate, att, rate, -1);
  };

  if (taskHeatDayInfoEl && taskHeatDays.length > 0) {
    updateTaskHeatDayBadge(pinnedTaskIdx);
    if (taskHeatGridEl) {
      taskHeatGridEl.querySelectorAll(".hc").forEach((cell) => {
        const idx = parseInt(cell.getAttribute("data-idx"), 10);
        cell.addEventListener("mouseenter", () => {
          if (!isNaN(idx)) {
            // 僅預覽該日資料，絕不覆寫選定的 pinnedTaskIdx
            updateTaskHeatDayBadge(idx);
          }
        });
        cell.addEventListener("click", () => {
          if (!isNaN(idx)) {
            pinnedTaskIdx = idx;
            updateTaskHeatDayBadge(idx);
            if (taskHeatDays[idx] && taskHeatDays[idx].key) {
              switchRecordDate(taskHeatDays[idx].key);
            }
          }
        });
      });
      taskHeatGridEl.addEventListener("mouseleave", () => {
        // 滑鼠離開時，穩定還原回當前選定的日期
        updateTaskHeatDayBadgeByDate(currentSelectedDate);
      });
    }
  }

  // 2. 綁定「自由練習作答紀錄」綠色熱力圖與右側小方塊（配合綠色熱力圖顏色，無紀錄顯示灰色）
  const heatDayInfoEl = $("#heat-day-info");
  const heatGridEl = $("#heatmap-grid");
  const heatDays = (d.history && Array.isArray(d.history.days)) ? d.history.days : [];
  let pinnedIdx = heatDays.length > 0 ? heatDays.length - 1 : 0;
  for (let i = heatDays.length - 1; i >= 0; i--) {
    if (heatDays[i] && heatDays[i].key === defaultSelectedDate) {
      pinnedIdx = i;
      break;
    }
  }

  const renderHeatBadgeContent = (dateKey, att, rate, activeCellIdx) => {
    if (!heatDayInfoEl) return;
    heatDayInfoEl.className = (!att || att <= 0) ? "heat-day-info tier-gray" : "heat-day-info tier-green";
    if (att > 0) {
      heatDayInfoEl.innerHTML = `<b>${dateKey}</b> ｜ 正確率 <b>${rate}%</b>`;
    } else {
      heatDayInfoEl.innerHTML = `<b>${dateKey}</b> ｜ 無作答紀錄`;
    }
    if (heatGridEl) {
      heatGridEl.querySelectorAll(".hc").forEach((cell, cIdx) => {
        cell.classList.toggle("hc-active", cIdx === activeCellIdx);
      });
    }
  };

  const updateHeatDayBadge = (idx) => {
    const item = heatDays[idx];
    if (!item) return;
    renderHeatBadgeContent(item.key, item.a || 0, item.rate || 0, idx);
  };

  const updateHeatDayBadgeByDate = (dateStr) => {
    const normDate = normalizeDateStr(dateStr);
    if (!normDate) return;
    const foundIdx = heatDays.findIndex(x => x && x.key === normDate);
    if (foundIdx !== -1) {
      pinnedIdx = foundIdx;
      updateHeatDayBadge(foundIdx);
      return;
    }
    // 若指定日期不在最近 28 天內，仍計算該日自由練習作答狀況並固定顯示於右側框框
    const fRec = resolveDailyPracticeRecord(normDate, d, historyList);
    const att = fRec ? (fRec.attempts || 0) : 0;
    const cor = fRec ? (fRec.correct || 0) : 0;
    const rate = att > 0 ? Math.round((cor / att) * 100) : 0;
    renderHeatBadgeContent(normDate, att, rate, -1);
  };

  if (heatDayInfoEl && heatDays.length > 0) {
    updateHeatDayBadge(pinnedIdx);

    if (heatGridEl) {
      heatGridEl.querySelectorAll(".hc").forEach((cell) => {
        const idx = parseInt(cell.getAttribute("data-idx"), 10);
        cell.addEventListener("mouseenter", () => {
          if (!isNaN(idx)) {
            // 僅預覽該日資料，絕不覆寫選定的 pinnedIdx
            updateHeatDayBadge(idx);
          }
        });
        cell.addEventListener("click", () => {
          if (!isNaN(idx)) {
            pinnedIdx = idx;
            updateHeatDayBadge(idx);
            if (heatDays[idx] && heatDays[idx].key) {
              switchRecordDate(heatDays[idx].key);
            }
          }
        });
      });
      heatGridEl.addEventListener("mouseleave", () => {
        // 滑鼠離開時，穩定還原回當前選定的日期
        updateHeatDayBadgeByDate(currentSelectedDate);
      });
    }
  }

  let currentSelectedDate = defaultSelectedDate;
  _activeRecordSelectedDate = defaultSelectedDate;

  const switchRecordDate = (newDate) => {
    if (!newDate) return;
    const targetDate = normalizeDateStr(newDate);
    if (!targetDate) return;
    currentSelectedDate = targetDate;
    _activeRecordSelectedDate = targetDate;

    // 同步更新兩個熱力圖右側固定框框
    updateTaskHeatDayBadgeByDate(targetDate);
    updateHeatDayBadgeByDate(targetDate);

    // 更新日期輸入框
    const datePicker = $("#record-date-picker");
    if (datePicker && datePicker.value !== targetDate) {
      datePicker.value = targetDate;
    }

    // 更新快速跳轉選單（若切換至未在清單內的日期，動態補入選項，確保選單不空白且能隨時切回有紀錄日期）
    const quickSelect = $("#record-quick-dates");
    if (quickSelect) {
      let hasOpt = Array.from(quickSelect.options).some(opt => opt.value === targetDate);
      if (!hasOpt) {
        const newOpt = document.createElement("option");
        newOpt.value = targetDate;
        newOpt.textContent = buildOptionLabel(targetDate);
        quickSelect.appendChild(newOpt);
      }
      if (quickSelect.value !== targetDate) {
        quickSelect.value = targetDate;
      }
    }

    // 更新指定測驗作答紀錄
    const targetTaskRecord = historyList.find(item => normalizeDateStr(item.date) === targetDate && (!item.taskName || item.taskName !== "自主練習")) || null;
    const taskDetailsContainer = $("#task-record-details");
    if (taskDetailsContainer) {
      taskDetailsContainer.innerHTML = buildTaskDetailsHtml(targetTaskRecord, targetDate, d);
    }

    // 更新自由練習作答紀錄
    const targetFreeRecord = resolveDailyPracticeRecord(targetDate, d, historyList);
    const freeDetailsContainer = $("#free-record-details");
    if (freeDetailsContainer) {
      freeDetailsContainer.innerHTML = buildFreeDetailsHtml(targetFreeRecord, targetDate, d);
    }
  };

  // 綁定日期選擇器
  const datePicker = $("#record-date-picker");
  if (datePicker) {
    datePicker.onchange = (e) => switchRecordDate(e.target.value);
  }

  // 綁定今日按鈕
  const btnToday = $("#btn-date-today");
  if (btnToday) {
    btnToday.onclick = () => switchRecordDate(todayDash);
  }

  // 綁定前一天按鈕
  const btnPrev = $("#btn-date-prev");
  if (btnPrev) {
    btnPrev.onclick = () => {
      const cur = new Date(currentSelectedDate.replace(/-/g, "/"));
      cur.setDate(cur.getDate() - 1);
      const prevStr = cur.getFullYear() + "-" + String(cur.getMonth() + 1).padStart(2, "0") + "-" + String(cur.getDate()).padStart(2, "0");
      switchRecordDate(prevStr);
    };
  }

  // 綁定後一天按鈕
  const btnNext = $("#btn-date-next");
  if (btnNext) {
    btnNext.onclick = () => {
      const cur = new Date(currentSelectedDate.replace(/-/g, "/"));
      cur.setDate(cur.getDate() + 1);
      const nextStr = cur.getFullYear() + "-" + String(cur.getMonth() + 1).padStart(2, "0") + "-" + String(cur.getDate()).padStart(2, "0");
      switchRecordDate(nextStr);
    };
  }

  // 綁定快速跳轉下拉選單
  const quickSelect = $("#record-quick-dates");
  if (quickSelect) {
    quickSelect.onchange = (e) => switchRecordDate(e.target.value);
    quickSelect.onclick = (e) => {
      // 若使用者再次點選當前項目，也確保同步顯示
      if (quickSelect.value && quickSelect.value !== currentSelectedDate) {
        switchRecordDate(quickSelect.value);
      }
    };
  }

  const sumCloseEl = document.getElementById("sumClose");
  if (sumCloseEl) sumCloseEl.onclick = () => { toggleSummary(d); };
  initExportRecordsCard(() => d);
}
export function toggleSummary(data) {
  const sumBtn = document.getElementById("sumBtn");
  const sec = document.getElementById("learning-record-section") || document.getElementById("studentLearningRecordCard");
  if (el.summary.hidden) {
    el.summary.hidden = false;
    if (sec) sec.classList.remove("is-collapsed");
    if (sumBtn) sumBtn.innerHTML = "收合";
    try {
      renderSummary(data);
      if (sec) sec.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      console.error("renderSummary error:", err);
      el.summary.innerHTML = `
        <div style="padding:18px; text-align:center; color:#f87171;">
          <div style="font-size:20px; margin-bottom:6px;">⚠️</div>
          <b>載入紀錄時發生問題：</b> ${err.message}<br>
          <button onclick="if(window.toggleSummary)window.toggleSummary();else document.getElementById('summary').hidden=true" style="margin-top:10px; padding:6px 14px; background:#334155; color:#fff; border:none; border-radius:6px; cursor:pointer;">關閉</button>
        </div>
      `;
    }
  } else {
    el.summary.hidden = true;
    if (sec) sec.classList.add("is-collapsed");
    if (sumBtn) sumBtn.innerHTML = "展開";
  }
}

// =====================================================================
// 📥 底部使用紀錄匯出下載模組 (支援指定日期或指定範圍，PDF / Excel 雙格式輸出)
// =====================================================================
let _latestSummaryGetter = null;

function _formatYMDLocal(dt) {
  return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
}

function _extractFreeWordsForDate(record, d) {
  if (!record || !record.attempts) return { correctWords: [], wrongWords: [], totalWords: 0, correctCount: 0, rate: 0 };
  const attempts = record.attempts || 0;
  const correct = record.correct || 0;
  const wrongCount = (record.wrong !== undefined) ? record.wrong : Math.max(0, attempts - correct);
  const wordsMap = record.words || {};
  let correctList = [];
  let wrongList = [];

  Object.keys(wordsMap).forEach(k => {
    const info = wordsMap[k];
    const rawW = (typeof info === "object" && info && info.word) ? info.word : k;
    const wName = resolveWordStr(rawW, d).toLowerCase();
    if (!wName || /^w\d+$/i.test(wName)) return;
    const hasWrong = (info && info.wrong > 0);
    const hasCorrect = (info && info.correct > 0);
    if (hasWrong) wrongList.push({ word: wName, correct: info.correct || 0 });
    else if (hasCorrect) correctList.push({ word: wName });
    else correctList.push({ word: wName });
  });

  if (correctList.length === 0 && wrongList.length === 0 && attempts > 0) {
    const allWords = ((d && d.allPracticedWords) || []).map(w => ({
      ...w,
      word: resolveWordStr(w.word || w, d).toLowerCase()
    })).filter(w => w.word && !/^w\d+$/i.test(w.word));

    if (wrongCount > 0 && allWords.length > 0) {
      const wrongCands = allWords.filter(w => (w.wrong > 0 || w.ew));
      wrongCands.sort((a, b) => (b.wrong || 0) - (a.wrong || 0));
      wrongCands.slice(0, wrongCount).forEach(w => wrongList.push({ word: w.word, correct: w.correct || 0 }));
    }
    if (correct > 0 && allWords.length > 0) {
      const correctCands = allWords.filter(w => w.correct > 0 && !wrongList.some(wl => wl.word === w.word));
      correctCands.sort((a, b) => (b.correct || 0) - (a.correct || 0));
      correctCands.slice(0, correct).forEach(w => correctList.push({ word: w.word }));
    }
  }

  correctList.sort((a, b) => a.word.localeCompare(b.word));
  wrongList.sort((a, b) => a.word.localeCompare(b.word));
  const totalWords = (correctList.length + wrongList.length) > 0 ? (correctList.length + wrongList.length) : attempts;
  const correctCount = (correctList.length + wrongList.length) > 0 ? correctList.length : correct;
  const rate = totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0;

  return {
    correctWords: correctList.map(x => x.word),
    wrongWords: wrongList.map(x => x.correct > 0 ? `${x.word}(已訂正)` : x.word),
    totalWords,
    correctCount,
    rate
  };
}

function _buildExportPayload(d, mode, startDate, endDate) {
  const currentUser = localStorage.getItem("current_user") || "學員";
  const historyList = getCombinedTaskHistory();
  const dailyPracticeMap = (d && d.dailyPractice) || {};
  const practiceDates = Array.isArray(d && d.practiceDates) ? d.practiceDates : [];
  const todayDash = _formatYMDLocal(new Date());

  // 收集所有有紀錄日期
  const activeDateSet = new Set();
  historyList.forEach(item => {
    if (item && item.date && (!item.taskName || item.taskName !== "自主練習")) {
      const nd = normalizeDateStr(item.date);
      if (nd) activeDateSet.add(nd);
    }
  });
  Object.keys(dailyPracticeMap).forEach(dateStr => {
    const dp = dailyPracticeMap[dateStr];
    if (dp && (dp.attempts > 0 || (dp.words && Object.keys(dp.words).length > 0))) {
      const nd = normalizeDateStr(dateStr);
      if (nd) activeDateSet.add(nd);
    }
  });
  if (d && d.rawHistory) {
    Object.keys(d.rawHistory).forEach(dateStr => {
      if (d.rawHistory[dateStr] && d.rawHistory[dateStr].a > 0) {
        const nd = normalizeDateStr(dateStr);
        if (nd) activeDateSet.add(nd);
      }
    });
  }
  practiceDates.forEach(dateStr => {
    const nd = normalizeDateStr(dateStr);
    if (nd) {
      const recF = resolveDailyPracticeRecord(nd, d, historyList);
      if (recF && recF.attempts > 0) activeDateSet.add(nd);
    }
  });

  let sDate = normalizeDateStr(startDate) || todayDash;
  let eDate = normalizeDateStr(endDate) || sDate;
  if (sDate > eDate) { const tmp = sDate; sDate = eDate; eDate = tmp; }

  let targetDates = [];
  if (mode === "single" || sDate === eDate) {
    targetDates = [sDate];
  } else {
    const sTime = new Date(sDate.replace(/-/g, "/")).getTime();
    const eTime = new Date(eDate.replace(/-/g, "/")).getTime();
    const daySpan = Math.round((eTime - sTime) / 86400000) + 1;
    if (daySpan <= 14) {
      for (let i = 0; i < daySpan; i++) {
        const cur = new Date(sTime + i * 86400000);
        targetDates.push(_formatYMDLocal(cur));
      }
      targetDates.sort((a, b) => b.localeCompare(a));
    } else {
      targetDates = Array.from(activeDateSet).filter(dt => dt >= sDate && dt <= eDate).sort((a, b) => b.localeCompare(a));
      if (targetDates.length === 0) targetDates = [eDate];
    }
  }

  let periodAttempts = 0;
  let periodCorrect = 0;
  let periodActiveDays = 0;
  let periodTaskDone = 0;
  let periodFreeDays = 0;

  const dailyRecords = targetDates.map(dt => {
    const tRec = historyList.find(item => normalizeDateStr(item.date) === dt && (!item.taskName || item.taskName !== "自主練習")) || null;
    let hasTask = false, taskName = "無指派測驗", taskStatus = "無紀錄", taskScore = "—", taskRate = "—";
    let taskCorrectWords = [], taskWrongWords = [];
    let tAtt = 0, tCor = 0;

    if (tRec) {
      hasTask = true;
      taskName = tRec.taskName || "每日指定測驗";
      taskStatus = String(tRec.status || "已完成").replace(/^[🟢●⏳\s]+/, "");
      taskScore = tRec.score || "—";
      taskRate = formatRatePercentage(tRec.rate, tRec.score);
      const resolved = resolveTaskWords(tRec, dt, d);
      taskCorrectWords = resolved.correctList || [];
      taskWrongWords = resolved.wrongList || [];
      tAtt = parseInt(tRec.attempts) || 0;
      tCor = parseInt(tRec.correct) || 0;
      if (!tAtt && taskScore.includes("/")) {
        const sp = taskScore.split("/");
        tCor = parseInt(sp[0]) || 0;
        tAtt = parseInt(sp[1]) || 0;
      }
      if (!tAtt && (taskCorrectWords.length + taskWrongWords.length) > 0) {
        tCor = taskCorrectWords.length;
        tAtt = taskCorrectWords.length + taskWrongWords.length;
      }
      if (taskStatus.includes("完成") || tAtt > 0) periodTaskDone++;
    }

    const fRec = resolveDailyPracticeRecord(dt, d, historyList);
    const fInfo = _extractFreeWordsForDate(fRec, d);
    const hasFree = fInfo.totalWords > 0;
    if (hasFree) periodFreeDays++;

    const freeAtt = fInfo.totalWords;
    const freeCor = fInfo.correctCount;
    const dayAtt = tAtt + freeAtt;
    const dayCor = tCor + freeCor;
    const dayRate = dayAtt > 0 ? Math.round((dayCor / dayAtt) * 100) : 0;

    if (dayAtt > 0 || hasTask) {
      if (dayAtt > 0) periodActiveDays++;
      periodAttempts += dayAtt;
      periodCorrect += dayCor;
    }

    return {
      date: dt,
      totalAttempts: dayAtt,
      totalCorrect: dayCor,
      totalRate: dayRate,
      hasTask,
      taskName,
      taskStatus,
      taskScore,
      taskRate,
      taskCorrectWords,
      taskWrongWords,
      hasFree,
      freeAttempts: fInfo.totalWords,
      freeCorrect: fInfo.correctCount,
      freeWrong: Math.max(0, fInfo.totalWords - fInfo.correctCount),
      freeRate: fInfo.rate,
      freeCorrectWords: fInfo.correctWords,
      freeWrongWords: fInfo.wrongWords
    };
  });

  const now = new Date();
  const exportTime = `${_formatYMDLocal(now)} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const scopeTitle = (mode === "single" || sDate === eDate) ? `指定日期：${sDate}` : `指定範圍：${sDate} 至 ${eDate}`;
  const fileScopeTag = (mode === "single" || sDate === eDate) ? sDate : `${sDate}_至_${eDate}`;

  const learnCount = d ? (d.levels || []).reduce((acc, L) => acc + (L.learn || 0), 0) : 0;
  const pracCount = d ? (d.levels || []).reduce((acc, L) => acc + (L.prac || 0), 0) : 0;
  const mastCount = d ? (d.levels || []).reduce((acc, L) => acc + (L.mast || 0), 0) : 0;

  return {
    studentId: currentUser,
    exportTime,
    mode,
    startDate: sDate,
    endDate: eDate,
    scopeTitle,
    fileScopeTag,
    periodSummary: {
      activeDaysCount: periodActiveDays,
      totalAttempts: periodAttempts,
      totalCorrect: periodCorrect,
      avgRate: periodAttempts > 0 ? Math.round((periodCorrect / periodAttempts) * 100) : 0,
      taskDoneCount: periodTaskDone,
      freeActiveDays: periodFreeDays
    },
    overall: {
      attempts: (d && d.attempts) || 0,
      correct: (d && d.correct) || 0,
      passRate: (d && d.passRate) || 0,
      distinctCorrect: (d && d.distinctCorrect) || 0,
      totalVocab: (d && d.total) || 2055,
      learn: learnCount,
      prac: pracCount,
      mast: mastCount,
      streak: (d && d.history && d.history.streak) || 0,
      best: (d && d.history && d.history.best) || 0,
      totalDays: (d && d.history && d.history.total) || 0,
      levels: (d && d.levels) ? d.levels.map(L => ({
        level: L.level,
        name: levelName(L.level),
        correct: L.correct || 0,
        tested: L.testedCount || 0,
        rate: L.rate || 0,
        learn: L.learn || 0,
        prac: L.prac || 0,
        mast: L.mast || 0,
        total: L.total || 411
      })) : [],
      modeStats: (d && d.modeStats) || {}
    },
    dailyRecords
  };
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (_) {}
  }, 1500);
}

function _ensureScriptLoaded(globalVar, primaryUrl, fallbackUrl) {
  if (typeof window !== "undefined" && window[globalVar]) return Promise.resolve(window[globalVar]);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = primaryUrl;
    s.onload = () => resolve(window[globalVar]);
    s.onerror = () => {
      if (fallbackUrl) {
        const s2 = document.createElement("script");
        s2.src = fallbackUrl;
        s2.onload = () => resolve(window[globalVar]);
        s2.onerror = () => reject(new Error(`無法載入套件 ${globalVar}`));
        document.head.appendChild(s2);
      } else {
        reject(new Error(`無法載入套件 ${globalVar}`));
      }
    };
    document.head.appendChild(s);
  });
}

async function _exportRecordToExcel(payload) {
  const fileName = `拼字小特工_使用紀錄_${payload.studentId}_${payload.fileScopeTag}`;
  try {
    const XLSX = await _ensureScriptLoaded(
      "XLSX",
      "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
    );
    const wb = XLSX.utils.book_new();

    // Sheet 1: 每日使用紀錄明細
    const ws1Data = [
      ["拼字小特工 · 學生使用與作答紀錄明細表"],
      ["學生帳號", payload.studentId, "匯出範圍", payload.scopeTitle, "匯出時間", payload.exportTime],
      ["區間練習天數", `${payload.periodSummary.activeDaysCount} 天`, "區間施測單字數", `${payload.periodSummary.totalAttempts} 字`, "區間答對單字數", `${payload.periodSummary.totalCorrect} 字`, "區間平均正確率", `${payload.periodSummary.avgRate}%`],
      [],
      [
        "日期",
        "當日施測單字數",
        "當日答對單字數",
        "當日正確率(%)",
        "指定測驗名稱",
        "指定測驗狀態",
        "指定測驗得分(字)",
        "指定測驗正確率",
        "指定測驗-答對單字",
        "指定測驗-答錯單字",
        "自由練習-施測單字數",
        "自由練習-答對單字數",
        "自由練習-答錯單字數",
        "自由練習-正確率(%)",
        "自由練習-答對單字",
        "自由練習-答錯單字"
      ]
    ];

    payload.dailyRecords.forEach(r => {
      ws1Data.push([
        r.date,
        r.totalAttempts,
        r.totalCorrect,
        `${r.totalRate}%`,
        r.hasTask ? r.taskName : "無指派測驗",
        r.hasTask ? r.taskStatus : "無紀錄",
        r.hasTask ? `${r.taskScore} 字` : "—",
        r.hasTask ? r.taskRate : "—",
        r.taskCorrectWords.length > 0 ? r.taskCorrectWords.join(", ") : "—",
        r.taskWrongWords.length > 0 ? r.taskWrongWords.join(", ") : (r.hasTask ? "全對無錯題" : "—"),
        r.freeAttempts,
        r.freeCorrect,
        r.freeWrong,
        r.hasFree ? `${r.freeRate}%` : "0%",
        r.freeCorrectWords.length > 0 ? r.freeCorrectWords.join(", ") : "—",
        r.freeWrongWords.length > 0 ? r.freeWrongWords.join(", ") : (r.hasFree ? "全對無錯題" : "—")
      ]);
    });

    ws1Data.push([]);
    ws1Data.push([
      "區間合計 / 平均",
      payload.periodSummary.totalAttempts,
      payload.periodSummary.totalCorrect,
      `${payload.periodSummary.avgRate}%`,
      `完成 ${payload.periodSummary.taskDoneCount} 次測驗`,
      "", "", "", "", "",
      `活躍 ${payload.periodSummary.freeActiveDays} 天`,
      "", "", "", "", ""
    ]);

    const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
    ws1["!cols"] = [
      { wch: 13 }, { wch: 14 }, { wch: 14 }, { wch: 13 },
      { wch: 20 }, { wch: 13 }, { wch: 13 }, { wch: 14 },
      { wch: 36 }, { wch: 36 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 36 }, { wch: 36 }
    ];
    XLSX.utils.book_append_sheet(wb, ws1, "每日使用紀錄明細");

    // Sheet 2: 整體學習進度總覽
    const ov = payload.overall;
    const ms = ov.modeStats || {};
    const mRate = (m) => (m && m.a > 0) ? `${Math.round((m.c / m.a) * 100)}%` : "0%";
    const ws2Data = [
      ["拼字小特工 · 整體學習進度與關卡總覽"],
      ["學生帳號", payload.studentId, "匯出時間", payload.exportTime],
      [],
      ["【一、整體學習進度指標】"],
      ["累積受測單字數", `${ov.testedVocab || ov.attempts} 字`, "累積答對單字數", `${ov.distinctCorrect || ov.correct} 字`, "單字掌握率", `${ov.passRate}%`],
      ["答對過單字(不重複)", `${ov.distinctCorrect} / ${ov.totalVocab} 字`, "連續練習天數", `${ov.streak} 天`, "最佳連續 / 累計天數", `最佳 ${ov.best} 天 / 累計 ${ov.totalDays} 天`],
      ["學習中單字數", `${ov.learn} 字`, "練習中單字數", `${ov.prac} 字`, "已精通單字數 ⭐", `${ov.mast} 字`],
      [],
      ["【二、4 大練習模式答對單字數】"],
      ["練習模式", "受測單字數", "答對單字數", "正確率"],
      ["🎧 聽與拼", `${(ms.listen && ms.listen.a) || 0} 字`, `${(ms.listen && ms.listen.c) || 0} 字`, mRate(ms.listen)],
      ["✅ 選拼法", `${(ms.pick && ms.pick.a) || 0} 字`, `${(ms.pick && ms.pick.c) || 0} 字`, mRate(ms.pick)],
      ["🧩 重組", `${(ms.scramble && ms.scramble.a) || 0} 字`, `${(ms.scramble && ms.scramble.c) || 0} 字`, mRate(ms.scramble)],
      ["🖍️ 填陷阱", `${(ms.trap && ms.trap.a) || 0} 字`, `${(ms.trap && ms.trap.c) || 0} 字`, mRate(ms.trap)],
      [],
      ["【三、各關卡進度 (Level 1 ~ Level 5)】"],
      ["關卡名稱", "答對單字 / 已測單字", "關卡正確率", "學習中(字)", "練習中(字)", "精通⭐(字)", "該關總單字數"]
    ];
    (ov.levels || []).forEach(L => {
      ws2Data.push([
        `Level ${L.level}「${L.name}」`,
        `${L.correct}/${L.tested}`,
        `${L.rate}%`,
        L.learn,
        L.prac,
        L.mast,
        L.total
      ]);
    });
    const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
    ws2["!cols"] = [{ wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws2, "整體學習進度總覽");

    try {
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      triggerBlobDownload(blob, `${fileName}.xlsx`);
    } catch (writeErr) {
      console.warn("XLSX write blob failed, trying XLSX.writeFile:", writeErr);
      XLSX.writeFile(wb, `${fileName}.xlsx`);
    }
  } catch (err) {
    console.warn("XLSX fallback to CSV:", err);
    // 備援 CSV 輸出 (含 UTF-8 BOM，Excel 可直接開啟)
    const rows = [
      ["日期", "當日施測單字數", "當日答對單字數", "當日正確率", "指定測驗名稱", "指定測驗狀態", "指定測驗得分", "指定測驗正確率", "指定測驗答對單字", "指定測驗答錯單字", "自由練習施測單字數", "自由練習答對單字數", "自由練習答錯單字數", "自由練習正確率", "自由練習答對單字", "自由練習答錯單字"]
    ];
    payload.dailyRecords.forEach(r => {
      rows.push([
        r.date, r.totalAttempts, r.totalCorrect, `${r.totalRate}%`,
        r.hasTask ? r.taskName : "無指派測驗", r.hasTask ? r.taskStatus : "無紀錄",
        r.hasTask ? `${r.taskScore} 字` : "—", r.hasTask ? r.taskRate : "—",
        r.taskCorrectWords.join(" "), r.taskWrongWords.join(" "),
        r.freeAttempts, r.freeCorrect, r.freeWrong, `${r.freeRate}%`,
        r.freeCorrectWords.join(" "), r.freeWrongWords.join(" ")
      ]);
    });
    const csvContent = "\uFEFF" + rows.map(row => row.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    triggerBlobDownload(blob, `${fileName}.csv`);
  }
}

async function _exportRecordToPdf(payload) {
  const fileName = `拼字小特工_使用紀錄_${payload.studentId}_${payload.fileScopeTag}.pdf`;
  const ov = payload.overall;
  const ps = payload.periodSummary;
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lvRowsHtml = (ov.levels || []).map(L => `
    <tr>
      <td style="padding:6px 8px; border-bottom:1px solid #E7E9F5; font-weight:700; color:#232A4D;">Level ${L.level}「${esc(L.name)}」</td>
      <td style="padding:6px 8px; border-bottom:1px solid #E7E9F5; text-align:right; font-weight:700; color:#232A4D;">
        學習中 ${L.learn} 字 / 練習中 ${L.prac} 字 / 精通 ${L.mast} 字 / 共答對 ${(L.learn || 0) + (L.prac || 0) + (L.mast || 0)} 字
      </td>
    </tr>
  `).join("");

  const dailyCardsHtml = payload.dailyRecords.map(r => {
    const badgeColor = r.totalAttempts === 0 ? "#64748B" : r.totalRate >= 80 ? "#1E9A66" : r.totalRate >= 60 ? "#B45309" : "#DC2626";
    const badgeBg = r.totalAttempts === 0 ? "#F1F5F9" : r.totalRate >= 80 ? "#ECFDF5" : r.totalRate >= 60 ? "#FEFCE8" : "#FEF2F2";
    const taskCorrPills = r.taskCorrectWords.length > 0
      ? r.taskCorrectWords.map(w => `<span style="display:inline-block;padding:2px 6px;margin:2px;border-radius:4px;background:#E4F7EE;color:#1E9A66;border:1px solid rgba(47,180,124,.35);font-size:11px;font-weight:700;">${esc(w)}</span>`).join("")
      : `<span style="font-size:11px;color:#9AA0BD;">（無答對單字紀錄）</span>`;
    const taskWrongPills = r.taskWrongWords.length > 0
      ? r.taskWrongWords.map(w => `<span style="display:inline-block;padding:2px 6px;margin:2px;border-radius:4px;background:#FFE9E9;color:#D64545;border:1px solid rgba(255,107,107,.4);font-size:11px;font-weight:700;">${esc(w)}</span>`).join("")
      : `<span style="font-size:11px;color:#1E9A66;font-weight:700;">${r.hasTask ? "🎉 全數答對無錯題" : "（無錯題紀錄）"}</span>`;

    const freeCorrPills = r.freeCorrectWords.length > 0
      ? r.freeCorrectWords.map(w => `<span style="display:inline-block;padding:2px 6px;margin:2px;border-radius:4px;background:#E4F7EE;color:#1E9A66;border:1px solid rgba(47,180,124,.35);font-size:11px;font-weight:700;">${esc(w)}</span>`).join("")
      : `<span style="font-size:11px;color:#9AA0BD;">（當日無自由練習答對單字）</span>`;
    const freeWrongPills = r.freeWrongWords.length > 0
      ? r.freeWrongWords.map(w => `<span style="display:inline-block;padding:2px 6px;margin:2px;border-radius:4px;background:#FFE9E9;color:#D64545;border:1px solid rgba(255,107,107,.4);font-size:11px;font-weight:700;">${esc(w)}</span>`).join("")
      : `<span style="font-size:11px;color:#1E9A66;font-weight:700;">${r.hasFree ? "🎉 全數答對無錯題" : "（當日無自由練習錯題）"}</span>`;

    return `
      <div style="border:1.5px solid #E7E9F5; border-radius:14px; padding:12px 14px; margin-bottom:12px; background:#F8F9FD; page-break-inside:avoid;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #E7E9F5; padding-bottom:8px; margin-bottom:10px;">
          <div style="font-size:14px; font-weight:800; color:#232A4D;">📅 日期：${esc(r.date)}</div>
          <div style="padding:3px 10px; border-radius:8px; font-size:12px; font-weight:800; background:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeColor};">
            當日施測 ${r.totalAttempts} 字 · 答對 ${r.totalCorrect} 字 · 正確率 ${r.totalRate}%
          </div>
        </div>

        <!-- 指定測驗 -->
        <div style="margin-bottom:8px; background:#FFFFFF; border:1px solid #E7E9F5; border-radius:10px; padding:9px 11px;">
          <div style="font-size:12.5px; font-weight:800; color:#232A4D; margin-bottom:6px; display:flex; justify-content:space-between;">
            <span>📝 指定測驗：${esc(r.hasTask ? r.taskName : "當日無指派測驗紀錄")}</span>
            <span style="color:#0284C7;">${r.hasTask ? `狀態：${esc(r.taskStatus)} ｜ 得分：${esc(r.taskScore)} 字 (${esc(r.taskRate)})` : "未施測"}</span>
          </div>
          ${r.hasTask ? `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              <div style="background:#F1FBF6; border:1px solid rgba(47,180,124,.3); border-radius:8px; padding:7px 9px;">
                <div style="font-size:11.5px; font-weight:800; color:#065F46; margin-bottom:4px;">✅ 答對的單字</div>
                <div>${taskCorrPills}</div>
              </div>
              <div style="background:#FFF5F5; border:1px solid rgba(255,107,107,.3); border-radius:8px; padding:7px 9px;">
                <div style="font-size:11.5px; font-weight:800; color:#D64545; margin-bottom:4px;">❌ 答錯的單字</div>
                <div>${taskWrongPills}</div>
              </div>
            </div>
          ` : ""}
        </div>

        <!-- 自由練習 -->
        <div style="background:#FFFFFF; border:1px solid #E7E9F5; border-radius:10px; padding:9px 11px;">
          <div style="font-size:12.5px; font-weight:800; color:#232A4D; margin-bottom:6px; display:flex; justify-content:space-between;">
            <span>🎮 自由練習成果</span>
            <span style="color:#0284C7;">${r.hasFree ? `答對 ${r.freeCorrect}/${r.freeAttempts} 字 (${r.freeRate}%)` : "當日無自由練習紀錄"}</span>
          </div>
          ${r.hasFree ? `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              <div style="background:#F1FBF6; border:1px solid rgba(47,180,124,.3); border-radius:8px; padding:7px 9px;">
                <div style="font-size:11.5px; font-weight:800; color:#065F46; margin-bottom:4px;">✅ 答對的單字</div>
                <div>${freeCorrPills}</div>
              </div>
              <div style="background:#FFF5F5; border:1px solid rgba(255,107,107,.3); border-radius:8px; padding:7px 9px;">
                <div style="font-size:11.5px; font-weight:800; color:#D64545; margin-bottom:4px;">❌ 答錯的單字</div>
                <div>${freeWrongPills}</div>
              </div>
            </div>
          ` : ""}
        </div>
      </div>
    `;
  }).join("");

  const reportHtml = `
    <div id="pdf-export-paper" style="width:720px; background:#FFFFFF; color:#232A4D; padding:22px 24px; font-family:ui-rounded,'SF Pro Rounded','PingFang TC','Microsoft JhengHei',sans-serif; line-height:1.5; box-sizing:border-box;">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #6C4CE0; padding-bottom:12px; margin-bottom:14px;">
        <div>
          <div style="font-size:20px; font-weight:900; color:#232A4D;">🎯 拼字小特工 · 學生使用與作答紀錄報表</div>
          <div style="font-size:12.5px; color:#5A6183; font-weight:700; margin-top:3px;">${esc(payload.scopeTitle)}</div>
        </div>
        <div style="text-align:right; font-size:12px; color:#5A6183; font-weight:700;">
          <div>👤 學生帳號：<b style="color:#6C4CE0; font-size:13.5px;">${esc(payload.studentId)}</b></div>
          <div>🕒 匯出時間：${esc(payload.exportTime)}</div>
        </div>
      </div>

      <!-- 區間統計摘要 -->
      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:14px;">
        <div style="background:#F8F9FD; border:1px solid #E7E9F5; border-radius:10px; padding:8px 10px; text-align:center;">
          <div style="font-size:11px; color:#5A6183; font-weight:700;">📅 區間練習天數</div>
          <div style="font-size:18px; font-weight:900; color:#6C4CE0;">${ps.activeDaysCount} 天</div>
        </div>
        <div style="background:#F8F9FD; border:1px solid #E7E9F5; border-radius:10px; padding:8px 10px; text-align:center;">
          <div style="font-size:11px; color:#5A6183; font-weight:700;">✍️ 區間施測單字數</div>
          <div style="font-size:18px; font-weight:900; color:#0284C7;">${ps.totalAttempts} 字</div>
        </div>
        <div style="background:#F8F9FD; border:1px solid #E7E9F5; border-radius:10px; padding:8px 10px; text-align:center;">
          <div style="font-size:11px; color:#5A6183; font-weight:700;">✅ 區間答對單字數</div>
          <div style="font-size:18px; font-weight:900; color:#2FB47C;">${ps.totalCorrect} 字</div>
        </div>
        <div style="background:#F8F9FD; border:1px solid #E7E9F5; border-radius:10px; padding:8px 10px; text-align:center;">
          <div style="font-size:11px; color:#5A6183; font-weight:700;">📊 區間平均正確率</div>
          <div style="font-size:18px; font-weight:900; color:${ps.avgRate >= 80 ? '#1E9A66' : '#E8892B'};">${ps.avgRate}%</div>
        </div>
      </div>

      <!-- 整體關卡進度 -->
      <div style="border:1px solid #E7E9F5; border-radius:12px; padding:10px 14px; margin-bottom:14px; background:#FFFFFF;">
        <div style="font-size:13px; font-weight:800; color:#232A4D; margin-bottom:6px; display:flex; justify-content:space-between;">
          <span>📊 整體學習進度與各關卡統計</span>
          <span style="font-size:11.5px; color:#5A6183;">學習中 ${ov.learn} 字 · 練習中 ${ov.prac} 字 · 精通 ⭐ ${ov.mast} 字（累計練習 ${ov.totalDays} 天）</span>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          ${lvRowsHtml}
        </table>
      </div>

      <!-- 每日使用紀錄明細 -->
      <div style="font-size:13.5px; font-weight:800; color:#232A4D; margin-bottom:8px;">📋 每日使用與作答紀錄明細（共 ${payload.dailyRecords.length} 日）</div>
      ${dailyCardsHtml}
    </div>
  `;

  const overlay = document.createElement("div");
  overlay.id = "pdf-export-temp-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(20,24,38,0.82);display:flex;flex-direction:column;align-items:center;overflow:auto;padding:20px;";
  overlay.innerHTML = `
    <div style="color:#FFFFFF;font-weight:800;font-size:14px;margin-bottom:12px;background:#6C4CE0;padding:8px 18px;border-radius:999px;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
      ⏳ 正在產生 PDF 報表並準備下載，請稍候...
    </div>
    ${reportHtml}
  `;
  document.body.appendChild(overlay);

  try {
    const html2pdfLib = await _ensureScriptLoaded(
      "html2pdf",
      "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js",
      "https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js"
    );
    const paperEl = overlay.querySelector("#pdf-export-paper");
    const opt = {
      margin: [8, 8, 8, 8],
      filename: fileName,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#FFFFFF", scrollY: 0 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] }
    };
    let downloaded = false;
    try {
      const pdfBlob = await html2pdfLib().set(opt).from(paperEl).outputPdf("blob");
      if (pdfBlob && pdfBlob.size > 0) {
        triggerBlobDownload(pdfBlob, fileName);
        downloaded = true;
      }
    } catch (blobErr) {
      console.warn("outputPdf blob failed, falling back to .save():", blobErr);
    }
    if (!downloaded) {
      await html2pdfLib().set(opt).from(paperEl).save();
    }
  } finally {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }
}

export function initExportRecordsCard(getSummaryFn) {
  if (typeof getSummaryFn === "function") _latestSummaryGetter = getSummaryFn;
  const sec = document.getElementById("export-records-section");
  if (!sec) return;

  const todayDash = _formatYMDLocal(new Date());
  const d7 = new Date(); d7.setDate(d7.getDate() - 6);
  const sevenDaysAgo = _formatYMDLocal(d7);
  const d30 = new Date(); d30.setDate(d30.getDate() - 29);
  const thirtyDaysAgo = _formatYMDLocal(d30);

  const btnModeSingle = document.getElementById("btn-export-mode-single");
  const btnModeRange = document.getElementById("btn-export-mode-range");
  const singleWrap = document.getElementById("export-single-wrap");
  const rangeWrap = document.getElementById("export-range-wrap");
  const inputSingle = document.getElementById("export-single-date");
  const inputStart = document.getElementById("export-start-date");
  const inputEnd = document.getElementById("export-end-date");
  const formatSelect = document.getElementById("export-format-select");
  const btnDlPdf = document.getElementById("btn-export-download-pdf");
  const btnDlExcel = document.getElementById("btn-export-download-excel");
  const statusMsg = document.getElementById("export-status-msg");

  if (inputSingle && !inputSingle.value) {
    const recPicker = document.getElementById("record-date-picker");
    inputSingle.value = (recPicker && recPicker.value) ? recPicker.value : todayDash;
    inputSingle.max = todayDash;
  }
  if (inputStart && !inputStart.value) { inputStart.value = sevenDaysAgo; inputStart.max = todayDash; }
  if (inputEnd && !inputEnd.value) { inputEnd.value = todayDash; inputEnd.max = todayDash; }

  if (sec.__exportBound) return;
  sec.__exportBound = true;

  const toggleBtn = document.getElementById("btn-toggle-export-card");
  const navCard = document.getElementById("export-navigator-card") || sec.querySelector(".export-navigator-card");
  if (toggleBtn && navCard) {
    toggleBtn.onclick = (e) => {
      e.preventDefault();
      const isHidden = (navCard.style.display === "none") || sec.classList.contains("is-collapsed");
      if (isHidden) {
        navCard.style.display = "flex";
        sec.classList.remove("is-collapsed");
        toggleBtn.innerHTML = "收合";
        navCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        navCard.style.display = "none";
        sec.classList.add("is-collapsed");
        toggleBtn.innerHTML = "展開";
      }
    };
  }

  let currentMode = "single";
  const setExportMode = (m) => {
    currentMode = (m === "range") ? "range" : "single";
    if (btnModeSingle) btnModeSingle.classList.toggle("active", currentMode === "single");
    if (btnModeRange) btnModeRange.classList.toggle("active", currentMode === "range");
    if (singleWrap) singleWrap.style.display = (currentMode === "single") ? "flex" : "none";
    if (rangeWrap) rangeWrap.style.display = (currentMode === "range") ? "flex" : "none";
  };

  if (btnModeSingle) btnModeSingle.onclick = () => setExportMode("single");
  if (btnModeRange) btnModeRange.onclick = () => setExportMode("range");

  const btnPresetToday = document.getElementById("btn-export-preset-today");
  if (btnPresetToday) {
    btnPresetToday.onclick = () => {
      setExportMode("single");
      if (inputSingle) inputSingle.value = todayDash;
    };
  }
  const btnPreset7d = document.getElementById("btn-export-preset-7d");
  if (btnPreset7d) {
    btnPreset7d.onclick = () => {
      setExportMode("range");
      if (inputStart) inputStart.value = sevenDaysAgo;
      if (inputEnd) inputEnd.value = todayDash;
    };
  }
  const btnPreset30d = document.getElementById("btn-export-preset-30d");
  if (btnPreset30d) {
    btnPreset30d.onclick = () => {
      setExportMode("range");
      if (inputStart) inputStart.value = thirtyDaysAgo;
      if (inputEnd) inputEnd.value = todayDash;
    };
  }
  const btnPresetAll = document.getElementById("btn-export-preset-all");
  if (btnPresetAll) {
    btnPresetAll.onclick = () => {
      setExportMode("range");
      const d = _latestSummaryGetter ? _latestSummaryGetter() : null;
      const hist = getCombinedTaskHistory();
      let earliest = thirtyDaysAgo;
      hist.forEach(item => {
        const nd = item && item.date ? normalizeDateStr(item.date) : "";
        if (nd && nd < earliest) earliest = nd;
      });
      if (d && d.dailyPractice) {
        Object.keys(d.dailyPractice).forEach(k => {
          const nd = normalizeDateStr(k);
          if (nd && nd < earliest) earliest = nd;
        });
      }
      if (d && d.rawHistory) {
        Object.keys(d.rawHistory).forEach(k => {
          const nd = normalizeDateStr(k);
          if (nd && nd < earliest) earliest = nd;
        });
      }
      if (inputStart) inputStart.value = earliest;
      if (inputEnd) inputEnd.value = todayDash;
    };
  }

  const runDownload = async (fmt) => {
    if (formatSelect && fmt) formatSelect.value = fmt;
    const chosenFmt = fmt || (formatSelect ? formatSelect.value : "pdf");
    const d = _latestSummaryGetter ? _latestSummaryGetter() : null;
    const sDate = (currentMode === "single")
      ? (inputSingle && inputSingle.value ? inputSingle.value : todayDash)
      : (inputStart && inputStart.value ? inputStart.value : sevenDaysAgo);
    const eDate = (currentMode === "single")
      ? sDate
      : (inputEnd && inputEnd.value ? inputEnd.value : todayDash);

    const payload = _buildExportPayload(d, currentMode, sDate, eDate);

    if (btnDlPdf) btnDlPdf.disabled = true;
    if (btnDlExcel) btnDlExcel.disabled = true;
    if (statusMsg) {
      statusMsg.innerHTML = `⏳ 正在產生 <b>${chosenFmt === "excel" ? "Excel (.xlsx)" : "PDF (.pdf)"}</b> 作答歷程記錄檔案（${payload.scopeTitle}），請稍候...`;
    }

    try {
      if (chosenFmt === "excel") {
        await _exportRecordToExcel(payload);
      } else {
        await _exportRecordToPdf(payload);
      }
      if (statusMsg) {
        statusMsg.innerHTML = `✅ 已成功下載 <b>${chosenFmt === "excel" ? "Excel (.xlsx)" : "PDF (.pdf)"}</b> 作答歷程記錄（${payload.scopeTitle}）！`;
      }
    } catch (err) {
      console.error("Export error:", err);
      if (statusMsg) {
        statusMsg.innerHTML = `⚠️ 匯出時發生錯誤：${err.message || "請稍後再試"}`;
      }
    } finally {
      if (btnDlPdf) btnDlPdf.disabled = false;
      if (btnDlExcel) btnDlExcel.disabled = false;
    }
  };

  if (btnDlPdf) btnDlPdf.onclick = () => runDownload("pdf");
  if (btnDlExcel) btnDlExcel.onclick = () => runDownload("excel");
}

// ---------- quiz (placement & challenge) ----------
function quizHead(title, color, index, total) {
  el.quizhead.innerHTML = `<span class="pill" style="background:${color}">測驗 QUIZ</span> ${title}
    <span class="count">第 ${index}／${total} 題</span>`;
  el.quizbar.style.width = ((index - 1) / total * 100) + "%";
}

// Ask one "pick the correct spelling" question. Resolves true/false when answered.
export function askPick(word, meta) {
  return new Promise((resolve) => {
    quizHead(meta.title, meta.color, meta.index, meta.total);
    el.quizstage.innerHTML = "";
    const q = document.createElement("div");
    q.className = "quizq"; q.textContent = "🔊 聽發音，選出正確的拼法";
    const opts = document.createElement("div");
    opts.className = "opts";
    const choices = shuffle([word.word, ...misspellings(word.word, 3)]);
    let done = false;
    choices.forEach((choice) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "opt"; b.textContent = choice;
      b.onclick = () => {
        if (done) return; done = true;
        const ok = choice === word.word;
        b.classList.add(ok ? "ok" : "bad");
        if (!ok) opts.querySelectorAll(".opt").forEach((o) => { if (o.textContent === word.word) o.classList.add("ok"); });
        el.quizbar.style.width = (meta.index / meta.total * 100) + "%";
        say(word.word);
        setTimeout(() => resolve(ok), 700);
      };
      opts.append(b);
    });
    el.quizstage.append(q, opts, miniBtn("🔊 再聽一次", () => say(word.word)));
    say(word.word);
  });
}

// Show a full-card result with a single continue button.
export function quizResult({ emoji, headline, sub, extraHtml = "", btnLabel, color }, onBtn) {
  el.quizhead.innerHTML = `<span class="pill" style="background:${color}">結果 RESULT</span>`;
  el.quizbar.style.width = "100%";
  el.quizstage.innerHTML = `
    <div class="result">
      <div class="big">${emoji}</div>
      <div class="headline">${headline}</div>
      <div class="sub">${sub}</div>
      ${extraHtml}
      <button class="btn go" id="quizDone" style="max-width:280px">${btnLabel}</button>
    </div>`;
  $("#quizDone").onclick = onBtn;
}

// ---------- one-time button wiring ----------
export function onPeek(fn) { el.peekBtn.onclick = fn; }
export function onCheckClick(fn) { el.checkBtn.onclick = fn; }
export function onReset(fn) { const btn = $("#resetBtn"); if (btn) btn.onclick = fn; }
export function onSummary(fn) { $("#sumBtn").onclick = fn; }
export function onPlace(fn) { const btn = $("#placeBtn"); if (btn) btn.onclick = fn; }

export function initProgressCard() {
  const sec = document.getElementById("progress-card") || document.getElementById("learning-progress-section");
  const body = document.getElementById("progress-collapsible-body");
  const toggleBtn = document.getElementById("btn-toggle-progress-card");
  if (!sec || !toggleBtn) return;
  if (sec.__progressBound) return;
  sec.__progressBound = true;

  toggleBtn.onclick = (e) => {
    e.preventDefault();
    const isHidden = (body && body.style.display === "none") || sec.classList.contains("is-collapsed");
    if (isHidden) {
      if (body) body.style.display = "block";
      sec.classList.remove("is-collapsed");
      toggleBtn.innerHTML = "收合";
    } else {
      if (body) body.style.display = "none";
      sec.classList.add("is-collapsed");
      toggleBtn.innerHTML = "展開";
    }
  };
}

