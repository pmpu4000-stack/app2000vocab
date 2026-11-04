const fs = require("fs");
const path = require("path");

const repoDir = path.join(__dirname, "..");
const indexHtmlPath = path.join(repoDir, "index.html");
let html = fs.readFileSync(indexHtmlPath, "utf8");

// 1. 插入 Parent Portal Screen HTML（在 <div class="app"> 前）
const appTag = '<div class="app">';
const parentPortalHtml = `  <!-- 👨‍👩‍👧 家長專屬學習歷程畫面 (在遊戲網頁直接切換呈現) -->
  <div id="parent-portal-screen" style="display:none; max-width:960px; margin:0 auto; padding:24px 16px 60px; box-sizing:border-box;">
    <!-- 頂部資訊列 -->
    <header style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:24px; padding-bottom:16px; border-bottom:1.5px solid var(--line, #E7E9F5);">
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="width:44px; height:44px; border-radius:12px; background:linear-gradient(135deg, #6C4CE0, #4A2BB0); color:#fff; display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:800; box-shadow:0 6px 14px -3px rgba(108,76,224,0.4);">
          👨‍👩‍👧
        </div>
        <div>
          <h1 style="font-size:20px; font-weight:800; margin:0; color:var(--ink, #232A4D); display:flex; align-items:center; gap:8px;">
            拼字小特工 <span style="font-size:12.5px; font-weight:700; padding:3px 9px; border-radius:8px; background:rgba(108,76,224,0.1); color:var(--violet, #6C4CE0);">家長專屬視圖</span>
          </h1>
          <div style="font-size:13px; color:var(--ink2, #5A6183); margin-top:3px;">
            家長：<b id="pp-parent-name" style="color:var(--ink, #232A4D);">-</b> ｜ 
            子女：<b id="pp-student-name" style="color:#2563eb;">-</b> (<span id="pp-student-class">-</span> <span id="pp-student-user">-</span>)
          </div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <button id="pp-btn-refresh" type="button" style="display:flex; align-items:center; gap:6px; padding:9px 16px; border-radius:10px; border:1px solid var(--line, #E7E9F5); background:var(--card, #fff); color:var(--ink, #232A4D); font-weight:700; font-size:13.5px; cursor:pointer; transition:all .2s; box-shadow:0 2px 6px rgba(0,0,0,0.04);">
          🔄 重新整理
        </button>
        <button id="pp-btn-logout" type="button" style="display:flex; align-items:center; gap:6px; padding:9px 16px; border-radius:10px; border:none; background:#ef4444; color:#fff; font-weight:700; font-size:13.5px; cursor:pointer; transition:all .2s; box-shadow:0 4px 12px -3px rgba(239,68,68,0.4);">
          🚪 登出
        </button>
      </div>
    </header>

    <!-- 狀態摘要三卡片 -->
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px; margin-bottom:24px;">
      <!-- 今日任務卡 -->
      <div style="background:var(--card, #fff); border:1.5px solid var(--line, #E7E9F5); border-radius:16px; padding:18px 20px; box-shadow:0 6px 16px -4px rgba(35,42,77,0.06);">
        <div style="font-size:13px; font-weight:700; color:var(--ink2, #5A6183); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <span>📌 今日指定測驗</span>
          <span id="pp-today-badge" style="font-size:11.5px; padding:2px 7px; border-radius:6px; font-weight:700; background:#f1f5f9; color:#475569;">-</span>
        </div>
        <div id="pp-today-score" style="font-size:26px; font-weight:800; color:var(--ink, #232A4D); line-height:1.2;">-</div>
        <div id="pp-today-desc" style="font-size:12.5px; color:var(--ink2, #5A6183); margin-top:6px;">-</div>
      </div>

      <!-- 累計作答統計卡 -->
      <div style="background:var(--card, #fff); border:1.5px solid var(--line, #E7E9F5); border-radius:16px; padding:18px 20px; box-shadow:0 6px 16px -4px rgba(35,42,77,0.06);">
        <div style="font-size:13px; font-weight:700; color:var(--ink2, #5A6183); margin-bottom:8px;">🎯 累計作答概況</div>
        <div id="pp-total-answered" style="font-size:26px; font-weight:800; color:#2563eb; line-height:1.2;">-</div>
        <div id="pp-total-accuracy" style="font-size:12.5px; color:var(--ink2, #5A6183); margin-top:6px;">平均正答率：-</div>
      </div>

      <!-- 連勝與闖關等級卡 -->
      <div style="background:var(--card, #fff); border:1.5px solid var(--line, #E7E9F5); border-radius:16px; padding:18px 20px; box-shadow:0 6px 16px -4px rgba(35,42,77,0.06);">
        <div style="font-size:13px; font-weight:700; color:var(--ink2, #5A6183); margin-bottom:8px;">🔥 闖關與掌握單字</div>
        <div id="pp-mastered-words" style="font-size:26px; font-weight:800; color:#10b981; line-height:1.2;">-</div>
        <div id="pp-streak-info" style="font-size:12.5px; color:var(--ink2, #5A6183); margin-top:6px;">連續學習天數：-</div>
      </div>
    </div>

    <!-- 歷程表格卡片 -->
    <div style="background:var(--card, #fff); border:1.5px solid var(--line, #E7E9F5); border-radius:16px; padding:20px; box-shadow:0 6px 16px -4px rgba(35,42,77,0.06); margin-bottom:24px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
        <h3 style="margin:0; font-size:16.5px; font-weight:800; color:var(--ink, #232A4D); display:flex; align-items:center; gap:6px;">
          <span>📊</span> 子女學習與測驗歷程明細
        </h3>
        <input type="text" id="pp-history-filter" placeholder="搜尋日期或任務名稱..." style="padding:7px 12px; border:1px solid var(--line, #E7E9F5); border-radius:8px; font-size:13px; outline:none; background:var(--paper, #F6F7FB); color:var(--ink, #232A4D); width:200px;">
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:13.5px; text-align:left;">
          <thead>
            <tr style="border-bottom:1.5px solid var(--line, #E7E9F5); color:var(--ink2, #5A6183);">
              <th style="padding:10px 8px; font-weight:700;">日期</th>
              <th style="padding:10px 8px; font-weight:700;">練習/測驗項目</th>
              <th style="padding:10px 8px; font-weight:700; text-align:center;">作答題數</th>
              <th style="padding:10px 8px; font-weight:700; text-align:center;">答對題數</th>
              <th style="padding:10px 8px; font-weight:700; text-align:center;">正答率</th>
              <th style="padding:10px 8px; font-weight:700; text-align:right;">狀態評定</th>
            </tr>
          </thead>
          <tbody id="pp-history-tbody">
            <tr><td colspan="6" style="text-align:center; padding:24px; color:var(--ink2, #5A6183);">尚無歷程資料</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 弱項單字清單卡片 -->
    <div id="pp-weak-section" style="background:var(--card, #fff); border:1.5px solid var(--line, #E7E9F5); border-radius:16px; padding:20px; box-shadow:0 6px 16px -4px rgba(35,42,77,0.06); display:none;">
      <h3 style="margin:0 0 12px 0; font-size:16.5px; font-weight:800; color:var(--ink, #232A4D); display:flex; align-items:center; gap:6px;">
        <span>💡</span> 建議加強練習之單字
      </h3>
      <div id="pp-weak-words-list" style="display:flex; flex-wrap:wrap; gap:8px;"></div>
    </div>
  </div>\n\n  ` + appTag;

