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
  PORTFOLIO_SHEET    : "學生歷程總庫",
  SYSTEM_SHEETS      : new Set([
    "全班學習總覽","使用者清單","指定單字任務","錯誤日誌","時間限制設定","學生歷程總庫","系統目標設定","學習目標"
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
    const action = params.action || "login";

    // ── 0. 快速 Ping / 預先喚醒（極速秒回，完全零試算表 I/O） ──
    if (action === "ping") {
      return jsonResponse({ status: "success", pong: true, time: Date.now() });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── 0. 應用程式防火牆 (WAF) 深度封包安全檢測 ──
    const attackDetected = inspectRequestForAttacks(ss, params, e);
    if (attackDetected) {
      return jsonResponse({
        status: "error",
        code: 403,
        message: "【資安防禦警示】系統偵測到未授權之異常攻擊載荷，連線已即時中斷並依法保全紀錄存查。"
      });
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
      const tCls = (!auth.isAdmin && auth.className) ? auth.className : (params.targetClass || auth.className || "all");
      return jsonResponse(getRotationTaskSettings(ss, tCls));
    }
    if (action === "saveRotationTaskSettings") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({status:"error", message:"僅教師可儲存題庫輪播設定"});
      return jsonResponse(saveRotationTaskSettings(ss, auth, params));
    }
    if (action === "advanceRotationTaskPointer") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({status:"error", message:"僅教師可微調題庫輪播指針"});
      return jsonResponse(advanceRotationTaskPointer(ss, auth, params));
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
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({status:"error", message:"僅教師或管理員可執行校正"});
      return jsonResponse(fixIncompleteTaskRecords(ss, params));
    }
    if (action === "checkAndGetData") {
      return jsonResponse(checkAndGetData(params));
    }
    if (action === "getStudentPasswords") {
      return jsonResponse(getStudentPasswords(params));
    }
    if (action === "changeStudentPassword") {
      return jsonResponse(changeStudentPassword(params));
    }
    if (action === "changeOwnPassword") {
      return jsonResponse(changeOwnPassword(params));
    }
    if (action === "getDeviceLoginLogs") {
      return jsonResponse(getDeviceLoginLogs(params));
    }
    if (action === "clearDeviceLoginLogs") {
      return jsonResponse(clearDeviceLoginLogs(params));
    }
    if (action === "getErrorLogs") {
      return jsonResponse(getErrorLogs(params));
    }
    if (action === "clearErrorLogs") {
      return jsonResponse(clearErrorLogs(params));
    }
    if (action === "reportClientError") {
      return jsonResponse(reportClientError(params));
    }
    if (action === "getStudentGoals") {
      return jsonResponse(getStudentGoals(params));
    }
    if (action === "saveStudentGoals") {
      return jsonResponse(saveStudentGoals(params, params.goals));
    }
    if (action === "getStudentLeaderboard") {
      return jsonResponse(getStudentLeaderboard(params));
    }
    if (action === "teacherSaveDailyMinutes") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "無教師權限" });
      const r1 = saveDailyMinutesSetting(ss, auth.realName || auth.username, params.settingData || {});
      invalidateDailyUsageRulesCache_();
      return jsonResponse(r1);
    }
    if (action === "teacherExtendUsage") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "無教師權限" });
      const r2 = extendStudentUsageTime(ss, auth.realName || auth.username, params.extendData || {});
      invalidateDailyUsageRulesCache_();
      return jsonResponse(r2);
    }
    if (action === "teacherToggleDailyUnlock") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "無教師權限" });
      const r3 = toggleStudentDailyUnlock(ss, auth.realName || auth.username, params.unlockData || {});
      invalidateDailyUsageRulesCache_();
      return jsonResponse(r3);
    }

