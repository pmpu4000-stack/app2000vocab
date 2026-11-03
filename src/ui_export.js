// =====================================================================
// ui_export.js — 底部作答歷程紀錄匯出下載模組 (Excel / PDF / A4 報表)
// =====================================================================
import { escapeHtml } from "./wordbank.js?v=20261025_1618";
import { normalizeDateStr, formatDateYMD } from "./store.js?v=20261025_1618";
import { levelColor, levelName } from "./levels.js?v=20261013_1225";
import { diagnoseWordMistake } from "./diagnostics.js";
import {
  resolveWordStr,
  isValidEnglishWordStr,
  getCombinedTaskHistory,
  resolveTaskWords,
  resolveDailyPracticeRecord,
  getWeekPendingConquerWords,
  _resolveConquerWordLevel
} from "./ui.js";

// =====================================================================
// 📥 底部使用紀錄匯出下載模組 (支援指定日期或指定範圍，PDF / Excel 雙格式輸出)
// =====================================================================
let _latestSummaryGetter = null;

function _formatYMDLocal(dt) {
  return formatDateYMD(dt);
}

function _extractFreeWordsForDate(record, d) {
  if (!record || !record.attempts) return { correctWords: [], wrongWords: [], totalWords: 0, correctCount: 0, rate: 0 };
  const attempts = record.attempts || 0;
  const correct = record.correct || 0;
  const wrongCount = (record.wrong !== undefined) ? record.wrong : Math.max(0, attempts - correct);
  const wordsMap = record.words || {};
  let correctList = [];
  let wrongList = [];

  Object.keys(wordsMap).forEach(k => {
    const info = wordsMap[k];
    const rawW = (typeof info === "object" && info && info.word) ? info.word : k;
    const wName = resolveWordStr(rawW, d).toLowerCase();
    if (!isValidEnglishWordStr(wName)) return;

    const wAtt = (typeof info === "object" && info) ? (info.attempts !== undefined ? info.attempts : (info.a !== undefined ? info.a : 1)) : 1;
    const wCor = (typeof info === "object" && info) ? (info.correct !== undefined ? info.correct : (info.c !== undefined ? info.c : (info.passed ? 1 : 0))) : 0;
    const wWrg = (typeof info === "object" && info) ? (info.wrong !== undefined ? info.wrong : Math.max(0, wAtt - wCor)) : 0;
    const hasWrong = wWrg > 0 || (info && (info.lastResult === "wrong" || info.ew));
    const hasCorrect = wCor > 0 || (info && (info.passed || info.lastResult === "correct"));

    if (hasWrong) {
      wrongList.push({
        word: wName,
        correct: wCor || 0,
        wrong: wWrg || 1,
        hadCorrectThenWrong: !!(info && (info.hadCorrectThenWrong || (info.lastResult === "wrong" && wCor > 0))),
        lastResult: (info && info.lastResult) ? info.lastResult : ""
      });
    } else if (hasCorrect) {
      correctList.push({ word: wName, correct: wCor || 1 });
    }
  });

  if (wrongList.length === 0 && Array.isArray(record.freeWrongWords) && record.freeWrongWords.length > 0) {
    record.freeWrongWords.forEach(rawW => {
      const wName = resolveWordStr(rawW, d).toLowerCase();
      if (isValidEnglishWordStr(wName) && !wrongList.some(x => x.word === wName) && !correctList.some(x => x.word === wName)) {
        wrongList.push({ word: wName, correct: 0, wrong: 1, hadCorrectThenWrong: false, lastResult: "wrong" });
      }
    });
  }

  if (correctList.length === 0 && wrongList.length === 0 && attempts > 0) {
    const allWords = ((d && d.allPracticedWords) || []).map(w => ({
      ...w,
      word: resolveWordStr(w.word || w, d).toLowerCase()
    })).filter(w => isValidEnglishWordStr(w.word));

    if (wrongCount > 0 && allWords.length > 0) {
      const wrongCands = allWords.filter(w => (w.wrong > 0 || w.ew));
      wrongCands.sort((a, b) => (b.wrong || 0) - (a.wrong || 0));
      wrongCands.slice(0, wrongCount).forEach(w => wrongList.push({ word: w.word, correct: w.correct || 0, wrong: w.wrong || 1, hadCorrectThenWrong: false, lastResult: "" }));
    }
    if (correct > 0 && allWords.length > 0) {
      const correctCands = allWords.filter(w => w.correct > 0 && !wrongList.some(wl => wl.word === w.word));
      correctCands.sort((a, b) => (b.correct || 0) - (a.correct || 0));
      correctCands.slice(0, correct).forEach(w => correctList.push({ word: w.word, correct: w.correct || 1 }));
    }
  }

  correctList.sort((a, b) => a.word.localeCompare(b.word));
  wrongList.sort((a, b) => a.word.localeCompare(b.word));

  const correctedCount = wrongList.filter(w => {
    const isStillWrong = w.hadCorrectThenWrong || (w.lastResult === "wrong" && w.correct > 0);
    return !isStillWrong && w.correct > 0;
  }).length;
  const totalWords = (correctList.length + wrongList.length) > 0 ? (correctList.length + wrongList.length) : attempts;
  const correctCount = (correctList.length + wrongList.length) > 0 ? (correctList.length + correctedCount) : correct;
  const rate = totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0;

  return {
    correctWords: correctList.map(x => x.word),
    wrongWords: wrongList.map(x => {
      if (x.hadCorrectThenWrong || (x.lastResult === "wrong" && x.correct > 0)) {
        return `${x.word}(曾對後錯⚠️)`;
      } else if (x.correct > 0) {
        return `${x.word}(已訂正)`;
      } else {
        return x.word;
      }
    }),
    totalWords,
    correctCount,
    rate
  };
}

