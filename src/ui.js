// =====================================================================
// ui.js — the view. All DOM rendering lives here. It renders from plain
// data and reports intent through callbacks; it never touches the store.
// =====================================================================
import { CATS } from "./data.js?v=20261013_1225";
import { say, sayWord, spellOut, playContestSentence, stopAudio, parseDialogue } from "./audio.js?v=20261013_2225";
import { LEVELS, levelColor, levelName, misspellings, shuffle } from "./levels.js?v=20261013_1225";
import { diagnoseWordMistake } from "./diagnostics.js";
import { normalizeDateStr, formatDateYMD, getWeekRangeDates, getBiweeklyCycleInfo } from "./store.js?v=20261019_v228";

if (typeof window !== "undefined") {
  window.__say = say;
  window.__sayWord = (w) => sayWord(w);
}

const $ = (s) => document.querySelector(s);
const el = {
  playScreen: $("#screen-play"), quizScreen: $("#screen-quiz"),
  levelbar: $("#levelbar"), modes: $("#modes"), stage: $("#stage"), fb: $("#feedback"),
  catlabel: $("#catlabel"), modehint: $("#modehint"), zh: $("#zh"), sent: $("#sent"),
  checkBtn: $("#checkBtn"), summary: $("#summary"),
  card: $("#card"), banner: $("#banner"), session: $("#session"),
  quizhead: $("#quizhead"), quizbar: $("#quizprog-bar"), quizstage: $("#quizstage"),
  sUser: $("#s-user"), statUser: $("#stat-user"), sLevel: $("#s-level"),
  sScore: $("#s-score"), nScore: $("#n-score"), sCorrect: $("#s-correct"), nCorrect: $("#n-correct"),
  sStreak: $("#s-streak"), sRate: $("#s-rate"), nRate: $("#n-rate"),
  bLearn: $("#b-learn"), bPrac: $("#b-prac"), bMast: $("#b-mast"),
  nLearn: $("#n-learn"), nPrac: $("#n-prac"), nMast: $("#n-mast"), nTotal: $("#n-total"),
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
  b.type = "button";
  b.className = "mini stage-sound-btn";
  b.innerHTML = label;
  b.onclick = onClick;
  return b;
}
function textInput(placeholder, onCheck) {
  const inp = document.createElement("input");
  inp.type = "text";
  inp.className = "spellbox";
  inp.setAttribute("autocomplete", "off");
  inp.setAttribute("autocorrect", "off");
  inp.setAttribute("autocapitalize", "none");
  inp.setAttribute("spellcheck", "false");
  inp.setAttribute("data-gramm", "false");
  inp.setAttribute("data-enable-grammarly", "false");
  inp.setAttribute("aria-autocomplete", "none");
  inp.autocapitalize = "none";
  inp.autocomplete = "off";
  inp.spellcheck = false;
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
export function renderRound(word, mode, { onAnswer, onCheck }) {
  el.fb.textContent = ""; el.fb.className = "feedback";
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

    // 例句方塊依自身內容行數自適應高度（不強制齊高膨脹）
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
      inp.setAttribute("autocomplete", "off");
      inp.setAttribute("autocorrect", "off");
      inp.setAttribute("autocapitalize", "none");
      inp.setAttribute("spellcheck", "false");
      inp.setAttribute("data-gramm", "false");
      inp.setAttribute("data-enable-grammarly", "false");
      inp.setAttribute("aria-autocomplete", "none");
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
      // 僅在非觸控螢幕/桌面端聚焦，避免手機點擊字母方塊時彈出虛擬鍵盤與預測提示詞
      const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      if (!isTouch) {
        inp.focus();
      }
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

export function showResult(correct, word, info, guessVal = "", onRepairComplete = null) {
  if (correct) {
    el.fb.className = "feedback ok";
    el.fb.textContent = `✅ ${CHEERS[Math.floor(Math.random() * CHEERS.length)]}  +${info.gain}`;
    pulse("pop"); say(word.word);
  } else {
    const diag = diagnoseWordMistake(word.word, guessVal);
    el.fb.className = "feedback bad";
    el.fb.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
        <span>❌ 再看一次！</span>
        <span class="diag-tag-chip" style="background:${diag.bg};color:${diag.color};border:1px solid ${diag.color}50;" title="${diag.desc}">🔍 ${diag.tag}</span>
        <span>正確拼法：<span class="reveal" style="display:inline">${revealHtml(word)}</span></span>
      </div>
      <div class="active-repair-card" id="active-repair-card">
        <div class="active-repair-header">
          <span style="font-size:16px;">✍️</span>
          <span><b>親手更正</b>：請鍵入正確單字加深神經連結</span>
        </div>
        <div class="active-repair-input-wrap">
          <input type="text" id="active-repair-input" class="active-repair-input" placeholder="請輸入「${word.word}」..." autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" data-gramm="false" data-enable-grammarly="false" aria-autocomplete="none" />
          <button type="button" id="active-repair-btn" class="active-repair-btn">更正確認 ↵</button>
        </div>
        <div id="active-repair-msg" class="active-repair-msg"></div>
      </div>
    `;
    pulse("shake"); say(word.word, 0.8);

    // 鎖定「下一個 Next」按鈕，直到親手更正完成
    el.checkBtn.style.display = "";
    el.checkBtn.disabled = true;
    el.checkBtn.textContent = "✍️ 請先完成親手更正";
    el.checkBtn.className = "btn ghost locked";

    const repairInp = document.getElementById("active-repair-input");
    const repairBtn = document.getElementById("active-repair-btn");
    const repairMsg = document.getElementById("active-repair-msg");

    if (repairInp && repairBtn) {
      let isRepaired = false;
      const doCheckRepair = () => {
        if (isRepaired) return;
        const val = repairInp.value.trim().toLowerCase();
        if (!val) {
          if (repairMsg) repairMsg.innerHTML = `<span style="color:var(--ink3);">請先輸入單字後點擊確認 ✏️</span>`;
          return;
        }
        if (val === word.word.toLowerCase()) {
          isRepaired = true;
          repairInp.disabled = true;
          repairBtn.disabled = true;
          repairInp.classList.add("ok");
          repairBtn.textContent = "✅ 已更正";
          if (repairMsg) repairMsg.innerHTML = `<span style="color:#10B981;font-weight:700;">✨ 太棒了！已親手更正，神經連結已加強！</span>`;
          say(word.word);

          // 解鎖 Next 按鈕
          setActionNext();
          if (typeof onRepairComplete === "function") {
            onRepairComplete();
          }
        } else {
          pulse("shake");
          if (repairMsg) repairMsg.innerHTML = `<span style="color:#EF4444;font-weight:700;">💡 還差一點點喔，正確拼法為「${word.word}」，再試一次！</span>`;
          repairInp.select();
        }
      };

      repairBtn.onclick = doCheckRepair;
      repairInp.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          doCheckRepair();
        }
      };
      setTimeout(() => { try { repairInp.focus(); } catch(_) {} }, 100);
    }
  }
}

export function focusActiveRepair() {
  const inp = document.getElementById("active-repair-input");
  if (inp && !inp.disabled) {
    try { inp.focus(); } catch(_) {}
  }
}
export function setActionNext() {
  el.checkBtn.style.display = ""; el.checkBtn.disabled = false;
  el.checkBtn.textContent = "下一個 Next →"; el.checkBtn.className = "btn go";
  setTimeout(() => { try { el.checkBtn.focus(); } catch(_) {} }, 50);
}
export function setNextBtnCountdown(secs) {
  // 倒數秒數已移除，維持無倒數的「下一個 Next →」
  if (el.checkBtn && el.checkBtn.style.display !== "none") {
    el.checkBtn.textContent = "下一個 Next →";
  }
}

// ---------- header, progress bar, gate banner ----------
export function renderProgress(s) {
  initProgressCard();
  if (!s) return;
  const u = localStorage.getItem("current_user");
  const userEl = el.sUser || (el.sUser = $("#s-user"));
  if (userEl && u) {
    userEl.textContent = u;
    userEl.title = u;
    const statEl = el.statUser || (el.statUser = document.getElementById("stat-user"));
    if (statEl) {
      statEl.title = `目前登入帳號：${u}\n（點擊可查看帳號詳情或切換）`;
    }
    userEl.style.fontSize = u.length > 16 ? "13px" : u.length > 12 ? "14.5px" : "17px";
  }
  const lvlEl = el.sLevel || (el.sLevel = $("#s-level"));
  if (lvlEl) lvlEl.textContent = s.currentLevel;

  const pts = s.points !== undefined ? s.points : 0;
  const sScore = el.sScore || (el.sScore = $("#s-score"));
  if (sScore) sScore.textContent = pts;
  const nScore = el.nScore || (el.nScore = $("#n-score"));
  if (nScore) nScore.textContent = pts;

  const totCorr = (s.learn || 0) + (s.prac || 0) + (s.mast || 0);
  const distinctCorr = totCorr > 0 ? totCorr : (s.distinctCorrect !== undefined ? s.distinctCorrect : 0);
  const sCorr = el.sCorrect || (el.sCorrect = $("#s-correct"));
  if (sCorr) sCorr.textContent = distinctCorr;
  const nCorr = el.nCorrect || (el.nCorrect = $("#n-correct"));
  if (nCorr) nCorr.textContent = distinctCorr;

  const sStreak = el.sStreak || (el.sStreak = $("#s-streak"));
  if (sStreak) sStreak.textContent = s.streak !== undefined ? s.streak : 0;
  const sFreeze = $("#s-freeze-val");
  if (sFreeze) {
    const fCount = (typeof s.streakFreezes === "number") ? s.streakFreezes : 0;
    sFreeze.textContent = fCount === 0 ? "已用完" : (fCount >= 2 ? "2 個(滿)" : `剩 ${fCount} 個`);
    sFreeze.style.color = fCount > 0 ? "#2563eb" : "#94a3b8";
    const fParent = sFreeze.closest ? sFreeze.closest(".stat") : null;
    if (fParent) {
      fParent.title = `連勝護盾（點擊查看說明）：目前剩餘 ${fCount} 個（${fCount > 0 ? "尚未用完，仍有守護機會" : "已用完，無剩餘護盾"}，上限 2 個）。若當日未練習，自動消耗 1 個護盾守護連續紀錄，每達 50 題答對自動補充`;
      fParent.style.cursor = "pointer";
      fParent.onclick = () => { if (typeof window.openStreakFreezeModal === "function") window.openStreakFreezeModal(); };
    }
  }

  const total = s.total || 2055;
  const vocabRate = total > 0 ? Math.round((distinctCorr / total) * 100) : 0;

  const sRate = el.sRate || (el.sRate = $("#s-rate"));
  if (sRate) sRate.textContent = (s.passRate !== undefined ? s.passRate : 0) + "%";
  const nRate = el.nRate || (el.nRate = $("#n-rate"));
  if (nRate) nRate.textContent = vocabRate + "%";

  const bLearn = el.bLearn || (el.bLearn = $("#b-learn"));
  if (bLearn) bLearn.style.width = Math.min(100, Math.max(0, ((s.learn || 0) / total * 100))) + "%";
  const bPrac = el.bPrac || (el.bPrac = $("#b-prac"));
  if (bPrac) bPrac.style.width = Math.min(100, Math.max(0, ((s.prac || 0) / total * 100))) + "%";
  const bMast = el.bMast || (el.bMast = $("#b-mast"));
  if (bMast) bMast.style.width = Math.min(100, Math.max(0, ((s.mast || 0) / total * 100))) + "%";

  const nLearn = el.nLearn || (el.nLearn = $("#n-learn"));
  if (nLearn) nLearn.textContent = s.learn || 0;
  const nPrac = el.nPrac || (el.nPrac = $("#n-prac"));
  if (nPrac) nPrac.textContent = s.prac || 0;
  const nMast = el.nMast || (el.nMast = $("#n-mast"));
  if (nMast) nMast.textContent = s.mast || 0;
  const nTotal = el.nTotal || (el.nTotal = $("#n-total"));
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

function formatWeekendTaskDate(ds, fallbackText = "") {
  let target = ds || "";
  if (!target && fallbackText) {
    const match = String(fallbackText).match(/\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/);
    if (match) target = match[1];
  }
  if (!target) return "";
  const clean = String(target).trim().split(/[T\s]/)[0].replace(/\//g, "-");
  const m = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    return `${m[1]}/${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}`;
  }
  return clean.replace(/-/g, "/");
}

function resolveWordStr(raw, d) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (/^w\d+$/i.test(s)) {
    const idx = parseInt(s.slice(1), 10);
    if (d && Array.isArray(d.words) && d.words.length > 0) {
      if (!isNaN(idx) && d.words[idx] && d.words[idx].word) return String(d.words[idx].word).trim();
      const byId = (d.words._byId && d.words._byId.get(s.toLowerCase())) || d.words.find(item => item && item.id === s.toLowerCase());
      if (byId && byId.word) return String(byId.word).trim();
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
          if (item && item.date) {
            const st = String(item.status || "");
            const isExplicitUntested = st.includes("未受測") || st.includes("缺席") || st.includes("缺考") || st.includes("未作答");
            if (!item.taskName || item.taskName !== "自主練習" || isExplicitUntested) {
              list.push({
                ...item,
                date: normalizeDateStr(item.date),
                taskName: (isExplicitUntested && (!item.taskName || item.taskName === "自主練習" || String(item.taskName).includes("未指派")))
                  ? "每日指定測驗"
                  : item.taskName
              });
            }
          }
        });
      }
    }
  } catch(_) {}

  const currentUser = (localStorage.getItem("current_user") || "").trim();
  const today = new Date();
  const todayDash = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");

  try {
    const rawSum = localStorage.getItem("today_task_summary");
    if (rawSum) {
      const s = JSON.parse(rawSum);
      const sUser = s && s.username ? String(s.username).trim() : "";
      if (s && s.date && (!sUser || !currentUser || sUser === currentUser) && s.taskName && s.taskName !== "自主練習") {
        const sNormDate = normalizeDateStr(s.date);
        if (sNormDate === todayDash) {
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
            ? s.wrongWords.map(w => String(w).trim().toLowerCase()).filter(w => /^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/.test(w))
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
            const keepOldCompleted = old.status && String(old.status).includes("已完成") && !s.completed;
            list[existIdx] = {
              ...old,
              ...(keepOldCompleted ? {} : item),
              words: mergedWords,
              wrongWords: mergedWrong
            };
          } else {
            list.unshift(item);
          }
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
      const aUser = a && a.username ? String(a.username).trim() : "";
      if (a && a.date && (!aUser || !currentUser || aUser === currentUser) && (a.hasTask || a.alreadyCompleted) && a.taskName && a.taskName !== "自主練習") {
        const dStr = normalizeDateStr(a.date);
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
        } else if (dStr === todayDash) {
          list.unshift({
            date: dStr,
            taskName: a.taskName,
            score: a.score || (a.alreadyCompleted ? "已完成" : "尚未開始"),
            rate: a.rate || "—",
            status: a.alreadyCompleted ? "🟢 已完成" : "🟡 待完成",
            updatedAt: "今日指定任務",
            wrongWords: (a.wrongWords || []).filter(w => /^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/.test(String(w).trim())),
            words: aWords
          });
        }
      }
    }
  } catch(_) {}

  // 掃描 localStorage 中的 task_summary_YYYY-MM-DD 與 weekend_remedy_YYYY-MM-DD 記錄，確保歷史紀錄完整無缺
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("task_summary_")) {
        const kDate = normalizeDateStr(k.slice("task_summary_".length));
        if (kDate) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const ts = JSON.parse(raw);
            if (ts && ts.completed && ts.taskName && ts.taskName !== "自主練習") {
              const existIdx = list.findIndex(item => item && normalizeDateStr(item.date) === kDate);
              const tsWords = (Array.isArray(ts.words) ? ts.words : []).map(w => typeof w === "string" ? w : (w.word || w.display || w.w)).filter(Boolean);
              const tsWrong = (Array.isArray(ts.wrongWords) ? ts.wrongWords : []).map(w => String(w).trim().toLowerCase()).filter(w => /^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/.test(w));
              const tsScore = (ts.score !== undefined && ts.total !== undefined) ? `${ts.score}/${ts.total}` : (ts.score || "已完成");
              const tsItem = {
                date: kDate,
                taskName: ts.taskName,
                score: tsScore,
                rate: ts.rate || "100%",
                status: "🟢 已完成",
                updatedAt: ts.updatedAt || kDate,
                wrongWords: tsWrong,
                words: tsWords
              };
              if (existIdx >= 0) {
                const old = list[existIdx];
                const oldCompleted = old.status && old.status.includes("已完成");
                list[existIdx] = {
                  ...old,
                  ...(oldCompleted ? {} : tsItem),
                  words: (tsWords.length > 0) ? tsWords : old.words,
                  wrongWords: (tsWrong.length > 0) ? tsWrong : old.wrongWords
                };
              } else {
                list.push(tsItem);
              }
            }
          }
        }
      } else if (k && k.startsWith("weekend_remedy_")) {
        const mondayStr = normalizeDateStr(k.slice("weekend_remedy_".length));
        if (mondayStr) {
          const rawRem = localStorage.getItem(k);
          if (rawRem) {
            const rem = JSON.parse(rawRem);
            if (rem) {
              const mDate = new Date(mondayStr.replace(/-/g, "/"));
              // Saturday = monday + 5 days
              const satD = new Date(mDate.getFullYear(), mDate.getMonth(), mDate.getDate() + 5);
              const satKey = satD.getFullYear() + "-" + String(satD.getMonth() + 1).padStart(2, "0") + "-" + String(satD.getDate()).padStart(2, "0");
              if (rem.satCompleted) {
                const existIdx = list.findIndex(item => item && normalizeDateStr(item.date) === satKey);
                const satCorr = (Array.isArray(rem.satCorrectWords) ? rem.satCorrectWords : []).map(w => String(w).trim().toLowerCase()).filter(w => /^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/.test(w));
                const satWrong = (Array.isArray(rem.satWrongWords) ? rem.satWrongWords : []).map(w => String(w).trim().toLowerCase()).filter(w => /^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/.test(w));
                const satWords = Array.from(new Set([...satCorr, ...satWrong]));
                const satItem = {
                  date: satKey,
                  taskName: `🎯 ${formatWeekendTaskDate(satKey)} 週末待攻克測驗作答紀錄`,
                  score: rem.satScore || (satWords.length ? `${satCorr.length}/${satWords.length}` : "已完成"),
                  rate: rem.satRate || (satWords.length ? `${Math.round((satCorr.length / satWords.length) * 100)}%` : "100%"),
                  status: "🟢 已完成",
                  updatedAt: rem.updatedAt || satKey,
                  wrongWords: satWrong,
                  correctWords: satCorr,
                  words: satWords,
                  isWeekend: true
                };
                if (existIdx >= 0) {
                  const old = list[existIdx];
                  const oldCompleted = old.status && old.status.includes("已完成");
                  list[existIdx] = {
                    ...old,
                    ...(oldCompleted ? {} : satItem),
                    words: (satWords.length > 0) ? satWords : old.words,
                    wrongWords: (satWrong.length > 0) ? satWrong : old.wrongWords,
                    correctWords: (satCorr.length > 0) ? satCorr : old.correctWords
                  };
                } else {
                  list.push(satItem);
                }
              }
              const satClearedAll = rem.satCompleted && (!rem.satWrongWords || rem.satWrongWords.length === 0);
              // Sunday = monday + 6 days
              const sunD = new Date(mDate.getFullYear(), mDate.getMonth(), mDate.getDate() + 6);
              const sunKey = sunD.getFullYear() + "-" + String(sunD.getMonth() + 1).padStart(2, "0") + "-" + String(sunD.getDate()).padStart(2, "0");
              if (satClearedAll && rem.sunCompleted) {
                // 自動修復：若週六已全數消滅，週日不應有 completed 標記，清理 localStorage
                delete rem.sunCompleted;
                delete rem.sunScore;
                delete rem.sunRate;
                delete rem.sunWrongWords;
                delete rem.sunCorrectWords;
                delete rem.sunTotal;
                try { localStorage.setItem(k, JSON.stringify(rem)); } catch(_) {}
                try { localStorage.removeItem("task_summary_" + sunKey); } catch(_) {}
              }
              if (rem.sunCompleted && !satClearedAll) {
                const existIdx = list.findIndex(item => item && normalizeDateStr(item.date) === sunKey);
                const sunCorr = (Array.isArray(rem.sunCorrectWords) ? rem.sunCorrectWords : []).map(w => String(w).trim().toLowerCase()).filter(w => /^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/.test(w));
                const sunWrong = (Array.isArray(rem.sunWrongWords) ? rem.sunWrongWords : []).map(w => String(w).trim().toLowerCase()).filter(w => /^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/.test(w));
                const sunWords = Array.from(new Set([...sunCorr, ...sunWrong]));
                const sunItem = {
                  date: sunKey,
                  taskName: `🎯 ${formatWeekendTaskDate(sunKey)} 週末待攻克測驗作答紀錄`,
                  score: rem.sunScore || (sunWords.length ? `${sunCorr.length}/${sunWords.length}` : "已完成"),
                  rate: rem.sunRate || (sunWords.length ? `${Math.round((sunCorr.length / sunWords.length) * 100)}%` : "100%"),
                  status: "🟢 已完成",
                  updatedAt: rem.updatedAt || sunKey,
                  wrongWords: sunWrong,
                  correctWords: sunCorr,
                  words: sunWords,
                  isWeekend: true
                };
                if (existIdx >= 0) {
                  const old = list[existIdx];
                  const oldCompleted = old.status && old.status.includes("已完成");
                  list[existIdx] = {
                    ...old,
                    ...(oldCompleted ? {} : sunItem),
                    words: (sunWords.length > 0) ? sunWords : old.words,
                    wrongWords: (sunWrong.length > 0) ? sunWrong : old.wrongWords,
                    correctWords: (sunCorr.length > 0) ? sunCorr : old.correctWords
                  };
                } else {
                  list.push(sunItem);
                }
              }
            }
          }
        }
      }
    }
  } catch(_) {}

  // 防護過濾：若該週末週六已全部消滅所有錯題（100% 正確 / 0 錯題），週日理應無任何週末測驗紀錄
  // 徹底移除不當漏出或複製到週日的週末測驗項目
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i];
    if (!item || !item.date) continue;
    const iDate = normalizeDateStr(item.date);
    const iD = new Date(iDate.replace(/-/g, "/"));
    if (iD.getDay() === 0) {
      const satD = new Date(iD.getFullYear(), iD.getMonth(), iD.getDate() - 1);
      const satKey = satD.getFullYear() + "-" + String(satD.getMonth() + 1).padStart(2, "0") + "-" + String(satD.getDate()).padStart(2, "0");
      const satItem = list.find(s => s && normalizeDateStr(s.date) === satKey && (String(s.taskName || "").includes("週末") || s.isWeekend));
      if (satItem) {
        const satWrongs = Array.isArray(satItem.wrongWords) ? satItem.wrongWords : [];
        if (satWrongs.length === 0 || satItem.rate === "100%") {
          if (String(item.taskName || "").includes("週末") || item.isWeekend) {
            list.splice(i, 1);
          }
        }
      }
    }
  }

  // 清理 localStorage 中不屬於實際指派任務日期的殘留 task_words_* 快取
  const validTaskDates = new Set(
    list.filter(r => r && r.date && r.taskName && r.taskName !== "自主練習" && !String(r.taskName).includes("未指派"))
        .map(r => normalizeDateStr(r.date))
  );
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("task_words_")) {
        const kDate = normalizeDateStr(k.slice("task_words_".length));
        if (kDate && kDate !== todayDash && validTaskDates.size > 0 && !validTaskDates.has(kDate)) {
          keysToRemove.push(k);
        }
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
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
          let expTot = 0;
          if (rec.score && String(rec.score).includes("/")) {
            expTot = parseInt(String(rec.score).split("/")[1], 10) || 0;
          } else if (rec.attempts) {
            expTot = parseInt(rec.attempts, 10) || 0;
          }
          // 防止舊版誤將累積數十個單字寫入單日 5 字任務快取
          if (expTot > 0 && arr.length > expTot * 2 && arr.length > 15) {
            localStorage.removeItem("task_words_" + nDate);
          } else {
            rec.words = arr.map(w => typeof w === "string" ? w : (w.word || w.display || w.w)).filter(Boolean);
          }
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

function isValidEnglishWordStr(w) {
  if (!w || typeof w !== "string") return false;
  const s = w.trim();
  if (!s || /^w\d+$/i.test(s)) return false;
  return /^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/.test(s);
}

const _resolveWordsCache = new Map();
const _dailyPracticeCache = new Map();
let _rawStudentTaskHistCache = null;

export function clearResolveWordsCache() {
  _resolveWordsCache.clear();
  _dailyPracticeCache.clear();
  _rawStudentTaskHistCache = null;
}

function isWeekend(dateStr) {
  if (!dateStr) return false;
  const clean = String(dateStr).trim().split(" ")[0].replace(/-/g, "/");
  const d = new Date(clean);
  const day = d.getDay();
  return day === 0 || day === 6;
}

function resolveTaskWords(record, selectedDate, d) {
  if (!record) return { rawWords: [], wrongList: [], correctList: [], hadCorrectThenWrongList: [] };

  const cacheKey = String(record.date || "") + "|" + String(selectedDate || "") + "|" + String(record.taskName || "") + "|" + String(record.score || "") + "|" + String(record.attempts || "") + "|" + String(record.status || "");
  if (_resolveWordsCache.has(cacheKey)) {
    return _resolveWordsCache.get(cacheKey);
  }

  const normDate = normalizeDateStr(selectedDate || record.date || "");
  const slashDate = normDate.replace(/-/g, "/");
  let pool = [];

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

  // 1. 若 record.words 已有單字陣列
  if (Array.isArray(record.words) && record.words.length > 0) {
    pool = record.words.map(w => typeof w === "string" ? w : (w.word || w.display || w.w)).filter(Boolean);
  }

  // 2. 從 localStorage 專用當日任務單字快取提取 (task_words_YYYY-MM-DD)
  if (pool.length === 0 && normDate) {
    try {
      const raw = localStorage.getItem("task_words_" + normDate) || localStorage.getItem("task_words_" + slashDate);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0) {
          if (!(expectedTotal > 0 && arr.length > expectedTotal * 2 && arr.length > 15)) {
            pool = arr.map(w => typeof w === "string" ? w : (w.word || w.display || w.w)).filter(Boolean);
          }
        }
      }
    } catch(_) {}
  }

  // 3. 從 today_task_summary 提取 (須日期完全相符)
  if (pool.length === 0 && normDate) {
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

  // 4. 從 today_task_in_progress 提取 (須日期完全相符)
  if (pool.length === 0 && normDate) {
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

  // 5. 從 assigned_task / assigned_task_active / assigned_task_backup 提取 (須明確帶有相同日期)
  if (pool.length === 0 && normDate) {
    try {
      const rawAssigned = sessionStorage.getItem("assigned_task") || 
                          localStorage.getItem("assigned_task_active") || 
                          localStorage.getItem("assigned_task_backup");
      if (rawAssigned) {
        const a = JSON.parse(rawAssigned);
        if (a && Array.isArray(a.words) && a.words.length > 0) {
          const aDate = normalizeDateStr(a.date || "");
          if (aDate && aDate === normDate) {
            pool = a.words.map(w => typeof w === "string" ? w : (w.word || w.display || w.w)).filter(Boolean);
          }
        }
      }
    } catch(_) {}
  }

  // 6. 從 student_task_history 其它符合該日期的項目提取
  if (pool.length === 0 && normDate) {
    try {
      const hist = _getCachedRawStudentTaskHistory();
      if (Array.isArray(hist)) {
        const matchItem = hist.find(item => item && normalizeDateStr(item.date) === normDate && Array.isArray(item.words) && item.words.length > 0);
        if (matchItem) {
          pool = matchItem.words.map(w => typeof w === "string" ? w : (w.word || w.display || w.w)).filter(Boolean);
        }
      }
    } catch(_) {}
  }

  // 7. 從 task_summary_YYYY-MM-DD 提取 (每日測驗結算存檔)
  if (pool.length === 0 && normDate) {
    try {
      const rawTS = localStorage.getItem("task_summary_" + normDate) || localStorage.getItem("task_summary_" + slashDate);
      if (rawTS) {
        const ts = JSON.parse(rawTS);
        if (ts && Array.isArray(ts.words) && ts.words.length > 0) {
          pool = ts.words.map(w => typeof w === "string" ? w : (w.word || w.display || w.w)).filter(Boolean);
        }
        if (Array.isArray(ts.wrongWords) && ts.wrongWords.length > 0 && (!record.wrongWords || record.wrongWords.length === 0)) {
          record.wrongWords = ts.wrongWords;
        }
        if (Array.isArray(ts.correctWords) && ts.correctWords.length > 0 && (!record.correctWords || record.correctWords.length === 0)) {
          record.correctWords = ts.correctWords;
        }
      }
    } catch(_) {}
  }

  // 8. 從 weekend_remedy_YYYY-MM-DD 提取 (週末補強測驗存檔)
  if (normDate && (pool.length === 0 || !record.correctWords || record.correctWords.length === 0)) {
    try {
      const dObj = new Date(normDate.replace(/-/g, "/"));
      const day = dObj.getDay();
      if (day === 0 || day === 6) {
        const diff = dObj.getDate() - day + (day === 0 ? -6 : 1);
        const mObj = new Date(dObj.getFullYear(), dObj.getMonth(), diff);
        const monKey = mObj.getFullYear() + "-" + String(mObj.getMonth() + 1).padStart(2, "0") + "-" + String(mObj.getDate()).padStart(2, "0");
        const rawRem = localStorage.getItem("weekend_remedy_" + monKey);
        if (rawRem) {
          const rem = JSON.parse(rawRem);
          if (rem) {
            const corr = day === 6 ? rem.satCorrectWords : rem.sunCorrectWords;
            const wrg = day === 6 ? rem.satWrongWords : rem.sunWrongWords;
            if (Array.isArray(corr) && corr.length > 0) {
              if (!record.correctWords || record.correctWords.length === 0) record.correctWords = corr;
              pool = pool.concat(corr);
            }
            if (Array.isArray(wrg) && wrg.length > 0) {
              if (!record.wrongWords || record.wrongWords.length === 0) record.wrongWords = wrg;
              pool = pool.concat(wrg);
            }
          }
        }
      }
    } catch(_) {}
  }

  // 整理答錯單字並過濾非英文單字之狀態註記（如 (應測單字)、(未完成)、—）
  let wrongList = Array.from(new Set(
    (record.wrongWords || [])
      .map(w => resolveWordStr(w, d).toLowerCase())
      .filter(w => isValidEnglishWordStr(w))
  )).sort((a, b) => a.localeCompare(b));

  pool = pool.map(w => resolveWordStr(w, d).toLowerCase()).filter(w => isValidEnglishWordStr(w));

  if (pool.length === 0 && wrongList.length > 0) {
    pool = [...wrongList];
  }

  const wrongSet = new Set(wrongList.map(w => w.toLowerCase()));
  let rawWords = Array.from(new Set(pool.map(w => String(w).trim().toLowerCase()).filter(Boolean)));
  
  // 若 record 本身有明確記錄 correctWords，優先載入
  const explicitCorrect = (Array.isArray(record.correctWords) ? record.correctWords : [])
    .map(w => resolveWordStr(w, d).toLowerCase())
    .filter(w => isValidEnglishWordStr(w));

  let correctList = [];
  explicitCorrect.forEach(w => {
    if (!wrongSet.has(w) && !correctList.includes(w)) correctList.push(w);
  });
  rawWords.forEach(w => {
    if (!wrongSet.has(w) && !correctList.includes(w)) correctList.push(w);
  });

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
    .filter(w => isValidEnglishWordStr(w));

  const result = { rawWords, wrongList, correctList, hadCorrectThenWrongList };
  _resolveWordsCache.set(cacheKey, result);
  return result;
}

function renderSingleTaskCardHtml(record, selectedDate, d, index = 0, totalCount = 1, hasLoggedInOrFree = false) {
  const { rawWords, wrongList, correctList, hadCorrectThenWrongList } = resolveTaskWords(record, selectedDate, d);

  const scoreVal = record.score || "—";
  const rateVal = formatRatePercentage(record.rate, record.score);
  const statusStr = record.status || "🟢 已完成";

  let taskCorrWords = correctList.length;
  let taskTotWords = (correctList.length + wrongList.length) > 0 ? (correctList.length + wrongList.length) : (rawWords.length || 0);
  if (scoreVal && String(scoreVal).includes("/")) {
    const parts = String(scoreVal).split("/");
    const sCorr = parseInt(parts[0], 10);
    const sTot = parseInt(parts[1], 10);
    if (!isNaN(sTot) && sTot > 0) {
      taskTotWords = sTot;
      if (!isNaN(sCorr)) taskCorrWords = sCorr;
    }
  }

  const answeredSet = new Set([
    ...correctList.map(w => String(w).toLowerCase()),
    ...wrongList.map(w => String(w).toLowerCase())
  ]);
  const unansweredList = rawWords.filter(w => !answeredSet.has(String(w).toLowerCase())).sort((a, b) => a.localeCompare(b));
  const totalAnswered = correctList.length + wrongList.length;

  // 方案 A 關鍵統計：全卷應測總單字數 vs 實際已作答單字數
  const assignedTotWords = (rawWords && rawWords.length > 0) ? rawWords.length : taskTotWords;
  const actualAnswered = totalAnswered > 0 ? totalAnswered : (taskCorrWords + wrongList.length);
  const actualWrong = wrongList.length > 0 ? wrongList.length : Math.max(0, actualAnswered - taskCorrWords);
  const actualUnanswered = (unansweredList && unansweredList.length > 0)
    ? unansweredList.length
    : Math.max(0, assignedTotWords - actualAnswered);
  const hasUnanswered = actualUnanswered > 0 && assignedTotWords > actualAnswered;

  // (A) 實作命中率 (針對有作答題目的答對比例，如 4/5 = 80%)
  const attemptedRate = actualAnswered > 0 ? Math.round((taskCorrWords / actualAnswered) * 100) : 0;
  // (B) 整體得分率 / 總掌握率 (未作答視同 0 分，分母採全卷應測單字數，如 4/20 = 20%)
  const overallScoreRate = assignedTotWords > 0 ? Math.round((taskCorrWords / assignedTotWords) * 100) : 0;

  const taskRate = hasUnanswered ? overallScoreRate : (taskTotWords > 0 ? Math.round((taskCorrWords / taskTotWords) * 100) : (parseInt(rateVal) || 0));

  // 核心完成判定：只要狀態明確為已完成、或得分顯示已滿/完成、或答題數已達標
  const hasFinishedStatus = statusStr.includes("已完成") || statusStr.includes("● 已完成") || statusStr.includes("🟢 已完成") || (record.completed === true) || (record.alreadyCompleted === true);
  const isFinishedScore = (!hasUnanswered && taskTotWords > 0 && taskCorrWords + wrongList.length >= taskTotWords) ||
                          (!hasUnanswered && taskTotWords > 0 && taskRate === 100) ||
                          (!hasUnanswered && totalAnswered >= taskTotWords && taskTotWords > 0) ||
                          (!hasUnanswered && taskTotWords > 0 && totalAnswered > 0 && unansweredList.length === 0 && !statusStr.includes("未受測") && !statusStr.includes("中斷") && !statusStr.includes("作答中"));
  const isExplicitlyNotFinished = hasUnanswered || statusStr.includes("未受測") || statusStr.includes("中斷") || statusStr.includes("作答中") || statusStr.includes("未完成") || scoreVal === "—" || scoreVal === "尚未開始" || record.inProgress === true;

  const isFinished = (hasFinishedStatus || isFinishedScore) && !isExplicitlyNotFinished;

  // 核心中斷判定：已作答但未答滿全部題目（例如 20 題只答 5 題），必須實際有作答 (actualAnswered > 0)
  const isPartialAttempt = (actualAnswered > 0 && hasUnanswered) || (totalAnswered > 0 && taskTotWords > 0 && totalAnswered < taskTotWords) || (unansweredList.length > 0 && totalAnswered > 0);
  const isIncomplete = !isFinished && (
    isPartialAttempt ||
    statusStr.includes("作答中") ||
    statusStr.includes("未完成") ||
    statusStr.includes("中斷") ||
    record.inProgress === true
  );

  let displayStatusStr = "";
  let statusColor = "#64748b";
  let statusDesc = "";

  const isExplicitUntestedStatus = statusStr.includes("未受測") || statusStr.includes("缺席") || statusStr.includes("缺考") || statusStr.includes("未作答");
  const isUnassigned = !isExplicitUntestedStatus && ((record.taskName && (record.taskName.includes("未指派") || record.taskName.includes("自主練習") || record.taskName.includes("自由練習"))) || statusStr.includes("未指派"));

  // 核心未受測判定：絕不因為單字清單暫未展開 (totalAnswered === 0) 誤把已完成的測驗判斷為未受測！
  const isUntested = isExplicitUntestedStatus || (!isUnassigned && !isFinished && !isIncomplete && (
    scoreVal === "—" ||
    scoreVal === "尚未開始" ||
    (totalAnswered === 0 && !hasFinishedStatus && taskRate === 0)
  ));

  if (isUnassigned) {
    displayStatusStr = hasLoggedInOrFree ? "當日無指派（已自主練習）" : "當日無指派測驗";
    statusColor = "#64748b";
    statusDesc = hasLoggedInOrFree ? "☕ 當日老師無指派測驗，學生自主練習" : "☕ 當日老師無指派測驗";
  } else if (isIncomplete) {
    displayStatusStr = `作答中斷 (${taskCorrWords}/${assignedTotWords})`;
    statusColor = "#6B21A8";
    statusDesc = "⏳ 測驗中途作答中斷";
  } else if (isFinished) {
    statusColor = "#047857";
    displayStatusStr = "已完成";
  } else if (isUntested) {
    if (hasLoggedInOrFree || statusStr.includes("登入未受測") || statusStr.includes("登入未作答")) {
      displayStatusStr = "登入未受測";
      statusColor = "#16a34a";
      statusDesc = "⚠️ 有登入但未測驗";
    } else {
      displayStatusStr = "缺席未受測";
      statusColor = "#059669";
      statusDesc = "📴 當日無登入紀錄 (缺考)";
    }
  }

  if (!displayStatusStr) {
    displayStatusStr = statusStr || "未受測";
    statusColor = "#64748b";
  }

  let correctContentHtml = "";
  let wrongContentHtml = "";
  let leftBoxClass = "correct-box";
  let leftTitleClass = "correct-title";
  let leftTitleText = `<span class="card-icon-slot" style="color:#10B981; font-weight:900;">✔</span><span>已答對的單字 (${correctList.length} 字)</span>`;
  const isTrulyPerfect = (taskRate >= 100) || (taskTotWords > 0 && taskCorrWords >= taskTotWords && wrongList.length === 0);
  const missedCount = Math.max(0, taskTotWords - taskCorrWords);
  let rightBoxClass = "wrong-box";
  let rightTitleClass = "wrong-title";
  let rightTitleText = wrongList.length > 0 
    ? `<span class="card-icon-slot">❌</span><span>答錯的單字 (${wrongList.length} 字)</span>` 
    : (isTrulyPerfect ? `<span class="card-icon-slot">❌</span><span>答錯的單字 (0 字)</span>` : (missedCount > 0 ? `<span class="card-icon-slot">🔘</span><span>未作答的單字 (${missedCount} 字)</span>` : `<span class="card-icon-slot">❌</span><span>答錯的單字 (0 字)</span>`));

  if (isUnassigned) {
    leftBoxClass = "correct-box";
    leftTitleClass = "correct-title";
    leftTitleText = `<span class="card-icon-slot">☕</span><span>指定測驗說明</span>`;
    correctContentHtml = `
      <div style="display:flex; flex-direction:column; justify-content:flex-start; align-items:flex-start; gap:6px; padding:6px 0; font-size:12.5px; line-height:1.6; width:100%; color:var(--ink2);">
        <div>${hasLoggedInOrFree ? "當日老師未指派測驗任務，學生已主動完成自由自主練習！" : "當日老師未指派測驗任務，無須受測。"}</div>
      </div>
    `;
    rightBoxClass = "untested-box";
    rightTitleClass = "untested-title";
    rightTitleText = `<span class="card-icon-slot">📋</span><span>指定單字範圍</span>`;
    wrongContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（當日無指定單字）</span>`;
  } else if (isUntested) {
    leftBoxClass = "wrong-box advice-box";
    leftTitleClass = "wrong-title advice-title";
    const statusIcon = hasLoggedInOrFree ? "⚠️" : "📴";
    const statusTitle = hasLoggedInOrFree ? "有登入但未測驗" : "當日無登入紀錄 (缺考)";
    const statusDetail = hasLoggedInOrFree ? "當日有登入進行自由練習，但未完成本次指定測驗。" : "當日無登入紀錄，未進行本次指定測驗。";

    correctContentHtml = `
      <div style="display:flex; flex-direction:column; justify-content:flex-start; align-items:flex-start; gap:8px; padding:6px 0; font-size:12.5px; line-height:1.55; width:100%;">
        <div style="display:flex; align-items:flex-start; gap:6px; width:100%;">
          <span class="card-icon-slot" style="flex-shrink:0; width:18px; text-align:center; line-height:1.55; font-size:13.5px;">${statusIcon}</span>
          <div style="flex:1; min-width:0; line-height:1.55; text-align:left;">
            <b>${statusTitle}</b>。${statusDetail}
          </div>
        </div>
        <div style="display:flex; align-items:flex-start; gap:6px; width:100%; font-size:11.8px; color:var(--ink3);">
          <span class="card-icon-slot" style="flex-shrink:0; width:18px; text-align:center; line-height:1.55; font-size:13.5px;">📌</span>
          <div style="flex:1; min-width:0; line-height:1.55; text-align:left;">
            提醒：未測驗之指定單字將自動排入週末補強測驗。
          </div>
        </div>
      </div>
    `;

    rightBoxClass = "untested-box";
    rightTitleClass = "untested-title";
    rightTitleText = `<span class="card-icon-slot">📋</span><span>本次應測單字範圍 ${taskTotWords > 0 ? `(${taskTotWords} 字)` : (rawWords.length > 0 ? `(${rawWords.length} 字)` : "")}</span>`;
    if (rawWords.length > 0) {
      wrongContentHtml = rawWords.map(w => `<span class="word-pill-tag neutral" data-word="${w.replace(/"/g, "&quot;")}" style="cursor:pointer;" title="點擊聆聽發音">${w}</span>`).join("");
    } else {
      wrongContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（指派單字載入中或未指定具體單字清單）</span>`;
    }
  } else if (isIncomplete && actualAnswered === 0) {
    leftBoxClass = "wrong-box advice-box";
    leftTitleClass = "wrong-title advice-title";
    leftTitleText = `<span class="card-icon-slot">💡</span><span>測驗作答狀態</span>`;
    correctContentHtml = `
      <div style="display:flex; flex-direction:column; justify-content:flex-start; align-items:flex-start; gap:8px; padding:6px 0; font-size:12.5px; line-height:1.55; width:100%;">
        <div style="display:flex; align-items:flex-start; gap:6px; width:100%;">
          <span class="card-icon-slot" style="flex-shrink:0; width:18px; text-align:center; line-height:1.55; font-size:13.5px;">⏳</span>
          <div style="flex:1; min-width:0; line-height:1.55; text-align:left;">
            <b>尚未開始作答</b>。本次測驗共 ${assignedTotWords} 題，尚未作答任何題目。
          </div>
        </div>
        <div style="display:flex; align-items:flex-start; gap:6px; width:100%; font-size:11.8px; color:var(--ink3);">
          <span class="card-icon-slot" style="flex-shrink:0; width:18px; text-align:center; line-height:1.55; font-size:13.5px;">📌</span>
          <div style="flex:1; min-width:0; line-height:1.55; text-align:left;">
            提醒：未作答之單字已自動排入週末弱點補強測驗。
          </div>
        </div>
      </div>
    `;

    rightBoxClass = "untested-box";
    rightTitleClass = "untested-title";
    const unansWords = (unansweredList && unansweredList.length > 0) ? unansweredList : rawWords;
    rightTitleText = `<span class="card-icon-slot">🔘</span><span>尚未作答的單字 (${unansWords.length} 字)</span>`;
    if (unansWords.length > 0) {
      wrongContentHtml = unansWords.map(w => `<span class="word-pill-tag neutral" data-word="${w.replace(/"/g, "&quot;")}" style="cursor:pointer;" title="未作答單字 (點擊聆聽發音)">${w}</span>`).join("");
    } else {
      wrongContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（待測單字載入中）</span>`;
    }
  } else if (isIncomplete) {
    leftBoxClass = "correct-box";
    leftTitleClass = "correct-title";
    leftTitleText = `<span class="card-icon-slot" style="color:#10B981; font-weight:900;">✔</span><span>已答對的單字 (${correctList.length} 字)</span>`;
    if (correctList.length > 0) {
      correctContentHtml = correctList.map(w => `<span class="word-pill-tag correct" data-word="${w.replace(/"/g, "&quot;")}" style="cursor:pointer;" title="點擊聆聽發音">${w}</span>`).join("");
    } else {
      correctContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（中途作答中斷，尚未答對單字）</span>`;
    }

    rightBoxClass = "wrong-box";
    rightTitleClass = "wrong-title";
    rightTitleText = `<span class="card-icon-slot">❌</span><span>答錯的單字 (${wrongList.length} 字)</span>`;
    
    let wrongPillsHtml = "";
    if (wrongList.length > 0) {
      wrongPillsHtml = wrongList.map(w => {
        return `<span class="word-pill-tag wrong" data-word="${w.replace(/"/g, "&quot;")}" style="cursor:pointer;" title="點擊聆聽發音">${w}</span>`;
      }).join("");
    }

    let unansAccordionHtml = "";
    if (unansweredList.length > 0) {
      const unansId = `unans-box-${Math.random().toString(36).substr(2, 7)}`;
      const unansPills = unansweredList.map(w => `<span class="word-pill-tag neutral" data-word="${w.replace(/"/g, "&quot;")}" style="cursor:pointer;" title="未測單字 (點擊聆聽發音)">${w}</span>`).join("");
      const unansTopStyle = wrongList.length > 0 ? "margin-top:10px; padding-top:8px; border-top:1px dashed var(--line, rgba(148,163,184,0.25));" : "";
      unansAccordionHtml = `
        <div style="${unansTopStyle} width:100%;">
          <div onclick="const el=document.getElementById('${unansId}'); const arrow=this.querySelector('.accordion-arrow'); if(el){ const isHidden=el.style.display==='none'; el.style.display=isHidden?'flex':'none'; if(arrow) arrow.textContent=isHidden?'▲':'▼'; }" 
               style="cursor:pointer; display:flex; align-items:center; font-size:12px; font-weight:700; color:var(--ink2); padding:4px 0; gap:6px; user-select:none; width:100%;">
            <span class="card-icon-slot">⏳</span>
            <span style="flex:1;">尚有 ${unansweredList.length} 個單字未受測（點擊查看清單）</span>
            <span class="accordion-arrow" style="font-size:10px; color:var(--ink3); margin-left:auto;">▼</span>
          </div>
          <div id="${unansId}" style="display:none; flex-wrap:wrap; gap:6px; margin-top:8px; padding:8px; background:rgba(148,163,184,0.08); border-radius:8px; border:1px solid rgba(148,163,184,0.18);">
            ${unansPills}
          </div>
          <div style="display:flex; align-items:flex-start; font-size:11px; color:var(--ink3); margin-top:5px; line-height:1.45; gap:6px; width:100%; padding:0;">
            <span class="card-icon-slot" style="margin-top:1px;">💡</span>
            <div style="flex:1; display:flex; align-items:flex-start;">
              <span style="white-space:nowrap; flex-shrink:0;">提示：</span>
              <span style="flex:1;">本次測驗中途作答中斷，未完成之單字將自動排入週末補強測驗。</span>
            </div>
          </div>
        </div>
      `;
    }

    wrongContentHtml = `
      <div style="display:flex; flex-direction:column; width:100%;">
        <div style="display:flex; flex-wrap:wrap; gap:6px;">${wrongPillsHtml}</div>
        ${unansAccordionHtml}
      </div>
    `;
  } else {
    // 1. 答對的單字
    if (correctList.length > 0) {
      correctContentHtml = correctList.map(w => `<span class="word-pill-tag correct" data-word="${w.replace(/"/g, "&quot;")}" style="cursor:pointer;" title="點擊聆聽發音">${w}</span>`).join("");
    } else if (isFinished) {
      if (taskCorrWords > 0) {
        correctContentHtml = `<div style="font-size:12.5px; font-weight:700; color:#047857; padding:4px 0;">🎉 本次測驗全數答對（共 ${taskCorrWords} 字），表現完美！</div>`;
      } else {
        correctContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（本次測驗無答對單字）</span>`;
      }
    } else {
      correctContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（測驗待完成，尚未答對單字）</span>`;
    }

    // 2. 答錯的單字與未作答單字
    if (wrongList.length > 0) {
      const normDate = normalizeDateStr(selectedDate);
      const slashDate = normDate.replace(/-/g, "/");
      const dpDay = d && d.dailyPractice && (d.dailyPractice[normDate] || d.dailyPractice[slashDate] || d.dailyPractice[selectedDate]);
      const wrongPills = wrongList.map(w => {
        const isHadCW = (hadCorrectThenWrongList && hadCorrectThenWrongList.includes(w)) ||
                        (record.hadCorrectThenWrong && record.hadCorrectThenWrong.includes(w)) ||
                        (dpDay && dpDay.words && dpDay.words[w] && (dpDay.words[w].hadCorrectThenWrong || (dpDay.words[w].lastResult === "wrong" && dpDay.words[w].correct > 0)));
        if (isHadCW) {
          return `<span class="word-pill-tag warning" data-word="${w.replace(/"/g, "&quot;")}" style="border:1.5px dashed #f59e0b; background:rgba(245,158,11,0.1); color:#b45309; cursor:pointer;" title="當日曾答對，但後續作答時答錯 (點擊聆聽發音)">${w} <small style="font-size:10px; font-weight:700;">(曾對後錯⚠️)</small></span>`;
        }
        return `<span class="word-pill-tag wrong" data-word="${w.replace(/"/g, "&quot;")}" style="cursor:pointer;" title="點擊聆聽發音">${w}</span>`;
      }).join("");

      const remainingUnanswered = (rawWords.length > 0)
        ? rawWords.filter(w => !correctList.includes(String(w).toLowerCase()) && !wrongList.includes(String(w).toLowerCase()))
        : (unansweredList.length > 0 ? unansweredList : []);

      let unansExtraHtml = "";
      if (remainingUnanswered.length > 0) {
        const unansPills = remainingUnanswered.map(w => `<span class="word-pill-tag wrong" data-word="${w.replace(/"/g, "&quot;")}" style="cursor:pointer;" title="未作答單字 (點擊聆聽發音)">${w} <span class="diag-bubble-tag" title="未作答">未作答</span></span>`).join("");
        unansExtraHtml = `
          <div style="margin-top:10px; padding-top:8px; border-top:1px dashed var(--line, rgba(148,163,184,0.25)); width:100%;">
            <div style="font-size:12px; font-weight:700; color:var(--ink2); margin-bottom:6px; display:flex; align-items:center; gap:6px;"><span class="card-icon-slot">🔘</span><span>未作答單字 (${remainingUnanswered.length} 字)：</span></div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">${unansPills}</div>
          </div>
        `;
      }
      wrongContentHtml = `<div style="display:flex; flex-direction:column; width:100%;"><div style="display:flex; flex-wrap:wrap; gap:6px;">${wrongPills}</div>${unansExtraHtml}</div>`;
    } else if (isTrulyPerfect) {
      wrongContentHtml = `<span class="perfect-score-msg">🎉 全數答對，無答錯單字！</span>`;
    } else if (missedCount > 0) {
      const unmastered = (rawWords.length > 0)
        ? rawWords.filter(w => !correctList.includes(String(w).toLowerCase()))
        : (unansweredList.length > 0 ? unansweredList : []);

      if (unmastered.length > 0) {
        rightTitleText = `<span class="card-icon-slot">🔘</span><span>未作答的單字 (${unmastered.length} 字)</span>`;
        wrongContentHtml = unmastered.map(w => {
          return `<span class="word-pill-tag wrong" data-word="${w.replace(/"/g, "&quot;")}" style="cursor:pointer;" title="未作答單字 (點擊聆聽發音)">${w} <span class="diag-bubble-tag" title="未作答">未作答</span></span>`;
        }).join("");
      } else {
        rightTitleText = `<span class="card-icon-slot">🔘</span><span>未作答的單字 (${missedCount} 字)</span>`;
        wrongContentHtml = `
          <div style="display:flex; flex-direction:column; gap:4px; padding:6px 0; font-size:12.5px; line-height:1.55; color:var(--ink2); width:100%;">
            <div>⚠️ 本次測驗施測 <b>${taskTotWords}</b> 字，答對 <b>${taskCorrWords}</b> 字，尚有 <b style="color:var(--ink, #475569); font-weight:800;">${missedCount}</b> 字未作答。</div>
            <div style="display:flex; align-items:flex-start; font-size:11.5px; color:var(--ink3); gap:6px; width:100%;">
              <span class="card-icon-slot" style="margin-top:1px;">📌</span>
              <div style="flex:1; display:flex; align-items:flex-start;">
                <span style="white-space:nowrap; flex-shrink:0;">提醒：</span>
                <span style="flex:1;">未作答之單字已自動排入週末弱點補強測驗。</span>
              </div>
            </div>
          </div>
        `;
      }
    } else {
      wrongContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（目前無答錯單字）</span>`;
    }
  }

  const dateStr = record && record.date ? record.date : (selectedDate || "");
  const isWeekendTask = isWeekend(dateStr) || isWeekend(selectedDate) || String(record.taskName || "").includes("週末") || String(record.taskName || "").includes("消滅戰") || String(record.taskName || "").includes("待攻克") || String(record.taskName || "").includes("雙週");
  let formattedTaskName = "";
  if (isWeekendTask) {
    const cleanDate = formatWeekendTaskDate(dateStr || selectedDate, record.taskName);
    const isBoss = String(record.taskName || "").includes("雙週") || (getBiweeklyCycleInfo(dateStr || selectedDate).isBiweeklyBossWeek);
    formattedTaskName = cleanDate ? `🎯 ${cleanDate} ${isBoss ? "雙週指定單字大消滅戰" : "週末待攻克測驗"}作答紀錄` : (isBoss ? "🎯 雙週指定單字大消滅戰作答紀錄" : "🎯 週末待攻克測驗作答紀錄");
  } else {
    let cleanTaskName = String(record.taskName || "平日指定測驗").trim().replace(/^[📝📑\s]+/, "");
    cleanTaskName = cleanTaskName.replace(/指定單字隨堂測驗/g, "平日指定測驗作答紀錄").replace(/隨堂測驗/g, "測驗結果");
    if (!cleanTaskName || cleanTaskName === "指定測驗" || cleanTaskName === "指定測驗作答紀錄") {
      formattedTaskName = "📝 平日指定測驗作答紀錄";
    } else {
      formattedTaskName = `📝 ${cleanTaskName}`;
    }
  }

  // 當一日內有多個測驗（如補考或多個指定測驗），多個紀錄方塊以邊界線清晰隔開
  const blockStyle = (totalCount > 1 && index > 0)
    ? "margin-top: 18px; padding-top: 16px; border-top: 1.5px dashed var(--line, #E7E9F5);"
    : "";

  let scoreGridHtml = "";
  if (isUnassigned) {
    scoreGridHtml = `
      <div class="task-score-grid">
        <div class="task-score-item">
          <div class="task-score-label">指派情形</div>
          <div class="task-score-val" style="color:var(--ink2); font-size:16px; font-weight:700;">當日無指派</div>
        </div>
        <div class="task-score-item">
          <div class="task-score-label">作答狀態</div>
          <div class="task-score-val" style="color:${statusColor}; font-size:16px; font-weight:800;">${displayStatusStr}</div>
        </div>
      </div>
    `;
  } else if (isUntested) {
    const untestedWordCount = taskTotWords > 0 ? taskTotWords : (rawWords.length || 0);
    scoreGridHtml = `
      <div class="task-score-grid">
        <div class="task-score-item">
          <div class="task-score-label" style="display:flex; align-items:center; justify-content:center; white-space:nowrap;">
            <span>📋 應測單字數</span>
          </div>
          <div class="task-score-val" style="color:#0284c7; display:flex; align-items:center; justify-content:center;">
            <span>${untestedWordCount} 字</span>
          </div>
        </div>
        <div class="task-score-item">
          <div class="task-score-label">測驗狀態</div>
          <div class="task-score-val" style="color:${statusColor}; font-size:17px; font-weight:800;">${displayStatusStr}</div>
        </div>
      </div>
    `;
  } else if (hasUnanswered) {
    const getHeatmapRateClass = (r) => {
      const n = (typeof r === 'number') ? r : (parseInt(r, 10) || 0);
      if (n >= 100) return 'tier-6';
      if (n >= 90) return 'tier-5';
      if (n >= 80) return 'tier-4';
      if (n >= 70) return 'tier-3';
      if (n >= 60) return 'tier-2';
      return 'tier-1';
    };
    const getHeatmapRateColor = (r) => {
      const n = (typeof r === 'number') ? r : (parseInt(r, 10) || 0);
      if (n >= 100) return '#00D2FF';
      if (n >= 90) return '#00B4D8';
      if (n >= 80) return '#38BDF8';
      if (n >= 70) return '#7DD3FC';
      if (n >= 60) return '#93C5FD';
      return '#94A3B8';
    };
    scoreGridHtml = `
      <div class="task-score-grid">
        <div class="task-score-subgrid">
          <div class="task-score-item" style="display:flex; flex-direction:column; justify-content:center; padding:10px 4px;">
            <div class="task-score-label" style="display:flex; align-items:center; justify-content:center; white-space:nowrap; font-size:11px;" title="已答對單字 / 已施測單字">
              <span style="flex:1; text-align:right;">已答對</span>
              <span style="padding:0 2px; opacity:0.6;">/</span>
              <span style="flex:1; text-align:left;">已施測</span>
            </div>
            <div class="task-score-val heat-rate-val ${getHeatmapRateClass(attemptedRate)}" style="display:flex; align-items:center; justify-content:center; color:${actualAnswered > 0 ? getHeatmapRateColor(attemptedRate) : 'var(--ink3)'};">
              <span class="task-score-num-corr" style="flex:1; text-align:right;">${taskCorrWords}</span>
              <span style="padding:0 4px; font-weight:700; color:var(--ink3); opacity:0.6; font-size:18px;">/</span>
              <span class="task-score-num-tot" style="flex:1; text-align:left;">${assignedTotWords}</span>
            </div>
          </div>
          <div class="task-score-item" style="display:flex; flex-direction:column; justify-content:center; padding:10px 4px;">
            <div class="task-score-label" style="display:flex; align-items:center; justify-content:center; white-space:nowrap; font-size:11px;" title="答錯單字 / 未作答單字">
              <span style="flex:1; text-align:right; color:var(--ink2);">答錯</span>
              <span style="padding:0 2px; opacity:0.6;">/</span>
              <span style="flex:1; text-align:left; color:var(--ink2);">未作答</span>
            </div>
            <div class="task-score-val" style="display:flex; align-items:center; justify-content:center;">
              <span style="flex:1; text-align:right; color:${actualWrong > 0 ? '#ef4444' : 'var(--ink3)'};">${actualWrong}</span>
              <span style="padding:0 4px; font-weight:700; color:var(--ink3); opacity:0.6; font-size:18px;">/</span>
              <span style="flex:1; text-align:left; color:${actualUnanswered > 0 ? '#ea580c' : 'var(--ink3)'};">${actualUnanswered}</span>
            </div>
          </div>
        </div>
        <div class="task-score-subgrid">
          <div class="task-score-item" style="display:flex; flex-direction:column; justify-content:center; padding:10px 4px;">
            <div class="task-score-label" style="font-size:11px;" title="實際有作答題目的答對率">作答正確率</div>
            <div class="task-score-val heat-rate-val ${getHeatmapRateClass(attemptedRate)}" style="color:${actualAnswered > 0 ? getHeatmapRateColor(attemptedRate) : 'var(--ink3)'}; font-size:22px; font-weight:800; line-height:1.2;">
              ${actualAnswered > 0 ? attemptedRate + '%' : '—'}
            </div>
          </div>
          <div class="task-score-item" style="display:flex; flex-direction:column; justify-content:center; padding:10px 4px;">
            <div class="task-score-label" style="font-size:11px;" title="以全卷應測總單字數為分母計算之正確率">全卷正確率</div>
            <div class="task-score-val heat-rate-val ${getHeatmapRateClass(overallScoreRate)}" style="color:${getHeatmapRateColor(overallScoreRate)}; font-size:22px; font-weight:800; line-height:1.2;">
              ${overallScoreRate}%
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    const getHeatmapRateClass = (r) => {
      const n = (typeof r === 'number') ? r : (parseInt(r, 10) || 0);
      if (n >= 100) return 'tier-6';
      if (n >= 90) return 'tier-5';
      if (n >= 80) return 'tier-4';
      if (n >= 70) return 'tier-3';
      if (n >= 60) return 'tier-2';
      return 'tier-1';
    };
    const getHeatmapRateColor = (r) => {
      const n = (typeof r === 'number') ? r : (parseInt(r, 10) || 0);
      if (n >= 100) return '#00D2FF';
      if (n >= 90) return '#00B4D8';
      if (n >= 80) return '#38BDF8';
      if (n >= 70) return '#7DD3FC';
      if (n >= 60) return '#93C5FD';
      return '#94A3B8';
    };
    scoreGridHtml = `
      <div class="task-score-grid">
        <div class="task-score-item">
          <div class="task-score-label" style="display:flex; align-items:center; justify-content:center; white-space:nowrap;">
            <span style="flex:1; text-align:right;">已答對單字</span>
            <span style="padding:0 6px; opacity:0.6;">/</span>
            <span style="flex:1; text-align:left;">已施測單字</span>
          </div>
          <div class="task-score-val heat-rate-val ${getHeatmapRateClass(taskRate)}" style="display:flex; align-items:center; justify-content:center; color:${getHeatmapRateColor(taskRate)};">
            <span class="task-score-num-corr" style="flex:1; text-align:right;">${taskCorrWords}</span>
            <span style="padding:0 6px; font-weight:700; color:var(--ink3); opacity:0.6; font-size:18px;">/</span>
            <span class="task-score-num-tot" style="flex:1; text-align:left;">${taskTotWords}</span>
          </div>
        </div>
        <div class="task-score-item">
          <div class="task-score-label">正確率</div>
          <div class="task-score-val heat-rate-val ${getHeatmapRateClass(taskRate)}" style="color:${getHeatmapRateColor(taskRate)}; font-size:22px; font-weight:800;">${taskRate}%</div>
        </div>
      </div>
    `;
  }

  return `
    <div class="task-single-record-block" style="${blockStyle}">
      <div class="task-history-header">
        <div>
          <span class="task-card-title task-title-assigned">${formattedTaskName}</span>
        </div>
      </div>

      ${scoreGridHtml}

      <div class="word-split-grid grid-2">
        <div class="word-split-box ${leftBoxClass}">
          <div class="word-split-title ${leftTitleClass}">
            ${leftTitleText}
          </div>
          <div class="word-split-content">
            ${correctContentHtml}
          </div>
        </div>
        <div class="word-split-box ${rightBoxClass}">
          <div class="word-split-title ${rightTitleClass}">
            ${rightTitleText}
          </div>
          <div class="word-split-content">
            ${wrongContentHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderUntestedTaskCardHtml(info, d) {
  const { taskName = "", assignedWords = [], hasLoggedInOrFree = false, selectedDate = "" } = info || {};
  const isWeekendTask = isWeekend(selectedDate) || String(taskName || "").includes("週末") || String(taskName || "").includes("消滅戰") || String(taskName || "").includes("待攻克");
  let formattedTaskName = "";
  if (isWeekendTask) {
    const cleanDate = formatWeekendTaskDate(selectedDate, taskName);
    formattedTaskName = cleanDate ? `🎯 ${cleanDate} 週末待攻克測驗作答紀錄` : "🎯 週末待攻克測驗作答紀錄";
  } else {
    let cleanTaskName = String(taskName || "平日指定測驗作答紀錄").trim().replace(/^[📝📑\s]+/, "");
    cleanTaskName = cleanTaskName.replace(/指定單字隨堂測驗/g, "平日指定測驗作答紀錄").replace(/隨堂測驗/g, "測驗結果");
    if (!cleanTaskName || cleanTaskName === "指定測驗" || cleanTaskName === "指定測驗作答紀錄") {
      formattedTaskName = "📝 平日指定測驗作答紀錄";
    } else {
      formattedTaskName = `📝 ${cleanTaskName}`;
    }
  }

  const cleanWords = (Array.isArray(assignedWords) ? assignedWords : [])
    .map(w => typeof w === "string" ? w : (w.word || w.display || w.w))
    .filter(Boolean)
    .map(w => resolveWordStr(String(w).trim(), d).toLowerCase())
    .filter(Boolean);

  const wordCount = cleanWords.length || 0;

  let wordsHtml = "";
  if (cleanWords.length > 0) {
    wordsHtml = cleanWords.map(w =>
      `<span class="word-pill-tag neutral" data-word="${w.replace(/"/g, "&quot;")}" style="cursor:pointer;" title="點擊聆聽發音">${w}</span>`
    ).join("");
  } else {
    wordsHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（指派單字載入中或未指定具體單字清單）</span>`;
  }

  const statusColor = hasLoggedInOrFree ? "#16a34a" : "#059669";
  const displayStatusStr = hasLoggedInOrFree ? "登入未受測" : "缺席未受測";

  const statusIcon = hasLoggedInOrFree ? "⚠️" : "📴";
  const statusTitle = hasLoggedInOrFree ? "有登入但未測驗" : "當日無登入紀錄 (缺考)";
  const statusDetail = hasLoggedInOrFree
    ? "當日有登入進行自由練習，但未完成本次指定測驗。"
    : "當日無登入紀錄，未進行本次指定測驗。";

  return `
    <div class="task-single-record-block">
      <div class="task-history-header">
        <div>
          <span class="task-card-title task-title-assigned">${formattedTaskName}</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="status-badge-pill ${hasLoggedInOrFree ? 'warning' : 'warning-rich'}">${displayStatusStr}</span>
        </div>
      </div>

      <div class="task-score-grid">
        <div class="task-score-item">
          <div class="task-score-label" style="display:flex; align-items:center; justify-content:center; white-space:nowrap;">
            <span>📋 應測單字數</span>
          </div>
          <div class="task-score-val" style="color:#0284c7; display:flex; align-items:center; justify-content:center;">
            <span>${wordCount} 字</span>
          </div>
        </div>
        <div class="task-score-item">
          <div class="task-score-label">測驗狀態</div>
          <div class="task-score-val" style="color:${statusColor}; font-size:17px; font-weight:800;">${displayStatusStr}</div>
        </div>
      </div>

      <div class="word-split-grid grid-2">
        <div class="word-split-box wrong-box advice-box">
          <div class="word-split-title wrong-title advice-title">
            <span class="card-icon-slot">💡</span><span>學習提醒</span>
          </div>
          <div class="word-split-content" style="display:flex; flex-direction:column; justify-content:flex-start; align-items:flex-start; gap:8px; padding:6px 0; font-size:12.5px; line-height:1.55; width:100%;">
            <div style="display:flex; align-items:flex-start; gap:6px; width:100%;">
              <span class="card-icon-slot" style="flex-shrink:0; width:18px; text-align:center; line-height:1.55; font-size:13.5px;">${statusIcon}</span>
              <div style="flex:1; min-width:0; line-height:1.55; text-align:left;">
                <b>${statusTitle}</b>。${statusDetail}
              </div>
            </div>
            <div style="display:flex; align-items:flex-start; gap:6px; width:100%; font-size:11.8px; color:var(--ink3);">
              <span class="card-icon-slot" style="flex-shrink:0; width:18px; text-align:center; line-height:1.55; font-size:13.5px;">📌</span>
              <div style="flex:1; min-width:0; line-height:1.55; text-align:left;">
                提醒：未測驗之指定單字將自動排入週末補強測驗。
              </div>
            </div>
          </div>
        </div>
        <div class="word-split-box untested-box">
          <div class="word-split-title untested-title">
            <span class="card-icon-slot">📋</span><span>本次應測單字範圍 ${cleanWords.length > 0 ? `(${cleanWords.length} 字)` : ""}</span>
          </div>
          <div class="word-split-content">
            ${wordsHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildTaskDetailsHtml(records, selectedDate, d, dayStat = null) {
  const list = (Array.isArray(records) ? records : (records ? [records] : []))
    .filter(r => {
      if (!r) return false;
      const st = String(r.status || "");
      const isExpUntested = st.includes("未受測") || st.includes("缺席") || st.includes("缺考") || st.includes("未作答");
      if (isExpUntested) return true;
      return r.taskName && r.taskName !== "自主練習" && !r.taskName.includes("自由練習") && !r.taskName.includes("未指派") && !st.includes("未指派");
    })
    .map(r => {
      const st = String(r.status || "");
      const isExpUntested = st.includes("未受測") || st.includes("缺席") || st.includes("缺考") || st.includes("未作答");
      if (r && isExpUntested && (!r.taskName || r.taskName === "自主練習" || r.taskName.includes("未指派"))) {
        return { ...r, taskName: "每日指定測驗" };
      }
      return r;
    });

  const normDate = normalizeDateStr(selectedDate);

  // 判定是否為週日，且週六已全數消滅錯題（100% / 0 錯題）
  let isSatClearedOnSunday = false;
  const dObjCheck = new Date(normDate.replace(/-/g, "/"));
  if (dObjCheck && dObjCheck.getDay() === 0) {
    const diff = dObjCheck.getDate() - 1; // 週六
    const satObj = new Date(dObjCheck.getFullYear(), dObjCheck.getMonth(), diff);
    const satKey = satObj.getFullYear() + "-" + String(satObj.getMonth() + 1).padStart(2, "0") + "-" + String(satObj.getDate()).padStart(2, "0");
    const mDiff = dObjCheck.getDate() - 6; // 週一
    const mObj = new Date(dObjCheck.getFullYear(), dObjCheck.getMonth(), mDiff);
    const monKey = mObj.getFullYear() + "-" + String(mObj.getMonth() + 1).padStart(2, "0") + "-" + String(mObj.getDate()).padStart(2, "0");

    try {
      const rawRem = localStorage.getItem("weekend_remedy_" + monKey);
      if (rawRem) {
        const rem = JSON.parse(rawRem);
        if (rem && rem.satCompleted && (!rem.satWrongWords || rem.satWrongWords.length === 0)) {
          isSatClearedOnSunday = true;
        }
      }
    } catch(_) {}
    if (!isSatClearedOnSunday) {
      try {
        const rawSum = localStorage.getItem("task_summary_" + satKey);
        if (rawSum) {
          const sum = JSON.parse(rawSum);
          if (sum && sum.completed && (!sum.wrongWords || sum.wrongWords.length === 0)) {
            isSatClearedOnSunday = true;
          }
        }
      } catch(_) {}
    }
  }

  // 若週日且週六已全數消滅，徹底過濾 list 中的週末測驗紀錄
  if (isSatClearedOnSunday) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (String(list[i].taskName || "").includes("週末") || list[i].isWeekend) {
        list.splice(i, 1);
      }
    }
  }

  if (list.length === 0) {
    // 檢查是否有當日已完成的 task_summary 或 weekend_remedy
    try {
      const rawTS = localStorage.getItem("task_summary_" + normDate);
      if (rawTS && !isSatClearedOnSunday) {
        const ts = JSON.parse(rawTS);
        if (ts && ts.completed && ts.taskName && ts.taskName !== "自主練習") {
          list.push({
            date: normDate,
            taskName: ts.taskName,
            score: (ts.score !== undefined && ts.total !== undefined) ? `${ts.score}/${ts.total}` : (ts.score || "已完成"),
            rate: ts.rate || "100%",
            status: "🟢 已完成",
            wrongWords: ts.wrongWords || [],
            words: ts.words || []
          });
        }
      }
    } catch(_) {}

    if (list.length === 0) {
      try {
        const dObj = new Date(normDate.replace(/-/g, "/"));
        const day = dObj.getDay();
        if (day === 0 || day === 6) {
          const diff = dObj.getDate() - day + (day === 0 ? -6 : 1);
          const mObj = new Date(dObj.getFullYear(), dObj.getMonth(), diff);
          const monKey = mObj.getFullYear() + "-" + String(mObj.getMonth() + 1).padStart(2, "0") + "-" + String(mObj.getDate()).padStart(2, "0");
          const rawRem = localStorage.getItem("weekend_remedy_" + monKey);
          if (rawRem) {
            const rem = JSON.parse(rawRem);
            const satClearedAll = rem && rem.satCompleted && (!rem.satWrongWords || rem.satWrongWords.length === 0);
            if (rem && ((day === 6 && rem.satCompleted) || (day === 0 && rem.sunCompleted && !satClearedAll))) {
              const corr = day === 6 ? (rem.satCorrectWords || []) : (rem.sunCorrectWords || []);
              const wrg = day === 6 ? (rem.satWrongWords || []) : (rem.sunWrongWords || []);
              const sc = day === 6 ? rem.satScore : rem.sunScore;
              const rt = day === 6 ? rem.satRate : rem.sunRate;
              const wList = Array.from(new Set([...corr, ...wrg]));
              list.push({
                date: normDate,
                taskName: `🎯 ${formatWeekendTaskDate(normDate)} 週末待攻克測驗作答紀錄`,
                score: sc || (wList.length ? `${corr.length}/${wList.length}` : "已完成"),
                rate: rt || "100%",
                status: "🟢 已完成",
                wrongWords: wrg,
                correctWords: corr,
                words: wList,
                isWeekend: true
              });
            }
          }
        }
      } catch(_) {}
    }
  }

  list.sort((a, b) => {
    const aDone = a && a.status && (a.status.includes("已完成") || a.status.includes("●") || a.status.includes("🟢")) ? 1 : 0;
    const bDone = b && b.status && (b.status.includes("已完成") || b.status.includes("●") || b.status.includes("🟢")) ? 1 : 0;
    return bDone - aDone;
  });

  // 1. 從歷程資料與快取中提取任務名稱與單字清單
  let assignedWords = [];
  let taskName = "";

  const allHist = getCombinedTaskHistory();
  const matchedHist = allHist.find(h => {
    const hd = normalizeDateStr(h && h.date ? h.date : "");
    const st = String((h && h.status) || "");
    const isExpUntested = st.includes("未受測") || st.includes("缺席") || st.includes("缺考") || st.includes("未作答");
    return hd === normDate && (isExpUntested || (h.taskName && h.taskName !== "自主練習" && !String(h.taskName).includes("自由練習") && !String(h.taskName).includes("未指派")));
  });
  if (matchedHist) {
    taskName = matchedHist.taskName || matchedHist.name || "";
    if (Array.isArray(matchedHist.words) && matchedHist.words.length > 0) assignedWords = matchedHist.words;
  }

  if (Array.isArray(window.cachedBackupTaskHistory)) {
    const matched = window.cachedBackupTaskHistory.find(h => {
      const hDate = String(h.date || "").trim().split(" ")[0].replace(/\//g, "-");
      return normalizeDateStr(hDate) === normDate;
    });
    if (matched && matched.taskName && matched.taskName !== "自主練習" && !String(matched.taskName).includes("未指派")) {
      if (!taskName) taskName = matched.taskName || matched.name || "";
      if (assignedWords.length === 0 && Array.isArray(matched.words)) assignedWords = matched.words;
    }
  }

  if (assignedWords.length === 0) {
    try {
      const rawW = localStorage.getItem("task_words_" + normDate) || localStorage.getItem("task_words_" + normDate.replace(/-/g, "/"));
      if (rawW) {
        const pw = JSON.parse(rawW);
        if (Array.isArray(pw) && pw.length > 0) assignedWords = pw;
      }
    } catch(_) {}
  }

  // 2. 判斷學生當天是否有自由練習紀錄
  const freeRec = resolveDailyPracticeRecord(selectedDate, d, records);
  const hasLoggedInOrFree = !!(freeRec && (freeRec.attempts > 0 || freeRec.correct > 0)) || (dayStat && dayStat.statusType === "login_untested");

  // 3. 取得熱力圖狀態與未受測標記
  const stat = dayStat;
  const isStatUntested = stat && (stat.statusType === "login_untested" || stat.statusType === "absent_untested");
  const isUntestedRecord = (Array.isArray(records) && records.some(r => r && r.status && (r.status.includes("未受測") || r.status.includes("缺席") || r.status.includes("未作答")))) ||
                           (!Array.isArray(records) && records && records.status && (records.status.includes("未受測") || records.status.includes("缺席") || records.status.includes("未作答")));
  const isAssigned = isStatUntested || isUntestedRecord || !!taskName || (assignedWords && assignedWords.length > 0);

  if (list.length === 0) {
    if (isAssigned && !isSatClearedOnSunday) {
      return renderUntestedTaskCardHtml({
        taskName: taskName || (normDate.replace(/-/g, "").slice(4) + "指定單字隨堂測驗"),
        assignedWords: assignedWords || [],
        hasLoggedInOrFree: hasLoggedInOrFree,
        selectedDate
      }, d);
    }

    const unassignedTitle = "📝 指定單字測驗";

    return `
      <div class="task-single-record-block">
        <div class="task-history-header">
          <div>
            <span class="task-card-title task-title-assigned">${unassignedTitle}</span>
          </div>
        </div>

        <div class="task-empty-notice-box">
          <div class="task-empty-notice-icon">☕</div>
          <div class="task-empty-notice-title">本日無指定單字測驗</div>
          <div class="task-empty-notice-desc">
            ${isSatClearedOnSunday 
              ? "本週待攻克單字已於週六全數消滅，今日無須再測驗！已全面開放自由闖關升級。" 
              : "老師當天未安排全班指定隨堂測驗。"}
          </div>
        </div>
      </div>
    `;
  }

  return `<div>${list.map((r, idx) => renderSingleTaskCardHtml(r, selectedDate, d, idx, list.length, hasLoggedInOrFree)).join("")}</div>`;
}

function buildFreeDetailsHtml(record, selectedDate, d) {
  if (!record || !record.attempts) {
    const emptyFreeTitle = "🎮 自由練習";
    return `
      <div>
        <div class="task-history-header">
          <div>
            <span class="task-card-title task-title-free">${emptyFreeTitle}</span>
          </div>
        </div>

        <div class="task-empty-notice-box">
          <div class="task-empty-notice-icon">🎮</div>
          <div class="task-empty-notice-title">當日尚無自由練習紀錄</div>
          <div class="task-empty-notice-desc">
            尚未進行自由單字練習或複習。<br>每天動動手指挑戰 10~20 個單字，保持語感與連勝紀錄！
          </div>
        </div>
      </div>
    `;
  }

  const freeTitleText = "🎮 自由練習成果";

  const attempts = record.attempts || 0;
  const correct = record.correct || 0;
  const wrongCount = (record.wrong !== undefined) ? record.wrong : Math.max(0, attempts - correct);

  // 整理當日練習單字清單
  const wordsMap = record.words || {};
  let correctList = [];
  let wrongList = [];

  Object.keys(wordsMap).forEach(k => {
    const info = wordsMap[k];
    const rawW = (typeof info === "object" && info && info.word) ? info.word : k;
    const wName = resolveWordStr(rawW, d).toLowerCase();
    if (!isValidEnglishWordStr(wName)) return;

    const wAtt = (typeof info === "object" && info) ? (info.attempts !== undefined ? info.attempts : (info.a !== undefined ? info.a : 1)) : 1;
    const wCor = (typeof info === "object" && info) ? (info.correct !== undefined ? info.correct : (info.c !== undefined ? info.c : (info.passed ? 1 : 0))) : 1;
    const wWrg = (typeof info === "object" && info) ? (info.wrong !== undefined ? info.wrong : Math.max(0, wAtt - wCor)) : 0;
    const hasWrong = wWrg > 0 || (info && info.lastResult === "wrong");
    const hasCorrect = wCor > 0 || (info && (info.passed || info.lastResult === "correct"));

    if (hasWrong) {
      wrongList.push({
        word: wName,
        attempts: wAtt || 1,
        wrong: wWrg || 1,
        correct: wCor || 0,
        hadCorrectThenWrong: !!(typeof info === "object" && info && (info.hadCorrectThenWrong || (info.lastResult === "wrong" && wCor > 0))),
        lastResult: (typeof info === "object" && info && info.lastResult) ? info.lastResult : ""
      });
    } else if (hasCorrect) {
      correctList.push({
        word: wName,
        attempts: wAtt || 1,
        correct: wCor || 1
      });
    }
  });

  if (wrongList.length === 0 && Array.isArray(record.freeWrongWords) && record.freeWrongWords.length > 0) {
    record.freeWrongWords.forEach(rawW => {
      const wName = resolveWordStr(rawW, d).toLowerCase();
      if (isValidEnglishWordStr(wName) && !wrongList.some(x => x.word === wName) && !correctList.some(x => x.word === wName)) {
        wrongList.push({ word: wName, attempts: 1, wrong: 1, correct: 0, hadCorrectThenWrong: false, lastResult: "wrong" });
      }
    });
  }

  // 若舊版或雲端試算表同步紀錄僅存有統計字數 (如 38 / 42) 而無當日 words 明細映射，自動從已練習單字庫還原對應字數之單字清單
  if (correctList.length === 0 && wrongList.length < wrongCount && attempts > 0) {
    const allWords = ((d && d.allPracticedWords) || []).map(w => ({
      ...w,
      word: resolveWordStr(w.word || w, d).toLowerCase()
    })).filter(w => isValidEnglishWordStr(w.word));

    if (wrongCount > wrongList.length && allWords.length > 0) {
      const needWrong = wrongCount - wrongList.length;
      const wrongCands = allWords.filter(w => (w.wrong > 0 || w.ew) && !wrongList.some(wl => wl.word === w.word));
      wrongCands.sort((a, b) => (b.wrong || 0) - (a.wrong || 0));
      wrongCands.slice(0, needWrong).forEach(w => {
        wrongList.push({ word: w.word, attempts: w.attempts || 1, wrong: w.wrong || 1, correct: w.correct || 0, hadCorrectThenWrong: false, lastResult: "" });
      });
      if (wrongList.length < wrongCount) {
        const remaining = allWords.filter(w => !wrongList.some(wl => wl.word === w.word)).slice(0, wrongCount - wrongList.length);
        remaining.forEach(w => {
          wrongList.push({ word: w.word, attempts: w.attempts || 1, wrong: 1, correct: 0, hadCorrectThenWrong: false, lastResult: "" });
        });
      }
    }
  }
  if (correctList.length === 0 && correct > 0 && attempts > 0) {
    const allWords = ((d && d.allPracticedWords) || []).map(w => ({
      ...w,
      word: resolveWordStr(w.word || w, d).toLowerCase()
    })).filter(w => isValidEnglishWordStr(w.word));

    if (allWords.length > 0) {
      const correctCands = allWords.filter(w => w.correct > 0 && !wrongList.some(wl => wl.word === w.word));
      correctCands.sort((a, b) => (b.correct || 0) - (a.correct || 0));
      correctCands.slice(0, correct).forEach(w => {
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
  const hasWordDetails = (correctList.length + wrongList.length) > 0;
  const totalWords = hasWordDetails
    ? (correctList.length + wrongList.length)
    : attempts;

  // 2. 答對單字數：忽略多次答對，只要有答對就是紀錄 1 個；若曾答錯但最新狀態為答對 (已訂正)，亦計入答對數
  // 嚴格修正：排除曾對後錯 (即最新狀態仍為錯題者)，唯有真正已訂正者 (非 wrong 狀態) 方計入答對數！
  const correctedCount = wrongList.filter(w => {
    const isStillWrong = w.hadCorrectThenWrong || (w.lastResult === "wrong" && w.correct > 0);
    return !isStillWrong && w.correct > 0;
  }).length;
  const correctWords = hasWordDetails
    ? (correctList.length + correctedCount)
    : correct;
  const displayCorrectBoxCount = correctList.length > 0 ? correctList.length : correctWords;
  const displayWrongBoxCount = wrongList.length > 0 ? wrongList.length : Math.max(0, totalWords - correctWords);

  const wordRate = totalWords > 0 ? Math.round((correctWords / totalWords) * 100) : 0;

  let correctContentHtml = "";
  if (correctList.length > 0) {
    correctContentHtml = correctList.map(w => `<span class="word-pill-tag correct" data-word="${w.word.replace(/"/g, "&quot;")}" style="cursor:pointer;" title="點擊聆聽發音">${w.word}</span>`).join("");
  } else if (correctWords > 0) {
    correctContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（當日答對 ${correctWords} 字，早期紀錄僅存統計字數、未記錄個別單字明細）</span>`;
  } else {
    correctContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（當日尚無全對單字）</span>`;
  }

  let wrongContentHtml = "";
  if (wrongList.length > 0) {
    wrongContentHtml = wrongList.map(w => {
      if (w.hadCorrectThenWrong || (w.lastResult === "wrong" && w.correct > 0)) {
        return `<span class="word-pill-tag warning" data-word="${w.word.replace(/"/g, "&quot;")}" style="border:1.5px dashed #f59e0b; background:rgba(245,158,11,0.1); color:#b45309; cursor:pointer;" title="當日曾答對，但後續作答時答錯 (點擊聆聽發音)">${w.word} <small style="font-size:10px; font-weight:700;">(曾對後錯⚠️)</small></span>`;
      } else if (w.correct > 0) {
        return `<span class="word-pill-tag correct" data-word="${w.word.replace(/"/g, "&quot;")}" style="border:1.5px dashed var(--green, #10B981); cursor:pointer;" title="當日曾答錯，已訂正答對 (點擊聆聽發音)">${w.word} <small style="font-size:10px; opacity:0.85;">(已訂正)</small></span>`;
      } else {
        return `<span class="word-pill-tag wrong" data-word="${w.word.replace(/"/g, "&quot;")}" style="cursor:pointer;" title="點擊聆聽發音">${w.word}</span>`;
      }
    }).join("");
  } else if (displayWrongBoxCount > 0) {
    wrongContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（當日答錯 ${displayWrongBoxCount} 字，早期紀錄僅存統計字數、未記錄個別單字明細）</span>`;
  } else {
    wrongContentHtml = `<span class="perfect-score-msg">🎉 太棒了！當日自由練習全數答對，無任何答錯單字！</span>`;
  }

  const freeRateColor = wordRate >= 100 ? "#059669" : (wordRate >= 80 ? "#16a34a" : (wordRate >= 60 ? "#ca8a04" : "#ea580c"));

  return `
    <div>
      <div class="task-history-header">
        <div>
          <span class="task-card-title task-title-free">${freeTitleText}</span>
        </div>
      </div>

      <div class="task-score-grid">
        <div class="task-score-item">
          <div class="task-score-label" style="display:flex; align-items:center; justify-content:center; white-space:nowrap;">
            <span style="flex:1; text-align:right;">答對單字數</span>
            <span style="padding:0 6px; opacity:0.6;">/</span>
            <span style="flex:1; text-align:left;">施測單字數</span>
          </div>
          <div class="task-score-val" style="color:#0284c7; display:flex; align-items:center; justify-content:center;">
            <span style="flex:1; text-align:right;">${correctWords}</span>
            <span style="padding:0 6px; font-weight:700; color:var(--ink3); opacity:0.6; font-size:18px;">/</span>
            <span style="flex:1; text-align:left;">${totalWords}</span>
          </div>
        </div>
        <div class="task-score-item">
          <div class="task-score-label">正確率</div>
          <div class="task-score-val" style="color:${freeRateColor};">${wordRate}%</div>
        </div>
      </div>

      <!-- 將答對的字與答錯的字分成兩個區域（純顯示當日練習狀況，非累積狀況） -->
      <div class="word-split-grid grid-2">
        <!-- 答對的單字區 -->
        <div class="word-split-box correct-box">
          <div class="word-split-title correct-title">
            <span><span style="color:#10B981; font-weight:900; margin-right:4px;">✔</span>已答對的單字 (${displayCorrectBoxCount} 字)</span>
          </div>
          <div class="word-split-content">
            ${correctContentHtml}
          </div>
        </div>

        <!-- 答錯的單字區 -->
        <div class="word-split-box wrong-box">
          <div class="word-split-title wrong-title">
            <span>❌ 答錯的單字 (${displayWrongBoxCount} 字)</span>
          </div>
          <div class="word-split-content">
            ${wrongContentHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}

function _getCachedRawStudentTaskHistory() {
  if (_rawStudentTaskHistCache !== null) return _rawStudentTaskHistCache;
  try {
    const parsed = JSON.parse(localStorage.getItem("student_task_history") || "[]");
    _rawStudentTaskHistCache = Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    _rawStudentTaskHistCache = [];
  }
  return _rawStudentTaskHistCache;
}

function resolveDailyPracticeRecord(dateStr, d, historyList) {
  if (!dateStr) return null;
  const normYMD = normalizeDateStr(dateStr);
  if (_dailyPracticeCache.has(normYMD)) {
    return _dailyPracticeCache.get(normYMD);
  }

  const parts = normYMD.split("-");
  const unpadYMD = (parts.length === 3) ? `${parts[0]}-${parseInt(parts[1], 10)}-${parseInt(parts[2], 10)}` : normYMD;
  const slashYMD = normYMD.replace(/-/g, "/");

  // 先查考 student_task_history 是否有該日自由練習欄位
  let matchedRow = null;
  let thFreeAtt = 0, thFreeCor = 0;
  try {
    const listToScan = _getCachedRawStudentTaskHistory();
    const combinedScan = listToScan.length > 0 ? listToScan : (Array.isArray(historyList) ? historyList : []);
    for (let i = 0; i < combinedScan.length; i++) {
      const item = combinedScan[i];
      if (item && item.date && normalizeDateStr(item.date) === normYMD) {
        matchedRow = item;
        break;
      }
    }
    if (matchedRow) {
      const isSelfRow = (matchedRow.taskName === "自主練習");
      thFreeAtt = parseInt(matchedRow.freeTested !== undefined ? matchedRow.freeTested : (isSelfRow ? matchedRow.attempts : 0)) || 0;
      thFreeCor = parseInt(matchedRow.freeCorrect !== undefined ? matchedRow.freeCorrect : (isSelfRow ? matchedRow.correct : 0)) || 0;
    }
  } catch (_) {}

  // 1. 從 d.dailyPractice 尋找 (採納具有真實當日單字紀錄者)
  const dpMap = (d && d.dailyPractice) || {};
  let rec = dpMap[normYMD] || dpMap[unpadYMD] || dpMap[slashYMD] || dpMap[dateStr] || null;
  let hasRealWords = false;
  let isFabricatedDp = false;
  if (rec && rec.words && typeof rec.words === "object" && Object.keys(rec.words).length > 0) {
    const wVals = Object.values(rec.words).filter(Boolean);
    hasRealWords = wVals.some(w => (
      w.lastResult === "correct" ||
      w.lastResult === "wrong" ||
      w.a !== undefined ||
      w.attempts !== undefined ||
      w.correct !== undefined ||
      w.wrong !== undefined ||
      w.passed !== undefined
    ));
    isFabricatedDp = !hasRealWords;
  }

  if (rec && hasRealWords) {
    const wList = Object.values(rec.words).filter(Boolean);
    const isWordStillWrong = (w) => {
      const wCor = (w.correct !== undefined) ? w.correct : (w.c || 0);
      const wWrg = (w.wrong !== undefined) ? w.wrong : Math.max(0, (w.a || 0) - wCor);
      return w.hadCorrectThenWrong || (w.lastResult === 'wrong' && wCor > 0) || (w.lastResult === 'wrong') || (wWrg > 0 && wCor === 0);
    };
    const isWordCurrentlyCorrect = (w) => {
      const wCor = (w.correct !== undefined) ? w.correct : (w.c || 0);
      return !isWordStillWrong(w) && (w.lastResult === 'correct' || wCor > 0 || w.passed);
    };
    const att = wList.length;
    const cor = wList.filter(isWordCurrentlyCorrect).length;
    const res = {
      date: normYMD,
      attempts: att,
      correct: cor,
      wrong: Math.max(0, att - cor),
      words: rec.words,
      freeWrongWords: (matchedRow && Array.isArray(matchedRow.freeWrongWords)) ? matchedRow.freeWrongWords : []
    };
    _dailyPracticeCache.set(normYMD, res);
    return res;
  }

  // 2. 若試算表有明確自由練習字數 (thFreeAtt > 0)
  if (thFreeAtt > 0) {
    const res = {
      date: normYMD,
      attempts: thFreeAtt,
      correct: thFreeCor,
      wrong: Math.max(0, thFreeAtt - thFreeCor),
      words: {},
      freeWrongWords: (matchedRow && Array.isArray(matchedRow.freeWrongWords)) ? matchedRow.freeWrongWords : []
    };
    _dailyPracticeCache.set(normYMD, res);
    return res;
  }

  // 若試算表已存在該日紀錄且明確記載自由練習字數為 0，代表無自由練習（不退回受指定測驗污染的 rawHistory）
  if (matchedRow && thFreeAtt === 0) {
    _dailyPracticeCache.set(normYMD, null);
    return null;
  }

  // 3. 從 d.rawHistory 尋找（僅在非虛擬回填且無試算表 0 字紀錄時採計）
  if (!isFabricatedDp) {
    const hMap = (d && d.rawHistory) || {};
    const h = hMap[normYMD] || hMap[unpadYMD] || hMap[slashYMD] || hMap[dateStr] || null;
    if (h) {
      const hAtt = (h.a !== undefined) ? h.a : (h.attempts !== undefined ? h.attempts : 0);
      const hCor = (h.c !== undefined) ? h.c : (h.correct !== undefined ? h.correct : 0);
      if (hAtt > 0) {
        const res = {
          date: normYMD,
          attempts: hAtt,
          correct: hCor,
          wrong: (h.w !== undefined) ? h.w : (h.wrong !== undefined ? h.wrong : Math.max(0, hAtt - hCor)),
          words: (h.words && typeof h.words === "object") ? h.words : {}
        };
        _dailyPracticeCache.set(normYMD, res);
        return res;
      }
    }
  }

  _dailyPracticeCache.set(normYMD, null);
  return null;
}

// ── 取得待攻克單字清單（清楚精準收集平日指定測驗錯題，排除答對題與自由練習錯題，支援雙週週期、切換查看上週與自由練習消除機制） ──
export function getWeekPendingConquerWords(cycleParam = "current") {
  const unfinishedWords = new Set();
  const learnedWords = new Set();
  const cycleInfo = getBiweeklyCycleInfo();
  
  let scanStartStr, scanEndStr;
  if (cycleParam === "previous" || cycleParam === "prevWeek") {
    // 上一週平日 (週一至週五)
    scanStartStr = cycleInfo.prevWeek.monday;
    scanEndStr = cycleInfo.prevWeek.friday;
  } else if (cycleParam === "prevBiweekly") {
    // 上一回完整雙週（跨過去 14 天的兩個平日週）
    const dNow = new Date();
    const day = dNow.getDay();
    const diffToMon = dNow.getDate() - day + (day === 0 ? -6 : 1);
    const twoWeeksAgoMon = new Date(dNow.getFullYear(), dNow.getMonth(), diffToMon - 14);
    const lastWeekFri = new Date(dNow.getFullYear(), dNow.getMonth(), diffToMon - 3);
    const formatD = (dt) => dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
    scanStartStr = formatD(twoWeeksAgoMon);
    scanEndStr = formatD(lastWeekFri);
  } else {
    // 當前週期 (雙週第 1 週為本週，雙週第 2 週為雙週大消滅儲備池)
    scanStartStr = cycleInfo.scanStartStr;
    scanEndStr = cycleInfo.scanEndStr;
  }

  const normalizeCleanWord = (w) => {
    if (!w) return "";
    return String(w).replace(/\(.*?\)/g, "").trim().toLowerCase();
  };

  // 1. 從 student_task_history 讀取當前週期（平日指定任務）
  try {
    const historyList = _getCachedRawStudentTaskHistory();
    if (Array.isArray(historyList)) {
      historyList.forEach(item => {
        if (!item || !item.date) return;
        const iDate = String(item.date).trim().split(" ")[0].replace(/\//g, "-");
        if (iDate >= scanStartStr && iDate <= scanEndStr) {
          // 排除自主練習或自由練習記錄
          const tName = String(item.taskName || "").trim();
          if (tName === "自主練習" || tName.includes("自由練習")) return;

          // 收集此任務已答對的單字，確保答對者絕不誤入待攻克
          const correctSet = new Set();
          if (Array.isArray(item.correctWords)) {
            item.correctWords.forEach(w => {
              const cw = normalizeCleanWord(w);
              if (cw) correctSet.add(cw);
            });
          }

          // A. 明確答錯的單字 (wrongWords)
          if (Array.isArray(item.wrongWords)) {
            item.wrongWords.forEach(w => {
              const cw = normalizeCleanWord(w);
              if (cw && !correctSet.has(cw)) unfinishedWords.add(cw);
            });
          }

          // B. 尚未測驗/缺考 或 中途未作答完的單字
          const status = String(item.status || "");
          const score = String(item.score || "");
          const isTotallyUntested = status.includes("未受測") || status.includes("缺席") || status.includes("缺考") || score === "—" || score === "尚未開始";
          
          if (Array.isArray(item.words)) {
            if (isTotallyUntested && correctSet.size === 0 && (!item.wrongWords || item.wrongWords.length === 0)) {
              // 學生完全未曾作答此指定任務：全數單字列為應測待攻克
              item.words.forEach(w => {
                const cw = normalizeCleanWord(w);
                if (cw) unfinishedWords.add(cw);
              });
            } else if (!isTotallyUntested) {
              // 學生有作答（部分完成）：僅將未作答的題目列入，已答對的絕對排除！
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

  // 2. 從 weekTaskMistakes 讀取本機即時平日指定任務錯題（即時性保證，避免剛做完測驗尚未刷新）
  try {
    const rawMistakes = localStorage.getItem("weekTaskMistakes");
    if (rawMistakes) {
      const map = JSON.parse(rawMistakes);
      for (const dateKey in map) {
        if (dateKey >= scanStartStr && dateKey <= scanEndStr) {
          if (Array.isArray(map[dateKey])) {
            map[dateKey].forEach(w => {
              const cw = normalizeCleanWord(w);
              if (cw) unfinishedWords.add(cw);
            });
          }
        }
      }
    }
  } catch(_) {}

  // 3. 從 todayTaskResult (今日剛完成之指定測驗) 讀取最新錯題，避免即時測驗完電腦沒抓到
  try {
    const rawTodayTask = localStorage.getItem("today_task_result");
    if (rawTodayTask) {
      const todayRes = JSON.parse(rawTodayTask);
      if (todayRes && Array.isArray(todayRes.wrongWords)) {
        todayRes.wrongWords.forEach(w => {
          const cw = normalizeCleanWord(w);
          if (cw) unfinishedWords.add(cw);
        });
      }
    }
  } catch(_) {}

  // 4. 讀取自由練習中「已成功答對消掉」的單字 (remedy_learned_words 與 store/dailyPractice)
  try {
    const rawLearned = localStorage.getItem("remedy_learned_words");
    const learnedList = rawLearned ? JSON.parse(rawLearned) : [];
    if (Array.isArray(learnedList)) {
      learnedList.forEach(w => {
        const cw = normalizeCleanWord(w);
        if (cw) learnedWords.add(cw);
      });
    }
  } catch(_) {}

  try {
    const rawDp = localStorage.getItem("daily_practice_data") || localStorage.getItem("dailyPractice");
    if (rawDp) {
      const dpObj = JSON.parse(rawDp);
      if (dpObj && typeof dpObj === "object") {
        Object.values(dpObj).forEach(day => {
          if (day && day.words) {
            Object.entries(day.words).forEach(([wKey, info]) => {
              if (info && (info.correct > 0 || info.passed) && info.lastResult !== "wrong") {
                const cw = normalizeCleanWord(wKey);
                if (cw) learnedWords.add(cw);
              }
            });
          }
        });
      }
    }
  } catch(_) {}

  return Array.from(unfinishedWords).filter(w => !learnedWords.has(w)).sort();
}

let _lastSummaryWords = null;
function _resolveConquerWordLevel(wordStr, d) {
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

export function buildWeekPendingConquerHtml(words, d = null, cycleParam = _activeConquerCycle) {
  const pendingWords = Array.isArray(words) ? words : getWeekPendingConquerWords(cycleParam);
  const count = pendingWords.length;
  const cycleInfo = getBiweeklyCycleInfo();
  const isPrevious = (cycleParam === "previous");
  const isBoss = cycleInfo.isBiweeklyBossWeek && !isPrevious;

  // Level 1~5 分級標準與特徵對照表 HTML
  const levelStandardPanelHtml = `
    <div class="level-standard-panel">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
        <span style="font-size:12.5px; font-weight:800; color:var(--ink); display:flex; align-items:center; gap:5px;">
          <span>📊</span><span>Level 1~5 單字分級標準與特徵一覽</span>
        </span>
        <span style="font-size:11px; color:var(--ink3);">全書 2,055 字 · 5 大關卡階梯</span>
      </div>
      <div class="level-standard-grid">
        <div class="level-standard-item" style="border-left:3px solid #2FB47C;">
          <div class="level-standard-head" style="color:#2FB47C;"><span>🟢</span><span>Lv.1 入門</span></div>
          <div class="level-standard-sub">約 3.4 字母 · 411 字</div>
          <div class="level-standard-trap">自然拼讀、CVC極短字、單母音、生活高頻詞</div>
        </div>
        <div class="level-standard-item" style="border-left:3px solid #2D9CDB;">
          <div class="level-standard-head" style="color:#2D9CDB;"><span>🔵</span><span>Lv.2 基礎</span></div>
          <div class="level-standard-sub">約 4.7 字母 · 411 字</div>
          <div class="level-standard-trap">短單母音/合音、Magic e、基本長母音、常用字詞</div>
        </div>
        <div class="level-standard-item" style="border-left:3px solid #6C4CE0;">
          <div class="level-standard-head" style="color:#6C4CE0;"><span>🟣</span><span>Lv.3 進階</span></div>
          <div class="level-standard-sub">約 5.2 字母 · 411 字</div>
          <div class="level-standard-trap">雙音節中長字、複合字、弱化母音Schwa、詞類變化</div>
        </div>
        <div class="level-standard-item" style="border-left:3px solid #E8892B;">
          <div class="level-standard-head" style="color:#E8892B;"><span>🟠</span><span>Lv.4 挑戰</span></div>
          <div class="level-standard-sub">約 6.7 字母 · 411 字</div>
          <div class="level-standard-trap">雙子音/不規則母音、不發音字母、抽象觀念與學術名詞</div>
        </div>
        <div class="level-standard-item" style="border-left:3px solid #E0567B;">
          <div class="level-standard-head" style="color:#E0567B;"><span>🔴</span><span>Lv.5 精熟</span></div>
          <div class="level-standard-sub">約 9.0 字母 · 411 字</div>
          <div class="level-standard-trap">多音節長字、字根字首派生、多重拼寫陷阱、高階字彙</div>
        </div>
      </div>
    </div>
  `;

  // 週期選擇導覽列（移入卡片內部）
  const cycleSelectBarHtml = `
    <div class="conquer-cycle-nav-bar" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; padding:8px 12px; background:var(--bar-track, rgba(148,163,184,0.08)); border:1px solid rgba(148,163,184,0.18); border-radius:10px; margin-bottom:4px;">
      <div style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:750; color:var(--ink);">
        <span>📅 查看週次：</span>
        <select id="conquer-cycle-select" class="task-date-selector" style="font-size:12px; padding:3px 8px; border-radius:6px; border:1px solid rgba(148,163,184,0.35); background:var(--card, #fff); color:var(--ink); font-weight:600; cursor:pointer;" title="選擇查看待攻克週次">
          <option value="current" ${cycleParam === 'current' ? 'selected' : ''}>${cycleInfo.isBiweeklyBossWeek ? '本週（雙週大魔王消滅戰）' : '本週（雙週第 1 週平日）'}</option>
          <option value="prevWeek" ${(cycleParam === 'prevWeek' || cycleParam === 'previous') ? 'selected' : ''}>上一週平日測驗</option>
          <option value="prevBiweekly" ${cycleParam === 'prevBiweekly' ? 'selected' : ''}>上一回雙週週期（過去14天）</option>
        </select>
      </div>
      <div class="conquer-cycle-toggle-group" style="display:inline-flex; align-items:center; gap:4px;">
        <button type="button" id="btn-conquer-cycle-current" class="date-nav-btn ${cycleParam === 'current' ? 'active' : ''}" style="font-size:11.5px; padding:3px 8px; border-radius:6px; height:auto; line-height:1.2;">本週</button>
        <button type="button" id="btn-conquer-cycle-prev" class="date-nav-btn ${(cycleParam === 'prevWeek' || cycleParam === 'previous') ? 'active' : ''}" style="font-size:11.5px; padding:3px 8px; border-radius:6px; height:auto; line-height:1.2;" title="查看上一週遺留待攻克單字">上一週</button>
        <button type="button" id="btn-conquer-cycle-biweekly" class="date-nav-btn ${cycleParam === 'prevBiweekly' ? 'active' : ''}" style="font-size:11.5px; padding:3px 8px; border-radius:6px; height:auto; line-height:1.2;" title="查看上一回雙週（過去14天）所有待攻克單字">上一回雙週</button>
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
      <div class="week-conquer-wrap" style="display:flex; flex-direction:column; gap:10px;">
        ${cycleSelectBarHtml}
        ${levelStandardPanelHtml}
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
      </div>
    `;
  }

  // 依五個等級 (Level 1 ~ 5) 分類待攻克單字
  const byLv = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  pendingWords.forEach(w => {
    const lv = _resolveConquerWordLevel(w, d);
    const targetLv = (lv >= 1 && lv <= 5) ? lv : 1;
    byLv[targetLv].push(w);
  });

  const lvFeatures = {
    1: "入門 · 極短字/自然拼讀",
    2: "基礎 · 短合音/Magic e",
    3: "進階 · 雙音節/弱化音Schwa",
    4: "挑戰 · 雙子音/不發音字母",
    5: "精熟 · 多音節/字根字首"
  };

  const levelSectionsHtml = [1, 2, 3, 4, 5].map(lv => {
    const list = byLv[lv] || [];
    const lvDotColor = levelColor(lv);
    const lvTitle = `Level ${lv}「${levelName(lv)}」`;
    const lvFeatureSub = lvFeatures[lv] || "";
    const pillsOrEmpty = list.length > 0
      ? `<div class="conquer-word-list" style="display:flex; flex-wrap:wrap; gap:8px; padding:2px 4px 2px 0; max-height:148px; overflow-y:auto; overscroll-behavior:contain;">${list.map(w => {
          const diag = diagnoseWordMistake(w);
          return `<span class="word-pill-tag conquer-pill" data-word="${w}" style="cursor:pointer;" title="待攻克單字：${diag.desc} (點擊聆聽發音)">${w} <span class="diag-bubble-tag" style="background:${diag.bg}; color:${diag.color}; border:1px solid ${diag.color}40;" title="${diag.desc}">${diag.tag}</span></span>`;
        }).join("")}</div>`
      : `<div style="font-size:12px; color:var(--ink3); font-style:italic; padding:1px 0;">（本關卡目前無待攻克單字）</div>`;

    return `
      <div class="conquer-level-row">
        <div class="conquer-level-head">
          <span style="display:inline-flex; align-items:center; gap:6px;">
            <span style="color:${lvDotColor};">●</span>
            <b>${lvTitle}</b>
            <small style="font-size:11px; font-weight:normal; color:var(--ink3); opacity:0.85;">(${lvFeatureSub})</small>
          </span>
          <span class="conquer-level-count">${list.length} 字</span>
        </div>
        ${pillsOrEmpty}
      </div>
    `;
  }).join("");

  const tipText = isPrevious
    ? `檢視<b>上週平日測驗</b>遺留的 <b>${count}</b> 個待攻克單字。在<b>自由練習</b>中只要拼對該單字，系統即判定為已學會並自動移除！`
    : (isBoss
      ? `雙週（第 2 週大消滅週期）累積 <b>${count}</b> 個待攻克單字。在<b>自由練習</b>中只要拼對該單字，系統即判定為已學會並自動移除！<b>自由練習答錯不計入待攻克</b>，週末將進行雙週大魔王消滅戰。`
      : `本週（雙週週期第 1 週）累積 <b>${count}</b> 個待攻克單字。在<b>自由練習</b>中只要拼對該單字，系統即判定為已學會並自動移除！<b>自由練習答錯不計入待攻克</b>，週末未消滅之單字將滾入雙週大魔王儲備池。`);

  return `
    <div class="week-conquer-wrap" style="display:flex; flex-direction:column; gap:10px;">
      ${cycleSelectBarHtml}
      ${levelStandardPanelHtml}
      <div class="week-conquer-tip" style="display:flex; align-items:flex-start; gap:8px; padding:4px 2px 4px; font-size:12.5px; line-height:1.55; color:var(--ink2);">
        <span style="font-size:15px; flex-shrink:0; line-height:1.3;">💡</span>
        <div style="flex:1; line-height:1.55;">
          ${tipText}
        </div>
      </div>
      <div class="conquer-level-groups">
        ${levelSectionsHtml}
      </div>
    </div>
  `;
}

export function updateWeekConquerSection(cycleParam = _activeConquerCycle) {
  _activeConquerCycle = cycleParam;
  const titleEl = $("#week-conquer-title") || $("#week-conquer-card-title");
  const badgeEl = $("#week-conquer-badge");
  const detailsEl = $("#week-conquer-details");
  if (!detailsEl) return;
  const words = getWeekPendingConquerWords(_activeConquerCycle);
  const count = words.length;

  if (titleEl) {
    titleEl.textContent = "待攻克單字 Conquer";
  }

  detailsEl.innerHTML = buildWeekPendingConquerHtml(words, null, _activeConquerCycle);

  // 綁定待攻克內部週次下拉選單及按鈕
  const selectEl = detailsEl.querySelector("#conquer-cycle-select");
  if (selectEl) {
    selectEl.onchange = (e) => {
      updateWeekConquerSection(e.target.value);
    };
  }
  const btnCur = detailsEl.querySelector("#btn-conquer-cycle-current");
  const btnPrev = detailsEl.querySelector("#btn-conquer-cycle-prev");
  const btnBiweekly = detailsEl.querySelector("#btn-conquer-cycle-biweekly");
  if (btnCur) btnCur.onclick = (e) => { e.stopPropagation(); updateWeekConquerSection("current"); };
  if (btnPrev) btnPrev.onclick = (e) => { e.stopPropagation(); updateWeekConquerSection("prevWeek"); };
  if (btnBiweekly) btnBiweekly.onclick = (e) => { e.stopPropagation(); updateWeekConquerSection("prevBiweekly"); };

  // 綁定待攻克單字卡片內部的發音點擊
  detailsEl.querySelectorAll(".word-pill-tag").forEach(pill => {
    pill.onclick = (e) => {
      e.stopPropagation();
      const w = pill.getAttribute("data-word") || pill.textContent || "";
      if (w) sayWord(w);
    };
  });
}

// 暴露至 window，確保在 HTML onclick 或全域呼叫皆能正常執行
if (typeof window !== "undefined") {
  window.updateWeekConquerSection = updateWeekConquerSection;
  window.getWeekPendingConquerWords = getWeekPendingConquerWords;
}

// ---------- summary ----------
let _activeRecordSelectedDate = "";
export function summaryHidden() { return el.summary.hidden; }
export function renderSummary(d) {
  if (d && d.words) _lastSummaryWords = d.words;
  clearResolveWordsCache();
  const lvRows = d.levels
    .map((L) => {
      const totCorr = (L.learn || 0) + (L.prac || 0) + (L.mast || 0);
      return `<tr><td class="st-level-name"><span style="color:${levelColor(L.level)}">●</span> Level ${L.level}「${levelName(L.level)}」</td><td class="st-level-stats"><div class="level-stats-grid"><span class="st-item st-learn"><span class="st-lbl">學習中</span><b class="tnum st-num st-num-learn">${L.learn || 0}</b>字</span><span class="st-sep">/</span><span class="st-item st-prac"><span class="st-lbl">練習中</span><b class="tnum st-num st-num-prac">${L.prac || 0}</b>字</span><span class="st-sep">/</span><span class="st-item st-mast"><span class="st-lbl">精通</span><b class="tnum st-num st-num-mast">${L.mast}</b>字</span><span class="st-sep">/</span><span class="st-item st-total"><span class="st-lbl">共答對</span><b class="tnum st-num st-num-total">${totCorr}</b>字</span></div></td></tr>`;
    })
    .join("");

  const historyList = getCombinedTaskHistory();
  const dailyPracticeMap = d.dailyPractice || {};
  const practiceDates = Array.isArray(d.practiceDates) ? d.practiceDates : [];

  // Pre-index historyList by normalized date -> O(1) lookup for dropdowns, heatmaps, and date switches
  const taskByDateMap = new Map();
  for (let i = 0; i < historyList.length; i++) {
    const item = historyList[i];
    if (item && item.date) {
      const st = String(item.status || "");
      const isExpUntested = st.includes("未受測") || st.includes("缺席") || st.includes("缺考") || st.includes("未作答");
      if (!item.taskName || item.taskName !== "自主練習" || isExpUntested) {
        const nd = normalizeDateStr(item.date);
        if (nd) {
          let arr = taskByDateMap.get(nd);
          if (!arr) { arr = []; taskByDateMap.set(nd, arr); }
          arr.push(item);
        }
      }
    }
  }

  const todayNow = new Date();
  const todayDash = todayNow.getFullYear() + "-" + String(todayNow.getMonth() + 1).padStart(2, "0") + "-" + String(todayNow.getDate()).padStart(2, "0");

  // 建立有紀錄日期選項集合（1:1 比照學習歷程網站，僅納入有實質作答紀錄之日期與今日）
  const dateSet = new Set();
  dateSet.add(todayDash);
  for (const [nd, arr] of taskByDateMap.entries()) {
    if (arr.some(item => {
      const st = String((item && item.status) || "");
      const isExpUntested = st.includes("未受測") || st.includes("缺席") || st.includes("缺考") || st.includes("未作答");
      return isExpUntested || !item.taskName || !String(item.taskName).includes("未指派");
    })) {
      dateSet.add(nd);
    }
  }
  const candidateFreeDates = new Set([
    ...Object.keys(dailyPracticeMap),
    ...Object.keys(d.rawHistory || {}),
    ...practiceDates
  ]);
  candidateFreeDates.forEach(dateStr => {
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
    const hasTodayTask = taskByDateMap.has(todayDash);
    const todayFreeRec = resolveDailyPracticeRecord(todayDash, d, historyList);
    const hasTodayFree = !!(todayFreeRec && todayFreeRec.attempts > 0);
    if (!hasTodayTask && !hasTodayFree && sortedDates.length > 0) {
      const latestActive = sortedDates.find(dt => {
        const hTask = taskByDateMap.has(dt);
        const rFree = resolveDailyPracticeRecord(dt, d, historyList);
        return hTask || (rFree && rFree.attempts > 0);
      });
      if (latestActive) defaultSelectedDate = latestActive;
    }
  }

  const buildOptionLabel = (dateStr) => {
    const isToday = (dateStr === todayDash);
    const tArr = taskByDateMap.get(dateStr);
    const matchedTask = tArr ? tArr.find(item => !item.taskName || !String(item.taskName).includes("未指派")) : null;
    const recFree = resolveDailyPracticeRecord(dateStr, d, historyList);
    
    const freeTestedWords = recFree ? (recFree.attempts || 0) : 0;
    const freeCorrWords = recFree ? (recFree.correct || 0) : 0;

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

  const taskDayStatCache = new Map();

  // 計算「指定測驗作答紀錄」最近 4 週 (28 天) 熱力圖資料與連續/最佳/累計天數 (Memoized O(1))
  const getTaskDayStat = (dateKey) => {
    const norm = normalizeDateStr(dateKey);
    if (taskDayStatCache.has(norm)) return taskDayStatCache.get(norm);

    const tArr = taskByDateMap.get(norm);
    const tRec = (tArr && (tArr.find(r => r && r.status && r.status.includes("已完成")) || tArr.find(r => r && r.score && r.score !== "—" && r.score !== "尚未開始") || tArr[0])) || null;
    const isExplicitUntested = tRec && tRec.status && (tRec.status.includes("未受測") || tRec.status.includes("缺席") || tRec.status.includes("缺考") || tRec.status.includes("未作答"));
    const isUnassignedTask = !tRec || (!isExplicitUntested && (!tRec.taskName || tRec.taskName === "⚪ 未指派" || tRec.taskName === "未指派" || tRec.taskName === "自主練習" || String(tRec.taskName).includes("未指派") || (tRec.status && tRec.status.includes("未指派"))));
    if (isUnassignedTask) {
      const res = {
        a: 0, c: 0, rate: 0,
        statusType: "unassigned",
        statusLabel: "未指派測驗",
        levelClass: "h0",
        badgeTier: "tier-gray"
      };
      taskDayStatCache.set(norm, res);
      return res;
    }

    let tAtt = parseInt(tRec.attempts) || 0;
    let tCor = parseInt(tRec.correct) || 0;
    if (!tAtt && tRec.score && String(tRec.score).includes("/")) {
      const sp = String(tRec.score).split("/");
      tCor = parseInt(sp[0], 10) || 0;
      tAtt = parseInt(sp[1], 10) || 0;
    }

    const statusStr = String(tRec.status || "");
    // 計算單字數量 (wordsCount)
    const resolved = resolveTaskWords(tRec, norm, d);
    const resolvedRaw = resolved.rawWords || [];
    const resolvedCorr = resolved.correctList || [];
    const resolvedWrong = resolved.wrongList || [];
    const resolvedAnsCount = resolvedCorr.length + resolvedWrong.length;
    let taskWordsCount = resolvedRaw.length || (Array.isArray(tRec.words) && tRec.words.length) || tAtt || 5;

    if (!tAtt && resolvedAnsCount > 0) {
      tAtt = resolvedAnsCount;
      tCor = resolvedCorr.length;
    }
    if (resolvedCorr.length > 0) {
      tCor = Math.max(tCor, resolvedCorr.length);
    }
    if (tRec.score && String(tRec.score).includes("/")) {
      const sp = String(tRec.score).split("/");
      const sTot = parseInt(sp[1], 10);
      if (!isNaN(sTot) && sTot > taskWordsCount) taskWordsCount = sTot;
    }
    if (taskWordsCount < resolvedAnsCount) taskWordsCount = resolvedAnsCount;
    if (taskWordsCount < tAtt) taskWordsCount = tAtt;

    // 全卷正確率作為熱力圖依據
    let tRate = taskWordsCount > 0 ? Math.round((tCor / taskWordsCount) * 100) : (tAtt > 0 ? Math.round((tCor / tAtt) * 100) : (parseInt(tRec.rate) || 0));

    // 核心完成判定：只要狀態明確為已完成，或已全數作答完畢
    const isFinished = statusStr.includes("已完成") || (!statusStr.includes("未受測") && !statusStr.includes("尚未開始") && ((tAtt > 0 && tAtt >= taskWordsCount) || (resolvedAnsCount > 0 && resolvedAnsCount >= taskWordsCount)));

    // 核心中斷判定：必須是有實際開始作答 (resolvedAnsCount > 0 或 tAtt > 0)，但未答完總題數且無答錯
    const isUnfinishedAttempt = !isFinished && (
      (taskWordsCount > 0 && resolvedAnsCount > 0 && resolvedAnsCount < taskWordsCount && resolvedWrong.length === 0) ||
      (taskWordsCount > 0 && tAtt > 0 && tAtt < taskWordsCount && resolvedWrong.length === 0)
    );

    // 判定是否為登入作答未完成 (中斷)
    const isIncomplete = !isFinished && (
      isUnfinishedAttempt ||
      statusStr.includes("作答中") ||
      statusStr.includes("中斷") ||
      statusStr.includes("未完成") ||
      tRec.inProgress === true
    );

    // 當日是否有登入或有自由練習
    const freeRec = resolveDailyPracticeRecord(norm, d, historyList);
    const hasLoggedInOrFree = !!(freeRec && freeRec.attempts > 0) || (tRec.freeTested > 0) || statusStr.includes("登入未受測") || statusStr.includes("登入未作答");

    let res;
    if (isFinished) {
      // 依「正確率」計算六階純綠色量級：<60%、60~69%、70~79%、80~89%、90~99%、100%
      const level = tRate < 60 ? 1 : tRate < 70 ? 2 : tRate < 80 ? 3 : tRate < 90 ? 4 : tRate < 100 ? 5 : 6;
      const badgeTier = tRate === 100 ? "tier-green-perfect" : (tRate >= 80 ? "tier-green-high" : (tRate >= 60 ? "tier-green-mid" : "tier-green-low"));
      res = {
        a: tAtt, c: tCor, rate: tRate,
        wordsCount: taskWordsCount,
        statusType: "completed",
        statusLabel: `正確率 ${tRate}%`,
        levelClass: `h${level}`,
        badgeTier: badgeTier
      };
    } else if (isIncomplete) {
      // 登入作答未完成 (方格莫蘭迪柔紫，右側紫底紫框)
      const curCorr = resolvedCorr.length || tCor;
      const curTot = taskWordsCount || tAtt || 5;
      res = {
        a: tAtt, c: tCor, rate: tRate,
        wordsCount: taskWordsCount,
        statusType: "incomplete",
        statusLabel: `作答中斷 (${curCorr}/${curTot})`,
        levelClass: "h-status-purple",
        badgeTier: "tier-status-purple"
      };
    } else if (hasLoggedInOrFree) {
      // 登入未受測 (方格清新綠色，右側綠色框)
      res = {
        a: 0, c: 0, rate: 0,
        wordsCount: taskWordsCount,
        statusType: "login_untested",
        statusLabel: "登入未受測",
        levelClass: "h-status-yellow",
        badgeTier: "tier-status-yellow"
      };
    } else {
      // 缺席未受測 (極致電光翠綠，右側極致電光翠綠發光框)
      res = {
        a: 0, c: 0, rate: 0,
        wordsCount: taskWordsCount,
        statusType: "absent_untested",
        statusLabel: "缺席未受測",
        levelClass: "h-status-red",
        badgeTier: "tier-status-red"
      };
    }
    taskDayStatCache.set(norm, res);
    return res;
  };

  const initialTaskRecords = taskByDateMap.get(defaultSelectedDate) || [];
  const initialTaskDetailsHtml = buildTaskDetailsHtml(initialTaskRecords, defaultSelectedDate, d, getTaskDayStat(defaultSelectedDate));

  const initialFreeRecord = resolveDailyPracticeRecord(defaultSelectedDate, d, historyList);
  const initialFreeDetailsHtml = buildFreeDetailsHtml(initialFreeRecord, defaultSelectedDate, d);

  const nowDt = new Date();
  const taskHeatDays = [];
  for (let i = 27; i >= 0; i--) {
    const dt = new Date(nowDt);
    dt.setDate(dt.getDate() - i);
    const kDash = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
    const stat = getTaskDayStat(kDash);
    taskHeatDays.push({ key: kDash, ...stat });
  }

  const activeTaskDateSet = new Set();
  for (const norm of taskByDateMap.keys()) {
    if (norm && getTaskDayStat(norm).a > 0) activeTaskDateSet.add(norm);
  }
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

  const pendingConquerWords = getWeekPendingConquerWords();
  const conquerCount = pendingConquerWords.length;
  const initialConquerHtml = buildWeekPendingConquerHtml(pendingConquerWords, d);

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
    <div class="subh">🎮 四大練習模式答對單字數</div>
    <div class="mode-stat-grid">
      <div class="mode-stat-card mode-card-listen">
        <div class="mode-stat-title">🎧 聽與拼</div>
        <div class="mode-stat-num">${(d.modeStats?.listen?.c || 0)} 字</div>
        <div class="mode-stat-sub">受測 ${(d.modeStats?.listen?.a || 0)} 字 (${d.modeStats?.listen?.a ? Math.round((d.modeStats.listen.c / d.modeStats.listen.a)*100) : 0}%)</div>
      </div>
      <div class="mode-stat-card mode-card-pick">
        <div class="mode-stat-title">✅ 選拼法</div>
        <div class="mode-stat-num">${(d.modeStats?.pick?.c || 0)} 字</div>
        <div class="mode-stat-sub">受測 ${(d.modeStats?.pick?.a || 0)} 字 (${d.modeStats?.pick?.a ? Math.round((d.modeStats.pick.c / d.modeStats.pick.a)*100) : 0}%)</div>
      </div>
      <div class="mode-stat-card mode-card-scramble">
        <div class="mode-stat-title">🧩 重組</div>
        <div class="mode-stat-num">${(d.modeStats?.scramble?.c || 0)} 字</div>
        <div class="mode-stat-sub">受測 ${(d.modeStats?.scramble?.a || 0)} 字 (${d.modeStats?.scramble?.a ? Math.round((d.modeStats.scramble.c / d.modeStats.scramble.a)*100) : 0}%)</div>
      </div>
      <div class="mode-stat-card mode-card-trap">
        <div class="mode-stat-title">🖍️ 填陷阱</div>
        <div class="mode-stat-num">${(d.modeStats?.trap?.c || 0)} 字</div>
        <div class="mode-stat-sub">受測 ${(d.modeStats?.trap?.a || 0)} 字 (${d.modeStats?.trap?.a ? Math.round((d.modeStats.trap.c / d.modeStats.trap.a)*100) : 0}%)</div>
      </div>
    </div>
    <div class="formula-note-box" style="margin-top:-4px; margin-bottom:14px; font-size:12px; display:flex; align-items:center; gap:8px; padding:10px 14px;">
      <span style="font-size:15px; flex-shrink:0; line-height:1;">💡</span>
      <div style="flex:1; line-height:1.55;"><b>小提示</b>：同一個單字若在不同玩法答對會各自累計，因此四項加總會大於上方的「共答對單字數」。</div>
    </div>

    <!-- 📅 每日作答紀錄（大區塊標題，同等層級） -->
    <div class="subh">📅 每日作答紀錄</div>
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
          <div class="date-nav-btn-group">
            <button type="button" id="btn-date-prev" class="date-nav-btn" title="查看前一天">◀ 前一天</button>
            <button type="button" id="btn-date-today" class="date-nav-btn today-btn" title="切換回今日">📍 今日</button>
            <button type="button" id="btn-date-next" class="date-nav-btn" title="查看後一天">後一天 ▶</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 子標題 1：平日指定測驗 / 週末待攻克測驗作答紀錄 -->
    <div class="subh-child">
      <span id="task-subh-title">${isWeekend(defaultSelectedDate) ? (getBiweeklyCycleInfo(defaultSelectedDate).isBiweeklyBossWeek ? `🎯 ${formatWeekendTaskDate(defaultSelectedDate)} 雙週指定單字大消滅戰作答紀錄` : `🎯 ${formatWeekendTaskDate(defaultSelectedDate)} 週末待攻克測驗作答紀錄`) : "📝 平日指定測驗作答紀錄"}</span>
    </div>
    <div class="task-history-card">
      <div id="task-record-details">
        ${initialTaskDetailsHtml}
      </div>
      <div class="embedded-heatmap-sec">
        <div class="streakline">
          <span>連續 <b>${taskStreak}</b> 天 · 最佳 <b>${taskBest}</b> 天 · 累計練習 <b>${taskTotal}</b> 天 <span class="streak-freeze-badge" onclick="event.stopPropagation(); (typeof window.openStreakFreezeModal==='function') &amp;&amp; window.openStreakFreezeModal();" style="cursor:pointer;" title="連勝守護護盾（點擊查看說明）：偶爾請假缺席時，系統自動消耗 1 個護盾守護連續紀錄！每累積 50 題答對可補充（上限 2 個）。">🛡️ 護盾: <b>${(function(cnt){ return cnt === 0 ? '已用完' : (cnt >= 2 ? '2 個(滿)' : `剩 ${cnt} 個`); })(typeof d.streakFreezes === 'number' ? d.streakFreezes : ((d.history && typeof d.history.streakFreezes === 'number') ? d.history.streakFreezes : 0))}</b></span></span>
          <span id="task-heat-day-info" class="heat-day-info"></span>
        </div>
        <div class="heatmap heatmap-task" id="task-heatmap-grid">${taskHeatDays.map((x, idx) =>
          `<i class="hc ${x.levelClass}" role="button" tabindex="0" aria-label="${x.key}，${x.statusLabel || ''}" data-idx="${idx}" data-key="${x.key}" data-a="${x.a || 0}" data-rate="${x.rate || 0}"></i>`).join("")}</div>
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
          <span>連續 <b>${d.history.streak}</b> 天 · 最佳 <b>${d.history.best}</b> 天 · 累計練習 <b>${d.history.total}</b> 天 <span class="streak-freeze-badge" onclick="event.stopPropagation(); (typeof window.openStreakFreezeModal==='function') &amp;&amp; window.openStreakFreezeModal();" style="cursor:pointer;" title="連勝守護護盾（點擊查看說明）：偶爾請假缺席時，系統自動消耗 1 個護盾守護連續紀錄！每累積 50 題答對可補充（上限 2 個）。">🛡️ 護盾: <b>${(function(cnt){ return cnt === 0 ? '已用完' : (cnt >= 2 ? '2 個(滿)' : `剩 ${cnt} 個`); })(typeof d.streakFreezes === 'number' ? d.streakFreezes : ((d.history && typeof d.history.streakFreezes === 'number') ? d.history.streakFreezes : 0))}</b></span></span>
          <span id="heat-day-info" class="heat-day-info"></span>
        </div>
        <div class="heatmap" id="heatmap-grid">${d.history.days.map((x, idx) =>
          `<i class="hc h${x.level}" role="button" tabindex="0" aria-label="${x.key}，正確率 ${x.rate || 0}%" data-idx="${idx}" data-key="${x.key}" data-a="${x.a || 0}" data-rate="${x.rate || 0}"></i>`).join("")}</div>
        <div class="heat-legend"><b>連續</b>：目前不中斷、每天練習的天數。<br><b>最佳</b>：個人最長連續練習紀錄。<br><b>累計</b>：歷來有練習的總天數。<br><b>熱力圖</b>：顏色越鮮豔代表當天正確率越高（灰色為無練習）。</div>
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
    if (rate === 100) return "heat-day-info tier-green-perfect";
    if (rate >= 80) return "heat-day-info tier-green-high";
    if (rate >= 60) return "heat-day-info tier-green-mid";
    return "heat-day-info tier-green-low";
  };

  // 1. 綁定「指定測驗作答紀錄」純綠色熱力圖與右側小方塊（支援純綠色正確率階層、登入未受測粉紅、缺席紅、未完成紫）
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
    const stat = getTaskDayStat(dateKey);
    taskHeatDayInfoEl.className = `heat-day-info ${stat.badgeTier}`;
    if (stat.statusType === "completed") {
      taskHeatDayInfoEl.innerHTML = `<b>${dateKey}</b> ｜ 正確率 <b>${stat.rate}%</b>`;
    } else {
      taskHeatDayInfoEl.innerHTML = `<b>${dateKey}</b> ｜ <b>${stat.statusLabel}</b>`;
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
    const stat = getTaskDayStat(normDate);
    renderTaskHeatBadgeContent(normDate, stat.a || 0, stat.rate || 0, -1);
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
        const triggerTaskClick = () => {
          if (!isNaN(idx)) {
            pinnedTaskIdx = idx;
            updateTaskHeatDayBadge(idx);
            if (taskHeatDays[idx] && taskHeatDays[idx].key) {
              switchRecordDate(taskHeatDays[idx].key);
            }
          }
        };
        cell.addEventListener("click", triggerTaskClick);
        cell.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            triggerTaskClick();
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
    if (!att || att <= 0) {
      heatDayInfoEl.className = "heat-day-info tier-gray";
      heatDayInfoEl.innerHTML = `<b>${dateKey}</b> ｜ 無練習紀錄`;
    } else {
      const badgeTier = rate === 100 ? "tier-green-perfect" : (rate >= 80 ? "tier-green-high" : (rate >= 60 ? "tier-green-mid" : "tier-green-low"));
      heatDayInfoEl.className = `heat-day-info ${badgeTier}`;
      heatDayInfoEl.innerHTML = `<b>${dateKey}</b> ｜ 正確率 <b>${rate}%</b>`;
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
        const triggerFreeClick = () => {
          if (!isNaN(idx)) {
            pinnedIdx = idx;
            updateHeatDayBadge(idx);
            if (heatDays[idx] && heatDays[idx].key) {
              switchRecordDate(heatDays[idx].key);
            }
          }
        };
        cell.addEventListener("click", triggerFreeClick);
        cell.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            triggerFreeClick();
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

    // 更新快速跳轉選單（若切換至未在清單內的日期，動態顯示當前日期但切換後自動移除臨時無紀錄項）
    const quickSelect = $("#record-quick-dates");
    if (quickSelect) {
      Array.from(quickSelect.options).forEach(opt => {
        if (opt.getAttribute("data-temp-unrecorded") === "1" && opt.value !== targetDate) {
          opt.remove();
        }
      });
      let hasOpt = Array.from(quickSelect.options).some(opt => opt.value === targetDate);
      if (!hasOpt) {
        const newOpt = document.createElement("option");
        newOpt.value = targetDate;
        newOpt.textContent = buildOptionLabel(targetDate);
        newOpt.setAttribute("data-temp-unrecorded", "1");
        quickSelect.appendChild(newOpt);
      }
      if (quickSelect.value !== targetDate) {
        quickSelect.value = targetDate;
      }
    }

    // 更新指定測驗 / 週末攻克測驗次標題與作答紀錄 (支援一日多個測驗/補考)
    const taskSubhTitle = $("#task-subh-title");
    if (taskSubhTitle) {
      taskSubhTitle.textContent = isWeekend(targetDate)
        ? (getBiweeklyCycleInfo(targetDate).isBiweeklyBossWeek ? `🎯 ${formatWeekendTaskDate(targetDate)} 雙週指定單字大消滅戰作答紀錄` : `🎯 ${formatWeekendTaskDate(targetDate)} 週末待攻克測驗作答紀錄`)
        : "📝 平日指定測驗作答紀錄";
    }
    const targetTaskRecords = taskByDateMap.get(targetDate) || [];
    const taskDetailsContainer = $("#task-record-details");
    if (taskDetailsContainer) {
      taskDetailsContainer.innerHTML = buildTaskDetailsHtml(targetTaskRecords, targetDate, d, getTaskDayStat(targetDate));
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

  // 綁定快速跳轉下拉選單 (標準原生 onchange 事件)
  const quickSelect = $("#record-quick-dates");
  if (quickSelect) {
    quickSelect.onchange = (e) => switchRecordDate(e.target.value);
  }

  // 綁定待攻克單字週期切換按鈕事件
  const btnConquerCur = $("#btn-conquer-cycle-current");
  const btnConquerPrev = $("#btn-conquer-cycle-prev");
  const btnConquerBiweekly = $("#btn-conquer-cycle-biweekly");
  if (btnConquerCur) {
    btnConquerCur.onclick = (e) => {
      e.stopPropagation();
      updateWeekConquerSection("current");
    };
  }
  if (btnConquerPrev) {
    btnConquerPrev.onclick = (e) => {
      e.stopPropagation();
      updateWeekConquerSection("prevWeek");
    };
  }
  if (btnConquerBiweekly) {
    btnConquerBiweekly.onclick = (e) => {
      e.stopPropagation();
      updateWeekConquerSection("prevBiweekly");
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
  return formatDateYMD(dt);
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
    if (!isValidEnglishWordStr(wName)) return;

    const wAtt = (typeof info === "object" && info) ? (info.attempts !== undefined ? info.attempts : (info.a !== undefined ? info.a : 1)) : 1;
    const wCor = (typeof info === "object" && info) ? (info.correct !== undefined ? info.correct : (info.c !== undefined ? info.c : (info.passed ? 1 : 0))) : 0;
    const wWrg = (typeof info === "object" && info) ? (info.wrong !== undefined ? info.wrong : Math.max(0, wAtt - wCor)) : 0;
    const hasWrong = wWrg > 0 || (info && (info.lastResult === "wrong" || info.ew));
    const hasCorrect = wCor > 0 || (info && (info.passed || info.lastResult === "correct"));

    if (hasWrong) {
      wrongList.push({
        word: wName,
        correct: wCor || 0,
        wrong: wWrg || 1,
        hadCorrectThenWrong: !!(info && (info.hadCorrectThenWrong || (info.lastResult === "wrong" && wCor > 0))),
        lastResult: (info && info.lastResult) ? info.lastResult : ""
      });
    } else if (hasCorrect) {
      correctList.push({ word: wName, correct: wCor || 1 });
    }
  });

  if (wrongList.length === 0 && Array.isArray(record.freeWrongWords) && record.freeWrongWords.length > 0) {
    record.freeWrongWords.forEach(rawW => {
      const wName = resolveWordStr(rawW, d).toLowerCase();
      if (isValidEnglishWordStr(wName) && !wrongList.some(x => x.word === wName) && !correctList.some(x => x.word === wName)) {
        wrongList.push({ word: wName, correct: 0, wrong: 1, hadCorrectThenWrong: false, lastResult: "wrong" });
      }
    });
  }

  if (correctList.length === 0 && wrongList.length === 0 && attempts > 0) {
    const allWords = ((d && d.allPracticedWords) || []).map(w => ({
      ...w,
      word: resolveWordStr(w.word || w, d).toLowerCase()
    })).filter(w => isValidEnglishWordStr(w.word));

    if (wrongCount > 0 && allWords.length > 0) {
      const wrongCands = allWords.filter(w => (w.wrong > 0 || w.ew));
      wrongCands.sort((a, b) => (b.wrong || 0) - (a.wrong || 0));
      wrongCands.slice(0, wrongCount).forEach(w => wrongList.push({ word: w.word, correct: w.correct || 0, wrong: w.wrong || 1, hadCorrectThenWrong: false, lastResult: "" }));
    }
    if (correct > 0 && allWords.length > 0) {
      const correctCands = allWords.filter(w => w.correct > 0 && !wrongList.some(wl => wl.word === w.word));
      correctCands.sort((a, b) => (b.correct || 0) - (a.correct || 0));
      correctCands.slice(0, correct).forEach(w => correctList.push({ word: w.word, correct: w.correct || 1 }));
    }
  }

  correctList.sort((a, b) => a.word.localeCompare(b.word));
  wrongList.sort((a, b) => a.word.localeCompare(b.word));

  const correctedCount = wrongList.filter(w => {
    const isStillWrong = w.hadCorrectThenWrong || (w.lastResult === "wrong" && w.correct > 0);
    return !isStillWrong && w.correct > 0;
  }).length;
  const totalWords = (correctList.length + wrongList.length) > 0 ? (correctList.length + wrongList.length) : attempts;
  const correctCount = (correctList.length + wrongList.length) > 0 ? (correctList.length + correctedCount) : correct;
  const rate = totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0;

  return {
    correctWords: correctList.map(x => x.word),
    wrongWords: wrongList.map(x => {
      if (x.hadCorrectThenWrong || (x.lastResult === "wrong" && x.correct > 0)) {
        return `${x.word}(曾對後錯⚠️)`;
      } else if (x.correct > 0) {
        return `${x.word}(已訂正)`;
      } else {
        return x.word;
      }
    }),
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
    if (item && item.date) {
      const nd = normalizeDateStr(item.date);
      if (nd) activeDateSet.add(nd);
    }
  });
  if (Array.isArray(window.cachedBackupTaskHistory)) {
    window.cachedBackupTaskHistory.forEach(h => {
      if (h && h.date && h.taskName && h.taskName !== "自主練習" && !String(h.taskName).includes("未指派")) {
        const nd = normalizeDateStr(h.date);
        if (nd) activeDateSet.add(nd);
      }
    });
  }
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
  let periodAssigned = 0;
  let periodWrong = 0;
  let periodUnanswered = 0;
  let periodFreeAttempts = 0;
  let periodFreeCorrect = 0;

  const dailyRecords = targetDates.map(dt => {
    let tRec = historyList.find(item => normalizeDateStr(item.date) === dt && (!item.taskName || item.taskName !== "自主練習")) || null;
    let isUntestedAssigned = false;
    if (!tRec && Array.isArray(window.cachedBackupTaskHistory)) {
      const bTask = window.cachedBackupTaskHistory.find(h => {
        const hDate = String(h.date || "").trim().split(" ")[0].replace(/\//g, "-");
        return normalizeDateStr(hDate) === dt && h.taskName && h.taskName !== "自主練習" && !String(h.taskName).includes("未指派");
      });
      if (bTask) {
        isUntestedAssigned = true;
        const bWords = Array.isArray(bTask.words) ? bTask.words : [];
        tRec = {
          date: dt,
          taskName: bTask.taskName || bTask.name || "每日指定測驗",
          score: "—",
          rate: "—",
          status: "未受測",
          words: bWords,
          wrongWords: []
        };
      }
    }

    const fRec = resolveDailyPracticeRecord(dt, d, historyList);
    const fInfo = _extractFreeWordsForDate(fRec, d);
    const hasFree = fInfo.totalWords > 0;
    if (hasFree) {
      periodFreeDays++;
      periodFreeAttempts += fInfo.totalWords;
      periodFreeCorrect += fInfo.correctCount;
    }

    let hasTask = false, taskName = "無指派測驗", taskStatus = "無紀錄", taskScore = "—", taskRate = "—";
    let isUnassigned = false;
    let taskCorrectWords = [], taskWrongWords = [];
    let tAtt = 0, tCor = 0;
    let assignedTotWords = 0, actualAnswered = 0, actualWrong = 0, actualUnanswered = 0, hasUnanswered = false, overallScoreRate = 0;
    let unansweredWords = [];

    const dtObj = new Date(String(dt).replace(/-/g, "/"));
    const dayNames = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
    const dayOfWeek = dayNames[dtObj.getDay()] || "";

    if (tRec) {
      taskName = tRec.taskName || "每日指定測驗";
      const rawStatus = String(tRec.status || "已完成");
      isUnassigned = taskName.includes("未指派") || rawStatus.includes("未指派") || taskName.includes("自主練習") || taskName.includes("自由練習");
      const hasLoggedInOrFree = hasFree || (tRec.freeTested > 0) || rawStatus.includes("登入未受測") || rawStatus.includes("登入未作答");

      if (isUnassigned) {
        hasTask = true;
        taskName = "⚪ 未指派";
        taskStatus = hasLoggedInOrFree ? "當日無指派（已自主練習）" : "當日無指派測驗";
        taskScore = "—";
        taskRate = "—";
        taskCorrectWords = [];
        taskWrongWords = [];
      } else {
        hasTask = true;
        const resolved = resolveTaskWords(tRec, dt, d);
        taskCorrectWords = resolved.correctList || [];
        taskWrongWords = resolved.wrongList || [];
        tAtt = parseInt(tRec.attempts) || 0;
        tCor = parseInt(tRec.correct) || 0;
        if (!tAtt && String(tRec.score || "").includes("/")) {
          const sp = String(tRec.score).split("/");
          tCor = parseInt(sp[0]) || 0;
          tAtt = parseInt(sp[1]) || 0;
        }
        if (!tAtt && (taskCorrectWords.length + taskWrongWords.length) > 0) {
          tCor = taskCorrectWords.length;
          tAtt = taskCorrectWords.length + taskWrongWords.length;
        }

        const rawWords = Array.isArray(tRec.words) ? tRec.words : [];
        assignedTotWords = rawWords.length > 0 ? rawWords.length : Math.max(tAtt, (taskCorrectWords.length + taskWrongWords.length) || 5);
        actualAnswered = taskCorrectWords.length + taskWrongWords.length;
        actualWrong = taskWrongWords.length;
        actualUnanswered = Math.max(0, assignedTotWords - actualAnswered);
        overallScoreRate = assignedTotWords > 0 ? Math.round((tCor / assignedTotWords) * 100) : (tAtt > 0 ? Math.round((tCor / tAtt) * 100) : 0);

        const isIncomplete = rawStatus.includes("作答中") || rawStatus.includes("中斷") || rawStatus.includes("未完成") || tRec.inProgress === true;
        const isUntested = isUntestedAssigned || rawStatus.includes("未受測") || (!isIncomplete && !rawStatus.includes("已完成") && (tRec.score === "—" || tRec.score === "尚未開始" || rawStatus.includes("待完成")));

        hasUnanswered = actualUnanswered > 0 && !isUntested;

        if (isUntested) {
          taskStatus = hasLoggedInOrFree ? "登入未受測" : "缺席未受測";
          taskScore = "—";
          taskRate = "—";
          taskCorrectWords = [];
          taskWrongWords = [];
          unansweredWords = rawWords;
        } else if (isIncomplete) {
          taskStatus = `作答中斷 (${tCor}/${assignedTotWords})`;
          taskScore = tRec.score || `${tCor}/${assignedTotWords}`;
          taskRate = `${overallScoreRate}%`;
        } else {
          taskStatus = rawStatus.replace(/^[🟢●⏳🟠🟣🟡🔴\s]+/, "") || "已完成";
          taskScore = `${tCor}/${assignedTotWords}`;
          taskRate = `${overallScoreRate}%`;
          periodTaskDone++;
        }

        periodAssigned += assignedTotWords;
        periodWrong += actualWrong;
        periodUnanswered += actualUnanswered;
      }
    }

    const freeAtt = fInfo.totalWords;
    const freeCor = fInfo.correctCount;
    const dayAtt = (tRec ? actualAnswered : 0) + freeAtt;
    const dayCor = tCor + freeCor;
    const dayRate = dayAtt > 0 ? Math.round((dayCor / dayAtt) * 100) : 0;

    if (dayAtt > 0 || hasTask) {
      if (dayAtt > 0) periodActiveDays++;
      periodAttempts += dayAtt;
      periodCorrect += dayCor;
    }

    const taskWrongDetails = taskWrongWords.map(w => ({ word: w, zh: getWordZh(w) || "" }));
    const taskCorrectDetails = taskCorrectWords.map(w => ({ word: w, zh: getWordZh(w) || "" }));
    const unansweredDetails = (unansweredWords || []).map(w => ({ word: w, zh: getWordZh(w) || "" }));
    const freeWrongDetails = (fInfo.wrongWords || []).map(w => ({ word: w, zh: getWordZh(w) || "" }));
    const freeCorrectDetails = (fInfo.correctWords || []).map(w => ({ word: w, zh: getWordZh(w) || "" }));

    return {
      date: dt,
      dayOfWeek,
      totalAttempts: dayAtt,
      totalCorrect: dayCor,
      totalRate: dayRate,
      hasTask,
      isUnassigned,
      taskName,
      taskStatus,
      taskScore,
      taskRate,
      assignedTotWords,
      actualAnswered,
      taskCorrWords: tCor,
      actualWrong,
      actualUnanswered,
      hasUnanswered,
      overallScoreRate,
      taskCorrectWords,
      taskWrongWords,
      taskWrongDetails,
      taskCorrectDetails,
      unansweredWords,
      unansweredDetails,
      hasFree,
      freeAttempts: fInfo.totalWords,
      freeCorrect: fInfo.correctCount,
      freeWrong: Math.max(0, fInfo.totalWords - fInfo.correctCount),
      freeRate: fInfo.rate,
      freeCorrectWords: fInfo.correctWords,
      freeWrongWords: fInfo.wrongWords,
      freeWrongDetails,
      freeCorrectDetails
    };
  });

  const now = new Date();
  const exportTime = `${_formatYMDLocal(now)} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const scopeTitle = (mode === "single" || sDate === eDate) ? `指定日期：${sDate}` : `指定範圍：${sDate} 至 ${eDate}`;
  const fileScopeTag = (mode === "single" || sDate === eDate) ? sDate : `${sDate}_至_${eDate}`;

  const learnCount = d ? (d.levels || []).reduce((acc, L) => acc + (L.learn || 0), 0) : 0;
  const pracCount = d ? (d.levels || []).reduce((acc, L) => acc + (L.prac || 0), 0) : 0;
  const mastCount = d ? (d.levels || []).reduce((acc, L) => acc + (L.mast || 0), 0) : 0;

  const periodAvgRate = periodAssigned > 0 
    ? Math.round((periodCorrect / periodAssigned) * 100) 
    : (periodAttempts > 0 ? Math.round((periodCorrect / periodAttempts) * 100) : 0);

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
      totalAssigned: periodAssigned,
      totalWrong: periodWrong,
      totalUnanswered: periodUnanswered,
      avgRate: periodAvgRate,
      taskDoneCount: periodTaskDone,
      freeActiveDays: periodFreeDays,
      freeTotalAttempts: periodFreeAttempts,
      freeTotalCorrect: periodFreeCorrect
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
    dailyRecords,
    pendingConquerWords: getWeekPendingConquerWords().map(w => {
      const cleanW = String(w || "").trim().toLowerCase();
      const diag = diagnoseWordMistake(cleanW);
      const zh = getWordZh(cleanW) || "";
      const lv = _resolveConquerWordLevel(cleanW, d);
      return {
        word: cleanW,
        zh,
        level: lv,
        tag: diag.tag,
        desc: diag.desc,
        color: diag.color,
        bg: diag.bg
      };
    })
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

function getWordZh(word) {
  if (!word) return "";
  const wLower = String(word).trim().toLowerCase();
  if (!window._wordBankZhMap && Array.isArray(window.WORD_BANK_2000)) {
    window._wordBankZhMap = new Map();
    for (let i = 0; i < window.WORD_BANK_2000.length; i++) {
      window._wordBankZhMap.set(String(window.WORD_BANK_2000[i][0]).toLowerCase(), window.WORD_BANK_2000[i][1]);
    }
  }
  if (window._wordBankZhMap && window._wordBankZhMap.has(wLower)) {
    return window._wordBankZhMap.get(wLower);
  }
  if (window.DICTIONARY && window.DICTIONARY[wLower]) {
    const entry = window.DICTIONARY[wLower];
    return typeof entry === "string" ? entry : (entry.zh || entry.def || "");
  }
  return "";
}

function _generatePedagogicalAdvice(payload) {
  const ps = payload.periodSummary || {};
  const ov = payload.overall || {};
  const avg = ps.avgRate || 0;
  const mast = ov.mast || 0;
  const streak = ov.streak || 0;
  const wrongCount = (payload.uniqueWrongWords || []).length;

  let highlight = "";
  if (avg >= 90) {
    highlight = `該生在評估區間內展現卓越的學習成效，全卷平均正確率高達 ${avg}%，已精通 ${mast} 個核心字彙，聽音辨字與拼寫反應極為敏銳！`;
  } else if (avg >= 80) {
    highlight = `該生單字基礎扎實穩定，全卷平均正確率表現優良（${avg}%），已精通 ${mast} 個核心字彙，整體作答自律且專注。`;
  } else if (avg >= 60) {
    highlight = `該生具備基礎字彙拼讀實力，全卷平均正確率為 ${avg}%。建議每日維持固定複習頻率，以強化單字熟練度。`;
  } else {
    highlight = `該生目前全卷正確率為 ${avg}%，尚有明顯進步空間。建議加強每日測驗的完整作答度，避免中斷提早交卷。`;
  }

  let diagnosis = "";
  if (wrongCount === 0) {
    diagnosis = "本次評估範圍內無任何錯題單字紀錄，各項題型作答穩定度與抗干擾能力極佳！";
  } else {
    diagnosis = `區間內累計出現 ${wrongCount} 個錯題單字，主要特徵包含「形近同音字混淆」及「複合字長字尾拼寫失誤」，建議利用音節分段拆解輔助記憶。`;
  }

  let actionPlan = "";
  if (streak >= 7) {
    actionPlan = `連續學習已達 ${streak} 天，學習毅力令人讚賞！建議持續向進階關卡推進，並定期參加「週末待攻克測驗」以保持滿分紀錄。`;
  } else {
    actionPlan = "建議每週末固定進入「週末待攻克測驗」進行弱點補強，將平日未完成或答錯之單字逐一攻克，穩步邁向 2000 單字全精通！";
  }

  return { highlight, diagnosis, actionPlan };
}

async function _exportRecordToExcel(payload) {
  const fileName = `拼字小特工_使用紀錄_${payload.studentId}_${payload.fileScopeTag}`;

  // 整理不重複錯題庫
  const uniqueWrongMap = new Map();
  payload.dailyRecords.forEach(r => {
    (r.taskWrongWords || []).forEach(w => {
      const clean = String(w).trim().toLowerCase();
      if (clean && !uniqueWrongMap.has(clean)) {
        uniqueWrongMap.set(clean, {
          word: clean,
          zh: getWordZh(clean) || "—",
          taskName: r.taskName || "指定測驗",
          date: r.date || "—",
          tag: "拼寫弱點",
          desc: "需加強拼寫記憶"
        });
      }
    });
    (r.freeWrongWords || []).forEach(w => {
      const clean = String(w).trim().toLowerCase();
      if (clean && !uniqueWrongMap.has(clean)) {
        uniqueWrongMap.set(clean, {
          word: clean,
          zh: getWordZh(clean) || "—",
          taskName: "自由練習",
          date: r.date || "—",
          tag: "自由練習",
          desc: "自由練習答錯"
        });
      }
    });
  });
  payload.uniqueWrongWords = Array.from(uniqueWrongMap.values());
  const advice = _generatePedagogicalAdvice(payload);

  try {
    const XLSX = await _ensureScriptLoaded(
      "XLSX",
      "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
    );
    const wb = XLSX.utils.book_new();

    // ════════════════════════════════════════════════════════════════
    // Sheet 1: 📋 每日學習紀錄表 (家長專用聯絡簿 · 一眼看懂無門檻)
    // ════════════════════════════════════════════════════════════════
    const ws1Data = [
      ["【拼字小特工 · 學生每日單字作答成果紀錄表（家長查閱專用）】"],
      ["學生帳號", payload.studentId, "查閱統計區間", payload.scopeTitle, "製表時間", payload.exportTime],
      [
        "📌 學習活躍天數", `${payload.periodSummary.activeDaysCount} 天`,
        "🎯 學校指定測驗完成", `${payload.periodSummary.taskDoneCount} 次`,
        "⭐ 指定測驗平均成績", `${payload.periodSummary.avgRate}%`,
        "🎮 自由自學練習累積", `${payload.periodSummary.freeTotalAttempts || 0} 題`,
        "❌ 需加強錯題單字", `${payload.uniqueWrongWords.length} 字`
      ],
      [],
      [
        "日期",
        "星期",
        "任務類型 (指定測驗 / 週末攻克 / 自由自學)",
        "測驗成績 (答對題數 / 總題數)",
        "正確率",
        "測驗答錯的單字 (需家長協助叮嚀)",
        "測驗答對的單字 (孩子已熟練學會)",
        "未作答單字",
        "自由自學練習成果 (孩子主動自主練習)",
        "自由練習答錯單字",
        "導師叮嚀與學習診斷 (大白話解說)"
      ]
    ];

    payload.dailyRecords.forEach(r => {
      const isWeekend = (r.dayOfWeek === "週六" || r.dayOfWeek === "週日" || String(r.taskName || "").includes("週末"));
      
      // 1. 任務類型
      let taskType = "☕ 本日無指定任務";
      if (r.hasTask) {
        taskType = isWeekend ? "🎯 週末錯題攻克消滅戰" : "📝 學校每日指定單字測驗";
      } else if (r.hasFree) {
        taskType = "🎮 自由闖關練習 (自學)";
      }

      // 2. 測驗成績 (答對題數 / 總題數)
      let scoreText = "— (無測驗)";
      let rateText = "—";
      if (r.hasTask) {
        if (r.taskStatus.includes("未受測")) {
          scoreText = `🔴 缺席未測驗 (0/${r.assignedTotWords || 5} 題)`;
          rateText = "0%";
        } else if (r.hasUnanswered || r.taskStatus.includes("中斷")) {
          scoreText = `🟣 中途離開 (${r.taskCorrWords || 0}/${r.assignedTotWords || 5} 題)`;
          rateText = `${r.overallScoreRate || 0}%`;
        } else if (r.actualWrong === 0 && (r.taskCorrWords || 0) > 0) {
          scoreText = `🌟 ${r.taskCorrWords} / ${r.assignedTotWords || r.taskCorrWords} 題 (全對！)`;
          rateText = `${r.overallScoreRate || 100}% 🌟`;
        } else {
          scoreText = `${r.taskCorrWords || 0} / ${r.assignedTotWords || 5} 題 (對 ${r.taskCorrWords || 0} 錯 ${r.actualWrong || 0})`;
          rateText = `${r.overallScoreRate || 0}%`;
        }
      }

      // 3. 答錯與答對單字
      const wrongStr = (r.taskWrongDetails && r.taskWrongDetails.length > 0)
        ? r.taskWrongDetails.map(d => `${d.word}${d.zh ? ` (${d.zh})` : ''}`).join(", ") 
        : (r.hasTask ? (r.taskStatus.includes("未受測") ? "未受測" : "🎉 太棒了，全部答對無錯題！") : "—");

      const corrStr = (r.taskCorrectDetails && r.taskCorrectDetails.length > 0)
        ? r.taskCorrectDetails.map(d => `${d.word}${d.zh ? ` (${d.zh})` : ''}`).join(", ") 
        : (r.hasTask ? (r.taskStatus.includes("未受測") ? "未施測" : "無") : "—");

      const unansStr = (r.unansweredDetails && r.unansweredDetails.length > 0)
        ? r.unansweredDetails.map(d => `${d.word}${d.zh ? ` (${d.zh})` : ''}`).join(", ") 
        : (r.hasTask ? (r.hasUnanswered ? `${r.actualUnanswered} 題未作答` : "無 (全部作答完畢)") : "—");

      // 4. 自由自學練習成果
      const freeScoreText = r.hasFree 
        ? `🎮 挑戰 ${r.freeAttempts} 題 (答對 ${r.freeCorrect} 題 / 正確率 ${r.freeRate}%)` 
        : "今日未額外自主練習";

      const freeWrongStr = (r.freeWrongDetails && r.freeWrongDetails.length > 0)
        ? r.freeWrongDetails.map(d => `${d.word}${d.zh ? ` (${d.zh})` : ''}`).join(", ") 
        : (r.hasFree ? "🎉 自由練習全數答對" : "—");

      // 5. 導師叮嚀大白話
      let teacherComment = "";
      if (r.hasTask) {
        if (r.taskStatus.includes("未受測")) {
          teacherComment = "⚠️ 今日有指定單字測驗尚未受測，請家長提醒孩子利用空檔完成。";
        } else if (isWeekend && r.actualWrong === 0 && (r.taskCorrWords || 0) > 0) {
          teacherComment = "🌟 太厲害了！本週弱點錯題已在週六全部消滅，週日可以好好休息放鬆！";
        } else if (!isWeekend && r.actualWrong === 0 && (r.taskCorrWords || 0) > 0) {
          teacherComment = "🎉 太棒了！今日學校指定單字全數過關，記憶力與專注度極佳！";
        } else if (r.actualWrong > 0) {
          teacherComment = `💡 今日答錯 ${r.actualWrong} 字，系統已自動安排至六日「週末消滅戰」加強，請家長多給孩子鼓勵！`;
        } else if (r.hasUnanswered) {
          teacherComment = `⚠️ 尚有 ${r.actualUnanswered} 題未作答完畢，建議提醒孩子答完再交卷喔。`;
        }
      } else if (r.hasFree) {
        teacherComment = "👍 孩子今天主動進行自由練習，自發學習態度非常值得嘉許！";
      } else {
        teacherComment = "☕ 本日無指定測驗，孩子今日適度放鬆休息。";
      }

      ws1Data.push([
        r.date,
        r.dayOfWeek,
        taskType,
        scoreText,
        rateText,
        wrongStr,
        corrStr,
        unansStr,
        freeScoreText,
        freeWrongStr,
        teacherComment
      ]);
    });

    ws1Data.push([]);
    ws1Data.push([
      "【區間整體成果合計】",
      "",
      `活躍練習 ${payload.periodSummary.activeDaysCount} 天`,
      `測驗總成績 ${payload.periodSummary.totalCorrect} / ${payload.periodSummary.totalAssigned || payload.periodSummary.totalAttempts} 題`,
      `平均正確率 ${payload.periodSummary.avgRate}%`,
      `累計錯題 ${payload.periodSummary.totalWrong || 0} 題次`,
      "",
      `未作答 ${payload.periodSummary.totalUnanswered || 0} 題次`,
      `自主練習 ${payload.periodSummary.freeTotalAttempts || 0} 題 (對 ${payload.periodSummary.freeTotalCorrect || 0} 題)`,
      "",
      ""
    ]);

    const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
    ws1["!cols"] = [
      { wch: 13 }, // 日期
      { wch: 8 },  // 星期
      { wch: 26 }, // 任務類型
      { wch: 22 }, // 測驗成績
      { wch: 12 }, // 正確率
      { wch: 38 }, // 測驗答錯的單字
      { wch: 38 }, // 測驗答對的單字
      { wch: 22 }, // 未作答單字
      { wch: 30 }, // 自由自學練習成果
      { wch: 28 }, // 自由練習答錯單字
      { wch: 42 }  // 導師叮嚀與學習診斷
    ];
    XLSX.utils.book_append_sheet(wb, ws1, "每日學習紀錄(家長聯絡簿)");

    // ════════════════════════════════════════════════════════════════
    // Sheet 2: 📊 孩子學習總進度與能力分析 (家長了解孩子成長軌跡)
    // ════════════════════════════════════════════════════════════════
    const ov = payload.overall;
    const ms = ov.modeStats || {};
    const mRate = (m) => (m && m.a > 0) ? `${Math.round((m.c / m.a) * 100)}%` : "0%";
    const getBar = (pct) => {
      const filled = Math.min(10, Math.max(0, Math.round(pct / 10)));
      return "■".repeat(filled) + "□".repeat(10 - filled) + ` ${pct}%`;
    };

    const ws2Data = [
      ["【拼字小特工 · 孩子整體學習進度與英語能力總表】"],
      ["學生帳號", payload.studentId, "評估時間", payload.exportTime],
      [],
      ["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"],
      ["【一、教育部國中小必背 2000 單字 · 總掌握進度】"],
      ["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"],
      ["📚 課程總單字量", `${ov.totalVocab} 字`, "⭐ 已徹底精通單字", `${ov.mast} 字`, "🏆 總單字掌握率", `${Math.round(ov.mast / (ov.totalVocab || 2055) * 100)}%`],
      ["📖 練習熟記中單字", `${ov.prac} 字`, "🌱 初步學習中單字", `${ov.learn} 字`, "✏️ 累計作答總題數", `${ov.attempts} 題`],
      ["🔥 連續登入練習", `${ov.streak} 天`, "🏅 最佳連續紀錄", `${ov.best} 天`, "📅 累計練習天數", `${ov.totalDays} 天`],
      [],
      ["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"],
      ["【二、英語 4 大核心能力指標 (遊戲題型成效)】"],
      ["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"],
      ["能力指標 (遊戲題型)", "練習題數", "答對題數", "正確率", "熟練程度進度條", "這項能力對孩子的重要性 (家長白話解說)"],
      ["🎧 聽音辨字 (聽與拼)", `${(ms.listen && ms.listen.a) || 0} 題`, `${(ms.listen && ms.listen.c) || 0} 題`, mRate(ms.listen), getBar(parseInt(mRate(ms.listen))), "培養英聽敏銳度與自然發音 (Phonics)，聽到發音就能拼出單字"],
      ["✅ 單字辨析 (選拼法)", `${(ms.pick && ms.pick.a) || 0} 題`, `${(ms.pick && ms.pick.c) || 0} 題`, mRate(ms.pick), getBar(parseInt(mRate(ms.pick))), "訓練細心度，分清長得很像的形近字與同音字，避免考試粗心"],
      ["🧩 結構拆解 (單字重組)", `${(ms.scramble && ms.scramble.a) || 0} 題`, `${(ms.scramble && ms.scramble.c) || 0} 題`, mRate(ms.scramble), getBar(parseInt(mRate(ms.scramble))), "培養音節與字母組合邏輯，幫助孩子不死背、輕鬆背長單字"],
      ["🖍️ 陷阱克服 (填空陷阱)", `${(ms.trap && ms.trap.a) || 0} 題`, `${(ms.trap && ms.trap.c) || 0} 題`, mRate(ms.trap), getBar(parseInt(mRate(ms.trap))), "專攻台灣學生最常漏寫的母音盲區與雙寫字母，強化拼寫準度"],
      [],
      ["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"],
      ["【三、教育部／CEFR 分級難度關卡 (Level 1 ~ Level 5)】"],
      ["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"],
      ["關卡難度", "難度名稱", "適合年級 / 難度說明", "掌握進度 (已測/總字數)", "掌握率", "精通⭐字數", "關卡總字數"]
    ];

    const lvGradeDesc = [
      "國小基礎單字 · 奠定日常溝通基石",
      "國小核心單字 · 擴充生活常見詞彙",
      "國中進階單字 · 銜接會考常用句型",
      "國中挑戰單字 · 深入閱讀與多元主題",
      "會考精熟高分單字 · 挑戰滿分與高階閱讀"
    ];

    (ov.levels || []).forEach(L => {
      ws2Data.push([
        `Level ${L.level}`,
        L.name || "",
        lvGradeDesc[L.level - 1] || "分級核心單字",
        `${L.correct || 0} / ${L.total || 0}`,
        `${L.rate || (L.total > 0 ? Math.round(((L.mast || 0) / L.total) * 100) : 0)}%`,
        L.mast || 0,
        L.total || 0
      ]);
    });

    ws2Data.push([]);
    ws2Data.push(["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]);
    ws2Data.push(["【四、導師給家長的指導與陪伴建議】"]);
    ws2Data.push(["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]);
    ws2Data.push(["🌟 孩子的學習優勢", advice.highlight]);
    ws2Data.push(["🔍 錯題弱點特徵", advice.diagnosis]);
    ws2Data.push(["💡 在家陪伴與複習指南", advice.actionPlan]);

    const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
    ws2["!cols"] = [
      { wch: 18 }, { wch: 14 }, { wch: 32 }, { wch: 22 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(wb, ws2, "孩子進度與能力總表");

    // ════════════════════════════════════════════════════════════════
    // Sheet 3: 🎯 本期待攻克單字專區 (可直接列印隨身考)
    // ════════════════════════════════════════════════════════════════
    const conquerList = (payload.pendingConquerWords && payload.pendingConquerWords.length > 0)
      ? payload.pendingConquerWords
      : payload.uniqueWrongWords;

    const ws3Data = [
      ["【拼字小特工 · 本期待攻克單字與弱點特徵清單（可直接列印隨身考）】"],
      ["學生帳號", payload.studentId, "待攻克單字總數", `${conquerList.length} 字`, "整理時間", payload.exportTime],
      ["家長小提示：本清單為平日指定測驗錯題與待補強單字，在自由練習中只要拼對該單字即可自動消滅！建議每天抽考 3~5 個單字，唸中文讓孩子拼英文。"],
      [],
      ["編號", "英文單字", "中文釋義", "所屬關卡", "常錯原因 (弱點標籤)", "弱點特徵解析", "攻克狀態", "在家複習記憶口訣 / 建議"]
    ];

    if (conquerList.length === 0) {
      ws3Data.push(["—", "（太棒了！本期無待攻克單字）", "全部掌握", "—", "無錯題", "平時測驗單字皆已掌握或於自由練習中全數攻克", "已消滅", "表現優秀，請繼續保持！"]);
    } else {
      conquerList.forEach((w, idx) => {
        ws3Data.push([
          idx + 1,
          w.word,
          w.zh || "—",
          w.level ? `Level ${w.level}` : "核心字彙",
          w.tag || "拼寫弱點",
          w.desc || "需加強拼寫記憶",
          "待攻克 (自由練習答對可隨時消滅)",
          "利用自然發音拆音節記憶，系統已自動排入六日週末消滅戰複習"
        ]);
      });
    }

    const ws3 = XLSX.utils.aoa_to_sheet(ws3Data);
    ws3["!cols"] = [
      { wch: 6 },  // 編號
      { wch: 18 }, // 英文單字
      { wch: 22 }, // 中文釋義
      { wch: 14 }, // 所屬關卡
      { wch: 18 }, // 常錯原因
      { wch: 28 }, // 弱點特徵解析
      { wch: 30 }, // 攻克狀態
      { wch: 45 }  // 在家複習記憶口訣
    ];
    XLSX.utils.book_append_sheet(wb, ws3, "待攻克單字清單(可列印)");

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
    const rows = [
      ["日期", "星期", "任務類型", "測驗成績", "正確率", "測驗答錯的單字", "測驗答對的單字", "未作答單字", "自由自學練習成果", "自由練習答錯單字", "導師叮嚀與學習診斷"]
    ];
    payload.dailyRecords.forEach(r => {
      const isWeekend = (r.dayOfWeek === "週六" || r.dayOfWeek === "週日" || String(r.taskName || "").includes("週末"));
      const taskType = r.hasTask ? (isWeekend ? "🎯 週末錯題攻克消滅戰" : "📝 學校每日指定單字測驗") : (r.hasFree ? "🎮 自由闖關練習" : "☕ 本日無指定任務");
      const scoreText = r.hasTask ? (r.taskStatus.includes("未受測") ? `🔴 缺席未測驗` : `${r.taskCorrWords || 0}/${r.assignedTotWords || 5} 題`) : "—";
      const rateText = r.hasTask ? (r.taskStatus.includes("未受測") ? "0%" : `${r.overallScoreRate || 0}%`) : "—";
      const wrongStr = (r.taskWrongDetails && r.taskWrongDetails.length > 0) ? r.taskWrongDetails.map(d => `${d.word}${d.zh ? ` (${d.zh})` : ''}`).join(" ") : (r.hasTask ? "🎉 全數答對無錯題" : "—");
      const corrStr = (r.taskCorrectDetails && r.taskCorrectDetails.length > 0) ? r.taskCorrectDetails.map(d => `${d.word}${d.zh ? ` (${d.zh})` : ''}`).join(" ") : "—";
      const unansStr = (r.unansweredDetails && r.unansweredDetails.length > 0) ? r.unansweredDetails.map(d => `${d.word}${d.zh ? ` (${d.zh})` : ''}`).join(" ") : "無";
      const freeScoreText = r.hasFree ? `挑戰 ${r.freeAttempts} 題 (對 ${r.freeCorrect} 題 / ${r.freeRate}%)` : "未練習";
      const freeWrongStr = (r.freeWrongDetails && r.freeWrongDetails.length > 0) ? r.freeWrongDetails.map(d => `${d.word}${d.zh ? ` (${d.zh})` : ''}`).join(" ") : (r.hasFree ? "🎉 全對" : "—");

      rows.push([
        r.date, r.dayOfWeek, taskType, scoreText, rateText, wrongStr, corrStr, unansStr,
        freeScoreText, freeWrongStr, ""
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
    const isTaskUntested = !r.isUnassigned && r.taskStatus.includes("未受測");

    const taskCorrPills = r.taskCorrectWords.length > 0
      ? r.taskCorrectWords.map(w => `<span style="display:inline-block;padding:2px 6px;margin:2px;border-radius:4px;background:#E4F7EE;color:#1E9A66;border:1px solid rgba(47,180,124,.35);font-size:11px;font-weight:700;">${esc(w)}</span>`).join("")
      : (isTaskUntested ? `<span style="font-size:11px;color:#9AA0BD;">（未施測）</span>` : `<span style="font-size:11px;color:#9AA0BD;">（無答對單字紀錄）</span>`);
    const taskWrongPills = r.taskWrongWords.length > 0
      ? r.taskWrongWords.map(w => {
          return `<span style="display:inline-flex;align-items:center;padding:2px 6px;margin:2px;border-radius:4px;background:#FFE9E9;color:#D64545;border:1px solid rgba(255,107,107,.4);font-size:11px;font-weight:700;">${esc(w)}</span>`;
        }).join("")
      : (isTaskUntested ? `<span style="font-size:11px;color:#9AA0BD;">（未施測無錯題）</span>` : `<span style="font-size:11px;color:#1E9A66;font-weight:700;">${r.hasTask ? "🎉 全數答對無錯題" : "（無錯題紀錄）"}</span>`);

    const freeCorrPills = r.freeCorrectWords.length > 0
      ? r.freeCorrectWords.map(w => `<span style="display:inline-block;padding:2px 6px;margin:2px;border-radius:4px;background:#E4F7EE;color:#1E9A66;border:1px solid rgba(47,180,124,.35);font-size:11px;font-weight:700;">${esc(w)}</span>`).join("")
      : `<span style="font-size:11px;color:#9AA0BD;">（當日無自由練習答對單字）</span>`;
    const freeWrongPills = r.freeWrongWords.length > 0
      ? r.freeWrongWords.map(w => {
          return `<span style="display:inline-flex;align-items:center;padding:2px 6px;margin:2px;border-radius:4px;background:#FFE9E9;color:#D64545;border:1px solid rgba(255,107,107,.4);font-size:11px;font-weight:700;">${esc(w)}</span>`;
        }).join("")
      : `<span style="font-size:11px;color:#1E9A66;font-weight:700;">${r.hasFree ? "🎉 全數答對無錯題" : "（當日無自由練習紀錄）"}</span>`;

    const taskScoreText = (r.hasTask && r.taskScore !== "—" && r.taskScore !== "尚未開始") ? `${esc(r.taskScore)} 字 (${esc(r.taskRate)})` : "—";

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
            <span>📝 指定測驗：${esc(r.isUnassigned ? "⚪ 未指派" : (r.hasTask ? r.taskName : "當日無指派測驗紀錄"))}</span>
            <span style="color:${r.isUnassigned ? '#64748B' : '#0284C7'};">${r.isUnassigned ? `狀態：${esc(r.taskStatus)}` : (r.hasTask ? (isTaskUntested ? `狀態：${esc(r.taskStatus)}（未測驗）` : `狀態：${esc(r.taskStatus)} ｜ 得分：${taskScoreText}`) : "未施測")}</span>
          </div>
          ${(r.hasTask && !r.isUnassigned) ? `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              <div style="background:#F1FBF6; border:1px solid rgba(47,180,124,.3); border-radius:8px; padding:7px 9px;">
                <div style="font-size:11.5px; font-weight:800; color:#065F46; margin-bottom:4px;"><span style="color:#10B981; font-weight:900; margin-right:4px;">✔</span>答對的單字</div>
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
                <div style="font-size:11.5px; font-weight:800; color:#065F46; margin-bottom:4px;"><span style="color:#10B981; font-weight:900; margin-right:4px;">✔</span>答對的單字</div>
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

  const conquerList = payload.pendingConquerWords || [];
  let conquerSectionHtml = "";
  if (conquerList.length === 0) {
    conquerSectionHtml = `
      <div style="border:1px solid #C7F1DC; border-radius:12px; padding:10px 14px; margin-bottom:14px; background:#F0FDF4; page-break-inside:avoid;">
        <div style="font-size:13px; font-weight:800; color:#166534; display:flex; justify-content:space-between; align-items:center;">
          <span>🎯 本期待攻克單字庫（0 字）</span>
          <span style="font-size:11px; background:#DCFCE7; color:#15803D; padding:2px 8px; border-radius:999px; font-weight:800;">🎉 太棒了！目前全數攻克</span>
        </div>
        <div style="font-size:12px; color:#166534; margin-top:4px;">
          平時指定測驗的錯題皆已完全掌握，或已在自由練習中即時答對並全數消滅！請繼續保持！
        </div>
      </div>
    `;
  } else {
    const conquerItemsHtml = conquerList.map(w => {
      return `
        <div style="display:inline-flex; align-items:center; background:#FFF; border:1px solid #FECACA; border-radius:8px; padding:4px 8px; margin:3px 4px 3px 0; font-size:11.5px; vertical-align:middle;">
          <span style="font-weight:800; color:#1E293B; margin-right:4px;">${esc(w.word)}</span>
          ${w.zh ? `<span style="color:#64748B; font-size:11px; margin-right:6px;">(${esc(w.zh)})</span>` : ""}
          <span style="font-size:10px; font-weight:700; color:${w.color || '#E11D48'}; background:${w.bg || 'rgba(255,107,107,0.14)'}; padding:1px 6px; border-radius:999px;">${esc(w.tag || '拼寫弱點')}</span>
        </div>
      `;
    }).join("");

    conquerSectionHtml = `
      <div style="border:1px solid #FECDD3; border-radius:12px; padding:10px 14px; margin-bottom:14px; background:#FFF1F2; page-break-inside:avoid;">
        <div style="font-size:13px; font-weight:800; color:#9F1239; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
          <span>🎯 本期待攻克單字庫（共 ${conquerList.length} 字）</span>
          <span style="font-size:11px; background:#FFE4E6; color:#BE123C; padding:2px 8px; border-radius:999px; font-weight:800;">平日錯題累積 · 自由練習答對可自動消除</span>
        </div>
        <div style="font-size:11.5px; color:#881337; margin-bottom:8px; line-height:1.4;">
          💡 <b>複習提示</b>：以下單字源自平日指定測驗錯題。學生在平日自由練習中只要拼對該單字，即可自動從待攻克庫中消滅；週六日的週末消滅戰也會集中複習此清單！
        </div>
        <div style="background:#FFF; border:1px solid #FFE4E6; border-radius:8px; padding:8px 10px;">
          ${conquerItemsHtml}
        </div>
      </div>
    `;
  }

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

      <!-- 🎯 本期待攻克單字庫 -->
      ${conquerSectionHtml}

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
  const leftSingleInput = document.getElementById("export-single-date");
  const leftStartInput = document.getElementById("export-start-date");
  const rightCell = document.getElementById("export-right-date-cell");
  const presetsRow = document.getElementById("export-presets-row");
  const inputSingle = leftSingleInput;
  const inputStart = leftStartInput;
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
    if (leftSingleInput) leftSingleInput.style.display = (currentMode === "single") ? "block" : "none";
    if (leftStartInput) leftStartInput.style.display = (currentMode === "range") ? "block" : "none";
    if (rightCell) {
      rightCell.style.visibility = (currentMode === "range") ? "visible" : "hidden";
      rightCell.style.pointerEvents = (currentMode === "range") ? "auto" : "none";
    }
    if (presetsRow) {
      presetsRow.style.visibility = (currentMode === "range") ? "visible" : "hidden";
      presetsRow.style.opacity = (currentMode === "range") ? "1" : "0";
      presetsRow.style.pointerEvents = (currentMode === "range") ? "auto" : "none";
    }
    if (currentMode === "single" && leftSingleInput && leftStartInput && !leftSingleInput.value) {
      leftSingleInput.value = leftStartInput.value || todayDash;
    } else if (currentMode === "range" && leftStartInput && leftSingleInput && !leftStartInput.value) {
      leftStartInput.value = leftSingleInput.value || sevenDaysAgo;
    }
  };

  setExportMode("single");

  if (btnModeSingle) btnModeSingle.onclick = () => setExportMode("single");
  if (btnModeRange) btnModeRange.onclick = () => setExportMode("range");

  const btnPresetToday = document.getElementById("btn-export-preset-today");
  if (btnPresetToday) {
    btnPresetToday.onclick = () => {
      if (inputStart) inputStart.value = todayDash;
      if (inputEnd) inputEnd.value = todayDash;
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

export function initConquerCard() {
  const sec = document.getElementById("week-conquer-section");
  const container = document.getElementById("week-conquer-container");
  const toggleBtn = document.getElementById("btn-toggle-conquer-card");
  if (!sec || !toggleBtn) return;

  // 預先更新內容及徽章計數
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
      sec.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      if (container) container.style.display = "none";
      sec.classList.add("is-collapsed");
      toggleBtn.innerHTML = "展開";
    }
  };
}


