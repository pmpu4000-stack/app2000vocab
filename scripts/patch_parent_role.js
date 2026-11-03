const fs = require("fs");
const path = require("path");

const repoDir = path.join(__dirname, "..");
const clientPath = path.join(repoDir, "google_apps_script/ClientCoreJs.html");
let code = fs.readFileSync(clientPath, "utf8");

const isCRLF = code.includes("\r\n");
code = code.replace(/\r\n/g, "\n");

// 精確比對並加入 resp.role === "parent"
const oldApplyBlock = `  if (resp.role === "teacher" && !viewingStudent) {
    // ── 教師：班級總覽 ──
    currentRole = "teacher";
    teacherAllOverview = resp.allOverview || resp.overview || [];
    teacherClassList = resp.classes || [];
    teacherSelectedClass = resp.currentClass || "all";
    teacherStudents = resp.students || [];
    teacherOverview = resp.overview || []; latestOverviewResult = resp;
    initTeacherDashboard(resp);
  } else {
    // ── 學生 or 教師查看某學生 ──
    if (!viewingStudent) {
      // 學生自己登入
      currentRole = "student";
      studentMyClass = resp.className || "";
      studentRealName = resp.realName || "";
      const dispStudent = studentRealName || resp.username || currentUser;
      const classStr = studentMyClass ? \`班級：\${studentMyClass}  \` : "";
      document.getElementById("userBadge").innerText = \`👤 \${classStr}學生：\${dispStudent}\`;
      document.getElementById("btnLogoutOrBack").textContent = "登出";
      const btnDirectOut = document.getElementById("btnStudentDirectLogout");
      if (btnDirectOut) btnDirectOut.style.display = "inline-flex";
    }
    showStudentSections();`;

const newApplyBlock = `  if (resp.role === "teacher" && !viewingStudent) {
    // ── 教師：班級總覽 ──
    currentRole = "teacher";
    teacherAllOverview = resp.allOverview || resp.overview || [];
    teacherClassList = resp.classes || [];
    teacherSelectedClass = resp.currentClass || "all";
    teacherStudents = resp.students || [];
    teacherOverview = resp.overview || []; latestOverviewResult = resp;
    initTeacherDashboard(resp);
  } else if (resp.role === "parent") {
    // ── 家長專屬查閱視圖 ──
    currentRole = "parent";
    document.body.classList.add("student-mode");
    studentMyClass = resp.className || "";
    studentRealName = resp.realName || "";
    const parentName = resp.parentRealName || resp.parentUsername || "家長";
    const dispStudent = studentRealName || resp.username || "學生";
    const classStr = studentMyClass ? \`班級：\${studentMyClass}  \` : "";
    const badgeEl = document.getElementById("userBadge");
    if (badgeEl) badgeEl.innerText = \`👨‍👩‍👧 家長查閱：\${parentName}（子女：\${classStr}\${dispStudent}）\`;
    const btnOut = document.getElementById("btnLogoutOrBack");
    if (btnOut) btnOut.textContent = "登出並返回遊戲";
    const btnDirectOut = document.getElementById("btnStudentDirectLogout");
    if (btnDirectOut) {
      btnDirectOut.style.display = "inline-flex";
      btnDirectOut.textContent = "登出並返回遊戲";
      btnDirectOut.onclick = () => { window.location.href = "index.html"; };
    }
    showStudentSections();
  } else {
    // ── 學生 or 教師查看某學生 ──
    if (!viewingStudent) {
      // 學生自己登入
      currentRole = "student";
      studentMyClass = resp.className || "";
      studentRealName = resp.realName || "";
      const dispStudent = studentRealName || resp.username || currentUser;
      const classStr = studentMyClass ? \`班級：\${studentMyClass}  \` : "";
      document.getElementById("userBadge").innerText = \`👤 \${classStr}學生：\${dispStudent}\`;
      document.getElementById("btnLogoutOrBack").textContent = "登出";
      const btnDirectOut = document.getElementById("btnStudentDirectLogout");
      if (btnDirectOut) btnDirectOut.style.display = "inline-flex";
    }
    showStudentSections();`;

if (code.includes(oldApplyBlock)) {
  code = code.replace(oldApplyBlock, newApplyBlock);
  if (isCRLF) code = code.replace(/\n/g, "\r\n");
  fs.writeFileSync(clientPath, code, "utf8");
  console.log("ClientCoreJs parent role applied successfully.");
} else {
  console.log("oldApplyBlock not found in ClientCoreJs.html");
}
