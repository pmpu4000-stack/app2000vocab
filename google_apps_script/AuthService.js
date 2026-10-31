// 0. 密碼雜湊與資安防護
// ════════════════════════════════════════════════════════════════════

function hashPassword(plainText) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(plainText).trim(),
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => ("0" + (b & 0xFF).toString(16)).slice(-2)).join("");
}

function isHashedPassword(str) {
  return /^[a-f0-9]{64}$/.test(String(str || "").trim());
}

function _failKey(u)     { return "lf_" + u; }
function _lockKey(u)     { return "lk_" + u; }
function _authKey(u, hp) { return "au_" + u + "_" + hp.substring(0,12); }

function checkLoginAttempts(username) {
  try {
    if (CacheService.getScriptCache().get(_lockKey(username))) {
      return { locked: true, message: `帳號已鎖定，請 ${SYS.LOGIN_LOCK_SEC/60} 分鐘後再試` };
    }
    return { locked: false };
  } catch(_) { return { locked: false }; }
}

function recordLoginFailure(username) {
  try {
    const cache = CacheService.getScriptCache();
    const n = parseInt(cache.get(_failKey(username)) || "0") + 1;
    cache.put(_failKey(username), String(n), SYS.LOGIN_LOCK_SEC);
    if (n >= SYS.LOGIN_MAX_FAIL) {
      cache.put(_lockKey(username), "1", SYS.LOGIN_LOCK_SEC);
      logError("登入保護", `帳號 ${username} 連續失敗 ${n} 次，已鎖定`, username, "");
    }
  } catch(_) {}
}

function clearLoginFailures(username) {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove(_failKey(username));
    cache.remove(_lockKey(username));
  } catch(_) {}
}

function getStudentClass(username, rawClass) {
  const c = String(rawClass || "").trim();
  if (c) return c;
  const m = String(username || "").match(/^([0-9]{3}|[A-Za-z]+[0-9]{1,2})([0-9]{2})$/);
  return (m && m[1]) ? m[1] + "班" : "預設班級";
}

function isAdminTeacher(className) {
  const c = String(className || "").trim().toLowerCase();
  return !c || c === "all" || c === "全校" || c === "教師群" || c === "admin";
}

/**
 * 標準化日期格式為 yyyy-MM-dd
 * 相容 Date 物件、斜線字串 (yyyy/M/d, yyyy/MM/dd)、橫線字串 (yyyy-M-d, yyyy-MM-dd) 與含時間字串
 */
function formatStandardDateYMD(val) {
  if (!val) return "";
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    return Utilities.formatDate(val, "Asia/Taipei", "yyyy-MM-dd");
  }
  const s = String(val).trim().replace(/\//g, "-");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = m[1];
    const mo = m[2].padStart(2, "0");
    const d = m[3].padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  try {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return Utilities.formatDate(parsed, "Asia/Taipei", "yyyy-MM-dd");
    }
  } catch(_) {}
  return s;
}

/**
 * 標準化時間格式 (HH:mm)
 * 相容 Date 物件 (防試算表 1899 年預設日期)、含秒字串與標準 HH:mm
 */
function formatStandardTimeHHmm(val) {
  if (!val) return "";
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    return Utilities.formatDate(val, "Asia/Taipei", "HH:mm");
  }
  const s = String(val).trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    return String(m[1]).padStart(2, "0") + ":" + m[2];
  }
  return s;
}

/**
 * 標準化日期時間格式為 yyyy-MM-dd HH:mm:ss
 */
function formatStandardDateTime(val) {
  if (!val) return "";
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    return Utilities.formatDate(val, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{1,2})(:(\d{1,2}))?/);
  if (m) {
    const y = m[1];
    const mo = m[2].padStart(2, "0");
    const d = m[3].padStart(2, "0");
    const h = m[4].padStart(2, "0");
    const mi = m[5].padStart(2, "0");
    const sec = (m[7] || "00").padStart(2, "0");
    return `${y}-${mo}-${d} ${h}:${mi}:${sec}`;
  }
  try {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return Utilities.formatDate(parsed, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
    }
  } catch(_) {}
  return s;
}

function isSystemSheet(name) {
  return SYS.SYSTEM_SHEETS.has(name);
}

/**
 * 取得學生個人工作表（支援大小寫與前後空白容錯）
 */
function getStudentSheet(ss, username) {
  if (!ss || !username) return null;
  const cleanU = String(username).trim();
  let sheet = ss.getSheetByName(cleanU);
  if (sheet) return sheet;
  const targetLower = cleanU.toLowerCase();
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().trim().toLowerCase() === targetLower) {
      return sheets[i];
    }
  }
  return null;
}

