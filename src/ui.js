import { initExportRecordsCard } from "./ui_export.js";
import { initWeakWordsCard, analyzeErrorTag } from "./ui_weak_words.js";
import {
  setConquerWordsRef,
  getWeekPendingConquerWords,
  _resolveConquerWordLevel,
  _renderConquerWordCard,
  buildWeekPendingConquerHtml,
  updateWeekConquerSection,
  initConquerCard
} from "./ui_conquer.js";

const SVG_SPEAKER = '<svg class="icon-speaker" viewBox="0 0 24 24" width="17" height="17" fill="currentColor" style="vertical-align:middle;display:inline-block;"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
// =====================================================================
// ui.js — the view. All DOM rendering lives here. It renders from plain
// data and reports intent through callbacks; it never touches the store.
// =====================================================================
import { CATS } from "./data.js";
import { say, sayWord, spellOut, playContestSentence, stopAudio, parseDialogue } from "./audio.js";
import { LEVELS, levelColor, levelName, misspellings, shuffle } from "./levels.js";
import { diagnoseWordMistake } from "./diagnostics.js";
import { box, normalizeDateStr, formatDateYMD, getWeekRangeDates, getBiweeklyCycleInfo, getCachedTaskHistory, getConquerRollSettings, getRemedyLearnedSet } from "./store.js";

