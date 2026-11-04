const fs = require("fs");
const path = require("path");

const repoDir = path.join(__dirname, "..");
const indexHtmlPath = path.join(repoDir, "index.html");
let html = fs.readFileSync(indexHtmlPath, "utf8");

// 檢查 applyRoleBasedView 是否已存在
if (!html.includes("function applyRoleBasedView")) {
  const rbacFn = `
    // ══════════════════════════════════════════════════════════════
    // 🛡️ 角色權限動態視圖管理 (Role-Based Dynamic View Controller)
    // ══════════════════════════════════════════════════════════════
    function applyRoleBasedView(role, result) {
      const isParent = role === "parent";
      const isTeacher = role === "teacher";
      const isAdmin = role === "admin" || (result && result.isAdmin);
      const isStudent = !isParent && !isTeacher && !isAdmin;

      const appEl = document.querySelector(".app");
      const parentScreen = document.getElementById("parent-portal-screen");
      const teacherBtn = document.getElementById("btn-teacher-picker");
      const timeBtn = document.getElementById("btn-time-management");
      const adminNotice = document.getElementById("admin-portal-link");
      const timerBadge = document.getElementById("stat-daily-timer");
      const uploadBtn = document.getElementById("btn-upload") || document.querySelector(".stat.upload");

      // 1. 家長身分：隱藏遊戲作答區與控制項，直接切換為專屬子女學習歷程視圖
      if (isParent) {
        if (appEl) appEl.style.display = "none";
        if (parentScreen) parentScreen.style.display = "block";
        if (teacherBtn) teacherBtn.style.display = "none";
        if (timeBtn) timeBtn.style.display = "none";
        if (adminNotice) adminNotice.style.display = "none";
        if (timerBadge) timerBadge.style.display = "none";
        if (uploadBtn) uploadBtn.style.display = "none";
        return;
      }

      // 2. 非家長身分（學生、教師、管理員）：顯示遊戲/作答容器，隱藏家長視圖
      if (parentScreen) parentScreen.style.display = "none";
      if (appEl) appEl.style.display = "";

      // 3. 教師 / 管理員工具列控制
      if (teacherBtn) {
        teacherBtn.style.display = (isTeacher || isAdmin) ? "flex" : "none";
      }
      if (timeBtn) {
        timeBtn.style.display = (isTeacher || isAdmin) ? "flex" : "none";
      }
      if (adminNotice) {
        adminNotice.style.display = isAdmin ? "inline-flex" : "none";
      }

      // 4. 計時器與上傳控制
      if (isTeacher || isAdmin) {
        if (timerBadge) timerBadge.style.display = "none";
      } else {
        if (timerBadge) timerBadge.style.display = "flex";
      }
      if (uploadBtn) {
        uploadBtn.style.display = (isStudent || isTeacher || isAdmin) ? "flex" : "none";
      }
    }
`;

  const marker = "function renderParentPortalView";
  const mIdx = html.indexOf(marker);
  if (mIdx !== -1) {
    html = html.substring(0, mIdx) + rbacFn + "\n\n    " + html.substring(mIdx);
  } else {
    const sEnd = html.lastIndexOf("</script>");
    html = html.substring(0, sEnd) + rbacFn + "\n" + html.substring(sEnd);
  }
}

// 確保在 renderParentPortalView 與 學生登入流程中調用 applyRoleBasedView
const oldParentCall = `            setTimeout(() => {
              renderParentPortalView(result, user, pass);
            }, 250);`;

const newParentCall = `            setTimeout(() => {
              applyRoleBasedView("parent", result);
              renderParentPortalView(result, user, pass);
            }, 250);`;

if (html.includes(oldParentCall)) {
  html = html.replace(oldParentCall, newParentCall);
}

// 學生/老師/管理員登入分支中加入 applyRoleBasedView
const oldStdRoleCall = `window.__USER_ROLE = result.role || "student";`;
const newStdRoleCall = `window.__USER_ROLE = result.role || "student";
          applyRoleBasedView(result.role || "student", result);`;

if (html.includes(oldStdRoleCall) && !html.includes("applyRoleBasedView(result.role")) {
  html = html.replace(oldStdRoleCall, newStdRoleCall);
}

fs.writeFileSync(indexHtmlPath, html, "utf8");
console.log("RBAC dynamic view logic integrated successfully!");
