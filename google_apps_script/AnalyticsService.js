// 4.1 每日指定測驗成果與錯題大數據分析 (Big Data Analytics)
// ════════════════════════════════════════════════════════════════════

function getDailyTaskAnalytics(formData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const auth = authenticateUser(ss, formData.username, formData.password);
    if (!auth.success || auth.role !== "teacher") {
      return { status: "error", message: "無權限查看教師大數據分析" };
    }

    const targetClass = (!auth.isAdmin && auth.className) ? auth.className : (formData.targetClass || "all");
    const cleanTargetClass = targetClass.replace(/班$/, "").trim().toLowerCase();
    const targetDateParam = formData.targetDate ? formatStandardDateYMD(formData.targetDate) : "";
    const cacheKey = "dta_" + (auth.isAdmin ? "admin" : (auth.className || "all")) + "_" + cleanTargetClass + "_" + targetDateParam;
    const cache = CacheService.getScriptCache();
    if (!formData.forceRefresh) {
      try {
        const hit = cache.get(cacheKey);
        if (hit) {
          const jsonStr = hit.startsWith("GZ:") ? decompressData(hit) : hit;
          return JSON.parse(jsonStr);
        }
      } catch(_) {}
    }

    // 1. 抓取使用者清單，以對比出「未測驗」學生
    const userSheet = ss.getSheetByName("使用者清單");
    const allStudents = [];
    const allClassesSet = new Set();
    if (userSheet && userSheet.getLastRow() >= 2) {
      const uData = userSheet.getDataRange().getValues();
      for (let i = 1; i < uData.length; i++) {
        const u = String(uData[i][0] || "").trim();
        const role = String(uData[i][2] || "student").trim().toLowerCase();
        const c = String(uData[i][3] || "").trim();
        const real = String(uData[i][4] || "").trim();
        if (c) allClassesSet.add(c);
        if (u && role === "student") {
          const cClean = c.replace(/班$/, "").trim().toLowerCase();
          if (cleanTargetClass === "all" || cClean === cleanTargetClass) {
            allStudents.push({ username: u, realName: real, className: c });
          }
        }
      }
    }

    // 2. 獲取任務紀錄：直接自各學生個別分頁彙整（完全不依賴獨立任務表，每筆測驗皆獨立紀錄）
    const recData = [["日期","班級","學號","姓名","任務名稱","指定測驗成績","指定測驗正確率","今日總作答","今日總答對","總正確率","練習狀態","最後更新時間","測驗錯題單字"]];
    allStudents.forEach(st => {
      const uSheet = ss.getSheetByName(st.username);
      if (uSheet && uSheet.getLastRow() >= 2) {
        const maxRows = Math.min(uSheet.getLastRow() - 1, 60);
        const maxCols = uSheet.getLastColumn();
        if (maxCols >= 1) {
          const headers = uSheet.getRange(1, 1, 1, maxCols).getValues()[0] || [];
          const hMap = getHeaderIndexMap(headers);
          const sVals = uSheet.getRange(2, 1, maxRows, maxCols).getValues();
          sVals.forEach(row => {
            const dateStr = formatStandardDateYMD(row[hMap.date]);
            if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
              recData.push([
                dateStr, st.className, st.username, st.realName || st.username,
                row[hMap.taskName] || "自主練習",
                row[hMap.taskScore] || "—",
                row[hMap.taskRate] || "—",
                row[hMap.correct] || 0,
                row[hMap.attempts] || 0,
                row[hMap.accuracy] || "0%",
                row[hMap.status] || "—",
                formatStandardDateTime(row[hMap.date]),
                row[hMap.wrong] || ""
              ]);
            }
          });
        }
      }
    });

    if (recData.length < 2) {
      return {
        status: "success",
        dates: [],
        selectedDate: "",
        selectedClass: formData.targetClass || "all",
        summary: { totalStudents: allStudents.length, completedCount: 0, inProgressCount: 0, notStartedCount: allStudents.length, completionRate: "0%", avgScore: "0", avgRate: "0%", passCount: 0, passRate: "0%", perfectCount: 0 },
        errorRanking: [],
        studentRecords: allStudents.map(st => ({
          username   : st.username,
          realName   : st.realName || st.username,
          className  : st.className,
          taskName   : "—",
          status     : "⚪ 未測驗",
          score      : "—",
          rate       : "—",
          points     : null,
          wrongWords : [],
          updatedAt  : "—"
        }))
      };
    }

    // 3. 抓取所有有記錄的日期清單 (由新到舊排序)
    const dateSet = new Set();
    for (let r = 1; r < recData.length; r++) {
      const dStr = formatStandardDateYMD(recData[r][0]);
      if (dStr && /^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
        dateSet.add(dStr);
      }
    }
    const dates = Array.from(dateSet).sort().reverse();

    // 預設日期：今天或最近有紀錄的日期
    const todayStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
    let selectedDate = formData.targetDate ? formatStandardDateYMD(formData.targetDate) : (dates.includes(todayStr) ? todayStr : (dates[0] || todayStr));

    // 檢查 selectedDate 當日各班級指派任務（判斷未受測 vs 未指派）
    const allTeacherTasks = getTeacherTasksCached_(ss);
    const classTaskAssignedOnDate = new Map();
    (allTeacherTasks || []).forEach(t => {
      if (t.enabled && t.taskName && t.rawWords) {
        if (!t.taskDate || formatStandardDateYMD(t.taskDate) === selectedDate) {
          const c = String(t.taskClass || "").replace(/班$/, "").trim().toLowerCase();
          classTaskAssignedOnDate.set(c, t.taskName);
        }
      }
    });
    const schoolWideTaskName = classTaskAssignedOnDate.get("all") || classTaskAssignedOnDate.get("全校") || null;

    // 3. 篩選當日測驗紀錄
    const dayRecordsMap = {};
    for (let r = 1; r < recData.length; r++) {
      const dStr = formatStandardDateYMD(recData[r][0]);
      const u = String(recData[r][2] || "").trim();
      const c = String(recData[r][1] || "").trim();
      const cClean = c.replace(/班$/, "").trim().toLowerCase();

      if (dStr === selectedDate && u) {
        if (cleanTargetClass === "all" || cClean === cleanTargetClass) {
          const parsed = parseScoreAndRate(recData[r][5], recData[r][6]);
          const status = String(recData[r][10] || "");
          const wrongWordsStr = String(recData[r][12] || "");
          const wrongWords = wrongWordsStr
            ? wrongWordsStr.split(/[,;\s]+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0)
            : [];

          dayRecordsMap[u] = {
            date        : dStr,
            className   : c,
            username    : u,
            realName    : String(recData[r][3] || u),
            taskName    : String(recData[r][4] || "今日指定測驗"),
            score       : parsed.score,
            rate        : parsed.rate,
            status      : status,
            updatedAt   : String(recData[r][11] || ""),
            wrongWords  : wrongWords
          };
        }
      }
    }

    // 4. 統計各單字答錯大數據 (Word Error Frequency)
    const wordErrorMap = {}; // word -> { errorCount, students: [] }
    let completedCount = 0;
    let inProgressCount = 0;
    let totalScoreSum = 0;
    let passCount = 0;
    let perfectCount = 0;

    const studentRecords = [];

    // 合併清單：遍歷班級應測學生
    allStudents.forEach(st => {
      const rec = dayRecordsMap[st.username];
      if (rec) {
        const isCompleted = rec.status.includes("已完成") && rec.score !== "—";
        const isInProgress = rec.status.includes("作答中") || rec.status.includes("進行中");

        let pctNum = null;
        if (rec.rate.endsWith("%")) {
          pctNum = parseFloat(rec.rate);
        } else {
          const num = parseFloat(rec.rate);
          if (!isNaN(num)) pctNum = num <= 1 ? num * 100 : num;
        }

        if (isCompleted) {
          completedCount++;
          if (pctNum !== null) {
            totalScoreSum += pctNum;
            if (pctNum >= 60) passCount++;
            if (pctNum >= 100) perfectCount++;
          }
          // 累加錯題大數據
          rec.wrongWords.forEach(w => {
            if (!wordErrorMap[w]) {
              wordErrorMap[w] = { word: w, errorCount: 0, students: [] };
            }
            wordErrorMap[w].errorCount++;
            wordErrorMap[w].students.push({
              username  : st.username,
              realName  : st.realName || st.username,
              className : st.className
            });
          });
        } else if (isInProgress) {
          inProgressCount++;
        }

        const cClean = String(st.className || "").replace(/班$/, "").trim().toLowerCase();
        const matchedTask = classTaskAssignedOnDate.get(cClean) || schoolWideTaskName;
        let finalStatus = rec.status;
        let finalTaskName = rec.taskName;
        if (isCompleted) {
          finalStatus = "🟢 已完成";
        } else if (isInProgress) {
          finalStatus = rec.status && (rec.status.includes("中斷") || rec.status.includes("作答中")) ? rec.status : "🟠 作答中斷";
        } else if (rec.status && (rec.status.includes("缺席") || rec.status.includes("缺考"))) {
          finalStatus = "🔴 缺席未受測";
          finalTaskName = matchedTask || rec.taskName;
        } else if (rec.status && (rec.status.includes("登入未受測") || rec.status.includes("未受測"))) {
          finalStatus = "🟡 登入未受測";
          finalTaskName = matchedTask || rec.taskName;
        } else if (matchedTask) {
          finalStatus = "🟡 登入未受測";
          finalTaskName = matchedTask;
        } else {
          finalStatus = "⚪ 未指派";
          finalTaskName = "⚪ 未指派";
        }

        studentRecords.push({
          username   : st.username,
          realName   : st.realName || st.username,
          className  : st.className,
          taskName   : finalTaskName,
          status     : finalStatus,
          score      : rec.score,
          rate       : rec.rate,
          points     : pctNum !== null ? pctNum : null,
          wrongWords : rec.wrongWords,
          updatedAt  : rec.updatedAt
        });
      } else {
        const cClean = String(st.className || "").replace(/班$/, "").trim().toLowerCase();
        const matchedTask = classTaskAssignedOnDate.get(cClean) || schoolWideTaskName;
        studentRecords.push({
          username   : st.username,
          realName   : st.realName || st.username,
          className  : st.className,
          taskName   : matchedTask || "⚪ 未指派",
          status     : matchedTask ? "🔴 缺席未受測" : "⚪ 未指派",
          score      : "—",
          rate       : "—",
          points     : null,
          wrongWords : [],
          updatedAt  : "—"
        });
      }
    });

    const totalStudents = allStudents.length;
    const notStartedCount = Math.max(0, totalStudents - completedCount - inProgressCount);
    const completionRate = totalStudents > 0 ? (Math.round((completedCount / totalStudents) * 1000) / 10) + "%" : "0%";
    const avgScore = completedCount > 0 ? (Math.round((totalScoreSum / completedCount) * 10) / 10).toFixed(1) : "0";
    const avgRate = avgScore + "%";
    const passRate = completedCount > 0 ? (Math.round((passCount / completedCount) * 1000) / 10) + "%" : "0%";

    // 5. 排序錯題排行榜 (最多、次多、次次多、次次次多...)
    const sortedErrorWords = Object.values(wordErrorMap).sort((a, b) => b.errorCount - a.errorCount);
    const rankLabels = ["🥇 最多學生答錯", "🥈 次多學生答錯", "🥉 次次多學生答錯", "🏅 第 4 多學生答錯", "🏅 第 5 多學生答錯"];

    const errorRanking = sortedErrorWords.map((item, idx) => {
      const errRate = completedCount > 0 ? (Math.round((item.errorCount / completedCount) * 1000) / 10) + "%" : "0%";
      return {
        rank       : idx + 1,
        label      : rankLabels[idx] || `第 ${idx + 1} 多學生答錯`,
        word       : item.word,
        errorCount : item.errorCount,
        errorRate  : errRate,
        students   : item.students
      };
    });

    const analyticsResult = {
      status         : "success",
      dates          : dates,
      selectedDate   : selectedDate,
      selectedClass  : targetClass,
      classes        : (!auth.isAdmin && auth.className) ? [auth.className] : Array.from(allClassesSet).sort(),
      summary: {
        totalStudents   : totalStudents,
        completedCount  : completedCount,
        inProgressCount : inProgressCount,
        notStartedCount : notStartedCount,
        failedCount     : Math.max(0, completedCount - passCount),
        completionRate  : completionRate,
        avgScore        : avgScore,
        avgRate         : avgRate,
        passCount       : passCount,
        passRate        : passRate,
        perfectCount    : perfectCount
      },
      errorRanking   : errorRanking,
      studentRecords : studentRecords
    };

    try {
      const gz = compressData(JSON.stringify(analyticsResult));
      if (gz.length < 95000) cache.put(cacheKey, gz, 120);
    } catch(_) {}

    return analyticsResult;
  } catch(err) {
    logError("getDailyTaskAnalytics", err, formData ? formData.username : "", "");
    return { status: "error", message: err.toString() };
  }
}