/**
 * 確保學生分頁具備 26 欄標準格式（全面以遊戲設計與單字數為核心），並將表頭與欄寬美化為高可讀性、清楚簡潔之分組色彩
 */
function ensureStudentSheetColumns(sheet) {
  if (!sheet) return;
  try {
    const studentHdr = [
      "備份時間", "完整JSON", "等級", "分數", "連勝", "最佳連勝",
      "學習中", "練習中", "精通", "共答對單字", "累積受測單字", "單字掌握率",
      "LEVEL 1 入門\n(答對/受測字數)", "LEVEL 2 基礎\n(答對/受測字數)",
      "LEVEL 3 進階\n(答對/受測字數)", "LEVEL 4 挑戰\n(答對/受測字數)", "LEVEL 5 精熟\n(答對/受測字數)",
      "🎧 聽與拼\n(答對/受測字數)", "✅ 選拼法\n(答對/受測字數)", "🧩 字母重組\n(答對/受測字數)", "🖍️ 填空陷阱\n(答對/受測字數)",
      "任務名稱", "施測單字數", "作答單字數", "答對單字數", "指定測驗成績", "指定測驗正確率", "練習狀態", "測驗錯題單字",
      "自由練習受測字數", "自由練習答對字數", "自由練習正確率", "自由練習錯題單字",
      "防偽驗證"
    ];

    const maxCols = sheet.getMaxColumns();
    const lastCol = sheet.getLastColumn();

    // 🚀 極速快取檢查：若表頭已是最新 33 欄且欄位名稱完全相符
    if (lastCol >= 34) {
      const firstRowVals = sheet.getRange(1, 1, 1, 33).getValues()[0] || [];
      if (firstRowVals[2] === "等級" && firstRowVals[6] === "學習中" && firstRowVals[9] === "共答對單字" && firstRowVals[21] === "任務名稱" && firstRowVals[22] === "施測單字數" && firstRowVals[29] === "自由練習受測字數") {
        if (sheet.getLastRow() >= 2) {
          const sampleRow = sheet.getRange(2, 23, 1, 7).getValues()[0] || [];
          const hasOldData = String(sampleRow[1] || "").includes("%") || String(sampleRow[2] || "").includes("完成") || String(sampleRow[5] || "").includes("%") || String(sampleRow[0] || "").includes("/");
          if (hasOldData) {
            migrateStudentSheetRows_(sheet);
          }
        }
        return;
      }
    }

    if (maxCols < 34) {
      sheet.insertColumnsAfter(maxCols, 34 - maxCols);
    } else if (maxCols > 34 && sheet.getLastRow() <= 1) {
      sheet.deleteColumns(34, maxCols - 33);
    }

    sheet.getRange(1, 1, 1, studentHdr.length).setValues([studentHdr]);

    // 1. 凍結第 1 列 (表頭) 與第 1 欄 (紀錄時間)，方便水平滑動對照
    if (sheet.getFrozenRows() < 1) sheet.setFrozenRows(1);
    if (sheet.getFrozenColumns() < 1) sheet.setFrozenColumns(1);
    sheet.setRowHeight(1, 45);

    // 2. 隱藏龐大的 JSON 備份欄（第 B 欄），避免管理者視覺雜亂干擾
    sheet.hideColumns(2);

    // 3. 管理者高對比、護眼分組色塊美化（對齊遊戲介面各區塊）
    sheet.getRange("A1").setBackground("#f1f5f9").setFontColor("#334155").setFontWeight("bold"); // 紀錄時間
    sheet.getRange("B1").setBackground("#e2e8f0").setFontColor("#64748b").setFontWeight("normal"); // 完整JSON
    sheet.getRange("C1:F1").setBackground("#dbeafe").setFontColor("#1e40af").setFontWeight("bold"); // 遊戲狀態 (等級、分數、連勝、最佳連勝)
    sheet.getRange("G1:L1").setBackground("#dcfce7").setFontColor("#065f46").setFontWeight("bold"); // 整體進度 (學習中、練習中、精通、共答對、受測、掌握率)
    sheet.getRange("M1:Q1").setBackground("#f3e8ff").setFontColor("#6b21a8").setFontWeight("bold"); // 關卡進度 (LEVEL 1~5)
    sheet.getRange("R1:U1").setBackground("#ccfbf1").setFontColor("#0f766e").setFontWeight("bold"); // 四大練習模式
    sheet.getRange("V1:AC1").setBackground("#e0e7ff").setFontColor("#3730a3").setFontWeight("bold"); // 指定測驗專屬區塊 (靛青色，含施測/作答/答對)
    sheet.getRange("AD1:AG1").setBackground("#fef3c7").setFontColor("#92400e").setFontWeight("bold"); // 自由練習專屬區塊 (琥珀黃色)

    sheet.getRange("1:1").setWrap(true).setHorizontalAlignment("center").setVerticalAlignment("middle");

    // 4. 精簡最佳化欄寬與設定純文字格式（防止如 6/6 被試算表誤轉為日期 6月6日）
    const widths = [
      155, 40, 60, 70, 65, 75,
      75, 75, 75, 95, 105, 95,
      115, 115, 115, 115, 115,
      115, 115, 115, 115,
      130, 95, 95, 95, 95, 95, 110, 200,
      115, 115, 95, 200,
      120
    ];
    widths.forEach((w, idx) => sheet.setColumnWidth(idx + 1, w));
    try {
      sheet.getRange("G:K").setNumberFormat("0");
      sheet.getRange("L:L").setNumberFormat("0%");
      sheet.getRange("M:U").setNumberFormat("@");
      sheet.getRange("W:Y").setNumberFormat("0");
      sheet.getRange("Z:AH").setNumberFormat("@");
    try { sheet.getRange("AH1").setBackground("#e0f2fe").setFontColor("#0369a1").setFontWeight("bold"); } catch(_) {}
    } catch(_) {}

    migrateStudentSheetRows_(sheet);

    // 5. 恢復原生 Google 試算表標準 1000 列規格，絕不裁切列數
    const maxR = sheet.getMaxRows();
    if (maxR < 1000) {
      sheet.insertRowsAfter(maxR, 1000 - maxR);
    }
  } catch(e) {
    logError("ensureStudentSheetColumns", e, sheet.getName(), "");
  }
}

