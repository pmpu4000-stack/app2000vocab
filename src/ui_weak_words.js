// =====================================================================
// ui_weak_words.js — 個人常錯單字複習小卡模組 (支援時間範圍切換、單字發音、PDF/Excel 一鍵下載)
// =====================================================================
import { sayWord } from "./audio.js?v=20261025_1618";

function analyzeErrorTag(word, zh, ph) {
  const w = String(word || "").toLowerCase();
  const z = String(zh || "").toLowerCase();
  const posMatches = z.match(/\b(n|v|vt|vi|adj|adv|prep|conj|pron|phr)\b/g);
  if (posMatches && new Set(posMatches).size >= 2) {
    return { tag: "多詞性混淆", cls: "tag-pos", icon: "🏷️" };
  }
  if (/(ea|ee|ie|ei|ou|ow|au|aw|ai|ay|oa|oo|oi|oy)/.test(w)) {
    return { tag: "母音/音標易混", cls: "tag-vowel", icon: "🔊" };
  }
  if (/([a-z])\1/.test(w) || w.length >= 8) {
    return { tag: "雙重字母/長詞", cls: "tag-spelling", icon: "🔤" };
  }
  if (/(tion|sion|ment|able|ible|ence|ance|ful|less)$/.test(w)) {
    return { tag: "字尾詞綴弱點", cls: "tag-affix", icon: "🧩" };
  }
  return { tag: "拼字形近弱點", cls: "tag-spelling", icon: "⚠️" };
}

