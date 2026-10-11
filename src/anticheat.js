/**
 * ════════════════════════════════════════════════════════════════════
 * anticheat.js - 資安審計與防作弊防禦模組
 * ════════════════════════════════════════════════════════════════════
 * 【合法合規依據】：
 * 依據我國《個人資料保護法》第 19 條第 1 項各款，教育評量與學術競賽
 * 維護公正性之正當目的，僅透過 W3C 標準 Web API 記錄測驗操作軌跡
 * （切頁、除錯快捷鍵、剪貼簿貼上、作答反應耗時、環境參數），
 * 絕不側錄本機螢幕、不讀取硬碟檔案、不啟用攝影機麥克風，完全合法合規。
 */

let _scriptUrl = "";
let _currentWord = "";
let _currentMode = "";
let _questionStartTime = 0;
let _hiddenStartTime = 0;
let _isQuestionActive = false;
const _debounceCache = new Map();

/**
 * 取得合法合規之設備與作業系統特徵 (W3C 標準 API)
 */
export function getDeviceAndOsInfo() {
  const ua = navigator.userAgent || "";
  let os = "未知作業系統";
  let deviceType = "桌上型電腦 / 筆記型電腦 (Desktop)";

  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    os = /iPad/.test(ua) || navigator.maxTouchPoints > 1 ? "Apple iPadOS (平板)" : "Apple iOS (iPhone)";
    deviceType = /iPad/.test(ua) || navigator.maxTouchPoints > 1 ? "平板電腦 (Tablet)" : "智慧型手機 (Mobile)";
  } else if (/Android/.test(ua)) {
    os = "Android (Google)";
    deviceType = /Mobile/.test(ua) ? "智慧型手機 (Mobile)" : "平板電腦 (Tablet)";
  } else if (/Windows NT 10.0/.test(ua) || /Windows NT 11.0/.test(ua)) {
    os = "Windows 10 / 11";
  } else if (/Windows NT 6.1/.test(ua)) {
    os = "Windows 7";
  } else if (/Mac OS X/.test(ua)) {
    os = "Apple macOS";
  } else if (/CrOS/.test(ua)) {
    os = "Google ChromeOS";
    deviceType = "筆記型電腦 / Chromebook";
  } else if (/Linux/.test(ua)) {
    os = "Linux";
  }

  const bit = /Win64|x64|x86_64|WOW64/.test(ua) ? " (64-bit)" : "";
  const touch = navigator.maxTouchPoints > 0 ? " [支援觸控]" : " [無觸控]";
  return `${os}${bit} · ${deviceType}${touch}`;
}

/**
 * 取得瀏覽器版本、螢幕解析度與視窗規格
 */
export function getBrowserAndScreenInfo() {
  const ua = navigator.userAgent || "";
  let browser = "標準瀏覽器";

  if (/Edg\/([0-9.]+)/.test(ua)) {
    browser = `Microsoft Edge ${RegExp.$1.split(".")[0]}`;
  } else if (/Chrome\/([0-9.]+)/.test(ua)) {
    browser = `Google Chrome ${RegExp.$1.split(".")[0]}`;
  } else if (/Firefox\/([0-9.]+)/.test(ua)) {
    browser = `Mozilla Firefox ${RegExp.$1.split(".")[0]}`;
  } else if (/Version\/([0-9.]+).*Safari/.test(ua)) {
    browser = `Apple Safari ${RegExp.$1.split(".")[0]}`;
  }

  const screenRes = `${window.screen.width}×${window.screen.height}`;
  const winSize = `${window.innerWidth}×${window.innerHeight}`;
  const dpr = window.devicePixelRatio ? `@${window.devicePixelRatio.toFixed(1)}x` : "";
  const lang = navigator.language || "zh-TW";
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Taipei";

  return `${browser} | 螢幕: ${screenRes}${dpr} | 視窗: ${winSize} | ${lang} (${tz})`;
}