/**
 * 智慧解析學生分頁表頭之欄位索引，相容新舊版本結構
 */
function getHeaderIndexMap(headers) {
  const map = {
    date: 0, json: 1, level: 2, score: 3, streak: 4, best: 5,
    learning: 6, practicing: 7, mastered: 8, correct: 9, attempts: 10, accuracy: 11,
    l1: 12, l2: 13, l3: 14, l4: 15, l5: 16,
    mListen: 17, mPick: 18, mScramble: 19, mTrap: 20,
    taskName: 21, taskAssigned: 22, taskAnswered: 23, taskCorrect: 24, taskScore: 25, taskRate: 26, status: 27, wrong: 28,
    freeTested: 29, freeCorrect: 30, freeRate: 31, freeWrong: 32, authSign: 33
  };
  (headers || []).forEach((h, idx) => {
    const s = String(h || "").trim();
    if (s.includes("防偽") || s.includes("簽章") || s.includes("簽名")) map.authSign = idx;
    else if (s.includes("自由練習受測") || s.includes("自由練習題數")) map.freeTested = idx;
    else if (s.includes("自由練習答對")) map.freeCorrect = idx;
    else if (s.includes("自由練習正確率")) map.freeRate = idx;
    else if (s.includes("自由練習錯題")) map.freeWrong = idx;
    else if (s.includes("任務名稱")) map.taskName = idx;
    else if (s.includes("施測單字數")) map.taskAssigned = idx;
    else if (s.includes("作答單字數")) map.taskAnswered = idx;
    else if (s.includes("答對單字數") && !s.includes("自由")) map.taskCorrect = idx;
    else if (s.includes("指定測驗成績")) map.taskScore = idx;
    else if (s.includes("指定測驗正確率")) map.taskRate = idx;
    else if (s.includes("練習狀態")) map.status = idx;
    else if (s.includes("測驗錯題") || (s.includes("錯題") && !s.includes("自由"))) map.wrong = idx;
    else if (s.includes("受測單字") || s.includes("作答題數")) map.attempts = idx;
    else if (s.includes("共答對單字") || s.includes("答對題數")) map.correct = idx;
    else if (s.includes("掌握率") || (s.includes("正確率") && !s.includes("指定") && !s.includes("自由"))) map.accuracy = idx;
    else if (s.includes("精通")) map.mastered = idx;
    else if (s.includes("練習中")) map.practicing = idx;
    else if (s.includes("學習中")) map.learning = idx;
    else if (s.includes("最佳連勝")) map.best = idx;
    else if (s.includes("連勝")) map.streak = idx;
    else if (s.includes("分數")) map.score = idx;
    else if (s.includes("等級")) map.level = idx;
    else if (s.includes("備份時間") || s.includes("紀錄時間") || s.includes("日期")) map.date = idx;
    else if (s.includes("完整JSON")) map.json = idx;
  });
  return map;
}