if (typeof window !== "undefined") {
  window.__say = say;
  window.__sayWord = (w) => sayWord(w);
  window.__saySentence = (s) => say(s);
  window.__switchConquerSent = (btn, idx) => {
    const card = btn.closest(".conquer-word-card");
    if (!card) return;
    card.querySelectorAll(".sent-tab-btn").forEach((b, i) => {
      b.classList.toggle("active", i === idx);
    });
    card.querySelectorAll(".conquer-sent-variant").forEach((v, i) => {
      v.style.display = (i === idx) ? "flex" : "none";
    });
  };
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
  inp.inputMode = "url";
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
      const isCur = L.state === "current";
      const bg = isCur ? `style="border-color:${L.color}; box-shadow:0 0 0 1.5px ${L.color};"` : "";
      const lock = L.state === "locked" ? " 🔒" : "";
      return `<button class="lvchip" data-lv="${L.n}" data-state="${L.state}" ${bg} ${L.state === "locked" ? "disabled" : ""}>
        <div class="lvn">LEVEL ${L.n}</div>
        <div class="lvname">${L.name}${lock}</div>
        <div class="lvbar"><i style="width:${L.pct}%; background:${L.color};"></i></div>
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
  el.checkBtn.classList.remove("ready");

  el.catlabel.textContent = `Level ${word.level}`;
  el.catlabel.style.background = levelColor(word.level);
  el.modehint.textContent = MHINT[mode];

  const cleanPh = String(word.ph || "").replace(/^[\/\[\s]+|[\/\]\s]+$/g, "");
  const phon = cleanPh ? `<span class="phon">/${cleanPh}/</span>` : "";
  const catTag = "";
  let zhText = `<span style="color:var(--ink3)">聽發音，拼出這個字</span>`;
  if (word.zh) {
    const posMap = {
      n: '名詞', v: '動詞', vt: '及物動詞', vi: '不及物動詞',
      a: '形容詞', adj: '形容詞', adv: '副詞', prep: '介系詞',
      conj: '連接詞', pron: '代名詞', num: '數詞', aux: '助動詞',
      art: '冠詞', int: '感嘆詞', interj: '感嘆詞', phr: '片語'
    };
    const parts = word.zh.split('；');
    const transList = [];
    const posList = [];

    for (const part of parts) {
      const trimmed = part.trim();
      const m = trimmed.match(/^([a-zA-Z\.\s\/]+?)[\s]+(.*)$/);
      if (m) {
        const posStr = m[1].trim();
        const defStr = m[2].trim();
        transList.push(defStr);
        const tags = posStr.split(/[\/\s]+/).map(p => p.replace(/\./g, '').trim()).filter(Boolean);
        tags.forEach(t => {
          const zhPos = posMap[t.toLowerCase()] || t;
          if (!posList.includes(zhPos)) posList.push(zhPos);
        });
      } else {
        transList.push(trimmed);
      }
    }
    const defHtml = `<b class="zh-def">${transList.join('； ')}</b>`;
    const posHtml = posList.length > 0 ? `<span class="zh-pos">${posList.join(' · ')}</span>` : '';
    zhText = `${defHtml}${posHtml}${phon}${catTag}`;
  }

  el.zh.innerHTML = `
    <div class="zh-row">
      <button type="button" class="word-speech-btn" id="word-speech-btn" aria-label="播放單字發音" title="播放單字發音">${SVG_SPEAKER}</button>
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

    // 依單字關卡階段自動判斷並顯示對應例句（1~2 入門基礎: 簡單；3 進階: 普通；4~5 挑戰精熟: 進階）
    const lv = Number(word.level) || 1;
    const targetLevel = (lv >= 4) ? 'advanced' : (lv === 3) ? 'normal' : 'simple';
    let currentIdx = sentsList.findIndex(s => s.level === targetLevel);
    if (currentIdx === -1) {
      if (targetLevel === 'advanced') {
        currentIdx = sentsList.findIndex(s => s.level === 'normal');
        if (currentIdx === -1) currentIdx = sentsList.findIndex(s => s.level === 'simple');
      } else if (targetLevel === 'normal') {
        currentIdx = sentsList.findIndex(s => s.level === 'simple');
        if (currentIdx === -1) currentIdx = sentsList.findIndex(s => s.level === 'advanced');
      } else {
        currentIdx = sentsList.findIndex(s => s.level === 'normal');
        if (currentIdx === -1) currentIdx = sentsList.findIndex(s => s.level === 'advanced');
      }
    }
    if (currentIdx === -1) currentIdx = 0;

    const renderSentContent = (idx) => {
      const s = sentsList[idx];
      const dlg = parseDialogue(s.sent);
      const isDlg = Boolean(dlg || s.level === 'dialogue');
      const levelCls = s.level === 'simple' ? 'level-simple' : s.level === 'advanced' ? 'level-advanced' : isDlg ? 'level-dialogue' : 'level-normal';
      const levelText = s.levelName || (isDlg ? '對話' : s.level === 'simple' ? '簡單' : s.level === 'advanced' ? '進階' : '普通');

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
          let zhA = '', zhB = '';
          if (dlgZh) {
            zhA = dlgZh.partA;
            zhB = dlgZh.partB;
          } else {
            const zhParts = s.sentZh.split(/\s*[\/\n;；]+\s*|\s+(?=(?:B|乙)[:：])/i);
            if (zhParts.length >= 2) {
              zhA = zhParts[0].replace(/^(?:A|甲)[:：]\s*/i, '').trim();
              zhB = zhParts.slice(1).join(' ').replace(/^(?:B|乙)[:：]\s*/i, '').trim();
            } else {
              const pSplit = s.sentZh.match(/^(.+?[？?。!！])\s*(.+)$/);
              if (pSplit) {
                zhA = pSplit[1].replace(/^(?:A|甲)[:：]\s*/i, '').trim();
                zhB = pSplit[2].replace(/^(?:B|乙)[:：]\s*/i, '').trim();
              }
            }
          }
          if (zhA && zhB) {
            zhHtml = `
              <div class="sent-dialogue-turn sent-dialogue-zh" style="margin-top:3px;"><span class="dlg-badge dlg-a">👩 A</span><span class="dlg-text">${zhA}</span></div>
              <div class="sent-dialogue-turn sent-dialogue-zh"><span class="dlg-badge dlg-b">👨 B</span><span class="dlg-text">${zhB}</span></div>
            `;
          } else {
            zhHtml = s.sentZh;
          }
        }
      } else {
        const safeWord = word.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const maskedSent = s.sent.replace(new RegExp("\\b" + safeWord + "\\b", "i"), '<u class="sent-blank"></u>');
        enHtml = maskedSent;
        zhHtml = s.sentZh || '';
      }

      return `
        <div class="sent-row" data-idx="${idx}">
          <button type="button" class="sent-speaker-btn ${levelCls}" data-idx="${idx}" aria-label="${levelText}例句朗讀">${SVG_SPEAKER}</button>
          <div class="sent-text-wrap" data-idx="${idx}">
            <div class="sent-en">${enHtml}</div>
            ${zhHtml ? `<div class="sent-zh">${zhHtml}</div>` : ''}
          </div>
        </div>
      `;
    };

    el.sent.innerHTML = `<div class="sent-display-body">${renderSentContent(currentIdx)}</div>`;
    el.sent.style.cursor = "default";

    const bindSentAudio = () => {
      const row = el.sent.querySelector(".sent-row");
      if (!row) return;
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
    };

    bindSentAudio();
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
  inp.addEventListener("input", () => {
    if (inp.value.trim().length > 0) el.checkBtn.classList.add("ready");
    else el.checkBtn.classList.remove("ready");
  });
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
      opts.querySelectorAll(".opt").forEach(o => { o.style.pointerEvents = "none"; });
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
        if (inp.value && cu < ins.length - 1) {
          ins[cu + 1].focus();
        } else if (ins.every(i => i.value.trim())) {
          el.checkBtn.classList.add("ready");
          try { el.checkBtn.focus(); } catch(_) {}
        } else {
          el.checkBtn.classList.remove("ready");
        }
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
        el.checkBtn.classList.add("ready");
        try { el.checkBtn.focus(); } catch(_) {}
      } else {
        el.checkBtn.classList.remove("ready");
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

  el.stage.append(scr, inp);
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
      <div style="display:flex;align-items:center;justify-content:center;margin-bottom:8px;font-size:16px;width:100%;line-height:1.4;">
        <span>正確拼法：<span class="reveal" style="display:inline">${revealHtml(word)}</span></span>
      </div>
      <div class="active-repair-card" id="active-repair-card">
        <div class="active-repair-header">
          <span style="font-size:16px;">✍️</span>
          <span><b>訂正</b></span>
        </div>
        <div class="active-repair-input-wrap">
          <input type="text" id="active-repair-input" class="active-repair-input" inputmode="url" placeholder="請輸入「${word.word}」..." autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" data-gramm="false" data-enable-grammarly="false" aria-autocomplete="none" />
          <button type="button" id="active-repair-btn" class="active-repair-btn">訂正確認 ↵</button>
        </div>
        <div id="active-repair-msg" class="active-repair-msg"></div>
      </div>
    `;
    pulse("shake"); say(word.word, 0.8);

    // 佔位隱藏「下一個 Next」按鈕，保持高度防抖動，直到訂正完成再顯示解鎖
    el.checkBtn.style.display = "";
    el.checkBtn.style.visibility = "hidden";
    el.checkBtn.disabled = true;

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
          repairBtn.textContent = "✅ 已訂正";
          if (repairMsg) repairMsg.innerHTML = `<span style="color:#10B981;font-weight:700;">✨ 太棒了！已完成訂正！</span>`;
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
  el.checkBtn.style.display = ""; el.checkBtn.style.visibility = "visible"; el.checkBtn.disabled = false;
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
  const isParent = localStorage.getItem("user_role") === "parent";
  const userEl = el.sUser || (el.sUser = $("#s-user"));
  if (userEl && u) {
    userEl.textContent = u;
    userEl.title = isParent ? `家長帳號：${u}` : u;
    const statEl = el.statUser || (el.statUser = document.getElementById("stat-user"));
    if (statEl) {
      statEl.title = isParent ? `家長帳號：${u}\n（點擊可查看帳號詳情或切換）` : `目前登入帳號：${u}\n（點擊可查看帳號詳情或切換）`;
      if (isParent) {
        const subSpan = statEl.querySelector("span");
        if (subSpan) subSpan.textContent = "家長帳號";
      }
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

  let learn = s.learn;
  let prac = s.prac;
  let mast = s.mast;
  if ((learn === undefined || prac === undefined || mast === undefined) && s.levels && Array.isArray(s.levels)) {
    learn = s.levels.reduce((acc, l) => acc + (l.learn || 0), 0);
    prac = s.levels.reduce((acc, l) => acc + (l.prac || 0), 0);
    mast = s.levels.reduce((acc, l) => acc + (l.mast || 0), 0);
  }
  learn = learn || 0;
  prac = prac || 0;
  mast = mast || 0;

  const totCorr = learn + prac + mast;
  const distinctCorr = totCorr > 0 ? totCorr : (s.distinctCorrect !== undefined ? s.distinctCorrect : 0);
  const sCorr = el.sCorrect || (el.sCorrect = $("#s-correct"));
  if (sCorr) sCorr.textContent = distinctCorr;
  const nCorr = el.nCorrect || (el.nCorrect = $("#n-correct"));
  if (nCorr) nCorr.textContent = distinctCorr;

  const sStreak = el.sStreak || (el.sStreak = $("#s-streak"));
  if (sStreak) sStreak.textContent = s.streak !== undefined ? s.streak : 0;

  const total = s.total || 2055;
  const vocabRate = total > 0 ? Math.round((distinctCorr / total) * 100) : 0;

  const sRate = el.sRate || (el.sRate = $("#s-rate"));
  if (sRate) sRate.textContent = (s.passRate !== undefined ? s.passRate : 0) + "%";
  const nRate = el.nRate || (el.nRate = $("#n-rate"));
  if (nRate) nRate.textContent = vocabRate + "%";

  const bLearn = el.bLearn || (el.bLearn = $("#b-learn"));
  if (bLearn) bLearn.style.width = Math.min(100, Math.max(0, (learn / total * 100))) + "%";
  const bPrac = el.bPrac || (el.bPrac = $("#b-prac"));
  if (bPrac) bPrac.style.width = Math.min(100, Math.max(0, (prac / total * 100))) + "%";
  const bMast = el.bMast || (el.bMast = $("#b-mast"));
  if (bMast) bMast.style.width = Math.min(100, Math.max(0, (mast / total * 100))) + "%";

  const nLearn = el.nLearn || (el.nLearn = $("#n-learn"));
  if (nLearn) nLearn.textContent = learn;
  const nPrac = el.nPrac || (el.nPrac = $("#n-prac"));
  if (nPrac) nPrac.textContent = prac;
  const nMast = el.nMast || (el.nMast = $("#n-mast"));
  if (nMast) nMast.textContent = mast;
  const nTotal = el.nTotal || (el.nTotal = $("#n-total"));
  if (nTotal) nTotal.textContent = total;

  if (s.levels && Array.isArray(s.levels)) {
    renderProgressLevelsTable(s.levels);
  }
  if (s.modeStats) {
    renderProgressModeStats(s.modeStats);
  }
}

export function renderProgressLevelsTable(levels) {
  const tbody = document.getElementById("progress-level-tbody");
  if (!tbody || !Array.isArray(levels)) return;
  tbody.innerHTML = levels
    .map((L) => {
      const totCorr = (L.learn || 0) + (L.prac || 0) + (L.mast || 0);
      return `<tr><td class="st-level-name"><span style="color:${levelColor(L.level)}">●</span> Level ${L.level}「${levelName(L.level)}」</td><td class="st-level-stats"><div class="level-stats-grid"><span class="st-item st-learn"><span class="st-lbl">學習中</span><b class="tnum st-num st-num-learn">${L.learn || 0}</b>字</span><span class="st-sep">/</span><span class="st-item st-prac"><span class="st-lbl">練習中</span><b class="tnum st-num st-num-prac">${L.prac || 0}</b>字</span><span class="st-sep">/</span><span class="st-item st-mast"><span class="st-lbl">精通</span><b class="tnum st-num st-num-mast">${L.mast}</b>字</span><span class="st-sep">/</span><span class="st-item st-total"><span class="st-lbl">共答對</span><b class="tnum st-num st-num-total">${totCorr}</b>字</span></div></td></tr>`;
    })
    .join("");
}

export function renderProgressModeStats(ms) {
  if (!ms) return;
  const modes = ["listen", "pick", "scramble", "trap"];
  modes.forEach(m => {
    const numEl = document.getElementById(`p-mode-${m}-num`);
    const subEl = document.getElementById(`p-mode-${m}-sub`);
    const data = ms[m] || { a: 0, c: 0 };
    if (numEl) numEl.textContent = `${data.c || 0} 字`;
    if (subEl) {
      const a = data.a || 0;
      const c = data.c || 0;
      const pct = a > 0 ? Math.round((c / a) * 100) : 0;
      subEl.textContent = `受測 ${a} 字 (${pct}%)`;
    }
  });
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
  const pct = Math.min(100, Math.round((ls.mast !== undefined && ls.target) ? (ls.mast / ls.target * 100) : (ls.rate * 100)));
  const progressText = (ls.mast !== undefined && ls.target) 
    ? `已精通 <b>${ls.mast} / ${ls.target} 字</b>（${pct}%）`
    : `正確率 <b>${pct}%</b>`;
  const badgeHtml = (level >= 5) 
    ? `<span class="badge" style="background:#10b981;color:#fff;padding:6px 12px;border-radius:12px;font-size:12px;font-weight:700;">🌟 最高等級</span>`
    : (ready 
        ? `<span class="badge" style="background:#2563eb;color:#fff;padding:6px 12px;border-radius:12px;font-size:12px;font-weight:700;">🚀 已解鎖 Lv${level + 1}</span>`
        : `<span class="badge" style="background:rgba(37,99,235,0.08);color:var(--primary,#2563eb);border:1px solid rgba(37,99,235,0.2);padding:6px 12px;border-radius:12px;font-size:12px;font-weight:700;">🎯 目標 ${ls.target || 200} 字</span>`);

  el.banner.innerHTML = `
    <div class="gate">
      <div style="flex:1;">
        <div class="info">Level ${level}「${levelName(level)}」· ${progressText}</div>
        <div class="meter"><i style="width:${pct}%"></i></div>
        <div class="info" style="margin-top:6px;color:var(--ink3)">${hint}</div>
      </div>
      <div style="display:flex;align-items:center;margin-left:12px;">
        ${badgeHtml}
      </div>
    </div>`;
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

export function resolveWordStr(raw, d) {
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

let _combinedTaskHistoryCache = null;
let _combinedTaskHistorySig = "";

export function getCombinedTaskHistory() {
  const sig = (localStorage.getItem("student_task_history") || "") + "|" +
              (localStorage.getItem("today_task_summary") || "") + "|" +
              (localStorage.getItem("today_task_in_progress") || "") + "|" +
              (sessionStorage.getItem("assigned_task") || localStorage.getItem("assigned_task_active") || "") + "|" +
              localStorage.length;
  if (_combinedTaskHistoryCache && _combinedTaskHistorySig === sig) {
    return _combinedTaskHistoryCache;
  }
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

  _combinedTaskHistorySig = sig;
  _combinedTaskHistoryCache = list;
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

export function isValidEnglishWordStr(w) {
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
  _combinedTaskHistoryCache = null;
  _combinedTaskHistorySig = "";
}

function isWeekend(dateStr) {
  if (!dateStr) return false;
  const clean = String(dateStr).trim().split(" ")[0].replace(/-/g, "/");
  const d = new Date(clean);
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function resolveTaskWords(record, selectedDate, d) {
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
    } else if (wrongList.length < expWrong && rawWords.length > 0) {
      // 僅保留受測抽考中答錯之單字，未作答或題庫候選字保留至未受測清單
    
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
  // 計算全卷預設應測題數 (quizTotal)：優先取 record.testedCount，或 status 中的 (X/Y) 分母，或 record.total
  let quizTotal = 0;
  if (record.testedCount && !isNaN(parseInt(record.testedCount, 10)) && parseInt(record.testedCount, 10) > 0) {
    quizTotal = parseInt(record.testedCount, 10);
  } else if (record.status && /\/\s*(\d+)\s*\)/.test(record.status)) {
    const m = record.status.match(/\/\s*(\d+)\s*\)/);
    if (m) quizTotal = parseInt(m[1], 10);
  } else if (record.total && !isNaN(parseInt(record.total, 10)) && parseInt(record.total, 10) > 0) {
    quizTotal = parseInt(record.total, 10);
  } else if (rawWords && rawWords.length > 0) {
    quizTotal = rawWords.length;
  } else if (taskTotWords > 0) {
    quizTotal = taskTotWords;
  }
  if (rawWords && rawWords.length > quizTotal) {
    quizTotal = rawWords.length;
  }
  if (quizTotal <= 0) quizTotal = 5;

  // 使用者受測/已作答單字數 (actualAnswered)
  let actualAnswered = 0;
  if (record.answeredCount && !isNaN(parseInt(record.answeredCount, 10)) && parseInt(record.answeredCount, 10) > 0) {
    actualAnswered = parseInt(record.answeredCount, 10);
  } else if (scoreVal && String(scoreVal).includes("/")) {
    const parts = String(scoreVal).split("/");
    const sTot = parseInt(parts[1], 10);
    if (!isNaN(sTot) && sTot > 0) actualAnswered = sTot;
  } else if (record.attempts !== undefined && !isNaN(parseInt(record.attempts, 10)) && parseInt(record.attempts, 10) > 0) {
    actualAnswered = parseInt(record.attempts, 10);
  } else if (totalAnswered > 0) {
    actualAnswered = totalAnswered;
  } else {
    actualAnswered = taskCorrWords + wrongList.length;
  }
  if (actualAnswered <= 0 && taskCorrWords > 0) actualAnswered = taskCorrWords;
  if (actualAnswered > quizTotal) quizTotal = actualAnswered;

  const actualWrong = wrongList.length > 0 ? wrongList.length : Math.max(0, actualAnswered - taskCorrWords);
  const actualUnanswered = Math.max(0, quizTotal - actualAnswered);
  taskTotWords = quizTotal;
  const assignedTotWords = quizTotal;
  const hasUnanswered = actualUnanswered > 0;

  // (A) 作答正確率 (針對實際受測有作答題目的答對率，如 3/4 = 75%)
  const attemptedRate = actualAnswered > 0 ? Math.round((taskCorrWords / actualAnswered) * 100) : 0;
  // (B) 全卷正確率 (預設有 5 題施測，以全卷應測總題數為分母，答錯與未作答均視為失分，如 3/5 = 60%)
  const overallScoreRate = quizTotal > 0 ? Math.round((taskCorrWords / quizTotal) * 100) : 0;

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
    displayStatusStr = `未完成 (${taskCorrWords}/${assignedTotWords})`;
    statusColor = "#0284c7";
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
  let leftTitleText = `<span class="card-icon-slot" style="color:#10B981; font-weight:900;">✔</span><span>答對的單字 (${correctList.length} 字)</span>`;
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
      <div style="display:flex; flex-direction:column; justify-content:flex-start; align-items:flex-start; gap:6px; padding:4px 0; font-size:11px; line-height:1.5; width:100%;">
        <div style="display:flex; align-items:flex-start; gap:6px; width:100%;">
          <span class="card-icon-slot" style="flex-shrink:0; width:16px; text-align:center; line-height:1.5; font-size:12px;">${statusIcon}</span>
          <div style="flex:1; min-width:0; line-height:1.5; text-align:left;">
            <b>${statusTitle}</b>。${statusDetail}
          </div>
        </div>
        <div style="display:flex; align-items:flex-start; gap:6px; width:100%; font-size:10.5px; color:var(--ink3);">
          <span class="card-icon-slot" style="flex-shrink:0; width:16px; text-align:center; line-height:1.5; font-size:12px;">📌</span>
          <div style="flex:1; min-width:0; line-height:1.5; text-align:left;">
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
    leftTitleText = `<span class="card-icon-slot" style="color:#10B981; font-weight:900;">✔</span><span>答對的單字 (${correctList.length} 字)</span>`;
    if (correctList.length > 0) {
      correctContentHtml = correctList.map(w => `<span class="word-pill-tag correct" data-word="${w.replace(/"/g, "&quot;")}" style="cursor:pointer;" title="點擊聆聽發音">${w}</span>`).join("");
    } else {
      correctContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（中途作答中斷，尚未答對單字）</span>`;
    }

    rightBoxClass = "wrong-box";
    rightTitleClass = "wrong-title";
    rightTitleText = `<span class="card-icon-slot">❌</span><span>答錯的單字 (${wrongList.length} 字)</span>`;
    
    let wrongPillsHtml = "";
    if (wrongList.length > 0 || actualUnanswered > 0) {
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

      const untestedWords = (rawWords.length > 0)
        ? rawWords.filter(w => !correctList.includes(String(w).toLowerCase()) && !wrongList.includes(String(w).toLowerCase()))
        : (unansweredList.length > 0 ? unansweredList : []);

      let unansAccordionHtml = "";
      if (untestedWords.length > 0 || actualUnanswered > 0) {
        const unansPills = untestedWords.map(w => `<span class="word-pill-tag neutral" data-word="${w.replace(/"/g, "&quot;")}" style="cursor:pointer;" title="未作答單字 (點擊聆聽發音)">${w}</span>`).join("");
        unansAccordionHtml = `
          <div style="${wrongList.length > 0 ? 'margin-top:10px; padding-top:8px; border-top:1px dashed var(--line, rgba(148,163,184,0.25));' : ''} width:100%;">
            <div style="display:flex; align-items:center; font-size:12px; font-weight:700; color:var(--ink2); padding:4px 0; gap:6px; width:100%;">
              <span class="card-icon-slot">⏳</span>
              <span style="flex:1;">未作答的單字 (${untestedWords.length > 0 ? untestedWords.length : actualUnanswered} 字)</span>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; padding:8px; background:rgba(2,132,199,0.06); border-radius:8px; border:1px solid rgba(2,132,199,0.18);">
              ${unansPills || '<span style="font-size:11.5px; color:var(--ink3);">（包含抽題未作答之題目）</span>'}
            </div>
          </div>
        `;
      }
      wrongContentHtml = `<div style="display:flex; flex-direction:column; width:100%;"><div style="display:flex; flex-wrap:wrap; gap:6px;">${wrongPills || '<span style="font-size:12px; color:var(--ink3); font-style:italic;">（受測題目無答錯）</span>'}</div>${unansAccordionHtml}</div>`;
    } else {
      wrongContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（目前無答錯單字）</span>`;
    }
  } else {
    leftBoxClass = "correct-box";
      leftTitleClass = "correct-title";
      leftTitleText = `<span class="card-icon-slot" style="color:#10B981; font-weight:900;">✔</span><span>答對的單字 (${correctList.length} 字)</span>`;
      if (correctList.length > 0) {
        correctContentHtml = correctList.map(w => `<span class="word-pill-tag correct" data-word="${w.replace(/"/g, "&quot;")}" style="cursor:pointer;" title="點擊聆聽發音">${w}</span>`).join("");
      } else if (taskCorrWords > 0) {
        correctContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（本次測驗答對 ${taskCorrWords} 字）</span>`;
      } else {
        correctContentHtml = `<span style="font-size:12px; color:var(--ink3); font-style:italic;">（本次測驗尚無答對單字）</span>`;
      }

      if (wrongList.length > 0) {
        const normDate = normalizeDateStr(selectedDate);
        const slashDate = normDate.replace(/-/g, "/");
        const dpDay = d && d.dailyPractice && (d.dailyPractice[normDate] || d.dailyPractice[slashDate] || d.dailyPractice[selectedDate]);
        wrongContentHtml = wrongList.map(w => {
          const isHadCW = (hadCorrectThenWrongList && hadCorrectThenWrongList.includes(w)) ||
                          (record.hadCorrectThenWrong && record.hadCorrectThenWrong.includes(w)) ||
                          (dpDay && dpDay.words && dpDay.words[w] && (dpDay.words[w].hadCorrectThenWrong || (dpDay.words[w].lastResult === "wrong" && dpDay.words[w].correct > 0)));
          if (isHadCW) {
            return `<span class="word-pill-tag warning" data-word="${w.replace(/"/g, "&quot;")}" style="border:1.5px dashed #f59e0b; background:rgba(245,158,11,0.1); color:#b45309; cursor:pointer;" title="當日曾答對，但後續作答時答錯 (點擊聆聽發音)">${w} <small style="font-size:10px; font-weight:700;">(曾對後錯⚠️)</small></span>`;
          }
          return `<span class="word-pill-tag wrong" data-word="${w.replace(/"/g, "&quot;")}" style="cursor:pointer;" title="點擊聆聽發音">${w}</span>`;
        }).join("");
      } else if (isTrulyPerfect) {
        wrongContentHtml = "";
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
          <div class="task-score-val" style="color:var(--ink2); font-size:15px; font-weight:700;">當日無指派</div>
        </div>
        <div class="task-score-item">
          <div class="task-score-label">作答狀態</div>
          <div class="task-score-val" style="color:${statusColor}; font-size:15px; font-weight:800;">${displayStatusStr}</div>
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
          <div class="task-score-val" style="color:${statusColor}; font-size:15.5px; font-weight:800;">${displayStatusStr}</div>
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
      if (n > 0) return 'tier-1';
      return 'tier-0';
    };
    const ansCount = hasUnanswered ? actualAnswered : taskTotWords;
    const wrgCount = hasUnanswered ? actualWrong : Math.max(0, taskTotWords - taskCorrWords);
    const unansCount = hasUnanswered ? actualUnanswered : 0;
    const attRate = hasUnanswered ? attemptedRate : taskRate;
    const ovrRate = hasUnanswered ? overallScoreRate : taskRate;

    scoreGridHtml = `
      <div class="task-score-grid">
        <div class="task-score-subgrid-4">
          <div class="task-score-item score-corr-item">
            <div class="task-score-label">答對</div>
            <div class="task-score-val task-score-num-corr">${taskCorrWords}</div>
          </div>
          <div class="task-score-item score-wrong-item">
            <div class="task-score-label">答錯</div>
            <div class="task-score-val task-score-num-wrong">${wrgCount}</div>
          </div>
          <div class="task-score-item score-ans-item">
            <div class="task-score-label">已作答</div>
            <div class="task-score-val task-score-num-ans">${ansCount}</div>
          </div>
          <div class="task-score-item score-unans-item">
            <div class="task-score-label">未作答</div>
            <div class="task-score-val task-score-num-unans">${unansCount}</div>
          </div>
        </div>
        <div class="task-score-subgrid-2">
          <div class="task-score-item rate-tier-item ${getHeatmapRateClass(attRate)}">
            <div class="task-score-label" title="實際有作答題目的答對率">作答正確率</div>
            <div class="task-score-val heat-rate-val ${getHeatmapRateClass(attRate)}">
              ${ansCount > 0 ? attRate + '%' : '—'}
            </div>
          </div>
          <div class="task-score-item rate-tier-item ${getHeatmapRateClass(ovrRate)}">
            <div class="task-score-label" title="以全卷應測總單字數為分母計算之正確率">全卷正確率</div>
            <div class="task-score-val heat-rate-val ${getHeatmapRateClass(ovrRate)}">
              ${ovrRate}%
            </div>
          </div>
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
          <div class="word-split-content" style="display:flex; flex-direction:column; justify-content:flex-start; align-items:flex-start; gap:6px; padding:4px 0; font-size:11px; line-height:1.5; width:100%;">
            <div style="display:flex; align-items:flex-start; gap:6px; width:100%;">
              <span class="card-icon-slot" style="flex-shrink:0; width:16px; text-align:center; line-height:1.5; font-size:12px;">${statusIcon}</span>
              <div style="flex:1; min-width:0; line-height:1.5; text-align:left;">
                <b>${statusTitle}</b>。${statusDetail}
              </div>
            </div>
            <div style="display:flex; align-items:flex-start; gap:6px; width:100%; font-size:10.5px; color:var(--ink3);">
              <span class="card-icon-slot" style="flex-shrink:0; width:16px; text-align:center; line-height:1.5; font-size:12px;">📌</span>
              <div style="flex:1; min-width:0; line-height:1.5; text-align:left;">
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

  const getHeatmapRateClass = (r) => {
    const n = (typeof r === 'number') ? r : (parseInt(r, 10) || 0);
    if (n >= 100) return 'tier-6';
    if (n >= 90) return 'tier-5';
    if (n >= 80) return 'tier-4';
    if (n >= 70) return 'tier-3';
    if (n >= 60) return 'tier-2';
    if (n > 0) return 'tier-1';
    return 'tier-0';
  };

  return `
    <div>
      <div class="task-history-header">
        <div>
          <span class="task-card-title task-title-free">${freeTitleText}</span>
        </div>
      </div>

      <div class="task-score-grid">
        <div class="task-score-subgrid">
          <div class="task-score-item score-corr-item">
            <div class="task-score-label">答對</div>
            <div class="task-score-val task-score-num-corr">${correctWords}</div>
          </div>
          <div class="task-score-item score-wrong-item">
            <div class="task-score-label">答錯</div>
            <div class="task-score-val task-score-num-wrong">${displayWrongBoxCount}</div>
          </div>
        </div>
        <div class="task-score-item rate-tier-item ${getHeatmapRateClass(wordRate)}">
          <div class="task-score-label">全卷正確率</div>
          <div class="task-score-val heat-rate-val ${getHeatmapRateClass(wordRate)}">
            ${totalWords > 0 ? wordRate + '%' : '—'}
          </div>
        </div>
      </div>

      <!-- 將答對的字與答錯的字分成兩個區域（純顯示當日練習狀況，非累積狀況） -->
      <div class="word-split-grid grid-2">
        <!-- 答對的單字區 -->
        <div class="word-split-box correct-box">
          <div class="word-split-title correct-title">
            <span><span style="color:#10B981; font-weight:900; margin-right:4px;">✔</span>答對的單字 (${displayCorrectBoxCount} 字)</span>
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
  return getCachedTaskHistory();
}