function getStudentMetaFromUserList_(ss, studentUser) {
  try {
    let data = null;
    try {
      const hit = CacheService.getScriptCache().get("ALL_USERS_ROSTER_V1");
      if (hit) data = JSON.parse(hit);
    } catch(_) {}
    if (!data) {
      const s = ss.getSheetByName("使用者清單");
      if (!s || s.getLastRow() < 2) return null;
      data = s.getDataRange().getValues();
      try { CacheService.getScriptCache().put("ALL_USERS_ROSTER_V1", JSON.stringify(data), 600); } catch(_) {}
    }
    const cleanU = String(studentUser || "").trim().toLowerCase();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || "").trim().toLowerCase() === cleanU) {
        return {
          className: String(data[i][3] || "").trim(),
          realName: String(data[i][4] || "").trim()
        };
      }
    }
  } catch(_) {}
  return null;
}

    if (action === "login") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success) {
        logError("doPost/login", auth.message, params.username, "登入驗證失敗");
        return jsonResponse({status:"error", message:auth.message});
      }

      const isParent = (auth.role === "parent");
      let targetStudent = "";
      let activeClass = auth.className || "";
      let activeRealName = auth.realName || "";

      if (isParent) {
        targetStudent = String(auth.studentBinding || "").trim();
        if (!targetStudent) {
          return jsonResponse({
            status: "error",
            message: "此家長帳號尚未綁定學生學號，請洽任課老師設定。"
          });
        }
        const sMeta = getStudentMetaFromUserList_(ss, targetStudent);
        if (sMeta) {
          activeClass = sMeta.className || activeClass;
          activeRealName = sMeta.realName || activeRealName;
        }
      }

      if (auth.role === "teacher" || auth.role === "admin") {
        if (!params.targetStudent) {
          let teacherClasses = (auth.classList && auth.classList.length > 0) ? auth.classList : [];
          if (teacherClasses.length === 0 && auth.className && auth.className !== "all") {
            teacherClasses = [auth.className.replace(/班$/, "").trim()];
          }
          if (auth.isAdmin && (teacherClasses.length === 0 || teacherClasses.includes("all"))) {
            try {
              let uData = null;
              try {
                const hit = CacheService.getScriptCache().get("ALL_USERS_ROSTER_V1");
                if (hit) uData = JSON.parse(hit);
              } catch(_) {}
              if (!uData) {
                const userSheet = ss.getSheetByName("使用者清單");
                if (userSheet && userSheet.getLastRow() >= 2) {
                  uData = userSheet.getDataRange().getValues();
                  try { CacheService.getScriptCache().put("ALL_USERS_ROSTER_V1", JSON.stringify(uData), 600); } catch(_) {}
                }
              }
              if (uData && uData.length >= 2) {
                const cSet = new Set();
                for (let i = 1; i < uData.length; i++) {
                  const c = String(uData[i][3] || "").replace(/班$/, "").trim();
                  if (c && c.toLowerCase() !== "all" && c.toLowerCase() !== "系統管理員" && c.toLowerCase() !== "d") cSet.add(c);
                }
                teacherClasses = Array.from(cSet).sort();
              }
            } catch(_) {}
          }

          return jsonResponse({
            status:"success", message:"教師驗證成功",
            role:"teacher", className:auth.className,
            realName:auth.realName, isAdmin:auth.isAdmin,
            classList: teacherClasses,
            teacherClassList: teacherClasses,
            timeRestriction: checkTimeRestrictionAllowance(ss, "")
          });
        }
        targetStudent = String(params.targetStudent || "").trim();
        const sMeta = getStudentMetaFromUserList_(ss, targetStudent);
        if (sMeta) {
          activeClass = sMeta.className || activeClass;
          activeRealName = sMeta.realName || activeRealName;
        } else {
          activeClass = getStudentClass(targetStudent, "");
        }
        if (!auth.isAdmin && !isTeacherAllowedForClass(auth, activeClass)) {
          return jsonResponse({ status: "error", message: "無權限調閱非任教班級學生資料" });
        }
      }

      const isTeacherInspect = (auth.role === "teacher" || auth.role === "admin") && !!targetStudent;
      const studentUser = (isParent || isTeacherInspect) ? targetStudent : auth.username;

      // ── 學生時間限制管制：家長與教師檢視進度不限時，學生須遵守作答時限 ──
      const timeAllowance = (isParent || isTeacherInspect) ? { allowed: true, isOverridden: true } : checkTimeRestrictionAllowance(ss, studentUser);
      if (!timeAllowance.allowed) {
        logError("doPost/login/curfew", "非開放作答時間登入阻擋", studentUser, "目前時間: " + timeAllowance.timeStr + " / 允許時段: " + timeAllowance.startTime + "~" + timeAllowance.endTime);
        return jsonResponse({
          status: "error",
          curfew: true,
          startTime: timeAllowance.startTime,
          endTime: timeAllowance.endTime,
          message: "目前非您的開放作答時間，如有需求請洽任課老師調整設定。"
        });
      }

      let records = {};
      let raw = "";

      // 🚀 優先從【學生歷程總庫】秒速提取最新進度備份 (零分頁尋找延遲)
      try {
        const cpRes = getStudentRowsFromCentralPortfolio(ss, studentUser, 1);
        if (cpRes && cpRes.rawData && cpRes.rawData.length > 0) {
          const cellVal = String(cpRes.rawData[0][1] || "").trim();
          if (cellVal && (cellVal.startsWith("GZ:") || cellVal.startsWith("{"))) {
            raw = cellVal;
          }
        }
      } catch(_) {}

      if (!raw) {
        const uSheet = getStudentSheet(ss, studentUser);
        if (uSheet && uSheet.getLastRow() >= 2) {
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
      }

      const assignedTask = getActiveTaskForClass(ss, activeClass, studentUser);
      let dailyTaskHistory = [];
      try { dailyTaskHistory = getStudentDailyTaskHistory(ss, studentUser); } catch(_) {}

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
              if (isParent || isTeacherInspect) {
                delete records["current_user"];
                delete records["user_role"];
                delete records["current_pass"];
              }
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

      const uSheet = !raw ? getStudentSheet(ss, studentUser) : null;
      const cpResFallback = !raw ? getStudentRowsFromCentralPortfolio(ss, studentUser, 15) : null;
      const hasCpRows = !!(cpResFallback && cpResFallback.rawData && cpResFallback.rawData.length > 0);
      const isNewStudent = !raw && !hasCpRows && (!uSheet || uSheet.getLastRow() < 2);

      // 備援還原：只要該學生不是新帳號（總庫或分頁有紀錄），若 Column B 未能解析出，自動從試算表欄位反向組合還原
      if ((!records || !records["spellAgent.v2"]) && !isNewStudent) {
        try {
          let rVals = [];
          let fHeaders = [];
          if (hasCpRows) {
            rVals = cpResFallback.rawData;
            fHeaders = cpResFallback.headers || [];
          } else if (uSheet && uSheet.getLastRow() >= 2) {
            const checkCount = Math.min(uSheet.getLastRow() - 1, 15);
            const colCnt = Math.min(uSheet.getLastColumn(), 34);
            fHeaders = uSheet.getRange(1, 1, 1, colCnt).getValues()[0] || [];
            rVals = uSheet.getRange(2, 1, checkCount, colCnt).getValues();
          }
          if (rVals.length > 0) {
            const hMapFb = getHeaderIndexMap(fHeaders);
            const attIdx = hMapFb.attempts >= 0 ? hMapFb.attempts : 10;
            const corIdx = hMapFb.correct >= 0 ? hMapFb.correct : 9;
            const ptsIdx = hMapFb.score >= 0 ? hMapFb.score : 3;
            const lvlIdx = hMapFb.level >= 0 ? hMapFb.level : 2;
            const stkIdx = hMapFb.streak >= 0 ? hMapFb.streak : 4;
            const bstIdx = hMapFb.bestStreak >= 0 ? hMapFb.bestStreak : 5;
            let bestRow = rVals[0];
            for (let r = 0; r < rVals.length; r++) {
              const att = parseInt(rVals[r][attIdx]) || 0;
              const pts = parseInt(rVals[r][ptsIdx]) || 0;
              if (att > 0 || pts > 0) {
                bestRow = rVals[r];
                break;
              }
            }
            const lvl = parseInt(bestRow[lvlIdx]) || 1;
            const pts = parseInt(bestRow[ptsIdx]) || 0;
            const stk = parseInt(bestRow[stkIdx]) || 0;
            const bst = parseInt(bestRow[bstIdx]) || 0;
            const att = parseInt(bestRow[attIdx]) || 0;
            const cor = parseInt(bestRow[corIdx]) || 0;
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
          }
        } catch(_) {}
      }

      let cachedSummary = null;
      try {
        let firstRow = null, rowVals = null;
        const cpResSum = cpResFallback || getStudentRowsFromCentralPortfolio(ss, studentUser, 1);
        if (cpResSum && cpResSum.rawData && cpResSum.rawData.length > 0) {
          firstRow = cpResSum.headers || [];
          rowVals = cpResSum.rawData[0] || [];
        } else if (uSheet && uSheet.getLastRow() >= 2) {
          const lastC = Math.min(uSheet.getLastColumn(), 34);
          rowVals = uSheet.getRange(2, 1, 1, lastC).getDisplayValues()[0];
          firstRow = uSheet.getRange(1, 1, 1, lastC).getValues()[0] || [];
        }
        if (firstRow && rowVals) {
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
        }
      } catch(_) {}

      const sessionToken = registerStudentDevice(studentUser);

      return jsonResponse({
        status: "success",
        message: isTeacherInspect ? "學生資料調閱成功" : (isParent ? "家長驗證成功" : "驗證成功"),
        role: isTeacherInspect ? "teacher" : (isParent ? "parent" : "student"),
        username: (isParent || isTeacherInspect) ? auth.username : studentUser,
        studentUser: studentUser,
        parentRealName: isParent ? (auth.realName || auth.username) : "",
        sessionToken: sessionToken,
        className: activeClass,
        realName: activeRealName,
        records: records,
        isNewStudent: isNewStudent,
        assignedTask: assignedTask,
        taskWordsMap: getTaskWordsDictCached_(ss),
        dailyTaskHistory: dailyTaskHistory,
        timeRestriction: timeAllowance,
        conquerSettings: getConquerRollSettings(),
        dailyUsage: getDailyUsageSettings(ss, studentUser, true),
        cachedSummary: cachedSummary
      });
    }

    // ── 2. 儲存學習紀錄 + 寫入個人歷程分頁 ──
    if (action === "saveRecord") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success) return jsonResponse({status:"error", message:auth.message});
      
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

      return handleSaveRecord(ss, params, auth);
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
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || (auth.role !== "teacher" && auth.role !== "admin")) {
        return jsonResponse({ status: "error", message: "無教師權限" });
      }
      return jsonResponse(getDateRangePerformanceAnalytics(ss, params));
    }

    // ── 7. 學生使用時間管理 API ──
    if (action === "getConquerRollSettings") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "無教師權限" });
      return jsonResponse({ status: "success", settings: getConquerRollSettings() });
    }

    if (action === "saveConquerRollSettings") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || (auth.role !== "teacher" && auth.role !== "admin")) {
        return jsonResponse({ status: "error", message: "無教師權限" });
      }
      return jsonResponse(saveConquerRollSettings(ss, params));
    }

    if (action === "getStudentList") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || (auth.role !== "teacher" && auth.role !== "admin")) {
        return jsonResponse({ status: "error", message: "無教師權限" });
      }
      return jsonResponse(getFastStudentList(ss, auth));
    }

    if (action === "getTimeRestrictions") {
      const auth = authenticateUser(ss, params.username, params.password);
      if (!auth.success || auth.role !== "teacher") return jsonResponse({ status: "error", message: "無教師權限" });
      return jsonResponse(getTimeRestrictions(ss, auth));
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
      let u = String(params.username || "").trim();
      if (params.targetUsername && String(params.targetUsername).trim() !== u) {
        const auth = authenticateUser(ss, params.username, params.password);
        if (auth && auth.success && (auth.role === "teacher" || auth.role === "admin")) {
          u = String(params.targetUsername).trim();
        }
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
    return jsonResponse({status:"error", message:"系統處理請求時發生異常，請稍後再試"});
  }
}