function compressData(jsonStr) {
  const blob = Utilities.newBlob(jsonStr, "application/json", "d.json");
  return "GZ:" + Utilities.base64Encode(Utilities.gzip(blob).getBytes());
}

function decompressData(stored) {
  const s = String(stored || "").trim();
  if (!s) return "";
  if (!s.startsWith("GZ:")) return s;
  try {
    const bytes = Utilities.base64Decode(s.substring(3));
    return Utilities.ungzip(Utilities.newBlob(bytes, "application/x-gzip", "d.gz"))
      .getDataAsString("UTF-8");
  } catch(e) {
    logError("decompressData", e, "", s.substring(0,30));
    return s;
  }
}

function sanitizeLogDetails(input) {
  if (!input) return "";
  let str = (typeof input === "object") ? JSON.stringify(input) : String(input);
  str = str.replace(/"(password|oldPassword|newPassword|confirmPassword)"\s*:\s*"[^"]*"/gi, '"$1":"***"');
  str = str.replace(/&(password|oldPassword|newPassword|confirmPassword)=[^&]*/gi, '&$1=***');
  return str;
}

/**
 * 將技術性錯誤代碼與堆疊轉譯為一般師生容易看懂的白話說明與處理建議
 */
function translateErrorForHuman(action, rawMsg, details) {
  let friendlyAction = action;
  let friendlyMsg = rawMsg;
  let suggestion = "";

  const a = String(action || "").toLowerCase();
  const m = String(rawMsg || "");
  const d = String(details || "");

  // 1. 動作分類轉譯
  if (a.includes("curfew") || a.includes("時間限制")) {
    friendlyAction = "⏰ 時間管制攔截";
  } else if (a.includes("device") || a.includes("裝置")) {
    friendlyAction = "📱 裝置更換/代答警示";
  } else if (a.includes("login") || a.includes("登入")) {
    friendlyAction = "🔑 學生/教師登入";
  } else if (a.includes("saverecord") || a.includes("儲存")) {
    friendlyAction = "💾 儲存學習進度";
  } else if (a.includes("teacher") || a.includes("任務")) {
    friendlyAction = "📝 教師派發任務";
  } else if (a.includes("analytics") || a.includes("統計")) {
    friendlyAction = "📊 讀取分析大數據";
  } else if (a.includes("decompress")) {
    friendlyAction = "📦 讀取歷史進度";
  } else if (a.includes("cleanup")) {
    friendlyAction = "🧹 試算表清理分頁";
  } else {
    friendlyAction = `⚙️ ${action}`;
  }

  // 2. 情況說明與因應建議
  if (m.includes("更換裝置登入") || m.includes("換裝置")) {
    friendlyMsg = "帳號在不同裝置登入（前裝置已自動登出）";
    suggestion = d ? `⚠️ 警示：同一帳號在另一台裝置登入（${d}）。請確認是否為學生借用帳號給他人代答，或學生更換新手機/電腦。` : "⚠️ 警示：同一帳號在另一台裝置登入。請確認是否為學生借用帳號給他人代答，或學生更換新手機/電腦。";
  } else if (m.includes("帳號或密碼錯誤")) {
    friendlyMsg = "帳號或密碼輸入錯誤";
    suggestion = "💡 一般學生操作疏失。請提醒學生核對學號與密碼大小寫後重新輸入即可。";
  } else if (m.includes("連續失敗") || m.includes("鎖定")) {
    friendlyMsg = "密碼連續打錯 5 次已觸發防護鎖定";
    suggestion = "🛡️ 系統安全防護中。請學生等待 10 分鐘自動解鎖，或由老師在試算表重設密碼。";
  } else if (m.includes("未提供帳號或密碼")) {
    friendlyMsg = "登入欄位空白";
    suggestion = "💡 請學生輸入帳號與密碼後再點擊登入。";
  } else if (m.includes("伺服器忙碌")) {
    friendlyMsg = "多人同時交卷，伺服器排隊中";
    suggestion = "⏳ 瞬間連線人數過多。請學生稍候 3~5 秒再次點擊儲存即可順利上傳。";
  } else if (m.includes("資料過大")) {
    friendlyMsg = "學習紀錄累積資料超出限制";
    suggestion = "⚠️ 該學生紀錄過多，建議備份後清理該學生分頁早期資料。";
  } else if (m.includes("找不到【使用者清單】")) {
    friendlyMsg = "試算表中缺少【使用者清單】工作表";
    suggestion = "⚠️ 系統關鍵分頁缺失，請確認試算表內是否有【使用者清單】分頁，不可誤刪。";
  } else if (m.includes("無權限")) {
    friendlyMsg = "帳號權限不足";
    suggestion = "🔒 學生帳號無法操作教師後台功能，屬正常防護。";
  } else {
    friendlyMsg = m.length > 100 ? m.substring(0, 100) + "..." : m;
    suggestion = d ? `技術細節：${d.substring(0, 200)}` : "系統一般運行日誌。";
  }

  return { friendlyAction, friendlyMsg, suggestion };
}

