// =====================================================================
// ui_export.js — 底部作答歷程紀錄匯出下載模組 (Excel / PDF / A4 報表)
// =====================================================================
import { escapeHtml } from "./wordbank.js";
import { normalizeDateStr, formatDateYMD, box, getRawStat, getRawBox } from "./store.js";
import { levelColor, levelName } from "./levels.js";
import { diagnoseWordMistake } from "./diagnostics.js";
import { getBiweeklyFailedFinalBossWords } from "./ui_weak_words.js";
import {
  resolveWordStr,
  isValidEnglishWordStr,
  getCombinedTaskHistory,
  resolveTaskWords,
  resolveDailyPracticeRecord
} from "./ui_summary.js";
import {
  getWeekPendingConquerWords,
  _resolveConquerWordLevel
} from "./ui_conquer.js";

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

  const taskByDateMap = new Map();
  for (let i = 0; i < historyList.length; i++) {
    const item = historyList[i];
    if (item && item.date && (!item.taskName || item.taskName !== "自主練習")) {
      const nd = normalizeDateStr(item.date);
      if (nd && !taskByDateMap.has(nd)) taskByDateMap.set(nd, item);
    }
  }
  const backupTaskByDateMap = new Map();
  if (Array.isArray(window.cachedBackupTaskHistory)) {
    for (let i = 0; i < window.cachedBackupTaskHistory.length; i++) {
      const h = window.cachedBackupTaskHistory[i];
      if (h && h.date && h.taskName && h.taskName !== "自主練習" && !String(h.taskName).includes("未指派")) {
        const nd = normalizeDateStr(String(h.date).trim().split(" ")[0].replace(/\//g, "-"));
        if (nd && !backupTaskByDateMap.has(nd)) backupTaskByDateMap.set(nd, h);
      }
    }
  }

  const dailyRecords = targetDates.map(dt => {
    let tRec = taskByDateMap.get(dt) || null;
    let isUntestedAssigned = false;
    if (!tRec) {
      const bTask = backupTaskByDateMap.get(dt);
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

    let hasTask = false, taskName = "⚪ 未指派", taskStatus = hasFree ? "當日無指派（已自主練習）" : "當日無指派測驗", taskScore = "—", taskRate = "—";
    let isUnassigned = true;
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
    finalBossWords: typeof getBiweeklyFailedFinalBossWords === "function" ? getBiweeklyFailedFinalBossWords() : [],
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
  if (typeof window !== "undefined" && window.__WORDS && window.__WORDS._byWord) {
    const wObj = window.__WORDS._byWord.get(wLower);
    if (wObj && wObj.zh) return wObj.zh;
  }
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
  return '<div class="summary-embedded" style="padding:4px 2px; background:transparent; color:var(--ink, #232A4D); width:100%; box-sizing:border-box;">' + innerHtml + '</div>';
}

function _buildReportHtml(payload) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const getTier = (r) => (r >= 100 ? 'tier-6' : (r >= 90 ? 'tier-5' : (r >= 80 ? 'tier-4' : (r >= 70 ? 'tier-3' : (r >= 60 ? 'tier-2' : (r > 0 ? 'tier-1' : 'tier-0'))))));

  const dailyCardsHtml = payload.dailyRecords.map(r => {
    const isTaskUntested = !r.isUnassigned && String(r.taskStatus || "").includes("未受測");

    // 格式化任務標題 (與學習足跡完全一致)
    const cleanDateSlash = String(r.date || "").trim().split(" ")[0].replace(/-/g, "/");
    let formattedTaskName = "";
    const isWeekend = (function(ds) {
      if (!ds) return false;
      const d = new Date(ds.replace(/-/g, "/"));
      return d.getDay() === 0 || d.getDay() === 6;
    })(r.date);

    if (isWeekend) {
      const isBoss = String(r.taskName || "").includes("雙週") || (typeof getBiweeklyCycleInfo === "function" && getBiweeklyCycleInfo(r.date).isBiweeklyBossWeek);
      formattedTaskName = `🎯 ${cleanDateSlash} ${isBoss ? "雙週指定單字大消滅戰" : "週末待攻克測驗"}作答紀錄`;
    } else {
      let cleanTaskName = String(r.taskName || "平日指定測驗").trim().replace(/^[📝📑s]+/, "");
      cleanTaskName = cleanTaskName.replace(/指定單字隨堂測驗/g, "平日指定測驗作答紀錄").replace(/隨堂測驗/g, "測驗結果");
      if (!cleanTaskName || cleanTaskName === "指定測驗" || cleanTaskName === "指定測驗作答紀錄" || cleanTaskName === "平日指定測驗") {
        formattedTaskName = `📝 ${cleanDateSlash} 平日指定測驗作答紀錄`;
      } else {
        formattedTaskName = `📝 ${cleanDateSlash} ${cleanTaskName}`;
      }
    }

    // 1. 指定測驗卡片
    let taskCardHtml = "";
    if (r.isUnassigned) {
      taskCardHtml = `
        <div class="task-empty-notice-box" style="margin-top:6px;">
          <div class="task-empty-notice-icon" style="font-size:24px; margin-bottom:4px; line-height:1;">☕</div>
          <div class="task-empty-notice-title" style="font-size:13px; font-weight:700; color:var(--ink2, #475569); margin-bottom:4px;">該日未指派指定測驗（${esc(r.date)}）</div>
          <div class="task-empty-notice-desc" style="font-size:11.5px; margin-top:2px; color:var(--ink3, #94A3B8); max-width:380px; margin-left:auto; margin-right:auto; line-height:1.5;">老師當日未指派指定測驗</div>
        </div>
      `;
    } else if (isTaskUntested) {
      const unansWords = (r.unansweredWords && r.unansweredWords.length > 0) ? r.unansweredWords : (r.taskWrongWords || []);
      const unansTags = unansWords.length > 0
        ? unansWords.map(w => `<span class="word-pill-tag neutral" onclick="event.stopPropagation(); if (typeof speakMasteredWord === 'function') speakMasteredWord('${esc(w).replace(/'/g, "\\\'")}');" style="cursor:pointer;" title="點擊聆聽發音">${esc(w)}</span>`).join("")
        : `<span style="font-size:12px; color:var(--ink3, #94A3B8); font-style:italic;">（待測單字清單載入中）</span>`;

      taskCardHtml = `
        <div class="task-history-card" style="height:auto !important; overflow:visible !important; margin-bottom:8px;">
          <div class="task-history-header">
            <div>
              <span class="task-card-title task-title-assigned">${esc(formattedTaskName)}</span>
            </div>
          </div>
          <div class="task-score-grid">
            <div class="task-score-item">
              <div class="task-score-label">應測單字數</div>
              <div class="task-score-val" style="color:#0284C7; font-weight:800;">
                <span>${r.assignedTotWords || 5}</span>
                <span style="font-size:13px; font-weight:700; color:var(--ink3, #94A3B8); margin-left:4px;">字</span>
              </div>
            </div>
            <div class="task-score-item">
              <div class="task-score-label">作答狀態</div>
              <div class="task-score-val" style="color:#059669; font-size:14.5px; font-weight:800;">📴 當日無登入受測紀錄</div>
            </div>
          </div>
          <div class="word-split-grid grid-2">
            <div class="word-split-box untested-box">
              <div class="word-split-title untested-title"><span class="card-icon-slot">📋</span><span>本次應測單字範圍 (${unansWords.length} 字)</span></div>
              <div class="word-split-content">
                <div class="word-split-tags-grid">${unansTags}</div>
              </div>
            </div>
            <div class="word-split-box advice-box">
              <div class="word-split-title advice-title"><span class="card-icon-slot">💡</span><span>測驗狀態說明</span></div>
              <div class="word-split-content" style="font-size:12.5px; line-height:1.55; color:var(--ink2, #475569); padding:4px 0;">
                <b>${esc(r.taskStatus || "缺席未受測")}</b>。該生當日尚未進行本次指定測驗，未測驗單字將自動排入週末弱點補強測驗。
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      const corrList = r.taskCorrectWords || [];
      const wrgList = r.taskWrongWords || [];
      const unansList = r.unansweredWords || [];
      const corrTags = corrList.length > 0
        ? corrList.map(w => `<span class="word-pill-tag correct" onclick="event.stopPropagation(); if (typeof speakMasteredWord === 'function') speakMasteredWord('${esc(w).replace(/'/g, "\\\'")}');" style="cursor:pointer;" title="點擊聆聽發音">${esc(w)}</span>`).join("")
        : `<span style="font-size:12px; color:var(--ink3, #94A3B8); font-style:italic;">（本次測驗無答對單字）</span>`;
      let wrgPillsHtml = wrgList.length > 0
        ? wrgList.map(w => `<span class="word-pill-tag wrong" onclick="event.stopPropagation(); if (typeof speakMasteredWord === 'function') speakMasteredWord('${esc(w).replace(/'/g, "\\\'")}');" style="cursor:pointer;" title="點擊聆聽發音">${esc(w)}</span>`).join("")
        : `<span style="font-size:12px; color:var(--ink3, #94A3B8); font-style:italic;">（受測題目無答錯）</span>`;

      let unansAccordionHtml = "";
      if (unansList.length > 0) {
        const unansPills = unansList.map(w => `<span class="word-pill-tag neutral" onclick="event.stopPropagation(); if (typeof speakMasteredWord === 'function') speakMasteredWord('${esc(w).replace(/'/g, "\\\'")}');" style="cursor:pointer;" title="未作答單字">${esc(w)}</span>`).join("");
        unansAccordionHtml = `
          <div style="${wrgList.length > 0 ? 'margin-top:10px; padding-top:8px; border-top:1px dashed var(--line, rgba(148,163,184,0.25));' : 'margin-top:6px;'} width:100%;">
            <div style="display:flex; align-items:center; font-size:12px; font-weight:700; color:var(--ink2, #475569); padding:4px 0; gap:6px; width:100%; white-space:nowrap;">
              <span class="card-icon-slot">⏳</span>
              <span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">未作答的單字 (${unansList.length} 字)</span>
            </div>
            <div class="word-split-tags-grid" style="margin-top:4px; box-sizing:border-box;">
              ${unansPills}
            </div>
          </div>
        `;
      }

      const ovrRate = parseInt(r.overallScoreRate !== undefined ? r.overallScoreRate : r.taskRate, 10) || 0;
      const ansCount = (r.taskCorrWords || 0) + (r.actualWrong || 0);
      const unansCount = r.actualUnanswered !== undefined ? r.actualUnanswered : Math.max(0, (r.assignedTotWords || 5) - ansCount);
      const wrgCount = r.actualWrong || 0;
      const totalWords = (r.assignedTotWords || (ansCount + unansCount));

      let bottomTagsHtml = "";
      if (wrgCount === 0 && unansCount === 0) {
        bottomTagsHtml = `<span class="tpc-tag-perfect">全數答對無失分</span>`;
      } else {
        const tagParts = [];
        if (wrgCount > 0) tagParts.push(`<span class="tpc-tag-wrong">${wrgCount} 題答錯</span>`);
        if (unansCount > 0) tagParts.push(`<span class="tpc-tag-unans">${unansCount} 題未作答</span>`);
        bottomTagsHtml = tagParts.join(" · ");
      }

      taskCardHtml = `
        <div class="task-history-card" style="height:auto !important; overflow:visible !important; margin-bottom:8px;">
          <div class="task-history-header">
            <div>
              <span class="task-card-title task-title-assigned">${esc(formattedTaskName)}</span>
            </div>
          </div>
          <div style="margin-bottom:8px; width:100%;">
            <div class="task-progress-card">
              <div class="tpc-title">📝 答對 <b>${r.taskCorrWords || 0}</b> / ${totalWords} 字</div>
              <div class="tpc-right">
                ${bottomTagsHtml ? `<span class="tpc-stats">${bottomTagsHtml}</span>` : ""}
                <span class="tpc-rate-badge ${getHeatmapRateClass(ovrRate)}">${ovrRate}% 答對率</span>
              </div>
            </div>
          </div>
          <div class="word-split-grid grid-2">
            <div class="word-split-box correct-box">
              <div class="word-split-title correct-title"><span class="card-icon-slot">✔</span><span>答對的單字 (${corrList.length} 字)</span></div>
              <div class="word-split-content">
                <div class="word-split-tags-grid">${corrTags}</div>
              </div>
            </div>
            <div class="word-split-box wrong-box">
              <div class="word-split-title wrong-title"><span class="card-icon-slot">✖</span><span>答錯的單字 (${wrgList.length} 字)</span></div>
              <div class="word-split-content">
                <div style="display:flex; flex-direction:column; width:100%;">
                  <div class="word-split-tags-grid">${wrgPillsHtml}</div>
                  ${unansAccordionHtml}
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // 2. 自由練習卡片
    let freeCardHtml = "";
    if (r.hasFree) {
      const fCorrList = r.freeCorrectWords || [];
      const fWrgList = r.freeWrongWords || [];
      const fCorrTags = fCorrList.length > 0
        ? fCorrList.map(w => `<span class="word-pill-tag correct" onclick="event.stopPropagation(); if (typeof speakMasteredWord === 'function') speakMasteredWord('${esc(w).replace(/'/g, "\\\'")}');" style="cursor:pointer;" title="點擊聆聽發音">${esc(w)}</span>`).join("")
        : `<span style="font-size:12px; color:var(--ink3, #94A3B8); font-style:italic;">（當日尚無全對單字）</span>`;
      const fWrgTags = fWrgList.length > 0
        ? fWrgList.map(w => {
            const isHadCW = w.includes("(曾對後錯⚠️)");
            const isCorr = w.includes("(已訂正)");
            const cleanWord = w.replace(/\(曾對後錯⚠️\)|\(已訂正\)/g, "");
            if (isHadCW) {
              return `<span class="word-pill-tag warning" onclick="event.stopPropagation(); if (typeof speakMasteredWord === 'function') speakMasteredWord('${esc(cleanWord).replace(/'/g, "\\\'")}');" style="border:1.5px dashed #f59e0b; background:rgba(245,158,11,0.1); color:#b45309; cursor:pointer;" title="當日曾答對，但後續作答時答錯 (點擊聆聽發音)">${esc(cleanWord)} <small style="font-size:10px; font-weight:700;">(曾對後錯⚠️)</small></span>`;
            } else if (isCorr) {
              return `<span class="word-pill-tag correct" onclick="event.stopPropagation(); if (typeof speakMasteredWord === 'function') speakMasteredWord('${esc(cleanWord).replace(/'/g, "\\\'")}');" style="border:1.5px dashed var(--green, #10B981); cursor:pointer;" title="當日曾答錯，已訂正答對 (點擊聆聽發音)">${esc(cleanWord)} <small style="font-size:10px; opacity:0.85;">(已訂正)</small></span>`;
            }
            return `<span class="word-pill-tag wrong" onclick="event.stopPropagation(); if (typeof speakMasteredWord === 'function') speakMasteredWord('${esc(cleanWord).replace(/'/g, "\\\'")}');" style="cursor:pointer;" title="點擊聆聽發音">${esc(cleanWord)}</span>`;
          }).join("")
        : "";

      const fRate = parseInt(r.freeRate, 10) || 0;
      freeCardHtml = `
        <div class="task-history-card" style="height:auto !important; overflow:visible !important; margin-bottom:8px;">
          <div class="task-history-header">
            <div>
              <span class="task-card-title task-title-free">🧭 自由練習成果</span>
            </div>
          </div>
          <div class="task-score-grid">
            <div class="task-score-subgrid" style="display:grid; grid-template-columns:repeat(2,1fr); gap:6px; width:100%; box-sizing:border-box; height:60px;">
              <div class="task-score-item score-corr-item" style="display:flex; flex-direction:column; justify-content:center;">
                <div class="task-score-label" style="font-size:11px;">答對</div>
                <div class="task-score-val task-score-num-corr">${r.freeCorrect || 0}</div>
              </div>
              <div class="task-score-item score-wrong-item" style="display:flex; flex-direction:column; justify-content:center;">
                <div class="task-score-label" style="font-size:11px;">答錯</div>
                <div class="task-score-val task-score-num-wrong">${Math.max(0, (r.freeAttempts || 0) - (r.freeCorrect || 0))}</div>
              </div>
            </div>
            <div class="task-score-item rate-tier-item ${getTier(fRate)}" style="display:flex; flex-direction:column; justify-content:center;">
              <div class="task-score-label" style="font-size:11px;">全卷正確率</div>
              <div class="task-score-val heat-rate-val ${getTier(fRate)}" style="font-size:22px; font-weight:800; line-height:1.2;">
                ${fRate}%
              </div>
            </div>
          </div>
          <div class="word-split-grid grid-2">
            <div class="word-split-box correct-box">
              <div class="word-split-title correct-title"><span class="card-icon-slot">✔</span><span>答對的單字 (${fCorrList.length} 字)</span></div>
              <div class="word-split-content">
                <div class="word-split-tags-grid">${fCorrTags}</div>
              </div>
            </div>
            <div class="word-split-box wrong-box">
              <div class="word-split-title wrong-title"><span class="card-icon-slot">✖</span><span>答錯的單字 (${fWrgList.length} 字)</span></div>
              <div class="word-split-content">
                <div class="word-split-tags-grid">${fWrgTags}</div>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      freeCardHtml = `
        <div class="task-empty-notice-box" style="margin-top:6px;">
          <div class="task-empty-notice-icon" style="font-size:24px; margin-bottom:4px; line-height:1;">🧭</div>
          <div class="task-empty-notice-title" style="font-size:13px; font-weight:700; color:var(--ink2, #475569); margin-bottom:4px;">該指定日期尚無自由練習受測紀錄</div>
          <div class="task-empty-notice-desc" style="font-size:11.5px; margin-top:2px; color:var(--ink3, #94A3B8); max-width:380px; margin-left:auto; margin-right:auto; line-height:1.5;">學生當日未進行自由練習闖關</div>
        </div>
      `;
    }

    return `
      <div class="daily-footprint-block" style="border:1.5px solid var(--line, #E7E9F5); border-radius:14px; padding:12px 14px; margin-bottom:14px; background:var(--card, #FFFFFF); color:var(--ink, #232A4D); page-break-inside:avoid; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:6px; border-bottom:1px solid var(--line, #E7E9F5);">
          <div style="font-size:14px; font-weight:800; color:var(--ink, #232A4D);">
            📅 日期：${esc(r.date)} (${esc(r.dayOfWeek)})
          </div>
          <div style="font-size:11.5px; font-weight:800; color:var(--violet, #6C4CE0); background:rgba(108,76,224,0.08); padding:2px 10px; border-radius:999px;">
            當日總計答對 ${r.totalCorrect} / ${r.totalAttempts} 字 · 正確率 ${r.totalRate}%
          </div>
        </div>

        ${taskCardHtml}
        <div style="margin-top:10px;"></div>
        ${freeCardHtml}
      </div>
    `;
  }).join("");

  return `
    <div id="pdf-export-paper" style="width:100%; max-width:720px; margin:0 auto; color:var(--ink, #232A4D); line-height:1.45; box-sizing:border-box;">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid var(--line, #E7E9F5); padding-bottom:8px; margin-bottom:12px;">
        <div style="font-size:14.5px; font-weight:900; color:var(--ink, #232A4D); display:flex; align-items:center; gap:6px;">
          <span>📜 學習足跡歷程檔案</span>
          <span style="font-size:11.5px; font-weight:700; color:var(--violet, #6C4CE0); background:rgba(108,76,224,0.08); padding:2px 8px; border-radius:999px;">${esc(payload.scopeTitle)}</span>
        </div>
        <div style="font-size:12px; color:var(--ink3, #64748B); font-weight:700;">
          學員帳號：<b style="color:var(--violet, #6C4CE0);">${esc(payload.studentId)}</b>
        </div>
      </div>
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

  const leftStartInput = document.getElementById("export-start-date");
  const rightCell = document.getElementById("export-right-date-cell");
  const presetsRow = document.getElementById("export-presets-row");
  const inputStart = leftStartInput;
  const inputEnd = document.getElementById("export-end-date");
  const formatSelect = document.getElementById("export-format-select");
  const btnDlImage = document.getElementById("btn-export-download-image");
  const btnDlPdf = document.getElementById("btn-export-download-pdf");
  const statusMsg = document.getElementById("export-status-msg");

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
        sec.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        navCard.style.display = "none";
        sec.classList.add("is-collapsed");
        toggleBtn.innerHTML = "展開";
      }
    };
  }

  const currentMode = "range";

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
      if (inputStart) inputStart.value = sevenDaysAgo;
      if (inputEnd) inputEnd.value = todayDash;
    };
  }
  const btnPreset30d = document.getElementById("btn-export-preset-30d");
  if (btnPreset30d) {
    btnPreset30d.onclick = () => {
      setActivePresetBtn(btnPreset30d);
      if (inputStart) inputStart.value = thirtyDaysAgo;
      if (inputEnd) inputEnd.value = todayDash;
    };
  }
  const btnPresetAll = document.getElementById("btn-export-preset-all");
  if (btnPresetAll) {
    btnPresetAll.onclick = () => {
      setActivePresetBtn(btnPresetAll);
      const d = _latestSummaryGetter ? _latestSummaryGetter() : null;
      let earliest = todayDash;
      const considerDate = (dtStr) => {
        const nd = normalizeDateStr(dtStr);
        if (nd && /^\d{4}-\d{2}-\d{2}$/.test(nd)) {
          if (!earliest || nd < earliest) earliest = nd;
        }
      };
      const hist = getCombinedTaskHistory();
      if (Array.isArray(hist)) hist.forEach(item => item && considerDate(item.date));
      if (Array.isArray(window.cachedBackupTaskHistory)) window.cachedBackupTaskHistory.forEach(item => item && considerDate(item.date));
      if (d && d.dailyPractice) Object.keys(d.dailyPractice).forEach(considerDate);
      if (d && d.rawHistory) Object.keys(d.rawHistory).forEach(considerDate);
      try {
        const u = localStorage.getItem("current_user");
        if (u) {
          const uHist = localStorage.getItem(`history_${u}`);
          if (uHist) {
            const parsed = JSON.parse(uHist);
            if (parsed && typeof parsed === "object") Object.keys(parsed).forEach(considerDate);
          }
          const uDp = localStorage.getItem(`daily_practice_${u}`);
          if (uDp) {
            const parsedDp = JSON.parse(uDp);
            if (parsedDp && typeof parsedDp === "object") Object.keys(parsedDp).forEach(considerDate);
          }
        }
      } catch (_) {}

      if (inputStart) inputStart.value = earliest || todayDash;
      if (inputEnd) inputEnd.value = todayDash;
    };
  }

  const runDownload = async (fmt) => {
    if (formatSelect && fmt) formatSelect.value = fmt;
    const chosenFmt = fmt || (formatSelect ? formatSelect.value : "pdf");
    const d = _latestSummaryGetter ? _latestSummaryGetter() : null;
    const sDate = (inputStart && inputStart.value) ? inputStart.value : sevenDaysAgo;
    const eDate = (inputEnd && inputEnd.value) ? inputEnd.value : todayDash;

    const payload = _buildExportPayload(d, currentMode, sDate, eDate);

    if (btnDlImage) btnDlImage.disabled = true;
    if (btnDlPdf) btnDlPdf.disabled = true;
    if (statusMsg) {
      statusMsg.innerHTML = `⏳ 正在產生 <b>長圖格式 (PNG)</b> 作答歷程記錄檔案（${escapeHtml(payload.scopeTitle)}），請稍候...`;
    }

    try {
      await _exportRecordToImage(payload);
      if (statusMsg) {
        statusMsg.innerHTML = `✅ 已成功下載 <b>長圖格式 (PNG)</b> 作答歷程記錄（${escapeHtml(payload.scopeTitle)}）！`;
      }
    } catch (err) {
      console.error("Export error:", err);
      if (statusMsg) {
        statusMsg.innerHTML = `⚠️ 匯出時發生錯誤：${escapeHtml(err.message || "請稍後再試")}`;
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

function _normalizeWordStat(st) {
  if (!st || typeof st !== "object") return { correct: 0, wrong: 0 };
  const correct = (st.correct !== undefined) ? (Number(st.correct) || 0) : (Number(st.c) || 0);
  const wrong = (st.wrong !== undefined)
    ? (Number(st.wrong) || 0)
    : (st.w !== undefined ? (Number(st.w) || 0) : Math.max(0, (Number(st.a) || 0) - correct));
  return { correct, wrong };
}

function _buildCleanWordSummaryHtml(payload, d, sourceMode = "all") {
  const wordMap = new Map();
  const addWord = (w, isCorrect, isTask = true) => {
    const rawW = (w && typeof w === "object") ? (w.word || w.w || "") : w;
    const clean = String(rawW || "").trim().toLowerCase();
    if (!clean) return;
    if (sourceMode === "task" && !isTask) return;
    if (sourceMode === "free" && isTask) return;
    if (!wordMap.has(clean)) {
      wordMap.set(clean, { word: clean, correct: 0, wrong: 0 });
    }
    const entry = wordMap.get(clean);
    if (isCorrect) entry.correct++;
    else entry.wrong++;
  };

  const seenDates = new Set();
  const rows = Array.isArray(payload && payload.dailyRows) ? payload.dailyRows : [];
  rows.forEach(r => {
    if (r.date) seenDates.add(r.date);
    (r.taskCorrectWords || []).forEach(w => addWord(w, true, true));
    (r.taskWrongWords || []).forEach(w => addWord(w, false, true));
    (r.freeCorrectWords || []).forEach(w => addWord(w, true, false));
    (r.freeWrongWords || []).forEach(w => addWord(w, false, false));
    if ((!r.taskCorrectWords || r.taskCorrectWords.length === 0) && Array.isArray(r.taskCorrectDetails)) {
      r.taskCorrectDetails.forEach(w => addWord(w, true, true));
    }
    if ((!r.taskWrongWords || r.taskWrongWords.length === 0) && Array.isArray(r.taskWrongDetails)) {
      r.taskWrongDetails.forEach(w => addWord(w, false, true));
    }
    if ((!r.freeCorrectWords || r.freeCorrectWords.length === 0) && Array.isArray(r.freeCorrectDetails)) {
      r.freeCorrectDetails.forEach(w => addWord(w, true, false));
    }
    if ((!r.freeWrongWords || r.freeWrongWords.length === 0) && Array.isArray(r.freeWrongDetails)) {
      r.freeWrongDetails.forEach(w => addWord(w, false, false));
    }
  });

  if (sourceMode !== "free") {
    const sBound = (payload && payload.startDate) ? payload.startDate : "";
    const eBound = (payload && payload.endDate) ? payload.endDate : "";
    const datesWithTaskWords = new Set(
      rows.filter(r => (r.taskCorrectWords && r.taskCorrectWords.length > 0) || (r.taskWrongWords && r.taskWrongWords.length > 0)).map(r => r.date)
    );
    const hist = getCombinedTaskHistory();
    hist.forEach(rec => {
      if (!rec || !rec.date) return;
      const nd = normalizeDateStr(rec.date);
      if (!nd || datesWithTaskWords.has(nd)) return;
      if (sBound && nd < sBound) return;
      if (eBound && nd > eBound) return;
      const tName = String(rec.taskName || "");
      const tStat = String(rec.status || "");
      if (tName.includes("未指派") || tStat.includes("未指派") || tName.includes("自主練習") || tName.includes("自由練習")) return;
      const parseWordList = (val) => {
        if (Array.isArray(val)) return val;
        if (typeof val === "string" && val.trim()) return val.split(/[,，\s]+/).filter(Boolean);
        return [];
      };
      const cw = parseWordList(rec.correctWords);
      const ww = parseWordList(rec.wrongWords);
      if (cw.length > 0 || ww.length > 0) {
        cw.forEach(w => addWord(w, true, true));
        ww.forEach(w => addWord(w, false, true));
      } else {
        const res = resolveTaskWords(rec, nd, d);
        (res.correctList || []).forEach(w => addWord(w, true, true));
        (res.wrongList || []).forEach(w => addWord(w, false, true));
      }
    });
  }

  if (d && d.dailyPractice) {
    const sBound = (payload && payload.startDate) ? payload.startDate : "";
    const eBound = (payload && payload.endDate) ? payload.endDate : "";
    const datesWithFreeWords = new Set(
      rows.filter(r => (r.freeCorrectWords && r.freeCorrectWords.length > 0) || (r.freeWrongWords && r.freeWrongWords.length > 0)).map(r => r.date)
    );
    Object.keys(d.dailyPractice).forEach(dt => {
      const nd = normalizeDateStr(dt);
      if (!nd || datesWithFreeWords.has(nd)) return;
      if (sBound && nd < sBound) return;
      if (eBound && nd > eBound) return;
      const dp = d.dailyPractice[dt];
      if (dp && dp.words) {
        Object.keys(dp.words).forEach(w => {
          const { correct: wCor, wrong: wWrg } = _normalizeWordStat(dp.words[w]);
          for (let i = 0; i < wCor; i++) addWord(w, true, false);
          for (let i = 0; i < wWrg; i++) addWord(w, false, false);
        });
      }
    });
  }

  const statObj = (d && d.stat) ? d.stat : (typeof getRawStat === "function" ? getRawStat() : {});
  if (sourceMode === "all" && statObj && typeof statObj === "object") {
    Object.keys(statObj).forEach(k => {
      const st = statObj[k];
      if (!st) return;
      const resolved = resolveWordStr(k, d);
      const clean = String(resolved || "").trim().toLowerCase();
      if (!clean || !isValidEnglishWordStr(clean) || wordMap.has(clean)) return;
      const { correct: wCor, wrong: wWrg } = _normalizeWordStat(st);
      if (wCor > 0 || wWrg > 0) {
        wordMap.set(clean, { word: clean, correct: wCor, wrong: wWrg });
      }
    });
  }

  const wordsRef = (d && d.words) ? d.words : (typeof window !== "undefined" ? window.__WORDS : null);
  const getZhDef = (w) => {
    let obj = null;
    if (wordsRef) {
      if (wordsRef._byWord && wordsRef._byWord.has(w)) obj = wordsRef._byWord.get(w);
      else if (Array.isArray(wordsRef)) obj = wordsRef.find(x => x && x.word === w);
    }
    if (obj && obj.zh) return String(obj.zh).replace(/^[a-zA-Z\.\s\/]+?[\s\.\．]+/, "").trim();
    return "—";
  };

  const wordToId = new Map();
  if (Array.isArray(wordsRef)) {
    for (let i = 0; i < wordsRef.length; i++) {
      const w = wordsRef[i];
      if (w && w.word && w.id) wordToId.set(String(w.word).trim().toLowerCase(), w.id);
    }
  }
  const rawBoxObj = (d && d.box && typeof d.box === "object") ? d.box : (typeof getRawBox === "function" ? getRawBox() : {});
  const getBoxLevel = (wId, wStr) => {
    const v = (wId && rawBoxObj[wId]) || rawBoxObj[wStr];
    if (v !== undefined) return Number(v) || 0;
    return (typeof box === "function") ? Number((wId && box(wId)) || box(wStr) || 0) : 0;
  };
  const list = Array.from(wordMap.values()).map(item => {
    const total = item.correct + item.wrong;
    const isWeak = item.wrong > 0 && item.wrong >= item.correct;
    const wId = wordToId.get(item.word) || (wordsRef && wordsRef._byWord && wordsRef._byWord.get(item.word)?.id);
    const b = getBoxLevel(wId, item.word);
    let status = "wrong";
    if (b >= 3) status = "mastered";
    else if (b === 2) status = "practicing";
    else if (b === 1 || item.correct > 0) status = "learning";
    if (item.correct === 0 && item.wrong > 0) status = "wrong";
    return { ...item, total, isWeak, status };
  }).sort((a, b) => {
    const order = { wrong: 0, learning: 1, practicing: 2, mastered: 3 };
    return (order[a.status] - order[b.status]) || (b.wrong - a.wrong) || a.word.localeCompare(b.word);
  });

  const masteredCount = list.filter(x => x.status === "mastered").length;
  const practicingCount = list.filter(x => x.status === "practicing").length;
  const learningCount = list.filter(x => x.status === "learning").length;
  const wrongCount = list.filter(x => x.status === "wrong").length;
  const totalCorrect = list.reduce((s, x) => s + x.correct, 0);
  const totalAttempts = list.reduce((s, x) => s + x.total, 0);
  const acc = totalAttempts > 0 ? ((totalCorrect / totalAttempts) * 100).toFixed(1) : "0.0";

  const statusBadge = (st) => {
    if (st === "mastered") return `<span style="display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; color:#047857; background:rgba(16,185,129,0.12); padding:2px 8px; border-radius:999px;"><span style="width:6px; height:6px; border-radius:50%; background:#10b981;"></span>精通</span>`;
    if (st === "practicing") return `<span style="display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; color:#1d4ed8; background:rgba(59,130,246,0.12); padding:2px 8px; border-radius:999px;"><span style="width:6px; height:6px; border-radius:50%; background:#3b82f6;"></span>練習中</span>`;
    if (st === "learning") return `<span style="display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; color:#6d28d9; background:rgba(139,92,246,0.12); padding:2px 8px; border-radius:999px;"><span style="width:6px; height:6px; border-radius:50%; background:#8b5cf6;"></span>學習中</span>`;
    return `<span style="display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; color:#dc2626; background:rgba(239,68,68,0.12); padding:2px 8px; border-radius:999px;"><span style="width:6px; height:6px; border-radius:50%; background:#ef4444;"></span>待加強</span>`;
  };

  const rowsHtml = list.length === 0
    ? `<tr><td colspan="3" style="text-align:center; padding:24px; color:var(--ink3); font-size:13px;">此日期區間尚無單字作答紀錄</td></tr>`
    : list.map(x => `
      <tr class="clean-vocab-row" data-word="${escapeHtml(x.word)}" data-status="${x.status}" style="border-bottom:1px solid var(--line, #E7E9F5);">
        <td style="padding:10px 8px; font-weight:700; color:var(--ink, #232A4D); font-size:13.5px;">${escapeHtml(x.word)}</td>
        <td style="padding:10px 8px; font-variant-numeric:tabular-nums; font-size:13px; white-space:nowrap;">
          <span style="color:var(--good, #10b981); font-weight:700;">${x.correct}</span>
          <span style="color:var(--ink3, #94a3b8); margin:0 3px;">/</span>
          <span style="color:var(--bad, #ef4444); font-weight:700;">${x.wrong}</span>
        </td>
        <td style="padding:10px 8px; white-space:nowrap;">
          ${statusBadge(x.status)}
        </td>
      </tr>
    `).join("");

  const srcBtnStyle = (m) => {
    const isAct = sourceMode === m;
    return `padding:5px 11px; border-radius:8px; border:none; background:${isAct ? "var(--card, #fff)" : "transparent"}; color:${isAct ? "var(--violet, #6C4CE0)" : "var(--ink2, #475569)"}; box-shadow:${isAct ? "0 1px 4px rgba(15,23,42,0.08)" : "none"}; font-size:12px; font-weight:700; cursor:pointer; transition:all 0.15s; white-space:nowrap;`;
  };
  const segBtn = (st, label, count, color) => {
    const isZero = st !== "all" && count === 0;
    const isAct = st === "all";
    const base = "flex:1 1 auto; min-width:fit-content; padding:7px 10px; border-radius:9px; border:none; font-size:12.5px; font-weight:700; transition:all 0.15s; text-align:center; white-space:nowrap;";
    const actStyle = isAct ? `background:var(--card, #fff); color:${color}; box-shadow:0 2px 6px rgba(15,23,42,0.08);` : `background:transparent; color:${isZero ? "var(--ink3, #94a3b8)" : "var(--ink2, #475569)"}; opacity:${isZero ? "0.45" : "1"};`;
    return `<button type="button" class="clean-status-pill${isAct ? " active" : ""}" data-status="${st}" data-color="${color}" ${isZero ? "disabled" : ""} style="${base} ${actStyle} cursor:${isZero ? "not-allowed" : "pointer"};">${label} <span style="font-weight:600; opacity:0.85;">(${count})</span></button>`;
  };

  return `
    <div class="clean-vocab-summary" style="background:var(--card, #fff); border-radius:12px; padding:12px; color:var(--ink, #232A4D);">
      <div style="display:flex; flex-wrap:wrap; align-items:center; gap:4px; padding:4px; border-radius:12px; background:var(--paper, #F1F5F9); border:1px solid var(--line, #E2E8F0); margin-bottom:10px;">
        ${segBtn("all", "全部", list.length, "var(--violet, #6C4CE0)")}
        ${segBtn("wrong", "待加強", wrongCount, "#dc2626")}
        ${segBtn("learning", "學習中", learningCount, "#6366f1")}
        ${segBtn("practicing", "練習中", practicingCount, "#0284c7")}
        ${segBtn("mastered", "精通", masteredCount, "#059669")}
      </div>
      <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; margin:0 0 10px;">
        <input type="search" id="clean-vocab-search" placeholder="搜尋單字..." style="flex:1; min-width:160px; padding:6px 10px; border:1px solid var(--line, #E7E9F5); border-radius:8px; font-size:12.5px; background:var(--paper, #F6F7FB); color:var(--ink, #232A4D); outline:none;" />
        <div style="display:flex; gap:3px; align-items:center; padding:3px; border-radius:10px; background:var(--paper, #F1F5F9); border:1px solid var(--line, #E2E8F0);">
          <button type="button" class="clean-source-tab" data-source="all" style="${srcBtnStyle("all")}">全部來源</button>
          <button type="button" class="clean-source-tab" data-source="task" style="${srcBtnStyle("task")}">指定</button>
          <button type="button" class="clean-source-tab" data-source="free" style="${srcBtnStyle("free")}">自由</button>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; text-align:left;">
          <thead>
            <tr style="border-bottom:1.5px solid var(--line, #E7E9F5); font-size:11.5px; color:var(--ink3, #64748b); font-weight:700;">
              <th style="padding:8px;">單字</th>
              <th style="padding:8px;">對 / 錯次數</th>
              <th style="padding:8px;">狀態</th>
            </tr>
          </thead>
          <tbody id="clean-vocab-tbody">${rowsHtml}</tbody>
        </table>
      </div>
    </div>
  `;
}

  if (btnPreviewWeb) {
    btnPreviewWeb.onclick = () => {
      const d = _latestSummaryGetter ? _latestSummaryGetter() : null;
      const sDate = (inputStart && inputStart.value) ? inputStart.value : sevenDaysAgo;
      const eDate = (inputEnd && inputEnd.value) ? inputEnd.value : todayDash;

      const payload = _buildExportPayload(d, currentMode, sDate, eDate);
      if (previewBody) {
        let currentSourceMode = "all";
        const renderCleanPreview = () => {
          previewBody.innerHTML = _buildCleanWordSummaryHtml(payload, d, currentSourceMode);
          const searchEl = previewBody.querySelector("#clean-vocab-search");
          const statusPills = previewBody.querySelectorAll(".clean-status-pill");
          const sourceTabs = previewBody.querySelectorAll(".clean-source-tab");
          let activeStatus = "all";
          const applyFilter = () => {
            const q = (searchEl ? searchEl.value : "").trim().toLowerCase();
            previewBody.querySelectorAll(".clean-vocab-row").forEach(tr => {
              const matchQ = !q || tr.textContent.toLowerCase().includes(q);
              const st = tr.getAttribute("data-status") || "";
              const matchF = activeStatus === "all" || st === activeStatus;
              tr.style.display = (matchQ && matchF) ? "" : "none";
            });
          };
          applyFilter();
          if (searchEl) searchEl.oninput = applyFilter;
          statusPills.forEach(btn => {
            btn.onclick = () => {
              if (btn.disabled) return;
              activeStatus = btn.getAttribute("data-status") || "all";
              statusPills.forEach(b => {
                const isAct = b === btn;
                const col = b.getAttribute("data-color") || "var(--violet, #6C4CE0)";
                b.style.background = isAct ? "var(--card, #fff)" : "transparent";
                b.style.color = isAct ? col : (b.disabled ? "var(--ink3, #94a3b8)" : "var(--ink2, #475569)");
                b.style.boxShadow = isAct ? "0 2px 6px rgba(15,23,42,0.08)" : "none";
              });
              applyFilter();
            };
          });
          sourceTabs.forEach(btn => {
            btn.onclick = () => {
              currentSourceMode = btn.getAttribute("data-source") || "all";
              renderCleanPreview();
            };
          });
        };
        renderCleanPreview();
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
      const parentDetails = previewContainer.closest("details");
      if (parentDetails) parentDetails.open = false;
    };
  }
}

// ---------- quiz (placement & challenge) ----------
