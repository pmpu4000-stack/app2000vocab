const fs = require("fs");
const path = require("path");

const repoDir = path.join(__dirname, "..");
const indexHtmlPath = path.join(repoDir, "index.html");
let html = fs.readFileSync(indexHtmlPath, "utf8");

// 1. 添加 CSS
const cssSnippet = `
    /* 👨‍👩‍👧 家長專屬動態視圖過濾 (依需求隱藏作答相關元件，保留五大歷程方塊) */
    body.role-parent #stat-daily-timer,
    body.role-parent #stat-streak-freeze,
    body.role-parent #btn-upload,
    body.role-parent #levelbar,
    body.role-parent #modes,
    body.role-parent #card,
    body.role-parent #session,
    body.role-parent #screen-quiz,
    body.role-parent #banner,
    body.role-parent #btn-teacher-picker,
    body.role-parent #btn-time-management,
    body.role-parent #admin-portal-link,
    body.role-parent #parent-portal-screen {
      display: none !important;
    }

    body.role-parent .app {
      display: block !important;
    }

    body.role-parent #progress-card,
    body.role-parent #learning-record-section,
    body.role-parent #week-conquer-section,
    body.role-parent #weak-words-section,
    body.role-parent #export-records-section {
      display: block !important;
    }
  </style>`;

if (!html.includes("body.role-parent #levelbar")) {
  html = html.replace("</style>", cssSnippet);
}

// 2. 更新登入邏輯中的家長處理
// 之前家長分支直接 return 了，現在讓家長如同學生一樣載入子女 records 與 app.js，但打上 role-parent 標記並更新帳號顯示為家長帳號
const oldParentBranch = `          // 角色分流導向：直接在遊戲網頁切換至對應畫面
          if (result.role === "parent") {
            setLoginStatus("家長身分驗證成功，直接載入子女學習歷程...", "loading-game");
            sessionStorage.setItem("current_user", user);
            sessionStorage.setItem("current_pass", pass);
            sessionStorage.setItem("user_role", "parent");
            setTimeout(() => {
              applyRoleBasedView("parent", result);
              renderParentPortalView(result, user, pass);
            }, 250);
            return;
          }`;

const newParentBranch = `          // 角色分流導向：家長身分啟用專屬儀表板過濾（顯示家長帳號、隱藏作答題型、保留五大歷程方塊）
          if (result.role === "parent") {
            setLoginStatus("家長身分驗證成功，正在載入子女學習成果...", "loading-game");
            document.body.classList.add("role-parent");
            localStorage.setItem("current_user", user);
            localStorage.setItem("user_role", "parent");
            sessionStorage.setItem("current_user", user);
            sessionStorage.setItem("user_role", "parent");
            window.__PARENT_USER = user;
            window.__PARENT_STUDENT = result.realName || result.username || "";
          }`;

if (html.includes(oldParentBranch)) {
  html = html.replace(oldParentBranch, newParentBranch);
}

// 3. 更新 updateAccountDisplay / 帳號顯示邏輯
const oldUpdateDisp = `function updateAccountDisplay(user, role) {`;
const newUpdateDisp = `function updateAccountDisplay(user, role) {
      if (role === "parent" || document.body.classList.contains("role-parent")) {
        const userEl = document.getElementById("s-user");
        if (userEl) {
          userEl.textContent = user;
          userEl.title = "家長帳號: " + user;
        }
        return;
      }`;

if (html.includes(oldUpdateDisp) && !html.includes('if (role === "parent" || document.body.classList.contains("role-parent"))')) {
  html = html.replace(oldUpdateDisp, newUpdateDisp);
}

// 4. 在登出處理時移除 role-parent
const oldLogoutReset = `document.body.classList.add("is-logging-in");`;
const newLogoutReset = `document.body.classList.remove("role-parent");
          document.body.classList.add("is-logging-in");`;

if (html.includes(oldLogoutReset) && !html.includes('document.body.classList.remove("role-parent");')) {
  html = html.replace(oldLogoutReset, newLogoutReset);
}

fs.writeFileSync(indexHtmlPath, html, "utf8");
console.log("Parent native dashboard view applied successfully!");