export function resolveDailyPracticeRecord(dateStr, d, historyList) {
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

// ---------- summary ----------
let _activeRecordSelectedDate = "";
export function summaryHidden() { return el.summary.hidden; }
export function renderSummary(d) {
  if (d && d.words) setConquerWordsRef(d.words);
  clearResolveWordsCache();

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
          const md = nd.slice(5);
          if (md && md !== nd) {
            let mArr = taskByDateMap.get(md);
            if (!mArr) { mArr = []; taskByDateMap.set(md, mArr); }
            mArr.push(item);
          }
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

    let tArr = taskByDateMap.get(norm);
    if (!tArr && norm && norm.length >= 10) {
      tArr = taskByDateMap.get(norm.slice(5));
    }
    const tRec = (tArr && (tArr.find(r => r && r.status && r.status.includes("已完成")) || tArr.find(r => r && r.score && r.score !== "—" && r.score !== "尚未開始") || tArr[0])) || null;

    const hasActualTestRec = tRec && (
      (tRec.score && tRec.score !== "—" && tRec.score !== "尚未開始" && String(tRec.score).includes("/")) ||
      (parseInt(tRec.attempts) > 0) ||
      (parseInt(tRec.correct) > 0) ||
      (tRec.status && (tRec.status.includes("已完成") || tRec.status.includes("未完成") || tRec.status.includes("作答中") || tRec.status.includes("中斷")))
    );

    const isExplicitUntested = tRec && tRec.status && (tRec.status.includes("未受測") || tRec.status.includes("缺席") || tRec.status.includes("缺考") || tRec.status.includes("未作答"));
    const isUnassignedTask = !tRec || (!hasActualTestRec && !isExplicitUntested && (!tRec.taskName || tRec.taskName === "⚪ 未指派" || tRec.taskName === "未指派" || tRec.taskName === "自主練習" || String(tRec.taskName).includes("未指派") || (tRec.status && tRec.status.includes("未指派"))));
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
    let taskWordsCount = 0;

    if (tRec.testedCount && !isNaN(parseInt(tRec.testedCount, 10)) && parseInt(tRec.testedCount, 10) > 0) {
      taskWordsCount = parseInt(tRec.testedCount, 10);
    } else if (tRec.status && /\/\s*(\d+)\s*\)/.test(tRec.status)) {
      const m = tRec.status.match(/\/\s*(\d+)\s*\)/);
      if (m) taskWordsCount = parseInt(m[1], 10);
    } else if (tRec.total && !isNaN(parseInt(tRec.total, 10)) && parseInt(tRec.total, 10) > 0) {
      taskWordsCount = parseInt(tRec.total, 10);
    }

    if (tRec.score && String(tRec.score).includes("/")) {
      const sp = String(tRec.score).split("/");
      const sCorr = parseInt(sp[0], 10);
      const sTot = parseInt(sp[1], 10);
      if (!isNaN(sTot) && sTot > 0) {
        if (!taskWordsCount) taskWordsCount = sTot;
        if (!tAtt) tAtt = sTot;
      }
      if (!isNaN(sCorr) && !tCor) tCor = sCorr;
    }

    const statusStr = String(tRec.status || "");
    const resolved = resolveTaskWords(tRec, norm, d);
    const resolvedRaw = resolved.rawWords || [];
    const resolvedCorr = resolved.correctList || [];
    const resolvedWrong = resolved.wrongList || [];
    const resolvedAnsCount = resolvedCorr.length + resolvedWrong.length;

    if (resolvedAnsCount > tAtt) {
      tAtt = resolvedAnsCount;
    } else if (!tAtt && tRec.answeredCount) {
      tAtt = parseInt(tRec.answeredCount, 10) || 0;
    }
    if (resolvedCorr.length > tCor) {
      tCor = resolvedCorr.length;
    }
    if (!taskWordsCount) {
      taskWordsCount = resolvedRaw.length || (Array.isArray(tRec.words) && tRec.words.length) || (resolvedCorr.length + resolvedWrong.length) || tAtt || 5;
    }
    if (resolvedRaw.length > taskWordsCount) taskWordsCount = resolvedRaw.length;
    if (taskWordsCount < tAtt) taskWordsCount = tAtt;
    if (taskWordsCount <= 0) taskWordsCount = 5;

    // 判定是否為未受測狀態 (缺席未受測 / 登入未受測)
    const isUntested = isExplicitUntested || (
      !statusStr.includes("已完成") && !statusStr.includes("中斷") && !statusStr.includes("作答中") &&
      tAtt === 0 && resolvedAnsCount === 0 && tCor === 0 &&
      (!tRec.score || tRec.score === "—" || tRec.score === "尚未開始")
    );

    // 當日是否有登入或自由練習
    const freeRec = resolveDailyPracticeRecord(norm, d, historyList);
    const hasLoggedInOrFree = !!(freeRec && freeRec.attempts > 0) || (tRec.freeTested > 0) || statusStr.includes("登入未受測") || statusStr.includes("登入未作答");

    let res;
    if (isUntested) {
      if (hasLoggedInOrFree) {
        res = {
          a: 0, c: 0, rate: 0,
          wordsCount: taskWordsCount,
          hasUnanswered: false,
          statusType: "login_untested",
          statusLabel: "登入未受測",
          levelClass: "h-status-yellow",
          badgeTier: "tier-status-yellow"
        };
      } else {
        res = {
          a: 0, c: 0, rate: 0,
          wordsCount: taskWordsCount,
          hasUnanswered: false,
          statusType: "absent_untested",
          statusLabel: "缺席未受測",
          levelClass: "h-status-red",
          badgeTier: "tier-status-red"
        };
      }
      taskDayStatCache.set(norm, res);
      return res;
    }

    const isExplicitlyNotFinished = statusStr.includes("中斷") || statusStr.includes("未完成") || statusStr.includes("作答中") || tRec.inProgress === true;
    const isFinished = !isExplicitlyNotFinished && (statusStr.includes("已完成") || ((tAtt > 0 && tAtt >= taskWordsCount) || (resolvedAnsCount > 0 && resolvedAnsCount >= taskWordsCount)));

    // 判定是否有未作答單字 (未作答視同答錯)
    const actualAnswered = tAtt;
    const hasUnanswered = taskWordsCount > actualAnswered && actualAnswered > 0;

    // 全卷正確率 (未作答視同答錯失分，以全卷總題數為分母)
    let overallRate = 0;
    if (taskWordsCount > 0) {
      overallRate = Math.round((tCor / taskWordsCount) * 100);
    } else if (tRec.rate && !isNaN(parseInt(tRec.rate, 10))) {
      overallRate = parseInt(tRec.rate, 10);
    }
    const tRate = overallRate;

    // 藍色系六階量級映射 (與成績卡全卷正確率色階 100% 嚴格一致)
    const level = tRate >= 100 ? 6 : (tRate >= 90 ? 5 : (tRate >= 80 ? 4 : (tRate >= 70 ? 3 : (tRate >= 60 ? 2 : (tRate > 0 ? 1 : 0)))));
    const badgeTier = tRate >= 100 ? "tier-blue-perfect" : (tRate >= 80 ? "tier-blue-high" : (tRate >= 60 ? "tier-blue-mid" : (tRate > 0 ? "tier-blue-low" : "tier-gray")));

    res = {
      a: actualAnswered, c: tCor, rate: tRate,
      wordsCount: taskWordsCount,
      hasUnanswered: hasUnanswered,
      statusType: hasUnanswered ? "incomplete" : "completed",
      statusLabel: hasUnanswered ? `全卷正確率 ${tRate}%` : `正確率 ${tRate}%`,
      levelClass: `h${level}`,
      badgeTier: badgeTier
    };
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

    el.summary.innerHTML = `
    <div class="date-navigator-card">
      <!-- 左欄：快速跳轉（歷程紀錄選單） -->
      <div class="date-nav-col date-nav-col-quick">
        <div class="date-nav-col-header">
          <span class="date-nav-icon">📅</span>
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
    <div class="subh" style="margin-top:10px;">
      <span id="task-subh-title">${isWeekend(defaultSelectedDate) ? (getBiweeklyCycleInfo(defaultSelectedDate).isBiweeklyBossWeek ? `🎯 ${formatWeekendTaskDate(defaultSelectedDate)} 雙週指定單字大消滅戰作答紀錄` : `🎯 ${formatWeekendTaskDate(defaultSelectedDate)} 週末待攻克測驗作答紀錄`) : "📝 平日指定測驗作答紀錄"}</span>
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
        <div class="heatmap heatmap-task" id="task-heatmap-grid">${taskHeatDays.map((x, idx) =>
          `<i class="hc ${x.levelClass}" role="button" tabindex="0" aria-label="${x.key}，${x.statusLabel || ''}" data-idx="${idx}" data-key="${x.key}" data-a="${x.a || 0}" data-rate="${x.rate || 0}"></i>`).join("")}</div>
      </div>
    </div>

    <!-- 子標題 2：自由練習作答紀錄 -->
    <div class="subh" style="margin-top:14px;">
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
          `<i class="hc h${x.level}" role="button" tabindex="0" aria-label="${x.key}，正確率 ${x.rate || 0}%" data-idx="${idx}" data-key="${x.key}" data-a="${x.a || 0}" data-rate="${x.rate || 0}"></i>`).join("")}</div>
        <p class="defs heat-legend" style="margin-top:8px;">熱力圖說明：<b>連續</b>＝目前不中斷練習天數 · <b>最佳</b>＝最長連續天天練習紀錄 · <b>累計</b>＝有練習的總天數 · <b>方格顏色</b>＝愈鮮豔當日正確率愈高（灰色代表未練習）</p>
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
    const shortDate = String(dateKey).replace(/^\d{4}-/, '');
    taskHeatDayInfoEl.className = `heat-day-info ${stat.badgeTier}`;
    if (stat.hasUnanswered || stat.statusType === "incomplete") {
      taskHeatDayInfoEl.innerHTML = `<b>${shortDate}</b> ｜ 全卷正確率 <b>${stat.rate}%</b>`;
    } else if (stat.statusType === "completed") {
      taskHeatDayInfoEl.innerHTML = `<b>${shortDate}</b> ｜ 正確率 <b>${stat.rate}%</b>`;
    } else {
      taskHeatDayInfoEl.innerHTML = `<b>${shortDate}</b> ｜ <b>${stat.statusLabel}</b>`;
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
      const triggerTaskCell = (cell) => {
        if (!cell) return;
        const idx = parseInt(cell.getAttribute("data-idx"), 10);
        if (!isNaN(idx)) {
          pinnedTaskIdx = idx;
          updateTaskHeatDayBadge(idx);
          if (taskHeatDays[idx] && taskHeatDays[idx].key) {
            switchRecordDate(taskHeatDays[idx].key);
          }
        }
      };
      taskHeatGridEl.addEventListener("mouseover", (e) => {
        const cell = e.target && e.target.closest ? e.target.closest(".hc") : null;
        if (!cell) return;
        const idx = parseInt(cell.getAttribute("data-idx"), 10);
        if (!isNaN(idx)) updateTaskHeatDayBadge(idx);
      });
      taskHeatGridEl.addEventListener("click", (e) => {
        triggerTaskCell(e.target && e.target.closest ? e.target.closest(".hc") : null);
      });
      taskHeatGridEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          const cell = e.target && e.target.closest ? e.target.closest(".hc") : null;
          if (cell) {
            e.preventDefault();
            triggerTaskCell(cell);
          }
        }
      });
      taskHeatGridEl.addEventListener("mouseleave", () => {
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
    const shortDate = String(dateKey).replace(/^\d{4}-/, '');
    if (!att || att <= 0) {
      heatDayInfoEl.className = "heat-day-info tier-gray";
      heatDayInfoEl.innerHTML = `<b>${shortDate}</b> ｜ 無練習紀錄`;
    } else {
      const badgeTier = rate === 100 ? "tier-green-perfect" : (rate >= 80 ? "tier-green-high" : (rate >= 60 ? "tier-green-mid" : "tier-green-low"));
      heatDayInfoEl.className = `heat-day-info ${badgeTier}`;
      heatDayInfoEl.innerHTML = `<b>${shortDate}</b> ｜ 正確率 <b>${rate}%</b>`;
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
      const triggerFreeCell = (cell) => {
        if (!cell) return;
        const idx = parseInt(cell.getAttribute("data-idx"), 10);
        if (!isNaN(idx)) {
          pinnedIdx = idx;
          updateHeatDayBadge(idx);
          if (heatDays[idx] && heatDays[idx].key) {
            switchRecordDate(heatDays[idx].key);
          }
        }
      };
      heatGridEl.addEventListener("mouseover", (e) => {
        const cell = e.target && e.target.closest ? e.target.closest(".hc") : null;
        if (!cell) return;
        const idx = parseInt(cell.getAttribute("data-idx"), 10);
        if (!isNaN(idx)) updateHeatDayBadge(idx);
      });
      heatGridEl.addEventListener("click", (e) => {
        triggerFreeCell(e.target && e.target.closest ? e.target.closest(".hc") : null);
      });
      heatGridEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          const cell = e.target && e.target.closest ? e.target.closest(".hc") : null;
          if (cell) {
            e.preventDefault();
            triggerFreeCell(cell);
          }
        }
      });
      heatGridEl.addEventListener("mouseleave", () => {
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

// 模組再匯出 (確保外部相容性零破壞)
export {
  initExportRecordsCard,
  initWeakWordsCard,
  analyzeErrorTag,
  getWeekPendingConquerWords,
  _resolveConquerWordLevel,
  _renderConquerWordCard,
  buildWeekPendingConquerHtml,
  updateWeekConquerSection,
  initConquerCard
};
