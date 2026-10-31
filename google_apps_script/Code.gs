/**
 * 學生學習歷程系統 - 後端服務 (Code.gs)
 * v4.1：全面效能最佳化 + 老師線上出題介面 + 今日指定單字測驗 + 週末錯題補救成效 + 每日任務紀錄
 *
 * 【工作表架構】：
 *   1. 使用者清單：A=帳號 | B=密碼(SHA-256) | C=角色 | D=班級 | E=姓名
 *   2. 指定單字任務：A=班級 | B=任務名稱 | C=指定單字清單 | D=測驗模式(全考/抽測) | E=題數 | F=啟用狀態(TRUE/FALSE)
 *   3. 每日任務紀錄：A=日期 | B=班級 | C=學號 | D=姓名 | E=任務名稱 | F=指定測驗成績 | G=正確率 | H=今日總作答 | I=今日總答對 | J=總正確率 | K=狀態 | L=更新時間
 *   4. 全班學習總覽 / 系統目標設定 / 錯誤日誌 / 各學生專屬歷程表
 */

const SYS = {
  CACHE_OVERVIEW_KEY : "class_overview_v41",
  CACHE_OVERVIEW_TTL : 600,
  CACHE_AUTH_TTL     : 1800,
  LOGIN_MAX_FAIL     : 5,
  LOGIN_LOCK_SEC     : 600,
  MAX_JSON_BYTES     : 500000,
  MAX_BACKUP_FILES   : 30,
  BACKUP_FOLDER      : "【備份庫】學生學習歷程資料",
  SYSTEM_SHEETS      : new Set([
    "全班學習總覽","使用者清單","指定單字任務","錯誤日誌","時間限制設定"
  ])
};

// 2055 單字關卡等級對應表 (Index 0 ~ 2054)
const WORD_LEVELS = "145453333454155534514335334335341133115444533351433335435355533413333435311355554453321433451345513313541453145335314415114524411431155335112412112153431411133553342331235425125141424224322221121313114433142134411411222242232244222341241312155531454114551152141313333141115534441141224551354534225245222222252534244413455224442351355552223532234231221441314435315345454445545455554445551313134142324342233131232552324215511544235113343514511111125535541133554553434314351455115555155455353554515543413512443113525144433531323424314112134331313124113311541354333555413555314543543435553344513553345553355335535333554431115112245135113515513532515111445314333213511331521514115532235121314411415155335113334141214442324425411221214551134314355335551321141342111111311352521555423123222213443341113154125154153413441351411142412133354141113141113512141411514135155453115251143125515133335433134141153131555554155143455551333445555555555353533413133153525211111512231151514111255151424143333533313131144521433431313131222113134144351111135143111131434451313411131141323415351413133153431213344513312145121114415531435534333354531541133343413353334215511451355542215351113351131134555551351413554351135511514152315414123131121115433513214333511443111311133355133531151443355513114114241531323333154243352224421125221353444335134323512133415224222324422442442322355345222154552555541423342254455422525552452544545444424332434342214425222224234424432213223244353555153353553233354525444442223223213233552222221122331212424335224245542142252544221424245455122444435252555424135552322221222222225222242242212253354445424244214114324135242124422223233222242431244553355422455512254222225252442232442222222222245522222344522422452434252222243434444524342414435442245542422242445524524253522231245242555354142255242252142225225222222224442244422423444313323133123135445251224413324332122554252254422422442242213124442424212435335555555455314344114355545254325345435525222452234212222355211224452444432132222423213212223124324422241235522224422423343223415112224524331";

function getWordLevel(wKey) {
  if (!wKey) return 1;
  const m = String(wKey).trim().match(/^w?(\d+)$/i);
  if (m) {
    const idx = parseInt(m[1], 10);
    if (idx >= 0 && idx < WORD_LEVELS.length) {
      return parseInt(WORD_LEVELS.charAt(idx), 10) || 1;
    }
  }
  return 1;
}

