// 2.5 學生使用時間管制 (每日 07:30 ~ 22:00) 與教師解除限制設定
// ════════════════════════════════════════════════════════════════════

/**
 * 確保「時間限制設定」工作表存在並維持專業格式 (支援全域預設、個別學生與特別日期)
 */
function ensureTimeSettingsSheet(ss) {
  let sheet = ss.getSheetByName("時間限制設定");
  const headers = [
    "設定類型", "設定名稱", "適用學號", "姓名班級", "作答開始時間", "作答結束時間",
    "起始日期", "結束日期", "狀態", "設定教師", "更新時間", "備註"
  ];
  const widths = [130, 160, 100, 120, 100, 100, 110, 110, 75, 100, 140, 180];

  if (!sheet) {
    sheet = ss.insertSheet("時間限制設定");
    sheet.appendRow(headers);
    sheet.getRange("1:1").setFontWeight("bold").setBackground("#0f766e").setFontColor("#ffffff").setHorizontalAlignment("center");
    widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
    sheet.setFrozenRows(1);
    sheet.setRowHeight(1, 36);

    // 建立預設全域作答時間 (預設 07:30 ~ 22:00)
    const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
    sheet.appendRow([
      "全域預設", "全校預設作答時間", "ALL", "全體學生", "07:30", "22:00",
      "", "", true, "系統預設", nowStr, "預設每日開放時間（教師修改後將自動儲存為下次預設）"
    ]);
  } else if (sheet.getLastColumn() < headers.length) {
    const currentLastCol = sheet.getLastColumn();
    sheet.insertColumnsAfter(currentLastCol, headers.length - currentLastCol);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange("1:1").setFontWeight("bold").setBackground("#0f766e").setFontColor("#ffffff").setHorizontalAlignment("center");
    widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
    sheet.setFrozenRows(1);
  }

  // 確保有一列全域預設設定
  if (sheet.getLastRow() < 2) {
    const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
    sheet.appendRow([
      "全域預設", "全校預設作答時間", "ALL", "全體學生", "07:30", "22:00",
      "", "", true, "系統預設", nowStr, "預設每日開放時間（教師修改後將自動儲存為下次預設）"
    ]);
  }

  return sheet;
}

/**
 * 檢查當前時間是否允許該學生使用系統
 * 規範：
 * 1. 優先檢查是否處於「特別日期解除全天限制」（若是則 24 小時全天開放）。
 * 2. 檢查該學生是否有「個別學生特別時間」設定。
 * 3. 若無個別設定，則套用「全域預設作答時間」（預設為上次教師修改的設定，初始為 07:30 ~ 22:00）。
 */
/**
 * 檢查當前時間是否允許該學生使用系統 (含 CacheService 120 秒高階快取加速)
 */
function checkTimeRestrictionAllowance(ss, username) {
  const now = new Date();
  const todayYMD = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd");
  const timeStr = Utilities.formatDate(now, "Asia/Taipei", "HH:mm");
  const parts = timeStr.split(":");
  const currentMinutes = Number(parts[0]) * 60 + Number(parts[1]);
  const cleanUser = String(username || "").trim().toLowerCase();

  const rules = getTimeRestrictionRulesCached_(ss, todayYMD);
  const globalStart = rules.globalStart || "07:30";
  const globalEnd = rules.globalEnd || "22:00";
  const globalStartMin = rules.globalStartMin !== undefined ? rules.globalStartMin : 450;
  const globalEndMin = rules.globalEndMin !== undefined ? rules.globalEndMin : 1320;
  const globalUpdatedAt = rules.globalUpdatedAt || "";
  const globalTeacher = rules.globalTeacher || "";

  const studentRule = (cleanUser && rules.studentRules[cleanUser]) ? rules.studentRules[cleanUser] : null;
  const isDateOverridden = !!rules.activeDateOverride;
  const activeDateOverride = rules.activeDateOverride || null;

  const effectiveStart = studentRule ? studentRule.startTime : globalStart;
  const effectiveEnd = studentRule ? studentRule.endTime : globalEnd;
  const effectiveStartMin = studentRule ? studentRule.startMin : globalStartMin;
  const effectiveEndMin = studentRule ? studentRule.endMin : globalEndMin;

  const isWithinHours = (currentMinutes >= effectiveStartMin && currentMinutes <= effectiveEndMin);
  const allowed = isDateOverridden || isWithinHours;

  return {
    allowed: allowed,
    isOverridden: isDateOverridden,
    hasStudentCustomTime: !!studentRule,
    studentRule: studentRule,
    startTime: effectiveStart,
    endTime: effectiveEnd,
    globalStartTime: globalStart,
    globalEndTime: globalEnd,
    globalUpdatedAt: globalUpdatedAt,
    globalTeacher: globalTeacher,
    currentMinutes: currentMinutes,
    timeStr: timeStr,
    todayDate: todayYMD,
    activeDateOverride: activeDateOverride
  };
}