function _buildExportPayload(d, mode, startDate, endDate) {
  const currentUser = localStorage.getItem("current_user") || "學員";
  const historyList = getCombinedTaskHistory();
  const dailyPracticeMap = (d && d.dailyPractice) || {};
  const practiceDates = Array.isArray(d && d.practiceDates) ? d.practiceDates : [];
  const todayDash = _formatYMDLocal(new Date());

  // 收集所有有紀錄日期
  const activeDateSet = new Set();
  historyList.forEach(item => {
    if (item && item.date) {
      const nd = normalizeDateStr(item.date);
      if (nd) activeDateSet.add(nd);
    }
  });
  if (Array.isArray(window.cachedBackupTaskHistory)) {
    window.cachedBackupTaskHistory.forEach(h => {
      if (h && h.date && h.taskName && h.taskName !== "自主練習" && !String(h.taskName).includes("未指派")) {
        const nd = normalizeDateStr(h.date);
        if (nd) activeDateSet.add(nd);
      }
    });
  }
  Object.keys(dailyPracticeMap).forEach(dateStr => {
    const dp = dailyPracticeMap[dateStr];
    if (dp && (dp.attempts > 0 || (dp.words && Object.keys(dp.words).length > 0))) {
      const nd = normalizeDateStr(dateStr);
      if (nd) activeDateSet.add(nd);
    }
  });
  if (d && d.rawHistory) {
    Object.keys(d.rawHistory).forEach(dateStr => {
      if (d.rawHistory[dateStr] && d.rawHistory[dateStr].a > 0) {
        const nd = normalizeDateStr(dateStr);
        if (nd) activeDateSet.add(nd);
      }
    });
  }
  practiceDates.forEach(dateStr => {
    const nd = normalizeDateStr(dateStr);
    if (nd) {
      const recF = resolveDailyPracticeRecord(nd, d, historyList);
      if (recF && recF.attempts > 0) activeDateSet.add(nd);
    }
  });

  let sDate = normalizeDateStr(startDate) || todayDash;
  let eDate = normalizeDateStr(endDate) || sDate;
  if (sDate > eDate) { const tmp = sDate; sDate = eDate; eDate = tmp; }

  let targetDates = [];
  if (mode === "single" || sDate === eDate) {
    targetDates = [sDate];
  } else {
    const sTime = new Date(sDate.replace(/-/g, "/")).getTime();
    const eTime = new Date(eDate.replace(/-/g, "/")).getTime();
    const daySpan = Math.round((eTime - sTime) / 86400000) + 1;
    if (daySpan <= 14) {
      for (let i = 0; i < daySpan; i++) {
        const cur = new Date(sTime + i * 86400000);
        targetDates.push(_formatYMDLocal(cur));
      }
      targetDates.sort((a, b) => b.localeCompare(a));
    } else {
      targetDates = Array.from(activeDateSet).filter(dt => dt >= sDate && dt <= eDate).sort((a, b) => b.localeCompare(a));
      if (targetDates.length === 0) targetDates = [eDate];
    }
  }

  let periodAttempts = 0;
  let periodCorrect = 0;
  let periodActiveDays = 0;
  let periodTaskDone = 0;
  let periodFreeDays = 0;
  let periodAssigned = 0;
  let periodWrong = 0;
  let periodUnanswered = 0;
  let periodFreeAttempts = 0;
  let periodFreeCorrect = 0;
  let periodTaskAssignedTotal = 0;
  let periodTaskCorrectTotal = 0;

  const dailyRecords = targetDates.map(dt => {
    let tRec = historyList.find(item => normalizeDateStr(item.date) === dt && (!item.taskName || item.taskName !== "自主練習")) || null;
    let isUntestedAssigned = false;
    if (!tRec && Array.isArray(window.cachedBackupTaskHistory)) {
      const bTask = window.cachedBackupTaskHistory.find(h => {
        const hDate = String(h.date || "").trim().split(" ")[0].replace(/\//g, "-");
        return normalizeDateStr(hDate) === dt && h.taskName && h.taskName !== "自主練習" && !String(h.taskName).includes("未指派");
      });
      if (bTask) {
        isUntestedAssigned = true;
        const bWords = Array.isArray(bTask.words) ? bTask.words : [];
        tRec = {
          date: dt,
          taskName: bTask.taskName || bTask.name || "每日指定測驗",
          score: "—",
          rate: "—",
          status: "未受測",
          words: bWords,
          wrongWords: []
        };
      }
    }

    const fRec = resolveDailyPracticeRecord(dt, d, historyList);
    const fInfo = _extractFreeWordsForDate(fRec, d);
    const hasFree = fInfo.totalWords > 0;
    if (hasFree) {
      periodFreeDays++;
      periodFreeAttempts += fInfo.totalWords;
      periodFreeCorrect += fInfo.correctCount;
    }

    let hasTask = false, taskName = "無指派測驗", taskStatus = "無紀錄", taskScore = "—", taskRate = "—";
    let isUnassigned = false;
    let taskCorrectWords = [], taskWrongWords = [];
    let tAtt = 0, tCor = 0;
    let assignedTotWords = 0, actualAnswered = 0, actualWrong = 0, actualUnanswered = 0, hasUnanswered = false, overallScoreRate = 0;
    let unansweredWords = [];

    const dtObj = new Date(String(dt).replace(/-/g, "/"));
    const dayNames = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
    const dayOfWeek = dayNames[dtObj.getDay()] || "";

    if (tRec) {
      taskName = tRec.taskName || "每日指定測驗";
      const rawStatus = String(tRec.status || "已完成");
      isUnassigned = taskName.includes("未指派") || rawStatus.includes("未指派") || taskName.includes("自主練習") || taskName.includes("自由練習");
      const hasLoggedInOrFree = hasFree || (tRec.freeTested > 0) || rawStatus.includes("登入未受測") || rawStatus.includes("登入未作答");

      if (isUnassigned) {
        hasTask = true;
        taskName = "⚪ 未指派";
        taskStatus = hasLoggedInOrFree ? "當日無指派（已自主練習）" : "當日無指派測驗";
        taskScore = "—";
        taskRate = "—";
        taskCorrectWords = [];
        taskWrongWords = [];
      } else {
        hasTask = true;
        const resolved = resolveTaskWords(tRec, dt, d);
        taskCorrectWords = resolved.correctList || [];
        taskWrongWords = resolved.wrongList || [];
        tAtt = parseInt(tRec.attempts) || 0;
        tCor = parseInt(tRec.correct) || 0;
        if (!tAtt && String(tRec.score || "").includes("/")) {
          const sp = String(tRec.score).split("/");
          tCor = parseInt(sp[0]) || 0;
          tAtt = parseInt(sp[1]) || 0;
        }
        if (!tAtt && (taskCorrectWords.length + taskWrongWords.length) > 0) {
          tCor = taskCorrectWords.length;
          tAtt = taskCorrectWords.length + taskWrongWords.length;
        }

        const rawWords = Array.isArray(tRec.words) ? tRec.words : [];
        assignedTotWords = rawWords.length > 0 ? rawWords.length : Math.max(tAtt, (taskCorrectWords.length + taskWrongWords.length) || 5);
        actualAnswered = taskCorrectWords.length + taskWrongWords.length;
        actualWrong = taskWrongWords.length;
        actualUnanswered = Math.max(0, assignedTotWords - actualAnswered);
        overallScoreRate = assignedTotWords > 0 ? Math.round((tCor / assignedTotWords) * 100) : (tAtt > 0 ? Math.round((tCor / tAtt) * 100) : 0);

        const isIncomplete = rawStatus.includes("作答中") || rawStatus.includes("中斷") || rawStatus.includes("未完成") || tRec.inProgress === true;
        const isUntested = isUntestedAssigned || rawStatus.includes("未受測") || (!isIncomplete && !rawStatus.includes("已完成") && (tRec.score === "—" || tRec.score === "尚未開始" || rawStatus.includes("待完成")));

        hasUnanswered = actualUnanswered > 0 && !isUntested;

        if (isUntested) {
          taskStatus = hasLoggedInOrFree ? "登入未受測" : "缺席未受測";
          taskScore = "—";
          taskRate = "—";
          taskCorrectWords = [];
          taskWrongWords = [];
          unansweredWords = rawWords;
        } else if (isIncomplete) {
          taskStatus = `作答中斷 (${tCor}/${assignedTotWords})`;
          taskScore = tRec.score || `${tCor}/${assignedTotWords}`;
          taskRate = `${overallScoreRate}%`;
        } else {
          taskStatus = rawStatus.replace(/^[🟢●⏳🟠🟣🟡🔴\s]+/, "") || "已完成";
          taskScore = `${tCor}/${assignedTotWords}`;
          taskRate = `${overallScoreRate}%`;
          periodTaskDone++;
        }

        periodAssigned += assignedTotWords;
        periodWrong += actualWrong;
        periodUnanswered += actualUnanswered;
        if (!isUntested) {
          periodTaskAssignedTotal += assignedTotWords;
          periodTaskCorrectTotal += tCor;
        }
      }
    }

    const freeAtt = fInfo.totalWords;
    const freeCor = fInfo.correctCount;
    const dayAtt = (tRec ? actualAnswered : 0) + freeAtt;
    const dayCor = tCor + freeCor;
    const dayRate = dayAtt > 0 ? Math.round((dayCor / dayAtt) * 100) : 0;

    if (dayAtt > 0 || hasTask) {
      if (dayAtt > 0) periodActiveDays++;
      periodAttempts += dayAtt;
      periodCorrect += dayCor;
    }

    const taskWrongDetails = taskWrongWords.map(w => ({ word: w, zh: getWordZh(w) || "" }));
    const taskCorrectDetails = taskCorrectWords.map(w => ({ word: w, zh: getWordZh(w) || "" }));
    const unansweredDetails = (unansweredWords || []).map(w => ({ word: w, zh: getWordZh(w) || "" }));
    const freeWrongDetails = (fInfo.wrongWords || []).map(w => ({ word: w, zh: getWordZh(w) || "" }));
    const freeCorrectDetails = (fInfo.correctWords || []).map(w => ({ word: w, zh: getWordZh(w) || "" }));

    return {
      date: dt,
      dayOfWeek,
      totalAttempts: dayAtt,
      totalCorrect: dayCor,
      totalRate: dayRate,
      hasTask,
      isUnassigned,
      taskName,
      taskStatus,
      taskScore,
      taskRate,
      assignedTotWords,
      actualAnswered,
      taskCorrWords: tCor,
      actualWrong,
      actualUnanswered,
      hasUnanswered,
      overallScoreRate,
      taskCorrectWords,
      taskWrongWords,
      taskWrongDetails,
      taskCorrectDetails,
      unansweredWords,
      unansweredDetails,
      hasFree,
      freeAttempts: fInfo.totalWords,
      freeCorrect: fInfo.correctCount,
      freeWrong: Math.max(0, fInfo.totalWords - fInfo.correctCount),
      freeRate: fInfo.rate,
      freeCorrectWords: fInfo.correctWords,
      freeWrongWords: fInfo.wrongWords,
      freeWrongDetails,
      freeCorrectDetails
    };
  });

  const now = new Date();
  const exportTime = `${_formatYMDLocal(now)} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const scopeTitle = (mode === "single" || sDate === eDate) ? `指定日期：${sDate}` : `指定範圍：${sDate} 至 ${eDate}`;
  const fileScopeTag = (mode === "single" || sDate === eDate) ? sDate : `${sDate}_至_${eDate}`;

  // 優先直接讀取上方「整體進度 Progress」卡片呈現之即時權威數值，確保 100% 絕對完全一致
  const domLearn = parseInt(document.getElementById("n-learn")?.textContent || "", 10);
  const domPrac = parseInt(document.getElementById("n-prac")?.textContent || "", 10);
  const domMast = parseInt(document.getElementById("n-mast")?.textContent || "", 10);
  const domCorrect = parseInt(document.getElementById("n-correct")?.textContent || "", 10);
  const domTotal = parseInt(document.getElementById("n-total")?.textContent || "", 10) || 2055;
  const domRate = parseInt((document.getElementById("n-rate")?.textContent || "").replace("%", ""), 10);
  const domScore = parseInt(document.getElementById("n-score")?.textContent || "", 10);
  const domStreak = parseInt(document.getElementById("s-streak")?.textContent || "", 10);

  const fallbackLearn = d ? (d.levels || []).reduce((acc, L) => acc + (L.learn || 0), 0) : 0;
  const fallbackPrac = d ? (d.levels || []).reduce((acc, L) => acc + (L.prac || 0), 0) : 0;
  const fallbackMast = d ? (d.levels || []).reduce((acc, L) => acc + (L.mast || 0), 0) : 0;

  const learnCount = !isNaN(domLearn) ? domLearn : (typeof d?.learn === "number" ? d.learn : fallbackLearn);
  const pracCount = !isNaN(domPrac) ? domPrac : (typeof d?.prac === "number" ? d.prac : fallbackPrac);
  const mastCount = !isNaN(domMast) ? domMast : (typeof d?.mast === "number" ? d.mast : fallbackMast);
  const finalDistinctCorrect = !isNaN(domCorrect) ? domCorrect : ((d && d.distinctCorrect) || (learnCount + pracCount + mastCount));
  const finalTotalVocab = !isNaN(domTotal) ? domTotal : ((d && d.total) || 2055);
  const finalPassRate = !isNaN(domRate) ? domRate : ((d && d.passRate) || Math.round((finalDistinctCorrect / finalTotalVocab) * 100));
  const finalPoints = !isNaN(domScore) ? domScore : ((d && d.points !== undefined) ? d.points : ((d && d.history && d.history.points) || 0));
  const finalStreak = !isNaN(domStreak) ? domStreak : ((d && d.history && d.history.streak) || 0);

  // 指定測驗平均成績：僅計算學校指定測驗（排除自由練習干擾）
  const periodTaskAvgRate = periodTaskAssignedTotal > 0 
    ? Math.round((periodTaskCorrectTotal / periodTaskAssignedTotal) * 100) 
    : 0;

  // 區間整體平均正確率：總答對題數 (指定測驗+自由練習) / 總實際作答題數
  const periodOverallAvgRate = periodAttempts > 0 
    ? Math.round((periodCorrect / periodAttempts) * 100) 
    : 0;

  return {
    studentId: currentUser,
    exportTime,
    mode,
    startDate: sDate,
    endDate: eDate,
    scopeTitle,
    fileScopeTag,
    periodSummary: {
      activeDaysCount: periodActiveDays,
      totalAttempts: periodAttempts,
      totalCorrect: periodCorrect,
      totalAssigned: periodAssigned,
      totalWrong: periodWrong,
      totalUnanswered: periodUnanswered,
      avgRate: periodOverallAvgRate,
      taskAvgRate: periodTaskAvgRate,
      taskAssignedTotal: periodTaskAssignedTotal,
      taskCorrectTotal: periodTaskCorrectTotal,
      taskDoneCount: periodTaskDone,
      freeActiveDays: periodFreeDays,
      freeTotalAttempts: periodFreeAttempts,
      freeTotalCorrect: periodFreeCorrect
    },
    overall: {
      attempts: (d && d.attempts) || 0,
      correct: (d && d.correct) || 0,
      passRate: finalPassRate,
      distinctCorrect: finalDistinctCorrect,
      totalVocab: finalTotalVocab,
      points: finalPoints,
      learn: learnCount,
      prac: pracCount,
      mast: mastCount,
      streak: finalStreak,
      best: (d && d.history && d.history.best) || 0,
      totalDays: (d && d.history && d.history.total) || 0,
      levels: (d && d.levels) ? d.levels.map(L => ({
        level: L.level,
        name: levelName(L.level),
        correct: L.correct || 0,
        tested: L.testedCount || 0,
        rate: L.rate || 0,
        learn: L.learn || 0,
        prac: L.prac || 0,
        mast: L.mast || 0,
        total: L.total || 411
      })) : [],
      modeStats: (d && d.modeStats) || {}
    },
    dailyRecords,
    pendingConquerWords: getWeekPendingConquerWords().map(w => {
      const cleanW = String(w || "").trim().toLowerCase();
      const diag = diagnoseWordMistake(cleanW);
      const zh = getWordZh(cleanW) || "";
      const lv = _resolveConquerWordLevel(cleanW, d);
      return {
        word: cleanW,
        zh,
        level: lv,
        tag: diag.tag,
        desc: diag.desc,
        color: diag.color,
        bg: diag.bg
      };
    })
  };
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (_) {}
  }, 1500);
}

export function _ensureScriptLoaded(globalVar, primaryUrl, fallbackUrl) {
  if (typeof window !== "undefined" && window[globalVar]) return Promise.resolve(window[globalVar]);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = primaryUrl;
    s.onload = () => resolve(window[globalVar]);
    s.onerror = () => {
      if (fallbackUrl) {
        const s2 = document.createElement("script");
        s2.src = fallbackUrl;
        s2.onload = () => resolve(window[globalVar]);
        s2.onerror = () => reject(new Error(`無法載入套件 ${globalVar}`));
        document.head.appendChild(s2);
      } else {
        reject(new Error(`無法載入套件 ${globalVar}`));
      }
    };
    document.head.appendChild(s);
  });
}

function getWordZh(word) {
  if (!word) return "";
  const wLower = String(word).trim().toLowerCase();
  if (!window._wordBankZhMap && Array.isArray(window.WORD_BANK_2000)) {
    window._wordBankZhMap = new Map();
    for (let i = 0; i < window.WORD_BANK_2000.length; i++) {
      window._wordBankZhMap.set(String(window.WORD_BANK_2000[i][0]).toLowerCase(), window.WORD_BANK_2000[i][1]);
    }
  }
  if (window._wordBankZhMap && window._wordBankZhMap.has(wLower)) {
    return window._wordBankZhMap.get(wLower);
  }
  if (window.DICTIONARY && window.DICTIONARY[wLower]) {
    const entry = window.DICTIONARY[wLower];
    return typeof entry === "string" ? entry : (entry.zh || entry.def || "");
  }
  return "";
}

function _generatePedagogicalAdvice(payload) {
  const ps = payload.periodSummary || {};
  const ov = payload.overall || {};
  const avg = ps.avgRate || 0;
  const mast = ov.mast || 0;
  const streak = ov.streak || 0;
  const wrongCount = (payload.uniqueWrongWords || []).length;

  let highlight = "";
  if (avg >= 90) {
    highlight = `該生在評估區間內展現卓越的學習成效，全卷平均正確率高達 ${avg}%，已精通 ${mast} 個核心字彙，聽音辨字與拼寫反應極為敏銳！`;
  } else if (avg >= 80) {
    highlight = `該生單字基礎扎實穩定，全卷平均正確率表現優良（${avg}%），已精通 ${mast} 個核心字彙，整體作答自律且專注。`;
  } else if (avg >= 60) {
    highlight = `該生具備基礎字彙拼讀實力，全卷平均正確率為 ${avg}%。建議每日維持固定複習頻率，以強化單字熟練度。`;
  } else {
    highlight = `該生目前全卷正確率為 ${avg}%，尚有明顯進步空間。建議加強每日測驗的完整作答度，避免中斷提早交卷。`;
  }

  let diagnosis = "";
  if (wrongCount === 0) {
    diagnosis = "本次評估範圍內無任何錯題單字紀錄，各項題型作答穩定度與抗干擾能力極佳！";
  } else {
    diagnosis = `區間內累計出現 ${wrongCount} 個錯題單字，主要特徵包含「形近同音字混淆」及「複合字長字尾拼寫失誤」，建議利用音節分段拆解輔助記憶。`;
  }

  let actionPlan = "";
  if (streak >= 7) {
    actionPlan = `連續學習已達 ${streak} 天，學習毅力令人讚賞！建議持續向進階關卡推進，並定期參加「週末待攻克測驗」以保持滿分紀錄。`;
  } else {
    actionPlan = "建議每週末固定進入「週末待攻克測驗」進行弱點補強，將平日未完成或答錯之單字逐一攻克，穩步邁向 2000 單字全精通！";
  }

  return { highlight, diagnosis, actionPlan };
}

async function _exportRecordToExcel(payload) {
  const fileName = `學習歷程_${payload.studentId}_${payload.fileScopeTag}`;

  // 1. 標準 34 欄欄位標題 (1:1 鏡像對齊試算表學生分頁)
  const defaultHeaders = [
    "備份時間", "完整JSON", "等級", "分數", "連勝", "最佳連勝",
    "學習中", "練習中", "精通", "共答對單字", "累積受測單字", "單字掌握率",
    "LEVEL 1 入門\n(答對/受測字數)", "LEVEL 2 基礎\n(答對/受測字數)",
    "LEVEL 3 進階\n(答對/受測字數)", "LEVEL 4 挑戰\n(答對/受測字數)", "LEVEL 5 精熟\n(答對/受測字數)",
    "🎧 聽與拼\n(答對/受測字數)", "🔤 選拼法\n(答對/受測字數)", "🧩 字母重組\n(答對/受測字數)", "🖍️ 填空陷阱\n(答對/受測字數)",
    "任務名稱", "施測單字數", "作答單字數", "答對單字數", "指定測驗成績", "指定測驗正確率", "練習狀態", "測驗錯題單字",
    "自由練習受測字數", "自由練習答對字數", "自由練習正確率", "自由練習錯題單字",
    "防偽驗證"
  ];

  const headers = (payload.rawSheetHeaders && payload.rawSheetHeaders.length >= 30)
    ? payload.rawSheetHeaders
    : defaultHeaders;

  const extractDateYMD = (ds) => {
    if (!ds) return "";
    if (ds instanceof Date) {
      const y = ds.getFullYear();
      const m = String(ds.getMonth() + 1).padStart(2, "0");
      const d = String(ds.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    const s = String(ds).trim();
    const match = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (match) {
      return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    }
    return "";
  };

  const sDate = payload.startDate;
  const eDate = payload.endDate;
  const isMatchDate = (dt) => {
    const nd = extractDateYMD(dt);
    if (!nd) return false;
    if (payload.mode === "single") return nd === sDate;
    return nd >= sDate && nd <= eDate;
  };

  // 2. 1:1 鏡像提取真實試算表歷程列
  const matchedRows = [];
  const coveredDates = new Set();

  const sourceRows = (Array.isArray(payload.rawSheetData) && payload.rawSheetData.length > 0)
    ? payload.rawSheetData
    : (Array.isArray(window.cachedStudentRawData) && window.cachedStudentRawData.length > 0)
      ? window.cachedStudentRawData
      : (window.cachedStudentExportResp && Array.isArray(window.cachedStudentExportResp.data))
        ? window.cachedStudentExportResp.data
        : [];

  sourceRows.forEach(rawRow => {
    if (!rawRow || rawRow.length === 0) return;
    let r = [...rawRow];
    if (r.length === 35 && !extractDateYMD(r[0]) && extractDateYMD(r[1])) {
      r = r.slice(1);
    }
    const rowDateStr = r[0];
    if (isMatchDate(rowDateStr)) {
      while (r.length < 34) r.push("");
      if (r[25] && typeof r[25] === "string") {
        r[25] = r[25].replace(/^'/, "");
      }
      matchedRows.push(r.slice(0, 34));
      coveredDates.add(extractDateYMD(rowDateStr));
    }
  });

  // 補正未儲存/未寫入之真實活動紀錄（如今日新測驗/自主練習）
  if (Array.isArray(payload.dailyRecords)) {
    payload.dailyRecords.forEach(r => {
      const dKey = extractDateYMD(r.date);
      if (!dKey || !isMatchDate(dKey) || coveredDates.has(dKey)) return;
      coveredDates.add(dKey);

      const ov = payload.overall || {};
      const agent = (payload.effectiveResp && payload.effectiveResp.agentData) || window.cachedStudentAgentData || {};
      const ms = ov.modeStats || agent.mstat || {};

      const curLevel = (agent.level && agent.level.current) || (ov.level) || 1;

      const getLvStr = (lvNum, defaultTot) => {
        if (Array.isArray(ov.levels)) {
          const item = ov.levels.find(x => x.level === lvNum);
          if (item) {
            const corr = (item.correct !== undefined) ? item.correct : ((item.learn || 0) + (item.prac || 0) + (item.mast || 0));
            return `${corr}/${item.total || defaultTot}`;
          }
        }
        return `0/${defaultTot}`;
      };

      const getModStr = (key) => {
        const m = ms[key] || {};
        const c = m.correct !== undefined ? m.correct : (m.c || 0);
        const a = m.attempts !== undefined ? m.attempts : (m.a || 0);
        return `${c}/${a}`;
      };

      const row = new Array(34).fill("");
      row[0] = `${dKey} 23:59:59`;
      row[1] = "";
      row[2] = curLevel;
      row[3] = ov.points || 0;
      row[4] = ov.streak || 0;
      row[5] = ov.best || ov.streak || 0;
      row[6] = ov.learn || 0;
      row[7] = ov.prac || 0;
      row[8] = ov.mast || 0;
      row[9] = ov.distinctCorrect || ((ov.learn || 0) + (ov.prac || 0) + (ov.mast || 0));
      row[10] = ov.attempts || 0;
      row[11] = ov.passRate !== undefined ? `${ov.passRate}%` : "0%";
      row[12] = getLvStr(1, 411);
      row[13] = getLvStr(2, 411);
      row[14] = getLvStr(3, 411);
      row[15] = getLvStr(4, 411);
      row[16] = getLvStr(5, 411);
      row[17] = getModStr("listen");
      row[18] = getModStr("pick");
      row[19] = getModStr("scramble");
      row[20] = getModStr("trap");
      row[21] = r.hasTask ? (r.taskName || "每日指定測驗") : (r.hasFree ? "自主練習" : "⚪ 未指派");
      row[22] = r.hasTask ? (r.assignedTotWords || 0) : "—";
      row[23] = r.hasTask ? (r.actualAnswered || (r.taskCorrWords + r.actualWrong) || 0) : "—";
      row[24] = r.hasTask ? (r.taskCorrWords || 0) : "—";
      row[25] = r.hasTask ? String(r.taskScore || "—").replace(/^'/, "") : "—";
      row[26] = r.hasTask ? (r.taskRate || "—") : "—";
      row[27] = r.hasTask ? (r.taskStatus || "已完成") : (r.hasFree ? "自主練習已完成" : "⚪ 未指派");
      row[28] = (r.taskWrongDetails && r.taskWrongDetails.length > 0) ? r.taskWrongDetails.map(d => d.word).join(", ") : "";
      row[29] = r.hasFree ? (r.freeAttempts || 0) : "—";
      row[30] = r.hasFree ? (r.freeCorrect || 0) : "—";
      row[31] = r.hasFree ? `${r.freeRate || 0}%` : "—";
      row[32] = (r.freeWrongDetails && r.freeWrongDetails.length > 0) ? r.freeWrongDetails.map(d => d.word).join(", ") : "";
      row[33] = "⚪ 系統自驗";
      matchedRows.push(row);
    });
  }

  // 依日期時間倒序排列（新→舊，與試算表 100% 一致）
  matchedRows.sort((a, b) => String(b[0] || "").localeCompare(String(a[0] || "")));

  // 3. 輸出為 Excel (.xlsx) 檔案
  const fullSheetData = [headers, ...matchedRows];

  try {
    const XLSX = await _ensureExternalScript(
      "XLSX",
      "https:\x2F\x2Fcdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js",
      "https:\x2F\x2Fcdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
    );
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(fullSheetData, { cellDates: false });

    // 強制型別防護：比率與代碼（如 3/5, 12/15）強制標記為字串，徹底防止 Excel 自動轉成日期（如 3月5日）
    for (let r = 1; r <= matchedRows.length; r++) {
      for (let c = 0; c < 34; c++) {
        const addr = XLSX.utils.encode_cell({ r: r, c: c });
        const cell = ws[addr];
        if (!cell) continue;

        let val = cell.v;
        if (typeof val === "string") {
          val = val.replace(/^'/, "");
          cell.v = val;
        }

        const isNumericCol = [2, 3, 4, 5, 6, 7, 8, 9, 10, 22, 23, 24, 29, 30].includes(c);
        if (isNumericCol && val !== "" && val !== "—" && !isNaN(Number(val))) {
          cell.t = 'n';
          cell.v = Number(val);
          cell.z = '0';
        } else if ([11, 26, 31].includes(c)) {
          cell.t = 's';
          if (typeof val === "number") {
            cell.v = `${Math.round(val * 100)}%`;
          } else {
            cell.v = String(val ?? "");
          }
          cell.z = '@';
        } else {
          cell.t = 's';
          cell.v = String(val ?? "");
          cell.z = '@';
        }
      }
    }

    // 100% 比照試算表學生分頁的護眼色塊與表頭樣式
    const getHeaderStyle = (colIdx) => {
      let bg = "F1F5F9", fg = "334155";
      if (colIdx === 0) { bg = "F1F5F9"; fg = "334155"; }
      else if (colIdx === 1) { bg = "E2E8F0"; fg = "64748B"; }
      else if (colIdx >= 2 && colIdx <= 5) { bg = "DBEAFE"; fg = "1E40AF"; }
      else if (colIdx >= 6 && colIdx <= 11) { bg = "DCFCE7"; fg = "065F46"; }
      else if (colIdx >= 12 && colIdx <= 16) { bg = "F3E8FF"; fg = "6B21A8"; }
      else if (colIdx >= 17 && colIdx <= 20) { bg = "CCFBF1"; fg = "0F766E"; }
      else if (colIdx >= 21 && colIdx <= 28) { bg = "E0E7FF"; fg = "3730A3"; }
      else if (colIdx >= 29 && colIdx <= 32) { bg = "FEF3C7"; fg = "92400E"; }
      else if (colIdx === 33) { bg = "F1F5F9"; fg = "64748B"; }

      return {
        fill: { fgColor: { rgb: bg } },
        font: { name: "微軟正黑體", sz: 10, bold: true, color: { rgb: fg } },
        alignment: { vertical: "center", horizontal: "center", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "CBD5E1" } },
          bottom: { style: "thin", color: { rgb: "CBD5E1" } },
          left: { style: "thin", color: { rgb: "E2E8F0" } },
          right: { style: "thin", color: { rgb: "E2E8F0" } }
        }
      };
    };

    const range = XLSX.utils.decode_range(ws["!ref"] || `A1:AH${matchedRows.length + 1}`);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: c });
      if (ws[cellAddress]) {
        ws[cellAddress].s = getHeaderStyle(c);
      }
    }

    for (let r = 1; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r: r, c: c });
        if (ws[cellAddress]) {
          ws[cellAddress].s = {
            font: { name: "微軟正黑體", sz: 9.5 },
            alignment: {
              vertical: "center",
              horizontal: (c === 28 || c === 32 || c === 21) ? "left" : "center",
              wrapText: true
            },
            border: {
              top: { style: "thin", color: { rgb: "E2E8F0" } },
              bottom: { style: "thin", color: { rgb: "E2E8F0" } },
              left: { style: "thin", color: { rgb: "F1F5F9" } },
              right: { style: "thin", color: { rgb: "F1F5F9" } }
            }
          };
        }
      }
    }

    // 動態自適應欄寬：精確計算每個欄位內容之顯示長度，確保所有文字完整顯示不被截斷
    const getCellWidth = (val) => {
      if (val === null || val === undefined) return 0;
      const str = String(val);
      let maxLineW = 0;
      str.split("\n").forEach(line => {
        let w = 0;
        for (let i = 0; i < line.length; i++) {
          const code = line.charCodeAt(i);
          // 中文字元、全形標點或 Emoji 佔 2.1 字元寬，ASCII 佔 1.1 字元寬
          if (code > 255 || (code >= 0xD800 && code <= 0xDBFF)) {
            w += 2.1;
          } else {
            w += 1.1;
          }
        }
        if (w > maxLineW) maxLineW = w;
      });
      return maxLineW;
    };

    const colDefs = [];
    for (let c = 0; c < 34; c++) {
      // 唯獨完整 JSON 欄位（索引 1）隱藏起來
      if (c === 1) {
        colDefs.push({ hidden: true, wch: 0 });
        continue;
      }
      let maxW = 0;
      for (let r = 0; r < fullSheetData.length; r++) {
        const w = getCellWidth((fullSheetData[r] || [])[c]);
        if (w > maxW) maxW = w;
      }
      // 給予適度寬裕邊距 (+3.5)，長字串欄位（如錯題單字、任務名稱）上限設 60 搭配 wrapText 完整顯示
      const calculatedWch = Math.min(Math.max(Math.ceil(maxW + 3.5), 10), 60);
      colDefs.push({ wch: calculatedWch });
    }
    ws["!cols"] = colDefs;

    ws["!rows"] = [{ hpt: 38 }];

    const sheetTitle = String(payload.studentId || "歷程紀錄").slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  } catch (err) {
    console.warn("XLSX 輸出失敗，降級輸出 1:1 CSV 鏡像格式:", err);
    const csvContent = "\uFEFF" + fullSheetData.map(row => row.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    triggerBlobDownload(blob, `${fileName}.csv`);
  }
}

function _wrapReportPreviewPaper(innerHtml, payload) {
  return '<div class="summary-embedded" style="padding:4px 2px;">' + innerHtml + '</div>';
}

function _buildReportHtml(payload) {
  const ov = payload.overall;
  const ps = payload.periodSummary;
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lvRowsHtml = (ov.levels || []).map(L => {
    const totCorr = (L.learn || 0) + (L.prac || 0) + (L.mast || 0);
    const color = levelColor(L.level);
    return `
      <tr class="st-level-row" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; padding:5px 0; border-bottom:1px solid #E7E9F5; gap:4px 8px;">
        <td class="st-level-name" style="padding:0; border:none; font-weight:750; color:#232A4D; white-space:nowrap; flex-shrink:0;">
          <span style="color:${color}; font-size:14px; margin-right:4px;">●</span> Level ${L.level}「${esc(L.name)}」
        </td>
        <td class="st-level-stats" style="padding:0; border:none; display:flex; align-items:center; justify-content:flex-end; text-align:right; flex-wrap:wrap;">
          <div class="level-stats-grid" style="display:inline-flex; align-items:center; flex-wrap:wrap; font-size:12.5px; font-variant-numeric:tabular-nums; font-feature-settings:'tnum';">
            <span class="st-item st-learn" style="display:inline-flex; align-items:center; color:#232A4D; font-weight:650; white-space:nowrap;">
              <span class="st-lbl" style="color:#5A6183;">學習中</span>
              <b class="tnum st-num st-num-learn" style="display:inline-block; width:25px; text-align:right; font-weight:800; margin-right:1px; color:#4F46E5;">${L.learn || 0}</b>字
            </span>
            <span class="st-sep" style="display:inline-block; width:14px; text-align:center; color:#94A3B8; font-weight:600; margin:0 3px; user-select:none;">/</span>
            <span class="st-item st-prac" style="display:inline-flex; align-items:center; color:#232A4D; font-weight:650; white-space:nowrap;">
              <span class="st-lbl" style="color:#5A6183;">練習中</span>
              <b class="tnum st-num st-num-prac" style="display:inline-block; width:25px; text-align:right; font-weight:800; margin-right:1px; color:#0369A1;">${L.prac || 0}</b>字
            </span>
            <span class="st-sep" style="display:inline-block; width:14px; text-align:center; color:#94A3B8; font-weight:600; margin:0 3px; user-select:none;">/</span>
            <span class="st-item st-mast" style="display:inline-flex; align-items:center; color:#232A4D; font-weight:650; white-space:nowrap;">
              <span class="st-lbl" style="color:#5A6183;">精通</span>
              <b class="tnum st-num st-num-mast" style="display:inline-block; width:25px; text-align:right; font-weight:800; margin-right:1px; color:#047857;">${L.mast || 0}</b>字
            </span>
            <span class="st-sep" style="display:inline-block; width:14px; text-align:center; color:#94A3B8; font-weight:600; margin:0 3px; user-select:none;">/</span>
            <span class="st-item st-total" style="display:inline-flex; align-items:center; color:#232A4D; font-weight:650; white-space:nowrap;">
              <span class="st-lbl" style="color:#5A6183;">共答對</span>
              <b class="tnum st-num st-num-total" style="display:inline-block; width:25px; text-align:right; font-weight:800; margin-right:1px; color:#D97706;">${totCorr}</b>字
            </span>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  const dailyCardsHtml = payload.dailyRecords.map(r => {
    const isTaskUntested = !r.isUnassigned && r.taskStatus.includes("未受測");

    // 1. 指定測驗 KPI 方塊
    let taskKpiHtml = "";
    if (r.isUnassigned) {
      taskKpiHtml = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
          <div style="background:#F8F9FD; border:1px solid #E2E8F0; border-radius:10px; padding:8px 10px; text-align:center;">
            <div style="font-size:11px; color:#64748B; font-weight:700; margin-bottom:2px;">指派情形</div>
            <div style="font-size:16px; font-weight:800; color:#475569;">當日無指派</div>
          </div>
          <div style="background:#F8F9FD; border:1px solid #E2E8F0; border-radius:10px; padding:8px 10px; text-align:center;">
            <div style="font-size:11px; color:#64748B; font-weight:700; margin-bottom:2px;">作答狀態</div>
            <div style="font-size:16px; font-weight:800; color:#64748B;">${esc(r.taskStatus)}</div>
          </div>
        </div>
      `;
    } else if (isTaskUntested) {
      taskKpiHtml = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
          <div style="background:#F0F9FF; border:1px solid rgba(14,165,233,.25); border-radius:10px; padding:8px 10px; text-align:center;">
            <div style="font-size:11px; color:#0369A1; font-weight:700; margin-bottom:2px;">📋 應測單字數</div>
            <div style="font-size:18px; font-weight:900; color:#0284C7;">${r.assignedTotWords || 5} 字</div>
          </div>
          <div style="background:#FEF2F2; border:1px solid rgba(239,68,68,.25); border-radius:10px; padding:8px 10px; text-align:center;">
            <div style="font-size:11px; color:#B91C1C; font-weight:700; margin-bottom:2px;">測驗狀態</div>
            <div style="font-size:16px; font-weight:800; color:#DC2626;">${esc(r.taskStatus)}</div>
          </div>
        </div>
      `;
    } else {
      taskKpiHtml = `
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; margin-bottom:10px;">
          <div style="background:#F0F9FF; border:1px solid rgba(14,165,233,.25); border-radius:10px; padding:8px 4px; text-align:center;">
            <div style="font-size:10.5px; color:#0369A1; font-weight:700; margin-bottom:2px;">答對 / 已施測</div>
            <div style="font-size:17px; font-weight:900; color:#0284C7;"><span style="color:#0284C7;">${r.taskCorrWords || 0}</span> <span style="font-size:14px; opacity:0.6;">/</span> <span style="color:#0369A1;">${r.assignedTotWords || 5}</span></div>
          </div>
          <div style="background:#F8FAFC; border:1px solid #CBD5E1; border-radius:10px; padding:8px 4px; text-align:center;">
            <div style="font-size:10.5px; color:#475569; font-weight:700; margin-bottom:2px;">答錯 / 未作答</div>
            <div style="font-size:17px; font-weight:900; color:#475569;"><span style="color:#DC2626;">${r.actualWrong || 0}</span> <span style="font-size:14px; opacity:0.6;">/</span> <span style="color:#D97706;">${r.actualUnanswered || 0}</span></div>
          </div>
          <div style="background:#ECFDF5; border:1px solid rgba(16,185,129,.25); border-radius:10px; padding:8px 4px; text-align:center;">
            <div style="font-size:10.5px; color:#047857; font-weight:700; margin-bottom:2px;">作答正確率</div>
            <div style="font-size:17px; font-weight:900; color:#059669;">${r.actualAnswered > 0 ? Math.round(((r.taskCorrWords || 0) / r.actualAnswered) * 100) + '%' : '—'}</div>
          </div>
          <div style="background:#F0FDF4; border:1px solid rgba(34,197,94,.25); border-radius:10px; padding:8px 4px; text-align:center;">
            <div style="font-size:10.5px; color:#15803D; font-weight:700; margin-bottom:2px;">全卷正確率</div>
            <div style="font-size:17px; font-weight:900; color:#16A34A;">${r.overallScoreRate || 0}%</div>
          </div>
        </div>
      `;
    }

    let taskLeftContent = "";
    let taskRightContent = "";
    if (r.isUnassigned) {
      taskLeftContent = `<div style="font-size:12px; color:#64748B; padding:6px 0;">當日老師未指派測驗任務，學生無須受測。</div>`;
      taskRightContent = `<div style="font-size:12px; color:#94A3B8; font-style:italic; padding:6px 0;">（當日無指定單字）</div>`;
    } else if (isTaskUntested) {
      taskLeftContent = `
        <div style="font-size:12px; color:#475569; line-height:1.5; padding:4px 0;">
          <b>${esc(r.taskStatus)}</b>。提醒：未測驗之指定單字將自動排入週末補強測驗。
        </div>
      `;
      taskRightContent = (r.unansweredWords && r.unansweredWords.length > 0)
        ? r.unansweredWords.map(w => `<span style="display:inline-block; padding:4px 8px; margin:2px; border-radius:6px; background:#F1F5F9; color:#475569; border:1px solid #CBD5E1; font-size:12px; font-weight:700;">${esc(w)}</span>`).join("")
        : `<span style="font-size:12px; color:#94A3B8; font-style:italic;">（待測單字清單載入中）</span>`;
    } else {
      taskLeftContent = (r.taskCorrectWords && r.taskCorrectWords.length > 0)
        ? r.taskCorrectWords.map(w => `<span style="display:inline-block; padding:4px 8px; margin:2px; border-radius:6px; background:#E4F7EE; color:#047857; border:1px solid rgba(47,180,124,.35); font-size:12px; font-weight:700;">${esc(w)}</span>`).join("")
        : `<span style="font-size:12px; color:#94A3B8; font-style:italic;">（本次測驗無答對單字）</span>`;

      if (r.taskWrongWords && r.taskWrongWords.length > 0) {
        taskRightContent = r.taskWrongWords.map(w => `<span style="display:inline-block; padding:4px 8px; margin:2px; border-radius:6px; background:#FFE9E9; color:#D64545; border:1px solid rgba(255,107,107,.4); font-size:12px; font-weight:700;">${esc(w)}</span>`).join("");
      } else {
        taskRightContent = `<span style="display:inline-block; font-size:12px; font-weight:800; color:#065F46; background:#ECFDF5; border:1px solid #A7F3D0; padding:4px 10px; border-radius:8px;">🎉 全數答對，無答錯單字！</span>`;
      }
    }

    let freeKpiHtml = "";
    if (r.hasFree) {
      freeKpiHtml = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
          <div style="background:#F0F9FF; border:1px solid rgba(14,165,233,.25); border-radius:10px; padding:8px 10px; text-align:center;">
            <div style="font-size:11px; color:#0369A1; font-weight:700; margin-bottom:2px;">答對單字數 / 施測單字數</div>
            <div style="font-size:18px; font-weight:900; color:#0284C7;">${r.freeCorrect || 0} <span style="font-size:14px; opacity:0.6;">/</span> ${r.freeAttempts || 0}</div>
          </div>
          <div style="background:#ECFDF5; border:1px solid rgba(16,185,129,.25); border-radius:10px; padding:8px 10px; text-align:center;">
            <div style="font-size:11px; color:#047857; font-weight:700; margin-bottom:2px;">正確率</div>
            <div style="font-size:18px; font-weight:900; color:#059669;">${r.freeRate || 0}%</div>
          </div>
        </div>
      `;
    } else {
      freeKpiHtml = `
        <div style="background:#F8FAFC; border:1px dashed #CBD5E1; border-radius:10px; padding:12px 14px; text-align:center; color:#64748B; font-size:12.5px; font-weight:700; margin-bottom:8px;">
          當日尚無自由練習紀錄
        </div>
      `;
    }

    let freeLeftContent = "";
    let freeRightContent = "";
    if (r.hasFree) {
      freeLeftContent = (r.freeCorrectWords && r.freeCorrectWords.length > 0)
        ? r.freeCorrectWords.map(w => `<span style="display:inline-block; padding:4px 8px; margin:2px; border-radius:6px; background:#E4F7EE; color:#047857; border:1px solid rgba(47,180,124,.35); font-size:12px; font-weight:700;">${esc(w)}</span>`).join("")
        : `<span style="font-size:12px; color:#94A3B8; font-style:italic;">（當日尚無全對單字）</span>`;

      if (r.freeWrongWords && r.freeWrongWords.length > 0) {
        freeRightContent = r.freeWrongWords.map(w => `<span style="display:inline-block; padding:4px 8px; margin:2px; border-radius:6px; background:#FFE9E9; color:#D64545; border:1px solid rgba(255,107,107,.4); font-size:12px; font-weight:700;">${esc(w)}</span>`).join("");
      } else {
        freeRightContent = `<span style="display:inline-block; font-size:12px; font-weight:800; color:#065F46; background:#ECFDF5; border:1px solid #A7F3D0; padding:4px 10px; border-radius:8px;">🎉 太棒了！當日自由練習全數答對，無任何答錯單字！</span>`;
      }
    }

    return `
      <div style="border:1.5px solid #E7E9F5; border-radius:16px; padding:14px 16px; margin-bottom:14px; background:#FFFFFF; page-break-inside:avoid; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid #E7E9F5; padding-bottom:8px; margin-bottom:12px;">
          <div style="font-size:14.5px; font-weight:900; color:#232A4D;">📅 日期：${esc(r.date)} (${esc(r.dayOfWeek)})</div>
          <div style="font-size:12px; font-weight:800; color:#6C4CE0; background:#F1EDFF; padding:3px 10px; border-radius:999px; border:1px solid rgba(108,76,224,0.3);">
            當日總計答對 ${r.totalCorrect} / ${r.totalAttempts} 字 · 正確率 ${r.totalRate}%
          </div>
        </div>

        <!-- 1. 平日指定測驗作答紀錄 -->
        <div style="border:1px solid #E2E8F0; border-radius:12px; padding:12px 14px; background:#F8FAFD; margin-bottom:12px;">
          <div style="font-size:13px; font-weight:800; color:#232A4D; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <span>📝 ${esc(r.isUnassigned ? "當日無指定測驗" : (r.taskName || "平日指定測驗作答紀錄"))}</span>
            <span style="font-size:12px; color:${r.isUnassigned ? '#64748B' : (isTaskUntested ? '#DC2626' : '#0284C7')}; font-weight:800;">
              ${r.isUnassigned ? '無指派' : (isTaskUntested ? '未受測' : `得分：${esc(r.taskScore)} (${esc(r.taskRate)})`)}
            </span>
          </div>
          ${taskKpiHtml}
          ${(!r.isUnassigned) ? `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div style="background:#F0F9FF; border:1px solid rgba(14,165,233,.35); border-radius:10px; padding:10px 12px; min-height:85px;">
                <div style="font-size:12px; font-weight:800; color:#0284C7; margin-bottom:6px;"><span style="color:#10B981; font-weight:900; margin-right:4px;">✔</span>答對的單字 (${(r.taskCorrectWords || []).length} 字)</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px;">${taskLeftContent}</div>
              </div>
              <div style="background:#F8FAFC; border:1px solid #CBD5E1; border-radius:10px; padding:10px 12px; min-height:85px;">
                <div style="font-size:12px; font-weight:800; color:#475569; margin-bottom:6px;">❌ 答錯的單字 (${(r.taskWrongWords || []).length} 字)</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px;">${taskRightContent}</div>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- 2. 自由練習作答紀錄 -->
        <div style="border:1px solid #E2E8F0; border-radius:12px; padding:12px 14px; background:#F8FAFD;">
          <div style="font-size:13px; font-weight:800; color:#232A4D; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <span>🎮 自由練習成果</span>
            ${r.hasFree ? `<span style="font-size:12px; color:#0284C7; font-weight:800;">答對 ${r.freeCorrect} / ${r.freeAttempts} 字 (${r.freeRate}%)</span>` : ''}
          </div>
          ${freeKpiHtml}
          ${r.hasFree ? `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div style="background:#F0F9FF; border:1px solid rgba(14,165,233,.35); border-radius:10px; padding:10px 12px; min-height:85px;">
                <div style="font-size:12px; font-weight:800; color:#0284C7; margin-bottom:6px;"><span style="color:#10B981; font-weight:900; margin-right:4px;">✔</span>答對的單字 (${(r.freeCorrectWords || []).length} 字)</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px;">${freeLeftContent}</div>
              </div>
              <div style="background:#F8FAFC; border:1px solid #CBD5E1; border-radius:10px; padding:10px 12px; min-height:85px;">
                <div style="font-size:12px; font-weight:800; color:#475569; margin-bottom:6px;">❌ 答錯的單字 (${(r.freeWrongWords || []).length} 字)</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px;">${freeRightContent}</div>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join("");

  const conquerList = payload.pendingConquerWords || [];
  let conquerSectionHtml = "";
  if (conquerList.length === 0) {
    conquerSectionHtml = `
      <div style="border:1px solid #C7F1DC; border-radius:12px; padding:10px 14px; margin-bottom:14px; background:#F0FDF4; page-break-inside:avoid;">
        <div style="font-size:13px; font-weight:800; color:#166534; display:flex; justify-content:space-between; align-items:center;">
          <span>🎯 本期待攻克單字庫（0 字）</span>
          <span style="font-size:11px; background:#DCFCE7; color:#15803D; padding:2px 8px; border-radius:999px; font-weight:800;">🎉 太棒了！目前全數攻克</span>
        </div>
        <div style="font-size:12px; color:#166534; margin-top:4px;">
          平時指定測驗的錯題皆已完全掌握，或已在自由練習中即時答對並全數消滅！請繼續保持！
        </div>
      </div>
    `;
  } else {
    const conquerItemsHtml = conquerList.map(w => {
      return `
        <div style="display:inline-flex; align-items:center; background:#FFF; border:1px solid #FECACA; border-radius:8px; padding:4px 8px; margin:3px 4px 3px 0; font-size:11.5px; vertical-align:middle;">
          <span style="font-weight:800; color:#1E293B; margin-right:4px;">${esc(w.word)}</span>
          ${w.zh ? `<span style="color:#64748B; font-size:11px; margin-right:6px;">(${esc(w.zh)})</span>` : ""}
          <span style="font-size:10px; font-weight:700; color:${w.color || '#E11D48'}; background:${w.bg || 'rgba(255,107,107,0.14)'}; padding:1px 6px; border-radius:999px;">${esc(w.tag || '拼寫弱點')}</span>
        </div>
      `;
    }).join("");

    conquerSectionHtml = `
      <div style="border:1px solid #FECDD3; border-radius:12px; padding:10px 14px; margin-bottom:14px; background:#FFF1F2; page-break-inside:avoid;">
        <div style="font-size:13px; font-weight:800; color:#9F1239; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
          <span>🎯 本期待攻克單字庫（共 ${conquerList.length} 字）</span>
          <span style="font-size:11px; background:#FFE4E6; color:#BE123C; padding:2px 8px; border-radius:999px; font-weight:800;">平日錯題累積 · 自由練習答對可自動消除</span>
        </div>
        <div style="font-size:11.5px; color:#881337; margin-bottom:8px; line-height:1.4;">
          💡 <b>複習提示</b>：以下單字源自平日指定測驗錯題。學生在平日自由練習中只要拼對該單字，即可自動從待攻克庫中消滅；週六日的週末消滅戰也會集中複習此清單！
        </div>
        <div style="background:#FFF; border:1px solid #FFE4E6; border-radius:8px; padding:8px 10px;">
          ${conquerItemsHtml}
        </div>
      </div>
    `;
  }

  return `
        <div id="pdf-export-paper" style="width:100%; max-width:720px; margin:0 auto; background:#FFFFFF; color:#232A4D; padding:8px 8px; font-family:ui-rounded,'SF Pro Rounded','PingFang TC','Microsoft JhengHei',sans-serif; line-height:1.45; box-sizing:border-box;">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2.5px solid #6C4CE0; padding-bottom:8px; margin-bottom:8px;">
        <div>
          <div style="font-size:18px; font-weight:900; color:#232A4D;">🎯 拼字小特工 · 學生使用與作答紀錄報表</div>
          <div style="font-size:12px; color:#5A6183; font-weight:700; margin-top:2px;">${esc(payload.scopeTitle)}</div>
        </div>
        <div style="text-align:right; font-size:11.5px; color:#5A6183; font-weight:700;">
          <div>👤 學生帳號：<b style="color:#6C4CE0; font-size:13px;">${esc(payload.studentId)}</b></div>
          <div>🕒 匯出時間：${esc(payload.exportTime)}</div>
        </div>
      </div>

      <!-- 區間統計摘要 -->
      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:8px;">
        <div style="background:#F8F9FD; border:1px solid #E7E9F5; border-radius:8px; padding:6px 6px; text-align:center;">
          <div style="font-size:10.5px; color:#5A6183; font-weight:700;">📅 區間練習天數</div>
          <div style="font-size:16px; font-weight:900; color:#6C4CE0;">${ps.activeDaysCount} 天</div>
        </div>
        <div style="background:#F8F9FD; border:1px solid #E7E9F5; border-radius:8px; padding:6px 6px; text-align:center;">
          <div style="font-size:10.5px; color:#5A6183; font-weight:700;">✍️ 區間施測單字數</div>
          <div style="font-size:16px; font-weight:900; color:#0284C7;">${ps.totalAttempts} 字</div>
        </div>
        <div style="background:#F8F9FD; border:1px solid #E7E9F5; border-radius:8px; padding:6px 6px; text-align:center;">
          <div style="font-size:10.5px; color:#5A6183; font-weight:700;">✅ 區間答對單字數</div>
          <div style="font-size:16px; font-weight:900; color:#2FB47C;">${ps.totalCorrect} 字</div>
        </div>
        <div style="background:#F8F9FD; border:1px solid #E7E9F5; border-radius:8px; padding:6px 6px; text-align:center;">
          <div style="font-size:10.5px; color:#5A6183; font-weight:700;">📊 區間平均正確率</div>
          <div style="font-size:16px; font-weight:900; color:${ps.avgRate >= 80 ? '#1E9A66' : '#E8892B'};">${ps.avgRate}%</div>
        </div>
      </div>

      <!-- 整體進度 Progress 獨立方塊（比照遊戲網頁整體進度） -->
      <div style="border:1.5px solid #E7E9F5; border-radius:12px; padding:8px 10px; margin-bottom:8px; background:#FFFFFF; page-break-inside:avoid; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
        <div style="font-size:13.5px; font-weight:800; color:#232A4D; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
          <span>整體進度 Progress</span>
        </div>
        <!-- 三色三階熟練度進度條 -->
        <div style="height:14px; border-radius:8px; background:#E8EBF5; overflow:hidden; display:flex; border:1.5px solid rgba(35,42,77,0.12); margin-bottom:6px; box-sizing:border-box;">
          <div style="width:${Math.min(100, Math.max(0, ((ov.learn || 0) / (ov.totalVocab || 2055) * 100)))}%; height:100%; background:linear-gradient(90deg, #6366F1, #818CF8);"></div>
          <div style="width:${Math.min(100, Math.max(0, ((ov.prac || 0) / (ov.totalVocab || 2055) * 100)))}%; height:100%; background:linear-gradient(90deg, #0284C7, #38BDF8);"></div>
          <div style="width:${Math.min(100, Math.max(0, ((ov.mast || 0) / (ov.totalVocab || 2055) * 100)))}%; height:100%; background:linear-gradient(90deg, #10B981, #34D399);"></div>
        </div>
        <!-- 圖例與指標說明 -->
        <div style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:#5A6183;">
          <div style="display:flex; align-items:center; gap:14px; font-weight:700;">
            <span style="display:inline-flex; align-items:center; gap:5px;"><i style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#6366F1;"></i>學習中 <b style="color:#4F46E5; font-size:13px;">${ov.learn || 0}</b></span>
            <span style="display:inline-flex; align-items:center; gap:5px;"><i style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#0284C7;"></i>練習中 <b style="color:#0284C7; font-size:13px;">${ov.prac || 0}</b></span>
            <span style="display:inline-flex; align-items:center; gap:5px;"><i style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#10B981;"></i>精通 <b style="color:#059669; font-size:13px;">${ov.mast || 0}</b></span>
          </div>
          <div style="display:flex; align-items:center; gap:8px; font-weight:700; color:#232A4D; padding-top:3px; border-top:1px dashed #E7E9F5;">
            <span>答對 <b style="color:#D97706; font-size:13px;">${ov.distinctCorrect || ((ov.learn || 0) + (ov.prac || 0) + (ov.mast || 0))}</b> 字，共 <b style="color:#D97706; font-size:13px;">${ov.totalVocab || 2055}</b> 字，掌握率 <b style="color:#D97706; font-size:13px;">${ov.passRate || 0}%</b></span>
            <span style="color:#CBD5E1;">/</span>
            <span>獲得 <b style="color:#D97706; font-size:13px;">${ov.points || 0}</b> 分</span>
          </div>
        </div>
        <div style="font-size:11px; color:#9AA0BD; margin-top:6px; line-height:1.4;">
          熟練度定義：<b>學習中</b>＝答對 1 次 · <b>練習中</b>＝連續答對 2 次 · <b>精通</b>＝連續答對 3 次（答錯會退回「學習中」）
        </div>
      </div>

      <!-- 各關卡進度（比照整體進度版型） -->
      <div style="border:1.5px solid #E7E9F5; border-radius:12px; padding:8px 10px; margin-bottom:8px; background:#FFFFFF; page-break-inside:avoid; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
        <div style="font-size:13.5px; font-weight:800; color:#232A4D; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid #E7E9F5; padding-bottom:6px;">
          <span>📊 各關卡進度</span>
          <span style="font-size:12px; color:#5A6183; font-weight:700;">全書掌握 ${ov.distinctCorrect} 字 / 2055 字（掌握率 ${ov.passRate}%）</span>
        </div>
        <table class="sumtable" style="width:100%; border-collapse:collapse; font-size:12.5px;">
          ${lvRowsHtml}
        </table>
      </div>

      <!-- 🎯 本期待攻克單字庫 -->
      ${conquerSectionHtml}

      <!-- 每日使用紀錄明細 -->
      <div style="font-size:13.5px; font-weight:800; color:#232A4D; margin-bottom:8px;">📋 每日使用與作答紀錄明細（共 ${payload.dailyRecords.length} 日）</div>
      ${dailyCardsHtml}
    </div>
  `;
}

async function _exportRecordToImage(payload) {
  const fileName = `拼字小特工_學習歷程_${payload.studentId}_${payload.fileScopeTag}.png`;
  const reportHtml = _wrapReportPreviewPaper(_buildReportHtml(payload), payload);
  const overlay = document.createElement("div");
  overlay.id = "image-export-temp-overlay";
  overlay.style.cssText = "position:fixed;left:-9999px;top:0;width:760px;z-index:-1;background:#FFFFFF;padding:16px;box-sizing:border-box;";
  overlay.innerHTML = reportHtml;
  document.body.appendChild(overlay);

  try {
    const html2pdfLib = await _ensureScriptLoaded(
      "html2pdf",
      "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js",
      "https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js"
    );
    const h2c = window.html2canvas || (typeof html2canvas !== "undefined" ? html2canvas : null) || await _ensureScriptLoaded(
      "html2canvas",
      "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
      "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"
    );
    const targetEl = overlay.querySelector(".summary-embedded") || overlay.firstElementChild || overlay;
    const canvas = await h2c(targetEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#FFFFFF",
      scrollY: 0,
      windowWidth: 760
    });

    await new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          triggerBlobDownload(blob, fileName);
        }
        resolve();
      }, "image/png");
    });
  } finally {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }
}

