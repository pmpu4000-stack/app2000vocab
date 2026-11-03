const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../google_apps_script/TimeRestriction.js");
let code = fs.readFileSync(file, "utf8");

const isCRLF = code.includes("\r\n");
code = code.replace(/\r\n/g, "\n");

// 修正 1：特別日期解除判斷必須嚴格比對 type === "特別日期解除"，避免因其他列有日期就誤解除
const oldOverrideCheck = `        // 3. 特別日期全天解除
        if (isEnabled && (type === "特別日期解除" || (startD && endD))) {
          if (todayYMD >= startD && todayYMD <= endD) {
            rules.activeDateOverride = {
              name: name || "特別開放",
              startDate: startD,
              endDate: endD,
              remark: remark
            };
          }
        }`;

const newOverrideCheck = `        // 3. 特別日期全天解除（嚴格限定設定類型為「特別日期解除」，防止其他規則誤判）
        if (isEnabled && type === "特別日期解除" && startD && endD) {
          if (todayYMD >= startD && todayYMD <= endD) {
            rules.activeDateOverride = {
              name: name || "特別開放",
              startDate: startD,
              endDate: endD,
              remark: remark
            };
          }
        }`;

if (code.includes(oldOverrideCheck)) {
  code = code.replace(oldOverrideCheck, newOverrideCheck);
  console.log("TimeRestriction override check fixed.");
} else {
  console.log("oldOverrideCheck not found.");
}

// 修正 2：檢查清單列表中的 type 比對
const oldDateRules = `      } else if (type === "特別日期解除" || (startD && endD)) {`;
const newDateRules = `      } else if (type === "特別日期解除" && startD && endD) {`;
if (code.includes(oldDateRules)) {
  code = code.replace(oldDateRules, newDateRules);
  console.log("TimeRestriction dateRules fixed.");
}

if (isCRLF) code = code.replace(/\n/g, "\r\n");
fs.writeFileSync(file, code, "utf8");
console.log("TimeRestriction.js patched.");