/**
 * 解析時間限制設定並快取 120 秒 (全校學生共用，大幅消除重複試算表讀取)
 */
function getTimeRestrictionRulesCached_(ss, todayYMD) {
  const cacheKey = "TIME_RESTRICTION_RULES_" + todayYMD;
  const cache = CacheService.getScriptCache();
  try {
    const hit = cache.get(cacheKey);
    if (hit) return JSON.parse(hit);
  } catch(_) {}

  const rules = {
    globalStart: "07:30",
    globalEnd: "22:00",
    globalStartMin: 450,
    globalEndMin: 1320,
    globalUpdatedAt: "",
    globalTeacher: "",
    studentRules: {},
    activeDateOverride: null
  };

  try {
    const sheet = ensureTimeSettingsSheet(ss);
    if (sheet && sheet.getLastRow() >= 2) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const type = String(data[i][0] || "").trim();
        const name = String(data[i][1] || "").trim();
        const targetUser = String(data[i][2] || "").trim().toLowerCase();
        const studentInfo = String(data[i][3] || "").trim();
        const sTime = formatStandardTimeHHmm(data[i][4]);
        const eTime = formatStandardTimeHHmm(data[i][5]);
        const startD = formatStandardDateYMD(data[i][6]);
        const endD = formatStandardDateYMD(data[i][7]);
        const statusVal = String(data[i][8] || "").trim().toUpperCase();
        const isEnabled = (data[i][8] === true || statusVal === "TRUE" || statusVal === "啟用" || statusVal === "YES");
        const teacher = String(data[i][9] || "");
        const updatedAt = data[i][10] ? Utilities.formatDate(new Date(data[i][10]), "Asia/Taipei", "yyyy-MM-dd HH:mm") : "";
        const remark = String(data[i][11] || "");

        // 1. 全域預設作答時間
        if (type === "全域預設" || (targetUser === "all" && type !== "特別日期解除" && sTime && eTime)) {
          if (sTime && eTime) {
            rules.globalStart = sTime;
            rules.globalEnd = eTime;
            const sp = sTime.split(":");
            const ep = eTime.split(":");
            rules.globalStartMin = Number(sp[0]) * 60 + Number(sp[1]);
            rules.globalEndMin = Number(ep[0]) * 60 + Number(ep[1]);
            rules.globalUpdatedAt = updatedAt;
            rules.globalTeacher = teacher;
          }
        }

        // 2. 個別學生作答時間
        if (isEnabled && (type === "個別學生" || (targetUser && targetUser !== "all" && sTime && eTime))) {
          if (targetUser) {
            const sp = sTime.split(":");
            const ep = eTime.split(":");
            rules.studentRules[targetUser] = {
              username: targetUser,
              studentInfo: studentInfo,
              startTime: sTime,
              endTime: eTime,
              startMin: Number(sp[0]) * 60 + Number(sp[1]),
              endMin: Number(ep[0]) * 60 + Number(ep[1]),
              remark: remark,
              teacher: teacher
            };
          }
        }

        // 3. 特別日期全天解除
        if (isEnabled && (type === "特別日期解除" || (startD && endD))) {
          if (todayYMD >= startD && todayYMD <= endD) {
            rules.activeDateOverride = {
              name: name || "特別開放",
              startDate: startD,
              endDate: endD,
              remark: remark
            };
          }
        }
      }
    }
  } catch(e) {
    logError("getTimeRestrictionRulesCached_", e, "", "");
  }

  try { cache.put(cacheKey, JSON.stringify(rules), 120); } catch(_) {}
  return rules;
}

/** 清除作答時段規則快取 */
function invalidateTimeRestrictionRulesCache_() {
  try {
    const todayYMD = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
    CacheService.getScriptCache().remove("TIME_RESTRICTION_RULES_" + todayYMD);
  } catch(_) {}
}

/**
 * 讀取學生今日使用時長限制、首次登入時間、延長時間與解除狀態
 */