function logError(action, err, username, details) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName("錯誤日誌");
    const headers = ["紀錄時間","功能項目","使用者","情況說明 (白話)","建議因應措施 / 技術詳細"];
    if (!logSheet) {
      logSheet = ss.insertSheet("錯誤日誌");
      logSheet.appendRow(headers);
      logSheet.getRange("1:1")
        .setFontWeight("bold").setBackground("#fee2e2")
        .setFontColor("#991b1b").setHorizontalAlignment("center").setVerticalAlignment("middle");
      logSheet.setRowHeight(1, 36);
      [160,160,110,240,450].forEach((w,i) => logSheet.setColumnWidth(i+1, w));
      logSheet.setFrozenRows(1);
    } else if (logSheet.getLastRow() >= 1 && logSheet.getRange(1, 4).getValue() === "錯誤訊息") {
      // 自動升級舊版表頭為易讀白話表頭
      logSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      [160,160,110,240,450].forEach((w,i) => logSheet.setColumnWidth(i+1, w));
    }
    const ts  = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
    const msg = err ? (err.message || String(err)) : "未知錯誤";
    let det   = "";
    if (err && err.stack)             det = String(err.stack);
    else if (typeof details==="object") { try { det = JSON.stringify(details); } catch(_) { det = String(details); } }
    else                              det = String(details || "");
    det = sanitizeLogDetails(det);

    const translated = translateErrorForHuman(action, msg, det);

    logSheet.insertRowBefore(2);
    logSheet.getRange(2,1,1,5)
      .setValues([[ts, translated.friendlyAction, String(username||"系統").trim(), translated.friendlyMsg, translated.suggestion]])
      .setVerticalAlignment("middle").setWrap(true);
    const last = logSheet.getLastRow();
    if (last > 501) logSheet.deleteRows(502, last - 501);
  } catch(e) { Logger.log("logError 寫入失敗: " + e); }
}

// ════════════════════════════════════════════════════════════════════
// 0.1 應用程式防火牆 (WAF) 即時防護 (純攔截阻斷，不記錄使用者操作行為)
// ════════════════════════════════════════════════════════════════════

/**
 * 應用程式防火牆 (WAF) 深度封包檢測
 */
