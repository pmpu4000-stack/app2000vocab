const fs = require('fs');

let codeGs = fs.readFileSync('google_apps_script/Code.gs', 'utf8');
const isCrlf = codeGs.includes('\r\n');
if (isCrlf) codeGs = codeGs.replace(/\r\n/g, '\n');

// 1. authenticateUser: 增加名冊快取 ALL_USERS_ROSTER_V1
const oldAuthCode = `  const data = sheet.getDataRange().getValues();
  let foundAnyTeacher = false;

  for (let i = 1; i < data.length; i++) {`;

const newAuthCode = `  // 極致快取優化：全校使用者名冊快取 600 秒，高併發登入免重複讀取試算表
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

  for (let i = 1; i < data.length; i++) {`;

if (codeGs.includes(oldAuthCode)) {
  codeGs = codeGs.replace(oldAuthCode, newAuthCode);
  console.log("authenticateUser roster caching applied.");
} else {
  console.log("oldAuthCode still not matched!");
}

// 2. checkAndGetData: 增加學生歷程查詢快取 180 秒
const oldStudentQuery = `    // 學生自己查詢
    const result = _getStudentData(ss, auth.username);
    if (result.status === "success") {`;

const newStudentQuery = `    // 學生自己查詢（極致快取優化：歷程查詢快取 180 秒，高併發秒開零 API 消耗）
    const cache = CacheService.getScriptCache();
    const studentCacheKey = "CACHE_STUDENT_PORTFOLIO_" + auth.username + "_" + (formData.rankingMode || "class");
    if (!formData.forceRefresh) {
      try {
        const hit = cache.get(studentCacheKey);
        if (hit) return JSON.parse(hit);
      } catch(_) {}
    }

    const result = _getStudentData(ss, auth.username);
    if (result.status === "success") {`;

const oldStudentQueryEnd = `      try {
        const g = _getGoalsInternal(ss, auth.username);
        result.goals = g.goals; result.goalsUpdatedAt = g.updatedAt;
      } catch(_) {}
    }
    return result;`;

const newStudentQueryEnd = `      try {
        const g = _getGoalsInternal(ss, auth.username);
        result.goals = g.goals; result.goalsUpdatedAt = g.updatedAt;
      } catch(_) {}

      try {
        cache.put(studentCacheKey, JSON.stringify(result), 180);
      } catch(_) {}
    }
    return result;`;

if (codeGs.includes(oldStudentQuery)) {
  codeGs = codeGs.replace(oldStudentQuery, newStudentQuery);
  codeGs = codeGs.replace(oldStudentQueryEnd, newStudentQueryEnd);
  console.log("checkAndGetData student portfolio caching applied.");
} else {
  console.log("oldStudentQuery still not matched!");
}

// 3. handleSaveRecord: 增加高併發排隊鎖 LockService 與儲存後快取清除
const oldSaveRecordStart = `function handleSaveRecord(ss, params, auth) {
  try {
    const username = (auth && auth.username) ? auth.username : String(params.username || "").trim();
    const records  = params.records || {};
    if (!username) return jsonResponse({status:"error", message:"未提供帳號"});`;

const newSaveRecordStart = `function handleSaveRecord(ss, params, auth) {
  // 極致高併發鎖定優化：排隊安全寫入防鎖表
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch(e) {
    return jsonResponse({status:"error", message:"伺服器繁忙排隊中，請稍候重試"});
  }

  try {
    const username = (auth && auth.username) ? auth.username : String(params.username || "").trim();
    const records  = params.records || {};
    if (!username) return jsonResponse({status:"error", message:"未提供帳號"});`;

if (codeGs.includes(oldSaveRecordStart)) {
  codeGs = codeGs.replace(oldSaveRecordStart, newSaveRecordStart);
  console.log("handleSaveRecord lock start applied.");
} else {
  console.log("oldSaveRecordStart still not matched!");
}

// 找到 handleSaveRecord 結尾前，加入 finally lock.releaseLock() 和 cache.remove
const oldSaveRecordReturn = `    clearOverviewCache();
    return jsonResponse({status:"success",message:"儲存成功"});
  } catch(err) {
    logError("saveRecord",err,params.username||"","");
    return jsonResponse({status:"error",message:"儲存失敗: "+err.toString()});
  }
}`;

const newSaveRecordReturn = `    clearOverviewCache();
    try {
      const cache = CacheService.getScriptCache();
      cache.remove("CACHE_STUDENT_PORTFOLIO_" + username + "_class");
      cache.remove("CACHE_STUDENT_PORTFOLIO_" + username + "_all");
      cache.remove("STUDENT_DAILY_RESULT_" + username);
    } catch(_) {}
    return jsonResponse({status:"success",message:"儲存成功"});
  } catch(err) {
    logError("saveRecord",err,params.username||"","");
    return jsonResponse({status:"error",message:"儲存失敗: "+err.toString()});
  } finally {
    try { lock.releaseLock(); } catch(_) {}
  }
}`;

if (codeGs.includes(oldSaveRecordReturn)) {
  codeGs = codeGs.replace(oldSaveRecordReturn, newSaveRecordReturn);
  console.log("handleSaveRecord lock release & cache invalidation applied.");
} else {
  console.log("oldSaveRecordReturn still not matched!");
}

// 4. 清除使用者名冊快取於變更密碼時
codeGs = codeGs.replace(
  'sheet.getRange(i+1,2).setValue(hashPassword(newPass));\n      clearLoginFailures(target);',
  'sheet.getRange(i+1,2).setValue(hashPassword(newPass));\n      clearLoginFailures(target);\n      try { CacheService.getScriptCache().remove("ALL_USERS_ROSTER_V1"); } catch(_) {}'
);

if (isCrlf) codeGs = codeGs.replace(/\n/g, '\r\n');
fs.writeFileSync('google_apps_script/Code.gs', codeGs, 'utf8');
console.log('google_apps_script/Code.gs optimization complete.');