if (!html.includes('id="parent-portal-screen"')) {
  html = html.replace(appTag, parentPortalHtml);
  console.log("parent-portal-screen inserted into index.html");
}

// 2. 替換登入分流導向代碼
const oldRoleRouting = `          // 角色分流導向
          if (result.role === "parent") {
            setLoginStatus("家長身分驗證成功，正在前往家長查閱專區...", "loading-game");
            sessionStorage.setItem("history_auth_user", user);
            sessionStorage.setItem("history_auth_pass", pass);
            if (result.studentBinding) {
              sessionStorage.setItem("parent_target_student", result.studentBinding);
            }
            setTimeout(() => {
              window.location.href = "history.html?role=parent&u=" + encodeURIComponent(user);
            }, 300);
            return;
          }`;

const newRoleRouting = `          // 角色分流導向：直接在遊戲網頁切換至對應畫面
          if (result.role === "parent") {
            setLoginStatus("家長身分驗證成功，直接載入子女學習歷程...", "loading-game");
            sessionStorage.setItem("current_user", user);
            sessionStorage.setItem("current_pass", pass);
            sessionStorage.setItem("user_role", "parent");
            setTimeout(() => {
              renderParentPortalView(result, user, pass);
            }, 250);
            return;
          }`;

if (html.includes(oldRoleRouting)) {
  html = html.replace(oldRoleRouting, newRoleRouting);
  console.log("Role routing updated in index.html");
}

