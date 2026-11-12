// ====================================================================
// 學生開放時間限制 (每日 07:30 ~ 22:00) 與每日練習限額 (預設 10 分鐘) 控制模組
// ====================================================================
(function () {
  const getScriptUrl = () =>
    window.scriptUrl ||
    "https://script.google.com/macros/s/AKfycbx1hyCNJxqFMoaJgIxfZqLYIYH00NegI1Yd8NJP6gRjqwOndWGkmr-H9tGvVwK_axM9/exec";

  const getFormatDateDash = (dt = new Date()) => {
    if (typeof window.formatDateDash === "function") return window.formatDateDash(dt);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  };

  function isTimeWithinDailyAllowed() {
    const sTime = sessionStorage.getItem("user_start_time") || "07:30";
    const eTime = sessionStorage.getItem("user_end_time") || "22:00";
    const sp = sTime.split(":");
    const ep = eTime.split(":");
    const startMin = (Number(sp[0]) || 7) * 60 + (Number(sp[1]) || 30);
    const endMin = (Number(ep[0]) || 22) * 60 + (Number(ep[1]) || 0);
    const d = new Date();
    const mins = d.getHours() * 60 + d.getMinutes();
    return mins >= startMin && mins <= endMin;
  }

  function checkCurfewStatus() {
    const role = localStorage.getItem("user_role") || "student";
    if (role === "teacher" || role === "admin" || role === "parent") return;
    const overlay = document.getElementById("curfew-overlay");
    if (!overlay) return;

    const isUnlocked = sessionStorage.getItem("time_restriction_unlocked") === "true";
    const isAllowed = isTimeWithinDailyAllowed();

    const sTime = sessionStorage.getItem("user_start_time") || "07:30";
    const eTime = sessionStorage.getItem("user_end_time") || "22:00";
    const rangeEl = document.getElementById("curfew-time-range");
    if (rangeEl) rangeEl.textContent = `${sTime} 至 ${eTime}`;

    if (!isAllowed && !isUnlocked) {
      // 先向伺服器確認老師是否已取消限制，避免用舊資料誤擋
      if (!window.__curfewRechecking) {
        window.__curfewRechecking = true;
        pollDailyUsageStatus().finally(() => {
          window.__curfewRechecking = false;
          const ok2 = isTimeWithinDailyAllowed() || sessionStorage.getItem("time_restriction_unlocked") === "true";
          if (ok2) overlay.style.display = "none";
        });
      }
      overlay.style.display = "flex";
      if (typeof window.uploadLocalStorageData === "function") {
        window.uploadLocalStorageData(true);
      }
    } else {
      overlay.style.display = "none";
    }
  }

  // 每 30 秒即時輪詢檢查一次時間（背景分頁自動略過以省電），若時間超過即刻溫和鎖定並存檔
  setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    checkCurfewStatus();
  }, 30000);

  // ══════════════════════════════════════════
  // 每日使用時間上限（預設 10 分鐘）與保護機制
  // ══════════════════════════════════════════
  let dailyUsageState = {
    todayDate: "",
    limitMinutes: 10,
    defaultMinutes: 10,
    studentMinutes: null,
    extendedMinutes: 0,
    unlocked: false,
    firstLoginTime: null,
    anchorPerfNow: 0,
    anchorElapsedMs: 0,
    isLockedDown: false
  };
  let dailyTimerInterval = null;
  let dailyPollingInterval = null;

  function getMonotonicNow() {
    return (typeof performance !== "undefined" && typeof performance.now === "function")
      ? performance.now()
      : Date.now();
  }

  function resolveClientFirstLoginTime(dailyUsage, currentUser, todayStr) {
    const nowWall = Date.now();
    let candidate = nowWall;

    if (dailyUsage) {
      if (typeof dailyUsage.elapsedMs === "number" && !isNaN(dailyUsage.elapsedMs) && dailyUsage.elapsedMs >= 0) {
        candidate = nowWall - Number(dailyUsage.elapsedMs);
      } else if (dailyUsage.serverNow && dailyUsage.firstLoginTime) {
        const srvElapsed = Math.max(0, Number(dailyUsage.serverNow) - Number(dailyUsage.firstLoginTime));
        candidate = nowWall - srvElapsed;
      } else if (dailyUsage.firstLoginTime) {
        const rawFirst = Number(dailyUsage.firstLoginTime);
        // 若客戶端時鐘比伺服器慢導致 rawFirst > nowWall，改以 nowWall 為基準避免倒數卡死在 0
        candidate = rawFirst > nowWall ? nowWall : rawFirst;
      }
    }

    // 結合本機當日已記錄之首次登入時間（取較早者，防止重整網頁或時鐘誤差重置倒數）
    if (currentUser && todayStr) {
      const savedDate = localStorage.getItem(`daily_usage_${currentUser}_date`);
      const savedFirst = Number(localStorage.getItem(`daily_usage_${currentUser}_first_login_time`));
      if (savedDate === todayStr && savedFirst > 0 && savedFirst <= nowWall) {
        candidate = Math.min(candidate, savedFirst);
      }
    }

    return candidate;
  }

  function initDailyUsageTimer(dailyUsage) {
    const role = localStorage.getItem("user_role") || "student";
    if (role === "teacher" || role === "admin" || role === "parent") {
      const timerBadge = document.getElementById("stat-daily-timer");
      if (timerBadge) timerBadge.style.display = "none";
      liftDailyUsageLockdown();
      window.__dailyUsageTimeIsUp = false;
      return;
    }

    const currentUser = localStorage.getItem("current_user");
    if (!currentUser) return;

    // ── 切換帳號時先還原卡片顯示，避免繼承前一帳號的鎖定 ──
    liftDailyUsageLockdown();
    window.__dailyUsageTimeIsUp = false;

    const todayStr = getFormatDateDash();

    // ★ 核心準則：以伺服器端已耗用時間對齊本機時間，並結合單調計時器防止暫停或重整重置！
    const firstLogin = resolveClientFirstLoginTime(dailyUsage, currentUser, todayStr);
    const initialElapsedMs = Math.max(0, Date.now() - firstLogin);

    dailyUsageState = {
      todayDate: todayStr,
      limitMinutes: (dailyUsage && Number(dailyUsage.limitMinutes)) || 10,
      defaultMinutes: (dailyUsage && Number(dailyUsage.defaultMinutes)) || 10,
      studentMinutes: (dailyUsage && dailyUsage.studentMinutes) ? Number(dailyUsage.studentMinutes) : null,
      extendedMinutes: (dailyUsage && Number(dailyUsage.extendedMinutes)) || 0,
      unlocked: (dailyUsage && dailyUsage.unlocked === true),
      firstLoginTime: firstLogin,
      anchorPerfNow: getMonotonicNow(),
      anchorElapsedMs: initialElapsedMs,
      isLockedDown: false
    };

    // 依帳號獨立保存狀態，絕不互相覆蓋污染
    localStorage.setItem(`daily_usage_${currentUser}_date`, todayStr);
    localStorage.setItem(`daily_usage_${currentUser}_first_login_time`, String(firstLogin));
    localStorage.setItem(`daily_usage_${currentUser}_limit_minutes`, String(dailyUsageState.limitMinutes));
    localStorage.setItem(`daily_usage_${currentUser}_extended_minutes`, String(dailyUsageState.extendedMinutes));
    localStorage.setItem(`daily_usage_${currentUser}_unlocked`, dailyUsageState.unlocked ? "true" : "false");

    window.openDailyTimerModal = function () {
      const totalMins = dailyUsageState.limitMinutes + dailyUsageState.extendedMinutes;
      const extraText = dailyUsageState.extendedMinutes > 0 ? `（含延長 ${dailyUsageState.extendedMinutes} 分鐘）` : "";
      const isUnlocked = !!dailyUsageState.unlocked;
      const statusBadge = isUnlocked ? "🟢 今日不限時" : `⏳ 今日可練習：${totalMins} 分鐘 ${extraText}`;

      let mEl = document.getElementById("daily-timer-modal");
      if (!mEl) {
        mEl = document.createElement("div");
        mEl.id = "daily-timer-modal";
        mEl.style.cssText =
          "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.65);backdrop-filter:blur(4px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;";
        mEl.onclick = (e) => {
          if (e.target === mEl) mEl.style.display = "none";
        };
        document.body.appendChild(mEl);
      }
      mEl.innerHTML = `
        <div style="background:var(--card, #FFFFFF); color:var(--ink, #1E293B); border-radius:18px; max-width:440px; width:100%; padding:24px 22px; box-shadow:0 12px 36px rgba(0,0,0,0.25); border:1.5px solid var(--line, #E2E8F0); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.6;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; border-bottom:1px solid var(--line, #E2E8F0); padding-bottom:10px;">
            <div style="font-size:18px; font-weight:800; display:flex; align-items:center; gap:8px;">
              <span>⏱️ 每日練習時間說明</span>
            </div>
            <button onclick="document.getElementById('daily-timer-modal').style.display='none'" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--ink3, #94A3B8); padding:0 4px;">✕</button>
          </div>
          
          <div style="background:rgba(245,158,11,0.1); border:1px solid #F59E0B; border-radius:12px; padding:12px 14px; margin-bottom:14px; text-align:center;">
            <div style="font-size:13px; color:var(--ink2, #475569); font-weight:600; margin-bottom:2px;">今日練習限額</div>
            <div style="font-size:20px; font-weight:900; color:#D97706;">${statusBadge}</div>
          </div>

          <div style="font-size:13.5px; color:var(--ink2, #475569); display:flex; flex-direction:column; gap:10px; margin-bottom:18px;">
            <div>
              <b style="color:var(--ink, #0F172A);">🕒 每日計時方式</b><br>
              每天從<b>第一次登入</b>開始計算時間。
            </div>
            <div>
              <b style="color:var(--ink, #0F172A);">👀 時間到了會怎樣？</b><br>
              練習時間結束後會暫停答題功能以保護眼睛；您依然可以隨時查看<b>學習進度、學習足跡、待攻克單字與歷程檔案</b>，自由複習所有已學內容！
            </div>
          </div>

          <button onclick="document.getElementById('daily-timer-modal').style.display='none'" style="width:100%; padding:10px 0; background:linear-gradient(135deg,#3B82F6,#2563EB); color:#FFFFFF; border:none; border-radius:10px; font-size:14px; font-weight:800; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.3);">
            我知道了
          </button>
        </div>
      `;
      mEl.style.display = "flex";
    };

    const timerBadge = document.getElementById("stat-daily-timer");
    if (timerBadge) {
      timerBadge.style.display = "inline-flex";
      timerBadge.style.cursor = "pointer";
      timerBadge.onclick = () => window.openDailyTimerModal();
    }

    updateDailyUsageTick();

    if (dailyTimerInterval) clearInterval(dailyTimerInterval);
    dailyTimerInterval = setInterval(updateDailyUsageTick, 1000);

    if (dailyPollingInterval) clearInterval(dailyPollingInterval);
    dailyPollingInterval = setInterval(maybePollDailyUsage, 5000);
  }

  function updateDailyUsageTick() {
    const role = localStorage.getItem("user_role") || "student";
    if (role === "teacher" || role === "admin" || role === "parent") return;

    const valEl = document.getElementById("s-timer-val");
    if (!valEl) return;

    if (dailyUsageState.unlocked) {
      valEl.textContent = "不限時";
      valEl.style.color = "#10b981";
      if (dailyUsageState.isLockedDown) {
        liftDailyUsageLockdown();
      }
      return;
    }

    const totalAllowedMs = (dailyUsageState.limitMinutes + dailyUsageState.extendedMinutes) * 60 * 1000;
    const wallElapsedMs = Math.max(0, Date.now() - (dailyUsageState.firstLoginTime || Date.now()));
    const monoDeltaMs = Math.max(0, getMonotonicNow() - (dailyUsageState.anchorPerfNow || 0));
    const monoElapsedMs = (dailyUsageState.anchorElapsedMs || 0) + monoDeltaMs;
    const elapsedMs = Math.max(wallElapsedMs, monoElapsedMs);
    const remainingMs = totalAllowedMs - elapsedMs;

    if (remainingMs <= 0) {
      valEl.textContent = "00:00";
      valEl.style.color = "#ef4444";
      if (!dailyUsageState.isLockedDown) {
        applyDailyUsageLockdown();
      } else {
        ensureLockdownVisuals();
      }
    } else {
      const totalSecs = Math.ceil(remainingMs / 1000);
      const m = Math.floor(totalSecs / 60);
      const s = totalSecs % 60;
      valEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

      if (totalSecs <= 120) {
        valEl.style.color = "#f59e0b";
      } else {
        valEl.style.color = "#38bdf8";
      }

      if (dailyUsageState.isLockedDown) {
        liftDailyUsageLockdown();
      }
    }
  }

  function ensureLockdownVisuals() {
    const card = document.getElementById("card");
    if (card && card.style.display !== "none") card.style.display = "none";
    const modes = document.getElementById("modes");
    if (modes && modes.style.display !== "none") modes.style.display = "none";
    const banner = document.getElementById("banner");
    if (banner && banner.style.display !== "none") banner.style.display = "none";
    const session = document.getElementById("session");
    if (session && session.style.display !== "none") session.style.display = "none";

    const limitCard = document.getElementById("daily-limit-reached-card");
    if (limitCard && limitCard.style.display !== "block") limitCard.style.display = "block";

    // 今日練習時間已結束：一併隱藏 LEVEL 1~5 關卡小方塊，留下乾淨清爽的畫面
    const levelbar = document.getElementById("levelbar");
    if (levelbar && levelbar.style.display !== "none") {
      levelbar.style.display = "none";
    }

    if (!document.body.classList.contains("daily-limit-reached")) {
      document.body.classList.add("daily-limit-reached");
    }

    document.querySelectorAll("section.progress").forEach((sec) => {
      if (sec.id === "weak-words-section") {
        const isVac = document.body.classList.contains("is-vacation") || document.documentElement.classList.contains("is-vacation");
        const isPrivileged = document.body.classList.contains("role-teacher") ||
          document.body.classList.contains("role-parent") ||
          document.documentElement.classList.contains("role-teacher") ||
          document.documentElement.classList.contains("role-parent");
        if (!isVac && !isPrivileged) {
          sec.style.setProperty("display", "none", "important");
          return;
        }
      }
      if (sec && sec.style.display !== "block") sec.style.display = "block";
    });
  }

  function applyDailyUsageLockdown() {
    dailyUsageState.isLockedDown = true;
    window.__dailyUsageTimeIsUp = true;
    console.log("⏰ 每日練習時間已達上限，進入進度保留與作答鎖定模式");

    ensureLockdownVisuals();

    const quizScreen = document.getElementById("screen-quiz");
    const playScreen = document.getElementById("screen-play");
    if (quizScreen && !quizScreen.hasAttribute("hidden")) {
      quizScreen.setAttribute("hidden", "true");
      if (playScreen) playScreen.removeAttribute("hidden");
    }

    const limitCard = document.getElementById("daily-limit-reached-card");
    if (limitCard) {
      limitCard.style.display = "block";
      const minText = document.getElementById("limit-minutes-display-text");
      if (minText) {
        minText.textContent = String(dailyUsageState.limitMinutes + dailyUsageState.extendedMinutes);
      }
    }

    const progressSec = document.querySelector("section.progress");
    if (progressSec) {
      progressSec.style.display = "block";
    }

    // ★ 時間截止時，立即呼叫 refreshChrome 刷新學習進度與頂部數值（答對字、答對率）！
    if (typeof window.refreshChrome === "function") {
      window.refreshChrome();
    }

    if (typeof window.uploadLocalStorageData === "function") {
      window.uploadLocalStorageData(true);
    }

    // 時間到的當下立即確認一次老師是否已加時／解除
    lastDailyPollAt = 0;
    maybePollDailyUsage();
  }

  function liftDailyUsageLockdown() {
    dailyUsageState.isLockedDown = false;
    window.__dailyUsageTimeIsUp = false;
    document.body.classList.remove("daily-limit-reached");
    console.log("🔓 每日練習限制已解除或延長，恢復作答卡片");

    // 當處於可練習時間內，將學習足跡收合以聚焦於題目框
    try {
      const summaryEl = document.getElementById("summary");
      const sumBtn = document.getElementById("sumBtn");
      const sec = document.getElementById("learning-record-section") || document.getElementById("studentLearningRecordCard");
      if (summaryEl && !summaryEl.hasAttribute("hidden") && sumBtn) {
        summaryEl.hidden = true;
        if (sec) sec.classList.add("is-collapsed");
        sumBtn.innerHTML = "展開";
      }
    } catch (_) {}

    const limitCard = document.getElementById("daily-limit-reached-card");
    if (limitCard) limitCard.style.display = "none";

    const card = document.getElementById("card");
    const modes = document.getElementById("modes");
    const levelbar = document.getElementById("levelbar");
    const banner = document.getElementById("banner");
    const session = document.getElementById("session");

    if (card) card.style.display = "";
    if (modes) modes.style.display = "";
    if (levelbar) {
      levelbar.style.display = "";
      levelbar.style.pointerEvents = "";
      levelbar.style.opacity = "";
    }
    if (banner) banner.style.display = "";
    if (session) session.style.display = "";

    const progressSec = document.querySelector("section.progress");
    if (progressSec) {
      progressSec.style.border = "";
      progressSec.style.borderRadius = "";
      progressSec.style.padding = "";
      progressSec.style.background = "";
    }
  }

  // ── 智慧輪詢：只有在「需要」時才呼叫伺服器，避免觸發 Apps Script 配額 ──
  //   • 尚有剩餘時間：完全不呼叫（前端本機倒數即可）
  //   • 時間已到（鎖定中）：每 60 秒查一次老師是否加時／解除
  //   • 已解除限制：每 10 分鐘確認一次（老師可能恢復限制）
  //   • 分頁在背景（看不到）時：一律暫停
  function applyTimeRestrictionFromServer(tr) {
    if (!tr) return;
    sessionStorage.setItem("user_start_time", tr.startTime || "07:30");
    sessionStorage.setItem("user_end_time", tr.endTime || "22:00");
    sessionStorage.setItem("time_restriction_unlocked", tr.isOverridden === true ? "true" : "false");
  }

  let lastDailyPollAt = 0;
  let dailyPollInFlight = false;
  function maybePollDailyUsage(force) {
    if (document.hidden && !force) return;
    if (dailyPollInFlight) return;
    let interval;
    if (dailyUsageState.unlocked) interval = 10 * 60 * 1000;
    else if (dailyUsageState.isLockedDown) interval = 60 * 1000;
    else if (!force) return; // 尚有剩餘時間且未鎖定時完全不輪詢伺服器，僅靠前端高精度倒數，徹底避免 GAS 配額消耗
    else interval = 60 * 1000;
    if (!force && Date.now() - lastDailyPollAt < interval) return;
    if (force && Date.now() - lastDailyPollAt < 20 * 1000) return;
    lastDailyPollAt = Date.now();
    dailyPollInFlight = true;
    pollDailyUsageStatus().finally(() => {
      dailyPollInFlight = false;
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) maybePollDailyUsage(true);
  });

  async function pollDailyUsageStatus() {
    const role = localStorage.getItem("user_role") || "student";
    if (role === "teacher" || role === "admin" || role === "parent") return;
    const currentUser = localStorage.getItem("current_user");
    if (!currentUser) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(getScriptUrl(), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "getDailyUsageSettings",
          username: currentUser,
          sessionToken: sessionStorage.getItem("session_token") || localStorage.getItem("session_token") || ""
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const d = await res.json();
      if (d.status === "success" && d.dailyUsage) {
        dailyUsageState.limitMinutes = Number(d.dailyUsage.limitMinutes) || dailyUsageState.limitMinutes;
        dailyUsageState.extendedMinutes = Number(d.dailyUsage.extendedMinutes) || 0;
        dailyUsageState.unlocked = d.dailyUsage.unlocked === true;
        const todayStr = getFormatDateDash();
        const alignedFirst = resolveClientFirstLoginTime(d.dailyUsage, currentUser, todayStr);
        if (alignedFirst && (!dailyUsageState.firstLoginTime || alignedFirst < dailyUsageState.firstLoginTime)) {
          dailyUsageState.firstLoginTime = alignedFirst;
          dailyUsageState.anchorElapsedMs = Math.max(dailyUsageState.anchorElapsedMs || 0, Date.now() - alignedFirst);
          dailyUsageState.anchorPerfNow = getMonotonicNow();
          localStorage.setItem(`daily_usage_${currentUser}_first_login_time`, String(dailyUsageState.firstLoginTime));
        }
        localStorage.setItem(`daily_usage_${currentUser}_extended_minutes`, String(dailyUsageState.extendedMinutes));
        localStorage.setItem(`daily_usage_${currentUser}_limit_minutes`, String(dailyUsageState.limitMinutes));
        localStorage.setItem(`daily_usage_${currentUser}_unlocked`, dailyUsageState.unlocked ? "true" : "false");
        if (d.timeRestriction) applyTimeRestrictionFromServer(d.timeRestriction);

        // 開機時因時間歸零而未啟動測驗，若老師之後解除或延長 → 重新載入以啟動測驗
        const wallElapsedMs = Math.max(0, Date.now() - (dailyUsageState.firstLoginTime || Date.now()));
        const monoElapsedMs = (dailyUsageState.anchorElapsedMs || 0) + Math.max(0, getMonotonicNow() - (dailyUsageState.anchorPerfNow || 0));
        const curElapsedMs = Math.max(wallElapsedMs, monoElapsedMs);
        const remainMs =
          (dailyUsageState.limitMinutes + dailyUsageState.extendedMinutes) * 60000 - curElapsedMs;
        if (window.__bootedLocked && (dailyUsageState.unlocked || remainMs > 0)) {
          alert("老師已解除或延長今日練習時間，將重新載入以開始練習，請重新登入。");
          location.reload();
          return;
        }

        updateDailyUsageTick();
      }
    } catch (e) {
      // 忽略網路波動
    }
  }

  // 掛載至 window 供全域與外部模組呼叫
  window.isTimeWithinDailyAllowed = isTimeWithinDailyAllowed;
  window.checkCurfewStatus = checkCurfewStatus;
  window.initDailyUsageTimer = initDailyUsageTimer;
  window.updateDailyUsageTick = updateDailyUsageTick;
  window.ensureLockdownVisuals = ensureLockdownVisuals;
  window.applyDailyUsageLockdown = applyDailyUsageLockdown;
  window.liftDailyUsageLockdown = liftDailyUsageLockdown;
  window.applyTimeRestrictionFromServer = applyTimeRestrictionFromServer;
  window.maybePollDailyUsage = maybePollDailyUsage;
  window.pollDailyUsageStatus = pollDailyUsageStatus;
  window.dailyUsageState = dailyUsageState;
})();