// ════════════════════════════════════════════════════════════════════
// 4-2. 讀取指定日期區間所有學生答題狀況比較表（全班與個別學生）
// ════════════════════════════════════════════════════════════════════

function getDateRangePerformanceAnalytics(formData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const auth = authenticateUser(ss, formData.username, formData.password);
    if (!auth.success || auth.role !== "teacher") {
      return { status: "error", message: "無權限查看教師日期區間大數據分析" };
    }

    const userSheet = ss.getSheetByName("使用者清單");
    const targetClass = (!auth.isAdmin && auth.className) ? auth.className : (formData.targetClass || "all");
    const cleanTargetClass = targetClass.replace(/班$/, "").trim().toLowerCase();
    const startD = formData.startDate ? formatStandardDateYMD(formData.startDate) : "";
    const endD = formData.endDate ? formatStandardDateYMD(formData.endDate) : "";
    const rangeCacheKey = "drp_" + (auth.isAdmin ? "admin" : (auth.className || "all")) + "_" + cleanTargetClass + "_" + startD + "_" + endD;
    const cache = CacheService.getScriptCache();
    if (!formData.forceRefresh) {
      try {
        const hit = cache.get(rangeCacheKey);
        if (hit) {
          const jsonStr = hit.startsWith("GZ:") ? decompressData(hit) : hit;
          return JSON.parse(jsonStr);
        }
      } catch(_) {}
    }

    // 1. 取得全校班級清單與學生名冊
    const allStudents = [];
    const allClassesSet = new Set();
    if (userSheet && userSheet.getLastRow() >= 2) {
      const uData = userSheet.getDataRange().getValues();
      for (let i = 1; i < uData.length; i++) {
        const u = String(uData[i][0] || "").trim();
        const role = String(uData[i][2] || "student").trim().toLowerCase();
        const c = String(uData[i][3] || "").trim();
        const real = String(uData[i][4] || "").trim();
        if (c) allClassesSet.add(c);
        if (u && role === "student") {
          const cClean = c.replace(/班$/, "").trim().toLowerCase();
          if (cleanTargetClass === "all" || cClean === cleanTargetClass) {
            allStudents.push({ username: u, realName: real || u, className: c });
          }
        }
      }
    }

    // 2. 獲取任務紀錄：直接自各學生個別分頁彙整（完全不依賴獨立任務表）
    const recData = [["日期","班級","學號","姓名","任務名稱","指定測驗成績","指定測驗正確率","今日總作答","今日總答對","總正確率","練習狀態","最後更新時間","測驗錯題單字"]];
    allStudents.forEach(st => {
      const uSheet = ss.getSheetByName(st.username);
      if (uSheet && uSheet.getLastRow() >= 2) {
        const maxRows = Math.min(uSheet.getLastRow() - 1, 60);
        const maxCols = uSheet.getLastColumn();
        if (maxCols >= 1) {
          const headers = uSheet.getRange(1, 1, 1, maxCols).getValues()[0] || [];
          const hMap = getHeaderIndexMap(headers);
          const sVals = uSheet.getRange(2, 1, maxRows, maxCols).getValues();
          sVals.forEach(row => {
            const dateStr = formatStandardDateYMD(row[hMap.date]);
            if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
              recData.push([
                dateStr, st.className, st.username, st.realName || st.username,
                row[hMap.taskName] || "自主練習",
                row[hMap.taskScore] || "—",
                row[hMap.taskRate] || "—",
                row[hMap.correct] || 0,
                row[hMap.attempts] || 0,
                row[hMap.accuracy] || "0%",
                row[hMap.status] || "—",
                formatStandardDateTime(row[hMap.date]),
                row[hMap.wrong] || ""
              ]);
            }
          });
        }
      }
    });

    if (recData.length < 2) {
      return {
        status: "success",
        targetClass: targetClass,
        classes: (!auth.isAdmin && auth.className) ? [auth.className] : Array.from(allClassesSet).sort(),
        startDate: formData.startDate || "",
        endDate: formData.endDate || "",
        dateList: [],
        classSummary: {
          totalStudents: allStudents.length,
          activeStudents: 0,
          participationRate: "0%",
          totalAttempts: 0,
          totalCorrect: 0,
          classAvgAccuracy: "0%",
          masteredCount: 0,
          attentionCount: 0,
          dailyOverview: [],
          topErrorWords: []
        },
        students: allStudents.map(st => ({
          username: st.username,
          realName: st.realName,
          className: st.className,
          activeDays: 0,
          totalDays: 0,
          participationRate: "0%",
          totalAttempts: 0,
          totalCorrect: 0,
          accuracy: "—",
          accuracyNum: 0,
          statusTag: "⚪ 尚未作答",
          wrongWords: [],
          dailyMap: {}
        }))
      };
    }

    // 2. 彙整每日任務紀錄中所有出現過的日期 (yyyy-MM-dd)
    const allRecordedDatesSet = new Set();
    for (let r = 1; r < recData.length; r++) {
      const dStr = formatStandardDateYMD(recData[r][0]);
      if (dStr && /^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
        allRecordedDatesSet.add(dStr);
      }
    }
    const allSortedDates = Array.from(allRecordedDatesSet).sort(); // 舊 -> 新
    const todayStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");

    // 決定查詢起訖日期：預設為最近 7 天 (包含今天)
    let endDate = formData.endDate ? formatStandardDateYMD(formData.endDate) : (allSortedDates.length > 0 ? allSortedDates[allSortedDates.length - 1] : todayStr);
    let startDate = formData.startDate ? formatStandardDateYMD(formData.startDate) : "";
    if (!startDate) {
      const endD = new Date(endDate.replace(/-/g, "/"));
      const startD = new Date(endD.getTime() - 6 * 24 * 60 * 60 * 1000);
      startDate = Utilities.formatDate(startD, "Asia/Taipei", "yyyy-MM-dd");
    }
    if (startDate > endDate) {
      const tmp = startDate; startDate = endDate; endDate = tmp;
    }

    // 3. 生成 dateList：在 [startDate, endDate] 範圍內的日期清單
    const dateList = [];
    const curD = new Date(startDate.replace(/-/g, "/"));
    const maxD = new Date(endDate.replace(/-/g, "/"));
    const daySpan = Math.round((maxD.getTime() - curD.getTime()) / (24 * 60 * 60 * 1000)) + 1;

    if (daySpan <= 14) {
      // 14 天內：生成每天日曆欄位 (含六日)
      while (curD <= maxD) {
        dateList.push(Utilities.formatDate(curD, "Asia/Taipei", "yyyy-MM-dd"));
        curD.setDate(curD.getDate() + 1);
      }
    } else {
      // 超過 14 天：只顯示該區間內實際「有紀錄」的日期，避免表格過於龐大
      allSortedDates.forEach(d => {
        if (d >= startDate && d <= endDate) {
          dateList.push(d);
        }
      });
      if (dateList.length === 0 && startDate === endDate) {
        dateList.push(startDate);
      }
    }

    // 4. 解析與配對學生各日紀錄
    const userRecordsMap = {};
    const wordErrorCountMap = {}; // word -> Set of usernames

    for (let r = 1; r < recData.length; r++) {
      const dStr = formatStandardDateYMD(recData[r][0]);
      const u = String(recData[r][2] || "").trim();
      const c = String(recData[r][1] || "").trim();
      const cClean = c.replace(/班$/, "").trim().toLowerCase();

      if (dStr >= startDate && dStr <= endDate && u) {
        if (cleanTargetClass === "all" || cClean === cleanTargetClass) {
          if (!userRecordsMap[u]) userRecordsMap[u] = {};

          const parsed = parseScoreAndRate(recData[r][5], recData[r][6]);
          const status = String(recData[r][10] || "");
          const attempts = parseInt(recData[r][7], 10) || 0;
          const correct = parseInt(recData[r][8], 10) || 0;
          const wrongWordsStr = String(recData[r][12] || "");
          const wrongWords = wrongWordsStr
            ? wrongWordsStr.split(/[,;\s]+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0)
            : [];

          let points = null;
          if (parsed.rate && parsed.rate !== "—") {
            const num = parseFloat(parsed.rate);
            if (!isNaN(num)) points = num <= 1 ? num * 100 : num;
          }

          userRecordsMap[u][dStr] = {
            date: dStr,
            taskName: String(recData[r][4] || "每日任務"),
            score: parsed.score,
            rate: parsed.rate,
            points: points,
            attempts: attempts,
            correct: correct,
            status: status,
            wrongWords: wrongWords,
            updatedAt: String(recData[r][11] || "")
          };

          wrongWords.forEach(w => {
            if (!wordErrorCountMap[w]) wordErrorCountMap[w] = new Set();
            wordErrorCountMap[w].add(u);
          });
        }
      }
    }

    // 5. 彙整個別學生區間統計
    let totalAttemptsSum = 0;
    let totalCorrectSum = 0;
    let activeStudentsCount = 0;
    let masteredCount = 0;
    let attentionCount = 0;

    const studentRecords = allStudents.map(st => {
      const uMap = userRecordsMap[st.username] || {};
      let studentAttempts = 0;
      let studentCorrect = 0;
      let activeDays = 0;
      let scoreSum = 0;
      let scoreDays = 0;
      const studentWrongWordsSet = new Set();
      const dailyMap = {};

      dateList.forEach(d => {
        const rec = uMap[d];
        if (rec) {
          dailyMap[d] = rec;
          studentAttempts += rec.attempts;
          studentCorrect += rec.correct;
          if (rec.status.includes("已完成") || (rec.score && rec.score !== "—")) {
            activeDays++;
          }
          if (rec.points !== null) {
            scoreSum += rec.points;
            scoreDays++;
          }
          (rec.wrongWords || []).forEach(w => studentWrongWordsSet.add(w));
        } else {
          dailyMap[d] = {
            date: d,
            score: "—",
            rate: "—",
            points: null,
            attempts: 0,
            correct: 0,
            status: "⚪ 未測驗",
            wrongWords: []
          };
        }
      });

      if (activeDays > 0) activeStudentsCount++;
      totalAttemptsSum += studentAttempts;
      totalCorrectSum += studentCorrect;

      let accuracyNum = 0;
      let accuracyStr = "—";
      if (studentAttempts > 0) {
        accuracyNum = Math.round((studentCorrect / studentAttempts) * 1000) / 10;
        accuracyStr = accuracyNum.toFixed(1) + "%";
      } else if (scoreDays > 0) {
        accuracyNum = Math.round((scoreSum / scoreDays) * 10) / 10;
        accuracyStr = accuracyNum.toFixed(1) + "%";
      }

      const totalDaysCount = dateList.length;
      const participationRateNum = totalDaysCount > 0 ? Math.round((activeDays / totalDaysCount) * 1000) / 10 : 0;
      const participationRateStr = participationRateNum.toFixed(1) + "%";

      let statusTag = "⚪ 尚未作答";
      let tagColor = "var(--text-muted)";
      if (activeDays > 0) {
        if (accuracyNum >= 85 && participationRateNum >= 70) {
          statusTag = "🌟 精熟頂尖";
          tagColor = "#10b981";
          masteredCount++;
        } else if (accuracyNum >= 75 && participationRateNum >= 60) {
          statusTag = "🟢 良好穩定";
          tagColor = "#10b981";
        } else if (accuracyNum >= 60) {
          statusTag = "🟡 尚可平穩";
          tagColor = "#f59e0b";
        } else {
          statusTag = "⚠️ 需加強輔導";
          tagColor = "#ef4444";
          attentionCount++;
        }
        if (participationRateNum < 40 && totalDaysCount >= 3) {
          statusTag = "💤 缺測偏多";
          tagColor = "#ef4444";
          attentionCount++;
        }
      } else {
        if (totalDaysCount >= 2) attentionCount++;
      }

      return {
        username: st.username,
        realName: st.realName,
        className: st.className,
        activeDays: activeDays,
        totalDays: totalDaysCount,
        participationRate: participationRateStr,
        participationRateNum: participationRateNum,
        totalAttempts: studentAttempts,
        totalCorrect: studentCorrect,
        accuracy: accuracyStr,
        accuracyNum: accuracyNum,
        statusTag: statusTag,
        tagColor: tagColor,
        wrongWords: Array.from(studentWrongWordsSet),
        dailyMap: dailyMap
      };
    });

    // 6. 計算每日全班整體表現
    const dailyOverview = dateList.map(d => {
      let dayCompleted = 0;
      let dayScoreSum = 0;
      let dayPass = 0;

      studentRecords.forEach(st => {
        const item = st.dailyMap[d];
        if (item && (item.status.includes("已完成") || item.score !== "—")) {
          dayCompleted++;
          if (item.points !== null) {
            dayScoreSum += item.points;
            if (item.points >= 60) dayPass++;
          }
        }
      });

      const dayAvgRate = dayCompleted > 0 ? (Math.round((dayScoreSum / dayCompleted) * 10) / 10).toFixed(1) + "%" : "—";
      const dayPassRate = dayCompleted > 0 ? (Math.round((dayPass / dayCompleted) * 1000) / 10).toFixed(1) + "%" : "—";

      return {
        date: d,
        completedCount: dayCompleted,
        totalStudents: allStudents.length,
        avgRate: dayAvgRate,
        passRate: dayPassRate
      };
    });

    // 7. 期間班級高頻錯題排行 Top 10
    const topErrorWords = Object.keys(wordErrorCountMap).map(w => {
      const cnt = wordErrorCountMap[w].size;
      const rate = allStudents.length > 0 ? (Math.round((cnt / allStudents.length) * 1000) / 10).toFixed(1) + "%" : "0%";
      return { word: w, errorCount: cnt, errorRate: rate };
    }).sort((a, b) => b.errorCount - a.errorCount).slice(0, 10);

    const totalStudents = allStudents.length;
    const overallParticipationRate = totalStudents > 0 ? ((activeStudentsCount / totalStudents) * 100).toFixed(1) + "%" : "0%";
    const classAvgAccuracy = totalAttemptsSum > 0
      ? ((totalCorrectSum / totalAttemptsSum) * 100).toFixed(1) + "%"
      : "0%";

    const rangeRes = {
      status: "success",
      targetClass: targetClass,
      classes: (!auth.isAdmin && auth.className) ? [auth.className] : Array.from(allClassesSet).sort(),
      startDate: startDate,
      endDate: endDate,
      availableDates: allSortedDates,
      dateList: dateList,
      classSummary: {
        totalStudents: totalStudents,
        activeStudents: activeStudentsCount,
        participationRate: overallParticipationRate,
        totalAttempts: totalAttemptsSum,
        totalCorrect: totalCorrectSum,
        classAvgAccuracy: classAvgAccuracy,
        masteredCount: masteredCount,
        attentionCount: attentionCount,
        dailyOverview: dailyOverview,
        topErrorWords: topErrorWords
      },
      students: studentRecords
    };

    try {
      const gz = compressData(JSON.stringify(rangeRes));
      if (gz.length < 95000) cache.put(rangeCacheKey, gz, 180);
    } catch(_) {}

    return rangeRes;
  } catch(err) {
    logError("getDateRangePerformanceAnalytics", err, formData ? formData.username : "", "");
    return { status: "error", message: err.toString() };
  }
}

// ════════════════════════════════════════════════════════════════════