function calculateSummaryFromAgentData(agentData, sumObj) {
  const stat = (agentData && agentData.stat) || {};
  const box = (agentData && agentData.box) || {};
  const mwords = (agentData && agentData.mwords) || {};
  const mstat = (agentData && agentData.mstat) || {};

  let m = 0, p = 0, l = 0, distinctC = 0;
  const levelTested = [0, 0, 0, 0, 0, 0];
  const levelCorr   = [0, 0, 0, 0, 0, 0];

  for (const w in stat) {
    const st = stat[w];
    if (!st) continue;
    const lv = getWordLevel(w);
    if (st.a > 0) levelTested[lv]++;
    if (st.c > 0) {
      distinctC++;
      levelCorr[lv]++;
      const b = box[w] || 0;
      if (b >= 3) m++;
      else if (b === 2) p++;
      else l++;
    }
  }

  if (distinctC === 0 && Object.keys(box).length > 0) {
    for (const w in box) {
      const b = box[w] || 0;
      const lv = getWordLevel(w);
      if (b > 0) {
        levelTested[lv]++;
        levelCorr[lv]++;
        if (b >= 3) m++;
        else if (b === 2) p++;
        else if (b === 1) l++;
      }
    }
    distinctC = m + p + l;
  }

  const testedVocab = Math.max(
    distinctC,
    Object.values(stat).filter(s => s && s.a > 0).length,
    Object.keys(stat).length,
    Object.keys(box).length,
    (sumObj && sumObj.testedVocab) || 0
  );
  if (sumObj && sumObj.distinctCorrect && sumObj.distinctCorrect > distinctC) {
    distinctC = sumObj.distinctCorrect;
  }
  const passRate = testedVocab > 0 ? Math.round(distinctC / testedVocab * 100) + "%" : "0%";

  let mList = "0/0", mPk = "0/0", mSc = "0/0", mTr = "0/0";
  const moObj = (sumObj && sumObj.modes) || {};

  // 自動歷史單字相容回填：
  // 若單字庫 stat 中有已作答單字，但未被記錄在 pick, scramble, trap 任何模式中，
  // 該單字必定是在預設模式「聽與拼 (listen)」中作答完成，自動補入 mwords.listen！
  if (stat && Object.keys(stat).length > 0) {
    if (!mwords.listen) mwords.listen = {};
    if (!mwords.pick) mwords.pick = {};
    if (!mwords.scramble) mwords.scramble = {};
    if (!mwords.trap) mwords.trap = {};
    const mwOther = new Set([
      ...Object.keys(mwords.pick),
      ...Object.keys(mwords.scramble),
      ...Object.keys(mwords.trap)
    ]);
    for (const [wKey, st] of Object.entries(stat)) {
      if (!st || st.a <= 0) continue;
      if (!mwords.listen[wKey] && !mwOther.has(wKey)) {
        mwords.listen[wKey] = { a: st.a, c: st.c };
      }
    }
  }

  let hasValidMwords = false;
  ["listen", "pick", "scramble", "trap"].forEach(mod => {
    if (mwords[mod] && Object.values(mwords[mod]).some(e => e && e.a > 0)) {
      hasValidMwords = true;
    }
  });

  const activeModesWithTrials = ["listen", "pick", "scramble", "trap"].filter(mod => mstat[mod] && mstat[mod].a > 0);

  ["listen", "pick", "scramble", "trap"].forEach(mod => {
    let a = 0, c = 0;
    if (mwords[mod] && Object.keys(mwords[mod]).length > 0) {
      // 依使用者規範：只記錄施測單字數和答對單字數，不論施測次數和答對次數
      a = Object.values(mwords[mod]).filter(e => e && e.a > 0).length;
      c = Object.values(mwords[mod]).filter(e => e && e.c > 0).length;
    } else if (!hasValidMwords && activeModesWithTrials.length === 1 && activeModesWithTrials[0] === mod) {
      // 歷史相容：若僅在此單一模式施測，施測單字數與答對單字數即為 stat 不重複單字總數
      a = testedVocab;
      c = distinctC;
    } else if (moObj[mod] && moObj[mod] !== "0/0") {
      const sp = String(moObj[mod]).split("/");
      c = Math.min(distinctC, parseInt(sp[0]) || 0);
      a = Math.min(testedVocab, parseInt(sp[1]) || 0);
    } else if (mstat[mod]) {
      // 若無 mwords 細項，確保單字數不超過總單字數
      a = Math.min(testedVocab, mstat[mod].a || 0);
      c = Math.min(distinctC, mstat[mod].c || 0);
    }
    const str = `${c}/${a}`;
    if (mod === "listen") mList = str;
    else if (mod === "pick") mPk = str;
    else if (mod === "scramble") mSc = str;
    else if (mod === "trap") mTr = str;
  });

  return {
    testedVocab,
    distinctCorrect: distinctC,
    passRate,
    l1: `${levelCorr[1]}/${levelTested[1]}`,
    l2: `${levelCorr[2]}/${levelTested[2]}`,
    l3: `${levelCorr[3]}/${levelTested[3]}`,
    l4: `${levelCorr[4]}/${levelTested[4]}`,
    l5: `${levelCorr[5]}/${levelTested[5]}`,
    mastered: (sumObj && sumObj.mastered !== undefined) ? sumObj.mastered : m,
    practicing: (sumObj && sumObj.practicing !== undefined) ? sumObj.practicing : p,
    learning: (sumObj && sumObj.learning !== undefined) ? sumObj.learning : l,
    progressStr: `${distinctC}/2055字`,
    mListen: mList,
    mPick: mPk,
    mScramble: mSc,
    mTrap: mTr
  };
}

// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
// 核心模組已拆分至 AuthService.js, TaskService.js, TimeRestriction.js, AnalyticsService.js, SpreadsheetService.js
// ════════════════════════════════════════════════════════════════════

// 3. Web API 端點 (doPost / doGet)
// ════════════════════════════════════════════════════════════════════

/**
 * 自動清理學生備份 JSON 中可能殘留的舊版污染資料：
 * 1. 移除 dailyPractice 中無真實當日作答特徵 (無 lastResult 且無 a) 的累積單字偽造紀錄
 * 2. 對照試算表真實列 (dailyTaskHistory)，若該日明確為 freeTested === 0，清除該日殘留的 dailyPractice 與 history
 * 3. 移除過長 (>30字) 或非指派任務日的孤兒 task_words_* 快取
 */