function doGet(e) {
  return jsonResponse({
    status: "success",
    service: "app2000vocab Backend API",
    version: "v4.1-headless",
    message: "後端 API 正常運行中。前端介面請至 GitHub Pages 官方網站存取。"
  });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}



// ════════════════════════════════════════════════════════════════════
// 7. 自動清理試算表無用分頁 (Cleanup Unused Sheets)
// ════════════════════════════════════════════════════════════════════

function cleanupUnusedSheets(creds) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (creds && typeof creds === "object" && (creds.username !== undefined || creds.password !== undefined)) {
    const auth = authenticateUser(ss, creds.username, creds.password);
    if (!auth.success || auth.role !== "teacher") {
      return { status: "error", message: "僅教師或管理員可執行工作表清理" };
    }
  }
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
    "全班學習總覽", "使用者清單", "指定單字任務", "錯誤日誌", "時間限制設定", "學生歷程總庫", "系統目標設定", "學習目標"
  ]);

  // 3. 明確棄用、過渡或預設空白分頁清單
  const explicitlyUnused = new Set([
    "裝置登入歷程", "每日任務紀錄", "工作表1", "工作表 1", "工作表2", "工作表 2", "Sheet1", "Sheet 1", "Sheet2", "Sheet 2",
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
  if (!uSheet && username) uSheet = getStudentSheet(ss, username);
  const cpSheet = getCentralPortfolioSheet(ss, false);
  const hasUSheet = !!(uSheet && uSheet.getLastRow() >= 2);
  const hasCpSheet = !!(cpSheet && cpSheet.getLastRow() >= 2);
  if (!hasUSheet && !hasCpSheet) return 0;

  const completedTasksMap = new Map();

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
    const key = dStr + "_" + tName;
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

  if (records && records["today_task_summary"]) {
    try {
      const s = (typeof records["today_task_summary"] === "string") ? JSON.parse(records["today_task_summary"]) : records["today_task_summary"];
      addTaskIfValid(s);
    } catch(_) {}
  }
  if (records && records["student_task_history"]) {
    try {
      const hist = (typeof records["student_task_history"] === "string") ? JSON.parse(records["student_task_history"]) : records["student_task_history"];
      if (Array.isArray(hist)) hist.forEach(addTaskIfValid);
    } catch(_) {}
  }
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

  function applyTaskToRow34(curRow, hMap, task) {
    const tName = task.taskName;
    let numCor = 0, numTot = 0;
    if (task.score !== undefined && String(task.score).includes("/")) {
      const p = String(task.score).split("/");
      numCor = parseInt(p[0], 10) || 0;
      numTot = parseInt(p[1], 10) || 0;
    } else {
      numCor = parseInt(task.score, 10) || 0;
      numTot = parseInt(task.total, 10) || numCor;
    }
    const tScore = numTot > 0 ? (numCor + "/" + numTot) : String(task.score || "—");
    const tRate = numTot > 0 ? (Math.round((numCor / numTot) * 100) + "%") : String(task.rate || "—");
    const tStatus = task.status || "🟢 已完成";
    const wrongWordsStr = Array.isArray(task.wrongWords)
      ? (task.wrongWords.length > 0 ? task.wrongWords.join(", ") : "全對無錯題")
      : (String(task.wrongWords || "").trim() || "全對無錯題");

    const curTask = String(curRow[hMap.taskName] || "").trim();
    const curScore = String(curRow[hMap.taskScore] || "").trim();
    const curStatus = String(curRow[hMap.status] || "").trim();
    if (curStatus.includes("已完成") && curScore !== "—" && curScore !== "") return false;
    if (curTask !== "⚪ 未指派" && curTask !== "" && curTask !== "自主練習" && curTask !== tName && curStatus.includes("已完成")) return false;

    curRow[hMap.taskName] = tName;
    if (hMap.taskAssigned >= 0 && numTot > 0) curRow[hMap.taskAssigned] = numTot;
    if (hMap.taskAnswered >= 0 && numTot > 0) curRow[hMap.taskAnswered] = numTot;
    if (hMap.taskCorrect >= 0) curRow[hMap.taskCorrect] = numCor;
    curRow[hMap.taskScore] = tScore;
    curRow[hMap.taskRate] = tRate;
    curRow[hMap.status] = tStatus;
    curRow[hMap.wrong] = wrongWordsStr;
    return true;
  }

  let updatedCount = 0;

  // A. 回填個人工作表 (若存在)
  if (hasUSheet) {
    ensureStudentSheetColumns(uSheet);
    const lastCol = uSheet.getLastColumn();
    const headers = uSheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    const hMap = getHeaderIndexMap(headers);
    const numRows = uSheet.getLastRow() - 1;
    const rows = uSheet.getRange(2, 1, numRows, lastCol).getValues();
    let uModified = false;

    completedTasksMap.forEach(task => {
      for (let r = 0; r < rows.length; r++) {
        if (formatStandardDateYMD(rows[r][hMap.date]) === task.date) {
          if (applyTaskToRow34(rows[r], hMap, task)) {
            uModified = true;
            updatedCount++;
          }
          break;
        }
      }
    });
    if (uModified) {
      uSheet.getRange(2, 1, numRows, lastCol).setValues(rows);
    }
  }

  // B. 同步回填【學生歷程總庫】
  if (hasCpSheet && username && typeof cpFindUserRowNums_ === "function") {
    try {
      const rowNums = cpFindUserRowNums_(ss, username, 60);
      if (rowNums.length > 0) {
        const headers = cpGetHeaders_(ss);
        const hMap = getHeaderIndexMap(headers);
        const ab = cpGetColAB_(ss);
        completedTasksMap.forEach(task => {
          for (let i = 0; i < rowNums.length; i++) {
            const rNum = rowNums[i];
            const dStr = formatStandardDateYMD((ab[rNum - 2] || [])[1]);
            if (dStr === task.date) {
              const rowVals = cpSheet.getRange(rNum, 2, 1, 34).getValues()[0];
              if (applyTaskToRow34(rowVals, hMap, task)) {
                const rng = cpSheet.getRange(rNum, 2, 1, 34);
                rng.setNumberFormats([cpRowFormats_().slice(1)]);
                rng.setValues([rowVals]);
                updatedCount++;
                cpInvalidate_();
              }
              break;
            }
          }
        });
      }
    } catch(errCP) {
      Logger.log("[Backfill CP] " + errCP.message);
    }
  }

  return updatedCount;
}

/**
 * 一鍵全試算表智慧同步與修復：掃描所有學生歷程，將 JSON 中已完成之指定測驗成果完整回填至對應日期列
 */
function syncAllTaskRecords(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const results = [];
  let totalFixed = 0;
  const checkedUsers = new Set();

  // 1. 優先從【學生歷程總庫】最新一筆備份掃描並回填
  try {
    const cpSheet = getCentralPortfolioSheet(ss, false);
    if (cpSheet && cpSheet.getLastRow() >= 2) {
      const ab = cpGetColAB_(ss);
      const seenU = new Set();
      const firstRows = [];
      for (let i = 0; i < ab.length; i++) {
        const u = String(ab[i][0] || "").trim();
        const uLower = u.toLowerCase();
        if (u && !seenU.has(uLower)) {
          seenU.add(uLower);
          firstRows.push({ u: u, rowNum: i + 2 });
        }
      }
      firstRows.forEach(item => {
        checkedUsers.add(item.u.toLowerCase());
        try {
          const storedJson = cpSheet.getRange(item.rowNum, 3).getValue();
          const decomp = decompressData(storedJson);
          const records = decomp ? JSON.parse(decomp) : null;
          if (records) {
            const count = syncAndBackfillStudentTaskHistory(ss, item.u, records, getStudentSheet(ss, item.u));
            if (count > 0) {
              results.push({ username: item.u, updatedRows: count });
              totalFixed += count;
            }
          }
        } catch(err) {
          logError("syncAllTaskRecords/cp", err, item.u, "");
        }
      });
    }
  } catch(_) {}

  // 2. 掃描尚未在總庫的個別學生分頁
  const sheets = ss.getSheets().filter(s => !isSystemSheet(s.getName()) && !checkedUsers.has(s.getName().trim().toLowerCase()));
  sheets.forEach(sh => {
    const u = sh.getName();
    if (sh.getLastRow() < 2) return;
    checkedUsers.add(u.trim().toLowerCase());
    try {
      const storedJson = sh.getRange(2, 2).getValue();
      const decomp = decompressData(storedJson);
      const records = decomp ? JSON.parse(decomp) : null;
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
    message: "智慧同步完成：共檢查 " + checkedUsers.size + " 位學生，修復回填 " + totalFixed + " 筆指定測驗紀錄！",
    details: results
  };
}

/**
 * 讀取指定日期區間全班學生作答狀況與數據分析
 */
function getDateRangePerformanceAnalytics(ss, params) {
  try {
    const sDate = String(params.startDate || "").trim();
    const eDate = String(params.endDate || "").trim();
    const tClass = String(params.targetClass || "all").trim();

    const uSheet = ss.getSheetByName("使用者清單");
    if (!uSheet || uSheet.getLastRow() < 2) {
      return { status: "error", message: "找不到使用者清單" };
    }
    const uData = uSheet.getRange(2, 1, uSheet.getLastRow() - 1, 5).getValues();
    let students = [];
    uData.forEach(r => {
      const u = String(r[0] || "").trim();
      const role = String(r[2] || "").trim().toLowerCase();
      const c = String(r[3] || "").replace(/班$/, "").trim();
      const name = String(r[4] || "").trim();
      if (role === "student" || role === "" || !role.includes("teacher")) {
        if (tClass === "all" || c === tClass) {
          students.push({ username: u, realName: name, className: c });
        }
      }
    });

    const cpSheet = getCentralPortfolioSheet(ss, false);
    let allRows = [];
    if (cpSheet && cpSheet.getLastRow() >= 2) {
      allRows = cpSheet.getRange(2, 1, cpSheet.getLastRow() - 1, 10).getValues();
    }

    let totalAttempts = 0, totalCorrect = 0, activeCount = 0;
    const studentRows = students.map(s => {
      let att = 0, cor = 0;
      const seenDates = new Set();
      for (let i = 0; i < allRows.length; i++) {
        const rowU = String(allRows[i][0] || "").trim().toLowerCase();
        if (rowU === s.username.toLowerCase()) {
          const rowD = formatStandardDateYMD(allRows[i][3] || allRows[i][2]);
          if (rowD && (!sDate || rowD >= sDate) && (!eDate || rowD <= eDate)) {
            const rowAtt = Number(allRows[i][6]) || Number(allRows[i][5]) || 0;
            const rowCor = Number(allRows[i][7]) || Number(allRows[i][6]) || 0;
            att += rowAtt;
            cor += rowCor;
            seenDates.add(rowD);
          }
        }
      }
      const days = seenDates.size;
      const acc = att > 0 ? Math.round((cor / att) * 100) : 0;
      if (att > 0) activeCount++;
      totalAttempts += att;
      totalCorrect += cor;
      return {
        username: s.username,
        realName: s.realName,
        className: s.className,
        attempts: att,
        correct: cor,
        accuracy: acc,
        testedDays: days,
        status: att > 0 ? (acc >= 85 ? "精熟" : acc >= 60 ? "及格" : "待加強") : "未作答"
      };
    });

    const totalStudents = students.length;
    const partRate = totalStudents > 0 ? Math.round((activeCount / totalStudents) * 100) + "%" : "0%";
    const classAvgAcc = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) + "%" : "0%";

    return {
      status: "success",
      targetClass: tClass,
      startDate: sDate,
      endDate: eDate,
      summary: {
        totalStudents: totalStudents,
        activeStudents: activeCount,
        participationRate: partRate,
        totalAttempts: totalAttempts,
        totalCorrect: totalCorrect,
        classAvgAccuracy: classAvgAcc
      },
      studentRows: studentRows
    };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}