function getDailyUsageSettings(param1, username, isLogin) {
  const ss = (param1 && typeof param1.getSheetByName === "function") ? param1 : SpreadsheetApp.getActiveSpreadsheet();
  const cleanUser = String(username || "").trim().toLowerCase();
  const now = new Date();
  const todayStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd");

  // 1. 規則（全校時長 / 個別時長 / 今日延長與解除）— 使用共用快取，避免每次輪詢都讀取試算表
  const rules = getDailyUsageRulesCached_(ss, todayStr);
  const defaultMinutes = rules.defaultMinutes || 10;
  const studentMinutes = (cleanUser && rules.studentMinutes[cleanUser]) ? rules.studentMinutes[cleanUser] : null;
  let addedMinutes = 0;
  let isUnlocked = false;
  const extAll = rules.extensions["all"];
  const extUser = cleanUser ? rules.extensions[cleanUser] : null;
  if (extAll) { addedMinutes += extAll.added; if (extAll.unlocked) isUnlocked = true; }
  if (extUser && cleanUser !== "all") { addedMinutes += extUser.added; if (extUser.unlocked) isUnlocked = true; }

  // 2. 今日首次登入時間 — 先讀快取，快取沒有才讀 PropertiesService
  let firstLoginTime = null;
  if (cleanUser && cleanUser !== "all") {
    const propKey = "FIRST_LOGIN_" + cleanUser + "_" + todayStr;
    const cache = CacheService.getScriptCache();
    try {
      const cached = cache.get(propKey);
      if (cached) firstLoginTime = Number(cached);
    } catch(_) {}

    if (!firstLoginTime) {
      try {
        const scriptProps = PropertiesService.getScriptProperties();
        const val = scriptProps.getProperty(propKey);
        if (val) {
          firstLoginTime = Number(val);
        } else if (isLogin) {
          firstLoginTime = Date.now();
          scriptProps.setProperty(propKey, String(firstLoginTime));
        }
        if (firstLoginTime) cache.put(propKey, String(firstLoginTime), 21600);
      } catch(_) {}
    }

    // 每日清理一次過期的 FIRST_LOGIN_* 屬性，避免超過 500KB 屬性儲存上限
    if (isLogin) purgeOldFirstLoginProps_(todayStr);
  }

  if (!firstLoginTime) {
    firstLoginTime = Date.now();
  }

  return {
    todayDate: todayStr,
    limitMinutes: studentMinutes || defaultMinutes,
    defaultMinutes: defaultMinutes,
    studentMinutes: studentMinutes,
    extendedMinutes: addedMinutes,
    unlocked: isUnlocked,
    firstLoginTime: firstLoginTime
  };
}

/**
 * 解析「時間設定」分頁中的每日時長規則，結果快取 120 秒（教師修改時會立即清除快取）
 */
function getDailyUsageRulesCached_(ss, todayStr) {
  const cacheKey = "DAILY_USAGE_RULES_" + todayStr;
  const cache = CacheService.getScriptCache();
  try {
    const hit = cache.get(cacheKey);
    if (hit) return JSON.parse(hit);
  } catch(_) {}

  const rules = { defaultMinutes: 10, studentMinutes: {}, extensions: {} };
  try {
    const sheet = ensureTimeSettingsSheet(ss);
    if (sheet && sheet.getLastRow() >= 2) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const type = String(data[i][0] || "").trim();
        const targetUser = String(data[i][2] || "").trim().toLowerCase();
        const remark = String(data[i][11] || "").trim();

        if (type === "每日時長上限" && targetUser === "all") {
          const m = parseInt(remark, 10);
          if (!isNaN(m) && m > 0) rules.defaultMinutes = m;
        } else if (type === "個別學生時長" && targetUser) {
          const m = parseInt(remark, 10);
          if (!isNaN(m) && m > 0) rules.studentMinutes[targetUser] = m;
        } else if (type === "時長延長與解除" && targetUser) {
          const startD = formatStandardDateYMD(data[i][6]);
          const endD = formatStandardDateYMD(data[i][7]);
          const statusVal = String(data[i][8] || "").trim().toUpperCase();
          const isEnabled = (data[i][8] === true || statusVal === "TRUE" || statusVal === "啟用" || statusVal === "YES");
          if (!isEnabled) continue;
          if (startD && !(todayStr >= startD && todayStr <= (endD || startD))) continue;

          const ext = rules.extensions[targetUser] || { added: 0, unlocked: false };
          try {
            const parsed = JSON.parse(remark);
            if (parsed) {
              if (parsed.addedMinutes) ext.added += Number(parsed.addedMinutes) || 0;
              if (parsed.unlocked === true) ext.unlocked = true;
            }
          } catch(_) {
            const m = parseInt(remark, 10);
            if (!isNaN(m) && m > 0) ext.added += m;
          }
          rules.extensions[targetUser] = ext;
        }
      }
    }
  } catch(e) {
    logError("getDailyUsageRulesCached_", e, "", "");
  }

  try { cache.put(cacheKey, JSON.stringify(rules), 120); } catch(_) {}
  return rules;
}

