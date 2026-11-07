// =====================================================================
// ui_weak_words.js — 雙週未答對滾入期末測驗單字表
// =====================================================================
import { sayWord } from "./audio.js";
import { _renderConquerWordCard } from "./ui.js";
import { getCachedTaskHistory } from "./store.js";

export function analyzeErrorTag() {
  return { tag: "弱點單字", cls: "tag-spelling", icon: "⚠️" };
}

export function initWeakWordsCard() {
  const sec = document.getElementById("weak-words-section");
  const container = document.getElementById("weak-words-container");
  const toggleBtn = document.getElementById("btn-toggle-weak-words-card");
  if (!sec || !toggleBtn) return;

  function getEffectiveSemesterStart() {
    try {
      const raw = localStorage.getItem("conquer_roll_settings");
      if (raw) {
        const cfg = JSON.parse(raw);
        if (cfg.semesterStartDate) {
          const s = String(cfg.semesterStartDate).trim().split(/[T\s]/)[0].replace(/\//g, "-");
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        }
      }
    } catch (_) {}
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const defStart = (m >= 2 && m <= 7) ? new Date(y, 1, 15) : (m < 2 ? new Date(y - 1, 7, 30) : new Date(y, 7, 30));
    const pad = (n) => String(n).padStart(2, "0");
    return defStart.getFullYear() + "-" + pad(defStart.getMonth() + 1) + "-" + pad(defStart.getDate());
  }

  let activeScope = "current"; // "current" (本學期) | "all" (全歷程封存)

  function getBiweeklyFailedFinalBossWords(scope = activeScope) {
    const historyList = getCachedTaskHistory();

    const failedMap = new Map();
    const masteredMap = new Map();
    const semStart = getEffectiveSemesterStart();

    historyList.forEach(item => {
      if (!item) return;
      const tName = String(item.taskName || "").trim();
      const dStr = String(item.date || "").trim().split(/[T\s]/)[0].replace(/\//g, "-");
      if (scope === "current" && semStart && dStr && dStr < semStart) return;
      
      let isBiweeklyTask = tName.includes("雙週") || tName.includes("消滅") || tName.includes("待攻克") || tName.includes("週末");
      if (!isBiweeklyTask && dStr) {
        const d = new Date(dStr + "T12:00:00");
        if (!isNaN(d.getTime()) && (d.getDay() === 0 || d.getDay() === 6)) {
          isBiweeklyTask = true;
        }
      }
      if (!isBiweeklyTask) return;

      const correctSet = new Set();
      if (Array.isArray(item.correctWords)) {
        item.correctWords.forEach(w => {
          const cw = String(w).replace(/\(.*?\)/g, "").trim().toLowerCase();
          if (cw) {
            correctSet.add(cw);
            masteredMap.set(cw, dStr);
          }
        });
      }

      const recordFailed = (w) => {
        const cw = String(w).replace(/\(.*?\)/g, "").trim().toLowerCase();
        if (cw && !correctSet.has(cw)) {
          failedMap.set(cw, dStr);
        }
      };

      if (Array.isArray(item.wrongWords)) {
        item.wrongWords.forEach(recordFailed);
      }
      if (Array.isArray(item.words)) {
        item.words.forEach(recordFailed);
      }
    });

    const finalWords = [];
    failedMap.forEach((fDate, w) => {
      const mDate = masteredMap.get(w);
      if (!mDate || mDate < fDate) {
        finalWords.push(w);
      }
    });

    finalWords.sort((a, b) => a.localeCompare(b));
    return finalWords;
  }

  function renderWeakWordsUI() {
    const words = getBiweeklyFailedFinalBossWords(activeScope);
    const statText = document.getElementById("weak-words-stat-text");
    const grid = document.getElementById("weak-words-grid");

    if (statText) {
      statText.innerHTML = "👾 期末大挑戰單字表";
    }

    let activeWordWrap = document.getElementById("weak-words-active-card-wrap");
    if (!activeWordWrap && grid && grid.parentNode) {
      activeWordWrap = document.createElement("div");
      activeWordWrap.id = "weak-words-active-card-wrap";
      activeWordWrap.style.cssText = "margin-bottom:8px;";
      grid.parentNode.insertBefore(activeWordWrap, grid);
    }

    if (!grid) return;
    if (words.length === 0) {
      if (activeWordWrap) activeWordWrap.innerHTML = "";
      grid.innerHTML = "<div style=\"padding:16px 8px; text-align:center; color:var(--ink3, #94A3B8); font-size:13px; width:100%;\">✨ 雙週測驗全數答對，無期末大挑戰弱點單字！</div>";
      return;
    }

    if (!window._finalBossActiveWord || !words.includes(window._finalBossActiveWord)) {
      window._finalBossActiveWord = words[0];
    }
    const curActive = window._finalBossActiveWord;

    if (activeWordWrap && typeof _renderConquerWordCard === "function") {
      activeWordWrap.innerHTML = _renderConquerWordCard(curActive);
    }

    grid.innerHTML = words.map(w => {
      const isAct = (w === curActive);
      const esc = w.replace(/"/g, "&quot;");
      return "<span class=\"word-pill-tag wrong " + (isAct ? "is-active" : "") + "\" data-word=\"" + esc + "\" style=\"cursor:pointer;\" title=\"點擊切換單字卡與發音\">" + w + "</span>";
    }).join("");

    grid.querySelectorAll(".word-pill-tag").forEach(tag => {
      tag.onclick = (e) => {
        e.stopPropagation();
        const word = tag.getAttribute("data-word");
        if (word) {
          window._finalBossActiveWord = word;
          if (activeWordWrap && typeof _renderConquerWordCard === "function") {
            activeWordWrap.innerHTML = _renderConquerWordCard(word);
          }
          grid.querySelectorAll(".word-pill-tag").forEach(t => {
            t.classList.toggle("is-active", t.getAttribute("data-word") === word);
          });
          if (typeof sayWord === "function") sayWord(word);
        }
      };
    });
  }
  toggleBtn.onclick = () => {
    const isCollapsed = sec.classList.contains("is-collapsed");
    if (isCollapsed) {
      sec.classList.remove("is-collapsed");
      toggleBtn.innerHTML = "收合";
      if (container) container.style.display = "block";
      renderWeakWordsUI();
    } else {
      sec.classList.add("is-collapsed");
      toggleBtn.innerHTML = "展開";
      if (container) container.style.display = "none";
    }
  };

  const btnCopy = document.getElementById("btn-copy-weak-words");
  if (btnCopy) {
    btnCopy.onclick = () => {
      const words = getBiweeklyFailedFinalBossWords();
      if (words.length === 0) {
        alert("目前無期末大挑戰單字可複製。");
        return;
      }
      navigator.clipboard.writeText(words.join(", ")).then(() => {
        alert(`📋 已成功複製 ${words.length} 個期末測驗單字！`);
      });
    };
  }

  renderWeakWordsUI();
}