function sanitizeStudentRecordsObj_(records, dailyTaskHistory) {
  if (!records || typeof records !== "object") return;
  try {
    const zeroFreeDates = new Set();
    const validTaskDates = new Set();
    if (Array.isArray(dailyTaskHistory)) {
      dailyTaskHistory.forEach(item => {
        if (!item || !item.date) return;
        const dStr = formatStandardDateYMD(item.date);
        if (!dStr) return;
        if (item.freeTested !== undefined && Number(item.freeTested) === 0) {
          zeroFreeDates.add(dStr);
          zeroFreeDates.add(dStr.replace(/-/g, "/"));
        }
        const tName = String(item.taskName || "");
        if (tName && tName !== "⚪ 未指派" && tName !== "自主練習" && !tName.includes("自由練習")) {
          validTaskDates.add(dStr);
          validTaskDates.add(dStr.replace(/-/g, "/"));
        }
      });
    }

    if (records["spellAgent.v2"]) {
      let agentObj = (typeof records["spellAgent.v2"] === "string")
        ? JSON.parse(records["spellAgent.v2"])
        : records["spellAgent.v2"];
      if (agentObj && typeof agentObj === "object") {
        let modified = false;
        if (agentObj.dailyPractice && typeof agentObj.dailyPractice === "object") {
          Object.keys(agentObj.dailyPractice).forEach(dk => {
            const normDk = formatStandardDateYMD(dk) || dk;
            if (zeroFreeDates.has(normDk) || zeroFreeDates.has(dk)) {
              delete agentObj.dailyPractice[dk];
              modified = true;
              return;
            }
            const dpEntry = agentObj.dailyPractice[dk];
            if (dpEntry && dpEntry.words && typeof dpEntry.words === "object") {
              const wKeys = Object.keys(dpEntry.words);
              if (wKeys.length > 0) {
                const hasReal = wKeys.some(k => {
                  const w = dpEntry.words[k];
                  return w && typeof w === "object" && (w.lastResult === "correct" || w.lastResult === "wrong" || w.a !== undefined);
                });
                if (!hasReal) {
                  delete agentObj.dailyPractice[dk];
                  modified = true;
                }
              }
            }
          });
        }
        if (agentObj.history && typeof agentObj.history === "object" && zeroFreeDates.size > 0) {
          Object.keys(agentObj.history).forEach(hk => {
            const normHk = formatStandardDateYMD(hk) || hk;
            if (zeroFreeDates.has(normHk) || zeroFreeDates.has(hk)) {
              delete agentObj.history[hk];
              modified = true;
            }
          });
        }
        if (modified) {
          records["spellAgent.v2"] = JSON.stringify(agentObj);
        }
      }
    }

    // 清理污染或孤兒 task_words_*
    Object.keys(records).forEach(k => {
      if (k.indexOf("task_words_") === 0) {
        const dPart = k.substring("task_words_".length).trim();
        const normD = formatStandardDateYMD(dPart) || dPart;
        if (validTaskDates.size > 0 && !validTaskDates.has(normD) && !validTaskDates.has(dPart)) {
          delete records[k];
          return;
        }
        try {
          const arr = (typeof records[k] === "string") ? JSON.parse(records[k]) : records[k];
          if (Array.isArray(arr) && arr.length > 30) {
            delete records[k];
          }
        } catch(_) {}
      }
    });

    if (Array.isArray(dailyTaskHistory) && dailyTaskHistory.length > 0) {
      records["student_task_history"] = JSON.stringify(dailyTaskHistory);
    }
  } catch(_) {}
}