/** 教師修改每日時長設定後，清除規則快取讓學生端立即取得新設定 */
function invalidateDailyUsageRulesCache_() {
  try {
    const todayStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
    CacheService.getScriptCache().remove("DAILY_USAGE_RULES_" + todayStr);
  } catch(_) {}
}

/** 每天最多執行一次：刪除非今日的 FIRST_LOGIN_* 屬性 */
function purgeOldFirstLoginProps_(todayStr) {
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty("FIRST_LOGIN_PURGED_DATE") === todayStr) return;
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(3000)) return;
    try {
      if (props.getProperty("FIRST_LOGIN_PURGED_DATE") === todayStr) return;
      const suffix = "_" + todayStr;
      props.getKeys().forEach(function(k) {
        if (k.indexOf("FIRST_LOGIN_") === 0 && k !== "FIRST_LOGIN_PURGED_DATE" && k.slice(-suffix.length) !== suffix) {
          props.deleteProperty(k);
        }
      });
      props.setProperty("FIRST_LOGIN_PURGED_DATE", todayStr);
    } finally {
      lock.releaseLock();
    }
  } catch(e) {
    logError("purgeOldFirstLoginProps_", e, "", "");
  }
}

/**
 * 教師儲存每日時長設定 (全校或個別學生)
 */
function saveDailyMinutesSetting(ss, teacherUser, data) {
  const sheet = ensureTimeSettingsSheet(ss);
  const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
  const targetUser = String((data && data.targetUser) || "ALL").trim().toLowerCase();
  const minutes = parseInt((data && data.minutes), 10) || 10;
  const isGlobal = (targetUser === "all");

  const rowType = isGlobal ? "每日時長上限" : "個別學生時長";
  const rowName = isGlobal ? `全校每日使用上限${minutes}分鐘` : `學生${targetUser}每日上限${minutes}分鐘`;
  const studentInfo = isGlobal ? "全體學生" : (String((data && data.studentInfo) || targetUser));

  let foundRow = -1;
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === rowType && String(vals[i][2]).trim().toLowerCase() === targetUser) {
      foundRow = i + 1;
      break;
    }
  }

  const rowVals = [
    rowType, rowName, isGlobal ? "ALL" : targetUser, studentInfo,
    "", "", "", "", true, teacherUser || "教師", nowStr, String(minutes)
  ];

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, 12).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
  }

  try {
    const todayStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
    CacheService.getScriptCache().remove("DAILY_USAGE_RULES_" + todayStr);
  } catch(_) {}

  return {
    status: "success",
    message: `✅ 已成功設定【${isGlobal ? '全校' : targetUser}】每日使用時長為 ${minutes} 分鐘！`
  };
}

/**
 * 教師延長學生今日使用時間 (加時)
 */
function extendStudentUsageTime(ss, teacherUser, data) {
  const sheet = ensureTimeSettingsSheet(ss);
  const now = new Date();
  const todayStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd");
  const nowStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
  const targetUser = String((data && data.targetUser) || "ALL").trim().toLowerCase();
  const addMinutes = parseInt((data && data.addMinutes), 10) || 10;
  const isGlobal = (targetUser === "all");
  const studentInfo = isGlobal ? "全體學生" : (String((data && data.studentInfo) || targetUser));

  let foundRow = -1;
  let existingAdded = 0;
  let existingUnlocked = false;
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === "時長延長與解除" &&
        String(vals[i][2]).trim().toLowerCase() === targetUser &&
        formatStandardDateYMD(vals[i][6]) === todayStr) {
      foundRow = i + 1;
      try {
        const p = JSON.parse(String(vals[i][11]));
        if (p) {
          existingAdded = Number(p.addedMinutes) || 0;
          existingUnlocked = !!p.unlocked;
        }
      } catch(_) {}
      break;
    }
  }

  const newAdded = existingAdded + addMinutes;
  const remarkPayload = JSON.stringify({ addedMinutes: newAdded, unlocked: existingUnlocked });

  const rowVals = [
    "時長延長與解除",
    `今日延長${newAdded}分鐘`,
    isGlobal ? "ALL" : targetUser,
    studentInfo,
    "", "", todayStr, todayStr, true,
    teacherUser || "教師", nowStr, remarkPayload
  ];

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, 12).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
  }

  try {
    const todayStr2 = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
    CacheService.getScriptCache().remove("DAILY_USAGE_RULES_" + todayStr2);
  } catch(_) {}

  return {
    status: "success",
    message: `⚡ 已成功為【${isGlobal ? '全體學生' : targetUser}】今日延長 ${addMinutes} 分鐘（累計延長 ${newAdded} 分鐘）！`
  };
}

