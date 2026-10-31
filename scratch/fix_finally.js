const fs = require('fs');
let code = fs.readFileSync('google_apps_script/Code.gs', 'utf8');
const isCrlf = code.includes('\r\n');
if (isCrlf) code = code.replace(/\r\n/g, '\n');

const target = `  clearOverviewCache();
  try {
    const cache = CacheService.getScriptCache();
    cache.remove("stu_data_" + username.toLowerCase());
    cache.remove("stu_hist_" + username.toLowerCase());
    cache.put("stu_rec_" + username.toLowerCase(), stored, 1200);
  } catch(_) {}
  return jsonResponse({status:"success", message:"紀錄已成功儲存於個人分頁"});
  } catch(err) {
    logError("handleSaveRecord", err, auth ? auth.username : (params ? params.username : ""), "");
    return jsonResponse({status:"error", message: "儲存失敗：" + (err.message || err.toString())});
  }`;

const replacement = `  clearOverviewCache();
  try {
    const cache = CacheService.getScriptCache();
    cache.remove("stu_data_" + username.toLowerCase());
    cache.remove("stu_hist_" + username.toLowerCase());
    cache.remove("CACHE_STUDENT_PORTFOLIO_" + username + "_class");
    cache.remove("CACHE_STUDENT_PORTFOLIO_" + username + "_all");
    cache.remove("STUDENT_DAILY_RESULT_" + username);
    cache.put("stu_rec_" + username.toLowerCase(), stored, 1200);
  } catch(_) {}
  return jsonResponse({status:"success", message:"紀錄已成功儲存於個人分頁"});
  } catch(err) {
    logError("handleSaveRecord", err, auth ? auth.username : (params ? params.username : ""), "");
    return jsonResponse({status:"error", message: "儲存失敗：" + (err.message || err.toString())});
  } finally {
    try { lock.releaseLock(); } catch(_) {}
  }`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  if (isCrlf) code = code.replace(/\n/g, '\r\n');
  fs.writeFileSync('google_apps_script/Code.gs', code, 'utf8');
  console.log("handleSaveRecord finally block added successfully.");
} else {
  console.log("Target not found in Code.gs.");
}