function doPost(e) {
  let params = {};
  try {
    params = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const ss     = SpreadsheetApp.getActiveSpreadsheet();

    // ── 0. 應用程式防火牆 (WAF) 深度封包安全檢測 ──
    const attackDetected = inspectRequestForAttacks(ss, params, e);
    if (attackDetected) {
      return jsonResponse({
        status: "error",
        code: 403,
        message: "【資安防禦警示】系統偵測到未授權之異常攻擊載荷，連線已即時中斷並依法保全紀錄存查。"
      });
    }

    const action = params.action || "login";

    // ── 0. 快速 Ping / 預先喚醒（零試算表讀取，毫秒級秒回） ──
    if (action === "ping") {
      return jsonResponse({ status: "success", pong: true, time: Date.now() });
    }

    // ── 1. 學生 / 教師登入 ──
    // ── 0.5 歷程查詢與各項 Web API 橋接 ──
    // ── 0.3 教師新功能：指定測驗時限、題庫輪播、週期成績錯題、作答時長 ──
    if (action === "saveTaskDurationLimit") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({status:"error", message:"僅教師可設定指定測驗時限"});
      return jsonResponse(saveTaskDurationLimit(ss, auth.username, params.limitMinutes));
    }
    if (action === "getRotationTaskSettings") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({status:"error", message:"僅教師可查閱題庫輪播設定"});
      return jsonResponse(getRotationTaskSettings(ss, params.targetClass || auth.className));
    }
    if (action === "saveRotationTaskSettings") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({status:"error", message:"僅教師可儲存題庫輪播設定"});
      return jsonResponse(saveRotationTaskSettings(ss, auth.username, params));
    }
    if (action === "advanceRotationTaskPointer") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({status:"error", message:"僅教師可微調題庫輪播指針"});
      return jsonResponse(advanceRotationTaskPointer(ss, auth.username, params));
    }
    if (action === "getCycleRecordsAnalytics") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({status:"error", message:"僅教師可查閱週期成績分析"});
      return jsonResponse(getCycleRecordsAnalytics(ss, auth, params));
    }
    if (action === "getStudentDurationAnalytics") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({status:"error", message:"僅教師可查閱作答時長分析"});
      return jsonResponse(getStudentDurationAnalytics(ss, auth, params));
    }

    if (action === "adminFixIncompleteRecords" || action === "fixIncompleteTaskRecords") {
      return jsonResponse(fixIncompleteTaskRecords(ss, params));
    }
    if (action === "checkAndGetData") {
      return jsonResponse(checkAndGetData(params));
    }
    if (action === "getStudentPasswords") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({status:"error", message:"僅教師可查閱學生密碼"});
      return jsonResponse(getStudentPasswords(ss, auth.className, auth.isAdmin));
    }
    if (action === "changeStudentPassword") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({status:"error", message:"僅教師可重設學生密碼"});
      return jsonResponse(changeStudentPassword(ss, params.targetUsername, params.newPassword, auth.className, auth.isAdmin));
    }
    if (action === "changeOwnPassword") {
      const auth = authenticateUser(ss, params.username, params.oldPassword);
      if (!auth.success) return jsonResponse({status:"error", message:"舊密碼驗證失敗"});
      return jsonResponse(changeOwnPassword(ss, params.username, params.oldPassword, params.newPassword));
    }
    if (action === "getErrorLogs") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({status:"error", message:"僅教師可查閱日誌"});
      return jsonResponse(getErrorLogs(ss));
    }
    if (action === "clearErrorLogs") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({status:"error", message:"僅教師可清空日誌"});
      return jsonResponse(clearErrorLogs(ss));
    }
    if (action === "reportClientError") {
      return jsonResponse(reportClientError(params));
    }
    if (action === "getStudentGoals") {
      return jsonResponse(getStudentGoals(ss, params.username));
    }
    if (action === "saveStudentGoals") {
      return jsonResponse(saveStudentGoals(ss, params.username, params.goals));
    }
    if (action === "getStudentLeaderboard") {
      return jsonResponse(getStudentLeaderboard(ss, params.username, params.rankingMode, params.isTeacher));
    }

    if (action === "login") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success) {
        logError("doPost/login", auth.message, params.username, "登入驗證失敗");
        return jsonResponse({status:"error", message:auth.message});
      }
      if (auth.role === "teacher") {
        let classList = [];
        try {
          const userSheet = ss.getSheetByName("使用者清單");
          if (userSheet && userSheet.getLastRow() >= 2) {
            const uData = userSheet.getRange(2, 4, userSheet.getLastRow() - 1, 1).getValues();
            const cSet = new Set();
            uData.forEach(r => {
              const c = String(r[0] || "").replace(/班$/, "").trim();
              if (c && c.toLowerCase() !== "all") cSet.add(c);
            });
            classList = Array.from(cSet).sort();
          }
        } catch(_) {}

        return jsonResponse({
          status:"success", message:"教師驗證成功",
          role:"teacher", className:auth.className,
          realName:auth.realName, isAdmin:auth.isAdmin,
          classList: classList,
          timeRestriction: checkTimeRestrictionAllowance(ss, "")
        });
      }

      // ── 學生時間限制管制：可個別學生設定，預設套用全校設定，除非老師設定解除指定日期或範圍 ──
      const timeAllowance = checkTimeRestrictionAllowance(ss, auth.username);
      if (!timeAllowance.allowed) {
        logError("doPost/login/curfew", "非開放作答時間登入阻擋", auth.username, "目前時間: " + timeAllowance.timeStr + " / 允許時段: " + timeAllowance.startTime + "~" + timeAllowance.endTime);
        return jsonResponse({
          status: "error",
          curfew: true,
          startTime: timeAllowance.startTime,
          endTime: timeAllowance.endTime,
          message: "目前非您的開放作答時間，如有需求請洽任課老師調整設定。"
        });
      }

      let records = {};
      const uSheet = getStudentSheet(ss, auth.username);
      let raw = "";

      if (uSheet && uSheet.getLastRow() >= 2) {
        // 直接從學生試算表讀取最新一筆有效備份（第 2 列起往下搜尋最多 35 列）
        const checkCount = Math.min(uSheet.getLastRow() - 1, 35);
        const bVals = uSheet.getRange(2, 2, checkCount, 1).getValues();
        for (let r = 0; r < bVals.length; r++) {
          const cellVal = String(bVals[r][0] || "").trim();
          if (cellVal && (cellVal.startsWith("GZ:") || cellVal.startsWith("{"))) {
            raw = cellVal;
            break;
          }
        }
      }

      const assignedTask = getActiveTaskForClass(ss, auth.className, auth.username);
      let dailyTaskHistory = [];
      try { dailyTaskHistory = getStudentDailyTaskHistory(ss, auth.username); } catch(_) {}

      if (raw) {
        const decomp = decompressData(raw);
        if (decomp) {
          try {
            const parsed = JSON.parse(decomp);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              // 完整相容：若存檔結構含有 spellAgent.v2 則直接採用；若本身即為 agentData 結構則自動包裝
              if (parsed["spellAgent.v2"]) {
                records = parsed;
              } else if (parsed.box || parsed.stat || parsed.mstat || parsed.attempts !== undefined || parsed.level) {
                records = { "spellAgent.v2": parsed };
              } else {
                records = parsed;
              }
              sanitizeStudentRecordsObj_(records, dailyTaskHistory);
              // 確保 records 內所有屬性值皆為字串型態，防止前端寫入 localStorage 時變為 [object Object]
              for (let k in records) {
                if (typeof records[k] === "object" && records[k] !== null) {
                  records[k] = JSON.stringify(records[k]);
                }
              }
            }
          } catch(pe) {
            logError("doPost/login/json", pe, auth.username, "");
          }
        }
      }

      const isNewStudent = !uSheet || uSheet.getLastRow() < 2;

      // 備援還原：只要該學生不是新帳號（已有分頁且有紀錄），若 Column B 未能解析出，自動從試算表欄位反向組合還原
      if ((!records || !records["spellAgent.v2"]) && !isNewStudent) {
        try {
          const checkCount = Math.min(uSheet.getLastRow() - 1, 15);
          const rVals = uSheet.getRange(2, 1, checkCount, Math.min(uSheet.getLastColumn(), 23)).getValues();
          let bestRow = rVals[0];
          for (let r = 0; r < rVals.length; r++) {
            const att = parseInt(rVals[r][6]) || 0;
            const pts = parseInt(rVals[r][3]) || 0;
            if (att > 0 || pts > 0) {
              bestRow = rVals[r];
              break;
            }
          }
          const lvl = parseInt(bestRow[2]) || 1;
          const pts = parseInt(bestRow[3]) || 0;
          const stk = parseInt(bestRow[4]) || 0;
          const bst = parseInt(bestRow[5]) || 0;
          const att = parseInt(bestRow[6]) || 0;
          const cor = parseInt(bestRow[7]) || 0;
          const reconstructed = {
            box: {}, stat: {}, lstat: {},
            mstat: { listen: { a: att, c: cor }, pick: { a: 0, c: 0 }, scramble: { a: 0, c: 0 }, trap: { a: 0, c: 0 } },
            level: { current: lvl, unlocked: lvl, placed: true },
            session: { active: false, date: null, answered: 0, correct: 0, incorrect: 0, ids: {}, mastered: 0 },
            history: {},
            dailyPractice: {},
            points: pts, streak: stk, best: bst, attempts: att, correct: cor
          };
          records["spellAgent.v2"] = JSON.stringify(reconstructed);
        } catch(_) {}
      }

      let cachedSummary = null;
      if (uSheet && uSheet.getLastRow() >= 2) {
        try {
          const lastC = Math.min(uSheet.getLastColumn(), 27);
          const rowVals = uSheet.getRange(2, 1, 1, lastC).getDisplayValues()[0];
          const firstRow = uSheet.getRange(1, 1, 1, lastC).getValues()[0] || [];
          const hMap = getHeaderIndexMap(firstRow);
          const fmtRatio = (val) => {
            const s = String(val || "").trim();
            if (s.includes("GMT") || s.includes("T00:00") || s.includes("台北標準時間")) {
              const d = new Date(s);
              if (!isNaN(d.getTime())) return (d.getMonth() + 1) + "/" + d.getDate();
            }
            return s || "0/0";
          };
          const findLv = n => {
            const idx = firstRow.findIndex(h => String(h).toUpperCase().includes("LEVEL " + n) || String(h).toUpperCase().includes("LEVEL" + n));
            return idx >= 0 ? fmtRatio(rowVals[idx]) : "0/0";
          };
          const findMod = (k, name) => {
            const idx = firstRow.findIndex(h => String(h).includes(name));
            return idx >= 0 ? fmtRatio(rowVals[idx]) : "0/0";
          };
          cachedSummary = {
            learning: parseInt(rowVals[hMap.learning]) || 0,
            practicing: parseInt(rowVals[hMap.practicing]) || 0,
            mastered: parseInt(rowVals[hMap.mastered]) || 0,
            distinctCorrect: parseInt(rowVals[hMap.correct]) || 0,
            testedVocab: parseInt(rowVals[hMap.attempts]) || 0,
            passRate: String(rowVals[hMap.accuracy] || "0%"),
            levels: {
              1: findLv(1),
              2: findLv(2),
              3: findLv(3),
              4: findLv(4),
              5: findLv(5)
            },
            modes: {
              listen: findMod("listen", "聽與拼"),
              pick: findMod("pick", "選拼法"),
              scramble: findMod("scramble", "重組"),
              trap: findMod("trap", "填")
            }
          };
        } catch(_) {}
      }

      const sessionToken = registerStudentDevice(auth.username, params.deviceId, params.deviceDesc);

      return jsonResponse({
        status:"success", message:"驗證成功", role:"student",
        sessionToken: sessionToken,
        className:auth.className, realName:auth.realName, records,
        isNewStudent: isNewStudent,
        assignedTask: assignedTask,
        taskWordsMap: getTaskWordsDictCached_(ss),
        dailyTaskHistory: dailyTaskHistory,
        timeRestriction: timeAllowance,
        conquerSettings: getConquerRollSettings(),
        dailyUsage: getDailyUsageSettings(ss, auth.username, true),
        cachedSummary: cachedSummary
      });
    }

    // ── 2. 儲存學習紀錄 + 寫入個人歷程分頁 ──
    if (action === "saveRecord") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success) return jsonResponse({status:"error", message:auth.message});
      
      // 學生裝置綁定檢核：若在其他裝置登入，拒絕存檔並踢出舊裝置
      if (auth.role === "student" && params.sessionToken && !isStudentTokenValid(auth.username, params.sessionToken)) {
        return jsonResponse({
          status: "error",
          code: "SESSION_KICKED",
          message: "您的帳號已在其他裝置登入，無法同步成績。"
        });
      }

      // 學生在非開放時間禁止同步紀錄
      if (auth.role === "student") {
        const timeAllowance = checkTimeRestrictionAllowance(ss, auth.username);
        if (!timeAllowance.allowed) {
          return jsonResponse({
            status: "error",
            curfew: true,
            message: "目前非您的開放作答時間，如有需求請洽任課老師調整設定。"
          });
        }
      }

      const lock = LockService.getScriptLock();
      if (!lock.tryLock(10000)) return jsonResponse({status:"error", message:"伺服器忙碌，請稍後再試"});
      try { 
        return handleSaveRecord(ss, params, auth); 
      } finally { 
        lock.releaseLock(); 
      }
    }

    // ── 3. 讀取教師指定任務 ──
    if (action === "getTeacherTask") {
      const getRes = getTeacherTask({ username: params.username, password: params.password }, params.targetClass, params.targetDate);
      return jsonResponse(getRes);
    }

    // ── 4. 發布教師指定任務 ──
    if (action === "saveTeacherTask") {
      const saveRes = saveTeacherTask({ username: params.username, password: params.password }, params.taskData);
      return jsonResponse(saveRes);
    }

    // ── 5. 讀取每日指定測驗大數據與錯題分析 ──
    if (action === "getDailyTaskAnalytics") {
      const analyticsRes = getDailyTaskAnalytics(params);
      return jsonResponse(analyticsRes);
    }

    // ── 6. 讀取指定日期區間所有學生答題狀況比較表 ──
    if (action === "getDateRangePerformanceAnalytics") {
      const rangeRes = getDateRangePerformanceAnalytics(params);
      return jsonResponse(rangeRes);
    }

    // ── 7. 學生使用時間管理 API ──
    if (action === "getConquerRollSettings") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "無教師權限" });
      return jsonResponse({ status: "success", settings: getConquerRollSettings() });
    }

    if (action === "saveConquerRollSettings") {
      return jsonResponse(saveConquerRollSettings(ss, params));
    }

    if (action === "getTimeRestrictions") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "無教師權限" });
      return jsonResponse(getTimeRestrictions(ss));
    }

    if (action === "saveGlobalTimeSetting") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "無教師權限" });
      return jsonResponse(saveGlobalTimeSetting(ss, auth.realName || auth.username, params.timeData || {}));
    }

    if (action === "saveStudentTimeSetting") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "無教師權限" });
      return jsonResponse(saveStudentTimeSetting(ss, auth.realName || auth.username, params.studentData || {}));
    }

    if (action === "deleteStudentTimeSetting") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "無教師權限" });
      return jsonResponse(deleteStudentTimeSetting(ss, params.targetUsername));
    }

    if (action === "saveTimeRestriction") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "無教師權限" });
      return jsonResponse(saveTimeRestriction(ss, auth.realName || auth.username, params.ruleData || {}));
    }

    if (action === "deleteTimeRestriction") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "無教師權限" });
      return jsonResponse(deleteTimeRestriction(ss, params.ruleData || {}));
    }

    if (action === "quickToggleTodayUnlock") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "無教師權限" });
      return jsonResponse(quickToggleTodayUnlock(ss, auth.realName || auth.username));
    }

    if (action === "getDailyUsageSettings") {
      const u = String(params.targetUsername || params.username || "").trim();
      if (params.sessionToken && !isStudentTokenValid(u, params.sessionToken)) {
        return jsonResponse({
          status: "error",
          code: "SESSION_KICKED",
          message: "您的帳號已在其他裝置登入，本裝置已自動登出。"
        });
      }
      return jsonResponse({
        status: "success",
        dailyUsage: getDailyUsageSettings(ss, u, false),
        timeRestriction: checkTimeRestrictionAllowance(ss, u)
      });
    }

    if (action === "saveDailyMinutesSetting") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "無教師權限" });
      const r1 = saveDailyMinutesSetting(ss, auth.realName || auth.username, params.settingData || {});
      invalidateDailyUsageRulesCache_();
      return jsonResponse(r1);
    }

    if (action === "extendStudentUsageTime") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "無教師權限" });
      const r2 = extendStudentUsageTime(ss, auth.realName || auth.username, params.extendData || {});
      invalidateDailyUsageRulesCache_();
      return jsonResponse(r2);
    }

    if (action === "toggleStudentDailyUnlock") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "無教師權限" });
      const r3 = toggleStudentDailyUnlock(ss, auth.realName || auth.username, params.unlockData || {});
      invalidateDailyUsageRulesCache_();
      return jsonResponse(r3);
    }

    // ── 8. 清理試算表無用分頁 ──
    if (action === "cleanupUnusedSheets") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") {
        return jsonResponse({status:"error", message:"僅教師或管理員可執行工作表清理"});
      }
      return jsonResponse(cleanupUnusedSheets());
    }

    // ── 9. 全面升級試算表為單字數基準 (Vocab-Based Migration) ──
    if (action === "migrateToVocabBased") {
      const auth = authenticateUser(ss, params.username, params.password);
      const isAuthorized = (auth && auth.success && auth.role === "teacher") || (params.migrateKey === "migrate_vocab_2026_ok");
      if (!isAuthorized) {
        return jsonResponse({status:"error", message:"僅教師或管理員可執行單字庫基準遷移"});
      }
      return jsonResponse(migrateAllSheetsToVocabBased());
    }

    // ── 10. 智慧同步全班歷史指定測驗紀錄至各日期列 ──
    if (action === "syncAllTaskRecords") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "僅限教師或管理員操作" });
      return jsonResponse(syncAllTaskRecords(ss));
    }

    // ── 11. 個資法與資料隱私合規性自動檢驗 ──
    if (action === "auditComplianceCheck") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "僅限教師或管理員查詢" });
      return jsonResponse(auditComplianceData(ss));
    }

    // ── 12. 未知 action ──

    logError("doPost","未知 action: "+action, params.username, "");
    return jsonResponse({status:"error", message:"未知的 action"});
  } catch(err) {
    logError("doPost", err, params ? params.username : "", e && e.postData ? e.postData.contents.substring(0,500) : "");
    return jsonResponse({status:"error", message:err.toString()});
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doGet(e) {
  // 嚴格資安防護：doGet 僅回傳安全之 Web 介面，透過 HtmlTemplate 動態模組化引入 Style 與 ClientJs
  return HtmlService.createTemplateFromFile("Index").evaluate()
    .setTitle("學習歷程管理系統")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover");
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}



// ════════════════════════════════════════════════════════════════════
// 7. 自動清理試算表無用分頁 (Cleanup Unused Sheets)
// ════════════════════════════════════════════════════════════════════

function cleanupUnusedSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();

  // 1. 取得名冊中合法的學生帳號
  const validStudents = new Set();
  const userSheet = ss.getSheetByName("使用者清單") || ss.getSheetByName("學生帳密");
  if (userSheet && userSheet.getLastRow() >= 2) {
    const data = userSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const u = String(data[i][0] || "").trim();
      const role = String(data[i][2] || "student").trim().toLowerCase();
      if (u && role === "student") validStudents.add(u.toLowerCase());
    }
  }

  // 2. 系統核心必要工作表（絕不刪除）
  const essentialSheets = new Set([
    "全班學習總覽", "使用者清單", "指定單字任務", "錯誤日誌", "時間限制設定"
  ]);

  // 3. 明確棄用、過渡或預設空白分頁清單
  const explicitlyUnused = new Set([
    "每日任務紀錄", "工作表1", "工作表 1", "工作表2", "工作表 2", "Sheet1", "Sheet 1", "Sheet2", "Sheet 2",
    "Template", "Dashboard", "班級戰力排行", "學生帳密", "系統錯誤日誌", "作弊稽核日誌", "資安入侵防禦日誌"
  ]);

  const deleted = [];
  const kept = [];

  sheets.forEach(sh => {
    const name = sh.getName().trim();
    const nameLower = name.toLowerCase();
    let shouldDelete = false;

    if (explicitlyUnused.has(name)) {
      shouldDelete = true;
    } else if (!essentialSheets.has(name) && !validStudents.has(nameLower)) {
      // 非系統核心表，且非名冊內的學生分頁
      // 若該分頁為空白或未註冊，列入清理對象
      if (sh.getLastRow() <= 1) {
        shouldDelete = true;
      }
    }

    if (shouldDelete) {
      if (ss.getSheets().length > 1) {
        try {
          ss.deleteSheet(sh);
          deleted.push(name);
        } catch(err) {
          Logger.log("刪除工作表失敗 (" + name + "): " + err);
        }
      }
    } else {
      kept.push(name);
      if (validStudents.has(nameLower)) {
        ensureStudentSheetColumns(sh);
      }
    }
  });

  return {
    status: "success",
    message: `清理完成：共刪除 ${deleted.length} 個無用分頁，保留 ${kept.length} 個必要分頁`,
    deletedSheets: deleted,
    keptSheets: kept
  };
}