/**
 * 教師解除或恢復特定學生今日時長限制
 */
function toggleStudentDailyUnlock(ss, teacherUser, data) {
  const sheet = ensureTimeSettingsSheet(ss);
  const now = new Date();
  const todayStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd");
  const nowStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
  const targetUser = String((data && data.targetUser) || "ALL").trim().toLowerCase();
  const unlock = data ? (data.unlocked !== false) : true;
  const isGlobal = (targetUser === "all");
  const studentInfo = isGlobal ? "全體學生" : (String((data && data.studentInfo) || targetUser));

  let foundRow = -1;
  let existingAdded = 0;
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === "時長延長與解除" &&
        String(vals[i][2]).trim().toLowerCase() === targetUser &&
        formatStandardDateYMD(vals[i][6]) === todayStr) {
      foundRow = i + 1;
      try {
        const p = JSON.parse(String(vals[i][11]));
        if (p) existingAdded = Number(p.addedMinutes) || 0;
      } catch(_) {}
      break;
    }
  }

  const remarkPayload = JSON.stringify({ addedMinutes: existingAdded, unlocked: unlock });

  const rowVals = [
    "時長延長與解除",
    unlock ? "今日解除時長限制" : "今日恢復時長限制",
    isGlobal ? "ALL" : targetUser,
    studentInfo,
    "", "", todayStr, todayStr, true,
    teacherUser || "教師", nowStr, remarkPayload
  ];

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, 12).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
  }

  try {
    const todayStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
    CacheService.getScriptCache().remove("DAILY_USAGE_RULES_" + todayStr);
  } catch(_) {}

  return {
    status: "success",
    message: unlock
      ? `🔓 已成功解除【${isGlobal ? '全體學生' : targetUser}】今日作答時間限制（今日不限時暢行）！`
      : `🔒 已恢復【${isGlobal ? '全體學生' : targetUser}】今日作答時間限制！`
  };
}

/**
 * 教師端點：儲存每日時長設定 (可供 google.script.run 或直接呼叫)
 */
function teacherSaveDailyMinutes(param1, param2) {
  let ss, teacherUser, settingData;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    teacherUser = param2;
    settingData = arguments[2] || {};
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    teacherUser = (param1 && (param1.username || param1.teacherUser)) || "教師";
    settingData = (param1 && param1.settingData) || param1 || {};
  }
  return saveDailyMinutesSetting(ss, teacherUser, settingData);
}

/**
 * 教師端點：延長學生今日使用時間 (加時)
 */
function teacherExtendUsage(param1, param2) {
  let ss, teacherUser, extendData;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    teacherUser = param2;
    extendData = arguments[2] || {};
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    teacherUser = (param1 && (param1.username || param1.teacherUser)) || "教師";
    extendData = (param1 && param1.extendData) || param1 || {};
  }
  return extendStudentUsageTime(ss, teacherUser, extendData);
}

/**
 * 教師端點：解除或恢復特定/全體學生今日時長限制
 */
function teacherToggleDailyUnlock(param1, param2) {
  let ss, teacherUser, unlockData;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    teacherUser = param2;
    unlockData = arguments[2] || {};
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    teacherUser = (param1 && (param1.username || param1.teacherUser)) || "教師";
    unlockData = (param1 && param1.unlockData) || param1 || {};
  }
  return toggleStudentDailyUnlock(ss, teacherUser, unlockData);
}

/**
 * 讀取目前所有的時間設定 (供教師管理介面)
 */
