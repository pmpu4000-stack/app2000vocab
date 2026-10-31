// 2. 老師指定單字任務核心函式
// ════════════════════════════════════════════════════════════════════

function getActiveTaskForClass(ss, studentClass, username) {
  const defaultRes = { hasTask: false };

  // 1. 若該學生今日已完成指定測驗，檢查已完成之任務清單（直接檢查學生個人分頁）
  const todayStrDash = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
  const completedTasksToday = new Set();
  let hasAnyCompletedToday = false;

  if (username) {
    const uSheet = getStudentSheet(ss, username);
    if (uSheet && uSheet.getLastRow() >= 2) {
      const lastCol = uSheet.getLastColumn();
      if (lastCol >= 1) {
        const headers = uSheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
        const hMap = getHeaderIndexMap(headers);
        const maxRows = Math.min(uSheet.getLastRow() - 1, 15);
        const vals = uSheet.getRange(2, 1, maxRows, lastCol).getValues();
        for (let i = 0; i < vals.length; i++) {
          const dStr = formatStandardDateYMD(vals[i][0]);
          const status = String(vals[i][hMap.status] || "").trim();
          const taskScore = String(vals[i][hMap.taskScore] || "").trim();
          const tName = String(vals[i][hMap.taskName] || "").trim();
          if (dStr === todayStrDash && status.includes("已完成") && taskScore !== "—" && taskScore !== "") {
            hasAnyCompletedToday = true;
            if (tName) completedTasksToday.add(tName.toLowerCase());
          }
        }
      }
    }
  }

  const cleanClass = String(studentClass || "").replace(/班$/, "").trim().toLowerCase();
  const tasks = getTeacherTasksCached_(ss);
  if (tasks.length === 0) {
    if (hasAnyCompletedToday) {
      return { hasTask: false, alreadyCompleted: true, message: "今日指定練習已全數完成！" };
    }
    return defaultRes;
  }

  let foundTodayClassTask = null;
  let foundAnyClassTask   = null;
  let foundTodayAllTask   = null;
  let foundAnyAllTask     = null;
  let totalMatchingTasksCount = 0;

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const taskClass = t.taskClass;
    const taskName  = t.taskName;
    const rawWords  = t.rawWords;
    const mode      = t.mode;
    const countVal  = t.countVal;
    const enabled   = t.enabled;
    const taskDate  = t.taskDate;

    if (!enabled || !taskName || !rawWords) continue;

    // 若任務有設定指定日期，且日期不是今天，則今天不開放此任務
    if (taskDate && taskDate !== todayStrDash) continue;

    const isClassMatch = (taskClass === cleanClass || taskClass === "all" || taskClass === "全校");
    if (!isClassMatch) continue;

    totalMatchingTasksCount++;

    // 若此特定任務學生今日已經完成，尋找下一個尚未完成的任務
    if (completedTasksToday.has(taskName.toLowerCase())) continue;

    const words = [...new Set(
      rawWords.split(/[\s,;\n\r]+/)
        .map(w => w.trim().toLowerCase())
        .filter(w => w.length > 0 && /^[a-z\-']+$/.test(w))
    )];

    if (words.length === 0) continue;

    const taskObj = {
      hasTask  : true,
      taskName : taskName,
      words    : words,
      total    : words.length,
      mode     : mode === "全考" ? "ALL" : "SAMPLE",
      count    : countVal === "ALL" ? words.length : (parseInt(countVal) || words.length),
      date     : taskDate || todayStrDash
    };

    if (taskClass === cleanClass) {
      if (taskDate === todayStrDash) {
        foundTodayClassTask = taskObj;
        break; // 今天該班專屬未完成任務，最優先！
      } else if (!foundAnyClassTask) {
        foundAnyClassTask = taskObj;
      }
    } else if (taskClass === "all" || taskClass === "全校") {
      if (taskDate === todayStrDash) {
        if (!foundTodayAllTask) foundTodayAllTask = taskObj;
      } else if (!foundAnyAllTask) {
        foundAnyAllTask = taskObj;
      }
    }
  }

  const nextTask = foundTodayClassTask || foundAnyClassTask || foundTodayAllTask || foundAnyAllTask;
  if (nextTask) return nextTask;

  // ── 週末自動檢核：學生於週一至週五沒有答對（包含沒有作答/缺考）的單字一律自動變成六日的指派單字測驗 ──
  const nowT = new Date();
  const dayOfWeek = nowT.getDay(); // 0=Sun, 6=Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    const weekendRemediationTask = getWeekendRemediationTask(ss, cleanClass, username, completedTasksToday, todayStrDash);
    if (weekendRemediationTask) return weekendRemediationTask;
  }

  // 若今日有符合的任務且學生已全數完成
  if (totalMatchingTasksCount > 0 && completedTasksToday.size >= totalMatchingTasksCount) {
    return {
      hasTask: false,
      alreadyCompleted: true,
      message: `今日 ${completedTasksToday.size} 項指定測驗已全數挑戰完成！當日已開放自由升級闖關。`
    };
  }

  if (hasAnyCompletedToday) {
    return {
      hasTask: false,
      alreadyCompleted: true,
      message: "今日指定練習已完成，當日不再開放重複使用。"
    };
  }

  return defaultRes;
}

