export async function initExportRecordsCard(getter) {
  const m = await import("./ui_export.js");
  if (m && typeof m.initExportRecordsCard === "function") return m.initExportRecordsCard(getter);
}
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
import {
  resolveWordStr,
  getCombinedTaskHistory,
  formatRatePercentage,
  isValidEnglishWordStr,
  clearResolveWordsCache,
  resolveTaskWords,
  resolveDailyPracticeRecord,
  summaryHidden,
  renderSummary,
  toggleSummary
} from "./ui_summary.js";

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
  initConquerCard,
  resolveWordStr,
  getCombinedTaskHistory,
  formatRatePercentage,
  isValidEnglishWordStr,
  clearResolveWordsCache,
  resolveTaskWords,
  resolveDailyPracticeRecord,
  summaryHidden,
  renderSummary,
  toggleSummary
};