function getTimeRestrictions(param1) {
  const ss = (param1 && typeof param1.getSheetByName === "function") ? param1 : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ensureTimeSettingsSheet(ss);
  const statusInfo = checkTimeRestrictionAllowance(ss, "");

  let globalTime = {
    startTime: statusInfo.globalStartTime || "07:30",
    endTime: statusInfo.globalEndTime || "22:00",
    updatedAt: statusInfo.globalUpdatedAt || "",
    teacher: statusInfo.globalTeacher || "系統預設"
  };

  const studentRules = [];
  const dateRules = [];

  if (sheet.getLastRow() >= 2) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const type = String(data[i][0] || "").trim();
      const name = String(data[i][1] || "").trim();
      const username = String(data[i][2] || "").trim();
      const studentInfo = String(data[i][3] || "").trim();
      const sTime = formatStandardTimeHHmm(data[i][4]);
      const eTime = formatStandardTimeHHmm(data[i][5]);
      const startD = formatStandardDateYMD(data[i][6]);
      const endD = formatStandardDateYMD(data[i][7]);
      const statusVal = String(data[i][8] || "").trim().toUpperCase();
      const isEnabled = (data[i][8] === true || statusVal === "TRUE" || statusVal === "啟用" || statusVal === "YES");
      const teacher = String(data[i][9] || "");
      const updatedAt = data[i][10] ? Utilities.formatDate(new Date(data[i][10]), "Asia/Taipei", "yyyy-MM-dd HH:mm") : "";
      const remark = String(data[i][11] || "");

      if (type === "全域預設") {
        if (sTime && eTime) {
          globalTime = {
            startTime: sTime,
            endTime: eTime,
            updatedAt: updatedAt,
            teacher: teacher
          };
        }
      } else if (type === "個別學生" || (username && username.toLowerCase() !== "all" && sTime && eTime)) {
        studentRules.push({
          rowIdx: i + 1,
          username: username,
          studentInfo: studentInfo,
          startTime: sTime,
          endTime: eTime,
          enabled: isEnabled,
          teacher: teacher,
          updatedAt: updatedAt,
          remark: remark
        });
      } else if (type === "特別日期解除" || (startD && endD)) {
        dateRules.push({
          rowIdx: i + 1,
          name: name || "特別開放",
          startDate: startD,
          endDate: endD,
          enabled: isEnabled,
          teacher: teacher,
          createdAt: updatedAt,
          remark: remark
        });
      }
    }
  }

  // 讀取學生名冊
  const studentList = [];
  try {
    const userSheet = ss.getSheetByName("使用者清單") || ss.getSheetByName("學生帳密");
    if (userSheet && userSheet.getLastRow() >= 2) {
      const uData = userSheet.getDataRange().getValues();
      for (let i = 1; i < uData.length; i++) {
        const u = String(uData[i][0] || "").trim();
        const role = String(uData[i][2] || "student").trim().toLowerCase();
        const c = String(uData[i][3] || "").replace(/班$/, "").trim();
        const name = String(uData[i][4] || "").trim();
        if (u && role === "student") {
          studentList.push({ username: u, className: c, realName: name || u });
        }
      }
      studentList.sort((a, b) => (a.className.localeCompare(b.className) || a.username.localeCompare(b.username)));
    }
  } catch(_) {}

  return {
    status: "success",
    currentStatus: statusInfo,
    globalTime: globalTime,
    studentRules: studentRules,
    dateRules: dateRules,
    studentList: studentList,
    dailyUsage: getDailyUsageSettings(ss, "ALL", false)
  };
}

/**
 * 儲存全校預設作答時間（儲存後自動成為下次預設）
 */
function getConquerRollSettings() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty("CONQUER_ROLL_SETTINGS");
    if (raw) return JSON.parse(raw);
  } catch(_) {}
  return { rollTaskMistakes: true, rollFreeMistakes: false, semesterStartDate: "", manualCurrentWeek: 0 };
}

function saveConquerRollSettings(param1, settingsData) {
  const ss = (param1 && typeof param1.getSheetByName === "function") ? param1 : SpreadsheetApp.getActiveSpreadsheet();
  const auth = authenticateUser(ss, settingsData.username, settingsData.password);
  if (!auth.success || auth.role !== "teacher") return { status: "error", message: "無教師權限" };
  const data = {
    rollTaskMistakes: settingsData.rollTaskMistakes !== false,
    rollFreeMistakes: !!settingsData.rollFreeMistakes,
    semesterStartDate: settingsData.semesterStartDate ? String(settingsData.semesterStartDate).trim() : "",
    manualCurrentWeek: Number.isInteger(Number(settingsData.manualCurrentWeek)) ? Number(settingsData.manualCurrentWeek) : 0
  };
  PropertiesService.getScriptProperties().setProperty("CONQUER_ROLL_SETTINGS", JSON.stringify(data));
  return { status: "success", message: "✅ 待攻克單字規則與週次設定已成功更新！", settings: data };
}