/**
 * 學生於星期一到星期五沒有答對(包含沒有作答/缺考)的單字一律自動變成六日的指派單字測驗
 * 支援雙週週期（Bi-weekly Cycle）：
 * - 奇數週：本週指定單字消滅戰
 * - 偶數週：雙週指定單字大消滅戰（包含上週未消滅錯題 + 本週未消滅錯題）
 * - 自由練習答錯不計入、不滾入週末測驗！
 */
function getWeekendRemediationTask(ss, cleanClass, username, completedTasksToday, todayStrDash) {
  const d = new Date();
  const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat
  if (dayOfWeek !== 0 && dayOfWeek !== 6) return null;

  // 計算 ISO 週次與雙週週期
  const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNr = (targetDate.getDay() + 6) % 7;
  targetDate.setDate(targetDate.getDate() - dayNr + 3);
  const firstThursday = targetDate.valueOf();
  targetDate.setMonth(0, 1);
  if (targetDate.getDay() !== 4) {
    targetDate.setMonth(0, 1 + ((4 - targetDate.getDay()) + 7) % 7);
  }
  const isoWeek = 1 + Math.ceil((firstThursday - targetDate) / 604800000);
  const isBiweeklyBossWeek = (isoWeek % 2 === 0);

  // 計算本週週一至週五與週六標準日期區間
  const diffToMon = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
  const monDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon);
  const friDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon + 4);
  const satDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon + 5);
  const monStr = Utilities.formatDate(monDate, "Asia/Taipei", "yyyy-MM-dd");
  const friStr = Utilities.formatDate(friDate, "Asia/Taipei", "yyyy-MM-dd");
  const satStr = Utilities.formatDate(satDate, "Asia/Taipei", "yyyy-MM-dd");

  // 若為雙週大消滅週（第 2 週），向前包含上一週（第 1 週）之日期區間
  const prevMonDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon - 7);
  const prevMonStr = Utilities.formatDate(prevMonDate, "Asia/Taipei", "yyyy-MM-dd");
  const scanStartStr = isBiweeklyBossWeek ? prevMonStr : monStr;
  const scanEndStr = friStr;

  const tasks = getTeacherTasksCached_(ss);
  if (tasks.length === 0) return null;

  // 取得學生在作答區間內的實際作答紀錄
  const studentDoneMap = {};
  let satCompletedRec = null;

  if (username) {
    const uSheet = getStudentSheet(ss, username);
    if (uSheet && uSheet.getLastRow() >= 2) {
      const lastCol = uSheet.getLastColumn();
      const headers = uSheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
      const hMap = getHeaderIndexMap(headers);
      const maxRows = Math.min(uSheet.getLastRow() - 1, 60);
      const uVals = uSheet.getRange(Math.max(2, uSheet.getLastRow() - maxRows + 1), 1, maxRows, lastCol).getValues();

      for (let r = 0; r < uVals.length; r++) {
        const rowD = formatStandardDateYMD(uVals[r][0]);
        const tName = String(uVals[r][hMap.taskName] || "").trim().toLowerCase();
        const score = String(uVals[r][hMap.taskScore] || "").trim();
        const status = String(uVals[r][hMap.status] || "").trim();
        const wrongStr = String(uVals[r][hMap.wrong] || "").trim();
        const wrongList = wrongStr ? wrongStr.split(/[\s,;\n\r]+/).map(w => w.trim().toLowerCase()).filter(Boolean) : [];
        const isDone = (status.includes("已完成") || (score !== "—" && score !== ""));

        // 注意：自由練習錯題不納入週末待攻克！維持自主安全學習

        if (rowD >= scanStartStr && rowD <= scanEndStr) {
          if (tName && tName !== "自主練習" && !tName.includes("自由練習") && isDone) {
            studentDoneMap[tName] = { completed: true, wrongWords: wrongList };
            studentDoneMap[rowD + "_" + tName] = { completed: true, wrongWords: wrongList };
          }
        } else if (rowD === satStr) {
          if (tName && (tName.includes("週末") || tName.includes("消滅") || tName.includes("待攻克") || tName.includes("雙週")) && isDone) {
            satCompletedRec = { completed: true, wrongWords: wrongList };
          }
        }
      }
    }
  }

  // ★ 核心防護：若今天是週日，且週六已施測完成：
  // 1. 若週六 0 錯題（全數答對 100%），本週/雙週錯題已全數消滅，週日絕不指派任何任務！
  // 2. 若週六仍有錯題，週日只施測週六剩餘的錯題！
  if (dayOfWeek === 0) {
    if (satCompletedRec && satCompletedRec.completed) {
      if (satCompletedRec.wrongWords.length === 0) {
        return null; // 週六已全數消滅，週日無任何任務
      }
      const sunTaskName = isBiweeklyBossWeek ? "雙週錯題接續消滅戰" : "週末錯題接續消滅戰";
      if (completedTasksToday && completedTasksToday.has(sunTaskName.toLowerCase())) {
        return {
          hasTask: false,
          alreadyCompleted: true,
          message: `本週${isBiweeklyBossWeek ? "雙週錯題大消滅戰" : "週末錯題接續消滅戰"}今日已完成！已開放自由升級闖關。`
        };
      }
      return {
        hasTask   : true,
        taskName  : sunTaskName,
        words     : satCompletedRec.wrongWords,
        total     : satCompletedRec.wrongWords.length,
        mode      : "ALL",
        count     : satCompletedRec.wrongWords.length,
        isWeekend : true,
        date      : todayStrDash
      };
    }
  }

  const unpassedWordsSet = new Set();
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const tClass = t.taskClass;
    const tName  = t.taskName;
    const rawWords = t.rawWords;
    const enabled = t.enabled;
    const tDate  = t.taskDate;

    if (!enabled || !tName || !rawWords) continue;

    // 檢查是否在當前雙週或單週週期範圍內
    const isTaskInCycle = tDate ? (tDate >= scanStartStr && tDate <= scanEndStr) : true;
    if (!isTaskInCycle) continue;

    const isClassMatch = (tClass === cleanClass || tClass === "all" || tClass === "全校");
    if (!isClassMatch) continue;

    const words = [...new Set(
      rawWords.split(/[\s,;\n\r]+/)
        .map(w => w.trim().toLowerCase())
        .filter(w => w.length > 0 && /^[a-z\-']+$/.test(w))
    )];
    if (words.length === 0) continue;

    const key1 = (tDate ? tDate + "_" : "") + tName.toLowerCase();
    const key2 = tName.toLowerCase();
    const doneRec = studentDoneMap[key1] || studentDoneMap[key2];

    if (!doneRec) {
      // 學生於指定平日完全沒有作答（包含未作答/缺考）：全數單字自動納入六日測驗
      words.forEach(w => unpassedWordsSet.add(w));
    } else {
      // 學生有作答，但沒有答對（答錯的單字）：納入六日測驗
      doneRec.wrongWords.forEach(w => unpassedWordsSet.add(w));
    }
  }

  if (unpassedWordsSet.size === 0) return null;

  const weekendTaskName = isBiweeklyBossWeek ? "雙週指定單字大消滅戰" : "週末指定單字消滅戰";
  if (completedTasksToday && completedTasksToday.has(weekendTaskName.toLowerCase())) {
    return {
      hasTask: false,
      alreadyCompleted: true,
      message: `本週${isBiweeklyBossWeek ? "雙週指定單字大消滅戰" : "指定單字未達標消滅戰"}今日已完成！已開放自由升級闖關。`
    };
  }

  const unpassedList = Array.from(unpassedWordsSet);
  return {
    hasTask   : true,
    taskName  : weekendTaskName,
    words     : unpassedList,
    total     : unpassedList.length,
    mode      : "ALL",
    count     : unpassedList.length,
    isWeekend : true,
    date      : todayStrDash
  };
}

