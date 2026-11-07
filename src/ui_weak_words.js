// =====================================================================
// ui_weak_words.js — 雙週未答對滾入期末測驗單字表
// =====================================================================
import { sayWord } from "./audio.js?v=20261106_1835";

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
    let historyList = [];
    try {
      historyList = JSON.parse(localStorage.getItem("student_task_history") || "[]");
    } catch (_) {
      historyList = [];
    }

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
    const curWords = getBiweeklyFailedFinalBossWords("current");
    const allWords = getBiweeklyFailedFinalBossWords("all");
    const words = activeScope === "all" ? allWords : curWords;
    const statText = document.getElementById("weak-words-stat-text");
    const grid = document.getElementById("weak-words-grid");

    if (statText) {
      const scopeLabel = activeScope === "all" ? "全歷程封存" : "本學期";
      if (words.length === 0) {
        statText.innerHTML = "🎉 <strong>太棒了！</strong> [" + scopeLabel + "] 目前無任何雙週待攻克弱點單字。";
      } else {
        statText.innerHTML = "👾 期末大挑戰單字表 [" + scopeLabel + "]：共 <strong>" + words.length + "</strong> 字";
      }
    }

    const tabsContainer = document.getElementById("weak-words-scope-tabs");
    if (!tabsContainer) {
      const toolbar = document.querySelector(".weak-words-toolbar");
      if (toolbar) {
        const tabWrapper = document.createElement("div");
        tabWrapper.id = "weak-words-scope-tabs";
        tabWrapper.className = "weak-range-tabs";
        tabWrapper.style.cssText = "display:inline-flex; gap:4px; align-items:center;";
        tabWrapper.innerHTML = "<button type=\"button\" class=\"tab-btn active\" data-scope=\"current\" style=\"padding:4px 10px; font-size:12px; cursor:pointer;\">本學期 (" + curWords.length + ")</button><button type=\"button\" class=\"tab-btn\" data-scope=\"all\" style=\"padding:4px 10px; font-size:12px; cursor:pointer;\">全歷程封存 (" + allWords.length + ")</button>";
        toolbar.appendChild(tabWrapper);
        tabWrapper.querySelectorAll(".tab-btn").forEach(btn => {
          btn.onclick = (e) => {
            e.stopPropagation();
            activeScope = btn.getAttribute("data-scope") || "current";
            renderWeakWordsUI();
          };
        });
      }
    } else {
      tabsContainer.querySelectorAll(".tab-btn").forEach(btn => {
        const sc = btn.getAttribute("data-scope");
        btn.classList.toggle("active", sc === activeScope);
        if (sc === "current") btn.textContent = "本學期 (" + curWords.length + ")";
        else if (sc === "all") btn.textContent = "全歷程封存 (" + allWords.length + ")";
      });
    }

    if (!grid) return;
    if (words.length === 0) {
      grid.innerHTML = "<div style=\"padding:16px 8px; text-align:center; color:var(--ink3, #94A3B8); font-size:13px; width:100%;\">✨ " + (activeScope === "all" ? "全歷程" : "本學期") + "測驗全數答對，無弱點單字！</div>";
      return;
    }

    grid.innerHTML = words.map(w => {
      const esc = w.replace(/"/g, "&quot;");
      return "<span class=\"word-pill-tag wrong\" data-word=\"" + esc + "\" style=\"cursor:pointer;\" title=\"點擊聆聽發音\">" + w + "</span>";
    }).join("");

    grid.querySelectorAll(".word-pill-tag").forEach(tag => {
      tag.onclick = (e) => {
        e.stopPropagation();
        const word = tag.getAttribute("data-word");
        if (word && typeof sayWord === "function") sayWord(word);
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
