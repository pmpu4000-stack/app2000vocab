// =====================================================================
// ui.js — the view. All DOM rendering lives here. It renders from plain
// data and reports intent through callbacks; it never touches the store.
// =====================================================================
import { CATS } from "./data.js";
import { say, spellOut } from "./audio.js";
import { LEVELS, levelColor, levelName, misspellings, shuffle } from "./levels.js";

if (typeof window !== "undefined") {
  window.__say = say;
  window.__sayWord = (w) => say(w);
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

  if (word.sent && mode !== "pick") {
    let sentsList = (Array.isArray(word.sents) && word.sents.length > 0)
      ? [...word.sents]
      : [{ level: 'normal', levelName: '普通', sent: word.sent, sentZh: word.sentZh || '', src: word.sentSrc || '' }];

    const levelOrder = { simple: 1, normal: 2, advanced: 3 };
    sentsList.sort((a, b) => (levelOrder[a.level] || 9) - (levelOrder[b.level] || 9));

    let html = '<div class="sents-vertical-list">';
    sentsList.forEach((s, i) => {
      const levelCls = s.level === 'simple' ? 'level-simple' : s.level === 'advanced' ? 'level-advanced' : 'level-normal';
      const levelText = s.levelName || (i === 0 ? '簡單' : i === 1 ? '普通' : '進階');
      const maskedSent = s.sent.replace(new RegExp("\\b" + word.word + "\\b", "i"), "<u>_____</u>");

      html += `
        <div class="sent-row" data-idx="${i}">
          <button type="button" class="sent-speaker-btn ${levelCls}" data-idx="${i}" title="${levelText}例句 (點擊朗讀)" aria-label="${levelText}例句朗讀">
            🔊
          </button>
          <div class="sent-text-wrap" data-idx="${i}" title="點擊朗讀此例句">
            <div class="sent-en">${maskedSent}</div>
            ${s.sentZh ? `<div class="sent-zh">${s.sentZh}</div>` : ''}
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
        say(targetSent.sent, 0.88);
        row.classList.add("playing");
        const speaker = row.querySelector(".sent-speaker-btn");
        if (speaker) speaker.classList.add("playing");
        setTimeout(() => {
          row.classList.remove("playing");
          if (speaker) speaker.classList.remove("playing");
        }, 600);
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
    b.className = "opt"; b.textContent = choice;
    b.onclick = () => {
      if (done) return; done = true;
      const ok = choice === word.word;
      b.classList.add(ok ? "ok" : "bad");
      if (!ok) opts.querySelectorAll(".opt").forEach((o) => { if (o.textContent === word.word) o.classList.add("ok"); });
      onAnswer(ok);
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
  const scr = document.createElement("div");
  scr.className = "tiles";
  shuffled.forEach((ch) => {
    const t = document.createElement("div");
    t.className = "tile"; t.style.background = "#EEF6FF"; t.style.borderColor = "#CBE4FA"; t.style.color = "#0f172a";
    t.textContent = ch === " " ? "␣" : ch;
    scr.append(t);
  });
  const inp = textInput("排出正確的字…", onCheck);
  el.stage.append(scr, inp);
  setTimeout(() => inp.focus(), 50);
  return {
    getGuess: () => inp.value.trim().toLowerCase(),
    applyTypedResult: (ok) => { inp.classList.add(ok ? "ok" : "bad"); inp.disabled = true; },
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
    pulse("shake"); say(word.word, 0.88);
  }
}
export function setActionNext() {
  el.checkBtn.style.display = ""; el.checkBtn.disabled = false;
  el.checkBtn.textContent = "下一個 Next →"; el.checkBtn.className = "btn go";
  setTimeout(() => { try { el.checkBtn.focus(); } catch(_) {} }, 50);
}
export function peek(word) {
  // 偷看功能已全面移除
}

// ---------- header, progress bar, gate banner ----------
export function renderProgress(s) {
  const u = localStorage.getItem("current_user");
  const userEl = $("#s-user");
  if (userEl && u) {
    userEl.textContent = u;
    userEl.title = u;
    const statEl = document.getElementById("stat-user");
    if (statEl) {
      statEl.title = `目前登入帳號：${u}\n（點擊可查看帳號詳情或切換）`;
    }
    // 寬度隨帳號名稱長度自適應展開，字體維持清晰易讀
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
  $("#s-correct").textContent = s.distinctCorrect;
  $("#s-streak").textContent = s.streak;
  $("#s-rate").textContent = s.passRate + "%";
  $("#b-learn").style.width = (s.learn / s.total * 100) + "%";
  $("#b-prac").style.width = (s.prac / s.total * 100) + "%";
  $("#n-learn").textContent = s.learn; $("#n-prac").textContent = s.prac;
  $("#n-mast").textContent = s.mast;
  const nCorr = $("#n-correct");
  if (nCorr) nCorr.textContent = s.distinctCorrect;
  $("#n-total").textContent = s.total;
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
        <div class="info">Level ${level}「${levelName(level)}」· 正確率 <b>${pct}%</b>（本關練習 ${ls.attempts} 題）</div>
        <div class="meter"><i style="width:${Math.min(100, pct)}%"></i></div>
        <div class="info" style="margin-top:6px;color:var(--ink3)">${hint}</div>
      </div>
      <button class="challenge" id="challengeBtn" ${ready ? "" : "disabled"}>🏆 挑戰測驗</button>
    </div>`;
  $("#challengeBtn").onclick = () => { if (ready) onChallenge(); };
}

function normalizeDateStr(ds) {
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

function getCombinedTaskHistory() {
  const list = [];
  try {
    const raw = localStorage.getItem("student_task_history");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list.push(...parsed);
    }
  } catch(_) {}

  try {
    const rawSum = localStorage.getItem("today_task_summary");
    if (rawSum) {
      const s = JSON.parse(rawSum);
      if (s && s.date && s.taskName) {
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
          updatedAt: s.updatedAt || `${s.date} (今日)`,
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
      if (a && (a.hasTask || a.alreadyCompleted) && a.taskName) {
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

  // 整理答錯單字
  let wrongList = Array.from(new Set(
    (record.wrongWords || []).map(w => String(w).trim().toLowerCase()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  if (pool.length === 0 && wrongList.length > 0) {
    pool = [...wrongList];
  }

  // 解析預期答對題數與總題數
  let expectedCorrect = 0;
  let expectedTotal = 0;
  if (record.score && String(record.score).includes("/")) {
    const parts = String(record.score).split("/");
    expectedCorrect = parseInt(parts[0], 10) || 0;
    expectedTotal = parseInt(parts[1], 10) || 0;
  } else if (record.correct !== undefined) {
    expectedCorrect = parseInt(record.correct, 10) || 0;
    expectedTotal = parseInt(record.attempts, 10) || 0;
  }

  const wrongSet = new Set(wrongList.map(w => w.toLowerCase()));
  let rawWords = Array.from(new Set(pool.map(w => String(w).trim().toLowerCase()).filter(Boolean)));
  let correctList = rawWords.filter(w => !wrongSet.has(w.toLowerCase()));

  // 8. 若預期答對題數大於目前已識別的答對單字數，從當日受測紀錄與 DB.stat 智能補齊
  if (expectedCorrect > 0 && correctList.length < expectedCorrect) {
    const allWords = (d && d.allPracticedWords) || [];
    const candidates = allWords.filter(w => {
      const wordStr = String(w.word || w).trim().toLowerCase();
      return !wrongSet.has(wordStr) && !correctList.includes(wordStr);
    });
    candidates.sort((a, b) => (b.correct || 0) - (a.correct || 0));
    const need = expectedCorrect - correctList.length;
    const added = candidates.slice(0, need).map(w => String(w.word || w).trim().toLowerCase());
    added.forEach(w => {
      if (!rawWords.includes(w)) rawWords.push(w);
      if (!correctList.includes(w)) correctList.push(w);
    });
  }

  wrongList.sort((a, b) => a.localeCompare(b));
  correctList.sort((a, b) => a.localeCompare(b));

  // 回寫快取防止刷新遺失
  if (rawWords.length > 0) {
    record.words = rawWords;
    try {
      localStorage.setItem("task_words_" + normDate, JSON.stringify(rawWords));
    } catch(_) {}
  }

  return { rawWords, wrongList, correctList };
}

function buildTaskDetailsHtml(record, selectedDate, d) {
  if (!record) {
    return `
      <div class="task-history-card" style="text-align:center; padding:22px 14px; color:var(--ink3);">
        <div style="font-size:26px; margin-bottom:6px;">📅</div>
        <div style="font-size:13.5px; font-weight:700; color:var(--ink2);">該指定日期（${selectedDate}）尚無教師指派之測驗作答紀錄</div>
        <div style="font-size:12px; margin-top:4px; color:var(--ink3);">可從上方下拉選單切換至其他日期查看詳細作答紀錄</div>
      </div>
    `;
  }

  const { rawWords, wrongList, correctList } = resolveTaskWords(record, selectedDate, d);

  const scoreVal = record.score || "—";
  const rateVal = record.rate || "—";
  const statusStr = record.status || "🟢 已完成";
  const statusColor = statusStr.includes("已完成") ? "#4ade80" : statusStr.includes("作答中") ? "#facc15" : "#94a3b8";
  const statusBg = statusStr.includes("已完成") ? "rgba(34,197,94,0.15)" : statusStr.includes("作答中") ? "rgba(234,179,8,0.15)" : "rgba(148,163,184,0.15)";
  const isFinished = statusStr.includes("已完成") || (scoreVal !== "—" && scoreVal !== "尚未開始");

  let correctContentHtml = "";
  if (correctList.length > 0) {
    correctContentHtml = correctList.map(w => `<span class="word-pill-tag correct" onclick="window.__sayWord && window.__sayWord('${w.replace(/'/g, "\\'")}')" style="cursor:pointer;" title="點擊聆聽發音">✓ ${w} 🔊</span>`).join("");
  } else if (isFinished) {
    if (rawWords.length > 0) {
      correctContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（本次測驗全數答錯，尚無答對單字）</span>`;
    } else {
      correctContentHtml = (wrongList.length === 0)
        ? `<span style="font-size:12px; color:#4ade80; font-weight:700;">🎉 太棒了！本次測驗全數答對！</span>`
        : `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（本次測驗作答 ${scoreVal}）</span>`;
    }
  } else {
    correctContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（測驗待完成，尚未作答）</span>`;
  }

  let wrongContentHtml = "";
  if (wrongList.length > 0) {
    wrongContentHtml = wrongList.map(w => `<span class="word-pill-tag wrong" onclick="window.__sayWord && window.__sayWord('${w.replace(/'/g, "\\'")}')" style="cursor:pointer;" title="點擊聆聽發音">✗ ${w} 🔊</span>`).join("");
  } else if (isFinished) {
    wrongContentHtml = `<span style="font-size:12px; color:#4ade80; font-weight:700;">🎉 太棒了！本次測驗全數答對，無任何答錯單字！</span>`;
  } else {
    wrongContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（目前無答錯單字）</span>`;
  }

  return `
    <div class="task-history-card">
      <div class="task-history-header">
        <div>
          <span style="font-size:15px; font-weight:800; color:#f8fafc;">${record.taskName}</span>
          <span style="margin-left:8px; font-size:11.5px; font-weight:700; color:${statusColor}; background:${statusBg}; padding:2px 8px; border-radius:999px;">${statusStr}</span>
        </div>
        <div style="font-size:12px; color:var(--ink3); font-weight:600;">
          🕒 作答時間：<span style="color:#cbd5e1; font-weight:700;">${record.updatedAt || record.date}</span>
        </div>
      </div>

      <div class="task-score-grid">
        <div class="task-score-item">
          <div style="font-size:11.5px; color:var(--ink3); font-weight:700; margin-bottom:2px;">🎯 答對題數 / 總題數</div>
          <div class="task-score-val" style="color:#38bdf8;">${scoreVal} 題</div>
        </div>
        <div class="task-score-item">
          <div style="font-size:11.5px; color:var(--ink3); font-weight:700; margin-bottom:2px;">📊 正確率</div>
          <div class="task-score-val" style="color:${parseInt(rateVal) >= 80 ? '#4ade80' : '#fb923c'};">${rateVal}</div>
        </div>
      </div>

      <!-- 將答對的字與答錯的字分成兩個區域（如同自由練習成果，且純顯示當日測驗作答狀況） -->
      <div class="word-split-grid">
        <!-- 答對的單字區 -->
        <div class="word-split-box correct-box">
          <div class="word-split-title correct-title">
            <span>✅ 答對的單字（共 ${correctList.length} 字）：</span>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:5px;">
            ${correctContentHtml}
          </div>
        </div>

        <!-- 答錯的單字區 -->
        <div class="word-split-box wrong-box">
          <div class="word-split-title wrong-title">
            <span>❌ 答錯的單字（共 ${wrongList.length} 字）：</span>
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
      <div class="task-history-card" style="text-align:center; padding:22px 14px; color:var(--ink3);">
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
    const wName = info.word || k;
    const hasWrong = (info.wrong > 0);
    const hasCorrect = (info.correct > 0);

    if (hasWrong) {
      wrongList.push({ word: wName, attempts: info.attempts || 1, wrong: info.wrong, correct: info.correct || 0 });
    } else if (hasCorrect) {
      correctList.push({ word: wName, attempts: info.attempts || 1, correct: info.correct });
    } else {
      correctList.push({ word: wName, attempts: info.attempts || 1, correct: 1 });
    }
  });

  // 【核心修復】：若該日有作答題數但 words 為空，從 d.allPracticedWords 智能動態還原出受測單字細節！
  if (correctList.length === 0 && wrongList.length === 0 && attempts > 0) {
    const allWords = (d && d.allPracticedWords) || [];

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

  let correctContentHtml = "";
  if (correctList.length > 0) {
    correctContentHtml = correctList.map(w => `<span class="word-pill-tag correct" onclick="window.__sayWord && window.__sayWord('${w.word.replace(/'/g, "\\'")}')" style="cursor:pointer;" title="點擊聆聽發音">✓ ${w.word} 🔊</span>`).join("");
  } else {
    correctContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（當日尚無全對單字）</span>`;
  }

  let wrongContentHtml = "";
  if (wrongList.length > 0) {
    wrongContentHtml = wrongList.map(w => {
      if (w.correct > 0) {
        return `<span class="word-pill-tag correct" onclick="window.__sayWord && window.__sayWord('${w.word.replace(/'/g, "\\'")}')" style="border:1px dashed #4ade80; cursor:pointer;" title="當日曾答錯 ${w.wrong} 次，當日已訂正答對 (點擊聆聽發音)">✓ ${w.word} <small style="font-size:10px; opacity:0.85;">(已訂正) 🔊</small></span>`;
      } else {
        return `<span class="word-pill-tag wrong" onclick="window.__sayWord && window.__sayWord('${w.word.replace(/'/g, "\\'")}')" style="cursor:pointer;" title="點擊聆聽發音">✗ ${w.word} 🔊</span>`;
      }
    }).join("");
  } else {
    wrongContentHtml = `<span style="font-size:12px; color:#4ade80; font-weight:700;">🎉 太棒了！當日自由練習全數答對，無任何答錯單字！</span>`;
  }

  return `
    <div class="task-history-card">
      <div class="task-history-header">
        <div>
          <span style="font-size:15px; font-weight:800; color:#f8fafc;">🎮 自由練習成果</span>
          <span style="margin-left:8px; font-size:11.5px; font-weight:700; color:#38bdf8; background:rgba(56,189,248,0.12); padding:2px 8px; border-radius:999px;">自主訓練</span>
        </div>
        <div style="font-size:12px; color:var(--ink3); font-weight:600;">
          📅 練習日期：<span style="color:#cbd5e1; font-weight:700;">${selectedDate}</span>
        </div>
      </div>

      <div class="task-score-grid">
        <div class="task-score-item">
          <div style="font-size:11.5px; color:var(--ink3); font-weight:700; margin-bottom:2px;">🎯 作答題數</div>
          <div class="task-score-val" style="color:#38bdf8;">${attempts} 題</div>
        </div>
        <div class="task-score-item">
          <div style="font-size:11.5px; color:var(--ink3); font-weight:700; margin-bottom:2px;">✅ 答對題數</div>
          <div class="task-score-val" style="color:#4ade80;">${correct} 題</div>
        </div>
        <div class="task-score-item">
          <div style="font-size:11.5px; color:var(--ink3); font-weight:700; margin-bottom:2px;">📊 正確率</div>
          <div class="task-score-val" style="color:${rate >= 80 ? '#4ade80' : '#fb923c'};">${rate}%</div>
        </div>
      </div>

      <!-- 將答對的字與答錯的字分成兩個區域（純顯示當日練習狀況，非累積狀況） -->
      <div class="word-split-grid">
        <!-- 答對的單字區 -->
        <div class="word-split-box correct-box">
          <div class="word-split-title correct-title">
            <span>✅ 答對的單字（共 ${correctList.length} 字）：</span>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:5px;">
            ${correctContentHtml}
          </div>
        </div>

        <!-- 答錯的單字區 -->
        <div class="word-split-box wrong-box">
          <div class="word-split-title wrong-title">
            <span>❌ 答錯的單字（共 ${wrongList.length} 字）：</span>
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
  const norm = String(dateStr).trim().replace(/\//g, "-");
  const parts = norm.split("-");
  const normYMD = (parts.length === 3) ? `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}` : norm;
  const unpadYMD = (parts.length === 3) ? `${parts[0]}-${parseInt(parts[1], 10)}-${parseInt(parts[2], 10)}` : norm;
  const slashYMD = normYMD.replace(/-/g, "/");

  const today = new Date();
  const todayDash = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  const isToday = (normYMD === todayDash || dateStr === todayDash);

  // 1. 從 d.dailyPractice 尋找
  const dpMap = (d && d.dailyPractice) || {};
  let rec = dpMap[normYMD] || dpMap[unpadYMD] || dpMap[slashYMD] || dpMap[dateStr] || null;
  if (rec && rec.attempts > 0) {
    return {
      date: normYMD,
      attempts: rec.attempts,
      correct: rec.correct,
      wrong: (rec.wrong !== undefined) ? rec.wrong : Math.max(0, rec.attempts - rec.correct),
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

  // 3. 從 student_task_history 尋找 (Google Sheets 雲端同步各日作答歷程)
  if (Array.isArray(historyList)) {
    const matchedTask = historyList.find(item => {
      if (!item || !item.date) return false;
      const iDate = String(item.date).trim().replace(/\//g, "-");
      const iParts = iDate.split("-");
      const iNorm = (iParts.length === 3) ? `${iParts[0]}-${iParts[1].padStart(2, "0")}-${iParts[2].padStart(2, "0")}` : iDate;
      return iNorm === normYMD;
    });

    if (matchedTask) {
      let att = parseInt(matchedTask.attempts) || 0;
      let corr = parseInt(matchedTask.correct) || 0;
      if (!att && matchedTask.score && matchedTask.score !== "—" && matchedTask.score.includes("/")) {
        const p = matchedTask.score.split("/");
        corr = parseInt(p[0]) || 0;
        att = parseInt(p[1]) || 0;
      }
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

  // 4. 若為今天且總作答題數大於 0 (DB.attempts > 0)，且今日有即時作答
  if (isToday && d && d.attempts > 0) {
    return {
      date: normYMD,
      attempts: d.attempts,
      correct: d.correct,
      wrong: Math.max(0, d.attempts - d.correct),
      words: (rec && rec.words) || {}
    };
  }

  return rec;
}

// ---------- summary ----------
export function summaryHidden() { return el.summary.hidden; }
export function renderSummary(d) {
  const currentUser = localStorage.getItem("current_user") || "";
  const userTagHtml = currentUser ? `<span style="font-size:13px;font-weight:700;color:var(--sky);background:rgba(56,189,248,0.12);padding:2px 8px;border-radius:999px;margin-left:8px;border:1px solid rgba(56,189,248,0.25);">👤 ${currentUser}</span>` : "";
  const lvRows = d.levels
    .map((L) => `<tr><td><span style="color:${levelColor(L.level)}">●</span> Level ${L.level}「${levelName(L.level)}」</td><td>正確率 ${L.rate}%／精通 ${L.mast}／共 ${L.total}</td></tr>`)
    .join("");

  const historyList = getCombinedTaskHistory();
  const dailyPracticeMap = d.dailyPractice || {};
  const practiceDates = Array.isArray(d.practiceDates) ? d.practiceDates : [];

  const todayDash = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0") + "-" + String(new Date().getDate()).padStart(2, "0");
  
  // 建立日期選項集合（整合教師指定測驗、自由練習與今日）
  const dateSet = new Set();
  historyList.forEach(item => { if (item.date) dateSet.add(normalizeDateStr(item.date)); });
  practiceDates.forEach(dateStr => { if (dateStr) dateSet.add(normalizeDateStr(dateStr)); });
  Object.keys(dailyPracticeMap).forEach(dateStr => { if (dateStr) dateSet.add(normalizeDateStr(dateStr)); });
  if (d.rawHistory) {
    Object.keys(d.rawHistory).forEach(dateStr => { if (dateStr) dateSet.add(normalizeDateStr(dateStr)); });
  }
  dateSet.add(todayDash);

  const sortedDates = Array.from(dateSet).filter(Boolean).sort((a, b) => b.localeCompare(a));
  const defaultSelectedDate = sortedDates[0] || todayDash;

  // 建立「🎯 快速跳至有紀錄日期」下拉選單
  const quickDateOptionsHtml = sortedDates.map(dateStr => {
    const isToday = (dateStr === todayDash);
    const matchedTask = historyList.find(item => normalizeDateStr(item.date) === dateStr);
    const recFree = resolveDailyPracticeRecord(dateStr, d, historyList);
    const freeAtt = recFree ? (recFree.attempts || 0) : 0;

    let desc = "";
    if (matchedTask && freeAtt > 0) desc = ` [指派: ${matchedTask.taskName}] [自由: ${freeAtt}題]`;
    else if (matchedTask) desc = ` [指派: ${matchedTask.taskName}]`;
    else if (freeAtt > 0) desc = ` [自由練習: ${freeAtt}題]`;
    else desc = " (尚無紀錄)";

    const label = `${dateStr}${isToday ? " (今日)" : ""}${desc}`;
    return `<option value="${dateStr}" ${dateStr === defaultSelectedDate ? "selected" : ""}>${label}</option>`;
  }).join("");

  const initialTaskRecord = historyList.find(item => normalizeDateStr(item.date) === defaultSelectedDate) || null;
  const initialTaskDetailsHtml = buildTaskDetailsHtml(initialTaskRecord, defaultSelectedDate, d);

  const initialFreeRecord = resolveDailyPracticeRecord(defaultSelectedDate, d, historyList);
  const initialFreeDetailsHtml = buildFreeDetailsHtml(initialFreeRecord, defaultSelectedDate, d);

  el.summary.innerHTML = `
    <h3>📊 學習紀錄 Record ${userTagHtml} <a id="sumClose">收起 ✕</a></h3>
    <div class="bigrate">
      <b class="tnum">${d.passRate}%</b>
      <span>總答對率<br><small>${d.correct} 題對 / 共作答 ${d.attempts} 題</small></span>
      <span style="margin-left:auto;text-align:right">
        <b class="tnum" style="font-size:30px;color:var(--violet)">${d.distinctCorrect}</b><br>
        <small>答對過的字（不重複）／ 共 ${d.total} 字</small></span>
    </div>
    <div class="subh">各關卡進度</div>
    <table class="sumtable">${lvRows}</table>
    <div style="font-size:11.5px; color:var(--ink3); margin:6px 0 14px; line-height:1.6; background:rgba(255,255,255,0.03); padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.06);">
      💡 <b>正確率計算公式</b>：<span style="color:#38bdf8;">（該關卡考出來且答對單字數 ÷ 該關卡考出來的總單字數）× 100%</span>
    </div>
    <div class="subh">🎮 4 大練習模式答題數</div>
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:8px; margin:8px 0 14px;">
      <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:8px 10px; text-align:center;">
        <div style="font-size:12px; color:var(--ink3); font-weight:700;">🎧 聽與拼</div>
        <div style="font-weight:700; font-size:15px; margin:2px 0;">${(d.modeStats?.listen?.a || 0)} 題</div>
        <div style="font-size:11px; color:var(--green);">答對 ${d.modeStats?.listen?.c || 0} (${d.modeStats?.listen?.a ? Math.round((d.modeStats.listen.c / d.modeStats.listen.a)*100) : 0}%)</div>
      </div>
      <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:8px 10px; text-align:center;">
        <div style="font-size:12px; color:var(--ink3); font-weight:700;">✅ 選拼法</div>
        <div style="font-weight:700; font-size:15px; margin:2px 0;">${(d.modeStats?.pick?.a || 0)} 題</div>
        <div style="font-size:11px; color:var(--green);">答對 ${d.modeStats?.pick?.c || 0} (${d.modeStats?.pick?.a ? Math.round((d.modeStats.pick.c / d.modeStats.pick.a)*100) : 0}%)</div>
      </div>
      <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:8px 10px; text-align:center;">
        <div style="font-size:12px; color:var(--ink3); font-weight:700;">🧩 重組</div>
        <div style="font-weight:700; font-size:15px; margin:2px 0;">${(d.modeStats?.scramble?.a || 0)} 題</div>
        <div style="font-size:11px; color:var(--green);">答對 ${d.modeStats?.scramble?.c || 0} (${d.modeStats?.scramble?.a ? Math.round((d.modeStats.scramble.c / d.modeStats.scramble.a)*100) : 0}%)</div>
      </div>
      <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:8px 10px; text-align:center;">
        <div style="font-size:12px; color:var(--ink3); font-weight:700;">🖍️ 填陷阱</div>
        <div style="font-weight:700; font-size:15px; margin:2px 0;">${(d.modeStats?.trap?.a || 0)} 題</div>
        <div style="font-size:11px; color:var(--green);">答對 ${d.modeStats?.trap?.c || 0} (${d.modeStats?.trap?.a ? Math.round((d.modeStats.trap.c / d.modeStats.trap.a)*100) : 0}%)</div>
      </div>
    </div>

    <!-- 📅 指定日期查詢工具列（直覺日曆與快速切換） -->
    <div class="date-navigator-card">
      <div class="date-nav-left">
        <span style="font-weight:800; font-size:13.5px; color:#38bdf8; display:flex; align-items:center; gap:5px;">
          <span>📅</span> 查詢指定日期：
        </span>
        <input type="date" id="record-date-picker" class="date-picker-input" value="${defaultSelectedDate}" max="${todayDash}">
        <button type="button" id="btn-date-today" class="date-nav-btn today-btn" title="切換回今日">📍 今日</button>
        <button type="button" id="btn-date-prev" class="date-nav-btn" title="查看前一天">◀ 前一天</button>
        <button type="button" id="btn-date-next" class="date-nav-btn" title="查看後一天">後一天 ▶</button>
      </div>
      <div class="date-nav-right">
        <label for="record-quick-dates" style="font-size:12px; color:var(--ink3); font-weight:700;">🎯 快速跳至有紀錄日期：</label>
        <select id="record-quick-dates" class="task-date-selector">
          ${quickDateOptionsHtml}
        </select>
      </div>
    </div>

    <!-- 教師指定單字測驗作答紀錄 -->
    <div class="subh" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
      <span>📝 教師指定單字測驗作答紀錄</span>
      <span style="font-size:12px; color:var(--sky); font-weight:700;">📅 目前查看日期：<span id="task-view-date">${defaultSelectedDate}</span></span>
    </div>
    <div id="task-record-details">
      ${initialTaskDetailsHtml}
    </div>

    <!-- 自由練習作答紀錄 -->
    <div class="subh" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-top:20px;">
      <span>🎮 自由練習作答紀錄</span>
      <span style="font-size:12px; color:var(--sky); font-weight:700;">📅 目前查看日期：<span id="free-view-date">${defaultSelectedDate}</span></span>
    </div>
    <div id="free-record-details">
      ${initialFreeDetailsHtml}
    </div>

    <div class="subh">📅 練習紀錄（最近 4 週）</div>
    <div class="streakline">🔥 連續 <b>${d.history.streak}</b> 天　·　最佳 <b>${d.history.best}</b> 天　·　累計練習 <b>${d.history.total}</b> 天</div>
    <div class="heatmap">${d.history.days.map((x) =>
      `<i class="hc h${x.level}" title="${x.key}：${x.a ? "作答 " + x.a + " · 正確率 " + x.rate + "%" : "沒有練習"}"></i>`).join("")}</div>`;

  let currentSelectedDate = defaultSelectedDate;

  const switchRecordDate = (newDate) => {
    if (!newDate) return;
    const targetDate = normalizeDateStr(newDate);
    currentSelectedDate = targetDate;

    // 更新日期輸入框
    const datePicker = $("#record-date-picker");
    if (datePicker && datePicker.value !== targetDate) {
      datePicker.value = targetDate;
    }

    // 更新快速跳轉選單
    const quickSelect = $("#record-quick-dates");
    if (quickSelect && quickSelect.value !== targetDate) {
      quickSelect.value = targetDate;
    }

    // 更新卡片副標日期
    const taskDateLabel = $("#task-view-date");
    if (taskDateLabel) taskDateLabel.textContent = targetDate;
    const freeDateLabel = $("#free-view-date");
    if (freeDateLabel) freeDateLabel.textContent = targetDate;

    // 更新教師指定測驗
    const targetTaskRecord = historyList.find(item => normalizeDateStr(item.date) === targetDate) || null;
    const taskDetailsContainer = $("#task-record-details");
    if (taskDetailsContainer) {
      taskDetailsContainer.innerHTML = buildTaskDetailsHtml(targetTaskRecord, targetDate, d);
    }

    // 更新自由練習（拆分為答對與答錯區域）
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
  }

  $("#sumClose").onclick = () => { el.summary.hidden = true; };
}
export function toggleSummary(data) {
  if (el.summary.hidden) {
    el.summary.hidden = false;
    try {
      renderSummary(data);
      el.summary.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      console.error("renderSummary error:", err);
      el.summary.innerHTML = `
        <div style="padding:18px; text-align:center; color:#f87171;">
          <div style="font-size:20px; margin-bottom:6px;">⚠️</div>
          <b>載入紀錄時發生問題：</b> ${err.message}<br>
          <button onclick="document.getElementById('summary').hidden=true" style="margin-top:10px; padding:6px 14px; background:#334155; color:#fff; border:none; border-radius:6px; cursor:pointer;">關閉</button>
        </div>
      `;
    }
  } else {
    el.summary.hidden = true;
  }
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