function inspectRequestForAttacks(ss, params, e) {
  if (!params || typeof params !== "object") return null;

  // 1. 原型鏈污染 (Prototype Pollution)
  const rawContents = (e && e.postData && e.postData.contents) || "";
  if (rawContents.includes("__proto__") || (rawContents.includes("constructor") && rawContents.includes("prototype"))) {
    const violation = {
      username: params.username || "",
      method: "原型鏈污染攻擊 (Prototype Pollution)",
      details: "封包包含 __proto__ 或 constructor 原型鏈覆寫特徵",
      result: "🚫 攔截攻擊並終止請求 (403 Forbidden)"
    };
    return violation;
  }

  // 2. 遞迴檢測所有參數中的 XSS、公式注入與目錄穿透
  function scanValue(val, keyPath) {
    if (typeof val === "string") {
      const trimmed = val.trim();
      
      // A. 公式注入 (Formula Injection)
      if (/^[=+\-@|%]/.test(trimmed)) {
        if (/^[=+\-@|%]\s*(IMPORTXML|IMPORTDATA|IMPORTHTML|IMPORTRANGE|HYPERLINK|IMAGE|WEBSERVICE|cmd|powershell|curl|wget)/i.test(trimmed) || (trimmed.startsWith("=") && trimmed.length > 2)) {
          return {
            method: "試算表公式注入攻擊 (Formula Injection)",
            details: `欄位 '${keyPath}' 包含危險公式注入字串: '${trimmed.slice(0, 100)}'`,
            result: "🚫 惡意公式已被攔截阻斷 (403 Forbidden)"
          };
        }
      }

      // B. 跨站腳本攻擊 (XSS)
      if (/<script|javascript:|vbscript:|onerror\s*=|onload\s*=|onclick\s*=|eval\(|alert\(|document\.cookie/i.test(trimmed)) {
        return {
          method: "跨站腳本注入攻擊 (XSS Attack)",
          details: `欄位 '${keyPath}' 包含惡意腳本程式碼: '${trimmed.slice(0, 100)}'`,
          result: "🚫 惡意腳本已被攔截阻斷 (403 Forbidden)"
        };
      }

      // C. 目錄走訪 / 路徑穿透 (Path Traversal)
      if (/(\.\.[\/\\]){2,}|(\/etc\/passwd|c:\\windows\\system32)/i.test(trimmed)) {
        return {
          method: "目錄走訪/路徑穿透探測 (Path Traversal)",
          details: `欄位 '${keyPath}' 嘗試探測敏感系統路徑: '${trimmed.slice(0, 100)}'`,
          result: "🚫 存取拒絕 (403 Forbidden)"
        };
      }
    } else if (typeof val === "object" && val !== null) {
      for (const k in val) {
        if (Object.prototype.hasOwnProperty.call(val, k)) {
          const res = scanValue(val[k], keyPath ? `${keyPath}.${k}` : k);
          if (res) return res;
        }
      }
    }
    return null;
  }

  const attack = scanValue(params, "");
  if (attack) {
    return attack;
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════
// 1. 共用身分驗證
// ════════════════════════════════════════════════════════════════════

function authenticateUser(ss, inputUser, inputPass) {
  const username = String(inputUser || "").trim();
  const password = String(inputPass || "").trim();
  if (!username || !password) return { success:false, message:"未提供帳號或密碼" };

  const lockChk = checkLoginAttempts(username);
  if (lockChk.locked) return { success:false, message:lockChk.message };

  const hashedInput = hashPassword(password);
  const cache       = CacheService.getScriptCache();
  const cacheKey    = _authKey(username, hashedInput);
  try {
    const hit = cache.get(cacheKey);
    if (hit) return JSON.parse(hit);
  } catch(_) {}

  const sheet = ss.getSheetByName("使用者清單") || ss.getSheetByName("學生帳密");
  if (!sheet) {
    if (username === "admin" && password === "admin123") {
      const r = {success:true,username:"admin",role:"teacher",className:"all",realName:"系統管理員",isAdmin:true};
      try { cache.put(cacheKey, JSON.stringify(r), SYS.CACHE_AUTH_TTL); } catch(_) {}
      return r;
    }
    return {success:false, message:"找不到【使用者清單】工作表"};
  }

  // 極致快取優化：全校使用者名冊快取 600 秒，高併發登入免重複讀取試算表
  const rosterCacheKey = "ALL_USERS_ROSTER_V1";
  let data = null;
  try {
    const hitRoster = cache.get(rosterCacheKey);
    if (hitRoster) data = JSON.parse(hitRoster);
  } catch(_) {}

  if (!data) {
    data = sheet.getDataRange().getValues();
    try { cache.put(rosterCacheKey, JSON.stringify(data), 600); } catch(_) {}
  }

  let foundAnyTeacher = false;

  for (let i = 1; i < data.length; i++) {
    const rowUser = String(data[i][0] || "").trim();
    const rowPass = String(data[i][1] || "").trim();
    const role    = String(data[i][2] || "student").trim().toLowerCase() || "student";
    if (role === "teacher") foundAnyTeacher = true;

    if (rowUser === username) {
      const match = rowPass === hashedInput || (!isHashedPassword(rowPass) && rowPass === password);
      if (!match) { recordLoginFailure(username); return {success:false, message:"帳號或密碼錯誤"}; }

      // 自動無感升級明文密碼為 SHA-256 雜湊
      if (!isHashedPassword(rowPass)) {
        try { sheet.getRange(i + 1, 2).setValue(hashedInput); } catch(_) {}
      }

      clearLoginFailures(username);
      const rawClass  = String(data[i][3] || "").trim();
      const className = role === "teacher" ? (rawClass || "all") : getStudentClass(username, rawClass);
      const realName  = String(data[i][4] || "").trim();
      const isAdmin   = role === "teacher" && isAdminTeacher(className);
      const result    = {success:true, username, role, className, realName, isAdmin};
      try { cache.put(cacheKey, JSON.stringify(result), SYS.CACHE_AUTH_TTL); } catch(_) {}
      return result;
    }
  }

  // 僅當使用者清單內完全沒有任何一筆教師帳號時，才允許初始 admin 救援登入
  if (!foundAnyTeacher && username === "admin" && password === "admin123") {
    const r = {success:true,username:"admin",role:"teacher",className:"all",realName:"系統管理員",isAdmin:true};
    clearLoginFailures("admin");
    try { cache.put(cacheKey, JSON.stringify(r), SYS.CACHE_AUTH_TTL); } catch(_) {}
    return r;
  }

  recordLoginFailure(username);
  return {success:false, message:"帳號或密碼錯誤"};
}

function clearOverviewCache() {
  try { CacheService.getScriptCache().remove(SYS.CACHE_OVERVIEW_KEY); } catch(_) {}
}

/**
 * 快取「指定單字任務」工作表解析資料 300 秒 (全校學生與教師共用，大幅消除登入時的重複讀取)
 */
function getTeacherTasksCached_(ss) {
  const cacheKey = "TEACHER_TASKS_CACHE_ALL";
  const cache = CacheService.getScriptCache();
  try {
    const hit = cache.get(cacheKey);
    if (hit) return JSON.parse(hit);
  } catch(_) {}

  let tasks = [];
  try {
    const sheet = ss.getSheetByName("指定單字任務");
    if (sheet && sheet.getLastRow() >= 2) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        tasks.push({
          taskClass: String(data[i][0] || "").replace(/班$/, "").trim().toLowerCase(),
          rawClass : String(data[i][0] || "").trim(),
          taskName : String(data[i][1] || "").trim(),
          rawWords : String(data[i][2] || "").trim(),
          mode     : String(data[i][3] || "抽測").trim(),
          countVal : String(data[i][4] || "ALL").trim().toUpperCase(),
          enabled  : data[i][5] === true || String(data[i][5]).trim().toUpperCase() === "TRUE",
          taskDate : data[i][6] ? formatStandardDateYMD(data[i][6]) : ""
        });
      }
    }
  } catch(e) {
    logError("getTeacherTasksCached_", e, "", "");
  }

  try { cache.put(cacheKey, JSON.stringify(tasks), 300); } catch(_) {}
  return tasks;
}

/** 清除指定單字任務快取 */
function invalidateTeacherTaskCache_() {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove("TEACHER_TASKS_CACHE_ALL");
    cache.remove("TASK_WORDS_DICT_CACHE");
  } catch(_) {}
}

/** 快取任務單字字典 300 秒 */
function getTaskWordsDictCached_(ss) {
  const cacheKey = "TASK_WORDS_DICT_CACHE";
  const cache = CacheService.getScriptCache();
  try {
    const hit = cache.get(cacheKey);
    if (hit) return JSON.parse(hit);
  } catch(_) {}

  const dict = {};
  const tasks = getTeacherTasksCached_(ss);
  for (let i = 0; i < tasks.length; i++) {
    const tName = tasks[i].taskName.toLowerCase();
    const rawW = tasks[i].rawWords;
    const tDate = tasks[i].taskDate ? formatStandardDateYMD(tasks[i].taskDate) : "";
    const words = rawW ? rawW.split(/[\s,;\n\r]+/).filter(w => w.trim().length > 0) : [];
    if (tName) dict[tName] = words;
    if (tDate) {
      dict[tDate] = words;
      dict[tDate.replace(/-/g, "/")] = words;
      const parts = tDate.split("-");
      if (parts.length === 3) {
        const unpadded = `${parts[0]}-${parseInt(parts[1], 10)}-${parseInt(parts[2], 10)}`;
        dict[unpadded] = words;
        dict[unpadded.replace(/-/g, "/")] = words;
      }
    }
    if (tDate && tName) {
      dict[tDate + "_" + tName] = words;
      dict[tDate.replace(/-/g, "/") + "_" + tName] = words;
    }
  }

  try { cache.put(cacheKey, JSON.stringify(dict), 300); } catch(_) {}
  return dict;
}

// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// 1.5 單一裝置綁定與多開代答防護
// ════════════════════════════════════════════════════════════════════

function recordDeviceLoginLog(ss, username, realName, className, deviceDetails, statusFlag, note) {
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("裝置登入歷程");
    const headers = ["登入時間", "班級", "帳號", "姓名", "狀態標記", "設備類別", "作業系統與瀏覽器", "螢幕規格", "裝置識別碼", "稽核說明 (合規技術特徵)"];
    
    if (!sheet) {
      sheet = ss.insertSheet("裝置登入歷程");
      sheet.appendRow(headers);
      sheet.getRange("1:1")
        .setFontWeight("bold").setBackground("#e0f2fe")
        .setFontColor("#0369a1").setHorizontalAlignment("center").setVerticalAlignment("middle");
      sheet.setRowHeight(1, 36);
      [160, 90, 100, 100, 110, 110, 190, 110, 130, 280].forEach((w, i) => sheet.setColumnWidth(i + 1, w));
      sheet.setFrozenRows(1);
    }

    const ts = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
    const devType = (deviceDetails && deviceDetails.deviceType) || "💻 電腦";
    const osBrowser = (deviceDetails && deviceDetails.osBrowser) || (deviceDetails && deviceDetails.deviceDesc) || "未知環境";
    const resolution = (deviceDetails && deviceDetails.resolution) || "";
    const devId = (deviceDetails && deviceDetails.deviceId) || "";

    sheet.insertRowBefore(2);
    sheet.getRange(2, 1, 1, headers.length).setValues([[
      ts,
      String(className || "").trim(),
      String(username || "").trim(),
      String(realName || "").trim(),
      statusFlag,
      devType,
      osBrowser,
      resolution,
      devId,
      String(note || "").trim()
    ]]).setVerticalAlignment("middle");

    // 限制最大保留 1000 筆紀錄，確保試算表讀寫極速
    const last = sheet.getLastRow();
    if (last > 1001) {
      sheet.deleteRows(1002, last - 1001);
    }
  } catch(e) {
    Logger.log("recordDeviceLoginLog 寫入失敗: " + e);
  }
}

