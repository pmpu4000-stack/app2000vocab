const fs = require("fs");
const path = require("path");

const repoDir = path.join(__dirname, "..");

// 1. 更新 AuthService.js：支援四種角色 (student, parent, teacher, admin)
const authPath = path.join(repoDir, "google_apps_script/AuthService.js");
let authCode = fs.readFileSync(authPath, "utf8");

// 在 authenticateUser 中解析使用者角色
// 預設支援：
// role: "student" -> 學生
// role: "parent" -> 家長（只能看綁定學生或其子女，若無綁定則預設該帳號關聯學生）
// role: "teacher" -> 教師
// role: "admin" -> 管理員
const oldRoleCheck = `    const role    = String(data[i][2] || "student").trim().toLowerCase() || "student";
    if (role === "teacher") foundAnyTeacher = true;`;

const newRoleCheck = `    let role    = String(data[i][2] || "student").trim().toLowerCase() || "student";
    if (role === "admin" || role === "administrator" || role === "管理員") role = "admin";
    else if (role === "parent" || role === "家長") role = "parent";
    else if (role === "teacher" || role === "教師" || role === "老師") role = "teacher";
    else role = "student";

    if (role === "teacher" || role === "admin") foundAnyTeacher = true;`;

if (authCode.includes(oldRoleCheck)) {
  authCode = authCode.replace(oldRoleCheck, newRoleCheck);
  console.log("AuthService role check updated.");
}

const oldResult = `      const isAdmin   = role === "teacher" && isAdminTeacher(className);
      const result    = {success:true, username, role, className, realName, isAdmin};`;

const newResult = `      const isAdmin   = (role === "admin") || (role === "teacher" && isAdminTeacher(className));
      const studentBinding = (role === "parent") ? String(data[i][3] || "").trim() : "";
      const result    = {success:true, username, role, className, realName, isAdmin, studentBinding};`;

if (authCode.includes(oldResult)) {
  authCode = authCode.replace(oldResult, newResult);
  console.log("AuthService result updated.");
}

fs.writeFileSync(authPath, authCode, "utf8");

// 2. 更新 Code.gs：doPost("login") 處理 parent 與 admin
const codePath = path.join(repoDir, "google_apps_script/Code.gs");
let gsCode = fs.readFileSync(codePath, "utf8");

const oldCodeLoginTeacher = `      if (auth.role === "teacher") {`;
const newCodeLoginTeacher = `      if (auth.role === "parent") {
        return jsonResponse({
          status: "success",
          message: "家長驗證成功",
          role: "parent",
          username: auth.username,
          realName: auth.realName,
          studentBinding: auth.studentBinding,
          className: auth.className
        });
      }
      if (auth.role === "teacher" || auth.role === "admin") {`;

if (gsCode.includes(oldCodeLoginTeacher) && !gsCode.includes('auth.role === "parent"')) {
  gsCode = gsCode.replace(oldCodeLoginTeacher, newCodeLoginTeacher);
  fs.writeFileSync(codePath, gsCode, "utf8");
  console.log("Code.gs login parent/admin support updated.");
}

// 3. 更新 index.html：登入入口支援四種使用者分流導引
const indexPath = path.join(repoDir, "index.html");
let indexCode = fs.readFileSync(indexPath, "utf8");

indexCode = indexCode.replace(/placeholder="請輸入學號 \(如: 70101\)"/g, 'placeholder="請輸入帳號 (學生學號 / 家長 / 教師 / 管理員)"');
indexCode = indexCode.replace(/請輸入學號與密碼/g, '請輸入帳號與密碼登入');

const oldIndexStore = `localStorage.setItem("current_user", user);
          localStorage.setItem("user_role", result.role || "student");`;

const newIndexStore = `localStorage.setItem("current_user", user);
          localStorage.setItem("user_role", result.role || "student");

          // 角色分流導向
          if (result.role === "parent") {
            setLoginStatus("家長身分驗證成功，正在前往家長查閱專區...", "loading-game");
            sessionStorage.setItem("history_auth_user", user);
            sessionStorage.setItem("history_auth_pass", pass);
            if (result.studentBinding) {
              sessionStorage.setItem("parent_target_student", result.studentBinding);
            }
            setTimeout(() => {
              window.location.href = "history.html?role=parent&u=" + encodeURIComponent(user);
            }, 300);
            return;
          }
          if (result.role === "admin" || (result.role === "teacher" && result.isAdmin)) {
            // 教師 / 管理員可自由選擇使用「出題設定」或前往「總控後台」
            const adminNotice = document.getElementById("admin-portal-link");
            if (adminNotice) adminNotice.style.display = "inline-flex";
          }`;

if (indexCode.includes(oldIndexStore)) {
  indexCode = indexCode.replace(oldIndexStore, newIndexStore);
  fs.writeFileSync(indexPath, indexCode, "utf8");
  console.log("index.html login routing updated.");
}

console.log("Unified login router script completed.");