async function _exportRecordToPdf(payload) {
  const fileName = `拼字小特工_使用紀錄_${payload.studentId}_${payload.fileScopeTag}.pdf`;
  const reportHtml = _buildReportHtml(payload);
  const overlay = document.createElement("div");
  overlay.id = "pdf-export-temp-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(20,24,38,0.82);display:flex;flex-direction:column;align-items:center;overflow:auto;padding:20px;";
  overlay.innerHTML = `
    <div style="color:#FFFFFF;font-weight:800;font-size:14px;margin-bottom:12px;background:#6C4CE0;padding:8px 18px;border-radius:999px;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
      ⏳ 正在產生 PDF 報表並準備下載，請稍候...
    </div>
    ${reportHtml}
  `;
  document.body.appendChild(overlay);

  try {
    const html2pdfLib = await _ensureScriptLoaded(
      "html2pdf",
      "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js",
      "https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js"
    );
    const paperEl = overlay.querySelector("#pdf-export-paper");
    const opt = {
      margin: [8, 8, 8, 8],
      filename: fileName,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#FFFFFF", scrollY: 0 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] }
    };
    let downloaded = false;
    try {
      const pdfBlob = await html2pdfLib().set(opt).from(paperEl).outputPdf("blob");
      if (pdfBlob && pdfBlob.size > 0) {
        triggerBlobDownload(pdfBlob, fileName);
        downloaded = true;
      }
    } catch (blobErr) {
      console.warn("outputPdf blob failed, falling back to .save():", blobErr);
    }
    if (!downloaded) {
      await html2pdfLib().set(opt).from(paperEl).save();
    }
  } finally {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }
}