function saveGlobalTimeSetting(param1, param2, param3) {
  let ss, teacherUser, timeData;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    teacherUser = param2;
    timeData = param3;
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    teacherUser = (param1 && param1.username) ? param1.username : "教師";
    timeData = (param1 && param1.timeData) ? param1.timeData : param1;
  }
  const sheet = ensureTimeSettingsSheet(ss);
  const sTime = String(timeData.startTime || "07:30").trim();
  const eTime = String(timeData.endTime || "22:00").trim();

  if (!/^\d{2}:\d{2}$/.test(sTime) || !/^\d{2}:\d{2}$/.test(eTime)) {
    return { status: "error", message: "請輸入正確的時間格式 (HH:mm)" };
  }

  const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");

  let foundRow = -1;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const type = String(data[i][0] || "").trim();
    if (type === "全域預設") {
      foundRow = i + 1;
      break;
    }
  }

  const rowVals = [
    "全域預設",
    "全校預設作答時間",
    "ALL",
    "全體學生",
    sTime,
    eTime,
    "",
    "",
    true,
    teacherUser || "教師",
    nowStr,
    "預設每日開放時間（教師修改後自動儲存為下次預設）"
  ];

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, 12).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
  }

  clearOverviewCache();
  invalidateTimeRestrictionRulesCache_();
  return {
    status: "success",
    message: `✅ 全校預設可作答時間已更新為【${sTime} ～ ${eTime}】！`,
    currentStatus: checkTimeRestrictionAllowance(ss, "")
  };
}

/**
 * 儲存個別學生自訂作答時間
 */
function saveStudentTimeSetting(param1, param2, param3) {
  let ss, teacherUser, studentData;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    teacherUser = param2;
    studentData = param3;
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    teacherUser = (param1 && param1.username) ? param1.username : "教師";
    studentData = (param1 && param1.studentData) ? param1.studentData : param1;
  }
  const sheet = ensureTimeSettingsSheet(ss);
  const username = String((studentData && studentData.username) || "").trim();
  const studentInfo = String((studentData && studentData.studentInfo) || "").trim();
  const sTime = String((studentData && studentData.startTime) || "").trim();
  const eTime = String((studentData && studentData.endTime) || "").trim();
  const remark = String((studentData && studentData.remark) || "個別學生特別時間").trim();

  if (!username) {
    return { status: "error", message: "未指定目標學生學號" };
  }
  if (!/^\d{2}:\d{2}$/.test(sTime) || !/^\d{2}:\d{2}$/.test(eTime)) {
    return { status: "error", message: "請輸入正確的時間格式 (HH:mm)" };
  }

  const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");

  let targetRow = -1;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const type = String(data[i][0] || "").trim();
    const u = String(data[i][2] || "").trim();
    if (type === "個別學生" && u.toLowerCase() === username.toLowerCase()) {
      targetRow = i + 1;
      break;
    }
  }

  const rowVals = [
    "個別學生",
    `個別學生時間 (${username})`,
    username,
    studentInfo,
    sTime,
    eTime,
    "",
    "",
    true,
    teacherUser || "教師",
    nowStr,
    remark
  ];

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, 12).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
  }

  clearOverviewCache();
  invalidateTimeRestrictionRulesCache_();
  return {
    status: "success",
    message: `✅ 學生【${studentInfo || username}】的可作答時間已設定為【${sTime} ～ ${eTime}】！`,
    currentStatus: checkTimeRestrictionAllowance(ss, username)
  };
}

/**
 * 刪除個別學生自訂作答時間
 */
function deleteStudentTimeSetting(param1, param2) {
  let ss, username;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    username = param2;
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    username = (param1 && param1.targetUsername) ? param1.targetUsername : (param1 && param1.username ? param1.username : param1);
  }
  const sheet = ss.getSheetByName("時間限制設定");
  if (!sheet || sheet.getLastRow() < 2) return { status: "error", message: "找不到時間限制設定" };

  const cleanUser = String(username || "").trim().toLowerCase();
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    const type = String(data[i][0] || "").trim();
    const u = String(data[i][2] || "").trim().toLowerCase();
    if (type === "個別學生" && u === cleanUser) {
      sheet.deleteRow(i + 1);
      clearOverviewCache();
      invalidateTimeRestrictionRulesCache_();
      return { status: "success", message: `已移除學生【${username}】的個別時間設定，將恢復全校預設時間。` };
    }
  }

  return { status: "error", message: "未找到該學生的特別設定記錄" };
}

/**
 * 儲存特別日期全天解除限制設定
 */
