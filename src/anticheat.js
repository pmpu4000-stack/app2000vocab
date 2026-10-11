/**
 * ════════════════════════════════════════════════════════════════════
 * anticheat.js - 純淨無蒐集版本 (Zero Telemetry / No Logging)
 * ════════════════════════════════════════════════════════════════════
 * 【隱私與合規說明】：
 * 本系統全面停止蒐集任何防作弊日誌、設備指紋、切換視窗秒數與按鍵攔截。
 * 尊重學生隱私權，維持純粹且流暢的單字自主學習體驗。
 */

let _scriptUrl = "";

export function getDeviceAndOsInfo() {
  return "";
}

export function getBrowserAndScreenInfo() {
  return "";
}

export function showAntiCheatToast(message) {
  // 純提示 UI 輔助，不送出任何日誌
}

export async function reportCheatAudit(method, details, status) {
  // 零資料蒐集：不記錄、不回報任何日誌
  return Promise.resolve();
}

export function startQuestionAudit(word, mode) {
  // 零資料蒐集：不計時、不審查
}

export function auditAnswerSpeed(guess, isCorrect) {
  // 零資料蒐集：不審查作答反應時間
}

export async function reportSecurityIncident(method, details, result) {
  // 零資料蒐集：不記錄、不回報任何資安日誌
  return Promise.resolve();
}

/**
 * 全域初始化：不做任何按鍵攔截、切頁監聽、剪貼簿側錄或設備指紋蒐集
 */
export function initAntiCheat(options = {}) {
  if (options.scriptUrl) _scriptUrl = options.scriptUrl;
  // 純淨無監控，保持瀏覽器原生體驗
}
