// =====================================================================
// auth.js — 拼字小特工 登入驗證、身分檢查、角色動態視圖與會話管理模組
// =====================================================================
(function(window, document) {
  const getScriptUrl = () => window.scriptUrl || "https://script.google.com/macros/s/AKfycbx1hyCNJxqFMoaJgIxfZqLYIYH00NegI1Yd8NJP6gRjqwOndWGkmr-H9tGvVwK_axM9/exec";
  const formatDateDash = (dt = new Date()) => (window.formatDateDash ? window.formatDateDash(dt) : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`);
  const formatDateSlash = (dt = new Date()) => (window.formatDateSlash ? window.formatDateSlash(dt) : formatDateDash(dt).replace(/-/g, "/"));

    let isLoggingIn = false;
    const loginBtn = document.getElementById('login-btn');
    const msgEl = document.getElementById('login-msg');

    const setLoginStatus = (text, type = "loading-data") => {
      if (!msgEl) return;
      if (!text) {
        msgEl.className = "login-status-banner";
        msgEl.innerHTML = "&nbsp;";
        return;
      }
      msgEl.className = `login-status-banner active msg-${type}`;
      let icon = "⚡";
      if (type === "loading-data" || type === "loading") icon = "📦";
      else if (type === "loading-game" || type === "success") icon = "🎮";
      else if (type === "error") icon = "❌";
      else if (type === "warning") icon = "⏰";
      msgEl.innerHTML = `<span style="font-size:16px;">${icon}</span> <span>${text}</span>`;
    };

    
// 行動裝置輸入時自動滾動至可視區域中央，避免被虛擬鍵盤遮擋
(function bindMobileKeyboardHandler() {
  function scrollIntoSafeView(el) {
    if (!el) return;
    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }, 120);
    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }, 350);
  }

  ['login-user', 'login-pass'].forEach(id => {
    const inp = document.getElementById(id);
    if (inp) {
      inp.addEventListener('focus', function() {
        scrollIntoSafeView(this);
      });
    }
  });

  // 🚀 全局智慧避讓手機虛擬鍵盤：涵蓋登入、拼字、修正模式與所有操作按鈕
  function autoAvoidKeyboard(el) {
    if (!el) return;
    setTimeout(() => {
      const parentCard = el.closest('#login-overlay, .quiz-screen') || el;
      if (parentCard && typeof parentCard.scrollIntoView === 'function') {
        parentCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }, 120);
  }

  document.addEventListener('focusin', (e) => { /* passive */
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      autoAvoidKeyboard(e.target);
    }
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        autoAvoidKeyboard(activeEl);
      }
    });
  }
})();

    loginBtn.addEventListener('click', async () => {
      if (isLoggingIn) return;
      const user = document.getElementById('login-user').value.trim();
      const pass = document.getElementById('login-pass').value.trim();

      if (!user || !pass) {
        setLoginStatus("請輸入帳號與密碼登入", "error");
        return;
      }

      isLoggingIn = true;
      loginBtn.disabled = true;
      loginBtn.style.opacity = "0.75";
      const isParentGuess = user.toLowerCase().startsWith('p') && user.length > 1;
      const isTeacherGuess = user.toLowerCase().startsWith('t') || user.toLowerCase().startsWith('admin');
      let targetHint = "個人學習";
      if (isParentGuess) targetHint = `子女（${user.slice(1)}）學習`;
      else if (isTeacherGuess) targetHint = "教學管理";
      setLoginStatus(`正在載入${targetHint}資料...`, "loading-data");

      try {
        let response = null;
        let lastError = null;

        // 健全重試機制：處理 GAS 冷啟動或暫時性網路抖動 (最多嘗試 3 次)
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);
            response = await fetch(scriptUrl, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({ action: "login", username: user, password: pass }),
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (response && response.ok) break;
          } catch (netErr) {
            lastError = netErr;
            if (attempt < 3) {
              setLoginStatus(`伺服器喚醒中，正在進行第 ${attempt} 次連線...`, "loading-data");
              await new Promise(r => setTimeout(r, 1200));
            }
          }
        }

        if (!response) {
          throw (lastError || new Error("連線逾時"));
        }

        const rawText = await response.text();
        let result = {};
        try {
          result = JSON.parse(rawText);
        } catch (_) {
          if (rawText.includes("帳號或密碼錯誤")) {
            result = { status: "error", message: "帳號或密碼錯誤" };
          } else {
            throw new Error("伺服器回應格式異常");
          }
        }

        if (result.status === "success") {
          // ── 帳號資料完全隔離與安全零污染保證 ──
          const lastUser = (localStorage.getItem("current_user") || "").trim();
          const isDifferentUser = !lastUser || lastUser.toLowerCase() !== user.toLowerCase();

          // 判定雲端是否有實質紀錄（必須是含有有效 spellAgent.v2 的物件）
          const hasCloudRecords = result.records && 
                                  typeof result.records === "object" && 
                                  !Array.isArray(result.records) && 
                                  Object.keys(result.records).length > 0 &&
                                  !!result.records["spellAgent.v2"];

          let localAgentData = null;
          try {
            const rawLocal = localStorage.getItem("spellAgent.v2");
            if (rawLocal) {
              const parsed = JSON.parse(rawLocal);
              if (parsed && (parsed.attempts > 0 || parsed.points > 0 || (parsed.stat && Object.keys(parsed.stat).length > 0))) {
                localAgentData = parsed;
              }
            }
          } catch(_) {}

          // 🚀 核心規範：每次登入時徹底清除所有本機快取與歷史紀錄，確保一人一機絕對純淨隔離，完全免除他人帳號影響
          purgeAllStudentSessionAndLocalData();

          localStorage.setItem("current_user", user);
          localStorage.setItem("user_role", result.role || "student");

          // 角色分流導向：家長身分啟用專屬儀表板過濾（顯示家長帳號、隱藏作答題型、保留五大歷程方塊）
          if (result.role === "parent") {
            const childAcc = result.studentUser || (user.toLowerCase().startsWith('p') ? user.slice(1) : user);
            setLoginStatus(`家長身分驗證成功，正在載入子女（${childAcc}）學習成果...`, "loading-game");
            document.body.classList.add("role-parent");
            document.documentElement.classList.add("role-parent");
            localStorage.setItem("current_user", user);
            localStorage.setItem("user_role", "parent");
            sessionStorage.setItem("current_user", user);
            sessionStorage.setItem("user_role", "parent");
            window.__PARENT_USER = user;
            window.__PARENT_STUDENT = result.realName || result.username || "";
            applyRoleBasedView("parent", result);
          }
          if (result.role === "teacher" || result.role === "admin") {
            setLoginStatus("載入完成", "loading-game");
            document.body.classList.add("role-teacher");
            document.documentElement.classList.add("role-teacher");
            localStorage.setItem("current_user", user);
            localStorage.setItem("user_role", result.role);
            sessionStorage.setItem("current_user", user);
            sessionStorage.setItem("user_role", result.role);
            applyRoleBasedView(result.role, result);
          }
          if (result.role === "admin" || (result.role === "teacher" && result.isAdmin)) {
            // 教師 / 管理員可自由選擇使用「出題設定」或前往「總控後台」
            const adminNotice = document.getElementById("admin-portal-link");
            if (adminNotice) adminNotice.style.display = "inline-flex";
          }
          if (result.realName) localStorage.setItem("user_real_name", result.realName);
          if (result.className) localStorage.setItem("user_class_name", result.className);
          if (result.cachedSummary) {
            try {
              localStorage.setItem("cached_summary", JSON.stringify(result.cachedSummary));
              window.__CACHED_SUMMARY = result.cachedSummary;
            } catch(_) {}
          }
          
    // ══════════════════════════════════════════════════════════════
    // 👨‍👩‍👧 家長專屬視圖渲染引擎 (免跳轉、零延遲、直接在遊戲網頁切換)
    // ══════════════════════════════════════════════════════════════
    let __currentParentResult = null;
    let __currentParentUser = null;
    let __currentParentPass = null;

    
    // ══════════════════════════════════════════════════════════════
    // 🛡️ 角色權限動態視圖管理 (Role-Based Dynamic View Controller)
    // ══════════════════════════════════════════════════════════════
    function applyRoleBasedView(role, result) {
      const isParent = role === "parent" || localStorage.getItem("user_role") === "parent";
      const isTeacher = role === "teacher" || localStorage.getItem("user_role") === "teacher";
      const isAdmin = role === "admin" || (result && result.isAdmin);
      const isStudent = !isParent && !isTeacher && !isAdmin;

      const appEl = document.querySelector(".app");
      if (appEl) appEl.style.display = "block";

      const parentScreen = document.getElementById("parent-portal-screen");
      if (parentScreen) parentScreen.style.display = "none";

      const teacherBtn = document.getElementById("btn-teacher-picker");
      const timeBtn = document.getElementById("btn-time-management");
      const adminNotice = document.getElementById("admin-portal-link");
      const timerBadge = document.getElementById("stat-daily-timer");
      const uploadBtn = document.getElementById("btn-upload") || document.querySelector(".stat.upload");

      // 1. 家長身分：精準過濾視圖（顯示家長帳號、隱藏作答與控制項、完整保留五大歷程方塊）
      if (isParent) {
        document.body.classList.add("role-parent");
        document.documentElement.classList.add("role-parent");

        // 依使用者需求精確隱藏的方塊
        const hideSelectors = [
          "#stat-daily-timer", "#stat-streak-freeze", "#btn-upload", ".stat.upload",
          "#levelbar", "#modes", "#card", ".card", "#session", "#banner", "#screen-quiz",
          "#btn-teacher-picker", "#btn-time-management", "#admin-portal-link",
          "#daily-limit-reached-card"
        ];
        hideSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.style.setProperty("display", "none", "important");
          });
        });

        // 依使用者需求完整保留呈現的五大歷程方塊
        const showSelectors = [
          "#progress-card", "#learning-record-section", "#week-conquer-section",
          "#weak-words-section", "#export-records-section"
        ];
        showSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.style.setProperty("display", "block", "important");
          });
        });

        // 登入帳號方塊：即時顯示家長帳號與身分標記
        const sUser = document.getElementById("s-user");
        const curUser = localStorage.getItem("current_user") || (result && (result.username || result.parentUser)) || "";
        const studentInfo = (result && (result.realName || result.studentUser)) || localStorage.getItem("user_real_name") || "";
        if (sUser && curUser) {
          sUser.textContent = curUser;
          sUser.title = `家長帳號：${curUser}${studentInfo ? `（綁定子女：${studentInfo}）` : ""}`;
          const statUser = document.getElementById("stat-user");
          if (statUser) {
            statUser.title = `家長帳號：${curUser}${studentInfo ? `（綁定子女：${studentInfo}）` : ""}`;
            const subLabel = statUser.querySelector("span");
            if (subLabel) subLabel.textContent = "家長帳號";
          }
        }
        return;
      }

      // 2. 教師 / 管理員身分：比照家長規格精準過濾視圖（隱藏作答題型與計時，呈現教學管理看板與工具）
      if (isTeacher || isAdmin) {
        document.body.classList.add("role-teacher");
        document.documentElement.classList.add("role-teacher");
        document.body.classList.remove("role-parent");
        document.documentElement.classList.remove("role-parent");

        const hideSelectors = [
          "#stat-daily-timer", "#stat-streak-freeze", "#btn-upload", ".stat.upload",
          "#levelbar", "#modes", "#card", ".card:not(#teacher-portal-card)", "#session", "#banner", "#screen-quiz",
          "#btn-teacher-picker", "#btn-time-management",
          "#daily-limit-reached-card", "#parent-portal-screen",
          "section.progress"
        ];
        hideSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.style.setProperty("display", "none", "important");
          });
        });

        if (teacherBtn) teacherBtn.style.setProperty("display", "none", "important");
        if (timeBtn) timeBtn.style.setProperty("display", "none", "important");
        if (adminNotice) adminNotice.style.setProperty("display", isAdmin ? "inline-flex" : "none", "important");

        const teacherCard = document.getElementById("teacher-portal-card");
        if (teacherCard) teacherCard.style.setProperty("display", "block", "important");

        // 登入帳號方塊：即時顯示教師帳號與身分標記
        const sUser = document.getElementById("s-user");
        const curUser = localStorage.getItem("current_user") || (result && result.username) || "";
        const realName = (result && result.realName) || localStorage.getItem("user_real_name") || "";
        if (sUser && curUser) {
          sUser.textContent = curUser;
          sUser.title = `教師帳號：${curUser}${realName ? `（${realName}）` : ""}`;
          const statUser = document.getElementById("stat-user");
          if (statUser) {
            statUser.title = `教師帳號：${curUser}${realName ? `（${realName}）` : ""}`;
            const subLabel = statUser.querySelector("span");
            if (subLabel) subLabel.textContent = isAdmin ? "系統管理員" : "教師帳號";
          }
        }
        if (typeof loadTeacherPortalScript === "function") {
          loadTeacherPortalScript(() => {
            if (typeof initTeacherInlineWorkspace === "function") initTeacherInlineWorkspace();
          });
        } else if (typeof initTeacherInlineWorkspace === "function") {
          initTeacherInlineWorkspace();
        }
        return;
      }

      // 3. 學生身分：移除家長與教師樣式，復原完整遊戲作答與計時元件
      document.body.classList.remove("role-parent", "role-teacher");
      document.documentElement.classList.remove("role-parent", "role-teacher");
      const teacherCard = document.getElementById("teacher-portal-card");
      if (teacherCard) teacherCard.style.display = "none";

      if (teacherBtn) teacherBtn.style.display = "none";
      if (timeBtn) timeBtn.style.display = "none";
      if (adminNotice) adminNotice.style.display = "none";
      if (timerBadge) timerBadge.style.display = "flex";
      if (uploadBtn) uploadBtn.style.display = "flex";
    }


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
          const dStr = String(item.date || "").split(/[Ts]/)[0];
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
          localStorage.removeItem("teacher_class_list");
          localStorage.removeItem("teacher_my_class");
          if (portal) portal.style.display = "none";
          if (appEl) appEl.style.display = "";
          if (ov) {
            ov.style.removeProperty("display");
            ov.style.setProperty("display", "flex", "important");
            ov.classList.remove("hidden");
          }
          document.body.classList.remove("role-parent", "role-teacher");
          document.documentElement.classList.remove("role-parent", "role-teacher");
          const teacherCard = document.getElementById("teacher-portal-card");
          if (teacherCard) teacherCard.style.display = "none";
          document.body.classList.add("is-logging-in");
          const uInput = document.getElementById("login-user");
          const pInput = document.getElementById("login-pass");
          if (pInput) pInput.value = "";
          if (uInput) { uInput.value = ""; uInput.focus(); }
          setLoginStatus("已安全登出", "success");
        };
      }
    }


          window.__CURRENT_USER = user;
          window.__USER_ROLE = result.role || "student";
          applyRoleBasedView(result.role || "student", result);
          updateAccountDisplay(user, result.role || "student");
          const teacherBtn = document.getElementById("btn-teacher-picker");
          if (teacherBtn) {
            teacherBtn.style.display = (result.role === "teacher" || result.isAdmin) ? "flex" : "none";
          }
          const timeBtn = document.getElementById("btn-time-management");
          if (timeBtn) {
            timeBtn.style.display = (result.role === "teacher" || result.isAdmin) ? "flex" : "none";
          }
          if (result.timeRestriction) {
            sessionStorage.setItem("user_start_time", result.timeRestriction.startTime || "07:30");
            sessionStorage.setItem("user_end_time", result.timeRestriction.endTime || "22:00");
            sessionStorage.setItem("time_restriction_unlocked", (result.timeRestriction.isOverridden === true) ? "true" : "false");
          }
          if (result.role === "teacher" || result.isAdmin) {
            const timerBadge = document.getElementById("stat-daily-timer");
            if (timerBadge) timerBadge.style.display = "none";
          }
          if (result.role === "teacher") {
            let classArr = [];
            const invalidClasses = new Set(["all", "全校", "系統管理員", "管理員", "admin", "d", "test"]);
            const rawItems = (Array.isArray(result.classList) && result.classList.length > 0) ? result.classList : [result.className];
            rawItems.forEach(item => {
              if (!item) return;
              String(item).split(/[,，、\s/]+/).forEach(token => {
                let t = token.replace(/班$/, "").trim();
                if (!t || invalidClasses.has(t.toLowerCase())) return;
                if (/^\d{6}$/.test(t)) {
                  classArr.push(t.slice(0, 3), t.slice(3, 6));
                } else {
                  classArr.push(t);
                }
              });
            });
            classArr = [...new Set(classArr)].sort();
            localStorage.setItem("teacher_class_list", JSON.stringify(classArr));
            if (result.className) {
              localStorage.setItem("teacher_my_class", result.className);
            }
            // 🚀 效能優化：教師登入成功後，於背景非同步預載單字庫，開啟出題彈窗時零延遲即時呈現
            try { loadPickerData(); } catch(_) {}
          }
          sessionStorage.setItem("current_pass", pass);
          localStorage.setItem("current_pass", pass);
          if (result.sessionToken) {
            localStorage.setItem("session_token", result.sessionToken);
          }

          if (hasCloudRecords) {
            // 雲端有存檔：將雲端最新進度寫入 LocalStorage（跳過舊備份中的 task_words_*，統一由下方權威 taskWordsMap 寫入）
            for (let key in result.records) {
              if (key.startsWith("task_words_")) continue;
              if (result.role === "parent" && (key === "current_user" || key === "user_role" || key === "current_pass")) continue;
              const val = result.records[key];
              const valToStore = (typeof val === "object" && val !== null) ? JSON.stringify(val) : String(val);
              localStorage.setItem(key, valToStore);
            }
            if (result.role === "parent") {
              localStorage.setItem("current_user", user);
              localStorage.setItem("user_role", "parent");
              localStorage.setItem("parent_user", user);
              if (result.studentUser) localStorage.setItem("bound_student", result.studentUser);
            }
          } else if (!isDifferentUser && localAgentData) {
            // 雲端無紀錄，但本機同帳號已有有效學習進度：保留本機進度（登入時絕不上傳，確保純下載無覆蓋風險）
          } else if (result.isNewStudent === true) {
            // 僅當雲端確認「無分頁」或「分頁完全無任何紀錄」時，才判定為全新帳號初始化
            const freshStore = {
              box: {}, stat: {}, lstat: {},
              mstat: { listen: { a: 0, c: 0 }, pick: { a: 0, c: 0 }, scramble: { a: 0, c: 0 }, trap: { a: 0, c: 0 } },
              level: { current: 1, unlocked: 1, placed: true },
              session: { active: false, date: null, answered: 0, correct: 0, incorrect: 0, ids: {}, mastered: 0 },
              history: {},
              dailyPractice: {},
              points: 0, streak: 0, best: 0, attempts: 0, correct: 0
            };
            localStorage.setItem("spellAgent.v2", JSON.stringify(freshStore));
          }

          // 儲存任務單字庫對應表至 localStorage 供歷史查詢（優先於 dailyTaskHistory 合併前寫入）
          if (result.taskWordsMap && typeof result.taskWordsMap === "object") {
            for (const tk in result.taskWordsMap) {
              const twVal = result.taskWordsMap[tk];
              if (Array.isArray(twVal) && twVal.length > 0) {
                localStorage.setItem("task_words_" + tk, JSON.stringify(twVal));
              }
            }
          }

          // 【關鍵順序修正】在還原 result.records 備份與權威 taskWordsMap 之後，寫入伺服器最新計算的 dailyTaskHistory
          if (Array.isArray(result.dailyTaskHistory)) {
            let mergedHist = result.dailyTaskHistory.map(cloudItem => {
              const cloudWords = (Array.isArray(cloudItem.words) && cloudItem.words.length > 0) ? cloudItem.words : [];
              if (cloudWords.length === 0 && cloudItem.taskName && cloudItem.taskName !== "自主練習" && !String(cloudItem.taskName).includes("未指派")) {
                const cDate = String(cloudItem.date || "").trim().split(/[T\s]/)[0].replace(/\//g, "-");
                const cachedW = localStorage.getItem("task_words_" + cDate) || localStorage.getItem("task_words_" + cDate.replace(/-/g, "/"));
                if (cachedW) {
                  try {
                    const parsedW = JSON.parse(cachedW);
                    if (Array.isArray(parsedW) && parsedW.length > 0) cloudItem.words = parsedW;
                  } catch(_) {}
                }
              }
              return cloudItem;
            });
            localStorage.setItem("student_task_history", JSON.stringify(mergedHist));
          }

          if (result.conquerSettings && typeof result.conquerSettings === "object") {
            localStorage.setItem("conquer_roll_settings", JSON.stringify(result.conquerSettings));
          }

          // 若有今日指定任務，存入 sessionStorage 與 localStorage 供 app.js 抓取
          if (result.assignedTask) {
            sessionStorage.setItem("assigned_task", JSON.stringify(result.assignedTask));
            localStorage.setItem("assigned_task_active", JSON.stringify(result.assignedTask));
            const ds1 = formatDateSlash();
            const ds2 = formatDateDash();
            if (result.assignedTask.alreadyCompleted) {
              localStorage.setItem("task_done_" + ds1, "true");
              localStorage.setItem("task_done_" + ds2, "true");
              localStorage.removeItem("today_task_in_progress");
            } else {
              // 老師指派了新任務或今日尚未完成，清除舊的當日鎖定標記，避免誤鎖
              localStorage.removeItem("task_done_" + ds1);
              localStorage.removeItem("task_done_" + ds2);
            }
          } else {
            sessionStorage.removeItem("assigned_task");
            localStorage.removeItem("assigned_task_active");
          }

          // ── 今日指定測驗進行中進度無縫接續比對（支援斷線、重整、切換電腦） ──
          const currentTodayDash = formatDateDash();
          let bestProg = null;

          // 1. 本機進度（本帳號）
          try {
            const rawLocal = localStorage.getItem("today_task_in_progress_" + user.toLowerCase()) || localStorage.getItem("today_task_in_progress");
            if (rawLocal) {
              const p = JSON.parse(rawLocal);
              const pDate = p ? String(p.date || "").replace(/\//g, "-") : "";
              const pUser = p ? String(p.username || "").toLowerCase() : "";
              if (pDate === currentTodayDash && (!pUser || pUser === user.toLowerCase()) && p.pool && p.pool.length > 0 && p.index < p.pool.length) {
                bestProg = p;
              }
            }
          } catch(_) {}

          // 2. 雲端進度比對
          try {
            if (result.records) {
              const rawCloud = result.records["today_task_in_progress_" + user.toLowerCase()] || result.records.today_task_in_progress;
              if (rawCloud) {
                const p = typeof rawCloud === "string" ? JSON.parse(rawCloud) : rawCloud;
                const pDate = p ? String(p.date || "").replace(/\//g, "-") : "";
                if (p && pDate === currentTodayDash && p.pool && p.pool.length > 0 && p.index < p.pool.length) {
                  if (!bestProg || (Number(p.index) > Number(bestProg.index))) {
                    bestProg = p;
                  }
                }
              }
            }
          } catch(_) {}

          // 若測驗尚未完成，寫入最新進行中進度
          if (bestProg && (!result.assignedTask || !result.assignedTask.alreadyCompleted)) {
            localStorage.setItem("today_task_in_progress", JSON.stringify(bestProg));
            localStorage.setItem("today_task_in_progress_" + user.toLowerCase(), JSON.stringify(bestProg));
          }

          // 若先前已載入過遊戲核心模組（例如切換帳號情境），強制重新整理以徹底銷毀記憶體殘留
          if (window.__gameModuleLoaded) {
            location.reload();
            return;
          }
          window.__gameModuleLoaded = true;

          // 1. 動態載入遊戲核心模組（加上時間戳記防瀏覽器快取，此時 app.js 才會讀取剛剛存好的 LocalStorage）
          let loadPrompt = "登入成功，正在載入遊戲...";
          if (result.role === "parent") loadPrompt = "登入成功，正在載入子女學習進度...";
          else if (result.role === "teacher" || result.role === "admin") loadPrompt = "載入完成";
          setLoginStatus(loadPrompt, "loading-game");
          try {
            // ★ 進入遊戲前先比對今日剩餘時間：已歸零就不啟動單字測驗系統
            if (result.role !== "teacher" && !result.isAdmin && result.dailyUsage) {
              const du = result.dailyUsage;
              const uName = localStorage.getItem("current_user");
              const lim = Number(du.limitMinutes) || 10;
              const ext = Number(du.extendedMinutes) || 0;
              const fl = Number(du.firstLoginTime) || 0;
              const unl = du.unlocked === true;
              localStorage.setItem(`daily_usage_${uName}_unlocked`, unl ? "true" : "false");
              localStorage.setItem(`daily_usage_${uName}_limit_minutes`, String(lim));
              localStorage.setItem(`daily_usage_${uName}_extended_minutes`, String(ext));
              if (fl) localStorage.setItem(`daily_usage_${uName}_first_login_time`, String(fl));
              window.__dailyUsageTimeIsUp = (!unl && fl > 0 && ((lim + ext) * 60000 - (Date.now() - fl)) <= 0);
              window.__bootedLocked = window.__dailyUsageTimeIsUp;
              if (window.__dailyUsageTimeIsUp) {
                document.body.classList.add("daily-limit-reached");
              }
            }
            const cacheBuster = Date.now();
            await import(`./src/app.js?v=${cacheBuster}`);
            const _ov = document.getElementById('login-overlay'); if (_ov) { _ov.style.setProperty('display', 'none', 'important'); _ov.classList.add('hidden'); }
            document.body.classList.remove('is-logging-in');

            // 🚀 核心：模組載入後立即套用角色視圖（家長帳號精準隱藏作答區並呈現五大歷程）
            applyRoleBasedView(result.role || localStorage.getItem("user_role") || "student", result);

            // ★ 學生完整載入進度、單字庫與畫面後，才正式啟動每日練習倒數計時（家長與教師豁免）
            if (result.role !== "teacher" && !result.isAdmin && result.role !== "parent") {
              if (typeof checkCurfewStatus === "function") checkCurfewStatus();
              const pendingUsage = result.dailyUsage;
              if (pendingUsage) {
                const nowMs = Date.now();
                if (!pendingUsage.firstLoginTime || Math.abs(nowMs - Number(pendingUsage.firstLoginTime)) < 120000) {
                  pendingUsage.firstLoginTime = nowMs;
                }
              }
              if (typeof initDailyUsageTimer === "function") initDailyUsageTimer(pendingUsage);
            }
          } catch(importErr) {
            console.error("載入遊戲失敗：", importErr);
            if ('serviceWorker' in navigator) {
              try {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (const reg of regs) { await reg.unregister(); }
              } catch(_) {}
            }
            if ('caches' in window) {
              try {
                const keys = await caches.keys();
                for (const key of keys) { await caches.delete(key); }
              } catch(_) {}
            }
            alert("載入遊戲模組失敗：" + importErr.message + "\n已為您重置快取，請按確定重新整理！");
            location.reload(true);
            return;
          }

          // 2. 綁定上傳按鈕事件
          const uploadBtn = document.getElementById("btn-upload") || document.querySelector(".stat.upload");
          if (uploadBtn) {
            uploadBtn.style.cursor = "pointer";
            uploadBtn.onclick = () => uploadLocalStorageData(false);
          }
        } else {
          if (result.curfew) {
            setLoginStatus("目前非您的開放作答時間，如有需求請洽任課老師調整設定。", "warning");
          } else {
            setLoginStatus(result.message || "帳號或密碼錯誤", "error");
          }
        }
      } catch (err) {
        console.error("登入請求異常：", err);
        let extra = "";
        if (window.location.protocol === "file:") {
          extra = "（本機 file:// 模式被瀏覽器禁止跨域連線，請使用 GitHub Pages 或 Web Server 開啟）";
        } else if (err && err.message) {
          extra = err.name === "AbortError" ? "（連線逾時，請重試）" : `（${err.message}）`;
        }
        setLoginStatus("連線失敗，請檢查網路或稍後再試。" + extra, "error");
      } finally {
        isLoggingIn = false;
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.style.opacity = "1";
        }
      }
    });

  // 導出核心函式供全域與外部模組調用
  window.setLoginStatus = setLoginStatus;
  window.applyRoleBasedView = applyRoleBasedView;
  window.renderParentPortalView = renderParentPortalView;
})(window, document);