function saveTimeRestriction(param1, param2, param3) {
  let ss, teacherUser, ruleData;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    teacherUser = param2;
    ruleData = param3;
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    teacherUser = (param1 && param1.username) ? param1.username : "教師";
    ruleData = (param1 && param1.ruleData) ? param1.ruleData : param1;
  }
  const sheet = ensureTimeSettingsSheet(ss);
  const name = String((ruleData && ruleData.name) || "特別解除限制").trim();
  const startD = formatStandardDateYMD(ruleData && ruleData.startDate);
  const endD = formatStandardDateYMD((ruleData && ruleData.endDate) || (ruleData && ruleData.startDate));
  const remark = String((ruleData && ruleData.remark) || "").trim();
  const isEnabled = (ruleData && ruleData.enabled) !== false;

  if (!startD || !endD) {
    return { status: "error", message: "請指定正確的起始與結束日期" };
  }
  if (startD > endD) {
    return { status: "error", message: "起始日期不可大於結束日期" };
  }

  const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");

  let targetRow = -1;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const type = String(data[i][0] || "").trim();
    const s = formatStandardDateYMD(data[i][6]);
    const e = formatStandardDateYMD(data[i][7]);
    if (type === "特別日期解除" && s === startD && e === endD) {
      targetRow = i + 1;
      break;
    }
  }

  const rowVals = [
    "特別日期解除",
    name,
    "ALL",
    "全體學生",
    "00:00",
    "23:59",
    startD,
    endD,
    isEnabled,
    teacherUser || "教師",
    nowStr,
    remark
  ];

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, 12).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
  }

  clearOverviewCache();
  invalidateTimeRestrictionRulesCache_();
  return {
    status: "success",
    message: `✅ 已成功解除【${startD} ～ ${endD}】的時間限制！`,
    currentStatus: checkTimeRestrictionAllowance(ss, "")
  };
}

/**
 * 刪除特別日期全天解除限制設定
 */
function deleteTimeRestriction(param1, param2) {
  let ss, ruleData;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    ruleData = param2;
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    ruleData = (param1 && param1.ruleData) ? param1.ruleData : param1;
  }
  const sheet = ss.getSheetByName("時間限制設定");
  if (!sheet || sheet.getLastRow() < 2) return { status: "error", message: "找不到時間限制設定" };

  const startD = formatStandardDateYMD(ruleData && ruleData.startDate);
  const endD = formatStandardDateYMD(ruleData && ruleData.endDate);

  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    const type = String(data[i][0] || "").trim();
    const s = formatStandardDateYMD(data[i][6]);
    const e = formatStandardDateYMD(data[i][7]);
    if (type === "特別日期解除" && s === startD && e === endD) {
      sheet.deleteRow(i + 1);
      clearOverviewCache();
      invalidateTimeRestrictionRulesCache_();
      return { status: "success", message: "已刪除該解除限制設定", currentStatus: checkTimeRestrictionAllowance(ss, "") };
    }
  }

  return { status: "error", message: "未找到符合的設定記錄" };
}

/**
 * 教師快捷操作：一鍵切換今日解除限制狀態
 */
function quickToggleTodayUnlock(param1, param2) {
  let ss, teacherUser;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    teacherUser = param2;
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    teacherUser = (param1 && param1.username) ? param1.username : "教師";
  }
  const sheet = ensureTimeSettingsSheet(ss);
  const todayYMD = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
  const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");

  const data = sheet.getDataRange().getValues();
  let foundRow = -1;
  let currentlyActive = false;

  for (let i = 1; i < data.length; i++) {
    const type = String(data[i][0] || "").trim();
    const s = formatStandardDateYMD(data[i][6]);
    const e = formatStandardDateYMD(data[i][7]);
    const statusVal = String(data[i][8] || "").trim().toUpperCase();
    const isEn = (data[i][8] === true || statusVal === "TRUE" || statusVal === "啟用" || statusVal === "YES");

    if (type === "特別日期解除" && todayYMD >= s && todayYMD <= e) {
      if (isEn) {
        foundRow = i + 1;
        currentlyActive = true;
        break;
      }
    }
  }

  if (currentlyActive && foundRow > 0) {
    sheet.getRange(foundRow, 9).setValue(false);
    clearOverviewCache();
    invalidateTimeRestrictionRulesCache_();
    return {
      status: "success",
      isUnlocked: false,
      message: "已恢復今日時間限制",
      currentStatus: checkTimeRestrictionAllowance(ss, "")
    };
  } else {
    sheet.appendRow([
      "特別日期解除",
      "今日全天特別開放",
      "ALL",
      "全體學生",
      "00:00",
      "23:59",
      todayYMD,
      todayYMD,
      true,
      teacherUser || "教師",
      nowStr,
      "教師一鍵解除今日限制"
    ]);
    clearOverviewCache();
    invalidateTimeRestrictionRulesCache_();
    return {
      status: "success",
      isUnlocked: true,
      message: `🎉 已成功解除今日（${todayYMD}）時間限制，學生全天皆可使用！`,
      currentStatus: checkTimeRestrictionAllowance(ss, "")
    };
  }
}

// ════════════════════════════════════════════════════════════════════