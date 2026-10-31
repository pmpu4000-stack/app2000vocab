const fs = require('fs');

let html = fs.readFileSync('google_apps_script/Index.html', 'utf8');

// 1. 讓頂部 mainControlCard 的登出按鈕永遠保持可見
html = html.replace(
  '<button class="btn-secondary btn-sm" id="btnStudentDirectLogout" onclick="logout()" style="display:none;">登出</button>',
  '<button class="btn-secondary btn-sm" id="btnStudentDirectLogout" onclick="logout()" style="display:inline-flex;">登出</button>'
);

// 2. 修復 logout() 函式，確保 100% 恢復顯示登入遮罩，並清空狀態與密碼
const oldLogoutStart = `function logout() {
  document.body.classList.remove("student-mode");
  currentUser = null; currentPass = null; currentRole = null;
  viewingStudent = null; teacherStudents = []; teacherOverview = [];
  teacherAllOverview = []; teacherClassList = []; teacherSelectedClass = "all";
  studentMyClass = ""; studentRealName = ""; leaderboardScope = "class";
  studentListWithPasswords = [];
  fullProcessedData = []; displayHeaders = []; lastFilteredData = [];

  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
  document.getElementById("startDate").value = "";
  document.getElementById("endDate").value = "";

  const overlay = document.getElementById("login-overlay");
  if (overlay) overlay.style.display = "flex";`;

const newLogoutStart = `function logout() {
  document.body.classList.remove("student-mode");
  currentUser = null; currentPass = null; currentRole = null;
  viewingStudent = null; teacherStudents = []; teacherOverview = [];
  teacherAllOverview = []; teacherClassList = []; teacherSelectedClass = "all";
  studentMyClass = ""; studentRealName = ""; leaderboardScope = "class";
  studentListWithPasswords = [];
  fullProcessedData = []; displayHeaders = []; lastFilteredData = [];

  const uInp = document.getElementById("login-user") || document.getElementById("username");
  const pInp = document.getElementById("login-pass") || document.getElementById("password");
  if (pInp) pInp.value = "";
  document.getElementById("startDate").value = "";
  document.getElementById("endDate").value = "";
  setLoginStatus("");

  const overlay = document.getElementById("login-overlay");
  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.style.removeProperty("display");
    overlay.style.setProperty("display", "flex", "important");
  }`;

if (html.includes(oldLogoutStart)) {
  html = html.replace(oldLogoutStart, newLogoutStart);
} else {
  console.log("oldLogoutStart not matched directly, checking...");
}

// 確保隱藏教師後台所有區塊
html = html.replace(
  'document.getElementById("teacherOverviewCard").style.display = "none";',
  'const tcEl = document.getElementById("teacherOverviewCard"); if (tcEl) { tcEl.style.setProperty("display", "none", "important"); }'
);

fs.writeFileSync('google_apps_script/Index.html', html, 'utf8');
fs.copyFileSync('google_apps_script/Index.html', 'teacher_history.html');
console.log('google_apps_script/Index.html and teacher_history.html updated.');