/** 供教師後台網頁讀取當前班級任務設定（支援指定日期與班級雙向載入） */
function getTeacherTask(credentials, targetClass, targetDate) {
  try {
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    const auth = authenticateUser(ss, credentials.username, credentials.password);
    if (!auth.success || auth.role !== "teacher") return { status: "error", message: "無權限" };

    const cleanAuth  = String(auth.className || "").replace(/班$/, "").trim().toLowerCase();
    let effectiveClass = String(targetClass || auth.className || "all").trim();
    const cleanTarget  = effectiveClass.replace(/班$/, "").trim().toLowerCase();

    // 非管理員教師嚴格限制只能查看自身班級任務
    if (!auth.isAdmin && cleanAuth && cleanAuth !== "all" && cleanTarget !== cleanAuth) {
      effectiveClass = auth.className;
    }

    const cleanClass = effectiveClass.replace(/班$/, "").trim().toLowerCase();
    const cleanDate  = targetDate ? formatStandardDateYMD(targetDate) : "";
    const tasks = getTeacherTasksCached_(ss);
    if (tasks.length === 0) return { status: "success", task: null };

    let matchedRow = null;
    // 由新至舊遍歷
    for (let i = tasks.length - 1; i >= 0; i--) {
      const c = tasks[i].taskClass;
      const d = tasks[i].taskDate;
      if (c === cleanClass) {
        if (cleanDate && d === cleanDate) {
          matchedRow = tasks[i];
          break;
        } else if (!cleanDate && !matchedRow) {
          matchedRow = tasks[i];
        }
      }
    }

    if (matchedRow) {
      return {
        status: "success",
        task: {
          className : matchedRow.rawClass,
          taskName  : matchedRow.taskName,
          words     : matchedRow.rawWords,
          mode      : matchedRow.mode,
          count     : matchedRow.countVal,
          enabled   : matchedRow.enabled,
          targetDate: matchedRow.taskDate
        }
      };
    }
    return { status: "success", task: null };
  } catch(e) {
    logError("getTeacherTask", e, credentials ? credentials.username : "", "");
    return { status: "error", message: e.toString() };
  }
}