export function initWeakWordsCard() {
  const sec = document.getElementById("weak-words-section");
  const container = document.getElementById("weak-words-container");
  const toggleBtn = document.getElementById("btn-toggle-weak-words-card");
  if (!sec || !toggleBtn) return;

  let currentRange = "7";

  function getWeakWordsForRange(range) {
    const now = Date.now();
    const days = range === "all" ? 9999 : parseInt(range, 10);
    const cutoffDate = new Date(now - days * 86400000).toISOString().split("T")[0];
    
    const wordCounts = new Map();
    try {
      const hist = JSON.parse(localStorage.getItem("student_task_history") || "[]");
      hist.forEach(item => {
        const d = String(item.date || "").trim().split(/[T\s]/)[0].replace(/\//g, "-");
        if (range === "all" || d >= cutoffDate) {
          if (Array.isArray(item.wrongWords)) {
            item.wrongWords.forEach(w => {
              const cleanW = String(w).trim().toLowerCase();
              if (cleanW) {
                wordCounts.set(cleanW, (wordCounts.get(cleanW) || 0) + 1);
              }
            });
          }
        }
      });
    } catch (_) {}

    if (range === "7" || range === "14" || range === "all") {
      try {
        const wm = JSON.parse(localStorage.getItem("weekTaskMistakes") || "[]");
        if (Array.isArray(wm)) {
          wm.forEach(w => {
            const cleanW = String(w).trim().toLowerCase();
            if (cleanW && !wordCounts.has(cleanW)) {
              wordCounts.set(cleanW, 1);
            }
          });
        }
      } catch (_) {}
    }

    if (range === "all" && typeof window !== "undefined" && window.__store && window.__store.DB && window.__store.DB.stat) {
      const stat = window.__store.DB.stat;
      for (const id in stat) {
        const s = stat[id];
        if (s && s.a > s.c) {
          const wObj = (window.__WORDS || []).find(x => x.id === id);
          if (wObj && wObj.word) {
            const cleanW = wObj.word.toLowerCase();
            const wrongCount = Math.max(1, s.a - s.c);
            wordCounts.set(cleanW, Math.max(wordCounts.get(cleanW) || 0, wrongCount));
          }
        }
      }
    }

    // 取得週末補救與後續練習已攻克的單字
    const remedyLearned = new Set();
    try {
      const rawLearned = localStorage.getItem("remedy_learned_words");
      if (rawLearned) {
        const arr = JSON.parse(rawLearned);
        if (Array.isArray(arr)) arr.forEach(w => remedyLearned.add(String(w).trim().toLowerCase()));
      }
    } catch (_) {}

    const isMasteredWord = (wObj) => {
      if (!wObj) return false;
      if (remedyLearned.has(wObj.word.toLowerCase())) return true;
      if (typeof window !== "undefined" && window.__store && typeof window.__store.box === "function") {
        const b = window.__store.box(wObj.id);
        if (b >= 2) return true; // 連續答對 ≥ 2 次，判定克服弱點移出
      }
      return false;
    };

    const list = [];
    const allWords = window.__WORDS || [];
    wordCounts.forEach((count, word) => {
      // ★ 核心新規範：累積答錯 ≥ 2 次才正式列入常錯清單（排除手滑粗心）
      if (count < 2) return;
      const wObj = allWords.find(x => x.word.toLowerCase() === word) || {};
      // ★ 核心新規範：後續已在測驗/練習連續答對 ≥ 2 次，移出常錯榜
      if (isMasteredWord(wObj)) return;

      const tagInfo = analyzeErrorTag(word, wObj.zh, wObj.ph);
      list.push({
        word,
        count,
        zh: wObj.zh || "",
        ph: wObj.ph || "",
        level: wObj.level || 1,
        sent: wObj.sent || "",
        tag: tagInfo.tag,
        tagCls: tagInfo.cls,
        tagIcon: tagInfo.icon
      });
    });

    list.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
    return list;
  }

  function renderWeakWordsUI() {
    const list = getWeakWordsForRange(currentRange);
    const badge = document.getElementById("weak-words-count-badge");
    if (badge) {
      badge.style.display = "none";
    }

    const statText = document.getElementById("weak-words-stat-text");
    const rangeLabel = document.getElementById("weak-words-filter-label");
    const rangeName = currentRange === "7" ? "近 7 天" : (currentRange === "14" ? "近 14 天" : (currentRange === "30" ? "近 30 天" : "全部歷史"));
    if (rangeLabel) rangeLabel.textContent = `${rangeName}統計`;

    const totalErrors = list.reduce((sum, item) => sum + item.count, 0);
    if (statText) {
      if (list.length === 0) {
        statText.innerHTML = `🎉 <strong>太棒了！</strong> 此期間內沒有任何常錯單字。`;
      } else {
        statText.innerHTML = `📊 共 <strong>${list.length}</strong> 個常錯單字 ｜ 累計失誤 <strong>${totalErrors}</strong> 次`;
      }
    }

    const grid = document.getElementById("weak-words-grid");
    if (!grid) return;
    if (list.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:24px; color:var(--ink3); font-size:13.5px;">✨ 目前此區間零錯題紀錄，繼續保持！</div>`;
      return;
    }

    let html = "";
    list.forEach(item => {
      html += `
        <div class="weak-card-item">
          <div class="weak-card-top">
            <span class="weak-word-title">${item.word}</span>
            <span class="weak-err-badge">錯 ${item.count} 次</span>
          </div>
          <div class="weak-tag-badge ${item.tagCls}">${item.tagIcon} ${item.tag}</div>
          <div class="weak-card-zh">${item.zh || "（暫無中文釋義）"}</div>
          <div class="weak-card-sub">
            <span>LEVEL ${item.level}</span>
            <button type="button" class="word-speech-btn" onclick="event.stopPropagation(); window.sayWord('${item.word}')" style="padding:2px 6px; cursor:pointer;" title="播放發音">${SVG_SPEAKER}</button>
          </div>
        </div>
      `;
    });
    grid.innerHTML = html;
  }

  toggleBtn.onclick = (e) => {
    e.preventDefault();
    const isHidden = (container && container.style.display === "none") || sec.classList.contains("is-collapsed");
    if (isHidden) {
      if (container) container.style.display = "block";
      sec.classList.remove("is-collapsed");
      toggleBtn.innerHTML = "收合";
      renderWeakWordsUI();
      sec.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      if (container) container.style.display = "none";
      sec.classList.add("is-collapsed");
      toggleBtn.innerHTML = "展開";
    }
  };

  const tabWrap = document.getElementById("weak-range-tabs");
  if (tabWrap) {
    tabWrap.querySelectorAll(".tab-btn").forEach(btn => {
      btn.onclick = () => {
        tabWrap.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentRange = btn.getAttribute("data-range") || "7";
        renderWeakWordsUI();
      };
    });
  }

  const btnCopy = document.getElementById("btn-copy-weak-words");
  if (btnCopy) {
    btnCopy.onclick = () => {
      const list = getWeakWordsForRange(currentRange);
      if (list.length === 0) { alert("此區間尚無常錯單字可複製。"); return; }
      const rangeName = currentRange === "7" ? "近 7 天" : (currentRange === "14" ? "近 14 天" : (currentRange === "30" ? "近 30 天" : "全部歷史"));
      let text = `【📝 個人常錯單字複習卡 (${rangeName})】\n`;
      list.forEach((item, idx) => {
        text += `${idx + 1}. ${item.word} [L${item.level}] - ${item.zh || ""} (失誤 ${item.count} 次)\n`;
      });
      navigator.clipboard.writeText(text).then(() => {
        alert("📋 已成功複製常錯單字清單！可直接貼上複習。");
      }).catch(() => {
        prompt("請按 Ctrl+C 複製單字：", text);
      });
    };
  }

  const btnExcel = document.getElementById("btn-export-weak-excel");
  if (btnExcel) {
    btnExcel.onclick = () => {
      const list = getWeakWordsForRange(currentRange);
      if (list.length === 0) { alert("此區間尚無常錯單字可匯出。"); return; }
      if (typeof XLSX === "undefined") { alert("Excel 模組載入中，請稍候再試。"); return; }
      const rows = [["序號", "英文單字", "中文釋義", "難度關卡", "失誤次數", "例句"]];
      list.forEach((item, idx) => {
        rows.push([idx + 1, item.word, item.zh || "", "Level " + item.level, item.count, item.sent || ""]);
      });
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "常錯單字表");
      XLSX.writeFile(wb, `常錯單字複習卡_${new Date().toISOString().split("T")[0]}.xlsx`);
    };
  }

  const btnPdf = document.getElementById("btn-export-weak-pdf");
  if (btnPdf) {
    btnPdf.onclick = () => {
      const list = getWeakWordsForRange(currentRange);
      if (list.length === 0) { alert("此區間尚無常錯單字可匯出。"); return; }
      if (typeof html2pdf === "undefined") { alert("PDF 模組載入中，請稍候再試。"); return; }
      const rangeName = currentRange === "7" ? "近 7 天" : (currentRange === "14" ? "近 14 天" : (currentRange === "30" ? "近 30 天" : "全部歷史"));
      const printDiv = document.createElement("div");
      printDiv.style.padding = "24px";
      printDiv.style.fontFamily = "system-ui, sans-serif";
      printDiv.innerHTML = `
        <h2 style="text-align:center; color:#232A4D; margin-bottom:6px;">🎯 英文個人常錯單字複習小卡</h2>
        <div style="text-align:center; font-size:12px; color:#5A6183; margin-bottom:18px;">統計範圍：${rangeName} ｜ 產生日期：${new Date().toLocaleDateString()} ｜ 共 ${list.length} 個弱點單字</div>
        <style>table{page-break-inside:auto!important;break-inside:auto!important;}tr{page-break-inside:auto!important;break-inside:auto!important;}</style><table style="width:100%; border-collapse:collapse; font-size:13px; page-break-inside:auto!important; break-inside:auto!important;">
          <thead>
            <tr style="background:#F1F5F9; border-bottom:2px solid #CBD5E1;">
              <th style="padding:8px; text-align:center; width:40px;">#</th>
              <th style="padding:8px; text-align:left; width:120px;">單字</th>
              <th style="padding:8px; text-align:left; width:140px;">中文釋義</th>
              <th style="padding:8px; text-align:center; width:95px;">盲點特徵</th>
              <th style="padding:8px; text-align:center; width:70px;">關卡</th>
              <th style="padding:8px; text-align:center; width:70px;">失誤次數</th>
              <th style="padding:8px; text-align:left;">重點例句</th>
            </tr>
          </thead>
          <tbody>
            ${list.map((item, idx) => `
              <tr style="border-bottom:1px solid #E2E8F0;">
                <td style="padding:8px; text-align:center; color:#64748B;">${idx + 1}</td>
                <td style="padding:8px; font-weight:bold; color:#1E293B;">${item.word}</td>
                <td style="padding:8px; color:#334155;">${item.zh || "—"}</td>
                <td style="padding:8px; text-align:center; font-size:11px; font-weight:700;"><span style="background:#F3E8FF; color:#7E22CE; padding:2px 6px; border-radius:4px; border:1px solid #E9D5FF;">${item.tagIcon} ${item.tag}</span></td>
                <td style="padding:8px; text-align:center; font-size:11px;">L${item.level}</td>
                <td style="padding:8px; text-align:center; color:#DC2626; font-weight:bold;">${item.count}次</td>
                <td style="padding:8px; font-size:11.5px; color:#475569;">${item.sent || "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
      html2pdf().from(printDiv).set({
        margin: [10, 10, 10, 10],
        filename: `常錯單字複習卡_${new Date().toISOString().split("T")[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      }).save();
    };
  }

  renderWeakWordsUI();
}