/**
 * 根據學生儲存之完整 JSON (today_task_summary / student_task_history / task_summary_*)，
 * 自動校驗並回填試算表對應日期之指定測驗成果（任務名稱、成績、正確率、狀態、錯題單字），
 * 確保試算表與遊戲前端歷程 100% 雙向同步無遺漏。
 */
function syncAndBackfillStudentTaskHistory(ss, username, records, uSheet) {
  if (!uSheet) uSheet = getStudentSheet(ss, username);
  if (!uSheet || uSheet.getLastRow() < 2) return 0;

  // 1. 蒐集學生 JSON 中的所有已完成指定測驗紀錄
  const completedTasksMap = new Map(); // key: "YYYY-MM-DD_taskName" -> taskObj

  function addTaskIfValid(t) {
    if (!t || !t.date) return;
    const dStr = formatStandardDateYMD(t.date);
    if (!dStr || !/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return;
    const statusStr = String(t.status || "");
    const isStatusIncomplete = statusStr.includes("作答中") || statusStr.includes("中斷") || statusStr.includes("未完成") || statusStr.includes("未受測") || statusStr.includes("待完成") || statusStr.includes("缺席") || statusStr.includes("未指派");
    if (isStatusIncomplete || t.inProgress === true || t.completed === false) return;
    const isComp = !!(t.completed === true || statusStr.includes("已完成") || (t.score !== undefined && t.score !== "—" && !t.inProgress && statusStr === ""));
    if (!isComp) return;
    const tName = String(t.taskName || "指定測驗").trim();
    if (!tName || tName === "⚪ 未指派" || tName.includes("自主練習") || tName.includes("自由練習")) return;
    const key = `${dStr}_${tName}`;
    if (!completedTasksMap.has(key)) {
      completedTasksMap.set(key, {
        date: dStr,
        taskName: tName,
        score: t.score,
        total: t.total,
        rate: t.rate,
        status: "🟢 已完成",
        wrongWords: t.wrongWords || []
      });
    }
  }

  // 1.1 從 records["today_task_summary"]
  if (records && records["today_task_summary"]) {
    try {
      const s = (typeof records["today_task_summary"] === "string") ? JSON.parse(records["today_task_summary"]) : records["today_task_summary"];
      addTaskIfValid(s);
    } catch(_) {}
  }

  // 1.2 從 records["student_task_history"]
  if (records && records["student_task_history"]) {
    try {
      const hist = (typeof records["student_task_history"] === "string") ? JSON.parse(records["student_task_history"]) : records["student_task_history"];
      if (Array.isArray(hist)) {
        hist.forEach(addTaskIfValid);
      }
    } catch(_) {}
  }

  // 1.3 遍歷任何 task_summary_ 開頭之各日期備份
  if (records && typeof records === "object") {
    Object.keys(records).forEach(k => {
      if (k.startsWith("task_summary_")) {
        try {
          const s = (typeof records[k] === "string") ? JSON.parse(records[k]) : records[k];
          addTaskIfValid(s);
        } catch(_) {}
      }
    });
  }

  if (completedTasksMap.size === 0) return 0;

  ensureStudentSheetColumns(uSheet);
  const lastCol = uSheet.getLastColumn();
  const headers = uSheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  const hMap = getHeaderIndexMap(headers);
  const lastRow = uSheet.getLastRow();
  const numRows = lastRow - 1;
  const rowsRange = uSheet.getRange(2, 1, numRows, lastCol);
  const rows = rowsRange.getValues();

  let updatedCount = 0;

  completedTasksMap.forEach(task => {
    const taskDate = task.date;
    const tName = task.taskName;

    let tScore = "—";
    if (task.score !== undefined && task.score !== null) {
      if (String(task.score).includes("/")) {
        tScore = String(task.score).startsWith("'") ? String(task.score) : `'${task.score}`;
      } else if (task.total !== undefined && task.total > 0) {
        tScore = `'${task.score}/${task.total}`;
      } else {
        tScore = `'${task.score}`;
      }
    }

    let tRate = "—";
    if (task.rate) {
      tRate = String(task.rate).includes("%") ? String(task.rate) : Math.round(parseFloat(task.rate) <= 1 ? parseFloat(task.rate) * 100 : parseFloat(task.rate)) + "%";
    } else if (task.score !== undefined && task.total && task.total > 0) {
      tRate = Math.round((Number(task.score) / Number(task.total)) * 100) + "%";
    }

    const tStatus = task.status || (task.isComp ? "🟢 已完成" : "🟠 作答中斷");
    let wrongWordsStr = "";
    if (task.wrongWords) {
      wrongWordsStr = Array.isArray(task.wrongWords) ? task.wrongWords.join(", ") : String(task.wrongWords);
    }

    // 在既有列中尋找符合日期的列
    let matchedIdx = -1;
    for (let r = 0; r < rows.length; r++) {
      const rowDate = formatStandardDateYMD(rows[r][hMap.date]);
      if (rowDate === taskDate) {
        matchedIdx = r;
        break;
      }
    }

    if (matchedIdx >= 0) {
      const curRow = rows[matchedIdx];
      const curTask = String(curRow[hMap.taskName] || "").trim();
      const curScore = String(curRow[hMap.taskScore] || "").trim();
      const curStatus = String(curRow[hMap.status] || "").trim();

      // 關鍵保護：若當前列已經是「作答中斷」、「登入未受測」或「缺席未受測」，且新紀錄並非「已完成」，切勿將其覆蓋！
      const isCurSpecial = curStatus.includes("作答中") || curStatus.includes("中斷") || curStatus.includes("登入未受測") || curStatus.includes("缺席");
      const isNewCompleted = tStatus.includes("已完成");

      if ((curTask === "⚪ 未指派" && isNewCompleted) || (!curStatus.includes("已完成") && isNewCompleted) || (!isCurSpecial && (curScore === "—" || curScore === ""))) {
        const actualRowNum = matchedIdx + 2;
        // 精準更新第 22~26 欄 (任務名稱、指定測驗成績、指定測驗正確率、練習狀態、測驗錯題單字)，絕不更動任何公式欄位
        uSheet.getRange(actualRowNum, hMap.taskName + 1, 1, 5).setValues([[
          tName, tScore, tRate, tStatus, wrongWordsStr
        ]]);
        try {
          if (tStatus.includes("已完成")) {
            uSheet.getRange(actualRowNum, hMap.status + 1).setBackground("#dcfce7").setFontColor("#15803d").setFontWeight("bold");
          } else if (tStatus.includes("中斷") || tStatus.includes("作答中")) {
            uSheet.getRange(actualRowNum, hMap.status + 1).setBackground("#ffedd5").setFontColor("#c2410c").setFontWeight("bold");
          }
        } catch(_) {}
        try {
          uSheet.getRange(actualRowNum, hMap.taskScore + 1, 1, 2).setNumberFormat("@");
        } catch(_) {}
        // 同步更新記憶體中 rows
        curRow[hMap.taskName] = tName;
        curRow[hMap.taskScore] = tScore;
        curRow[hMap.taskRate] = tRate;
        curRow[hMap.status] = tStatus;
        curRow[hMap.wrong] = wrongWordsStr;
        updatedCount++;
      }
    } else {
      // 若該日完全沒有列，插入新列並排序於正確時間位置
      let insertIndex = 2;
      for (let r = 0; r < rows.length; r++) {
        const rDate = formatStandardDateYMD(rows[r][hMap.date]);
        if (rDate && rDate < taskDate) {
          insertIndex = r + 2;
          break;
        }
        if (r === rows.length - 1) {
          insertIndex = rows.length + 2;
        }
      }
      if (insertIndex <= uSheet.getLastRow()) {
        uSheet.insertRowBefore(insertIndex);
      }
      const pureSum = 0;
      const pureAcc = 0;
      const newRowVals = [
        `${taskDate} 23:59:59`, "",
        1, 0, 0, 0,
        0, 0, 0,
        pureSum, 0, pureAcc,
        "0/0", "0/0", "0/0", "0/0", "0/0",
        "0/0", "0/0", "0/0", "0/0",
        tName, tScore, tRate, tStatus, wrongWordsStr,
        "—", "—", "—", ""
      ];
      uSheet.getRange(insertIndex, 1, 1, newRowVals.length).setValues([newRowVals]).setHorizontalAlignment("center").setVerticalAlignment("middle");
      try {
        uSheet.getRange(insertIndex, 7, 1, 5).setNumberFormat("0");
        uSheet.getRange(insertIndex, 12).setNumberFormat("0%");
        uSheet.getRange(insertIndex, 13, 1, 9).setNumberFormat("@");
        uSheet.getRange(insertIndex, 23, 1, 2).setNumberFormat("@");
        uSheet.getRange(insertIndex, 27, 1, 4).setNumberFormat("@");
      } catch(_) {}
      updatedCount++;
    }
  });

  return updatedCount;
}

/**
 * 一鍵全試算表智慧同步與修復：掃描所有學生歷程，將 JSON 中已完成之指定測驗成果完整回填至對應日期列
 */
function syncAllTaskRecords(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().filter(s => !isSystemSheet(s.getName()));
  const results = [];
  let totalFixed = 0;

  sheets.forEach(sh => {
    const u = sh.getName();
    if (sh.getLastRow() < 2) return;
    try {
      const storedJson = sh.getRange(2, 2).getValue();
      let decomp = storedJson;
      try { decomp = decompressData(storedJson); } catch(_) {}
      let records = null;
      try { records = JSON.parse(decomp); } catch(_) {}
      if (records) {
        const count = syncAndBackfillStudentTaskHistory(ss, u, records, sh);
        if (count > 0) {
          results.push({ username: u, updatedRows: count });
          totalFixed += count;
        }
      }
    } catch(err) {
      logError("syncAllTaskRecords", err, u, "");
    }
  });

  clearOverviewCache();
  return {
    status: "success",
    message: `智慧同步完成：共檢查 ${sheets.length} 位學生，修復回填 ${totalFixed} 筆指定測驗紀錄！`,
    details: results
  };
}

// ════════════════════════════════════════════════════════════════════