function registerStudentDevice(ss, username, realName, className, deviceDetails) {
  if (!username) return "";
  const cleanU = String(username).trim().toLowerCase();
  const cleanDevId = String(deviceDetails && deviceDetails.deviceId || "").trim();
  const cleanDevDesc = String(deviceDetails && (deviceDetails.deviceDesc || deviceDetails.osBrowser) || "未知裝置").trim();
  const sessionToken = "ST_" + Utilities.getUuid().replace(/-/g, "");

  const propKey = "DEV_" + cleanU;
  const cache = CacheService.getScriptCache();
  let prevInfo = null;

  try {
    const cached = cache.get(propKey);
    if (cached) prevInfo = JSON.parse(cached);
  } catch(_) {}

  if (!prevInfo) {
    try {
      const val = PropertiesService.getScriptProperties().getProperty(propKey);
      if (val) prevInfo = JSON.parse(val);
    } catch(_) {}
  }

  let statusFlag = "🟢 同機登入";
  let note = `正常登入：${cleanDevDesc}`;

  if (!prevInfo) {
    statusFlag = "🆕 首次登入";
    note = `初次綁定裝置：${cleanDevDesc}`;
  } else if (prevInfo.deviceId && cleanDevId && prevInfo.deviceId !== cleanDevId) {
    statusFlag = "⚠️ 換機登入";
    const oldDesc = prevInfo.deviceDesc || "舊裝置";
    note = `原裝置：${oldDesc} ➜ 變更為：${cleanDevDesc}`;
    logError("device_change", "更換裝置登入", cleanU, note);
  }

  // 寫入合規專屬「裝置登入歷程」試算表
  recordDeviceLoginLog(ss, cleanU, realName, className, deviceDetails, statusFlag, note);

  const newInfo = {
    token: sessionToken,
    deviceId: cleanDevId,
    deviceDesc: cleanDevDesc,
    time: Date.now()
  };

  try {
    const jsonStr = JSON.stringify(newInfo);
    cache.put(propKey, jsonStr, 21600); // 快取 6 小時
    PropertiesService.getScriptProperties().setProperty(propKey, jsonStr);
  } catch(e) {
    Logger.log("registerStudentDevice 儲存失敗: " + e);
  }

  return sessionToken;
}

function isStudentTokenValid(username, sessionToken) {
  if (!username || !sessionToken) return true;
  const cleanU = String(username).trim().toLowerCase();
  const cleanToken = String(sessionToken).trim();
  const propKey = "DEV_" + cleanU;
  const cache = CacheService.getScriptCache();
  let info = null;

  try {
    const cached = cache.get(propKey);
    if (cached) info = JSON.parse(cached);
  } catch(_) {}

  if (!info) {
    try {
      const val = PropertiesService.getScriptProperties().getProperty(propKey);
      if (val) info = JSON.parse(val);
    } catch(_) {}
  }

  if (!info || !info.token) return true;
  return info.token === cleanToken;
}