// 3. 加入 renderParentPortalView 函式實作
const renderParentFn = `
    // ══════════════════════════════════════════════════════════════
    // 👨‍👩‍👧 家長專屬視圖渲染引擎 (免跳轉、零延遲、直接在遊戲網頁切換)
    // ══════════════════════════════════════════════════════════════
    let __currentParentResult = null;
    let __currentParentUser = null;
    let __currentParentPass = null;

    function renderParentPortalView(result, user, pass) {
      __currentParentResult = result;
      __currentParentUser = user;
      __currentParentPass = pass;

      // 關閉登入遮罩並切換畫面視圖
      const ov = document.getElementById("login-overlay");
      if (ov) {
        ov.style.setProperty("display", "none", "important");
        ov.classList.add("hidden");
      }
      document.body.classList.remove("is-logging-in");

      const appEl = document.querySelector(".app");
      if (appEl) appEl.style.display = "none";

      const portal = document.getElementById("parent-portal-screen");
      if (portal) portal.style.display = "block";

      // 1. 填入家長與子女身份資訊
      const pName = result.parentRealName || result.parentUsername || user;
      const sName = result.realName || result.username || "貴子弟";
      const sClass = result.className ? "班級：" + result.className : "";
      const sUser = result.username ? "學號：" + result.username : "";

      const pNameEl = document.getElementById("pp-parent-name");
      if (pNameEl) pNameEl.textContent = pName;
      const sNameEl = document.getElementById("pp-student-name");
      if (sNameEl) sNameEl.textContent = sName;
      const sClassEl = document.getElementById("pp-student-class");
      if (sClassEl) sClassEl.textContent = sClass;
      const sUserEl = document.getElementById("pp-student-user");
      if (sUserEl) sUserEl.textContent = sUser;

      // 2. 今日測驗成果
      const todayBadge = document.getElementById("pp-today-badge");
      const todayScore = document.getElementById("pp-today-score");
      const todayDesc = document.getElementById("pp-today-desc");

      if (result.todayTaskResult && (result.todayTaskResult.score !== undefined || result.todayTaskResult.completed)) {
        const t = result.todayTaskResult;
        const total = Number(t.total || t.wordCount || 0);
        const correct = Number(t.correct || 0);
        const score = (t.score !== undefined) ? Number(t.score) : (total > 0 ? Math.round((correct / total) * 100) : 0);
        if (todayBadge) {
          todayBadge.textContent = "已完成測驗";
          todayBadge.style.background = "#dcfce7";
          todayBadge.style.color = "#15803d";
        }
        if (todayScore) {
          todayScore.textContent = score + " 分";
          todayScore.style.color = score >= 80 ? "#16a34a" : (score >= 60 ? "#2563eb" : "#ea580c");
        }
        if (todayDesc) {
          todayDesc.textContent = total > 0 ? ("共 " + total + " 題，答對 " + correct + " 題 (正答率 " + Math.round((correct/total)*100) + "%)") : "今日測驗已完成";
        }
      } else if (result.assignedTask) {
        if (todayBadge) {
          todayBadge.textContent = "今日待完成";
          todayBadge.style.background = "#fef3c7";
          todayBadge.style.color = "#b45309";
        }
        if (todayScore) {
          todayScore.textContent = "尚未測驗";
          todayScore.style.color = "#64748b";
        }
        if (todayDesc) {
          const tName = result.assignedTask.taskName || "每日指定測驗";
          const cnt = (Array.isArray(result.assignedTask.words)) ? result.assignedTask.words.length : "";
          todayDesc.textContent = tName + (cnt ? " (共 " + cnt + " 題)" : "");
        }
      } else {
        if (todayBadge) {
          todayBadge.textContent = "自主學習日";
          todayBadge.style.background = "#f1f5f9";
          todayBadge.style.color = "#475569";
        }
        if (todayScore) {
          todayScore.textContent = "自主練習";
          todayScore.style.color = "#64748b";
        }
        if (todayDesc) {
          todayDesc.textContent = "今日老師未指定全班測驗，鼓勵自主練習！";
        }
      }

      // 3. 累計作答概況與掌握度
      let agentData = null;
      try {
        if (result.records && result.records["spellAgent.v2"]) {
          agentData = (typeof result.records["spellAgent.v2"] === "string") 
            ? JSON.parse(result.records["spellAgent.v2"]) 
            : result.records["spellAgent.v2"];
        }
      } catch(_) {}

      const totalAnsEl = document.getElementById("pp-total-answered");
      const totalAccEl = document.getElementById("pp-total-accuracy");
      const masteredEl = document.getElementById("pp-mastered-words");
      const streakEl = document.getElementById("pp-streak-info");

      const attempts = agentData ? Number(agentData.attempts || 0) : 0;
      const correct = agentData ? Number(agentData.correct || 0) : 0;
      const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
      const mastered = agentData && agentData.session ? Number(agentData.session.mastered || 0) : (agentData && agentData.box ? Object.keys(agentData.box).length : 0);
      const streak = agentData ? Number(agentData.streak || 0) : 0;

      if (totalAnsEl) totalAnsEl.textContent = attempts + " 題";
      if (totalAccEl) totalAccEl.textContent = "答對 " + correct + " 題 ｜ 正答率 " + accuracy + "%";
      if (masteredEl) masteredEl.textContent = mastered + " 個";
      if (streakEl) streakEl.textContent = "連續學習 " + streak + " 天";

      // 4. 歷程表格渲染
      const historyList = Array.isArray(result.dailyTaskHistory) ? result.dailyTaskHistory.slice() : [];
      historyList.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

      function renderHistoryRows(items) {
        const tbody = document.getElementById("pp-history-tbody");
        if (!tbody) return;
        if (!items || items.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--ink2, #5A6183);">尚無歷程資料</td></tr>';
          return;
        }
        tbody.innerHTML = items.map(item => {
          const dStr = String(item.date || "").split(/[T\s]/)[0];
          const taskName = item.taskName || (item.mode === "daily_task" ? "每日測驗" : "自主練習");
          const isExam = taskName !== "自主練習" && !String(taskName).includes("未指派");
          const modeBadge = isExam 
            ? '<span style="background:rgba(108,76,224,0.1); color:#6C4CE0; padding:2px 8px; border-radius:6px; font-weight:700; font-size:12px;">' + taskName + '</span>'
            : '<span style="background:#f1f5f9; color:#475569; padding:2px 8px; border-radius:6px; font-weight:700; font-size:12px;">' + taskName + '</span>';
          
          const ans = Number(item.answered || item.total || 0);
          const cor = Number(item.correct || 0);
          const acc = ans > 0 ? Math.round((cor / ans) * 100) : (item.accuracy ? Math.round(Number(item.accuracy)) : 0);
          
          let accColor = "#16a34a";
          let statusText = "🌟 優秀卓越";
          if (acc < 60) {
            accColor = "#ef4444";
            statusText = "💪 建議加強";
          } else if (acc < 80) {
            accColor = "#2563eb";
            statusText = "👍 良好過關";
          }

          return '<tr style="border-bottom:1px solid var(--line, #E7E9F5);">' +
            '<td style="padding:12px 8px; font-family:monospace; font-weight:600;">' + dStr + '</td>' +
            '<td style="padding:12px 8px;">' + modeBadge + '</td>' +
            '<td style="padding:12px 8px; text-align:center; font-weight:600;">' + ans + '</td>' +
            '<td style="padding:12px 8px; text-align:center; font-weight:600; color:#16a34a;">' + cor + '</td>' +
            '<td style="padding:12px 8px; text-align:center; font-weight:800; color:' + accColor + ';">' + acc + '%</td>' +
            '<td style="padding:12px 8px; text-align:right; font-weight:700; font-size:12.5px;">' + statusText + '</td>' +
          '</tr>';
        }).join("");
      }

      renderHistoryRows(historyList);

      // 歷程過濾功能
      const filterInput = document.getElementById("pp-history-filter");
      if (filterInput) {
        filterInput.oninput = () => {
          const q = filterInput.value.trim().toLowerCase();
          if (!q) {
            renderHistoryRows(historyList);
          } else {
            const filtered = historyList.filter(it => 
              String(it.date || "").toLowerCase().includes(q) || 
              String(it.taskName || "").toLowerCase().includes(q)
            );
            renderHistoryRows(filtered);
          }
        };
      }

      // 5. 弱項單字清單
      const weakSection = document.getElementById("pp-weak-section");
      const weakListEl = document.getElementById("pp-weak-words-list");
      let weakWords = [];
      if (agentData && agentData.stat) {
        for (const w in agentData.stat) {
          const st = agentData.stat[w];
          if (st && st.w && Number(st.w) > 0) {
            weakWords.push({ word: w, wrong: Number(st.w), attempts: Number(st.a || 0) });
          }
        }
      }
      if (weakWords.length > 0 && weakSection && weakListEl) {
        weakWords.sort((a, b) => b.wrong - a.wrong);
        weakListEl.innerHTML = weakWords.slice(0, 20).map(item => 
          '<span style="padding:4px 10px; border-radius:8px; background:#fef2f2; border:1px solid #fee2e2; color:#991b1b; font-size:13px; font-weight:700; display:inline-flex; align-items:center; gap:5px;">' +
            item.word + ' <small style="font-size:11px; opacity:0.8;">(錯 ' + item.wrong + ' 次)</small>' +
          '</span>'
        ).join("");
        weakSection.style.display = "block";
      } else if (weakSection) {
        weakSection.style.display = "none";
      }

      // 6. 重新整理按鈕事件
      const refreshBtn = document.getElementById("pp-btn-refresh");
      if (refreshBtn) {
        refreshBtn.onclick = async () => {
          refreshBtn.disabled = true;
          refreshBtn.textContent = "⏳ 載入中...";
          try {
            const resp = await fetch(GAS_URL + "?action=checkAndGetData", {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({ user: __currentParentUser, pass: __currentParentPass })
            });
            const latestResult = await resp.json();
            if (latestResult.status === "success") {
              renderParentPortalView(latestResult, __currentParentUser, __currentParentPass);
            } else {
              alert(latestResult.message || "更新失敗，請稍候重試");
            }
          } catch(err) {
            console.error("更新歷程失敗：", err);
            alert("網路連線不穩，請稍候再試");
          } finally {
            refreshBtn.disabled = false;
            refreshBtn.textContent = "🔄 重新整理";
          }
        };
      }

      // 7. 登出按鈕事件
      const logoutBtn = document.getElementById("pp-btn-logout");
      if (logoutBtn) {
        logoutBtn.onclick = () => {
          sessionStorage.clear();
          localStorage.removeItem("current_user");
          localStorage.removeItem("user_role");
          localStorage.removeItem("current_pass");
          if (portal) portal.style.display = "none";
          if (appEl) appEl.style.display = "";
          if (ov) {
            ov.style.removeProperty("display");
            ov.style.setProperty("display", "flex", "important");
            ov.classList.remove("hidden");
          }
          document.body.classList.add("is-logging-in");
          const uInput = document.getElementById("login-user");
          const pInput = document.getElementById("login-pass");
          if (pInput) pInput.value = "";
          if (uInput) { uInput.value = ""; uInput.focus(); }
          setLoginStatus("已安全登出", "success");
        };
      }
    }
`;

if (!html.includes("function renderParentPortalView")) {
  const insertMarker = "window.__CURRENT_USER = user;";
  const idx = html.indexOf(insertMarker);
  if (idx !== -1) {
    html = html.substring(0, idx) + renderParentFn + "\n\n          " + html.substring(idx);
    console.log("renderParentPortalView injected into index.html");
  } else {
    console.warn("Marker not found, injecting before </script>");
    const scriptEnd = html.lastIndexOf("</script>");
    html = html.substring(0, scriptEnd) + renderParentFn + "\n" + html.substring(scriptEnd);
  }
}

fs.writeFileSync(indexHtmlPath, html, "utf8");
console.log("index.html updated successfully!");
