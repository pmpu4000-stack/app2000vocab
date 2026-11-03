const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../google_apps_script/AuthService.js");
let code = fs.readFileSync(file, "utf8");

const isCRLF = code.includes("\r\n");
code = code.replace(/\r\n/g, "\n");

const target = `    const role    = String(data[i][2] || "student").trim().toLowerCase() || "student";
    if (role === "teacher") foundAnyTeacher = true;

    if (rowUser === username) {
      const match = rowPass === hashedInput || (!isHashedPassword(rowPass) && rowPass === password);
      if (!match) { recordLoginFailure(username); return {success:false, message:"帳號或密碼錯誤"}; }

      // 自動無感升級明文密碼為 SHA-256 雜湊
      if (!isHashedPassword(rowPass)) {
        try {
          sheet.getRange(i + 1, 2).setValue(hashedInput);
          cache.remove("ALL_USERS_ROSTER_V1");
        } catch(_) {}
      }

      clearLoginFailures(username);
      const rawClass  = String(data[i][3] || "").trim();
      const className = role === "teacher" ? (rawClass || "all") : getStudentClass(username, rawClass);
      const realName  = String(data[i][4] || "").trim();
      const isAdmin   = role === "teacher" && isAdminTeacher(className);
      const result    = {success:true, username, role, className, realName, isAdmin};`;

const replacement = `    let role      = String(data[i][2] || "student").trim().toLowerCase() || "student";
    if (role === "admin" || role === "administrator" || role === "管理員") role = "admin";
    else if (role === "parent" || role === "家長") role = "parent";
    else if (role === "teacher" || role === "教師" || role === "老師") role = "teacher";
    else role = "student";

    if (role === "teacher" || role === "admin") foundAnyTeacher = true;

    if (rowUser === username) {
      const match = rowPass === hashedInput || (!isHashedPassword(rowPass) && rowPass === password);
      if (!match) { recordLoginFailure(username); return {success:false, message:"帳號或密碼錯誤"}; }

      // 自動無感升級明文密碼為 SHA-256 雜湊
      if (!isHashedPassword(rowPass)) {
        try {
          sheet.getRange(i + 1, 2).setValue(hashedInput);
          cache.remove("ALL_USERS_ROSTER_V1");
        } catch(_) {}
      }

      clearLoginFailures(username);
      const rawClass  = String(data[i][3] || "").trim();
      const className = (role === "teacher" || role === "admin") ? (rawClass || "all") : getStudentClass(username, rawClass);
      const realName  = String(data[i][4] || "").trim();
      const isAdmin   = (role === "admin") || (role === "teacher" && isAdminTeacher(className));
      const studentBinding = (role === "parent") ? rawClass : "";
      const result    = {success:true, username, role, className, realName, isAdmin, studentBinding};`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  if (isCRLF) code = code.replace(/\n/g, "\r\n");
  fs.writeFileSync(file, code, "utf8");
  console.log("AuthService patch SUCCESS");
} else {
  console.log("Target not found");
}
