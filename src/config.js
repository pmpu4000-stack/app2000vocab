// =====================================================================
// config.js — 全系統統一配置中心 (Single Source of Configuration)
// 提供前端、測試與部署腳本統一引用的 GAS 部署 ID 與 API URL，
// 維護者若更換 GAS 部署或網址，只需修改此處即可全系統生效！
// =====================================================================

export const GAS_DEPLOYMENT_ID = "AKfycbx1hyCNJxqFMoaJgIxfZqLYIYH00NegI1Yd8NJP6gRjqwOndWGkmr-H9tGvVwK_axM9";
export const DEFAULT_SCRIPT_URL = `https://script.google.com/macros/s/${GAS_DEPLOYMENT_ID}/exec`;

export function getScriptUrl() {
  if (typeof window !== "undefined") {
    return window.__SCRIPT_URL || window.scriptUrl || DEFAULT_SCRIPT_URL;
  }
  return DEFAULT_SCRIPT_URL;
}