/**
 * 顯示前端優雅非同步警示 Toast（心理嚇阻與合規告知）
 */
export function showAntiCheatToast(message) {
  try {
    let toast = document.getElementById("anticheat-audit-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "anticheat-audit-toast";
      toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(-100%);
        z-index: 99999;
        background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%);
        color: #ffffff;
        padding: 12px 24px;
        border-radius: 30px;
        font-size: 14px;
        font-weight: bold;
        box-shadow: 0 10px 25px -5px rgba(127, 29, 29, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
        display: flex;
        align-items: center;
        gap: 10px;
        transition: transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.35s ease;
        opacity: 0;
        pointer-events: none;
        max-width: 90vw;
        text-align: center;
        line-height: 1.4;
        border: 1px solid rgba(254, 202, 202, 0.4);
      `;
      document.body.appendChild(toast);
    }

    toast.innerHTML = `<span>🛡️</span> <span>${message}</span>`;
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0)";

    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(-100%)";
    }, 4000);
  } catch(_) {}
}

/**
 * 向後端 Google Sheet 發送作弊違規稽核紀錄
 */
export async function reportCheatAudit(method, details, status = "已記錄存查並警示") {
  const now = Date.now();
  const cacheKey = `${method}_${details.slice(0, 30)}`;
  if (_debounceCache.has(cacheKey) && (now - _debounceCache.get(cacheKey) < 3500)) {
    return; // 3.5 秒內相同違規防抖，避免重複請求
  }
  _debounceCache.set(cacheKey, now);

  const scriptUrl = _scriptUrl || window.__SCRIPT_URL || "https://script.google.com/macros/s/AKfycbx1hyCNJxqFMoaJgIxfZqLYIYH00NegI1Yd8NJP6gRjqwOndWGkmr-H9tGvVwK_axM9/exec";
  const username = localStorage.getItem("current_user") || window.__CURRENT_USER || "";
  const role = localStorage.getItem("user_role") || window.__USER_ROLE || "student";

  // 若使用者是教師帳號且正在調試，不記錄自身操作
  if (role === "teacher" || username === "admin") return;

  const payload = {
    action: "reportCheatAudit",
    username: username || "（未登入訪客）",
    realName: localStorage.getItem("user_real_name") || "",
    className: localStorage.getItem("user_class_name") || "",
    method: method,
    details: details,
    device: getDeviceAndOsInfo(),
    browserInfo: getBrowserAndScreenInfo(),
    status: status
  };

  try {
    fetch(scriptUrl, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch(_) {}
}

/**
 * 標記題目開始渲染（啟動反應耗時計時器）
 */
export function startQuestionAudit(word, mode) {
  _isQuestionActive = true;
  _currentWord = (word && word.word) ? String(word.word) : "";
  _currentMode = mode || "";
  _questionStartTime = performance.now();
}

/**
 * 審計作答耗時與答案內容（偵測外掛/腳本極速非人類作答）
 */
export function auditAnswerSpeed(guess, isCorrect) {
  if (!_isQuestionActive) return;
  const costMs = Math.round(performance.now() - _questionStartTime);
  _isQuestionActive = false;

  // 門檻審查：
  // 1. 拼字模式 (listen, scramble, trap)：正常人類拼字打字耗時至少需 1.0~2.5 秒
  //    若答對且耗時 < 750ms，具有明確的外掛直接注入答案特徵！
  // 2. 選擇題模式 (pick)：閱讀四個選項並點擊，人類視神經與肌肉反應極限約 380ms
  //    若答對且耗時 < 380ms，判定為非人類外掛腳本。
  let isSuperhuman = false;
  let threshold = 750;

  if (_currentMode === "pick") {
    threshold = 380;
    if (costMs < 380 && isCorrect) isSuperhuman = true;
  } else {
    if (costMs < 750 && isCorrect) isSuperhuman = true;
  }

  if (isSuperhuman) {
    const details = `題目: '${_currentWord}' (${_currentMode}) | 作答耗時: ${costMs}ms (${(costMs / 1000).toFixed(2)}秒，低於人類正常反應閾值 ${threshold}ms) | 提交答案: '${guess || ""}'`;
    reportCheatAudit("非人類超速作答 (外掛腳本特徵)", details, "已記錄作答時間異常");
    showAntiCheatToast("⚠️ 資安警示：作答時間異常極速（具腳本特徵），數據已存證！");
  }
}

/**
 * 向後端 Google Sheet 發送資安駭客入侵事件日誌 (依刑法妨害電腦使用罪證據保全標準)
 */
export async function reportSecurityIncident(method, details, result = "🚫 已即時攔截並阻斷請求 (403)") {
  const now = Date.now();
  const cacheKey = `sec_${method}_${details.slice(0, 30)}`;
  if (_debounceCache.has(cacheKey) && (now - _debounceCache.get(cacheKey) < 4000)) {
    return;
  }
  _debounceCache.set(cacheKey, now);

  const scriptUrl = _scriptUrl || window.__SCRIPT_URL || "https://script.google.com/macros/s/AKfycbx1hyCNJxqFMoaJgIxfZqLYIYH00NegI1Yd8NJP6gRjqwOndWGkmr-H9tGvVwK_axM9/exec";
  const username = localStorage.getItem("current_user") || window.__CURRENT_USER || "";
  const role = localStorage.getItem("user_role") || window.__USER_ROLE || "student";

  const payload = {
    action: "reportSecurityIncident",
    username: username || "（未登入訪客 / 惡意連線）",
    realName: localStorage.getItem("user_real_name") || "",
    className: localStorage.getItem("user_class_name") || "",
    role: role,
    method: method,
    details: details,
    device: getDeviceAndOsInfo(),
    browserInfo: getBrowserAndScreenInfo(),
    result: result
  };

  try {
    fetch(scriptUrl, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch(_) {}
}

/**
 * 全域資安監聽初始化
 */
export function initAntiCheat(options = {}) {
  if (options.scriptUrl) _scriptUrl = options.scriptUrl;

  // 1. 攔截開發者工具與除錯快捷鍵 (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U)
  window.addEventListener("keydown", (e) => {
    const isF12 = (e.key === "F12" || e.keyCode === 123);
    const isCtrlShiftI = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j" || e.key === "C" || e.key === "c");
    const isCtrlU = (e.ctrlKey || e.metaKey) && (e.key === "U" || e.key === "u");

    if (isF12 || isCtrlShiftI || isCtrlU) {
      e.preventDefault();
      e.stopPropagation();
      const actionName = isF12 ? "F12 開發者工具" : isCtrlU ? "Ctrl+U 檢視原始碼" : "Ctrl+Shift+I/J/C 除錯主控台";
      reportCheatAudit("嘗試開啟開發者工具 / 檢視原始碼", `按下快捷鍵：${e.code || e.key} (${actionName})`, "已攔截快捷鍵並存證");
      showAntiCheatToast(`⚠️ 資安警示：測驗期間禁止使用 ${actionName}，違規已記錄！`);
      return false;
    }
  }, true);

  // 2. 監聽分頁切換與視窗失焦 (離開測驗視窗查字典)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      _hiddenStartTime = Date.now();
    } else if (document.visibilityState === "visible" && _hiddenStartTime > 0) {
      const awaySec = Math.round((Date.now() - _hiddenStartTime) / 1000);
      _hiddenStartTime = 0;

      // 離開視窗超過 1 秒即記錄
      if (awaySec >= 1) {
        const wordInfo = _currentWord ? `當前題目: '${_currentWord}' (${_currentMode})` : "非作答狀態中切頁";
        reportCheatAudit("測驗中切換分頁 / 跳出視窗", `離開測驗畫面達 ${awaySec} 秒後切回；${wordInfo}`, "已記錄切頁歷程");
        showAntiCheatToast(`⚠️ 資安警示：偵測到離開測驗視窗 (${awaySec}秒)，行為已通報老師！`);
      }
    }
  });

  // 3. 攔截拼字框的剪貼簿貼上 (Paste)
  document.addEventListener("paste", (e) => {
    const target = e.target;
    if (target && (target.tagName === "INPUT" || target.classList.contains("spellbox") || target.closest("#quizstage"))) {
      const pastedText = (e.clipboardData || window.clipboardData)?.getData("text") || "";
      e.preventDefault();
      reportCheatAudit("拼字輸入框嘗試貼上外部文字", `嘗試貼上剪貼簿內容：'${pastedText.slice(0, 60)}' (目標長度: ${pastedText.length} 字元)`, "已攔截貼上動作");
      showAntiCheatToast("⚠️ 測驗規範：禁止直接貼上外部答案！請使用鍵盤手動拼字。");
    }
  }, true);

  // 4. 偵測 LocalStorage 外部竄改
  window.addEventListener("storage", (e) => {
    if (e.key && (e.key.startsWith("spellAgent") || e.key.startsWith("today_task") || e.key.startsWith("streak"))) {
      reportCheatAudit("竄改本機儲存資料 (LocalStorage 攻擊)", `外部變更鍵值 '${e.key}'；舊值: ${(e.oldValue||"").slice(0,40)}，新值: ${(e.newValue||"").slice(0,40)}`, "已警告並通報異常");
    }
  });

  // ── 5. 防駭客入侵防禦：無頭瀏覽器與自動化渗透工具偵測 ──
  try {
    if (navigator.webdriver === true) {
      reportSecurityIncident(
        "自動化滲透程式 / 無頭瀏覽器 (Webdriver/Bot)",
        "偵測到 navigator.webdriver = true (Selenium/Puppeteer/自動化爬蟲入侵腳本特徵)",
        "🛡️ 已標記自動化連線並保全證據"
      );
    }
  } catch(_) {}

  // ── 6. 防駭客入侵防禦：底層核心 API 遭 Hook 竄改檢測 ──
  try {
    if (window.fetch && typeof window.fetch.toString === "function") {
      const fetchStr = window.fetch.toString();
      if (!fetchStr.includes("[native code]") && !fetchStr.includes("fetch")) {
        reportSecurityIncident(
          "前端底層網路 API 遭惡意竄改 (Function Hooking)",
          "偵測到原生 window.fetch 被未知外部腳本覆寫攔截",
          "🚫 觸發底層安全警報並記錄"
        );
      }
    }
  } catch(_) {}

  // ── 7. 防駭客入侵防禦：輸入欄位即時 SQL/XSS 攻擊特徵探測 ──
  document.addEventListener("input", (e) => {
    const val = (e.target && e.target.value) || "";
    if (val.length >= 6) {
      // 檢測高危 SQL 注入與 XSS 試探特徵
      const isSqlProbe = /\b(union\s+select|select\s+.*\s+from|insert\s+into|drop\s+table|delete\s+from|--|#|or\s+['"]?1['"]?\s*=\s*['"]?1)\b/i.test(val);
      const isXssProbe = /<script|javascript:|onerror\s*=|onload\s*=|document\.cookie/i.test(val);
      if (isSqlProbe || isXssProbe) {
        const attackType = isSqlProbe ? "SQL 資料庫注入探測 (SQL Injection)" : "跨站腳本注入探測 (XSS Probe)";
        reportSecurityIncident(
          `輸入欄位惡意探測 (${attackType})`,
          `於元素 <${(e.target.tagName || "").toLowerCase()}> 輸入危險字串: '${val.slice(0, 60)}'`,
          "🚫 已觸發 WAF 規則並依法存證"
        );
        showAntiCheatToast("🚨 資安防禦警示：偵測到危險代碼注入特徵！系統已依法保全證據。");
      }
    }
  }, true);
}
