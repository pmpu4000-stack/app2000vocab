// =====================================================================
// ui_weak_words.js — 雙週未答對滾入期末測驗單字表
// =====================================================================
import { sayWord } from "./audio.js?v=20261025_1618";

export function analyzeErrorTag() {
  return { tag: "弱點單字", cls: "tag-spelling", icon: "⚠️" };
}

export function initWeakWordsCard() {
  const sec = document.getElementById("weak-words-section");
  const container = document.getElementById("weak-words-container");
  const toggleBtn = document.getElementById("btn-toggle-weak-words-card");
  if (!sec || !toggleBtn) return;

  function getBiweeklyFailedFinalBossWords() {
    let historyList = [];
    try {
      historyList = JSON.parse(localStorage.getItem("student_task_history") || "[]");
    } catch (_) {
      historyList = [];
    }

    const failedMap = new Map();
    const masteredMap = new Map();

    historyList.forEach(item => {
      if (!item) return;
      const tName = String(item.taskName || "").trim();
      const dStr = String(item.date || "").trim().split(/[T\s]/)[0].replace(/\//g, "-");
      
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
    const words = getBiweeklyFailedFinalBossWords();
    const statText = document.getElementById("weak-words-stat-text");
    const grid = document.getElementById("weak-words-grid");

    if (statText) {
      if (words.length === 0) {
        statText.innerHTML = `🎉 <strong>太棒了！</strong> 目前無任何雙週待攻克弱點單字。`;
      } else {
        statText.innerHTML = `👾 期末必考單字表：共 <strong>${words.length}</strong> 字`;
      }
    }

    if (!grid) return;
    if (words.length === 0) {
      grid.innerHTML = `<div style="padding:16px 8px; text-align:center; color:var(--ink3, #94A3B8); font-size:13px; width:100%;">✨ 雙週測驗全數答對，無期末待攻克弱點單字！</div>`;
      return;
    }

    grid.innerHTML = words.map(w => {
      const esc = w.replace(/"/g, "&quot;");
      return `<span class="word-pill-tag wrong" data-word="${esc}" style="cursor:pointer;" title="點擊聆聽發音">${w}</span>`;
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
        alert("目前無期末待攻克單字可複製。");
        return;
      }
      navigator.clipboard.writeText(words.join(", ")).then(() => {
        alert(`📋 已成功複製 ${words.length} 個期末測驗單字！`);
      });
    };
  }

  renderWeakWordsUI();
}
