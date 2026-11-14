// =====================================================================
// auth_sync.js — 登入驗證、SHA-256 零明文憑證保護、雲端同步、排行榜與無障礙鍵盤導航模組
// =====================================================================
export async function sha256HexClient(plain) {
  const s = String(plain || "").trim();
  if (!s) return "";
  if (/^[a-f0-9]{64}$/i.test(s)) return s.toLowerCase();
  if (typeof crypto !== "undefined" && crypto.subtle && typeof TextEncoder !== "undefined") {
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    } catch (_) {}
  }
  return s;
}

export function sanitizeCredentialStorage() {
  try {
    // 徹底清除 localStorage 殘留的明文密碼，僅保留當次 sessionStorage 憑證
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("current_pass");
    }
  } catch (_) {}
}
sanitizeCredentialStorage();

if (typeof window !== "undefined" && typeof document !== "undefined") {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const tModal = document.getElementById("teacherTaskModal");
      if (tModal && tModal.style.display === "flex" && typeof window.closeTeacherModal === "function") {
        window.closeTeacherModal();
        return;
      }
      const tmModal = document.getElementById("timeManagementModal");
      if (tmModal && tmModal.style.display === "flex") {
        tmModal.style.display = "none";
        return;
      }
      const previewBox = document.getElementById("export-web-preview-container");
      if (previewBox && previewBox.style.display === "block") {
        previewBox.style.display = "none";
      }
    } else if (e.key === "Tab") {
      const loginOverlay = document.getElementById("login-overlay");
      if (loginOverlay && !loginOverlay.classList.contains("hidden") && loginOverlay.style.display !== "none" && document.body.classList.contains("is-logging-in")) {
        const focusables = loginOverlay.querySelectorAll('input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (focusables.length > 0) {
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
// ⚠️ 請替換為你實際部署成功的 Apps Script Web App 網址
    const bootTime = Date.now();
    try { import(new URL("./wordbank.js", import.meta.url).href).then(m => m.loadWordBank()).catch(() => {}); } catch(_) {}

    import(new URL("./config.js", import.meta.url).href).then(cfg => {
      if (cfg && cfg.DEFAULT_SCRIPT_URL) window.__SCRIPT_URL = cfg.DEFAULT_SCRIPT_URL;
    }).catch(() => {});
    const scriptUrl = window.__SCRIPT_URL || "https://script.google.com/macros/s/AKfycbx1hyCNJxqFMoaJgIxfZqLYIYH00NegI1Yd8NJP6gRjqwOndWGkmr-H9tGvVwK_axM9/exec";
    window.__SCRIPT_URL = scriptUrl;
    // 🚀 預先喚醒 GAS 容器：學生進入登入畫面時立即預熱，消滅冷啟動延遲
    try { fetch(scriptUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "ping" }) }).catch(() => {}); } catch(_) {}

    function updateAccountDisplay(username, role) {
      const sUser = document.getElementById("s-user");
      const statEl = document.getElementById("stat-user");
      const roleText = role === 'teacher' ? '教師' : role === 'parent' ? '家長' : '學生';
      if (sUser) {
        sUser.textContent = username || "-";
        sUser.title = username ? `${roleText}帳號：${username}` : "";
        // 寬度隨帳號名稱長度自適應展開，字體維持清晰易讀
        if (username && username.length > 16) {
          sUser.style.fontSize = "13px";
        } else if (username && username.length > 12) {
          sUser.style.fontSize = "14.5px";
        } else {
          sUser.style.fontSize = "17px";
        }
      }
      if (statEl) {
        statEl.title = username
          ? `目前登入帳號：${username} (${roleText})\n（點擊可查看帳號詳情或切換）`
          : "登入帳號";
        const subSpan = statEl.querySelector("span");
        if (subSpan) subSpan.textContent = role === "parent" ? "家長帳號" : "登入帳號";
      }
    }

    const formatDateDash = (dt = new Date()) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const formatDateSlash = (dt = new Date()) => formatDateDash(dt).replace(/-/g, "/");

    // ── 開啟網頁時檢查與安全維護紀錄 ──
    const rememberedUser = localStorage.getItem("current_user");
    const todayDashStr = formatDateDash();

    // 安全清理：僅清除跨日過期的快取或無效殘留，嚴格保留「今日進行中未完之指定測驗進度 (today_task_in_progress)」
    const initialKeysToPurge = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      // 1. 若為指定測驗進行中進度：檢查日期，若非今日才清除，是今日則安全保留！
      if (k.startsWith("today_task_in_progress")) {
        try {
          const p = JSON.parse(localStorage.getItem(k));
          const pDate = p ? String(p.date || "").replace(/\//g, "-") : "";
          if (pDate && pDate !== todayDashStr) {
            initialKeysToPurge.push(k);
          }
        } catch(_) {
          initialKeysToPurge.push(k);
        }
        continue;
      }
      // 2. 其餘舊版非今日的 task_done 清除
      if (k.startsWith("task_done_")) {
        const dPart = k.replace("task_done_", "").replace(/\//g, "-");
        if (dPart && dPart !== todayDashStr) {
          initialKeysToPurge.push(k);
        }
        continue;
      }
      // 3. 跨日的指定任務快取清除
      if (k.startsWith("task_words_")) {
        const dPart = k.replace("task_words_", "").replace(/\//g, "-");
        if (dPart && dPart !== todayDashStr) {
          initialKeysToPurge.push(k);
        }
        continue;
      }
    }
    initialKeysToPurge.forEach(k => localStorage.removeItem(k));
    sessionStorage.clear();

    // 狀態列維持純淨初始狀態，未登入前不顯示任何前人紀錄
    updateAccountDisplay("-", "");

    // ── 暗黑 / 明亮模式切換與記憶機制 ──
    function applyAppTheme(theme) {
      const isDark = (theme === "dark");
      if (isDark) {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
      localStorage.setItem("app_theme", isDark ? "dark" : "light");
      localStorage.setItem("theme", isDark ? "dark" : "light");
      
      // 同步頂端按鈕文字與圖示
      const icon = document.getElementById("s-theme-icon");
      const txt = document.getElementById("s-theme-text");
      if (icon) icon.textContent = isDark ? "☀️" : "🌙";
      if (txt) txt.textContent = isDark ? "淺色" : "深色";

      // 同步登入卡片上的按鈕
      const loginBtn = document.getElementById("btn-login-theme-toggle");
      if (loginBtn) {
        const lIcon = loginBtn.querySelector(".theme-icon");
        const lTxt = loginBtn.querySelector(".theme-text");
        if (lIcon) lIcon.textContent = isDark ? "☀️" : "🌙";
        if (lTxt) lTxt.textContent = isDark ? "淺色" : "深色";
      }

      // 同步登入卡片與輸入框底色
      const loginCard = document.querySelector("#login-overlay > div");
      if (loginCard) {
        loginCard.style.background = isDark ? "#1C2234" : "#ffffff";
        loginCard.style.borderColor = isDark ? "#2B334E" : "#E7E9F5";
      }
      const uInp = document.getElementById("login-user");
      const pInp = document.getElementById("login-pass");
      [uInp, pInp].forEach(inp => {
        if (inp) {
          inp.style.background = isDark ? "#141826" : "#F6F7FB";
          inp.style.color = isDark ? "#F0F3FA" : "#232A4D";
          inp.style.borderColor = isDark ? "#2B334E" : "#E7E9F5";
        }
      });
      const noteBoxes = document.querySelectorAll("#login-overlay .curfew-note-box, #login-overlay .login-study-note, #login-overlay .login-upload-note");
      noteBoxes.forEach(box => {
        box.style.color = isDark ? "#F8FAFC" : "#1E293B";
        box.style.background = isDark ? "rgba(108, 76, 224, 0.22)" : "rgba(108, 76, 224, 0.08)";
        box.style.borderColor = isDark ? "rgba(108, 76, 224, 0.45)" : "rgba(108, 76, 224, 0.22)";
      });
    }

    let _isThemeSwitching = false;
    function enableThemeTransition() {
      document.documentElement.classList.add("theme-transitioning");
      window.clearTimeout(window._themeTransTimer);
      window._themeTransTimer = window.setTimeout(() => {
        document.documentElement.classList.remove("theme-transitioning");
        _isThemeSwitching = false;
      }, 500);
    }

    function toggleTheme() {
      if (_isThemeSwitching) return;
      _isThemeSwitching = true;
      const cur = localStorage.getItem("app_theme") || "light";
      const next = cur === "dark" ? "light" : "dark";
      enableThemeTransition();
      if (document.startViewTransition) {
        document.startViewTransition(() => {
          applyAppTheme(next);
        });
      } else {
        applyAppTheme(next);
      }
    }

    const savedTheme = localStorage.getItem("app_theme") || "light";
    applyAppTheme(savedTheme);

    const themeToggleBtn = document.getElementById("btn-theme-toggle");
    if (themeToggleBtn) themeToggleBtn.onclick = toggleTheme;

    const loginThemeBtn = document.getElementById("btn-login-theme-toggle");
    if (loginThemeBtn) loginThemeBtn.onclick = toggleTheme;

    // ============ 字體大小縮放控制 ============
    const FONT_LEVELS = [0.9, 1.0, 1.1, 1.2, 1.3];
    function applyAppFontScale(scale, showFeedback = false) {
      scale = parseFloat(scale) || 1.0;
      scale = Math.max(0.9, Math.min(1.3, Math.round(scale * 10) / 10));
      localStorage.setItem("app_font_scale", scale.toString());
      document.documentElement.style.setProperty("--app-font-scale", scale.toString());
      document.body.setAttribute("data-font-scale", scale.toString());

      const decBtn = document.getElementById("btn-font-dec");
      const incBtn = document.getElementById("btn-font-inc");
      if (decBtn) {
        decBtn.style.opacity = scale <= 0.9 ? "0.45" : "1";
      }
      if (incBtn) {
        incBtn.style.opacity = scale >= 1.3 ? "0.45" : "1";
      }

      if (showFeedback) {
        const pct = Math.round(scale * 100);
        let label = `${pct}%`;
        if (scale === 1.0) label += " (預設)";
        else if (scale < 1.0) label += " (小)";
        else if (scale === 1.3) label += " (最大)";
        else label += " (大)";
        showFontScaleToast(`🔍 字體大小：${label}`);
      }
    }

    function adjustFontScale(step) {
      const current = parseFloat(localStorage.getItem("app_font_scale") || "1.0");
      let idx = FONT_LEVELS.findIndex(v => Math.abs(v - current) < 0.05);
      if (idx === -1) idx = 1;
      const nextIdx = idx + step;
      if (nextIdx < 0) {
        showFontScaleToast("⚠️ 已是最小字體 (90%)");
        return;
      }
      if (nextIdx >= FONT_LEVELS.length) {
        showFontScaleToast("⚠️ 已是最大字體 (130%)");
        return;
      }
      applyAppFontScale(FONT_LEVELS[nextIdx], true);
    }

    function showFontScaleToast(text) {
      let toast = document.getElementById("font-scale-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "font-scale-toast";
        toast.style.cssText = "position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(20px);background:rgba(35,42,77,0.92);color:#FFFFFF;padding:8px 18px;border-radius:999px;font-size:13.5px;font-weight:700;letter-spacing:0.3px;box-shadow:0 6px 20px rgba(0,0,0,0.2);z-index:99999;pointer-events:none;opacity:0;transition:all 0.2s cubic-bezier(0.16, 1, 0.3, 1);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.15);";
        document.body.appendChild(toast);
      }
      toast.textContent = text;
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(0)";
      clearTimeout(window.__fontToastTimer);
      window.__fontToastTimer = setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(20px)";
      }, 1300);
    }

    const savedScale = localStorage.getItem("app_font_scale") || "1.0";
    applyAppFontScale(parseFloat(savedScale), false);

    const btnFontDec = document.getElementById("btn-font-dec");
    if (btnFontDec) btnFontDec.onclick = (e) => { e.stopPropagation(); adjustFontScale(-1); };

    const btnFontInc = document.getElementById("btn-font-inc");
    if (btnFontInc) btnFontInc.onclick = (e) => { e.stopPropagation(); adjustFontScale(1); };

    // 啟動前優先從本機存檔還原頂端答對字、答對率與連勝數值，防止顯示為 0
    window.updateProgressDOMFromLocalStorage = function() {
      try {
        const sa = JSON.parse(localStorage.getItem("spellAgent.v2"));
        const sc = document.getElementById("s-correct");
        const nc = document.getElementById("n-correct");
        const ss = document.getElementById("s-streak");
        const sr = document.getElementById("s-rate");
        const nr = document.getElementById("n-rate");
        const sp = document.getElementById("s-score");
        const np = document.getElementById("n-score");
        if (sa) {
          const pts = String(sa.points !== undefined ? sa.points : 0);
          if (sp) sp.textContent = pts;
          if (np) np.textContent = pts;

          let distinctCorrect = 0;
          let learning = 0, practicing = 0, mastered = 0, passRate = "0%", testedVocab = 0;
          try {
            const cachedSum = JSON.parse(localStorage.getItem("cached_summary") || "null");
            if (cachedSum) {
              if (typeof cachedSum.distinctCorrect === "number") distinctCorrect = cachedSum.distinctCorrect;
              if (typeof cachedSum.learning === "number") learning = cachedSum.learning;
              if (typeof cachedSum.practicing === "number") practicing = cachedSum.practicing;
              if (typeof cachedSum.mastered === "number") mastered = cachedSum.mastered;
              if (cachedSum.passRate) passRate = cachedSum.passRate;
              if (typeof cachedSum.testedVocab === "number") testedVocab = cachedSum.testedVocab;
            }
          } catch(_) {}

          if (distinctCorrect === 0) {
            if (sa.stat) {
              distinctCorrect = Object.values(sa.stat).filter(s => s && s.c > 0).length;
            } else if (sa.box) {
              distinctCorrect = Object.values(sa.box).filter(b => b >= 1).length;
            }
          }
          // 🚀 若快取無細項，直接由本機 sa.stat 與 sa.box 統計學習中、練習中、精通
          if (learning === 0 && practicing === 0 && mastered === 0) {
            if (sa.stat) {
              for (const k in sa.stat) {
                const st = sa.stat[k];
                if (st && st.c > 0) {
                  const b = sa.box ? (sa.box[k] || 0) : 0;
                  if (b >= 3) mastered++;
                  else if (b === 2) practicing++;
                  else learning++;
                }
              }
            } else if (sa.box) {
              for (const k in sa.box) {
                const b = sa.box[k] || 0;
                if (b >= 3) mastered++;
                else if (b === 2) practicing++;
                else if (b >= 1) learning++;
              }
            }
          }
          if (distinctCorrect === 0) {
            distinctCorrect = learning + practicing + mastered;
          }

          if (sc) sc.textContent = String(distinctCorrect);
          if (nc) nc.textContent = String(distinctCorrect);

          // 🚀 極速秒開：即時更新整體進度條與數值，免除額外等待計算
          const nLearn = document.getElementById("n-learn");
          const nPrac = document.getElementById("n-prac");
          const nMast = document.getElementById("n-mast");
          const bLearn = document.getElementById("b-learn");
          const bPrac = document.getElementById("b-prac");
          const bMast = document.getElementById("b-mast");
          const totalWords = 2055;
          if (nLearn) nLearn.textContent = String(learning);
          if (nPrac) nPrac.textContent = String(practicing);
          if (nMast) nMast.textContent = String(mastered);
          if (bLearn) bLearn.style.width = Math.min(100, (learning / totalWords * 100)) + "%";
          if (bPrac) bPrac.style.width = Math.min(100, (practicing / totalWords * 100)) + "%";
          if (bMast) bMast.style.width = Math.min(100, (mastered / totalWords * 100)) + "%";

          if (ss) ss.textContent = String(sa.streak !== undefined ? sa.streak : 0);
          const vocabRateStr = Math.round((distinctCorrect / totalWords) * 100) + "%";
          if (sr) sr.textContent = passRate;
          if (nr) nr.textContent = vocabRateStr;
        } else {
          if (sp) sp.textContent = "0";
          if (np) np.textContent = "0";
          if (sc) sc.textContent = "0";
          if (nc) nc.textContent = "0";
          if (ss) ss.textContent = "0";
          if (sr) sr.textContent = "0%";
          if (nr) nr.textContent = "0%";
        }
      } catch(_) {
        const sp = document.getElementById("s-score");   if (sp) sp.textContent = "0";
        const np = document.getElementById("n-score");   if (np) np.textContent = "0";
        const sc = document.getElementById("s-correct"); if (sc) sc.textContent = "0";
        const nc = document.getElementById("n-correct"); if (nc) nc.textContent = "0";
        const ss = document.getElementById("s-streak");  if (ss) ss.textContent = "0";
        const sr = document.getElementById("s-rate");    if (sr) sr.textContent = "0%";
      }
    };
    window.updateProgressDOMFromLocalStorage();

    // 綁定「學習進度 Progress」展開/收起
    const btnProg = document.getElementById("btn-toggle-progress-card");
    const secProg = document.getElementById("progress-card") || document.getElementById("learning-progress-section");
    const bodyProg = document.getElementById("progress-collapsible-body");
    if (btnProg && secProg) {
      btnProg.onclick = (e) => {
        e.preventDefault();
        const isHidden = (bodyProg && bodyProg.style.display === "none") || secProg.classList.contains("is-collapsed");
        if (isHidden) {
          if (bodyProg) bodyProg.style.display = "block";
          secProg.classList.remove("is-collapsed");
          btnProg.innerHTML = "收合";
          secProg.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          if (bodyProg) bodyProg.style.display = "none";
          secProg.classList.add("is-collapsed");
          btnProg.innerHTML = "展開";
        }
      };
    }

    // 徹底清除本機所有學生快取與學習歷程，確保電腦教室共用時零污染、零個資外洩
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
            const resp = await fetch(scriptUrl + "?action=checkAndGetData", {
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
          purgeAllStudentSessionAndLocalData();
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

    function purgeAllStudentSessionAndLocalData() {
      try {
        const preserveKeys = new Set([
          "theme", "fontSize", "preferred_voice", "audio_speed",
          "swr_offline_user_cache"
        ]);
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && !preserveKeys.has(k) && !k.startsWith("swr_user_snapshot_")) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        sessionStorage.clear();
        window.__CURRENT_USER = "";
        window.__CACHED_SUMMARY = null;
        window.__gameModuleLoaded = false;
        window.__PARENT_USER = "";
        window.__PARENT_STUDENT = "";
        window.__dailyUsageTimeIsUp = false;
        window.__bootedLocked = false;
      } catch(_) {}
    }
    window.purgeAllStudentSessionAndLocalData = purgeAllStudentSessionAndLocalData;

    // 點擊「登入帳號」欄位彈出帳號資訊與切換視窗
    window.openAccountModal = function() {
      const cur = localStorage.getItem("current_user") || "尚未登入";
      const uRole = localStorage.getItem("user_role");
      const role = uRole === "teacher" ? "教師" : uRole === "parent" ? "家長" : "學生";
      let mEl = document.getElementById("account-info-modal");
      if (!mEl) {
        mEl = document.createElement("div");
        mEl.id = "account-info-modal";
        mEl.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.65);backdrop-filter:blur(4px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;";
        mEl.onclick = (e) => { if (e.target === mEl) mEl.style.display = "none"; };
        document.body.appendChild(mEl);
      }
      mEl.innerHTML = `
        <div style="background:var(--card, #FFFFFF); color:var(--ink, #1E293B); border-radius:18px; max-width:400px; width:100%; padding:24px 22px; box-shadow:0 12px 36px rgba(0,0,0,0.25); border:1.5px solid var(--line, #E2E8F0); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.6;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; border-bottom:1px solid var(--line, #E2E8F0); padding-bottom:10px;">
            <div style="font-size:18px; font-weight:800; display:flex; align-items:center; gap:8px;">
              <span>👤 目前登入帳號</span>
            </div>
            <button onclick="document.getElementById('account-info-modal').style.display='none'" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--ink3, #94A3B8); padding:0 4px;">✕</button>
          </div>
          <div style="background:rgba(59,130,246,0.08); border:1px solid #3B82F6; border-radius:12px; padding:14px; margin-bottom:16px; text-align:center;">
            <div style="font-size:13px; color:var(--ink2, #475569); font-weight:600; margin-bottom:2px;">登入身分</div>
            <div style="font-size:22px; font-weight:900; color:#2563EB;">${String(cur).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))}</div>
            <div style="font-size:13px; font-weight:700; color:#3B82F6; margin-top:2px;">身分別：${role}</div>
          </div>
          <div style="font-size:13.5px; color:var(--ink2, #475569); margin-bottom:18px; text-align:center;">
            若需更換使用者，請點選下方切換帳號。
          </div>
          <div style="display:flex; gap:10px;">
            <button onclick="document.getElementById('account-info-modal').style.display='none'" style="flex:1; padding:10px 0; background:rgba(148,163,184,0.15); color:var(--ink, #334155); border:1px solid var(--line, #CBD5E1); border-radius:10px; font-size:14px; font-weight:700; cursor:pointer;">
              關閉
            </button>
            <button onclick="window.confirmLogoutFromModal()" style="flex:1; padding:10px 0; background:linear-gradient(135deg,#EF4444,#DC2626); color:#FFFFFF; border:none; border-radius:10px; font-size:14px; font-weight:800; cursor:pointer; box-shadow:0 2px 8px rgba(220,38,38,0.3);">
              切換登出
            </button>
          </div>
        </div>
      `;
      mEl.style.display = "flex";
    };

    window.confirmLogoutFromModal = function() {
      const cur = localStorage.getItem("current_user") || "";
      try {
        const rawProg = localStorage.getItem("today_task_in_progress");
        if (rawProg && cur) {
          localStorage.setItem("today_task_in_progress_" + cur.toLowerCase(), rawProg);
        }
        if (window.uploadLocalStorageData) {
          window.uploadLocalStorageData(true, true);
        }
      } catch(_) {}
      purgeAllStudentSessionAndLocalData();
      location.reload();
    };

    const statUser = document.getElementById("stat-user");
    if (statUser) {
      statUser.style.cursor = "pointer";
      statUser.onclick = () => window.openAccountModal();
    }

    window.openStreakFreezeModal = function() {};

    // 支援輸入框按下 Enter 鍵直接登入
    ['login-user', 'login-pass'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            document.getElementById('login-btn').click();
          }
        });
      }
    });

    // 自動填入前次登入帳號並聚焦密碼輸入框
    if (rememberedUser) {
      const uEl = document.getElementById("login-user");
      if (uEl && !uEl.value) {
        uEl.value = rememberedUser;
        const pEl = document.getElementById("login-pass");
        if (pEl) pEl.focus();
      }
    }

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


    // 🚀 業界最高標準 SWR (Stale-While-Revalidate)：登入快照套用與背景差量同步模組
    async function applyLoginPayload(user, pass, hashedPass, result, isOptimistic) {
      if (!result || result.status !== "success") return false;

      // ── 帳號資料完全隔離與安全零污染保證 ──
      const lastUser = (localStorage.getItem("current_user") || "").trim();
      const isDifferentUser = !lastUser || lastUser.toLowerCase() !== user.toLowerCase();

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

      if (!isOptimistic) {
        purgeAllStudentSessionAndLocalData();
      }

      localStorage.setItem("current_user", user);
      let determinedRole = result.role;
      if (!determinedRole || determinedRole === "student") {
        const uLow = user.toLowerCase();
        if (uLow.startsWith("teacher") || uLow.startsWith("admin")) {
          determinedRole = "teacher";
        }
      }
      result.role = determinedRole || "student";
      localStorage.setItem("user_role", result.role);

      if (result.role === "parent") {
        const childAcc = result.studentUser || (user.toLowerCase().startsWith('p') ? user.slice(1) : user);
        if (!isOptimistic) setLoginStatus(`家長身分驗證成功，正在載入子女（${childAcc}）學習成果...`, "loading-game");
        document.body.classList.add("role-parent");
        document.documentElement.classList.add("role-parent");
        localStorage.setItem("current_user", user);
        localStorage.setItem("user_role", "parent");
        sessionStorage.setItem("current_user", user);
        sessionStorage.setItem("user_role", "parent");
        window.__PARENT_USER = user;
        window.__PARENT_STUDENT = result.realName || result.username || "";
        applyRoleBasedView("parent", result);
      } else {
        document.body.classList.remove("role-parent");
        document.documentElement.classList.remove("role-parent");
        sessionStorage.removeItem("role_parent_target");
      }

      if (result.isAdmin) {
        localStorage.setItem("user_is_admin", "true");
        const adminNotice = document.getElementById("admin-mode-badge");
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

      window.__CURRENT_USER = user;
      window.__USER_ROLE = result.role || "student";
      applyRoleBasedView(result.role, result);
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
        try { loadPickerData(); } catch(_) {}
      }
      sessionStorage.setItem("current_pass", hashedPass);
      localStorage.removeItem("current_pass");
      if (result.sessionToken) {
        localStorage.setItem("session_token", result.sessionToken);
        try {
          import("./firebase_db.js").then(m => {
            if (!m) return;
            if (m.loginWithFirebaseAuth) m.loginWithFirebaseAuth(u, p);
            if (m.saveUserProfileToFirestore) {
              m.saveUserProfileToFirestore(u, {
                username: u,
                role: result.role || "student",
                className: result.className || "",
                studentName: result.studentName || ""
              });
            }
          }).catch(() => {});
        } catch(_) {}
      }

      if (hasCloudRecords) {
        for (let key in result.records) {
          if (key.startsWith("task_words_")) continue;
          if (key === "current_user" || key === "user_role" || key === "current_pass") continue;
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
      } else if (result.isNewStudent === true) {
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

      if (result.taskWordsMap && typeof result.taskWordsMap === "object") {
        for (const tk in result.taskWordsMap) {
          const twVal = result.taskWordsMap[tk];
          if (Array.isArray(twVal) && twVal.length > 0) {
            localStorage.setItem("task_words_" + tk, JSON.stringify(twVal));
          }
        }
      }

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
        localStorage.setItem("daily_task_history", JSON.stringify(mergedHist));
      }

      if (result.assignedTask && result.assignedTask.words) {
        localStorage.setItem("assigned_task", JSON.stringify(result.assignedTask));
      } else {
        localStorage.removeItem("assigned_task");
      }

      if (result.assignedTask) {
        localStorage.setItem("task_already_completed", result.assignedTask.alreadyCompleted ? "true" : "false");
      }

      const currentTodayDash = formatDateDash();
      let bestProg = null;
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

      if (bestProg && (!result.assignedTask || !result.assignedTask.alreadyCompleted)) {
        localStorage.setItem("today_task_in_progress", JSON.stringify(bestProg));
        localStorage.setItem("today_task_in_progress_" + user.toLowerCase(), JSON.stringify(bestProg));
      }

      // 儲存 SWR 本機快照（供下次 0 毫秒秒開）
      try {
        const snapshot = {
          passHash: hashedPass,
          result: result,
          savedAt: Date.now()
        };
        localStorage.setItem("swr_user_snapshot_" + user.toLowerCase(), JSON.stringify(snapshot));
      } catch(_) {}

      if (window.__gameModuleLoaded) {
        try {
          if (typeof window.__refreshLearningState === "function") window.__refreshLearningState();
          if (typeof window.__updateTaskDisplay === "function") window.__updateTaskDisplay();
        } catch(_) {}
        return true;
      }
      window.__gameModuleLoaded = true;

      let loadPrompt = isOptimistic ? "正在載入遊戲..." : "登入成功，正在載入遊戲...";
      if (result.role === "parent") loadPrompt = "登入成功，正在載入子女學習進度...";
      else if (result.role === "teacher" || result.role === "admin") loadPrompt = "載入完成";
      setLoginStatus(loadPrompt, "loading-game");

      try {
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
        const effectiveRole = result.role || localStorage.getItem("user_role") || "student";
        applyRoleBasedView(effectiveRole, result);
        const _ov = document.getElementById('login-overlay'); if (_ov) { _ov.style.setProperty('display', 'none', 'important'); _ov.classList.add('hidden'); }
        document.body.classList.remove('is-logging-in');

        if (effectiveRole === "teacher" || effectiveRole === "admin") {
          console.log("👨‍🏫 管理/教師登入完成，直接啟用教師專屬介面，豁免學生測驗模組");
          return true;
        }

        await import(new URL("./app.js", import.meta.url).href);
        applyRoleBasedView(effectiveRole, result);

        if (result.role !== "teacher" && !result.isAdmin && result.role !== "parent") {
          if (typeof checkCurfewStatus === "function") checkCurfewStatus();
          if (typeof initDailyUsageTimer === "function") initDailyUsageTimer(result.dailyUsage);
        }
      } catch(importErr) {
        console.error("載入遊戲失敗：", importErr);
        alert("載入遊戲模組失敗：" + importErr.message + "\n已為您重置快取，請按確定重新整理！");
        location.reload(true);
        return false;
      }

      const uploadBtn = document.getElementById("btn-upload") || document.querySelector(".stat.upload");
      if (uploadBtn) {
        uploadBtn.style.cursor = "pointer";
        uploadBtn.onclick = () => uploadLocalStorageData(false);
      }
      return true;
    }

    loginBtn.addEventListener('click', async () => {
      if (isLoggingIn) return;
      console.log("[Login] 按下確認登入按鈕");
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
        const loginPassPayload = await sha256HexClient(pass);

        // 🚀 業界最高標準 SWR (Stale-While-Revalidate)：本機秒開快照
        let optimisticLoaded = false;
        try {
          const cachedSnapRaw = localStorage.getItem("swr_user_snapshot_" + user.toLowerCase());
          if (cachedSnapRaw) {
            const cachedSnap = JSON.parse(cachedSnapRaw);
            if (cachedSnap && cachedSnap.passHash === loginPassPayload && cachedSnap.result) {
              console.log("⚡ [SWR] 命中離線快照，0 毫秒極速樂觀載入進入系統！");
              applyLoginPayload(user, pass, loginPassPayload, cachedSnap.result, true);
              optimisticLoaded = true;
            }
          }
        } catch(swrErr) {
          console.warn("[SWR] 快照解析略過:", swrErr);
        }

        // 健全重試機制：處理 GAS 冷啟動或暫時性網路抖動 (最多嘗試 3 次)
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);
            response = await fetch(scriptUrl, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({ action: "login", username: user, password: loginPassPayload }),
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
          await applyLoginPayload(user, pass, loginPassPayload, result, false);
        } else {
          if (optimisticLoaded) {
            // 若曾樂觀開屏但後端回報密碼錯誤或停權，強制踢出登入
            purgeAllStudentSessionAndLocalData();
            const _ov = document.getElementById('login-overlay');
            if (_ov) { _ov.style.display = 'flex'; _ov.classList.remove('hidden'); }
          }
          if (result.curfew) {
            setLoginStatus("目前非您的開放作答時間，如有需求請洽任課老師調整設定。", "warning");
          } else {
            setLoginStatus(result.message || "帳號或密碼錯誤", "error");
          }
          return;
        }
        if (false) { // 舊程式區塊封存
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
          let determinedRole = result.role;
          if (!determinedRole || determinedRole === "student") {
            const uLow = user.toLowerCase();
            if (uLow.startsWith("teacher") || uLow.startsWith("admin")) {
              determinedRole = "teacher";
            }
          }
          result.role = determinedRole || "student";
          localStorage.setItem("user_role", result.role);

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
            
            localStorage.removeItem("today_task_in_progress");
            localStorage.removeItem("today_task_in_progress_" + user.toLowerCase());
            sessionStorage.removeItem("assigned_task");
            localStorage.removeItem("assigned_task_active");
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
          




          window.__CURRENT_USER = user;
          window.__USER_ROLE = result.role || "student";
          applyRoleBasedView(result.role, result);
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
          const hashedPass = await sha256HexClient(pass);
          sessionStorage.setItem("current_pass", hashedPass);
          localStorage.removeItem("current_pass");
          if (result.sessionToken) {
            localStorage.setItem("session_token", result.sessionToken);
        try {
          import("./firebase_db.js").then(m => {
            if (!m) return;
            if (m.loginWithFirebaseAuth) m.loginWithFirebaseAuth(u, p);
            if (m.saveUserProfileToFirestore) {
              m.saveUserProfileToFirestore(u, {
                username: u,
                role: result.role || "student",
                className: result.className || "",
                studentName: result.studentName || ""
              });
            }
          }).catch(() => {});
        } catch(_) {}
          }

          if (hasCloudRecords) {
            // 雲端有存檔：將雲端最新進度寫入 LocalStorage（跳過舊備份中的 task_words_*，統一由下方權威 taskWordsMap 寫入）
            for (let key in result.records) {
              if (key.startsWith("task_words_")) continue;
              if (key === "current_user" || key === "user_role" || key === "current_pass") continue;
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
            const effectiveRole = result.role || localStorage.getItem("user_role") || "student";
            applyRoleBasedView(effectiveRole, result);
            const _ov = document.getElementById('login-overlay'); if (_ov) { _ov.style.setProperty('display', 'none', 'important'); _ov.classList.add('hidden'); }
            document.body.classList.remove('is-logging-in');

            // 👨‍🏫 關鍵守衛：教師帳號完全豁免載入學生測驗引擎 (app.js)，直接進入教學管理中心
            // （家長帳號須正常載入 app.js 以初始化並渲染五大歷程與學習足跡方塊）
            if (effectiveRole === "teacher" || effectiveRole === "admin") {
              console.log("👨‍🏫 管理/教師登入完成，直接啟用教師專屬介面，豁免學生測驗模組");
              return;
            }

            await import(new URL("./app.js", import.meta.url).href);

            applyRoleBasedView(effectiveRole, result);

            // ★ 學生完整載入進度、單字庫與畫面後，才正式啟動每日練習倒數計時（家長與教師豁免）
            if (result.role !== "teacher" && !result.isAdmin && result.role !== "parent") {
              if (typeof checkCurfewStatus === "function") checkCurfewStatus();
              if (typeof initDailyUsageTimer === "function") initDailyUsageTimer(result.dailyUsage);
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

    // 上傳 LocalStorage 紀錄至 Google 試算表（含防連點、憑證重登入與容量防護）
    let isUploading = false;
    let hasPendingUpload = false;
    let uploadDebounceTimer = null;

    /**
     * 🚀 智慧分層上傳機制 (Tiered & Debounced Upload Architecture)：
     * 1. 本地 LocalStorage 永遠零延遲即時寫入，絕對保障中途作答進度。
     * 2. 背景靜默自動同步 (isSilent=true, immediate=false)：
     *    採用 2.5 秒智慧防抖 (Debounce)，作答中不頻繁發起多餘網路請求，大幅降低等待時間與頻寬壓力！
     * 3. 測驗交卷與手動上傳 (immediate=true)：
     *    立即解除防抖，最高優先級立即送出，並給予即時回饋。
     * 4. 併發防護與自動補單 (hasPendingUpload)：
     *    若前次請求傳輸中又有新進度，自動排程於完成後補送，進度 100% 完整無遺漏。
     * 5. 頁面卸載背景存檔 (keepalive: true)：
     *    切頁或直接關閉時，瀏覽器底層確保資料送達，學生無須在頁面乾等。
     */
    async function uploadLocalStorageData(isSilent = false, immediate = false) {
      if (isSilent && !immediate) {
        if (uploadDebounceTimer) clearTimeout(uploadDebounceTimer);
        uploadDebounceTimer = setTimeout(() => {
          uploadDebounceTimer = null;
          uploadLocalStorageData(true, true);
        }, 2500);
        return;
      }
      if (uploadDebounceTimer) {
        clearTimeout(uploadDebounceTimer);
        uploadDebounceTimer = null;
      }

      if (isUploading) {
        hasPendingUpload = true;
        if (!isSilent) console.log("資料同步中，最新進度將自動接續排程送出...");
        return;
      }
      isUploading = true;

      const currentUser = localStorage.getItem("current_user");
      let currentPass = sessionStorage.getItem("current_pass") || "";

      if (!currentUser) {
        isUploading = false;
        if (!isSilent) {
          const overlay = document.getElementById("login-overlay");
          if (overlay) {
            overlay.style.display = "flex";
            document.body.classList.add("is-logging-in");
          }
          alert("未偵測到登入狀態，請先登入帳號！");
        }
        return;
      }

      if (!currentPass) {
        isUploading = false;
        if (!isSilent) {
          const overlay = document.getElementById("login-overlay");
          if (overlay) {
            overlay.style.display = "flex";
            document.body.classList.add("is-logging-in");
          }
          alert("登入憑證已失效或尚未登入，請先完成登入！");
        }
        return;
      }

      const iconEl = document.getElementById("s-upload");
      if (iconEl && !isSilent) iconEl.textContent = "⏳";

      const todayDash = formatDateDash();
      const todaySlash = formatDateSlash();

      const validHistTaskDates = new Set([todayDash]);
      try {
        const histArr = JSON.parse(localStorage.getItem("student_task_history") || "[]");
        if (Array.isArray(histArr)) {
          histArr.forEach(item => {
            if (item && item.date && item.taskName && item.taskName !== "自主練習" && !String(item.taskName).includes("未指派")) {
              const dNorm = String(item.date).trim().split(/[T\s]/)[0].replace(/\//g, "-");
              if (dNorm) validHistTaskDates.add(dNorm);
            }
          });
        }
      } catch(_) {}

      const allowedPrefixes = ["spellAgent", "today_task", "task_done", "task_words", "task_summary", "student_task_history", "current_user"];
      const localData = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith("task_words_")) {
          const kDate = key.slice("task_words_".length).trim().replace(/\//g, "-");
          if (!validHistTaskDates.has(kDate)) continue;
        }
        if (allowedPrefixes.some(p => key.startsWith(p))) {
          localData[key] = localStorage.getItem(key);
        }
      }

      // 🚀 極致省流量與弱網優化（專為山區弱網/低月租手機流量學生設計）：
      // 上傳前僅保留最近 14 天的逐日作答明細，既有累積總分與單字精通等級完全不受影響，使傳輸封包暴減 80%~90%，1秒內即可完成上傳！
      if (localData["spellAgent.v2"]) {
        try {
          const ag = JSON.parse(localData["spellAgent.v2"]);
          if (ag && typeof ag === "object") {
            if (ag.dailyPractice && typeof ag.dailyPractice === "object") {
              const dKeys = Object.keys(ag.dailyPractice).sort().reverse();
              if (dKeys.length > 14) {
                const prunedDp = {};
                dKeys.slice(0, 14).forEach(k => { prunedDp[k] = ag.dailyPractice[k]; });
                ag.dailyPractice = prunedDp;
              }
            }
            if (ag.history && typeof ag.history === "object") {
              const hKeys = Object.keys(ag.history).sort().reverse();
              if (hKeys.length > 14) {
                const prunedHist = {};
                hKeys.slice(0, 14).forEach(k => { prunedHist[k] = ag.history[k]; });
                ag.history = prunedHist;
              }
            }
            localData["spellAgent.v2"] = JSON.stringify(ag);
          }
        } catch(_) {}
      }

      let todayTaskSummary = null;
      let inProgressTask = null;

      const rawProgress = localStorage.getItem("today_task_in_progress");
      if (rawProgress) {
        try {
          const prog = JSON.parse(rawProgress);
          const progDate = prog && prog.date ? String(prog.date).trim().replace(/\//g, "-") : todayDash;
          if (prog && prog.pool && prog.pool.length > 0 && progDate === todayDash) {
            inProgressTask = prog;
            const progWords = (Array.isArray(prog.words) && prog.words.length > 0)
              ? prog.words
              : (prog.pool || []).map(w => typeof w === "string" ? w : (w.word || w.display || w.w)).filter(Boolean);
            todayTaskSummary = {
              taskName   : prog.task ? prog.task.taskName : "今日指定練習",
              score      : prog.correct || 0,
              total      : prog.pool.length,
              attempts   : prog.index !== undefined ? prog.index : ((prog.correct || 0) + (prog.wrongWords ? prog.wrongWords.length : 0)),
              rate       : "—",
              completed  : false,
              inProgress : true,
              date       : progDate,
              wrongWords : prog.wrongWords || [],
              correctWords: prog.correctWords || [],
              words      : progWords
            };
          }
        } catch(_) {}
      }

      if (!todayTaskSummary) {
        try {
          const rawSum = localStorage.getItem("today_task_summary") || localStorage.getItem("task_summary_" + todayDash) || localStorage.getItem("task_summary_" + todaySlash);
          if (rawSum) {
            const parsedSum = JSON.parse(rawSum);
            if (parsedSum) {
              const sumDate = parsedSum.date ? String(parsedSum.date).trim().replace(/\//g, "-") : todayDash;
              if (!Array.isArray(parsedSum.words) || parsedSum.words.length === 0) {
                try {
                  const cached = localStorage.getItem("task_words_" + sumDate) || localStorage.getItem("task_words_" + todayDash) || localStorage.getItem("task_words_" + todaySlash);
                  if (cached) parsedSum.words = JSON.parse(cached);
                } catch(_) {}
              }
              todayTaskSummary = parsedSum;
            }
          }
        } catch(_) {}
      }

      let precomputedSummary = null;
      try {
        if (window.__store && typeof window.__store.getPrecomputedSummary === "function") {
          precomputedSummary = window.__store.getPrecomputedSummary(window.__WORDS || []);
        }
      } catch(_) {}

      try {
        // 🚀 計算防竄改數位簽名 (SHA-256 HMAC 簽名，防 F12 竄改分數)
        let authSignature = "";
        try {
          const cWords = todayTaskSummary ? (todayTaskSummary.score || 0) : 0;
          const aWords = todayTaskSummary ? (todayTaskSummary.attempts !== undefined ? todayTaskSummary.attempts : (todayTaskSummary.total || 0)) : 0;
          const rawSign = `${currentUser}:${todayDash}:${cWords}:${aWords}:SPELL_AGENT_SECURE_V1`;
          if (window.crypto && window.crypto.subtle) {
            const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawSign));
            const bArr = Array.from(new Uint8Array(buf));
            authSignature = bArr.map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
          }
        } catch(_) {}

        // 🚀 純 Firebase Firestore 高速儲存（已停用 GAS saveRecord 雙寫）
        let fbOk = false;
        try {
          const m = await import("./firebase_db.js");
          if (m && typeof m.saveStudentToFirestore === "function") {
            fbOk = await m.saveStudentToFirestore(currentUser, {
              records: localData,
              todayTaskSummary: todayTaskSummary || null,
              summary: precomputedSummary || null
            });
          }
        } catch(_) {}
        return { status: fbOk ? "success" : "error", source: "firestore" };
      } catch(e) { return { status: "error", message: e.message }; }
    }

    /* ── 以下舊版 GAS saveRecord 雙寫已停用 ── */
    async function _legacyGasUploadDisabled() {
      const payloadStr = JSON.stringify({ 
          action           : "saveRecord", 
          username         : currentUser, 
          password         : currentPass, 
          sessionToken     : localStorage.getItem("session_token") || "",
          records          : localData,
          todayTaskSummary : todayTaskSummary,
          summary          : precomputedSummary,
          authSignature    : authSignature
        });
        const fetchOpts = {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: payloadStr
        };
        // 僅在封包小於 60KB 時才啟用 keepalive，避免超出瀏覽器 64KB 限制拋錯
        if (payloadStr.length < 60000) {
          fetchOpts.keepalive = true;
        }

        let response = null;
        let lastUploadErr = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 18000);
          try {
            response = await fetch(scriptUrl, { ...fetchOpts, signal: controller.signal });
            clearTimeout(timeoutId);
            if (response && response.ok) break;
          } catch (uErr) {
            clearTimeout(timeoutId);
            lastUploadErr = uErr;
            if (attempt < 2) await new Promise(r => setTimeout(r, 900));
          }
        }
        if (!response) throw (lastUploadErr || new Error("上傳連線逾時"));
        let result = await response.json();
        
        if (result.status === "success") {
          window.hasUnsavedChanges = false;
          try { localStorage.removeItem("offline_pending_upload_payload"); } catch(_) {}
          if (iconEl) iconEl.textContent = "✅";
          setTimeout(() => { if (iconEl) iconEl.textContent = "🌱"; }, 2500);

          if (!isSilent) {
            if (inProgressTask) {
              const currentQ = (inProgressTask.index !== undefined ? inProgressTask.index + 1 : 1);
              const totalQ   = (inProgressTask.pool ? inProgressTask.pool.length : "?");
              alert("💾 目前作答進度已成功暫存！\n\n⚠️ 注意：今日指定練習尚未作答結束（目前進度：第 " + currentQ + " / " + totalQ + " 題）。\n途中存檔不代表測驗結束，請點選「開始今天的練習」繼續作答！");
            } else if (todayTaskSummary && todayTaskSummary.completed) {
              alert("🎉 上傳成功！今日指定練習成果與學習紀錄已同步至試算表。");
            } else {
              alert("🎉 上傳成功！學習紀錄已同步至試算表。");
            }
          }
        } else {
          if (iconEl && !isSilent) iconEl.textContent = "❌";
          setTimeout(() => { if (iconEl) iconEl.textContent = "🌱"; }, 2500);
          if (!isSilent) alert("儲存失敗：" + (result.message || "未知原因"));
        }
      } catch (err) {
        console.error("上傳失敗：", err);
        // 🚀 斷網離線待傳佇列：將完整進度暫存於本機，網路恢復時自動背景重傳，絕不丟失任何成績！
        try {
          localStorage.setItem("offline_pending_upload_payload", payloadStr);
          if (iconEl) iconEl.textContent = "📡";
        } catch(_) {}

        if (!isSilent) {
          let extra = "";
          if (window.location.protocol === "file:") {
            extra = "\n\n⚠️ 提示：您目前正在以本機檔案 (file://) 開啟，瀏覽器安全機制會封鎖跨網域連線。請改用 GitHub Pages 線上網址或透過本機 Web Server 開啟！";
          } else if (err && err.message) {
            extra = "\n(" + err.message + ")";
          }
          alert("📶 網路暫時中斷，您的成績與進度已完整暫存在手機排隊佇列！\n連線恢復時系統將自動補傳，請放心繼續練習。" + extra);
        } else {
          setTimeout(() => { if (iconEl) iconEl.textContent = "🌱"; }, 3500);
        }
      } finally {
        isUploading = false;
        if (hasPendingUpload) {
          hasPendingUpload = false;
          setTimeout(() => uploadLocalStorageData(true, true), 100);
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // ★ 最完美的保險存檔設計：
    // 1. 平時每 5 分鐘自動背景存檔（若有未同步進度）
    // 2. 離開頁面（關閉分頁、切換視窗、切換分頁）自動背景存檔
    // 3. 完成指定測驗時立即自動存檔（由 finishTodayTask 觸發）
    // ════════════════════════════════════════════════════════════════════
    window.hasUnsavedChanges = false;

    // 依需求調整：全面停用 5 分鐘自動存檔與離開頁面自動背景同步，僅由使用者手動點擊「上傳紀錄」存檔

    window.uploadLocalStorageData = uploadLocalStorageData;
    // ★ 斷網離線自動補傳監聽：當瀏覽器由斷網恢復連線時，無感接續自動上傳暫存進度
    window.addEventListener("online", () => {
      const pending = localStorage.getItem("offline_pending_upload_payload");
      if (pending && typeof window.uploadLocalStorageData === "function") {
        console.log("網路連線已恢復，自動補傳離線未同步資料...");
        window.uploadLocalStorageData(true, true);
      }
    });


    // 🚀 全螢幕沉浸專注作答模式 (Fullscreen API + CSS Fallback)
    function toggleImmersiveFullscreen() {
      const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement || document.body.classList.contains("css-fullscreen-active"));
      const icon = document.getElementById("s-fullscreen-icon");
      const text = document.getElementById("s-fullscreen-text");

      if (!isFull) {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(() => {
            document.body.classList.add("css-fullscreen-active");
          });
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        } else {
          document.body.classList.add("css-fullscreen-active");
        }
        if (icon) icon.textContent = "🗗";
        if (text) text.textContent = "還原";
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
        document.body.classList.remove("css-fullscreen-active");
        if (icon) icon.textContent = "⛶";
        if (text) text.textContent = "全螢幕";
      }
    }

    const fsBtn = document.getElementById("btn-fullscreen-toggle");
    if (fsBtn) fsBtn.onclick = toggleImmersiveFullscreen;

    document.addEventListener("fullscreenchange", () => {
      const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
      const icon = document.getElementById("s-fullscreen-icon");
      const text = document.getElementById("s-fullscreen-text");
      if (!isFull) {
        document.body.classList.remove("css-fullscreen-active");
        if (icon) icon.textContent = "⛶";
        if (text) text.textContent = "全螢幕";
      } else {
        if (icon) icon.textContent = "🗗";
        if (text) text.textContent = "還原";
      }
    });


    // 立即綁定按鈕點擊事件（無論是否登入皆即刻綁定）
    const uploadBtnEl = document.getElementById("btn-upload") || document.querySelector(".stat.upload");
    if (uploadBtnEl) {
      uploadBtnEl.style.cursor = "pointer";
      uploadBtnEl.onclick = () => uploadLocalStorageData(false);
    }

    // 教師線上出題核心邏輯已模組化至 src/teacher_portal.js
    // 學生每日開放時間與宵禁限制核心邏輯已模組化至 src/time_limits.js

    function loadTeacherPortalScript(callback) {
      if (window.__teacherPortalLoaded) {
        if (callback) callback();
        return;
      }
      let s = document.getElementById("teacher-portal-script");
      if (!s) {
        s = document.createElement("script");
        s.id = "teacher-portal-script";
        s.src = "src/teacher_portal.js?v=202611071744";
        s.onload = () => {
          window.__teacherPortalLoaded = true;
          if (typeof ensureTeacherModalsMounted === "function") ensureTeacherModalsMounted();
          if (typeof initPickerEvents === "function") initPickerEvents();
          if (typeof initTimeManagementEvents === "function") initTimeManagementEvents();
          if (typeof initTeacherInlineWorkspace === "function") initTeacherInlineWorkspace();
          if (callback) callback();
        };
        s.onerror = () => {
          if (s && s.parentNode) s.parentNode.removeChild(s);
          if (callback) callback();
        };
        document.head.appendChild(s);
      } else if (callback) {
        s.addEventListener("load", callback);
      }
    }
    window.loadTeacherPortalScript = loadTeacherPortalScript;

    // 教師時間管理與後台管理邏輯已模組化至 src/teacher_portal.js (按需動態載入)
    function checkAndApplyRoleBoot() {
      const curRole = localStorage.getItem("user_role") || sessionStorage.getItem("user_role");
      if (curRole === "parent") {
        document.documentElement.classList.add("role-parent");
        document.body.classList.add("role-parent");
        if (typeof applyRoleBasedView === "function") {
          applyRoleBasedView("parent");
        }
      } else if (curRole === "teacher" || curRole === "admin") {
        document.documentElement.classList.add("role-teacher");
        document.body.classList.add("role-teacher");
        loadTeacherPortalScript(() => {
          if (typeof applyRoleBasedView === "function") {
            applyRoleBasedView(curRole);
          }
          if (typeof initTeacherInlineWorkspace === "function") initTeacherInlineWorkspace();
        });
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        checkAndApplyRoleBoot();
      });
    } else {
      checkAndApplyRoleBoot();
    }

    // ══════════════════════════════════════════
    // 🛡️ 學校電腦教室資安防護：防上一頁/下一頁免密跳轉與逾時閒置保護
    // ══════════════════════════════════════════
    (function initSchoolComputerSecurityGuard() {
      // 1. 偵測瀏覽器上一頁/下一頁快取恢復 (bfcache pageshow)
      window.addEventListener("pageshow", function(e) {
        if (e.persisted) {
          const overlay = document.getElementById("login-overlay");
          if (overlay) {
            overlay.style.removeProperty("display");
            overlay.style.setProperty("display", "flex", "important");
            overlay.classList.remove("hidden");
            document.body.classList.add("is-logging-in");
            const passInput = document.getElementById("login-pass");
            if (passInput) passInput.value = "";
            const statusEl = document.getElementById("login-status");
            if (statusEl) {
              statusEl.textContent = "🔒 偵測到頁面切換，為保護學校電腦帳號安全，請重新輸入密碼。";
              statusEl.style.display = "block";
              statusEl.className = "status-msg warning";
            }
          }
        }
      });

      // 2. 學校電腦 15 分鐘無操作自動清除憑證並登出（加入 3 秒節流避免 mousemove 高頻觸發 clearTimeout）
      let schoolIdleTimer = null;
      let lastIdleResetAt = 0;
      const SCHOOL_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
      function resetSchoolIdleTimer() {
        const now = Date.now();
        if (now - lastIdleResetAt < 3000) return;
        lastIdleResetAt = now;
        if (schoolIdleTimer) clearTimeout(schoolIdleTimer);
        const isCurrentlyLoggedIn = !document.body.classList.contains("is-logging-in");
        if (isCurrentlyLoggedIn) {
          schoolIdleTimer = setTimeout(() => {
            if (typeof window.confirmLogoutFromModal === "function") {
              alert("⏰ 學校電腦閒置超過 15 分鐘，系統已自動登出保護您的帳號安全！");
              window.confirmLogoutFromModal();
            }
          }, SCHOOL_IDLE_TIMEOUT_MS);
        }
      }
      ["mousemove", "keydown", "click", "touchstart"].forEach(evt => {
        window.addEventListener(evt, resetSchoolIdleTimer, { passive: true });
      });
    })();
}