export function initExportRecordsCard(getSummaryFn) {
  if (typeof getSummaryFn === "function") _latestSummaryGetter = getSummaryFn;
  const sec = document.getElementById("export-records-section");
  if (!sec) return;

  const todayDash = _formatYMDLocal(new Date());
  const d7 = new Date(); d7.setDate(d7.getDate() - 6);
  const sevenDaysAgo = _formatYMDLocal(d7);
  const d30 = new Date(); d30.setDate(d30.getDate() - 27);
  const thirtyDaysAgo = _formatYMDLocal(d30);

  const btnModeSingle = document.getElementById("btn-export-mode-single");
  const btnModeRange = document.getElementById("btn-export-mode-range");
  const leftSingleInput = document.getElementById("export-single-date");
  const leftStartInput = document.getElementById("export-start-date");
  const rightCell = document.getElementById("export-right-date-cell");
  const presetsRow = document.getElementById("export-presets-row");
  const inputSingle = leftSingleInput;
  const inputStart = leftStartInput;
  const inputEnd = document.getElementById("export-end-date");
  const formatSelect = document.getElementById("export-format-select");
  const btnDlImage = document.getElementById("btn-export-download-image");
  const btnDlPdf = document.getElementById("btn-export-download-pdf");
  const statusMsg = document.getElementById("export-status-msg");

  if (inputSingle && !inputSingle.value) {
    const recPicker = document.getElementById("record-date-picker");
    inputSingle.value = (recPicker && recPicker.value) ? recPicker.value : todayDash;
    inputSingle.max = todayDash;
  }
  if (inputStart && !inputStart.value) { inputStart.value = sevenDaysAgo; inputStart.max = todayDash; }
  if (inputEnd && !inputEnd.value) { inputEnd.value = todayDash; inputEnd.max = todayDash; }

  if (sec.__exportBound) return;
  sec.__exportBound = true;

  const toggleBtn = document.getElementById("btn-toggle-export-card");
  const navCard = document.getElementById("export-navigator-card") || sec.querySelector(".export-navigator-card");
  if (toggleBtn && navCard) {
    toggleBtn.onclick = (e) => {
      e.preventDefault();
      const isHidden = (navCard.style.display === "none") || sec.classList.contains("is-collapsed");
      if (isHidden) {
        navCard.style.display = "flex";
        sec.classList.remove("is-collapsed");
        toggleBtn.innerHTML = "收合";
        navCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        navCard.style.display = "none";
        sec.classList.add("is-collapsed");
        toggleBtn.innerHTML = "展開";
      }
    };
  }

  let currentMode = "single";
  const setExportMode = (m) => {
    currentMode = (m === "range") ? "range" : "single";
    if (btnModeSingle) btnModeSingle.classList.toggle("active", currentMode === "single");
    if (btnModeRange) btnModeRange.classList.toggle("active", currentMode === "range");
    if (leftSingleInput) leftSingleInput.style.display = (currentMode === "single") ? "block" : "none";
    if (leftStartInput) leftStartInput.style.display = (currentMode === "range") ? "block" : "none";
    if (rightCell) {
      rightCell.style.visibility = (currentMode === "range") ? "visible" : "hidden";
      rightCell.style.pointerEvents = (currentMode === "range") ? "auto" : "none";
    }
    if (presetsRow) {
      presetsRow.style.visibility = (currentMode === "range") ? "visible" : "hidden";
      presetsRow.style.opacity = (currentMode === "range") ? "1" : "0";
      presetsRow.style.pointerEvents = (currentMode === "range") ? "auto" : "none";
    }
    if (currentMode === "single" && leftSingleInput && leftStartInput && !leftSingleInput.value) {
      leftSingleInput.value = leftStartInput.value || todayDash;
    } else if (currentMode === "range" && leftStartInput && leftSingleInput && !leftStartInput.value) {
      leftStartInput.value = leftSingleInput.value || sevenDaysAgo;
    }
  };

  setExportMode("single");

  if (btnModeSingle) btnModeSingle.onclick = () => setExportMode("single");
  if (btnModeRange) btnModeRange.onclick = () => setExportMode("range");

  const presetBtns = [
    document.getElementById("btn-export-preset-today"),
    document.getElementById("btn-export-preset-7d"),
    document.getElementById("btn-export-preset-30d"),
    document.getElementById("btn-export-preset-all")
  ].filter(Boolean);

  const setActivePresetBtn = (targetBtn) => {
    presetBtns.forEach(b => {
      b.classList.remove("active", "today-btn");
    });
    if (targetBtn) targetBtn.classList.add("active");
  };

  const btnPresetToday = document.getElementById("btn-export-preset-today");
  if (btnPresetToday) {
    btnPresetToday.onclick = () => {
      setActivePresetBtn(btnPresetToday);
      if (inputStart) inputStart.value = todayDash;
      if (inputEnd) inputEnd.value = todayDash;
    };
  }
  const btnPreset7d = document.getElementById("btn-export-preset-7d");
  if (btnPreset7d) {
    btnPreset7d.onclick = () => {
      setActivePresetBtn(btnPreset7d);
      setExportMode("range");
      if (inputStart) inputStart.value = sevenDaysAgo;
      if (inputEnd) inputEnd.value = todayDash;
    };
  }
  const btnPreset30d = document.getElementById("btn-export-preset-30d");
  if (btnPreset30d) {
    btnPreset30d.onclick = () => {
      setActivePresetBtn(btnPreset30d);
      setExportMode("range");
      if (inputStart) inputStart.value = thirtyDaysAgo;
      if (inputEnd) inputEnd.value = todayDash;
    };
  }
  const btnPresetAll = document.getElementById("btn-export-preset-all");
  if (btnPresetAll) {
    btnPresetAll.onclick = () => {
      setActivePresetBtn(btnPresetAll);
      setExportMode("range");
      const d = _latestSummaryGetter ? _latestSummaryGetter() : null;
      const hist = getCombinedTaskHistory();
      let earliest = thirtyDaysAgo;
      hist.forEach(item => {
        const nd = item && item.date ? normalizeDateStr(item.date) : "";
        if (nd && nd < earliest) earliest = nd;
      });
      if (d && d.dailyPractice) {
        Object.keys(d.dailyPractice).forEach(k => {
          const nd = normalizeDateStr(k);
          if (nd && nd < earliest) earliest = nd;
        });
      }
      if (d && d.rawHistory) {
        Object.keys(d.rawHistory).forEach(k => {
          const nd = normalizeDateStr(k);
          if (nd && nd < earliest) earliest = nd;
        });
      }
      if (inputStart) inputStart.value = earliest;
      if (inputEnd) inputEnd.value = todayDash;
    };
  }

  const runDownload = async (fmt) => {
    if (formatSelect && fmt) formatSelect.value = fmt;
    const chosenFmt = fmt || (formatSelect ? formatSelect.value : "pdf");
    const d = _latestSummaryGetter ? _latestSummaryGetter() : null;
    const sDate = (currentMode === "single")
      ? (inputSingle && inputSingle.value ? inputSingle.value : todayDash)
      : (inputStart && inputStart.value ? inputStart.value : sevenDaysAgo);
    const eDate = (currentMode === "single")
      ? sDate
      : (inputEnd && inputEnd.value ? inputEnd.value : todayDash);

    const payload = _buildExportPayload(d, currentMode, sDate, eDate);

    if (btnDlImage) btnDlImage.disabled = true;
    if (btnDlPdf) btnDlPdf.disabled = true;
    if (statusMsg) {
      statusMsg.innerHTML = `⏳ 正在產生 <b>長圖格式 (PNG)</b> 作答歷程記錄檔案（${payload.scopeTitle}），請稍候...`;
    }

    try {
      await _exportRecordToImage(payload);
      if (statusMsg) {
        statusMsg.innerHTML = `✅ 已成功下載 <b>長圖格式 (PNG)</b> 作答歷程記錄（${payload.scopeTitle}）！`;
      }
    } catch (err) {
      console.error("Export error:", err);
      if (statusMsg) {
        statusMsg.innerHTML = `⚠️ 匯出時發生錯誤：${err.message || "請稍後再試"}`;
      }
    } finally {
      if (btnDlImage) btnDlImage.disabled = false;
      if (btnDlPdf) btnDlPdf.disabled = false;
    }
  };

  if (btnDlImage) btnDlImage.onclick = () => runDownload();
  if (btnDlPdf) btnDlPdf.onclick = () => runDownload();

  // 網頁長幅檢視預覽事件綁定
  const btnPreviewWeb = document.getElementById("btn-export-preview-web");
  const btnCloseWeb = document.getElementById("btn-close-web-preview");
  const previewContainer = document.getElementById("export-web-preview-container");
  const previewBody = document.getElementById("export-web-preview-body");

  if (btnPreviewWeb) {
    btnPreviewWeb.onclick = () => {
      const d = _latestSummaryGetter ? _latestSummaryGetter() : null;
      const sDate = (currentMode === "single")
        ? (inputSingle && inputSingle.value ? inputSingle.value : todayDash)
        : (inputStart && inputStart.value ? inputStart.value : sevenDaysAgo);
      const eDate = (currentMode === "single")
        ? sDate
        : (inputEnd && inputEnd.value ? inputEnd.value : todayDash);

      const payload = _buildExportPayload(d, currentMode, sDate, eDate);
      if (previewBody) {
        previewBody.innerHTML = _wrapReportPreviewPaper(_buildReportHtml(payload), payload);
      }
      if (previewContainer) {
        previewContainer.style.display = "block";
        previewContainer.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
  }
  if (btnCloseWeb && previewContainer) {
    btnCloseWeb.onclick = () => {
      previewContainer.style.display = "none";
    };
  }
}

// ---------- quiz (placement & challenge) ----------