/** 供教師後台網頁儲存並發布單字任務 */
function saveTeacherTask(credentials, taskData) {
  try {
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    const auth = authenticateUser(ss, credentials.username, credentials.password);
    if (!auth.success || auth.role !== "teacher") return { status: "error", message: "無權限" };

    const targetClass = String(taskData.targetClass || taskData.className || auth.className || "all").trim();
    const cleanAuth   = String(auth.className || "").replace(/班$/, "").trim().toLowerCase();
    const cleanTarget = String(targetClass || "").replace(/班$/, "").trim().toLowerCase();

    // 非管理員教師嚴格限制只能為自身班級出題 (不可指定全校或跨班)
    if (!auth.isAdmin && cleanAuth && cleanAuth !== "all" && cleanTarget !== cleanAuth) {
      return { status: "error", message: "權限不足：非管理員教師僅限為自身班級出題" };
    }

    let sheet = ss.getSheetByName("指定單字任務");
    if (!sheet) {
      sheet = ss.insertSheet("指定單字任務");
      sheet.appendRow(["班級","任務名稱","指定單字清單 (逗號或空格分隔)","測驗模式","抽測題數","啟用狀態","指定日期"]);
      sheet.getRange("1:1").setFontWeight("bold").setBackground("#1e40af").setFontColor("#ffffff").setHorizontalAlignment("center");
      [100, 160, 350, 100, 100, 100, 120].forEach((w,i)=>sheet.setColumnWidth(i+1,w));
      sheet.setFrozenRows(1);
    } else if (sheet.getLastColumn() < 7) {
      sheet.getRange(1, 7).setValue("指定日期").setFontWeight("bold").setBackground("#1e40af").setFontColor("#ffffff").setHorizontalAlignment("center");
      sheet.setColumnWidth(7, 120);
    }

    const data = sheet.getDataRange().getValues();
    let rowIdx = -1;
    const targetDateStr = taskData.targetDate ? formatStandardDateYMD(taskData.targetDate) : (taskData.date ? formatStandardDateYMD(taskData.date) : "");

    for (let i = 1; i < data.length; i++) {
      const c = String(data[i][0] || "").replace(/班$/, "").toLowerCase();
      const d = data[i][6] ? formatStandardDateYMD(data[i][6]) : "";
      // 若該班級在同一天已經有任務，則更新該列；若不同天，則新增一列
      if (c === cleanTarget && (!targetDateStr || d === targetDateStr)) {
        rowIdx = i + 1;
        break;
      }
    }

    const rowVal = [
      targetClass,
      String(taskData.taskName || "每日單字任務").trim(),
      String(taskData.words || "").trim(),
      taskData.mode === "全考" ? "全考" : "抽測",
      taskData.mode === "全考" ? "ALL" : String(taskData.count || "10"),
      taskData.enabled === true,
      targetDateStr
    ];

    if (rowIdx > 0) {
      sheet.getRange(rowIdx, 1, 1, 7).setValues([rowVal]);
    } else {
      sheet.appendRow(rowVal);
    }

    clearOverviewCache();
    invalidateTeacherTaskCache_();
    const dateNotice = targetDateStr ? `（指定日期：${targetDateStr}）` : "（每日通用）";
    return { status: "success", message: `✅ 班級【${targetClass}】${dateNotice}指定任務已成功發布！` };
  } catch(e) {
    logError("saveTeacherTask", e, credentials ? credentials.username : "", "");
    return { status: "error", message: e.toString() };
  }
}

// ════════════════════════════════════════════════════════════════════