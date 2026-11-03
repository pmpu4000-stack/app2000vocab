const fs = require("fs");
const path = require("path");

const repoDir = path.join(__dirname, "..");

// 1. 更新 SpreadsheetService.js：checkAndGetData 支援家長身分 (role === "parent")
const ssServicePath = path.join(repoDir, "google_apps_script/SpreadsheetService.js");
let ssCode = fs.readFileSync(ssServicePath, "utf8");

const oldParentBranch = `    if (auth.role === "teacher") {`;
const newParentBranch = `    if (auth.role === "parent") {
      const targetStudent = String(formData.targetStudent || auth.studentBinding || "").trim();
      if (!targetStudent) {
        return { status: "error", message: "此家長帳號尚未綁定學生學號，請洽任課老師。" };
      }
      const result = _getStudentData(ss, targetStudent);
      if (result.status === "success") {
        result.role = "parent";
        result.parentUsername = auth.username;
        result.parentRealName = auth.realName;
        result.todayTaskResult = getStudentTodayTaskResult(ss, targetStudent, todayStr);
        result.dailyTaskHistory = getStudentDailyTaskHistory(ss, targetStudent);
        result.assignedTask = getActiveTaskForClass(ss, result.className, targetStudent);
        result.taskWordsMap = getTaskWordsDictCached_(ss);
        try { result.leaderboard = _getLeaderboard(ss, targetStudent, "class"); } catch(_) {}
      }
      return result;
    }

    if (auth.role === "teacher") {`;

if (ssCode.includes(oldParentBranch) && !ssCode.includes('auth.role === "parent"')) {
  ssCode = ssCode.replace(oldParentBranch, newParentBranch);
  fs.writeFileSync(ssServicePath, ssCode, "utf8");
  console.log("SpreadsheetService parent role supported.");
}

// 2. 更新 ClientCoreJs.html：支援自動免密登入（從 sessionStorage / URL 帶入家長帳密）與家長專屬視圖
const clientCorePath = path.join(repoDir, "google_apps_script/ClientCoreJs.html");
let clientCode = fs.readFileSync(clientCorePath, "utf8");

const oldDomLoaded = `document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("username").addEventListener("keyup", e => { if (e.key === "Enter") login(); });`;

const newDomLoaded = `document.addEventListener("DOMContentLoaded", () => {
  // 🚀 自動橋接遊戲入口的登入憑證（支援家長免二次輸入帳密秒開）
  const bridgeUser = sessionStorage.getItem("history_auth_user");
  const bridgePass = sessionStorage.getItem("history_auth_pass");
  if (bridgeUser && bridgePass) {
    sessionStorage.removeItem("history_auth_user");
    sessionStorage.removeItem("history_auth_pass");
    const uInp = document.getElementById("login-user") || document.getElementById("username");
    const pInp = document.getElementById("login-pass") || document.getElementById("password");
    if (uInp) uInp.value = bridgeUser;
    if (pInp) pInp.value = bridgePass;
    setTimeout(() => { if (typeof login === "function") login(); }, 150);
  }

  document.getElementById("username").addEventListener("keyup", e => { if (e.key === "Enter") login(); });`;

if (clientCode.includes(oldDomLoaded) && !clientCode.includes("bridgeUser")) {
  clientCode = clientCode.replace(oldDomLoaded, newDomLoaded);
}

// 3. 處理家長角色徽章與介面友善化
const oldRoleBadge = `    } else {
      // 學生自己登入
      currentRole = "student";`;

const newRoleBadge = `    } else if (resp.role === "parent") {
      currentRole = "parent";
      studentMyClass = resp.className || "";
      studentRealName = resp.realName || "";
      const parentName = resp.parentRealName || resp.parentUsername || "家長";
      const dispStudent = studentRealName || resp.username || "";
      const classStr = studentMyClass ? \`班級：\${studentMyClass}  \` : "";
      const userBadgeEl = document.getElementById("userBadge");
      if (userBadgeEl) userBadgeEl.innerText = \`👨‍👩‍👧 貴賓：\${parentName} (學生：\${classStr}\${dispStudent})\`;
      document.getElementById("btnLogoutOrBack").textContent = "登出並返回遊戲";
    } else {
      // 學生自己登入
      currentRole = "student";`;

if (clientCode.includes(oldRoleBadge) && !clientCode.includes('resp.role === "parent"')) {
  clientCode = clientCode.replace(oldRoleBadge, newRoleBadge);
}

fs.writeFileSync(clientCorePath, clientCode, "utf8");
console.log("ClientCoreJs parent auto-login and badge updated.");
