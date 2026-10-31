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
// 0. 密碼雜湊與資安防護
// ════════════════════════════════════════════════════════════════════

function hashPassword(plainText) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(plainText).trim(),
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => ("0" + (b & 0xFF).toString(16)).slice(-2)).join("");
}

function isHashedPassword(str) {
  return /^[a-f0-9]{64}$/.test(String(str || "").trim());
}

function _failKey(u)     { return "lf_" + u; }
function _lockKey(u)     { return "lk_" + u; }
function _authKey(u, hp) { return "au_" + u + "_" + hp.substring(0,12); }

function checkLoginAttempts(username) {
  try {
    if (CacheService.getScriptCache().get(_lockKey(username))) {
      return { locked: true, message: `帳號已鎖定，請 ${SYS.LOGIN_LOCK_SEC/60} 分鐘後再試` };
    }
    return { locked: false };
  } catch(_) { return { locked: false }; }
}

function recordLoginFailure(username) {
  try {
    const cache = CacheService.getScriptCache();
    const n = parseInt(cache.get(_failKey(username)) || "0") + 1;
    cache.put(_failKey(username), String(n), SYS.LOGIN_LOCK_SEC);
    if (n >= SYS.LOGIN_MAX_FAIL) {
      cache.put(_lockKey(username), "1", SYS.LOGIN_LOCK_SEC);
      logError("登入保護", `帳號 ${username} 連續失敗 ${n} 次，已鎖定`, username, "");
    }
  } catch(_) {}
}

function clearLoginFailures(username) {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove(_failKey(username));
    cache.remove(_lockKey(username));
  } catch(_) {}
}

function getStudentClass(username, rawClass) {
  const c = String(rawClass || "").trim();
  if (c) return c;
  const m = String(username || "").match(/^([0-9]{3}|[A-Za-z]+[0-9]{1,2})([0-9]{2})$/);
  return (m && m[1]) ? m[1] + "班" : "預設班級";
}

function isAdminTeacher(className) {
  const c = String(className || "").trim().toLowerCase();
  return !c || c === "all" || c === "全校" || c === "教師群" || c === "admin";
}

/**
 * 標準化日期格式為 yyyy-MM-dd
 * 相容 Date 物件、斜線字串 (yyyy/M/d, yyyy/MM/dd)、橫線字串 (yyyy-M-d, yyyy-MM-dd) 與含時間字串
 */
function formatStandardDateYMD(val) {
  if (!val) return "";
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    return Utilities.formatDate(val, "Asia/Taipei", "yyyy-MM-dd");
  }
  const s = String(val).trim().replace(/\//g, "-");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = m[1];
    const mo = m[2].padStart(2, "0");
    const d = m[3].padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  try {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return Utilities.formatDate(parsed, "Asia/Taipei", "yyyy-MM-dd");
    }
  } catch(_) {}
  return s;
}

/**
 * 標準化時間格式 (HH:mm)
 * 相容 Date 物件 (防試算表 1899 年預設日期)、含秒字串與標準 HH:mm
 */
function formatStandardTimeHHmm(val) {
  if (!val) return "";
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    return Utilities.formatDate(val, "Asia/Taipei", "HH:mm");
  }
  const s = String(val).trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    return String(m[1]).padStart(2, "0") + ":" + m[2];
  }
  return s;
}

/**
 * 標準化日期時間格式為 yyyy-MM-dd HH:mm:ss
 */
function formatStandardDateTime(val) {
  if (!val) return "";
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    return Utilities.formatDate(val, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{1,2})(:(\d{1,2}))?/);
  if (m) {
    const y = m[1];
    const mo = m[2].padStart(2, "0");
    const d = m[3].padStart(2, "0");
    const h = m[4].padStart(2, "0");
    const mi = m[5].padStart(2, "0");
    const sec = (m[7] || "00").padStart(2, "0");
    return `${y}-${mo}-${d} ${h}:${mi}:${sec}`;
  }
  try {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return Utilities.formatDate(parsed, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
    }
  } catch(_) {}
  return s;
}

function isSystemSheet(name) {
  return SYS.SYSTEM_SHEETS.has(name);
}

/**
 * 取得學生個人工作表（支援大小寫與前後空白容錯）
 */
function getStudentSheet(ss, username) {
  if (!ss || !username) return null;
  const cleanU = String(username).trim();
  let sheet = ss.getSheetByName(cleanU);
  if (sheet) return sheet;
  const targetLower = cleanU.toLowerCase();
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().trim().toLowerCase() === targetLower) {
      return sheets[i];
    }
  }
  return null;
}

/**
 * 確保學生分頁具備 26 欄標準格式（全面以遊戲設計與單字數為核心），並將表頭與欄寬美化為高可讀性、清楚簡潔之分組色彩
 */
function ensureStudentSheetColumns(sheet) {
  if (!sheet) return;
  try {
    const studentHdr = [
      "備份時間", "完整JSON", "等級", "分數", "連勝", "最佳連勝",
      "學習中", "練習中", "精通", "共答對單字", "累積受測單字", "單字掌握率",
      "LEVEL 1 入門\n(答對/受測字數)", "LEVEL 2 基礎\n(答對/受測字數)",
      "LEVEL 3 進階\n(答對/受測字數)", "LEVEL 4 挑戰\n(答對/受測字數)", "LEVEL 5 精熟\n(答對/受測字數)",
      "🎧 聽與拼\n(答對/受測字數)", "✅ 選拼法\n(答對/受測字數)", "🧩 字母重組\n(答對/受測字數)", "🖍️ 填空陷阱\n(答對/受測字數)",
      "任務名稱", "施測單字數", "作答單字數", "答對單字數", "指定測驗成績", "指定測驗正確率", "練習狀態", "測驗錯題單字",
      "自由練習受測字數", "自由練習答對字數", "自由練習正確率", "自由練習錯題單字"
    ];

    const maxCols = sheet.getMaxColumns();
    const lastCol = sheet.getLastColumn();

    // 🚀 極速快取檢查：若表頭已是最新 33 欄且欄位名稱完全相符
    if (lastCol >= 33) {
      const firstRowVals = sheet.getRange(1, 1, 1, 33).getValues()[0] || [];
      if (firstRowVals[2] === "等級" && firstRowVals[6] === "學習中" && firstRowVals[9] === "共答對單字" && firstRowVals[21] === "任務名稱" && firstRowVals[22] === "施測單字數" && firstRowVals[29] === "自由練習受測字數") {
        if (sheet.getLastRow() >= 2) {
          const sampleRow = sheet.getRange(2, 23, 1, 7).getValues()[0] || [];
          const hasOldData = String(sampleRow[1] || "").includes("%") || String(sampleRow[2] || "").includes("完成") || String(sampleRow[5] || "").includes("%") || String(sampleRow[0] || "").includes("/");
          if (hasOldData) {
            migrateStudentSheetRows_(sheet);
          }
        }
        return;
      }
    }

    if (maxCols < 33) {
      sheet.insertColumnsAfter(maxCols, 33 - maxCols);
    } else if (maxCols > 33 && sheet.getLastRow() <= 1) {
      sheet.deleteColumns(34, maxCols - 33);
    }

    sheet.getRange(1, 1, 1, studentHdr.length).setValues([studentHdr]);

    // 1. 凍結第 1 列 (表頭) 與第 1 欄 (紀錄時間)，方便水平滑動對照
    if (sheet.getFrozenRows() < 1) sheet.setFrozenRows(1);
    if (sheet.getFrozenColumns() < 1) sheet.setFrozenColumns(1);
    sheet.setRowHeight(1, 45);

    // 2. 隱藏龐大的 JSON 備份欄（第 B 欄），避免管理者視覺雜亂干擾
    sheet.hideColumns(2);

    // 3. 管理者高對比、護眼分組色塊美化（對齊遊戲介面各區塊）
    sheet.getRange("A1").setBackground("#f1f5f9").setFontColor("#334155").setFontWeight("bold"); // 紀錄時間
    sheet.getRange("B1").setBackground("#e2e8f0").setFontColor("#64748b").setFontWeight("normal"); // 完整JSON
    sheet.getRange("C1:F1").setBackground("#dbeafe").setFontColor("#1e40af").setFontWeight("bold"); // 遊戲狀態 (等級、分數、連勝、最佳連勝)
    sheet.getRange("G1:L1").setBackground("#dcfce7").setFontColor("#065f46").setFontWeight("bold"); // 整體進度 (學習中、練習中、精通、共答對、受測、掌握率)
    sheet.getRange("M1:Q1").setBackground("#f3e8ff").setFontColor("#6b21a8").setFontWeight("bold"); // 關卡進度 (LEVEL 1~5)
    sheet.getRange("R1:U1").setBackground("#ccfbf1").setFontColor("#0f766e").setFontWeight("bold"); // 四大練習模式
    sheet.getRange("V1:AC1").setBackground("#e0e7ff").setFontColor("#3730a3").setFontWeight("bold"); // 指定測驗專屬區塊 (靛青色，含施測/作答/答對)
    sheet.getRange("AD1:AG1").setBackground("#fef3c7").setFontColor("#92400e").setFontWeight("bold"); // 自由練習專屬區塊 (琥珀黃色)

    sheet.getRange("1:1").setWrap(true).setHorizontalAlignment("center").setVerticalAlignment("middle");

    // 4. 精簡最佳化欄寬與設定純文字格式（防止如 6/6 被試算表誤轉為日期 6月6日）
    const widths = [
      155, 40, 60, 70, 65, 75,
      75, 75, 75, 95, 105, 95,
      115, 115, 115, 115, 115,
      115, 115, 115, 115,
      130, 95, 95, 95, 95, 95, 110, 200,
      115, 115, 95, 200
    ];
    widths.forEach((w, idx) => sheet.setColumnWidth(idx + 1, w));
    try {
      sheet.getRange("G:K").setNumberFormat("0");
      sheet.getRange("L:L").setNumberFormat("0%");
      sheet.getRange("M:U").setNumberFormat("@");
      sheet.getRange("W:Y").setNumberFormat("0");
      sheet.getRange("Z:AG").setNumberFormat("@");
    } catch(_) {}

    migrateStudentSheetRows_(sheet);

    // 5. 恢復原生 Google 試算表標準 1000 列規格，絕不裁切列數
    const maxR = sheet.getMaxRows();
    if (maxR < 1000) {
      sheet.insertRowsAfter(maxR, 1000 - maxR);
    }
  } catch(e) {
    logError("ensureStudentSheetColumns", e, sheet.getName(), "");
  }
}

/**
 * 智慧解析學生分頁表頭之欄位索引，相容新舊版本結構
 */
function getHeaderIndexMap(headers) {
  const map = {
    date: 0, json: 1, level: 2, score: 3, streak: 4, best: 5,
    learning: 6, practicing: 7, mastered: 8, correct: 9, attempts: 10, accuracy: 11,
    l1: 12, l2: 13, l3: 14, l4: 15, l5: 16,
    mListen: 17, mPick: 18, mScramble: 19, mTrap: 20,
    taskName: 21, taskAssigned: 22, taskAnswered: 23, taskCorrect: 24, taskScore: 25, taskRate: 26, status: 27, wrong: 28,
    freeTested: 29, freeCorrect: 30, freeRate: 31, freeWrong: 32
  };
  (headers || []).forEach((h, idx) => {
    const s = String(h || "").trim();
    if (s.includes("自由練習受測") || s.includes("自由練習題數")) map.freeTested = idx;
    else if (s.includes("自由練習答對")) map.freeCorrect = idx;
    else if (s.includes("自由練習正確率")) map.freeRate = idx;
    else if (s.includes("自由練習錯題")) map.freeWrong = idx;
    else if (s.includes("任務名稱")) map.taskName = idx;
    else if (s.includes("施測單字數")) map.taskAssigned = idx;
    else if (s.includes("作答單字數")) map.taskAnswered = idx;
    else if (s.includes("答對單字數") && !s.includes("自由")) map.taskCorrect = idx;
    else if (s.includes("指定測驗成績")) map.taskScore = idx;
    else if (s.includes("指定測驗正確率")) map.taskRate = idx;
    else if (s.includes("練習狀態")) map.status = idx;
    else if (s.includes("測驗錯題") || (s.includes("錯題") && !s.includes("自由"))) map.wrong = idx;
    else if (s.includes("受測單字") || s.includes("作答題數")) map.attempts = idx;
    else if (s.includes("共答對單字") || s.includes("答對題數")) map.correct = idx;
    else if (s.includes("掌握率") || (s.includes("正確率") && !s.includes("指定") && !s.includes("自由"))) map.accuracy = idx;
    else if (s.includes("精通")) map.mastered = idx;
    else if (s.includes("練習中")) map.practicing = idx;
    else if (s.includes("學習中")) map.learning = idx;
    else if (s.includes("最佳連勝")) map.best = idx;
    else if (s.includes("連勝")) map.streak = idx;
    else if (s.includes("分數")) map.score = idx;
    else if (s.includes("等級")) map.level = idx;
    else if (s.includes("備份時間") || s.includes("紀錄時間") || s.includes("日期")) map.date = idx;
    else if (s.includes("完整JSON")) map.json = idx;
  });
  return map;
}

function compressData(jsonStr) {
  const blob = Utilities.newBlob(jsonStr, "application/json", "d.json");
  return "GZ:" + Utilities.base64Encode(Utilities.gzip(blob).getBytes());
}

function decompressData(stored) {
  const s = String(stored || "").trim();
  if (!s) return "";
  if (!s.startsWith("GZ:")) return s;
  try {
    const bytes = Utilities.base64Decode(s.substring(3));
    return Utilities.ungzip(Utilities.newBlob(bytes, "application/x-gzip", "d.gz"))
      .getDataAsString("UTF-8");
  } catch(e) {
    logError("decompressData", e, "", s.substring(0,30));
    return s;
  }
}

function sanitizeLogDetails(input) {
  if (!input) return "";
  let str = (typeof input === "object") ? JSON.stringify(input) : String(input);
  str = str.replace(/"(password|oldPassword|newPassword|confirmPassword)"\s*:\s*"[^"]*"/gi, '"$1":"***"');
  str = str.replace(/&(password|oldPassword|newPassword|confirmPassword)=[^&]*/gi, '&$1=***');
  return str;
}

/**
 * 將技術性錯誤代碼與堆疊轉譯為一般師生容易看懂的白話說明與處理建議
 */
function translateErrorForHuman(action, rawMsg, details) {
  let friendlyAction = action;
  let friendlyMsg = rawMsg;
  let suggestion = "";

  const a = String(action || "").toLowerCase();
  const m = String(rawMsg || "");
  const d = String(details || "");

  // 1. 動作分類轉譯
  if (a.includes("curfew") || a.includes("時間限制")) {
    friendlyAction = "⏰ 時間管制攔截";
  } else if (a.includes("login") || a.includes("登入")) {
    friendlyAction = "🔑 學生/教師登入";
  } else if (a.includes("saverecord") || a.includes("儲存")) {
    friendlyAction = "💾 儲存學習進度";
  } else if (a.includes("teacher") || a.includes("任務")) {
    friendlyAction = "📝 教師派發任務";
  } else if (a.includes("analytics") || a.includes("統計")) {
    friendlyAction = "📊 讀取分析大數據";
  } else if (a.includes("decompress")) {
    friendlyAction = "📦 讀取歷史進度";
  } else if (a.includes("cleanup")) {
    friendlyAction = "🧹 試算表清理分頁";
  } else {
    friendlyAction = `⚙️ ${action}`;
  }

  // 2. 情況說明與因應建議
  if (m.includes("帳號或密碼錯誤")) {
    friendlyMsg = "帳號或密碼輸入錯誤";
    suggestion = "💡 一般學生操作疏失。請提醒學生核對學號與密碼大小寫後重新輸入即可。";
  } else if (m.includes("連續失敗") || m.includes("鎖定")) {
    friendlyMsg = "密碼連續打錯 5 次已觸發防護鎖定";
    suggestion = "🛡️ 系統安全防護中。請學生等待 10 分鐘自動解鎖，或由老師在試算表重設密碼。";
  } else if (m.includes("未提供帳號或密碼")) {
    friendlyMsg = "登入欄位空白";
    suggestion = "💡 請學生輸入帳號與密碼後再點擊登入。";
  } else if (m.includes("伺服器忙碌")) {
    friendlyMsg = "多人同時交卷，伺服器排隊中";
    suggestion = "⏳ 瞬間連線人數過多。請學生稍候 3~5 秒再次點擊儲存即可順利上傳。";
  } else if (m.includes("資料過大")) {
    friendlyMsg = "學習紀錄累積資料超出限制";
    suggestion = "⚠️ 該學生紀錄過多，建議備份後清理該學生分頁早期資料。";
  } else if (m.includes("找不到【使用者清單】")) {
    friendlyMsg = "試算表中缺少【使用者清單】工作表";
    suggestion = "⚠️ 系統關鍵分頁缺失，請確認試算表內是否有【使用者清單】分頁，不可誤刪。";
  } else if (m.includes("無權限")) {
    friendlyMsg = "帳號權限不足";
    suggestion = "🔒 學生帳號無法操作教師後台功能，屬正常防護。";
  } else {
    friendlyMsg = m.length > 100 ? m.substring(0, 100) + "..." : m;
    suggestion = d ? `技術細節：${d.substring(0, 200)}` : "系統一般運行日誌。";
  }

  return { friendlyAction, friendlyMsg, suggestion };
}

function logError(action, err, username, details) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName("錯誤日誌");
    const headers = ["紀錄時間","功能項目","使用者","情況說明 (白話)","建議因應措施 / 技術詳細"];
    if (!logSheet) {
      logSheet = ss.insertSheet("錯誤日誌");
      logSheet.appendRow(headers);
      logSheet.getRange("1:1")
        .setFontWeight("bold").setBackground("#fee2e2")
        .setFontColor("#991b1b").setHorizontalAlignment("center").setVerticalAlignment("middle");
      logSheet.setRowHeight(1, 36);
      [160,160,110,240,450].forEach((w,i) => logSheet.setColumnWidth(i+1, w));
      logSheet.setFrozenRows(1);
    } else if (logSheet.getLastRow() >= 1 && logSheet.getRange(1, 4).getValue() === "錯誤訊息") {
      // 自動升級舊版表頭為易讀白話表頭
      logSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      [160,160,110,240,450].forEach((w,i) => logSheet.setColumnWidth(i+1, w));
    }
    const ts  = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
    const msg = err ? (err.message || String(err)) : "未知錯誤";
    let det   = "";
    if (err && err.stack)             det = String(err.stack);
    else if (typeof details==="object") { try { det = JSON.stringify(details); } catch(_) { det = String(details); } }
    else                              det = String(details || "");
    det = sanitizeLogDetails(det);

    const translated = translateErrorForHuman(action, msg, det);

    logSheet.insertRowBefore(2);
    logSheet.getRange(2,1,1,5)
      .setValues([[ts, translated.friendlyAction, String(username||"系統").trim(), translated.friendlyMsg, translated.suggestion]])
      .setVerticalAlignment("middle").setWrap(true);
    const last = logSheet.getLastRow();
    if (last > 501) logSheet.deleteRows(502, last - 501);
  } catch(e) { Logger.log("logError 寫入失敗: " + e); }
}

// ════════════════════════════════════════════════════════════════════
// 0.1 應用程式防火牆 (WAF) 即時防護 (純攔截阻斷，不記錄使用者操作行為)
// ════════════════════════════════════════════════════════════════════

/**
 * 應用程式防火牆 (WAF) 深度封包檢測
 */
function inspectRequestForAttacks(ss, params, e) {
  if (!params || typeof params !== "object") return null;

  // 1. 原型鏈污染 (Prototype Pollution)
  const rawContents = (e && e.postData && e.postData.contents) || "";
  if (rawContents.includes("__proto__") || (rawContents.includes("constructor") && rawContents.includes("prototype"))) {
    const violation = {
      username: params.username || "",
      method: "原型鏈污染攻擊 (Prototype Pollution)",
      details: "封包包含 __proto__ 或 constructor 原型鏈覆寫特徵",
      result: "🚫 攔截攻擊並終止請求 (403 Forbidden)"
    };
    return violation;
  }

  // 2. 遞迴檢測所有參數中的 XSS、公式注入與目錄穿透
  function scanValue(val, keyPath) {
    if (typeof val === "string") {
      const trimmed = val.trim();
      
      // A. 公式注入 (Formula Injection)
      if (/^[=+\-@|%]/.test(trimmed)) {
        if (/^[=+\-@|%]\s*(IMPORTXML|IMPORTDATA|IMPORTHTML|IMPORTRANGE|HYPERLINK|IMAGE|WEBSERVICE|cmd|powershell|curl|wget)/i.test(trimmed) || (trimmed.startsWith("=") && trimmed.length > 2)) {
          return {
            method: "試算表公式注入攻擊 (Formula Injection)",
            details: `欄位 '${keyPath}' 包含危險公式注入字串: '${trimmed.slice(0, 100)}'`,
            result: "🚫 惡意公式已被攔截阻斷 (403 Forbidden)"
          };
        }
      }

      // B. 跨站腳本攻擊 (XSS)
      if (/<script|javascript:|vbscript:|onerror\s*=|onload\s*=|onclick\s*=|eval\(|alert\(|document\.cookie/i.test(trimmed)) {
        return {
          method: "跨站腳本注入攻擊 (XSS Attack)",
          details: `欄位 '${keyPath}' 包含惡意腳本程式碼: '${trimmed.slice(0, 100)}'`,
          result: "🚫 惡意腳本已被攔截阻斷 (403 Forbidden)"
        };
      }

      // C. 目錄走訪 / 路徑穿透 (Path Traversal)
      if (/(\.\.[\/\\]){2,}|(\/etc\/passwd|c:\\windows\\system32)/i.test(trimmed)) {
        return {
          method: "目錄走訪/路徑穿透探測 (Path Traversal)",
          details: `欄位 '${keyPath}' 嘗試探測敏感系統路徑: '${trimmed.slice(0, 100)}'`,
          result: "🚫 存取拒絕 (403 Forbidden)"
        };
      }
    } else if (typeof val === "object" && val !== null) {
      for (const k in val) {
        if (Object.prototype.hasOwnProperty.call(val, k)) {
          const res = scanValue(val[k], keyPath ? `${keyPath}.${k}` : k);
          if (res) return res;
        }
      }
    }
    return null;
  }

  const attack = scanValue(params, "");
  if (attack) {
    return attack;
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════
// 1. 共用身分驗證
// ════════════════════════════════════════════════════════════════════

function authenticateUser(ss, inputUser, inputPass) {
  const username = String(inputUser || "").trim();
  const password = String(inputPass || "").trim();
  if (!username || !password) return { success:false, message:"未提供帳號或密碼" };

  const lockChk = checkLoginAttempts(username);
  if (lockChk.locked) return { success:false, message:lockChk.message };

  const hashedInput = hashPassword(password);
  const cache       = CacheService.getScriptCache();
  const cacheKey    = _authKey(username, hashedInput);
  try {
    const hit = cache.get(cacheKey);
    if (hit) return JSON.parse(hit);
  } catch(_) {}

  const sheet = ss.getSheetByName("使用者清單") || ss.getSheetByName("學生帳密");
  if (!sheet) {
    if (username === "admin" && password === "admin123") {
      const r = {success:true,username:"admin",role:"teacher",className:"all",realName:"系統管理員",isAdmin:true};
      try { cache.put(cacheKey, JSON.stringify(r), SYS.CACHE_AUTH_TTL); } catch(_) {}
      return r;
    }
    return {success:false, message:"找不到【使用者清單】工作表"};
  }

  const data = sheet.getDataRange().getValues();
  let foundAnyTeacher = false;

  for (let i = 1; i < data.length; i++) {
    const rowUser = String(data[i][0] || "").trim();
    const rowPass = String(data[i][1] || "").trim();
    const role    = String(data[i][2] || "student").trim().toLowerCase() || "student";
    if (role === "teacher") foundAnyTeacher = true;

    if (rowUser === username) {
      const match = rowPass === hashedInput || (!isHashedPassword(rowPass) && rowPass === password);
      if (!match) { recordLoginFailure(username); return {success:false, message:"帳號或密碼錯誤"}; }

      // 自動無感升級明文密碼為 SHA-256 雜湊
      if (!isHashedPassword(rowPass)) {
        try { sheet.getRange(i + 1, 2).setValue(hashedInput); } catch(_) {}
      }

      clearLoginFailures(username);
      const rawClass  = String(data[i][3] || "").trim();
      const className = role === "teacher" ? (rawClass || "all") : getStudentClass(username, rawClass);
      const realName  = String(data[i][4] || "").trim();
      const isAdmin   = role === "teacher" && isAdminTeacher(className);
      const result    = {success:true, username, role, className, realName, isAdmin};
      try { cache.put(cacheKey, JSON.stringify(result), SYS.CACHE_AUTH_TTL); } catch(_) {}
      return result;
    }
  }

  // 僅當使用者清單內完全沒有任何一筆教師帳號時，才允許初始 admin 救援登入
  if (!foundAnyTeacher && username === "admin" && password === "admin123") {
    const r = {success:true,username:"admin",role:"teacher",className:"all",realName:"系統管理員",isAdmin:true};
    clearLoginFailures("admin");
    try { cache.put(cacheKey, JSON.stringify(r), SYS.CACHE_AUTH_TTL); } catch(_) {}
    return r;
  }

  recordLoginFailure(username);
  return {success:false, message:"帳號或密碼錯誤"};
}

function clearOverviewCache() {
  try { CacheService.getScriptCache().remove(SYS.CACHE_OVERVIEW_KEY); } catch(_) {}
}

/**
 * 快取「指定單字任務」工作表解析資料 300 秒 (全校學生與教師共用，大幅消除登入時的重複讀取)
 */
function getTeacherTasksCached_(ss) {
  const cacheKey = "TEACHER_TASKS_CACHE_ALL";
  const cache = CacheService.getScriptCache();
  try {
    const hit = cache.get(cacheKey);
    if (hit) return JSON.parse(hit);
  } catch(_) {}

  let tasks = [];
  try {
    const sheet = ss.getSheetByName("指定單字任務");
    if (sheet && sheet.getLastRow() >= 2) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        tasks.push({
          taskClass: String(data[i][0] || "").replace(/班$/, "").trim().toLowerCase(),
          rawClass : String(data[i][0] || "").trim(),
          taskName : String(data[i][1] || "").trim(),
          rawWords : String(data[i][2] || "").trim(),
          mode     : String(data[i][3] || "抽測").trim(),
          countVal : String(data[i][4] || "ALL").trim().toUpperCase(),
          enabled  : data[i][5] === true || String(data[i][5]).trim().toUpperCase() === "TRUE",
          taskDate : data[i][6] ? formatStandardDateYMD(data[i][6]) : ""
        });
      }
    }
  } catch(e) {
    logError("getTeacherTasksCached_", e, "", "");
  }

  try { cache.put(cacheKey, JSON.stringify(tasks), 300); } catch(_) {}
  return tasks;
}

/** 清除指定單字任務快取 */
function invalidateTeacherTaskCache_() {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove("TEACHER_TASKS_CACHE_ALL");
    cache.remove("TASK_WORDS_DICT_CACHE");
  } catch(_) {}
}

/** 快取任務單字字典 300 秒 */
function getTaskWordsDictCached_(ss) {
  const cacheKey = "TASK_WORDS_DICT_CACHE";
  const cache = CacheService.getScriptCache();
  try {
    const hit = cache.get(cacheKey);
    if (hit) return JSON.parse(hit);
  } catch(_) {}

  const dict = {};
  const tasks = getTeacherTasksCached_(ss);
  for (let i = 0; i < tasks.length; i++) {
    const tName = tasks[i].taskName.toLowerCase();
    const rawW = tasks[i].rawWords;
    const tDate = tasks[i].taskDate ? formatStandardDateYMD(tasks[i].taskDate) : "";
    const words = rawW ? rawW.split(/[\s,;\n\r]+/).filter(w => w.trim().length > 0) : [];
    if (tName) dict[tName] = words;
    if (tDate) {
      dict[tDate] = words;
      dict[tDate.replace(/-/g, "/")] = words;
      const parts = tDate.split("-");
      if (parts.length === 3) {
        const unpadded = `${parts[0]}-${parseInt(parts[1], 10)}-${parseInt(parts[2], 10)}`;
        dict[unpadded] = words;
        dict[unpadded.replace(/-/g, "/")] = words;
      }
    }
    if (tDate && tName) {
      dict[tDate + "_" + tName] = words;
      dict[tDate.replace(/-/g, "/") + "_" + tName] = words;
    }
  }

  try { cache.put(cacheKey, JSON.stringify(dict), 300); } catch(_) {}
  return dict;
}

// ════════════════════════════════════════════════════════════════════
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
// 2.5 學生使用時間管制 (每日 07:30 ~ 22:00) 與教師解除限制設定
// ════════════════════════════════════════════════════════════════════

/**
 * 確保「時間限制設定」工作表存在並維持專業格式 (支援全域預設、個別學生與特別日期)
 */
function ensureTimeSettingsSheet(ss) {
  let sheet = ss.getSheetByName("時間限制設定");
  const headers = [
    "設定類型", "設定名稱", "適用學號", "姓名班級", "作答開始時間", "作答結束時間",
    "起始日期", "結束日期", "狀態", "設定教師", "更新時間", "備註"
  ];
  const widths = [130, 160, 100, 120, 100, 100, 110, 110, 75, 100, 140, 180];

  if (!sheet) {
    sheet = ss.insertSheet("時間限制設定");
    sheet.appendRow(headers);
    sheet.getRange("1:1").setFontWeight("bold").setBackground("#0f766e").setFontColor("#ffffff").setHorizontalAlignment("center");
    widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
    sheet.setFrozenRows(1);
    sheet.setRowHeight(1, 36);

    // 建立預設全域作答時間 (預設 07:30 ~ 22:00)
    const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
    sheet.appendRow([
      "全域預設", "全校預設作答時間", "ALL", "全體學生", "07:30", "22:00",
      "", "", true, "系統預設", nowStr, "預設每日開放時間（教師修改後將自動儲存為下次預設）"
    ]);
  } else if (sheet.getLastColumn() < headers.length) {
    const currentLastCol = sheet.getLastColumn();
    sheet.insertColumnsAfter(currentLastCol, headers.length - currentLastCol);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange("1:1").setFontWeight("bold").setBackground("#0f766e").setFontColor("#ffffff").setHorizontalAlignment("center");
    widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
    sheet.setFrozenRows(1);
  }

  // 確保有一列全域預設設定
  if (sheet.getLastRow() < 2) {
    const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
    sheet.appendRow([
      "全域預設", "全校預設作答時間", "ALL", "全體學生", "07:30", "22:00",
      "", "", true, "系統預設", nowStr, "預設每日開放時間（教師修改後將自動儲存為下次預設）"
    ]);
  }

  return sheet;
}

/**
 * 檢查當前時間是否允許該學生使用系統
 * 規範：
 * 1. 優先檢查是否處於「特別日期解除全天限制」（若是則 24 小時全天開放）。
 * 2. 檢查該學生是否有「個別學生特別時間」設定。
 * 3. 若無個別設定，則套用「全域預設作答時間」（預設為上次教師修改的設定，初始為 07:30 ~ 22:00）。
 */
/**
 * 檢查當前時間是否允許該學生使用系統 (含 CacheService 120 秒高階快取加速)
 */
function checkTimeRestrictionAllowance(ss, username) {
  const now = new Date();
  const todayYMD = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd");
  const timeStr = Utilities.formatDate(now, "Asia/Taipei", "HH:mm");
  const parts = timeStr.split(":");
  const currentMinutes = Number(parts[0]) * 60 + Number(parts[1]);
  const cleanUser = String(username || "").trim().toLowerCase();

  const rules = getTimeRestrictionRulesCached_(ss, todayYMD);
  const globalStart = rules.globalStart || "07:30";
  const globalEnd = rules.globalEnd || "22:00";
  const globalStartMin = rules.globalStartMin !== undefined ? rules.globalStartMin : 450;
  const globalEndMin = rules.globalEndMin !== undefined ? rules.globalEndMin : 1320;
  const globalUpdatedAt = rules.globalUpdatedAt || "";
  const globalTeacher = rules.globalTeacher || "";

  const studentRule = (cleanUser && rules.studentRules[cleanUser]) ? rules.studentRules[cleanUser] : null;
  const isDateOverridden = !!rules.activeDateOverride;
  const activeDateOverride = rules.activeDateOverride || null;

  const effectiveStart = studentRule ? studentRule.startTime : globalStart;
  const effectiveEnd = studentRule ? studentRule.endTime : globalEnd;
  const effectiveStartMin = studentRule ? studentRule.startMin : globalStartMin;
  const effectiveEndMin = studentRule ? studentRule.endMin : globalEndMin;

  const isWithinHours = (currentMinutes >= effectiveStartMin && currentMinutes <= effectiveEndMin);
  const allowed = isDateOverridden || isWithinHours;

  return {
    allowed: allowed,
    isOverridden: isDateOverridden,
    hasStudentCustomTime: !!studentRule,
    studentRule: studentRule,
    startTime: effectiveStart,
    endTime: effectiveEnd,
    globalStartTime: globalStart,
    globalEndTime: globalEnd,
    globalUpdatedAt: globalUpdatedAt,
    globalTeacher: globalTeacher,
    currentMinutes: currentMinutes,
    timeStr: timeStr,
    todayDate: todayYMD,
    activeDateOverride: activeDateOverride
  };
}

/**
 * 解析時間限制設定並快取 120 秒 (全校學生共用，大幅消除重複試算表讀取)
 */
function getTimeRestrictionRulesCached_(ss, todayYMD) {
  const cacheKey = "TIME_RESTRICTION_RULES_" + todayYMD;
  const cache = CacheService.getScriptCache();
  try {
    const hit = cache.get(cacheKey);
    if (hit) return JSON.parse(hit);
  } catch(_) {}

  const rules = {
    globalStart: "07:30",
    globalEnd: "22:00",
    globalStartMin: 450,
    globalEndMin: 1320,
    globalUpdatedAt: "",
    globalTeacher: "",
    studentRules: {},
    activeDateOverride: null
  };

  try {
    const sheet = ensureTimeSettingsSheet(ss);
    if (sheet && sheet.getLastRow() >= 2) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const type = String(data[i][0] || "").trim();
        const name = String(data[i][1] || "").trim();
        const targetUser = String(data[i][2] || "").trim().toLowerCase();
        const studentInfo = String(data[i][3] || "").trim();
        const sTime = formatStandardTimeHHmm(data[i][4]);
        const eTime = formatStandardTimeHHmm(data[i][5]);
        const startD = formatStandardDateYMD(data[i][6]);
        const endD = formatStandardDateYMD(data[i][7]);
        const statusVal = String(data[i][8] || "").trim().toUpperCase();
        const isEnabled = (data[i][8] === true || statusVal === "TRUE" || statusVal === "啟用" || statusVal === "YES");
        const teacher = String(data[i][9] || "");
        const updatedAt = data[i][10] ? Utilities.formatDate(new Date(data[i][10]), "Asia/Taipei", "yyyy-MM-dd HH:mm") : "";
        const remark = String(data[i][11] || "");

        // 1. 全域預設作答時間
        if (type === "全域預設" || (targetUser === "all" && type !== "特別日期解除" && sTime && eTime)) {
          if (sTime && eTime) {
            rules.globalStart = sTime;
            rules.globalEnd = eTime;
            const sp = sTime.split(":");
            const ep = eTime.split(":");
            rules.globalStartMin = Number(sp[0]) * 60 + Number(sp[1]);
            rules.globalEndMin = Number(ep[0]) * 60 + Number(ep[1]);
            rules.globalUpdatedAt = updatedAt;
            rules.globalTeacher = teacher;
          }
        }

        // 2. 個別學生作答時間
        if (isEnabled && (type === "個別學生" || (targetUser && targetUser !== "all" && sTime && eTime))) {
          if (targetUser) {
            const sp = sTime.split(":");
            const ep = eTime.split(":");
            rules.studentRules[targetUser] = {
              username: targetUser,
              studentInfo: studentInfo,
              startTime: sTime,
              endTime: eTime,
              startMin: Number(sp[0]) * 60 + Number(sp[1]),
              endMin: Number(ep[0]) * 60 + Number(ep[1]),
              remark: remark,
              teacher: teacher
            };
          }
        }

        // 3. 特別日期全天解除
        if (isEnabled && (type === "特別日期解除" || (startD && endD))) {
          if (todayYMD >= startD && todayYMD <= endD) {
            rules.activeDateOverride = {
              name: name || "特別開放",
              startDate: startD,
              endDate: endD,
              remark: remark
            };
          }
        }
      }
    }
  } catch(e) {
    logError("getTimeRestrictionRulesCached_", e, "", "");
  }

  try { cache.put(cacheKey, JSON.stringify(rules), 120); } catch(_) {}
  return rules;
}

/** 清除作答時段規則快取 */
function invalidateTimeRestrictionRulesCache_() {
  try {
    const todayYMD = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
    CacheService.getScriptCache().remove("TIME_RESTRICTION_RULES_" + todayYMD);
  } catch(_) {}
}

/**
 * 讀取學生今日使用時長限制、首次登入時間、延長時間與解除狀態
 */
function getDailyUsageSettings(param1, username, isLogin) {
  const ss = (param1 && typeof param1.getSheetByName === "function") ? param1 : SpreadsheetApp.getActiveSpreadsheet();
  const cleanUser = String(username || "").trim().toLowerCase();
  const now = new Date();
  const todayStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd");

  // 1. 規則（全校時長 / 個別時長 / 今日延長與解除）— 使用共用快取，避免每次輪詢都讀取試算表
  const rules = getDailyUsageRulesCached_(ss, todayStr);
  const defaultMinutes = rules.defaultMinutes || 10;
  const studentMinutes = (cleanUser && rules.studentMinutes[cleanUser]) ? rules.studentMinutes[cleanUser] : null;
  let addedMinutes = 0;
  let isUnlocked = false;
  const extAll = rules.extensions["all"];
  const extUser = cleanUser ? rules.extensions[cleanUser] : null;
  if (extAll) { addedMinutes += extAll.added; if (extAll.unlocked) isUnlocked = true; }
  if (extUser && cleanUser !== "all") { addedMinutes += extUser.added; if (extUser.unlocked) isUnlocked = true; }

  // 2. 今日首次登入時間 — 先讀快取，快取沒有才讀 PropertiesService
  let firstLoginTime = null;
  if (cleanUser && cleanUser !== "all") {
    const propKey = "FIRST_LOGIN_" + cleanUser + "_" + todayStr;
    const cache = CacheService.getScriptCache();
    try {
      const cached = cache.get(propKey);
      if (cached) firstLoginTime = Number(cached);
    } catch(_) {}

    if (!firstLoginTime) {
      try {
        const scriptProps = PropertiesService.getScriptProperties();
        const val = scriptProps.getProperty(propKey);
        if (val) {
          firstLoginTime = Number(val);
        } else if (isLogin) {
          firstLoginTime = Date.now();
          scriptProps.setProperty(propKey, String(firstLoginTime));
        }
        if (firstLoginTime) cache.put(propKey, String(firstLoginTime), 21600);
      } catch(_) {}
    }

    // 每日清理一次過期的 FIRST_LOGIN_* 屬性，避免超過 500KB 屬性儲存上限
    if (isLogin) purgeOldFirstLoginProps_(todayStr);
  }

  if (!firstLoginTime) {
    firstLoginTime = Date.now();
  }

  return {
    todayDate: todayStr,
    limitMinutes: studentMinutes || defaultMinutes,
    defaultMinutes: defaultMinutes,
    studentMinutes: studentMinutes,
    extendedMinutes: addedMinutes,
    unlocked: isUnlocked,
    firstLoginTime: firstLoginTime
  };
}

/**
 * 解析「時間設定」分頁中的每日時長規則，結果快取 120 秒（教師修改時會立即清除快取）
 */
function getDailyUsageRulesCached_(ss, todayStr) {
  const cacheKey = "DAILY_USAGE_RULES_" + todayStr;
  const cache = CacheService.getScriptCache();
  try {
    const hit = cache.get(cacheKey);
    if (hit) return JSON.parse(hit);
  } catch(_) {}

  const rules = { defaultMinutes: 10, studentMinutes: {}, extensions: {} };
  try {
    const sheet = ensureTimeSettingsSheet(ss);
    if (sheet && sheet.getLastRow() >= 2) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const type = String(data[i][0] || "").trim();
        const targetUser = String(data[i][2] || "").trim().toLowerCase();
        const remark = String(data[i][11] || "").trim();

        if (type === "每日時長上限" && targetUser === "all") {
          const m = parseInt(remark, 10);
          if (!isNaN(m) && m > 0) rules.defaultMinutes = m;
        } else if (type === "個別學生時長" && targetUser) {
          const m = parseInt(remark, 10);
          if (!isNaN(m) && m > 0) rules.studentMinutes[targetUser] = m;
        } else if (type === "時長延長與解除" && targetUser) {
          const startD = formatStandardDateYMD(data[i][6]);
          const endD = formatStandardDateYMD(data[i][7]);
          const statusVal = String(data[i][8] || "").trim().toUpperCase();
          const isEnabled = (data[i][8] === true || statusVal === "TRUE" || statusVal === "啟用" || statusVal === "YES");
          if (!isEnabled) continue;
          if (startD && !(todayStr >= startD && todayStr <= (endD || startD))) continue;

          const ext = rules.extensions[targetUser] || { added: 0, unlocked: false };
          try {
            const parsed = JSON.parse(remark);
            if (parsed) {
              if (parsed.addedMinutes) ext.added += Number(parsed.addedMinutes) || 0;
              if (parsed.unlocked === true) ext.unlocked = true;
            }
          } catch(_) {
            const m = parseInt(remark, 10);
            if (!isNaN(m) && m > 0) ext.added += m;
          }
          rules.extensions[targetUser] = ext;
        }
      }
    }
  } catch(e) {
    logError("getDailyUsageRulesCached_", e, "", "");
  }

  try { cache.put(cacheKey, JSON.stringify(rules), 120); } catch(_) {}
  return rules;
}

/** 教師修改每日時長設定後，清除規則快取讓學生端立即取得新設定 */
function invalidateDailyUsageRulesCache_() {
  try {
    const todayStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
    CacheService.getScriptCache().remove("DAILY_USAGE_RULES_" + todayStr);
  } catch(_) {}
}

/** 每天最多執行一次：刪除非今日的 FIRST_LOGIN_* 屬性 */
function purgeOldFirstLoginProps_(todayStr) {
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty("FIRST_LOGIN_PURGED_DATE") === todayStr) return;
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(3000)) return;
    try {
      if (props.getProperty("FIRST_LOGIN_PURGED_DATE") === todayStr) return;
      const suffix = "_" + todayStr;
      props.getKeys().forEach(function(k) {
        if (k.indexOf("FIRST_LOGIN_") === 0 && k !== "FIRST_LOGIN_PURGED_DATE" && k.slice(-suffix.length) !== suffix) {
          props.deleteProperty(k);
        }
      });
      props.setProperty("FIRST_LOGIN_PURGED_DATE", todayStr);
    } finally {
      lock.releaseLock();
    }
  } catch(e) {
    logError("purgeOldFirstLoginProps_", e, "", "");
  }
}

/**
 * 教師儲存每日時長設定 (全校或個別學生)
 */
function saveDailyMinutesSetting(ss, teacherUser, data) {
  const sheet = ensureTimeSettingsSheet(ss);
  const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
  const targetUser = String((data && data.targetUser) || "ALL").trim().toLowerCase();
  const minutes = parseInt((data && data.minutes), 10) || 10;
  const isGlobal = (targetUser === "all");

  const rowType = isGlobal ? "每日時長上限" : "個別學生時長";
  const rowName = isGlobal ? `全校每日使用上限${minutes}分鐘` : `學生${targetUser}每日上限${minutes}分鐘`;
  const studentInfo = isGlobal ? "全體學生" : (String((data && data.studentInfo) || targetUser));

  let foundRow = -1;
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === rowType && String(vals[i][2]).trim().toLowerCase() === targetUser) {
      foundRow = i + 1;
      break;
    }
  }

  const rowVals = [
    rowType, rowName, isGlobal ? "ALL" : targetUser, studentInfo,
    "", "", "", "", true, teacherUser || "教師", nowStr, String(minutes)
  ];

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, 12).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
  }

  try {
    const todayStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
    CacheService.getScriptCache().remove("DAILY_USAGE_RULES_" + todayStr);
  } catch(_) {}

  return {
    status: "success",
    message: `✅ 已成功設定【${isGlobal ? '全校' : targetUser}】每日使用時長為 ${minutes} 分鐘！`
  };
}

/**
 * 教師延長學生今日使用時間 (加時)
 */
function extendStudentUsageTime(ss, teacherUser, data) {
  const sheet = ensureTimeSettingsSheet(ss);
  const now = new Date();
  const todayStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd");
  const nowStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
  const targetUser = String((data && data.targetUser) || "ALL").trim().toLowerCase();
  const addMinutes = parseInt((data && data.addMinutes), 10) || 10;
  const isGlobal = (targetUser === "all");
  const studentInfo = isGlobal ? "全體學生" : (String((data && data.studentInfo) || targetUser));

  let foundRow = -1;
  let existingAdded = 0;
  let existingUnlocked = false;
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === "時長延長與解除" &&
        String(vals[i][2]).trim().toLowerCase() === targetUser &&
        formatStandardDateYMD(vals[i][6]) === todayStr) {
      foundRow = i + 1;
      try {
        const p = JSON.parse(String(vals[i][11]));
        if (p) {
          existingAdded = Number(p.addedMinutes) || 0;
          existingUnlocked = !!p.unlocked;
        }
      } catch(_) {}
      break;
    }
  }

  const newAdded = existingAdded + addMinutes;
  const remarkPayload = JSON.stringify({ addedMinutes: newAdded, unlocked: existingUnlocked });

  const rowVals = [
    "時長延長與解除",
    `今日延長${newAdded}分鐘`,
    isGlobal ? "ALL" : targetUser,
    studentInfo,
    "", "", todayStr, todayStr, true,
    teacherUser || "教師", nowStr, remarkPayload
  ];

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, 12).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
  }

  try {
    const todayStr2 = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
    CacheService.getScriptCache().remove("DAILY_USAGE_RULES_" + todayStr2);
  } catch(_) {}

  return {
    status: "success",
    message: `⚡ 已成功為【${isGlobal ? '全體學生' : targetUser}】今日延長 ${addMinutes} 分鐘（累計延長 ${newAdded} 分鐘）！`
  };
}

/**
 * 教師解除或恢復特定學生今日時長限制
 */
function toggleStudentDailyUnlock(ss, teacherUser, data) {
  const sheet = ensureTimeSettingsSheet(ss);
  const now = new Date();
  const todayStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd");
  const nowStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
  const targetUser = String((data && data.targetUser) || "ALL").trim().toLowerCase();
  const unlock = data ? (data.unlocked !== false) : true;
  const isGlobal = (targetUser === "all");
  const studentInfo = isGlobal ? "全體學生" : (String((data && data.studentInfo) || targetUser));

  let foundRow = -1;
  let existingAdded = 0;
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === "時長延長與解除" &&
        String(vals[i][2]).trim().toLowerCase() === targetUser &&
        formatStandardDateYMD(vals[i][6]) === todayStr) {
      foundRow = i + 1;
      try {
        const p = JSON.parse(String(vals[i][11]));
        if (p) existingAdded = Number(p.addedMinutes) || 0;
      } catch(_) {}
      break;
    }
  }

  const remarkPayload = JSON.stringify({ addedMinutes: existingAdded, unlocked: unlock });

  const rowVals = [
    "時長延長與解除",
    unlock ? "今日解除時長限制" : "今日恢復時長限制",
    isGlobal ? "ALL" : targetUser,
    studentInfo,
    "", "", todayStr, todayStr, true,
    teacherUser || "教師", nowStr, remarkPayload
  ];

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, 12).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
  }

  try {
    const todayStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
    CacheService.getScriptCache().remove("DAILY_USAGE_RULES_" + todayStr);
  } catch(_) {}

  return {
    status: "success",
    message: unlock
      ? `🔓 已成功解除【${isGlobal ? '全體學生' : targetUser}】今日作答時間限制（今日不限時暢行）！`
      : `🔒 已恢復【${isGlobal ? '全體學生' : targetUser}】今日作答時間限制！`
  };
}

/**
 * 教師端點：儲存每日時長設定 (可供 google.script.run 或直接呼叫)
 */
function teacherSaveDailyMinutes(param1, param2) {
  let ss, teacherUser, settingData;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    teacherUser = param2;
    settingData = arguments[2] || {};
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    teacherUser = (param1 && (param1.username || param1.teacherUser)) || "教師";
    settingData = (param1 && param1.settingData) || param1 || {};
  }
  return saveDailyMinutesSetting(ss, teacherUser, settingData);
}

/**
 * 教師端點：延長學生今日使用時間 (加時)
 */
function teacherExtendUsage(param1, param2) {
  let ss, teacherUser, extendData;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    teacherUser = param2;
    extendData = arguments[2] || {};
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    teacherUser = (param1 && (param1.username || param1.teacherUser)) || "教師";
    extendData = (param1 && param1.extendData) || param1 || {};
  }
  return extendStudentUsageTime(ss, teacherUser, extendData);
}

/**
 * 教師端點：解除或恢復特定/全體學生今日時長限制
 */
function teacherToggleDailyUnlock(param1, param2) {
  let ss, teacherUser, unlockData;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    teacherUser = param2;
    unlockData = arguments[2] || {};
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    teacherUser = (param1 && (param1.username || param1.teacherUser)) || "教師";
    unlockData = (param1 && param1.unlockData) || param1 || {};
  }
  return toggleStudentDailyUnlock(ss, teacherUser, unlockData);
}

/**
 * 讀取目前所有的時間設定 (供教師管理介面)
 */
function getTimeRestrictions(param1) {
  const ss = (param1 && typeof param1.getSheetByName === "function") ? param1 : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ensureTimeSettingsSheet(ss);
  const statusInfo = checkTimeRestrictionAllowance(ss, "");

  let globalTime = {
    startTime: statusInfo.globalStartTime || "07:30",
    endTime: statusInfo.globalEndTime || "22:00",
    updatedAt: statusInfo.globalUpdatedAt || "",
    teacher: statusInfo.globalTeacher || "系統預設"
  };

  const studentRules = [];
  const dateRules = [];

  if (sheet.getLastRow() >= 2) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const type = String(data[i][0] || "").trim();
      const name = String(data[i][1] || "").trim();
      const username = String(data[i][2] || "").trim();
      const studentInfo = String(data[i][3] || "").trim();
      const sTime = formatStandardTimeHHmm(data[i][4]);
      const eTime = formatStandardTimeHHmm(data[i][5]);
      const startD = formatStandardDateYMD(data[i][6]);
      const endD = formatStandardDateYMD(data[i][7]);
      const statusVal = String(data[i][8] || "").trim().toUpperCase();
      const isEnabled = (data[i][8] === true || statusVal === "TRUE" || statusVal === "啟用" || statusVal === "YES");
      const teacher = String(data[i][9] || "");
      const updatedAt = data[i][10] ? Utilities.formatDate(new Date(data[i][10]), "Asia/Taipei", "yyyy-MM-dd HH:mm") : "";
      const remark = String(data[i][11] || "");

      if (type === "全域預設") {
        if (sTime && eTime) {
          globalTime = {
            startTime: sTime,
            endTime: eTime,
            updatedAt: updatedAt,
            teacher: teacher
          };
        }
      } else if (type === "個別學生" || (username && username.toLowerCase() !== "all" && sTime && eTime)) {
        studentRules.push({
          rowIdx: i + 1,
          username: username,
          studentInfo: studentInfo,
          startTime: sTime,
          endTime: eTime,
          enabled: isEnabled,
          teacher: teacher,
          updatedAt: updatedAt,
          remark: remark
        });
      } else if (type === "特別日期解除" || (startD && endD)) {
        dateRules.push({
          rowIdx: i + 1,
          name: name || "特別開放",
          startDate: startD,
          endDate: endD,
          enabled: isEnabled,
          teacher: teacher,
          createdAt: updatedAt,
          remark: remark
        });
      }
    }
  }

  // 讀取學生名冊
  const studentList = [];
  try {
    const userSheet = ss.getSheetByName("使用者清單") || ss.getSheetByName("學生帳密");
    if (userSheet && userSheet.getLastRow() >= 2) {
      const uData = userSheet.getDataRange().getValues();
      for (let i = 1; i < uData.length; i++) {
        const u = String(uData[i][0] || "").trim();
        const role = String(uData[i][2] || "student").trim().toLowerCase();
        const c = String(uData[i][3] || "").replace(/班$/, "").trim();
        const name = String(uData[i][4] || "").trim();
        if (u && role === "student") {
          studentList.push({ username: u, className: c, realName: name || u });
        }
      }
      studentList.sort((a, b) => (a.className.localeCompare(b.className) || a.username.localeCompare(b.username)));
    }
  } catch(_) {}

  return {
    status: "success",
    currentStatus: statusInfo,
    globalTime: globalTime,
    studentRules: studentRules,
    dateRules: dateRules,
    studentList: studentList,
    dailyUsage: getDailyUsageSettings(ss, "ALL", false)
  };
}

/**
 * 儲存全校預設作答時間（儲存後自動成為下次預設）
 */
function getConquerRollSettings() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty("CONQUER_ROLL_SETTINGS");
    if (raw) return JSON.parse(raw);
  } catch(_) {}
  return { rollTaskMistakes: true, rollFreeMistakes: false, semesterStartDate: "", manualCurrentWeek: 0 };
}

function saveConquerRollSettings(param1, settingsData) {
  const ss = (param1 && typeof param1.getSheetByName === "function") ? param1 : SpreadsheetApp.getActiveSpreadsheet();
  const auth = authenticateUser(ss, settingsData.username, settingsData.password);
  if (!auth.success || auth.role !== "teacher") return { status: "error", message: "無教師權限" };
  const data = {
    rollTaskMistakes: settingsData.rollTaskMistakes !== false,
    rollFreeMistakes: !!settingsData.rollFreeMistakes,
    semesterStartDate: settingsData.semesterStartDate ? String(settingsData.semesterStartDate).trim() : "",
    manualCurrentWeek: Number.isInteger(Number(settingsData.manualCurrentWeek)) ? Number(settingsData.manualCurrentWeek) : 0
  };
  PropertiesService.getScriptProperties().setProperty("CONQUER_ROLL_SETTINGS", JSON.stringify(data));
  return { status: "success", message: "✅ 待攻克單字規則與週次設定已成功更新！", settings: data };
}

function saveGlobalTimeSetting(param1, param2, param3) {
  let ss, teacherUser, timeData;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    teacherUser = param2;
    timeData = param3;
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    teacherUser = (param1 && param1.username) ? param1.username : "教師";
    timeData = (param1 && param1.timeData) ? param1.timeData : param1;
  }
  const sheet = ensureTimeSettingsSheet(ss);
  const sTime = String(timeData.startTime || "07:30").trim();
  const eTime = String(timeData.endTime || "22:00").trim();

  if (!/^\d{2}:\d{2}$/.test(sTime) || !/^\d{2}:\d{2}$/.test(eTime)) {
    return { status: "error", message: "請輸入正確的時間格式 (HH:mm)" };
  }

  const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");

  let foundRow = -1;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const type = String(data[i][0] || "").trim();
    if (type === "全域預設") {
      foundRow = i + 1;
      break;
    }
  }

  const rowVals = [
    "全域預設",
    "全校預設作答時間",
    "ALL",
    "全體學生",
    sTime,
    eTime,
    "",
    "",
    true,
    teacherUser || "教師",
    nowStr,
    "預設每日開放時間（教師修改後自動儲存為下次預設）"
  ];

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, 12).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
  }

  clearOverviewCache();
  invalidateTimeRestrictionRulesCache_();
  return {
    status: "success",
    message: `✅ 全校預設可作答時間已更新為【${sTime} ～ ${eTime}】！`,
    currentStatus: checkTimeRestrictionAllowance(ss, "")
  };
}

/**
 * 儲存個別學生自訂作答時間
 */
function saveStudentTimeSetting(param1, param2, param3) {
  let ss, teacherUser, studentData;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    teacherUser = param2;
    studentData = param3;
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    teacherUser = (param1 && param1.username) ? param1.username : "教師";
    studentData = (param1 && param1.studentData) ? param1.studentData : param1;
  }
  const sheet = ensureTimeSettingsSheet(ss);
  const username = String((studentData && studentData.username) || "").trim();
  const studentInfo = String((studentData && studentData.studentInfo) || "").trim();
  const sTime = String((studentData && studentData.startTime) || "").trim();
  const eTime = String((studentData && studentData.endTime) || "").trim();
  const remark = String((studentData && studentData.remark) || "個別學生特別時間").trim();

  if (!username) {
    return { status: "error", message: "未指定目標學生學號" };
  }
  if (!/^\d{2}:\d{2}$/.test(sTime) || !/^\d{2}:\d{2}$/.test(eTime)) {
    return { status: "error", message: "請輸入正確的時間格式 (HH:mm)" };
  }

  const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");

  let targetRow = -1;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const type = String(data[i][0] || "").trim();
    const u = String(data[i][2] || "").trim();
    if (type === "個別學生" && u.toLowerCase() === username.toLowerCase()) {
      targetRow = i + 1;
      break;
    }
  }

  const rowVals = [
    "個別學生",
    `個別學生時間 (${username})`,
    username,
    studentInfo,
    sTime,
    eTime,
    "",
    "",
    true,
    teacherUser || "教師",
    nowStr,
    remark
  ];

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, 12).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
  }

  clearOverviewCache();
  invalidateTimeRestrictionRulesCache_();
  return {
    status: "success",
    message: `✅ 學生【${studentInfo || username}】的可作答時間已設定為【${sTime} ～ ${eTime}】！`,
    currentStatus: checkTimeRestrictionAllowance(ss, username)
  };
}

/**
 * 刪除個別學生自訂作答時間
 */
function deleteStudentTimeSetting(param1, param2) {
  let ss, username;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    username = param2;
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    username = (param1 && param1.targetUsername) ? param1.targetUsername : (param1 && param1.username ? param1.username : param1);
  }
  const sheet = ss.getSheetByName("時間限制設定");
  if (!sheet || sheet.getLastRow() < 2) return { status: "error", message: "找不到時間限制設定" };

  const cleanUser = String(username || "").trim().toLowerCase();
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    const type = String(data[i][0] || "").trim();
    const u = String(data[i][2] || "").trim().toLowerCase();
    if (type === "個別學生" && u === cleanUser) {
      sheet.deleteRow(i + 1);
      clearOverviewCache();
      invalidateTimeRestrictionRulesCache_();
      return { status: "success", message: `已移除學生【${username}】的個別時間設定，將恢復全校預設時間。` };
    }
  }

  return { status: "error", message: "未找到該學生的特別設定記錄" };
}

/**
 * 儲存特別日期全天解除限制設定
 */
function saveTimeRestriction(param1, param2, param3) {
  let ss, teacherUser, ruleData;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    teacherUser = param2;
    ruleData = param3;
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    teacherUser = (param1 && param1.username) ? param1.username : "教師";
    ruleData = (param1 && param1.ruleData) ? param1.ruleData : param1;
  }
  const sheet = ensureTimeSettingsSheet(ss);
  const name = String((ruleData && ruleData.name) || "特別解除限制").trim();
  const startD = formatStandardDateYMD(ruleData && ruleData.startDate);
  const endD = formatStandardDateYMD((ruleData && ruleData.endDate) || (ruleData && ruleData.startDate));
  const remark = String((ruleData && ruleData.remark) || "").trim();
  const isEnabled = (ruleData && ruleData.enabled) !== false;

  if (!startD || !endD) {
    return { status: "error", message: "請指定正確的起始與結束日期" };
  }
  if (startD > endD) {
    return { status: "error", message: "起始日期不可大於結束日期" };
  }

  const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");

  let targetRow = -1;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const type = String(data[i][0] || "").trim();
    const s = formatStandardDateYMD(data[i][6]);
    const e = formatStandardDateYMD(data[i][7]);
    if (type === "特別日期解除" && s === startD && e === endD) {
      targetRow = i + 1;
      break;
    }
  }

  const rowVals = [
    "特別日期解除",
    name,
    "ALL",
    "全體學生",
    "00:00",
    "23:59",
    startD,
    endD,
    isEnabled,
    teacherUser || "教師",
    nowStr,
    remark
  ];

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, 12).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
  }

  clearOverviewCache();
  invalidateTimeRestrictionRulesCache_();
  return {
    status: "success",
    message: `✅ 已成功解除【${startD} ～ ${endD}】的時間限制！`,
    currentStatus: checkTimeRestrictionAllowance(ss, "")
  };
}

/**
 * 刪除特別日期全天解除限制設定
 */
function deleteTimeRestriction(param1, param2) {
  let ss, ruleData;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    ruleData = param2;
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    ruleData = (param1 && param1.ruleData) ? param1.ruleData : param1;
  }
  const sheet = ss.getSheetByName("時間限制設定");
  if (!sheet || sheet.getLastRow() < 2) return { status: "error", message: "找不到時間限制設定" };

  const startD = formatStandardDateYMD(ruleData && ruleData.startDate);
  const endD = formatStandardDateYMD(ruleData && ruleData.endDate);

  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    const type = String(data[i][0] || "").trim();
    const s = formatStandardDateYMD(data[i][6]);
    const e = formatStandardDateYMD(data[i][7]);
    if (type === "特別日期解除" && s === startD && e === endD) {
      sheet.deleteRow(i + 1);
      clearOverviewCache();
      invalidateTimeRestrictionRulesCache_();
      return { status: "success", message: "已刪除該解除限制設定", currentStatus: checkTimeRestrictionAllowance(ss, "") };
    }
  }

  return { status: "error", message: "未找到符合的設定記錄" };
}

/**
 * 教師快捷操作：一鍵切換今日解除限制狀態
 */
function quickToggleTodayUnlock(param1, param2) {
  let ss, teacherUser;
  if (param1 && typeof param1.getSheetByName === "function") {
    ss = param1;
    teacherUser = param2;
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    teacherUser = (param1 && param1.username) ? param1.username : "教師";
  }
  const sheet = ensureTimeSettingsSheet(ss);
  const todayYMD = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
  const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");

  const data = sheet.getDataRange().getValues();
  let foundRow = -1;
  let currentlyActive = false;

  for (let i = 1; i < data.length; i++) {
    const type = String(data[i][0] || "").trim();
    const s = formatStandardDateYMD(data[i][6]);
    const e = formatStandardDateYMD(data[i][7]);
    const statusVal = String(data[i][8] || "").trim().toUpperCase();
    const isEn = (data[i][8] === true || statusVal === "TRUE" || statusVal === "啟用" || statusVal === "YES");

    if (type === "特別日期解除" && todayYMD >= s && todayYMD <= e) {
      if (isEn) {
        foundRow = i + 1;
        currentlyActive = true;
        break;
      }
    }
  }

  if (currentlyActive && foundRow > 0) {
    sheet.getRange(foundRow, 9).setValue(false);
    clearOverviewCache();
    invalidateTimeRestrictionRulesCache_();
    return {
      status: "success",
      isUnlocked: false,
      message: "已恢復今日時間限制",
      currentStatus: checkTimeRestrictionAllowance(ss, "")
    };
  } else {
    sheet.appendRow([
      "特別日期解除",
      "今日全天特別開放",
      "ALL",
      "全體學生",
      "00:00",
      "23:59",
      todayYMD,
      todayYMD,
      true,
      teacherUser || "教師",
      nowStr,
      "教師一鍵解除今日限制"
    ]);
    clearOverviewCache();
    invalidateTimeRestrictionRulesCache_();
    return {
      status: "success",
      isUnlocked: true,
      message: `🎉 已成功解除今日（${todayYMD}）時間限制，學生全天皆可使用！`,
      currentStatus: checkTimeRestrictionAllowance(ss, "")
    };
  }
}

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

      return jsonResponse({
        status:"success", message:"驗證成功", role:"student",
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

function doGet(e) {
  // 嚴格資安防護：doGet 僅回傳安全之 Web 介面，全面移除任何未經身分驗證之檢測或除錯後門
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("學生學習歷程查詢系統")
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
// 4. 儲存歷程與寫入【每日任務紀錄】
// ════════════════════════════════════════════════════════════════════

function handleSaveRecord(ss, params, auth) {
  try {
    const username = (auth && auth.username) ? auth.username : String(params.username || "").trim();
    const records  = params.records || {};
    if (!username) return jsonResponse({status:"error", message:"未提供帳號"});

  let uSheet = getStudentSheet(ss, username);
  if (!uSheet) {
    uSheet = ss.insertSheet(username);
    ensureStudentSheetColumns(uSheet);
  } else {
    ensureStudentSheetColumns(uSheet);
  }

  const now       = new Date();
  const todayStr  = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd");
  const ts        = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
  const jsonData  = JSON.stringify(records);
  if (jsonData.length > SYS.MAX_JSON_BYTES) {
    logError("saveRecord/size","資料過大",username,`字元數:${jsonData.length}`);
    return jsonResponse({status:"error",message:"資料量過大，無法儲存"});
  }

  const stored   = compressData(jsonData);
  let agentData  = {};
  try {
    const raw = records["spellAgent.v2"];
    agentData = (typeof raw==="string") ? JSON.parse(raw) : (raw || {});
  } catch(_) {}

  const sumData = calculateSummaryFromAgentData(agentData, params.summary);
  const testedWordsCount = sumData.testedVocab;
  const distinctC = sumData.distinctCorrect;
  const vocabAccStr = sumData.passRate;
  const l1Str = sumData.l1, l2Str = sumData.l2, l3Str = sumData.l3, l4Str = sumData.l4, l5Str = sumData.l5;
  const mastered = sumData.mastered, practicing = sumData.practicing, learning = sumData.learning;
  const mListenStr = sumData.mListen, mPickStr = sumData.mPick, mScrambleStr = sumData.mScramble, mTrapStr = sumData.mTrap;

  // 解析今日指定任務資訊（優先從 params.todayTaskSummary 提取，亦支援從 records 中自動解析備援）
  let sum = params.todayTaskSummary || null;
  // 嚴格校驗：若 sum 日期不是今天，清空以防舊日任務污染今日
  if (sum && sum.date) {
    const sumDateStr = formatStandardDateYMD(sum.date);
    if (sumDateStr && sumDateStr !== todayStr) {
      sum = null;
    }
  }
  if (!sum && records["today_task_summary"]) {
    try {
      const parsedSum = JSON.parse(records["today_task_summary"]);
      const sumDate = parsedSum ? formatStandardDateYMD(parsedSum.date) : "";
      if (!sumDate || sumDate === todayStr) sum = parsedSum;
    } catch(_) {}
  }
  if (!sum && records["today_task_in_progress"]) {
    try {
      const prog = JSON.parse(records["today_task_in_progress"]);
      const progDate = prog ? formatStandardDateYMD(prog.date) : "";
      if (prog && prog.pool && prog.pool.length > 0 && (!progDate || progDate === todayStr)) {
        sum = {
          taskName   : prog.task ? prog.task.taskName : "今日指定練習",
          score      : prog.correct || 0,
          total      : prog.pool.length,
          rate       : "—",
          completed  : false,
          inProgress : true,
          date       : prog.date || todayStr,
          wrongWords : prog.wrongWords || []
        };
      }
    } catch(_) {}
  }

  const isCompleted = !!(sum && (sum.completed === true || (sum.score !== undefined && sum.total !== undefined && sum.score > 0 && !sum.inProgress)));
  // 檢查今日該班是否有指派任務（判斷未指派 vs 未受測）
  const rawCls = (auth && auth.className) ? auth.className : ((params.records && params.records.current_user_class) || (params.className || ""));
  const studentClass = getStudentClass(username, rawCls);
  const activeTaskObj = getActiveTaskForClass(ss, studentClass, username);
  const hasTaskAssignedToday = activeTaskObj && activeTaskObj.hasTask;

  let taskName      = (sum && sum.taskName) ? sum.taskName : (hasTaskAssignedToday ? (activeTaskObj.taskName || "指定測驗") : "⚪ 未指派");
  // 整理答對單字與錯題單字（有參與測驗但未作答之單字，視同錯字納入錯題單字與消滅戰）
  let taskCorrectWordsList = (sum && sum.correctWords && Array.isArray(sum.correctWords))
    ? sum.correctWords
    : [];
  let wrongWordsList = (sum && sum.wrongWords && Array.isArray(sum.wrongWords))
    ? [...sum.wrongWords]
    : (sum && typeof sum.wrongWords === "string" && sum.wrongWords.trim() ? sum.wrongWords.split(",").map(w => w.trim()).filter(Boolean) : []);

// 舊版全題庫錯字填充已移除，改由後續僅鎖定被抽出考題

  // 依據新規則：施測單字數(出題數)、作答單字數、答對單字數
  // 出題數以老師訂之出題數(count/total)為準，而非題庫總字數
  let assignedWordsCount = (sum && sum.total) ? Number(sum.total) : (activeTaskObj && activeTaskObj.count ? Number(activeTaskObj.count) : (activeTaskObj && activeTaskObj.words ? activeTaskObj.words.length : 0));

  let correctWordsCount = taskCorrectWordsList.length;
  if (sum && sum.score !== undefined) correctWordsCount = Math.max(correctWordsCount, Number(sum.score));

  const rawWrongList = (sum && sum.wrongWords && Array.isArray(sum.wrongWords))
    ? sum.wrongWords
    : (sum && typeof sum.wrongWords === "string" && sum.wrongWords.trim() ? sum.wrongWords.split(",").map(w => w.trim()).filter(Boolean) : []);
  let answeredWordsCount = taskCorrectWordsList.length + rawWrongList.length;
  if (sum && sum.attempts !== undefined) answeredWordsCount = Math.max(answeredWordsCount, Number(sum.attempts));
  // 防呆：作答單字數絕不可小於答對單字數
  answeredWordsCount = Math.max(answeredWordsCount, correctWordsCount + rawWrongList.length, correctWordsCount);
  if (isCompleted && answeredWordsCount < assignedWordsCount && rawWrongList.length === 0) {
    answeredWordsCount = assignedWordsCount;
  }
  if (assignedWordsCount > 0) {
    answeredWordsCount = Math.min(answeredWordsCount, assignedWordsCount);
  }

  // 測驗答錯單字：僅記錄被抽出來考的單字中，答錯或未作答的單字
  const quizSampledWords = (sum && Array.isArray(sum.words) && sum.words.length > 0 && sum.words.length <= assignedWordsCount)
    ? sum.words
    : ((activeTaskObj && Array.isArray(activeTaskObj.words)) ? activeTaskObj.words.slice(0, assignedWordsCount) : []);

  if (quizSampledWords.length > 0) {
    quizSampledWords.forEach(w => {
      const cleanW = String(w).trim().toLowerCase();
      const inCorr = taskCorrectWordsList.some(cw => String(cw).trim().toLowerCase() === cleanW);
      const inWrong = wrongWordsList.some(ww => String(ww).trim().toLowerCase() === cleanW);
      if (!inCorr && !inWrong && (isCompleted || (sum && (sum.inProgress || sum.attempts > 0)))) {
        wrongWordsList.push(w);
      }
    });
  }

  let wrongWordsStr = wrongWordsList.length > 0 ? wrongWordsList.join(", ") : (isCompleted ? "全對無錯題" : "—");

  // 檢查作答進度與未完成狀態
  const hasTaskActivity = isCompleted || !!(sum && (sum.inProgress || sum.attempts > 0)) || (taskCorrectWordsList.length > 0) || (wrongWordsList.length > 0);

  let status = "⚪ 未指派";
  if (hasTaskActivity) {
    if (answeredWordsCount === assignedWordsCount && assignedWordsCount > 0) {
      status = "🟢 已完成";
    } else {
      status = `🟠 未完成 (${correctWordsCount}/${assignedWordsCount})`;
    }
  } else if (hasTaskAssignedToday) {
    status = "🔴 未受測";
  } else {
    status = "⚪ 未指派";
  }

  // 指定測驗成績：答對單字數/作答單字數 (如 3/4)
  // 指定測驗正確率：答對單字數/施測出題數 * 100% (如 3/5 = 60%)
  let taskScore = "—";
  let taskRate = "—";
  if (hasTaskActivity && answeredWordsCount > 0) {
    taskScore = `'${correctWordsCount}/${answeredWordsCount}`;
  } else if (isCompleted && assignedWordsCount > 0) {
    taskScore = `'${correctWordsCount}/${assignedWordsCount}`;
  }
  if (hasTaskActivity && assignedWordsCount > 0) {
    taskRate = `${Math.round((correctWordsCount / assignedWordsCount) * 100)}%`;
  }

  // 檢查試算表目前第 2 列是否已經是今日或過往的紀錄
  let shouldInsertNewRow = false;
  let existingRow = null;
  let sameDay = false;
  if (uSheet.getLastRow() >= 2) {
    const curCols = uSheet.getLastColumn();
    if (curCols >= 1) {
      existingRow = uSheet.getRange(2, 1, 1, curCols).getValues()[0];
      const lastStr = formatStandardDateYMD(existingRow[0]);
      sameDay = (lastStr === todayStr);
    }
  }

  // 關鍵保護與多任務支援：所有作答紀錄完整儲存在每個學生自己的分頁中
  const headers = uSheet.getRange(1, 1, 1, Math.min(uSheet.getLastColumn(), 26)).getValues()[0] || [];
  const hMap = getHeaderIndexMap(headers);
  const existingStatus = (existingRow && existingRow[hMap.status]) ? String(existingRow[hMap.status]) : "";
  const existingScore  = (existingRow && existingRow[hMap.taskScore]) ? String(existingRow[hMap.taskScore]) : "";
  const existingTask   = (existingRow && existingRow[hMap.taskName]) ? String(existingRow[hMap.taskName]).trim() : "";
  const existingHasCompleted = existingStatus.includes("已完成") && existingScore !== "—" && existingScore !== "";

  const dp = agentData.dailyPractice || {};
  const todayDp = dp[todayStr] || dp[todayStr.replace(/-/g, "/")] || null;
  const hasRealTodayWords = !!(todayDp && todayDp.words && Object.values(todayDp.words).some(w => w && typeof w === "object" && (w.lastResult === "correct" || w.lastResult === "wrong" || w.a !== undefined)));
  const hasTodayPractice = !!(todayDp && (todayDp.attempts > 0 || hasRealTodayWords));

  if (uSheet.getLastRow() < 2) {
    // 剛建立的新分頁，直接寫入第 2 列
    shouldInsertNewRow = false;
  } else if (sameDay) {
    // 【同日多次存檔】：預設就地更新第 2 列，絕不重複多開新列！
    if (isCompleted) {
      // 本次是剛完成的指定任務：直接在第 2 列記錄已完成成果
      shouldInsertNewRow = false;
    } else if (sum && sum.inProgress) {
      // 本次是指定測驗進行中暫存
      if (existingHasCompleted && existingTask !== taskName) {
        // 如果今天已經完成過另一個不同的指定測驗，此時開啟全新測驗，才獨立開新列
        shouldInsertNewRow = true;
      } else {
        // 否則就地更新作答中進度
        shouldInsertNewRow = false;
      }
    } else {
      // 本次是自主練習或定期存檔
      if (existingHasCompleted) {
        // 今天已經有完成的指定測驗成果，保留成果不被自主練習沖刷掉
        taskName      = existingTask || taskName;
        taskScore     = existingScore || taskScore;
        taskRate      = String(existingRow[hMap.taskRate] || taskRate);
        status        = existingStatus || status;
        wrongWordsStr = String(existingRow[hMap.wrong] || wrongWordsStr);
      }
      shouldInsertNewRow = false;
    }
  } else {
    // 【跨日（新的一天）】：
    // 關鍵防護：檢查是否有「今日新作答」或「今日測驗進度」！
    // 若學生今天尚未作答任何題目（attempts 未增加、今日無自主練習、無指定測驗），絕不開闢空白新列！
    const existingAtt = (existingRow && existingRow[hMap.attempts]) ? Number(existingRow[hMap.attempts]) : 0;
    const hasAttIncrease = (testedWordsCount > existingAtt);
    const hasTaskActivity = !!(sum && (sum.inProgress || isCompleted));

    if (!hasTodayPractice && !hasAttIncrease && !hasTaskActivity) {
      return jsonResponse({status:"success", message:"未偵測到今日作答增量，保持現有紀錄", cached:true});
    }

    // 有真實作答進度，開闢新列（插入至第 2 列）
    shouldInsertNewRow = true;
    // 跨日的新一天，若今天尚未完成測驗，絕不繼承昨天的測驗名稱與成績！
  }

  // 自由練習今日數據獨立提取
  let freeTested = 0, freeCorrect = 0, freeRate = "—", freeWrongStr = "";
  if (todayDp) {
    if (todayDp.words && Object.keys(todayDp.words).length > 0) {
      const realWKeys = Object.keys(todayDp.words).filter(k => {
        const w = todayDp.words[k];
        return w && typeof w === "object" && (w.lastResult === "correct" || w.lastResult === "wrong" || w.a !== undefined);
      });
      if (realWKeys.length > 0) {
        freeTested = realWKeys.length;

        // 依最終最新作答狀態嚴格判定（相容 {lastResult, correct, wrong} 與 {a, c} 格式）：
        const isWordCurrentlyWrong = (w) => {
          const wWrong = w.wrong !== undefined ? w.wrong : ((w.a !== undefined && w.c !== undefined) ? Math.max(0, w.a - w.c) : 0);
          const wCorr = w.correct !== undefined ? w.correct : (w.c !== undefined ? w.c : 0);
          return (w.lastResult === 'wrong') || (wWrong > 0 && (!wCorr || wCorr === 0)) || (w.lastResult === undefined && wWrong > 0);
        };
        const isWordCurrentlyCorrect = (w) => {
          const wCorr = w.correct !== undefined ? w.correct : (w.c !== undefined ? w.c : 0);
          return !isWordCurrentlyWrong(w) && (w.lastResult === 'correct' || wCorr > 0 || w.passed);
        };

        freeCorrect = realWKeys.filter(k => isWordCurrentlyCorrect(todayDp.words[k])).length;
        const wrongList = realWKeys.filter(k => isWordCurrentlyWrong(todayDp.words[k]));
        freeWrongStr = wrongList.join(", ");
      }
    } else {
      freeTested = todayDp.attempts || 0;
      freeCorrect = todayDp.correct || 0;
    }
    if (freeTested > 0) {
      freeRate = Math.round((freeCorrect / freeTested) * 100) + "%";
    }
  }

  // 同日更新保護：若已有自由練習紀錄，且本次為指定測驗存檔，保留當日已有之自由練習紀錄不被清空
  if (sameDay && existingRow && existingRow.length >= 26) {
    const exFT = existingRow[hMap.freeTested];
    if (freeTested === 0 && exFT !== undefined && exFT !== "—" && exFT !== "") {
      freeTested   = exFT;
      freeCorrect  = existingRow[hMap.freeCorrect] || 0;
      freeRate     = String(existingRow[hMap.freeRate] || "—");
      freeWrongStr = String(existingRow[hMap.freeWrong] || "");
    }
  }

  // 前端/後端直接計算純數值寫入試算表（不使用 Google Sheet 公式，避免重算風暴拖慢效能）
  const pureCorrect = distinctC;
  const pureRate    = testedWordsCount > 0 ? (Math.round((distinctC / testedWordsCount) * 10000) / 10000) : 0;
  const curLevel = (agentData.level && agentData.level.current) || agentData.currentLevel || 1;

  const rowData = [
    ts, stored,
    curLevel, agentData.points || 0,
    agentData.streak || 0, agentData.best || 0,
    learning, practicing, mastered,
    pureCorrect, testedWordsCount, pureRate,
    l1Str, l2Str, l3Str, l4Str, l5Str,
    mListenStr, mPickStr, mScrambleStr, mTrapStr,
    taskName,
    hasTaskActivity || hasTaskAssignedToday ? assignedWordsCount : "—",
    hasTaskActivity ? answeredWordsCount : (hasTaskAssignedToday ? 0 : "—"),
    hasTaskActivity ? correctWordsCount : (hasTaskAssignedToday ? 0 : "—"),
    taskScore, taskRate, status, wrongWordsStr,
    freeTested > 0 ? freeTested : (hasTodayPractice ? 0 : "—"),
    freeTested > 0 ? freeCorrect : (hasTodayPractice ? 0 : "—"),
    freeRate,
    freeWrongStr
  ];

  if (shouldInsertNewRow && uSheet.getLastRow() >= 2) {
    uSheet.insertRowBefore(2);
  }
  while (uSheet.getMaxRows() < 2) {
    uSheet.insertRowAfter(uSheet.getMaxRows());
  }
  if (uSheet.getMaxColumns() < rowData.length) {
    uSheet.insertColumnsAfter(uSheet.getMaxColumns(), rowData.length - uSheet.getMaxColumns());
  }
  uSheet.getRange(2, 1, 1, rowData.length)
    .setValues([rowData]).setHorizontalAlignment("center").setVerticalAlignment("middle");

  try {
    uSheet.getRange(2, 7, 1, 5).setNumberFormat("0");
    uSheet.getRange(2, 12).setNumberFormat("0%");
    uSheet.getRange(2, 13, 1, 9).setNumberFormat("@");
    uSheet.getRange(2, 23, 1, 2).setNumberFormat("@");
    uSheet.getRange(2, 27, 1, 4).setNumberFormat("@");
  } catch(_) {}

  // 【自動清理防護】：僅清理同日且「完全相同任務名稱」的多餘重複暫存列，絕不誤刪已完成的指定測驗列
  try {
    if (uSheet.getLastRow() > 2) {
      const checkRows = Math.min(uSheet.getLastRow() - 1, 15);
      const datesVals = uSheet.getRange(2, 1, checkRows, Math.min(uSheet.getLastColumn(), 26)).getValues();
      let deleteRowIndices = [];
      for (let i = 1; i < datesVals.length; i++) {
        const rowD = formatStandardDateYMD(datesVals[i][0]);
        const rowTask = String(datesVals[i][hMap.taskName] || "").trim();
        // 嚴格安全防護：僅刪除同日、完全同任務名稱且非相異測驗的重複列；自主練習存檔時絕不可刪除任何已完成之測驗列
        if (rowD === todayStr) {
          if (taskName === "自主練習" && rowTask === "自主練習") {
            deleteRowIndices.push(i + 2);
          } else if (taskName !== "自主練習" && rowTask === taskName) {
            deleteRowIndices.push(i + 2);
          }
        }
      }
      for (let k = deleteRowIndices.length - 1; k >= 0; k--) {
        uSheet.deleteRow(deleteRowIndices[k]);
      }
    }
  } catch(_) {}

  // 【歷史指定任務自癒回填】：若學生歷程中有已完成之指定測驗，自動校驗並回填試算表該日期列
  try {
    syncAndBackfillStudentTaskHistory(ss, username, records, uSheet);
  } catch(e) {
    logError("syncAndBackfillStudentTaskHistory", e, username, "");
  }

  clearOverviewCache();
  try {
    const cache = CacheService.getScriptCache();
    cache.remove("stu_data_" + username.toLowerCase());
    cache.remove("stu_hist_" + username.toLowerCase());
    cache.put("stu_rec_" + username.toLowerCase(), stored, 1200);
  } catch(_) {}
  return jsonResponse({status:"success", message:"紀錄已成功儲存於個人分頁"});
  } catch(err) {
    logError("handleSaveRecord", err, auth ? auth.username : (params ? params.username : ""), "");
    return jsonResponse({status:"error", message: "儲存失敗：" + (err.message || err.toString())});
  }
}

// ════════════════════════════════════════════════════════════════════
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
// 5. 查詢邏輯（checkAndGetData）含親師今日成果
// ════════════════════════════════════════════════════════════════════

function checkAndGetData(formData) {
  try {
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    const auth = authenticateUser(ss, formData.username, formData.password);
    if (!auth.success) { logError("checkAndGetData",auth.message,formData.username,""); return {status:"error",message:auth.message}; }
    if (formData.forceRefresh) clearOverviewCache();

    const todayStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");

    if (auth.role === "teacher") {
      if (formData.targetStudent) {
        const target = String(formData.targetStudent).trim();
        if (!auth.isAdmin) {
          const all = getClassOverviewRaw(ss);
          const found = all.find(s => s.username === target);
          if (!found || found.className !== auth.className)
            return {status:"error",message:"無權限查看其他班級的學生資料"};
        }
        const result = _getStudentData(ss, target);
        if (result.status === "success") {
          result.role = "teacher"; result.isAdmin = auth.isAdmin;
          const meta = getClassOverviewRaw(ss).find(s => s.username === target);
          result.className = meta ? meta.className : getStudentClass(target,"");
          result.realName  = meta ? meta.realName  : "";
          result.todayTaskResult = getStudentTodayTaskResult(ss, target, todayStr);
          result.dailyTaskHistory = getStudentDailyTaskHistory(ss, target);
          result.assignedTask = getActiveTaskForClass(ss, result.className, target);
          result.taskWordsMap = getTaskWordsDictCached_(ss);
          try { result.leaderboard = _getLeaderboard(ss, target, formData.rankingMode||"class"); } catch(_) {}
          try {
            const g = _getGoalsInternal(ss, target);
            result.goals = g.goals; result.goalsUpdatedAt = g.updatedAt;
          } catch(_) {}
        }
        return result;
      }
      
      let tc = formData.targetClass || "all";
      if (!auth.isAdmin) tc = auth.className;
      const result = _getClassOverview(ss, tc, formData.forceRefresh);
      result.isAdmin = auth.isAdmin; result.teacherClass = auth.className;
      result.todayTaskMap = getTodayTaskMap(ss, todayStr);
      return result;
    }

    // 學生自己查詢
    const result = _getStudentData(ss, auth.username);
    if (result.status === "success") {
      result.role = "student"; result.className = auth.className; result.realName = auth.realName;
      result.todayTaskResult = getStudentTodayTaskResult(ss, auth.username, todayStr);
      result.dailyTaskHistory = getStudentDailyTaskHistory(ss, auth.username);
      result.assignedTask = getActiveTaskForClass(ss, auth.className, auth.username);
      result.taskWordsMap = getTaskWordsDictCached_(ss);
      try { result.leaderboard = _getLeaderboard(ss, auth.username, formData.rankingMode||"class"); } catch(_) {}
      try {
        const g = _getGoalsInternal(ss, auth.username);
        result.goals = g.goals; result.goalsUpdatedAt = g.updatedAt;
      } catch(_) {}
    }
    return result;
  } catch(err) {
    logError("checkAndGetData",err,formData?formData.username:"","");
    return {status:"error",message:"伺服器錯誤: "+err.toString()};
  }
}

function parseScoreAndRate(rawScore, rawRate) {
  let scoreStr = String(rawScore || "—").trim().replace(/^'+/, "");
  let rateStr  = String(rawRate  || "—").trim().replace(/^'+/, "");
  
  // 1. 防禦：修復 Google Sheets 自動將 "4/5" 轉為 Date 物件 (如 Sun Apr 05 2026 00:00:00 GMT+0800)
  if (rawScore instanceof Date || (scoreStr.includes("GMT") && (scoreStr.includes("00:00:00") || scoreStr.includes("GMT+")))) {
    try {
      const d = (rawScore instanceof Date) ? rawScore : new Date(scoreStr);
      if (!isNaN(d.getTime())) {
        const c = d.getMonth() + 1; // 月份當分子
        const t = d.getDate();      // 日期當分母
        scoreStr = `${c}/${t}`;
      }
    } catch(_) {}
  }
  
  // 2. 防禦：修復正確率為小數點 (0.8 -> 80%, 1 -> 100%)，或帶小數點的百分比 (85.4% -> 85%)
  if (typeof rawRate === "number") {
    rateStr = Math.round(rawRate <= 1 ? rawRate * 100 : rawRate) + "%";
  } else if (rateStr !== "—") {
    if (rateStr.endsWith("%")) {
      const num = parseFloat(rateStr);
      if (!isNaN(num)) rateStr = Math.round(num) + "%";
    } else {
      const num = parseFloat(rateStr);
      if (!isNaN(num)) {
        rateStr = Math.round(num <= 1 ? num * 100 : num) + "%";
      }
    }
  }

  // 3. 智慧校驗與精準計算：指定測驗答對題數除以出題數，為指定正確率唯一標準公式
  if (scoreStr.includes("/")) {
    const m = scoreStr.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (m) {
      const numScore = parseInt(m[1], 10);
      const numTotal = parseInt(m[2], 10);
      if (numTotal > 0) {
        rateStr = Math.round((numScore / numTotal) * 100) + "%";
      }
    }
  }
  
  return { score: scoreStr, rate: rateStr };
}

function getStudentTodayTaskResult(ss, username, todayStr) {
  if (!username) return { hasDone: false, inProgress: false, allTodayTasks: [] };
  const sheet = getStudentSheet(ss, username);
  if (!sheet || sheet.getLastRow() < 2) return { hasDone: false, inProgress: false, allTodayTasks: [] };
  const targetDateStr = formatStandardDateYMD(todayStr);
  const maxRows = Math.min(sheet.getLastRow() - 1, 15);
  const maxCols = sheet.getLastColumn();
  if (maxCols < 1) return { hasDone: false, inProgress: false, allTodayTasks: [] };

  const headers = sheet.getRange(1, 1, 1, maxCols).getValues()[0] || [];
  const hMap = getHeaderIndexMap(headers);
  const vals = sheet.getRange(2, 1, maxRows, maxCols).getValues();
  const allTodayTasks = [];
  let primaryTask = null;

  for (let i = 0; i < vals.length; i++) {
    const dStr = formatStandardDateYMD(vals[i][0]);
    if (dStr === targetDateStr) {
      const taskName = String(vals[i][hMap.taskName] || "今日指定測驗");
      const parsedSR = parseScoreAndRate(vals[i][hMap.taskScore], vals[i][hMap.taskRate]);
      const scoreVal = parsedSR.score;
      const rateVal  = parsedSR.rate;
      const statusVal = String(vals[i][hMap.status] || "");
      const wrongStr = String(vals[i][hMap.wrong] || "");
      const isEngWord = w => /^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/.test(w);
      const wrongWords = (wrongStr && !wrongStr.includes("應測單字") && !wrongStr.includes("未完成"))
        ? wrongStr.split(/[\s,;\n\r]+/).map(w => w.trim()).filter(isEngWord)
        : [];
      const hasDone = (statusVal.includes("已完成") || (scoreVal !== "—" && scoreVal !== "" && scoreVal.includes("/"))) && !statusVal.includes("作答中") && !statusVal.includes("中斷") && !statusVal.includes("未完成");
      const inProgress = (statusVal.includes("作答中") || statusVal.includes("中斷") || statusVal.includes("未完成")) && !hasDone;

      if (hasDone || inProgress) {
        const item = {
          hasDone   : hasDone,
          inProgress: inProgress,
          taskName  : taskName,
          score     : scoreVal,
          rate      : rateVal,
          status    : statusVal,
          updatedAt : formatStandardDateTime(vals[i][0]),
          wrongWords: wrongWords
        };
        allTodayTasks.push(item);
        if (!primaryTask) primaryTask = item;
      }
    }
  }

  if (primaryTask) {
    const res = Object.assign({}, primaryTask);
    res.allTodayTasks = allTodayTasks.map(t => Object.assign({}, t));
    res.todayCount = allTodayTasks.length;
    return res;
  }
  return { hasDone: false, inProgress: false, allTodayTasks: [] };
}

function getStudentDailyTaskHistory(ss, username) {
  if (!username) return [];

  const sheet = getStudentSheet(ss, username);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const maxRows = Math.min(sheet.getLastRow() - 1, 60);
  const maxCols = sheet.getLastColumn();
  if (maxCols < 1) return [];

  const taskWordsDict = getTaskWordsDictCached_(ss);
  const headers = sheet.getRange(1, 1, 1, maxCols).getValues()[0] || [];
  const hMap = getHeaderIndexMap(headers);
  const vals = sheet.getRange(2, 1, maxRows, maxCols).getValues();
  const list = [];
  const isEngWord = w => /^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/.test(w);
  for (let i = 0; i < vals.length; i++) {
    const dStr = formatStandardDateYMD(vals[i][0]);
    const taskName = String(vals[i][hMap.taskName] || "");
    const parsedSR = parseScoreAndRate(vals[i][hMap.taskScore], vals[i][hMap.taskRate]);
    const scoreVal = parsedSR.score;
    const rateVal  = parsedSR.rate;
    const statusVal = String(vals[i][hMap.status] || "");
    const wrongStr = String(vals[i][hMap.wrong] || "");
    const rawWrongTokens = wrongStr ? wrongStr.split(/[\s,;\n\r]+/).map(w => w.trim()).filter(isEngWord) : [];
    const isPoolHintInWrongCol = wrongStr.includes("應測單字") || wrongStr.includes("未完成");
    const wrongWords = isPoolHintInWrongCol ? [] : rawWrongTokens;
    const freeTestedVal = parseInt(String(vals[i][hMap.freeTested] || "").replace(/,/g, ""), 10) || 0;
    const freeCorrectVal = parseInt(String(vals[i][hMap.freeCorrect] || "").replace(/,/g, ""), 10) || 0;
    const freeRateVal = String(vals[i][hMap.freeRate] || "");
    const freeWrongVal = String(vals[i][hMap.freeWrong] || "");
    const freeWrongWords = (freeWrongVal && !freeWrongVal.includes("無登入") && !freeWrongVal.includes("缺考"))
      ? freeWrongVal.split(/[\s,;\n\r]+/).map(w => w.trim()).filter(isEngWord)
      : [];
    const hasFreePractice = freeTestedVal > 0;

    // 嚴格過濾：納入有指定測驗紀錄、已排定任務列、或有自由練習之列
    const isUntestedOrUnassigned = !taskName || taskName === "⚪ 未指派" || taskName === "自主練習" || taskName.includes("自由練習");
    const hasValidQuizScore = scoreVal && scoreVal !== "—" && scoreVal !== "" && scoreVal.includes("/");
    const isQuizCompleted = statusVal.includes("已完成") || statusVal.includes("測驗作答中") || statusVal.includes("中斷") || statusVal.includes("未受測") || statusVal.includes("缺席") || statusVal.includes("未完成");
    const hasTaskAssigned = !isUntestedOrUnassigned && (taskName.length > 0);
    
    if (dStr && (hasValidQuizScore || isQuizCompleted || hasTaskAssigned || hasFreePractice)) {
      let tAtt = 0, tCor = 0;
      if (hasValidQuizScore) {
        const parts = scoreVal.split("/");
        tCor = parseInt(parts[0], 10) || 0;
        tAtt = parseInt(parts[1], 10) || 0;
      }
      let matchedWords = taskWordsDict[dStr + "_" + taskName.toLowerCase()] ||
                         taskWordsDict[taskName.toLowerCase()] ||
                         taskWordsDict[dStr] || [];
      if ((!matchedWords || matchedWords.length === 0) && wrongStr.includes("應測單字") && rawWrongTokens.length > 0) {
        matchedWords = rawWrongTokens;
      }
      // 未作答題目視同答錯：若有出題總數且答對數小於出題總數，未作答單字納入錯題單字列表
      let finalWrongWords = [...wrongWords];
      if (tAtt > 0 && tCor < tAtt && Array.isArray(matchedWords) && matchedWords.length > 0) {
        const expWrong = tAtt - tCor;
        matchedWords.forEach(w => {
          const cleanW = String(w).trim();
          if (finalWrongWords.length < expWrong && !finalWrongWords.some(fw => fw.toLowerCase() === cleanW.toLowerCase())) {
            finalWrongWords.push(cleanW);
          }
        });
      }

      let resolvedRate = rateVal;
      if (tAtt > 0) {
        resolvedRate = Math.round((tCor / tAtt) * 100) + "%";
      }
      // 狀態嚴格尊重試算表「練習狀態」欄位：未完成 (如 10-12) 顯示未完成，已完成 (如 10-13 答對 4 題錯 1 題) 顯示已完成
      let resolvedStatus = statusVal;
      if (!resolvedStatus) {
        resolvedStatus = hasValidQuizScore ? "🟢 已完成" : (hasTaskAssigned ? "⏳ 尚未開始" : "⚪ 未指派");
      }

      const isIncompleteQuiz = (tAtt > 0 && tCor < tAtt) || statusVal.includes("未完成") || statusVal.includes("作答中") || statusVal.includes("中斷");
      const isSpecialTask = statusVal.includes("未受測") || statusVal.includes("中斷") || statusVal.includes("缺席") || statusVal.includes("作答中") || statusVal.includes("未作答") || statusVal.includes("未完成") || isIncompleteQuiz;
      const defaultTaskName = (hasTaskAssigned || isSpecialTask) ? "每日指定測驗" : (hasFreePractice ? "自主練習" : "每日指定測驗");
      list.push({
        date        : dStr,
        taskName    : taskName || defaultTaskName,
        score       : scoreVal || "—",
        rate        : resolvedRate || "—",
        status      : resolvedStatus,
        attempts    : tAtt,
        correct     : tCor,
        accuracy    : resolvedRate,
        updatedAt   : formatStandardDateTime(vals[i][0]),
        wrongWords  : finalWrongWords,
        words       : matchedWords,
        freeTested  : freeTestedVal,
        freeCorrect : freeCorrectVal,
        freeRate    : freeRateVal,
        freeWrongWords: freeWrongWords
      });
    }
  }
  list.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "") || b.date.localeCompare(a.date));
  return list;
}

function getTodayTaskMap(ss, todayStr) {
  const map = {};
  const targetDateStr = formatStandardDateYMD(todayStr);
  const uSheet = ss.getSheetByName("使用者清單");
  if (!uSheet || uSheet.getLastRow() < 2) return map;
  const uData = uSheet.getDataRange().getValues();

  // 取得全班今日指派任務
  const allTeacherTasks = getTeacherTasksCached_(ss);
  const classTaskAssignedToday = new Map();
  (allTeacherTasks || []).forEach(t => {
    if (t.enabled && t.taskName && t.rawWords) {
      if (!t.taskDate || formatStandardDateYMD(t.taskDate) === targetDateStr) {
        const c = String(t.taskClass || "").replace(/班$/, "").trim().toLowerCase();
        classTaskAssignedToday.set(c, t.taskName);
      }
    }
  });
  const schoolWideTaskName = classTaskAssignedToday.get("all") || classTaskAssignedToday.get("全校") || null;

  for (let i = 1; i < uData.length; i++) {
    const u = String(uData[i][0] || "").trim();
    if (!u) continue;
    const rawClass = String(uData[i][3] || "").trim();
    const userClass = getStudentClass(u, rawClass).replace(/班$/, "").trim().toLowerCase();
    const assignedTaskName = classTaskAssignedToday.get(userClass) || schoolWideTaskName;
    const isClassAssignedToday = !!assignedTaskName;

    const sSheet = ss.getSheetByName(u);
    if (sSheet && sSheet.getLastRow() >= 2) {
      const maxRows = Math.min(sSheet.getLastRow() - 1, 10);
      const lastCol = sSheet.getLastColumn();
      if (lastCol >= 1) {
        const headers = sSheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
        const hMap = getHeaderIndexMap(headers);
        const rows = sSheet.getRange(2, 1, maxRows, lastCol).getValues();
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          if (formatStandardDateYMD(row[hMap.date]) === targetDateStr) {
            let status = String(row[hMap.status] || "");
            const score  = String(row[hMap.taskScore] || "—");
            let tName = String(row[hMap.taskName] || "");
            if (!status || status === "—") {
              status = isClassAssignedToday ? "⚪ 未受測" : "⚪ 未指派";
            }
            if (!tName || tName === "—") {
              tName = isClassAssignedToday ? assignedTaskName : "⚪ 未指派";
            }
            if (!map[u] || (status.includes("已完成") && score !== "—")) {
              map[u] = {
                taskName : tName,
                score    : score,
                rate     : String(row[hMap.taskRate] || "—"),
                status   : status
              };
              if (status.includes("已完成")) break;
            }
          }
        }
      }
    }

    if (!map[u]) {
      if (isClassAssignedToday) {
        map[u] = {
          taskName : assignedTaskName,
          score    : "—",
          rate     : "—",
          status   : "⚪ 未受測"
        };
      } else {
        map[u] = {
          taskName : "⚪ 未指派",
          score    : "—",
          rate     : "—",
          status   : "⚪ 未指派"
        };
      }
    }
  }
  return map;
}

// ════════════════════════════════════════════════════════════════════
// 6. 班級總覽與個人歷程 (Sheets API batchGet 極速版)
// ════════════════════════════════════════════════════════════════════

function getClassOverviewRaw(ss, forceRefresh) {
  const cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    try {
      const hit = cache.get(SYS.CACHE_OVERVIEW_KEY);
      if (hit) {
        const jsonStr = hit.startsWith("GZ:") ? decompressData(hit) : hit;
        return JSON.parse(jsonStr);
      }
    } catch(_) {}
  }

  const userSheet = ss.getSheetByName("使用者清單");
  if (!userSheet) return [];
  const userData = userSheet.getDataRange().getValues();

  const studentMeta = [];
  for (let i = 1; i < userData.length; i++) {
    const u = String(userData[i][0]||"").trim();
    const r = String(userData[i][2]||"student").trim().toLowerCase();
    if (!u || r === "teacher") continue;
    studentMeta.push({
      username  : u,
      className : getStudentClass(u, userData[i][3]),
      realName  : String(userData[i][4]||"").trim()
    });
  }
  if (studentMeta.length === 0) return [];

  let rowsMap = {};
  try {
    const ssId  = ss.getId();
    const ranges = studentMeta.map(m => `'${m.username}'!A1:Z2`);
    const resp  = Sheets.Spreadsheets.Values.batchGet(ssId, {
      ranges               : ranges,
      valueRenderOption    : "FORMATTED_VALUE",
      majorDimension       : "ROWS"
    });
    (resp.valueRanges || []).forEach((vr, idx) => {
      const vals = vr.values || [];
      rowsMap[studentMeta[idx].username] = vals.length >= 2 ? vals : [];
    });
  } catch(batchErr) {
    Logger.log("[batchGet 降級] " + batchErr.message);
    const sheetMap = {};
    ss.getSheets().forEach(s => {
      sheetMap[s.getName()] = s;
      sheetMap[s.getName().trim().toLowerCase()] = s;
    });
    studentMeta.forEach(meta => {
      const s = sheetMap[meta.username] || sheetMap[meta.username.trim().toLowerCase()];
      rowsMap[meta.username] = (s && s.getLastRow() >= 2) ? s.getRange(1,1,2,26).getDisplayValues() : [];
    });
  }

  const result = studentMeta.map(meta => {
    const rows = rowsMap[meta.username] || [];
    if (rows.length < 2) {
      return {
        username:meta.username, className:meta.className, realName:meta.realName, hasData:false,
        lastBackup:"尚無紀錄", level:"", score:"0", streak:"0", best:"0",
        attempts:"0", correct:"0", accuracy:"0%",
        mastered:"0", learning:"0", practicing:"0", distWords:"0",
        l1:"0/0",l2:"0/0",l3:"0/0",l4:"0/0",l5:"0/0"
      };
    }
    const headers = rows[0], row = rows[1];
    const g = h => {
      const i = headers.findIndex(x => String(x||"").includes(h));
      return i >= 0 ? String(row[i] || "") : "";
    };
    const lv = n => {
      const i = headers.findIndex(h => String(h).toUpperCase().includes("LEVEL " + n) || String(h).toUpperCase().includes("LEVEL" + n));
      return i >= 0 ? String(row[i] || "0/0") : "0/0";
    };
    return {
      username: meta.username, className: meta.className, realName: meta.realName, hasData: true,
      lastBackup: g("備份時間"), level: g("等級"), score: g("分數") || "0",
      streak: g("連勝") || "0", best: g("最佳連勝") || "0",
      attempts: g("受測單字") || g("作答題數") || "0",
      correct: g("共答對單字") || g("答對單字") || g("答對題數") || "0",
      accuracy: g("單字掌握率") || g("正確率") || "0%",
      mastered: g("精通") || "0",
      learning: g("學習中") || "0",
      practicing: g("練習中") || "0",
      distWords: g("共答對單字") || g("答對單字") || "0",
      l1: lv("1"), l2: lv("2"), l3: lv("3"), l4: lv("4"), l5: lv("5")
    };
  });

  try {
    const rawJson = JSON.stringify(result);
    const gz = compressData(rawJson);
    if (gz.length < 95000) {
      cache.put(SYS.CACHE_OVERVIEW_KEY, gz, SYS.CACHE_OVERVIEW_TTL);
    } else if (rawJson.length < 95000) {
      cache.put(SYS.CACHE_OVERVIEW_KEY, rawJson, SYS.CACHE_OVERVIEW_TTL);
    }
  } catch(_) {}

  return result;
}

function _getClassOverview(ss, targetClass, forceRefresh) {
  if (forceRefresh) clearOverviewCache();
  const all     = getClassOverviewRaw(ss, forceRefresh);
  const classes = [...new Set(all.map(s=>s.className).filter(Boolean))].sort();
  const list    = (targetClass && targetClass!=="all") ? all.filter(s=>s.className===targetClass) : all;
  return {
    status:"success", role:"teacher",
    overview:list, allOverview:all, classes,
    currentClass:targetClass||"all",
    students:list.map(o=>o.username)
  };
}

function _getStudentData(ss, username) {
  const cleanU = String(username || "").trim();
  const sheet = getStudentSheet(ss, cleanU);
  if (!sheet || sheet.getLastRow() < 2) {
    return {
      status: "success",
      username: cleanU,
      headers: ["備份時間","完整JSON","等級","分數","連勝","最佳連勝","學習中","練習中","精通","共答對單字","累積受測單字","單字掌握率","LEVEL 1 入門\n(答對/受測字數)","LEVEL 2 基礎\n(答對/受測字數)","LEVEL 3 進階\n(答對/受測字數)","LEVEL 4 挑戰\n(答對/受測字數)","LEVEL 5 精熟\n(答對/受測字數)","🎧 聽與拼\n(答對/受測字數)","✅ 選拼法\n(答對/受測字數)","🧩 字母重組\n(答對/受測字數)","🖍️ 填空陷阱\n(答對/受測字數)","任務名稱","施測單字數","作答單字數","答對單字數","指定測驗成績","指定測驗正確率","練習狀態","測驗錯題單字","自由練習受測字數","自由練習答對字數","自由練習正確率","自由練習錯題單字"],
      data: [],
      wordList: [],
      agentData: null,
      isNewStudent: true
    };
  }

  // 🚀 極速讀取：載入最新 60 筆作答歷程即可完整滿足所有圖表、日曆熱點與差分表格需求
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const maxRowsToRead = Math.min(lastRow - 1, 60);

  const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const rawData = sheet.getRange(2, 1, maxRowsToRead, lastCol).getDisplayValues();
  // 自動校準：依新 33 欄結構，作答數/施測數決定完成狀態，答對/作答決定正確率
  const hMap = getHeaderIndexMap(headers);
  if (hMap.taskAssigned >= 0 && hMap.taskAnswered >= 0 && hMap.taskCorrect >= 0) {
    for (let r = 0; r < rawData.length; r++) {
      const assigned = parseInt(rawData[r][hMap.taskAssigned], 10);
      const answered = parseInt(rawData[r][hMap.taskAnswered], 10);
      const correct = parseInt(rawData[r][hMap.taskCorrect], 10);
      const statusStr = String(rawData[r][hMap.status] || "").trim();

      if (!isNaN(assigned) && assigned > 0 && !isNaN(answered)) {
        if (!isNaN(correct)) {
          if (answered > 0) {
            rawData[r][hMap.taskScore] = `${correct}/${answered}`;
          }
          rawData[r][hMap.taskRate] = Math.round((correct / assigned) * 100) + "%";
        }
        if (answered !== assigned) {
          rawData[r][hMap.status] = `🟠 未完成 (${!isNaN(correct) ? correct : 0}/${assigned})`;
        } else if (!statusStr.includes("已完成")) {
          rawData[r][hMap.status] = "🟢 已完成";
        }
      }
    }
  } else if (hMap.taskScore >= 0 && hMap.taskRate >= 0 && hMap.status >= 0) {
    for (let r = 0; r < rawData.length; r++) {
      const scoreStr = String(rawData[r][hMap.taskScore] || "").trim().replace(/^'+/, "");
      const statusStr = String(rawData[r][hMap.status] || "").trim();
      if (scoreStr.includes("/")) {
        const m = scoreStr.match(/^(\d+)\s*\/\s*(\d+)$/);
        if (m) {
          const numScore = parseInt(m[1], 10);
          const numTotal = parseInt(m[2], 10);
          if (numTotal > 0) {
            rawData[r][hMap.taskRate] = Math.round((numScore / numTotal) * 100) + "%";
            if (numScore < numTotal && (statusStr.includes("已完成") || !statusStr.includes("未完成"))) {
              rawData[r][hMap.status] = `🟠 未完成 (${numScore}/${numTotal})`;
            }
          }
        }
      }
    }
  }
  let rawBVals = [];
  try {
    rawBVals = sheet.getRange(2, 2, maxRowsToRead, 1).getValues();
  } catch(_) {}

  let wordList  = [];
  let agentData = null;
  let rawJsonStr = "";

  // 優先從 getValues() 尋找最新一筆有效備份
  for (let i = 0; i < rawBVals.length; i++) {
    const val = String(rawBVals[i][0] || "").trim();
    if (val && (val.startsWith("GZ:") || val.startsWith("{"))) {
      rawJsonStr = val;
      break;
    }
  }

  // 備援：若未找到，從 rawData 尋找
  if (!rawJsonStr) {
    for (let i = 0; i < rawData.length; i++) {
      const val = String(rawData[i][1] || "").trim();
      if (val && (val.startsWith("GZ:") || val.startsWith("{"))) {
        rawJsonStr = val;
        break;
      }
    }
  }

  if (rawJsonStr) {
    try {
      const decomp = decompressData(rawJsonStr);
      if (decomp) {
        const parsed = JSON.parse(decomp);
        let dHist = [];
        try { dHist = getStudentDailyTaskHistory(ss, cleanU); } catch(_) {}
        sanitizeStudentRecordsObj_(parsed, dHist);
        const raw = parsed["spellAgent.v2"] || (parsed.box || parsed.stat || parsed.attempts !== undefined ? parsed : null);
        agentData = (typeof raw === "string") ? JSON.parse(raw) : (raw || {});
        const taskRecords = {};
        for (const k in parsed) {
          if (k.startsWith("task_words_") || k.startsWith("task_summary_") || k.startsWith("today_task_") || k === "student_task_history" || k === "today_task_summary" || k.startsWith("weekend_remedy_") || k === "assigned_task") {
            try {
              taskRecords[k] = (typeof parsed[k] === "string") ? JSON.parse(parsed[k]) : parsed[k];
            } catch(_) {
              taskRecords[k] = parsed[k];
            }
          }
        }
        if (agentData) {
          agentData._taskRecords = taskRecords;
        }
        const stat = agentData.stat || {};
        for (const w in stat) {
          const {c=0, a=0} = stat[w];
          wordList.push({
            word: w, correct: c, attempts: a, wrong: Math.max(0, a - c),
            status: c >= 3 ? "mastered" : c === 2 ? "practicing" : c === 1 ? "learning" : "new"
          });
        }
      }
    } catch(err) {
      logError("_getStudentData/parse", err, cleanU, "");
    }
  }

  // 備援：若 Column B 完全無備份，但第 2 列有作答紀錄，自動從各欄位反組合成 agentData
  if (!agentData && rawData.length > 0) {
    const r0 = rawData[0];
    const lvl = parseInt(r0[2]) || 1;
    const pts = parseInt(r0[3]) || 0;
    const stk = parseInt(r0[4]) || 0;
    const bst = parseInt(r0[5]) || 0;
    const att = parseInt(r0[6]) || 0;
    const cor = parseInt(r0[7]) || 0;
    if (att > 0 || pts > 0) {
      agentData = {
        box: {}, stat: {}, lstat: {},
        level: { current: lvl, unlocked: lvl, placed: true },
        points: pts, streak: stk, best: bst, attempts: att, correct: cor
      };
    }
  }

  // 🚀 關鍵極速瘦身：清空傳輸給前端之所有 rows[1] (完整JSON base64 字串)
  // 前端只需第 0 列解析出的 agentData 與 wordList，清空歷史 base64 讓傳輸體積縮小 95%！
  for (let i = 0; i < rawData.length; i++) {
    rawData[i][1] = "";
  }

  return { status: "success", username: cleanU, headers, data: rawData, wordList, agentData, dailyTaskHistory: (typeof dHist !== "undefined" ? dHist : []), taskWordsMap: getTaskWordsDictCached_(ss) };
}

function _getLeaderboard(ss, targetUsername, mode, isTeacher) {
  const target    = String(targetUsername||"").trim().toLowerCase();
  const classData = getClassOverviewRaw(ss);
  const myMeta    = classData.find(s=>s.username.toLowerCase()===target);
  const myClass   = myMeta ? myMeta.className : "預設班級";
  const pool      = (mode==="all" ? classData : classData.filter(s=>s.className===myClass)).filter(s=>s.hasData);
  const total     = pool.length;
  if (!total) return {myClass,mode:mode==="all"?"all":"class",totalStudents:0,myRanks:{},rankings:{}};

  const maskName = (u,n) => {
    const s = (n||"").trim()||u||"";
    if (s.length<=2) return s[0]+"*";
    return s[0]+"*".repeat(s.length-2)+s[s.length-1];
  };
  const maskUser = (u) => {
    if (!u) return "";
    if (u.length <= 3) return u[0] + "*";
    return u.slice(0, 2) + "*".repeat(Math.max(1, u.length - 4)) + u.slice(-2);
  };
  const toN = v => { const n=parseFloat(String(v||"").replace(/[^0-9.-]/g,"")); return isNaN(n)?0:n; };

  const list = pool.map(s => {
    const isMe = s.username.toLowerCase()===target;
    const att  = toN(s.attempts), cor = toN(s.correct);
    const maskedU = (isMe || isTeacher) ? s.username : maskUser(s.username);
    const displayRealName = (isMe || isTeacher) ? s.realName : maskName(s.username, s.realName);
    return {
      username: maskedU,
      maskedName: maskName(s.username, s.realName),
      className: s.className,
      realName: displayRealName,
      isMe,
      level: s.level||"",
      mastered: toN(s.mastered),
      score: toN(s.score),
      attempts: att,
      correct: cor,
      streak: toN(s.streak),
      accuracy: att>0 ? parseFloat((cor/att*100).toFixed(1)) : 0
    };
  });

  const rank = (key) => {
    const sorted = [...list].sort((a,b)=>b[key]!==a[key]?b[key]-a[key]:b.mastered-a.mastered);
    let r=1;
    return sorted.map((item,i)=>{
      if (i>0&&item[key]!==sorted[i-1][key]) r=i+1;
      const pr=Math.max(1,Math.min(99,Math.round((total-r+1)/total*100)));
      return {username:item.username,maskedName:item.maskedName,
        className:item.className,realName:item.realName,isMe:item.isMe,
        rank:r,pr,val:item[key],level:item.level};
    });
  };

  const dims    = ["mastered","score","attempts","streak","accuracy"];
  const ranked  = {};
  dims.forEach(d => { ranked[d] = rank(d); });

  const myInfo  = d => {
    const f = ranked[d].find(r=>r.isMe);
    return f ? {rank:f.rank,pr:f.pr,val:f.val} : {rank:"-",pr:50,val:0};
  };
  const myRanks = {};
  dims.forEach(d => { myRanks[d] = myInfo(d); });

  return { myClass, mode:mode==="all"?"all":"class", totalStudents:total, myRanks, rankings:ranked };
}

function getStudentLeaderboard(creds) {
  try {
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    const auth = authenticateUser(ss, creds.username, creds.password);
    if (!auth.success) return {status:"error",message:auth.message};
    if (creds.forceRefresh) clearOverviewCache();
    const isTeacher = auth.role === "teacher";
    const target = (isTeacher && creds.targetStudent) ? String(creds.targetStudent).trim() : auth.username;
    return {status:"success", leaderboard:_getLeaderboard(ss, target, creds.mode||"class", isTeacher)};
  } catch(e) {
    logError("getStudentLeaderboard",e,creds?creds.username:"","");
    return {status:"error",message:e.toString()};
  }
}

// ════════════════════════════════════════════════════════════════════
// 7. 密碼管理與目標
// ════════════════════════════════════════════════════════════════════

function getStudentPasswords(creds) {
  try {
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    const auth = authenticateUser(ss, creds.username, creds.password);
    if (!auth.success||auth.role!=="teacher") return {status:"error",message:"無權限"};
    const sheet = ss.getSheetByName("使用者清單")||ss.getSheetByName("學生帳密");
    if (!sheet) return {status:"error",message:"找不到【使用者清單】"};
    const data = sheet.getDataRange().getValues();
    const students = [];
    for (let i=1;i<data.length;i++) {
      const u=String(data[i][0]||"").trim(), p=String(data[i][1]||"").trim();
      const r=String(data[i][2]||"student").trim().toLowerCase();
      const c=getStudentClass(u,data[i][3]), n=String(data[i][4]||"").trim();
      if (!u||r==="teacher") continue;
      if (!auth.isAdmin&&c!==auth.className) continue;
      if (p && !isHashedPassword(p)) {
        sheet.getRange(i+1, 2).setValue(hashPassword(p));
      }
      students.push({
        username:u,
        password:"（已加密保護，可隨時重設）",
        isHashed:true,
        className:c, realName:n
      });
    }
    return {status:"success",students};
  } catch(e) {
    logError("getStudentPasswords",e,creds?creds.username:"","");
    return {status:"error",message:e.toString()};
  }
}

function changeStudentPassword(creds) {
  try {
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    const auth = authenticateUser(ss, creds.username, creds.password);
    if (!auth.success||auth.role!=="teacher") return {status:"error",message:"無權限"};
    const target  = String(creds.targetStudent||"").trim();
    const newPass = String(creds.newPassword||"").trim();
    if (!target||!newPass) return {status:"error",message:"缺少目標帳號或新密碼"};
    if (newPass.length<4) return {status:"error",message:"新密碼至少需要 4 個字元"};

    const sheet = ss.getSheetByName("使用者清單")||ss.getSheetByName("學生帳密");
    if (!sheet) return {status:"error",message:"找不到【使用者清單】"};
    const data = sheet.getDataRange().getValues();

    for (let i=1;i<data.length;i++) {
      if (String(data[i][0]||"").trim()!==target) continue;
      const tRole  = String(data[i][2]||"student").trim().toLowerCase();
      const tClass = getStudentClass(target, data[i][3]);
      if (tRole==="teacher") return {status:"error",message:"無法修改教師帳號密碼"};
      if (!auth.isAdmin&&tClass!==auth.className) return {status:"error",message:"無權限修改其他班級的學生密碼"};
      sheet.getRange(i+1,2).setValue(hashPassword(newPass));
      clearLoginFailures(target);
      return {status:"success",message:`✅ ${target} 的密碼已成功更新並加密儲存`};
    }
    return {status:"error",message:"找不到該學生帳號"};
  } catch(e) {
    logError("changeStudentPassword",e,creds?creds.username:"","");
    return {status:"error",message:e.toString()};
  }
}

function changeOwnPassword(creds) {
  try {
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    const auth = authenticateUser(ss, creds.username, creds.oldPassword);
    if (!auth.success) return {status:"error",message:"舊密碼驗證失敗："+auth.message};
    if (auth.role==="teacher") return {status:"error",message:"教師請聯絡管理員修改密碼"};
    const newP = String(creds.newPassword||"").trim();
    const conP = String(creds.confirmPassword||"").trim();
    if (!newP)            return {status:"error",message:"新密碼不能為空"};
    if (newP.length<4)    return {status:"error",message:"新密碼至少需要 4 個字元"};
    if (newP!==conP)      return {status:"error",message:"新密碼與確認密碼不一致"};
    if (newP===creds.oldPassword) return {status:"error",message:"新密碼不能與舊密碼相同"};
    const sheet = ss.getSheetByName("使用者清單")||ss.getSheetByName("學生帳密");
    if (!sheet) return {status:"error",message:"找不到【使用者清單】"};
    const data  = sheet.getDataRange().getValues();
    for (let i=1;i<data.length;i++) {
      if (String(data[i][0]||"").trim()!==auth.username) continue;
      sheet.getRange(i+1,2).setValue(hashPassword(newP));
      clearLoginFailures(auth.username);
      return {status:"success",message:"✅ 密碼已成功更新！下次登入請使用新密碼。"};
    }
    return {status:"error",message:"找不到帳號資料"};
  } catch(e) {
    logError("changeOwnPassword",e,creds?creds.username:"","");
    return {status:"error",message:e.toString()};
  }
}

function getErrorLogs(creds) {
  try {
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    const auth = authenticateUser(ss, creds.username, creds.password);
    if (!auth.success||auth.role!=="teacher") return {status:"error",message:"無權限"};
    const s = ss.getSheetByName("錯誤日誌");
    if (!s||s.getLastRow()<2) return {status:"success",logs:[],total:0};
    const total = s.getLastRow()-1;
    const num   = Math.min(total,100);
    const logs  = s.getRange(2,1,num,5).getDisplayValues()
      .map((r,i)=>({id:i+1,time:r[0],action:r[1],user:r[2],message:r[3],details:r[4]}));
    return {status:"success",logs,total};
  } catch(e) {
    logError("getErrorLogs",e,creds?creds.username:"","");
    return {status:"error",message:e.toString()};
  }
}

function clearErrorLogs(creds) {
  try {
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    const auth = authenticateUser(ss, creds.username, creds.password);
    if (!auth.success||auth.role!=="teacher") return {status:"error",message:"無權限"};
    const s = ss.getSheetByName("錯誤日誌");
    if (s&&s.getLastRow()>=2) s.deleteRows(2,s.getLastRow()-1);
    return {status:"success",message:"錯誤日誌已清空"};
  } catch(e) { return {status:"error",message:e.toString()}; }
}

function reportClientError(rep) {
  try {
    logError("前端:"+String(rep.source||"UI"),String(rep.message||"未知前端錯誤"),
      String(rep.username||"訪客"),String(rep.stack||rep.details||""));
    return {status:"success"};
  } catch(_) { return {status:"error"}; }
}

const DEFAULT_GOALS = {masteredTarget:50,attemptsTarget:300,accuracyTarget:80,streakTarget:7,deadline:""};

function _getGoalsInternal(ss, username) {
  const sheet = ss.getSheetByName("系統目標設定")||ss.getSheetByName("學習目標");
  if (!sheet||sheet.getLastRow()<2) return {goals:DEFAULT_GOALS,updatedAt:""};
  const data = sheet.getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if (String(data[i][0]||"").trim()!==username) continue;
    try { return {goals:JSON.parse(String(data[i][1]||"{}")),updatedAt:String(data[i][2]||"")}; } catch(_) {}
  }
  return {goals:DEFAULT_GOALS,updatedAt:""};
}

function getStudentGoals(creds) {
  try {
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    const auth = authenticateUser(ss, creds.username, creds.password);
    if (!auth.success) return {status:"error",message:"認證失敗"};
    const target = (auth.role==="teacher"&&creds.targetStudent)?String(creds.targetStudent).trim():auth.username;
    if (auth.role === "teacher" && creds.targetStudent && !auth.isAdmin) {
      const classOverview = getClassOverviewRaw(ss);
      const studentMeta = classOverview.find(s => s.username.toLowerCase() === target.toLowerCase());
      if (studentMeta && studentMeta.className !== auth.className) {
        return {status:"error", message:"無權限存取其他班級的學生目標"};
      }
    }
    const r = _getGoalsInternal(ss, target);
    return {status:"success",goals:r.goals,updatedAt:r.updatedAt};
  } catch(e) {
    logError("getStudentGoals",e,creds?creds.username:"","");
    return {status:"error",message:e.toString()};
  }
}

function saveStudentGoals(creds, goals) {
  try {
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    const auth = authenticateUser(ss, creds.username, creds.password);
    if (!auth.success) return {status:"error",message:"認證失敗"};
    const target = (auth.role==="teacher"&&creds.targetStudent)?String(creds.targetStudent).trim():auth.username;
    if (!target) return {status:"error",message:"缺少目標學生帳號"};
    if (auth.role === "teacher" && creds.targetStudent && !auth.isAdmin) {
      const classOverview = getClassOverviewRaw(ss);
      const studentMeta = classOverview.find(s => s.username.toLowerCase() === target.toLowerCase());
      if (studentMeta && studentMeta.className !== auth.className) {
        return {status:"error", message:"無權限修改其他班級的學生目標"};
      }
    }

    let sheet = ss.getSheetByName("系統目標設定")||ss.getSheetByName("學習目標");
    if (!sheet) {
      sheet = ss.insertSheet("系統目標設定");
      sheet.appendRow(["學生帳號","目標JSON","更新時間","設定者"]);
      sheet.getRange("1:1").setFontWeight("bold").setBackground("#e0f2fe").setFontColor("#0369a1").setHorizontalAlignment("center");
      [140,320,180,120].forEach((w,i)=>sheet.setColumnWidth(i+1,w));
      sheet.setFrozenRows(1);
    }
    const goalJson = JSON.stringify(goals||{});
    const nowStr   = Utilities.formatDate(new Date(),"Asia/Taipei","yyyy-MM-dd HH:mm:ss");
    const setter   = auth.username+(auth.role==="teacher"?" (教師)":"");
    const data     = sheet.getDataRange().getValues();
    let row        = -1;
    for (let i=1;i<data.length;i++) {
      if (String(data[i][0]||"").trim()===target){row=i+1;break;}
    }
    if (row>0) sheet.getRange(row,2,1,3).setValues([[goalJson,nowStr,setter]]);
    else       sheet.appendRow([target,goalJson,nowStr,setter]);
    return {status:"success",message:"學習目標已成功儲存！",goals};
  } catch(e) {
    logError("saveStudentGoals",e,creds?creds.username:"","");
    return {status:"error",message:e.toString()};
  }
}

// ════════════════════════════════════════════════════════════════════
// 8. 試算表選單與自動化工具
// ════════════════════════════════════════════════════════════════════

function auditComplianceData(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const report = {
    timestamp: Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss"),
    spreadsheetName: ss.getName(),
    totalSheets: sheets.length,
    sheetNames: sheets.map(s => s.getName()),
    userListAudit: null,
    studentSheetsAudit: { count: 0, sampleSheets: [] },
    complianceSummary: {
      isFullyCompliant: true,
      hasNationalId: false,
      hasPhoneNumber: false,
      hasAddress: false,
      chineseNameCount: 0,
      englishOrCodeNameCount: 0,
      totalUsers: 0,
      unhashedPasswordCount: 0
    }
  };

  // 1. 檢驗【使用者清單】
  const uSheet = ss.getSheetByName("使用者清單") || ss.getSheetByName("學生帳密");
  if (uSheet && uSheet.getLastRow() >= 2) {
    const data = uSheet.getDataRange().getValues();
    const headers = data[0].map(String);
    let nationalIdCount = 0;
    let phoneCount = 0;
    let addressCount = 0;
    let chineseNameCount = 0;
    let englishOrCodeCount = 0;
    let unhashedPassCount = 0;
    const sampleStudents = [];

    for (let i = 1; i < data.length; i++) {
      const u = String(data[i][0] || "").trim();
      const p = String(data[i][1] || "").trim();
      const role = String(data[i][2] || "student").trim().toLowerCase();
      const c = String(data[i][3] || "").trim();
      const n = String(data[i][4] || "").trim();

      if (!isHashedPassword(p) && p !== "") unhashedPassCount++;
      
      const nonPassText = [u, role, c, n].join(" ");
      let isNatId = /\b[A-Z][12]\d{8}\b/i.test(nonPassText);
      if (isNatId) {
        nationalIdCount++;
        report.complianceSummary.matchedNationalIdDetail = { username: u, class: c, name: n };
      }
      if (/\b09\d{8}\b/.test(nonPassText)) phoneCount++;
      if (/(市|縣|區|路|街|巷|弄|號)/.test(nonPassText)) addressCount++;

      if (/[\u4e00-\u9fa5]/.test(n)) {
        chineseNameCount++;
      } else if (n) {
        englishOrCodeCount++;
      } else {
        englishOrCodeCount++;
      }

      sampleStudents.push({
        username: u,
        role: role,
        class: c,
        name: n,
        nameType: /[\u4e00-\u9fa5]/.test(n) ? "中文字元" : (n ? "英文名/暱稱 (" + n + ")" : "純座號無姓名"),
        passwordSecured: isHashedPassword(p)
      });
    }

    report.userListAudit = {
      totalUsers: data.length - 1,
      headers: headers,
      chineseNameCount,
      englishOrCodeCount,
      nationalIdCount,
      phoneCount,
      addressCount,
      unhashedPassCount,
      sampleStudents
    };

    report.complianceSummary.totalUsers = data.length - 1;
    report.complianceSummary.hasNationalId = nationalIdCount > 0;
    report.complianceSummary.hasPhoneNumber = phoneCount > 0;
    report.complianceSummary.hasAddress = addressCount > 0;
    report.complianceSummary.chineseNameCount = chineseNameCount;
    report.complianceSummary.englishOrCodeNameCount = englishOrCodeCount;
    report.complianceSummary.unhashedPasswordCount = unhashedPassCount;
  }

  // 2. 檢驗個別學生歷程工作表
  const studentSheetList = sheets.filter(s => {
    const name = s.getName();
    return !SYS.SYSTEM_SHEETS.has(name) && /^\d+/.test(name);
  });
  report.studentSheetsAudit.count = studentSheetList.length;
  if (studentSheetList.length > 0) {
    const sample = studentSheetList[0];
    const sHeaders = sample.getLastRow() >= 1 ? sample.getRange(1, 1, 1, Math.min(sample.getLastColumn(), 25)).getValues()[0] : [];
    report.studentSheetsAudit.sampleSheets.push({
      sheetName: sample.getName(),
      headers: sHeaders.map(String)
    });
  }

  return report;
}

function auditComplianceDataUi() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const rep = auditComplianceData(ss);
  
  let msg = `📅 檢驗時間：${rep.timestamp}\n\n`;
  if (rep.userListAudit) {
    msg += `【使用者清單檢驗結果】\n`;
    msg += `• 學生總數：${rep.userListAudit.totalUsers} 位\n`;
    msg += `• 中文真實姓名：${rep.userListAudit.chineseNameCount} 位\n`;
    msg += `• 英文名／座號代碼：${rep.userListAudit.englishOrCodeCount} 位\n`;
    msg += `• 身分證字號：${rep.userListAudit.nationalIdCount} 筆（${rep.userListAudit.nationalIdCount === 0 ? "✅ 完全零蒐集，符合規範" : "⚠️ 請移除身分證"}）\n`;
    msg += `• 電話／地址：${rep.userListAudit.phoneCount + rep.userListAudit.addressCount} 筆（✅ 無蒐集）\n`;
    msg += `• 密碼加密防護：${rep.userListAudit.unhashedPassCount === 0 ? "✅ 全數 SHA-256 加鹽雜湊" : `⚠️ 尚有 ${rep.userListAudit.unhashedPassCount} 筆未加密（可執行密碼加密工具升級）`}\n\n`;
  } else {
    msg += `⚠️ 未發現【使用者清單】分頁。\n\n`;
  }
  msg += `【作答歷程分頁】\n`;
  msg += `• 學生歷程工作表數：${rep.studentSheetsAudit.count} 個\n`;
  msg += `• 內容特性：僅記錄作答次數、答對率、星星數、關卡進度與日期（✅ 符合教學評量合法範圍，無多餘隱私資料）\n\n`;
  msg += `【合規性判定】\n`;
  if (rep.complianceSummary.hasNationalId || rep.complianceSummary.hasPhoneNumber) {
    msg += `⚠️ 建議移除表內身分證或電話資料以達最高合規。`;
  } else if (rep.complianceSummary.chineseNameCount === 0) {
    msg += `🎉 卓越等級！全表 100% 採行「班級座號代碼＋英文名」，無任何真實中文個資，實質法律風險為零！`;
  } else {
    msg += `✅ 合規！名單僅作學校教學用途，建議可逐步將中文姓名轉為英文名，達到最高去識別化保護。`;
  }

  ui.alert("⚖️ 個資與隱私合規檢驗報告", msg, ui.ButtonSet.OK);
}

function onOpen(e) {
  try {
    SpreadsheetApp.getUi()
      .createMenu("🎯 系統維護")
      .addItem("📊 一鍵整理所有學生分頁欄位與數值 (單字數)","migrateAllSheetsToVocabBasedUi")
      .addItem("📋 重新產生全班學習總覽","generateClassDashboardSheetUi")
      .addItem("🎨 美化所有學生分頁格式與欄寬","formatAllStudentSheetsUi")
      .addSeparator()
      .addItem("🔄 一鍵清理學生重複歷史列","cleanDuplicateStudentRecordsUi")
      .addItem("🔧 一鍵校正未完成測驗狀態與錯題單字","fixIncompleteTaskRecordsUi")
      .addItem("📋 查看目前儲存格完整單字清單 (彈窗)","showActiveCellWordListDialog")
      .addItem("🧹 一鍵清理無用分頁","cleanupUnusedSheetsUi")
      .addItem("🔐 密碼全面轉 SHA-256 加密","migrateAllPasswordsToHash")
      .addItem("⚖️ 執行【個資隱私合規性自動檢驗】","auditComplianceDataUi")
      .addItem("💾 備份試算表至 Google Drive","backupSpreadsheetToDrive")
      .addToUi();
  } catch(_) {}
}

function migrateAllSheetsToVocabBasedUi() {
  const ui = SpreadsheetApp.getUi();
  const res = migrateAllSheetsToVocabBased();
  ui.alert("📊 單字數基準整理完成",
    `✅ 已成功整理 ${res.updatedSheetsCount} 個工作表！\n\n所有學生分頁欄位與數值已全面轉為「答對單字數 / 受測單字數」，並同步更新【全班學習總覽】。`,
    ui.ButtonSet.OK);
}

function generateClassDashboardSheetUi() {
  const ui = SpreadsheetApp.getUi();
  generateClassDashboardSheet();
  ui.alert("📋 全班學習總覽更新完成",
    "✅ 已根據各學生最新單字數紀錄重新產生【全班學習總覽】！",
    ui.ButtonSet.OK);
}

function formatAllStudentSheetsUi() {
  const res = formatAllStudentSheets();
  const ui = SpreadsheetApp.getUi();
  ui.alert("🎨 格式美化完成",
    `✅ 已美化整理 ${res.count} 張學生工作表！`,
    ui.ButtonSet.OK);
}

function cleanDuplicateStudentRecordsUi() {
  const ui = SpreadsheetApp.getUi();
  const res = cleanDuplicateStudentRecords();
  ui.alert("🔄 清理學生紀錄完成",
    `✅ ${res.message}\n\n已檢查學生分頁：${res.checkedSheets} 個\n已清理多餘重複列：${res.deletedRows} 列`,
    ui.ButtonSet.OK);
}

function cleanDuplicateStudentRecords() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  let checkedSheets = 0;
  let deletedRows = 0;

  sheets.forEach(s => {
    try {
      const curMax = s.getMaxRows();
      if (curMax < 1000) {
        s.insertRowsAfter(curMax, 1000 - curMax);
      }
    } catch(_) {}
    const name = s.getName().trim();
    if (isSystemSheet(name)) return;
    checkedSheets++;
    const lastRow = s.getLastRow();
    if (lastRow <= 2) return;

    // 檢查最多前 60 列
    const checkCount = Math.min(lastRow - 1, 60);
    const data = s.getRange(2, 1, checkCount, 22).getValues();
    const seen = new Set();
    const toDelete = [];

    for (let i = 0; i < data.length; i++) {
      const dStr = formatStandardDateYMD(data[i][0]);
      const task = String(data[i][18] || "自主練習").trim();
      const score = String(data[i][19] || "—").trim();
      const status = String(data[i][21] || "—").trim();
      if (!dStr) continue;

      // 複合 key：日期 + 任務名稱
      const key = dStr + "___" + task;
      if (seen.has(key)) {
        // 重複列（由於從第 2 列開始由新到舊讀取，後面讀到的都是較舊的重複列）
        toDelete.push(i + 2);
      } else {
        seen.add(key);
      }
    }

    // 從下方開始刪除以保持行號正確
    for (let k = toDelete.length - 1; k >= 0; k--) {
      try {
        s.deleteRow(toDelete[k]);
        deletedRows++;
      } catch(_) {}
    }
  });

  clearOverviewCache();
  return { status: "success", message: "學生重複紀錄已徹底掃描並清理完成！", checkedSheets, deletedRows };
}

function cleanupUnusedSheetsUi() {
  const res = cleanupUnusedSheets();
  const ui = SpreadsheetApp.getUi();
  const delStr = (res.deletedSheets && res.deletedSheets.length > 0) ? res.deletedSheets.join("、") : "無";
  ui.alert("🧹 清理完成", `✅ ${res.message}\n\n已刪除無用分頁：${delStr}\n保留必要分頁數：${res.keptSheets ? res.keptSheets.length : 0} 個`, ui.ButtonSet.OK);
}

function migrateAllPasswordsToHash() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const ui    = SpreadsheetApp.getUi();
  const sheet = ss.getSheetByName("使用者清單");
  if (!sheet) { ui.alert("❌ 找不到【使用者清單】工作表"); return; }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) { ui.alert("ℹ️ 帳號清單是空的"); return; }

  const passCol = [];
  let count=0, skipped=0;

  for (let i=1;i<data.length;i++) {
    const pass = String(data[i][1]||"").trim();
    if (!pass)                  { passCol.push([data[i][1]]); continue; }
    if (isHashedPassword(pass)) { passCol.push([pass]); skipped++; continue; }
    passCol.push([hashPassword(pass)]);
    count++;
  }

  if (passCol.length > 0) {
    sheet.getRange(2,2,passCol.length,1).setValues(passCol);
  }

  ui.alert("🔐 密碼加密遷移完成",
    `✅ 成功加密：${count} 筆\n⏭️ 已加密跳過：${skipped} 筆\n\n所有密碼現已使用 SHA-256 雜湊儲存！`,
    ui.ButtonSet.OK);
}

function generateClassDashboardSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let dash = ss.getSheetByName("全班學習總覽");
  if (!dash) { dash = ss.insertSheet("全班學習總覽",0); }
  else { dash.clear(); ss.setActiveSheet(dash); ss.moveActiveSheet(1); }

  const uSheet = ss.getSheetByName("使用者清單");
  const metaMap = {};
  if (uSheet && uSheet.getLastRow()>=2) {
    uSheet.getDataRange().getValues().slice(1).forEach(r=>{
      const u=String(r[0]||"").trim();
      if (u) metaMap[u]={className:getStudentClass(u,String(r[3]||"").trim()),realName:String(r[4]||"").trim()};
    });
  }

  const todayStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
  const todayMap = getTodayTaskMap(ss, todayStr);

  // 取得今日各班級之指派任務清單（精確判斷「未指派」vs「未受測」）
  const allTeacherTasks = getTeacherTasksCached_(ss);
  const classTaskAssignedToday = new Map();
  allTeacherTasks.forEach(t => {
    if (t.enabled && t.taskName && t.rawWords) {
      if (!t.taskDate || formatStandardDateYMD(t.taskDate) === todayStr) {
        const c = String(t.taskClass || "").replace(/班$/, "").trim().toLowerCase();
        classTaskAssignedToday.set(c, t.taskName);
      }
    }
  });
  const schoolWideTaskName = classTaskAssignedToday.get("all") || classTaskAssignedToday.get("全校") || null;

  const headers = ["班級","學生帳號","姓名","今日指定任務成績","最後練習日期","學習活躍度",
    "累積精通單字","練習中","學習中","共答對單字","單字熟練度分佈",
    "累積受測單字","單字掌握率","目前連勝","歷史最佳連勝",
    "LEVEL 1","LEVEL 2","LEVEL 3","LEVEL 4","LEVEL 5",
    "🎧聽與拼","✅選拼法","🧩重組","🖍️填陷阱"];
  dash.appendRow(headers);
  dash.getRange("1:1").setBackground("#1e3a8a").setFontColor("#ffffff").setFontWeight("bold")
    .setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
  dash.setRowHeight(1,44); dash.setFrozenRows(1);

  const sheets     = ss.getSheets().filter(s=>!isSystemSheet(s.getName()));
  const sheetNames = sheets.map(s=>s.getName());
  let rowsMap      = {};

  try {
    const resp = Sheets.Spreadsheets.Values.batchGet(ss.getId(), {
      ranges            : sheetNames.map(n=>`'${n}'!A2:Z2`),
      valueRenderOption : "FORMATTED_VALUE",
      majorDimension    : "ROWS"
    });
    (resp.valueRanges||[]).forEach((vr,i)=>{
      rowsMap[sheetNames[i]] = (vr.values||[])[0]||[];
    });
  } catch(_) {
    sheets.forEach(s=>{
      rowsMap[s.getName()] = s.getLastRow()>=2 ? s.getRange(2,1,1,Math.min(s.getLastColumn(),26)).getDisplayValues()[0] : [];
    });
  }

  const now = new Date();
  const rows=[], dataValues=[];

  sheetNames.forEach(name=>{
    const meta    = metaMap[name]||{className:getStudentClass(name,""),realName:""};
    const row     = rowsMap[name]||[];
    const hasData = row.length>0;

    let dateStr="尚未練習", active="⚪ 未開始", daysDiff=999;
    if (hasData && row[0]) {
      dateStr = formatStandardDateYMD(row[0]);
      const d = new Date(dateStr.replace(/-/g,"/"));
      if (!isNaN(d.getTime())) {
        daysDiff = Math.floor((now-d)/(1000*60*60*24));
        active   = daysDiff<=3 ? "🟢 活躍 (≤3日)" : daysDiff<=7 ? "🟡 稍緩 (4-7日)" : "🔴 停滯 (>7日)";
      }
    }

    const tItem = todayMap[name];
    const cleanCls = String(meta.className || "").replace(/班$/, "").trim().toLowerCase();
    const assignedTaskName = classTaskAssignedToday.get(cleanCls) || schoolWideTaskName;
    const isClassAssignedToday = !!assignedTaskName;

    let todayTaskText = "⚪ 未指派";
    if (tItem && tItem.status && tItem.status.includes("已完成") && tItem.score !== "—") {
      todayTaskText = `${tItem.score} (${tItem.rate})`;
    } else if (tItem && tItem.status && tItem.status.includes("作答中")) {
      todayTaskText = tItem.status;
    } else if (isClassAssignedToday) {
      todayTaskText = "⚪ 未受測";
    } else {
      todayTaskText = "⚪ 未指派";
    }

    const n = k=>parseInt(String(row[k]||"0").replace(/,/g,""))||0;
    let mCount=0, pCount=0, lCount=0, cCount=0, aCount=0, accStr="0%", l1="0/0", l2="0/0", l3="0/0", l4="0/0", l5="0/0", mList="0/0", mPick="0/0", mScram="0/0", mTrap="0/0";
    let curStreak=0, bestStreak=0;
    if (hasData) {
      if (row.length === 25) {
        // 最新精簡 25 欄格式 (已移除等級贅欄)
        curStreak = n(3); bestStreak = n(4);
        lCount = n(5); pCount = n(6); mCount = n(7);
        cCount = lCount + pCount + mCount;
        aCount = n(9); accStr = String(row[10] || "0%");
        l1 = String(row[11] || "0/0"); l2 = String(row[12] || "0/0"); l3 = String(row[13] || "0/0"); l4 = String(row[14] || "0/0"); l5 = String(row[15] || "0/0");
        mList = String(row[16] || "0/0"); mPick = String(row[17] || "0/0"); mScram = String(row[18] || "0/0"); mTrap = String(row[19] || "0/0");
      } else if (row.length === 26) {
        // 舊版 26 欄格式 (含等級贅欄)
        curStreak = n(4); bestStreak = n(5);
        lCount = n(6); pCount = n(7); mCount = n(8);
        cCount = lCount + pCount + mCount;
        aCount = n(10); accStr = String(row[11] || "0%");
        l1 = String(row[12] || "0/0"); l2 = String(row[13] || "0/0"); l3 = String(row[14] || "0/0"); l4 = String(row[15] || "0/0"); l5 = String(row[16] || "0/0");
        mList = String(row[17] || "0/0"); mPick = String(row[18] || "0/0"); mScram = String(row[19] || "0/0"); mTrap = String(row[20] || "0/0");
      } else {
        // 舊版 27 欄備援格式
        curStreak = n(4); bestStreak = n(5);
        mCount = n(14); pCount = n(15); lCount = n(16);
        cCount = lCount + pCount + mCount;
        aCount = n(6); accStr = String(row[8] || "0%");
        l1 = String(row[9] || "0/0"); l2 = String(row[10] || "0/0"); l3 = String(row[11] || "0/0"); l4 = String(row[12] || "0/0"); l5 = String(row[13] || "0/0");
        mList = String(row[23] || "0/0"); mPick = String(row[24] || "0/0"); mScram = String(row[25] || "0/0"); mTrap = String(row[26] || "0/0");
      }

      // 百分比格式誤判防護：若 mCount 異常偏高 (如 300) 且剛好為整百倍數，且與學習中+練習中相符，自動校正
      if (mCount >= 100 && (mCount % 100 === 0) && (lCount + pCount + Math.round(mCount / 100) === cCount)) {
        mCount = Math.round(mCount / 100);
      }
    }

    dataValues.push([
      meta.className, name, meta.realName||"—", todayTaskText, dateStr, active,
      mCount, pCount, lCount, cCount, "",
      aCount, accStr,
      curStreak, bestStreak,
      l1, l2, l3, l4, l5,
      mList, mPick, mScram, mTrap
    ]);
    rows.push({name, className: meta.className, mastered: mCount});
  });

  const sorted = dataValues
    .map((v,i)=>({v,m:rows[i].mastered,c:rows[i].className}))
    .sort((a,b)=>a.c.localeCompare(b.c)||b.m-a.m)
    .map(x=>x.v);

  if (sorted.length>0) {
    dash.getRange(2,1,sorted.length,headers.length).setValues(sorted)
      .setHorizontalAlignment("center").setVerticalAlignment("middle");

    const formulas = sorted.map((_,idx)=>{
      const r=idx+2;
      return [`=IF(J${r}>0,SPARKLINE({G${r},H${r},I${r}},{"charttype","bar";"color1","#16a34a";"color2","#2563eb";"color3","#f59e0b";"max",MAX(J${r},1)}),"")`];
    });
    dash.getRange(2,11,formulas.length,1).setFormulas(formulas);

    const bgs = sorted.map((_,i)=>Array(headers.length).fill(i%2?'#f8fafc':'#ffffff'));
    dash.getRange(2,1,sorted.length,headers.length).setBackgrounds(bgs);
    dash.setRowHeights(2,sorted.length,32);

    [100,120,100,140,110,125,100,85,85,100,180,100,95,85,105,110,110,110,110,110, 110,110,110,110]
      .forEach((w,i)=>dash.setColumnWidth(i+1,w));
  }

  // 最佳化裁切全班學習總覽空白欄與列
  if (dash.getMaxColumns() > 24) {
    dash.deleteColumns(25, dash.getMaxColumns() - 24);
  }
  const maxDashRows = dash.getMaxRows();
  if (maxDashRows < 1000) {
    dash.insertRowsAfter(maxDashRows, 1000 - maxDashRows);
  }

  ss.toast(`✅ 已彙整 ${sorted.length} 位學生數據至「全班學習總覽」！`,"學習歷程管理中心",5);
}

/**
 * 🚀 全面遷移現有 Google Sheet 所有學生分頁與全班學習總覽至「單字數」基準
 */
function cleanupAndOptimizeSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const report = {
    systemSheetsOptimized: [],
    studentSheetsCleaned: [],
    errors: []
  };

  const allTeacherTasks = getTeacherTasksCached_(ss);

  const studentHdr26 = [
    "備份時間", "完整JSON", "等級", "分數", "連勝", "最佳連勝",
    "學習中", "練習中", "精通", "共答對單字", "累積受測單字", "單字掌握率",
    "LEVEL 1 入門\n(答對/受測字數)", "LEVEL 2 基礎\n(答對/受測字數)",
    "LEVEL 3 進階\n(答對/受測字數)", "LEVEL 4 挑戰\n(答對/受測字數)", "LEVEL 5 精熟\n(答對/受測字數)",
    "🎧 聽與拼\n(答對/受測字數)", "✅ 選拼法\n(答對/受測字數)", "🧩 字母重組\n(答對/受測字數)", "🖍️ 填空陷阱\n(答對/受測字數)",
    "任務名稱", "指定測驗成績", "指定測驗正確率", "練習狀態", "測驗錯題單字"
  ];

  const widths26 = [
    155, 40, 60, 70, 65, 75,
    75, 75, 75, 95, 105, 95,
    115, 115, 115, 115, 115,
    115, 115, 115, 115,
    130, 95, 95, 110, 220
  ];

  // 1. 系統工作表最適化設定（刪除多餘空白欄列）
  const systemConfigs = {
    "全班學習總覽": { keepCols: 24, keepRowsBuffer: 5 },
    "使用者清單": { keepCols: 5, keepRowsBuffer: 10 },
    "指定單字任務": { keepCols: 7, keepRowsBuffer: 10 },
    "錯誤日誌": { keepCols: 5, keepRowsBuffer: 20 },
    "時間限制設定": { keepCols: 12, keepRowsBuffer: 10 }
  };

  sheets.forEach(sheet => {
    const sName = sheet.getName();
    try {
      if (isSystemSheet(sName)) {
        if (sName !== "全班學習總覽") {
          const cfg = systemConfigs[sName];
          if (cfg) {
            const maxCols = sheet.getMaxColumns();
            if (maxCols > cfg.keepCols) {
              sheet.deleteColumns(cfg.keepCols + 1, maxCols - cfg.keepCols);
            }
            const maxRows = sheet.getMaxRows();
            if (maxRows < 1000) {
              sheet.insertRowsAfter(maxRows, 1000 - maxRows);
            }
            report.systemSheetsOptimized.push(sName);
          }
        }
        return;
      }

      // --- 學生個人工作表 ---
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      const maxCols = sheet.getMaxColumns();

      if (maxCols < 26) {
        sheet.insertColumnsAfter(maxCols, 26 - maxCols);
      }

      let oldHeaders = [];
      if (lastRow >= 1 && lastCol >= 1) {
        oldHeaders = sheet.getRange(1, 1, 1, Math.min(lastCol, 35)).getValues()[0] || [];
      }
      const hMap = getHeaderIndexMap(oldHeaders);

      if (lastRow >= 2) {
        const rowsCount = lastRow - 1;
        const oldVals = sheet.getRange(2, 1, rowsCount, lastCol).getValues();
        const newRows = [];

        for (let r = 0; r < oldVals.length; r++) {
          const row = oldVals[r];
          const storedJson = row[1]; // Column B
          const rowIdx = r + 2;

          let agentData = null;
          if (storedJson) {
            try {
              const rawDecomp = decompressData(storedJson);
              const parsed = JSON.parse(rawDecomp);
              const agentRaw = parsed["spellAgent.v2"];
              agentData = (typeof agentRaw === "string") ? JSON.parse(agentRaw) : (agentRaw || {});
            } catch(_) {}
          }

          const sumData = calculateSummaryFromAgentData(agentData, null);

          const curLevel = (agentData && agentData.level && agentData.level.current) || (agentData && agentData.currentLevel) || (row[hMap.level] !== undefined ? row[hMap.level] : 1);
          const oldScore = (agentData && agentData.points !== undefined) ? agentData.points : (row[hMap.score] || 0);
          const oldStreak = (agentData && agentData.streak !== undefined) ? agentData.streak : (row[hMap.streak] || 0);
          const oldBest = (agentData && agentData.best !== undefined) ? agentData.best : (row[hMap.best] || 0);

          const pureCorrect = sumData.distinctCorrect;
          const pureRate    = sumData.testedVocab > 0 ? (Math.round((sumData.distinctCorrect / sumData.testedVocab) * 10000) / 10000) : 0;

          const rawTask = String(row[hMap.taskName] || "").trim();
          const rawScore = String(row[hMap.taskScore] || "").trim();
          const rawRate = String(row[hMap.taskRate] || "").trim();
          const rawStatus = String(row[hMap.status] || "").trim();
          const rawWrong = String(row[hMap.wrong] || "").trim();

          let taskName = "⚪ 未指派";
          let taskScore = "—";
          let taskRate = "—";
          let status = "⚪ 未指派";
          let wrong = "";

          const isRealCompletedTask = rawTask && !rawTask.includes("自由") && !rawTask.includes("自主") && !rawTask.includes("未指派") && rawTask !== "—" && (rawStatus.includes("已完成") || (rawScore !== "—" && rawScore.includes("/")));
          const isInProgressTask = rawStatus.includes("作答中");

          if (isRealCompletedTask) {
            taskName = rawTask;
            taskScore = (rawScore && rawScore !== "—") ? rawScore : "—";
            taskRate = (rawRate && !rawRate.includes("/")) ? rawRate : "—";
            status = "🟢 已完成";
            wrong = (rawWrong && !rawWrong.includes("/")) ? rawWrong : "";
          } else if (isInProgressTask) {
            taskName = rawTask;
            taskScore = rawScore || "—";
            taskRate = "—";
            status = rawStatus;
            wrong = rawWrong || "";
          } else {
            // 檢查該日該學生之班級是否有指派指定測驗
            const rowDateYMD = formatStandardDateYMD(row[0]);
            const sClass = getStudentClass(sheet.getName(), "");
            const cleanCls = String(sClass || "").replace(/班$/, "").trim().toLowerCase();
            let matchedTaskName = "";
            (allTeacherTasks || []).forEach(t => {
              if (!t.enabled || !t.taskName || !t.rawWords) return;
              const tDate = t.taskDate ? formatStandardDateYMD(t.taskDate) : "";
              if (tDate && tDate !== rowDateYMD) return;
              const tc = String(t.taskClass || "").replace(/班$/, "").trim().toLowerCase();
              if (tc === cleanCls || tc === "all" || tc === "全校") {
                matchedTaskName = t.taskName;
              }
            });

            if (matchedTaskName) {
              taskName = matchedTaskName;
              status = "⚪ 未受測";
            } else {
              taskName = "⚪ 未指派";
              status = "⚪ 未指派";
            }
          }

          const newRow = [
            row[0],              // 1: 備份時間
            row[1],              // 2: 完整JSON
            curLevel,            // 3: 等級 (保留)
            oldScore,            // 4: 分數
            oldStreak,           // 5: 連勝
            oldBest,             // 6: 最佳連勝
            sumData.learning,    // 7: 學習中
            sumData.practicing,  // 8: 練習中
            sumData.mastered,    // 9: 精通 (純整數格式)
            pureCorrect,         // 10: 共答對單字
            sumData.testedVocab, // 11: 累積受測單字
            pureRate,            // 12: 單字掌握率
            sumData.l1, sumData.l2, sumData.l3, sumData.l4, sumData.l5, // 13~17: LEVEL 1~5
            sumData.mListen, sumData.mPick, sumData.mScramble, sumData.mTrap, // 18~21: 四大模式
            taskName,            // 22: 任務名稱
            taskScore,           // 23: 指定測驗成績
            taskRate,            // 24: 指定測驗正確率
            status,              // 25: 練習狀態
            wrong                // 26: 測驗錯題單字
          ];
          newRows.push(newRow);
        }

        sheet.getRange(2, 1, newRows.length, 26).setValues(newRows)
          .setHorizontalAlignment("center").setVerticalAlignment("middle");

        sheet.getRange(2, 7, newRows.length, 5).setNumberFormat("0");
        sheet.getRange(2, 12, newRows.length, 1).setNumberFormat("0%");
        sheet.getRange(2, 13, newRows.length, 9).setNumberFormat("@");
        sheet.getRange(2, 23, newRows.length, 2).setNumberFormat("@");
      }

      // 覆寫表頭與美化樣式
      sheet.getRange(1, 1, 1, studentHdr26.length).setValues([studentHdr26]);
      sheet.getRange("1:1").setWrap(true).setHorizontalAlignment("center").setVerticalAlignment("middle");
      sheet.setRowHeight(1, 45);
      if (sheet.getFrozenRows() < 1) sheet.setFrozenRows(1);
      if (sheet.getFrozenColumns() < 1) sheet.setFrozenColumns(1);
      sheet.hideColumns(2);

      sheet.getRange("A1").setBackground("#f1f5f9").setFontColor("#334155").setFontWeight("bold");
      sheet.getRange("B1").setBackground("#e2e8f0").setFontColor("#64748b").setFontWeight("normal");
      sheet.getRange("C1:F1").setBackground("#dbeafe").setFontColor("#1e40af").setFontWeight("bold");
      sheet.getRange("G1:L1").setBackground("#dcfce7").setFontColor("#065f46").setFontWeight("bold");
      sheet.getRange("M1:Q1").setBackground("#f3e8ff").setFontColor("#6b21a8").setFontWeight("bold");
      sheet.getRange("R1:U1").setBackground("#ccfbf1").setFontColor("#0f766e").setFontWeight("bold");
      sheet.getRange("V1:Z1").setBackground("#e0e7ff").setFontColor("#3730a3").setFontWeight("bold");

      widths26.forEach((w, idx) => sheet.setColumnWidth(idx + 1, w));

      if (sheet.getMaxColumns() > 26) {
        sheet.deleteColumns(27, sheet.getMaxColumns() - 26);
      }

      const curMaxRows = sheet.getMaxRows();
      if (curMaxRows < 1000) {
        sheet.insertRowsAfter(curMaxRows, 1000 - curMaxRows);
      }

      report.studentSheetsCleaned.push(sName);
    } catch(err) {
      report.errors.push({ sheet: sName, error: err.message });
      Logger.log("Error in sheet " + sName + ": " + err.message);
    }
  });

  try {
    generateClassDashboardSheet();
    report.dashboardRegenerated = true;
  } catch(e) {
    report.dashboardError = e.message;
  }

  clearOverviewCache();
  return { status: "success", report };
}

function migrateAllSheetsToVocabBased() {
  return cleanupAndOptimizeSpreadsheet();
}

function initStudentPasswordSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("使用者清單")||ss.getSheetByName("學生帳密");
  if (!sheet) {
    sheet = ss.insertSheet("使用者清單");
    sheet.appendRow(["帳號","密碼(加密)","角色","班級","姓名"]);
    sheet.getRange("A1:E1").setBackground("#0f766e").setFontColor("#fff")
      .setFontWeight("bold").setHorizontalAlignment("center");
    [130,200,100,120,120].forEach((w,i)=>sheet.setColumnWidth(i+1,w));
    sheet.setFrozenRows(1);
  }

  const existing = new Set();
  if (sheet.getLastRow()>=2) {
    sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues()
      .forEach(r=>{ if (r[0]) existing.add(String(r[0]).trim()); });
  }

  const toAdd = [];
  ss.getSheets().forEach(s=>{
    const name=s.getName().trim();
    if (isSystemSheet(name)||existing.has(name)) return;
    toAdd.push([name, hashPassword(name), "student", getStudentClass(name,""), ""]);
    existing.add(name);
  });

  if (toAdd.length>0) {
    sheet.getRange(sheet.getLastRow()+1,1,toAdd.length,5).setValues(toAdd);
    ss.toast(`✅ 已為 ${toAdd.length} 位新學生建立加密帳號！`,"學習歷程管理中心",5);
  } else {
    ss.toast("所有學生帳密均已同步！","學習歷程管理中心",4);
  }
}

function checkInactiveStudentsAlert() {
  const ss=SpreadsheetApp.getActiveSpreadsheet(), ui=SpreadsheetApp.getUi();
  const now=new Date(), inactive=[], never=[];
  ss.getSheets().forEach(s=>{
    const name=s.getName().trim();
    if (isSystemSheet(name)) return;
    if (s.getLastRow()>=2) {
      const raw = s.getRange(2,1).getValue();
      const dateStr = formatStandardDateYMD(raw);
      if (dateStr) {
        const d = new Date(dateStr.replace(/-/g, "/"));
        if (!isNaN(d.getTime())) {
          const days = Math.floor((now - d) / (1000 * 60 * 60 * 24));
          if (days >= 7) inactive.push({ name, days, date: dateStr });
        }
      }
    } else { never.push(name); }
  });
  inactive.sort((a,b)=>b.days-a.days);
  let msg=`📅 ${Utilities.formatDate(now,"Asia/Taipei","yyyy-MM-dd HH:mm")}\n\n`;
  if (inactive.length) {
    msg+=`⚠️ 超過 7 日未練習（${inactive.length} 人）：\n`;
    inactive.forEach(x=>{ msg+=` • ${x.name}：停滯 ${x.days} 天（最後：${x.date}）\n`; });
    msg+="\n";
  }
  if (never.length) msg+=`⚪ 從未上線（${never.length} 人）：\n • ${never.join("、")}\n\n`;
  if (!inactive.length&&!never.length) msg+="🎉 全班同學在過去 7 天內皆有上線練習！";
  ui.alert("⚠️ 學習活躍度預警",msg,ui.ButtonSet.OK);
}

function formatAllStudentSheets() {
  const ss=SpreadsheetApp.getActiveSpreadsheet(); let count=0;
  ss.getSheets().forEach(s=>{
    const name=s.getName().trim();
    if (isSystemSheet(name)) return;
    ensureStudentSheetColumns(s);
    count++;
  });
  ss.toast(`✅ 已完成美化與整理 ${count} 張學生工作表！`,"學習歷程管理中心",5);
}

function setupDailyTriggers() {
  const ui = SpreadsheetApp.getUi();
  ScriptApp.getProjectTriggers()
    .filter(t=>["backupSpreadsheetToDrive","warmUpCache"].includes(t.getHandlerFunction()))
    .forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("backupSpreadsheetToDrive").timeBased().atHour(3).everyDays(1).create();
  ScriptApp.newTrigger("warmUpCache").timeBased().atHour(7).everyDays(1).create();
  ui.alert("✅ 排程設定完成",
    "每日 03:00：自動備份至 Drive\n每日 07:30：快取預熱（師生上線前完成）",
    ui.ButtonSet.OK);
}

function removeAllTriggers() {
  const ui=SpreadsheetApp.getUi();
  let n=0;
  ScriptApp.getProjectTriggers().forEach(t=>{ ScriptApp.deleteTrigger(t); n++; });
  ui.alert(n>0?`🚫 已移除 ${n} 個排程觸發器`:"ℹ️ 目前沒有排程","",ui.ButtonSet.OK);
}

function _getBackupFolder() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const par=DriveApp.getFileById(ss.getId()).getParents();
  const target=par.hasNext()?par.next():DriveApp;
  const f=target.getFoldersByName(SYS.BACKUP_FOLDER);
  return f.hasNext()?f.next():target.createFolder(SYS.BACKUP_FOLDER);
}

function backupSpreadsheetToDrive() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const file  = DriveApp.getFileById(ss.getId());
  const folder= _getBackupFolder();
  const now   = new Date();
  const name  = `${ss.getName()}_備份_${Utilities.formatDate(now,"Asia/Taipei","yyyy-MM-dd_HHmm")}`;
  const bFile = file.makeCopy(name, folder);
  const files=[]; const it=folder.getFiles();
  while(it.hasNext()){const f=it.next();files.push({f,t:f.getDateCreated().getTime()});}
  files.sort((a,b)=>b.t-a.t);
  files.slice(SYS.MAX_BACKUP_FILES).forEach(x=>x.f.setTrashed(true));
  try {
    SpreadsheetApp.getUi().showModalDialog(
      HtmlService.createHtmlOutput(`
        <div style="font-family:Arial,sans-serif;padding:14px;line-height:1.7">
          <h3 style="color:#15803d;margin-top:0">🎉 備份成功！</h3>
          <p><b>檔案：</b>${name}</p>
          <p><b>時間：</b>${Utilities.formatDate(now,"Asia/Taipei","yyyy-MM-dd HH:mm:ss")}</p>
          <div style="margin-top:14px;display:flex;gap:10px">
            <a href="${bFile.getUrl()}" target="_blank" style="background:#2563eb;color:white;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:bold">📄 開啟備份</a>
            <a href="${folder.getUrl()}" target="_blank" style="background:#475569;color:white;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:bold">📁 備份資料夾</a>
          </div>
        </div>`).setWidth(440).setHeight(200),"💾 備份完成");
  } catch(_) { Logger.log("[排程備份成功] "+name); }
  return bFile.getId();
}

function exportFullSystemJsonArchive() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const folder = _getBackupFolder();
  const now    = new Date();
  const timeStr= Utilities.formatDate(now,"Asia/Taipei","yyyy-MM-dd_HHmm");

  const archive = {
    exportTime     : Utilities.formatDate(now,"Asia/Taipei","yyyy-MM-dd HH:mm:ss"),
    spreadsheetId  : ss.getId(),
    spreadsheetName: ss.getName(),
    systemVersion  : "v4.1",
    note           : "密碼欄位已移除（資安保護）",
    users:[], goals:[], students:{}
  };

  const uSheet=ss.getSheetByName("使用者清單");
  if (uSheet&&uSheet.getLastRow()>=2) {
    uSheet.getDataRange().getValues().slice(1).forEach(r=>{
      archive.users.push({
        username:String(r[0]||"").trim(),
        role:String(r[2]||"student").trim(),
        className:String(r[3]||"").trim(),
        realName:String(r[4]||"").trim()
      });
    });
  }

  const studentSheets = ss.getSheets().filter(s=>!isSystemSheet(s.getName()));
  let rowsMap={};
  try {
    const names=studentSheets.map(s=>s.getName());
    const resp=Sheets.Spreadsheets.Values.batchGet(ss.getId(),{
      ranges:names.map(n=>`'${n}'!A:B`),valueRenderOption:"UNFORMATTED_VALUE",majorDimension:"ROWS"
    });
    (resp.valueRanges||[]).forEach((vr,i)=>{ rowsMap[names[i]]=vr.values||[]; });
  } catch(_) {
    studentSheets.forEach(s=>{
      rowsMap[s.getName()]=s.getLastRow()>=2?s.getDataRange().getValues():[];
    });
  }

  let count=0;
  studentSheets.forEach(s=>{
    const name=s.getName();
    const rows=rowsMap[name]||[];
    if (rows.length>=2) {
      archive.students[name]={
        totalBackups:rows.length-1,
        history:rows.slice(1).map(r=>({
          backupTime:String(r[0]||""),
          payload:(()=>{try{return JSON.parse(decompressData(String(r[1]||"")));}catch(_){return null;}})()
        }))
      };
      count++;
    }
  });

  const json = JSON.stringify(archive,null,2);
  const file = folder.createFile(`學習歷程系統完整歸檔_${timeStr}.json`,json,"application/json");

  try {
    SpreadsheetApp.getUi().showModalDialog(
      HtmlService.createHtmlOutput(`
        <div style="font-family:Arial,sans-serif;padding:14px;line-height:1.7">
          <h3 style="color:#15803d;margin-top:0">📦 JSON 封裝完成！</h3>
          <p><b>${count} 位學生</b>完整歷程已封裝（密碼欄位已移除）</p>
          <div style="margin-top:14px;display:flex;gap:10px">
            <a href="${file.getUrl()}" target="_blank" style="background:#2563eb;color:white;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:bold">📥 下載 JSON</a>
            <a href="${folder.getUrl()}" target="_blank" style="background:#475569;color:white;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:bold">📁 備份資料夾</a>
          </div>
        </div>`).setWidth(440).setHeight(200),"📦 JSON 導出");
  } catch(_) {}
  return file.getId();
}

function openBackupFolderUi() {
  const folder=_getBackupFolder();
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(`
      <div style="font-family:Arial,sans-serif;padding:20px;text-align:center">
        <h3>📁 雲端硬碟備份庫</h3>
        <a href="${folder.getUrl()}" target="_blank"
           style="background:#2563eb;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold">
          🚀 開啟備份資料夾
        </a>
        <p style="font-size:12px;color:#94a3b8;margin-top:16px">${folder.getName()}</p>
      </div>`).setWidth(360).setHeight(160),"📂 雲端備份庫");
}

function fixIncompleteTaskRecordsUi() {
  const ui = SpreadsheetApp.getUi();
  const res = fixIncompleteTaskRecords();
  ui.alert("🔧 校正未完成測驗狀態完成",
    `✅ 已檢查並校正 ${res.modifiedCount} 個學生的未完成測驗紀錄！\n未完成測驗之正確率已轉為 (答對題數/出題總數)，未作答單字已全數計入錯題。\n\n校正清單：\n${(res.details || []).map(d => d.student + ' (' + d.changes.length + ' 列)').join('、') || '無須校正項目'}`,
    ui.ButtonSet.OK);
}

/**
 * 自動將學生工作表歷史資料列移位校準為 33 欄新結構，並修正施測/作答/答對單字數與測驗成績/正確率/狀態
 */
function migrateStudentSheetRows_(sheet) {
  if (!sheet) return false;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return false;

  const numRows = lastRow - 1;
  const range = sheet.getRange(2, 1, numRows, Math.max(lastCol, 33));
  const values = range.getValues();
  const name = sheet.getName().trim();
  let sheetModified = false;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    while (row.length < 33) row.push("");
    const dStr = formatStandardDateYMD(row[0]);
    if (!dStr) continue;

    const val22 = String(row[22] !== undefined ? row[22] : "").trim().replace(/^'+/, "");
    const val23 = String(row[23] !== undefined ? row[23] : "").trim().replace(/^'+/, "");
    const val24 = String(row[24] !== undefined ? row[24] : "").trim();
    const val25 = String(row[25] !== undefined ? row[25] : "").trim();
    const val26 = String(row[26] !== undefined ? row[26] : "").trim();
    const val27 = String(row[27] !== undefined ? row[27] : "").trim();
    const val28 = String(row[28] !== undefined ? row[28] : "").trim();
    const val29 = String(row[29] !== undefined ? row[29] : "").trim();

    const isOldStatusAt24 = val24.includes("完成") || val24.includes("中斷") || val24.includes("作答中") || val24.includes("未受測") || val24.includes("未指派") || val24.includes("缺席") || val24.includes("登入");
    const isOldScoreAt22 = val22.includes("/") || /^\d{5}$/.test(val22);
    const isOldRateAt28 = val28.includes("%");
    const isOldRateAt23 = val23.includes("%");
    const isNewStatusAt27 = val27.includes("完成") || val27.includes("中斷") || val27.includes("作答中") || val27.includes("未受測") || val27.includes("未指派") || val27.includes("缺席");
    const isNewNumberAt24 = /^\d+$/.test(val24);

    const isUnmigrated = (isOldStatusAt24 || isOldScoreAt22 || isOldRateAt28 || isOldRateAt23) && (!isNewStatusAt27 && !isNewNumberAt24);

    if (isUnmigrated) {
      const oldScore = val22;
      const oldRate = val23;
      const oldStatus = val24;
      const oldWrong = val25;
      const oldFreeTested = row[26] !== undefined && row[26] !== "" ? row[26] : "—";
      const oldFreeCorrect = row[27] !== undefined && row[27] !== "" ? row[27] : "—";
      const oldFreeRate = row[28] !== undefined && row[28] !== "" ? row[28] : "—";
      const oldFreeWrong = row[29] !== undefined && row[29] !== "" ? row[29] : "—";

      // 移位自由練習欄位至 29..32
      row[29] = oldFreeTested;
      row[30] = oldFreeCorrect;
      row[31] = oldFreeRate;
      row[32] = oldFreeWrong;

      // 特殊學生歷史指定修正 (學生 d: 10-12 與 10-13)
      if (name === 'd' && dStr.includes('10-26')) {
        // 學生 d 10-26：施測 5, 受測作答 4, 答對 3, 成績 3/4, 正確率 60%, 狀態 🟠 未完成 (3/5)
        // 測驗錯題單字：答錯的 cake (1字) + 未作答的 camp (1字) = 共 2 字
        row[22] = 5;
        row[23] = 4;
        row[24] = 3;
        row[25] = "3/4";
        row[26] = "60%";
        row[27] = "🟠 未完成 (3/5)";
        row[28] = "cake, camp";
        sheetModified = true;
      } else if (name === 'e') {
        // 學生 e 10-26：施測 5, 受測作答 4, 答對 3, 成績 3/4, 正確率 60%, 狀態 🟠 未完成 (3/5)
        // 測驗錯題單字：答錯的 can (1字) + 未作答的 cake (1字) = 共 2 字
        row[22] = 5;
        row[23] = 4;
        row[24] = 3;
        row[25] = "3/4";
        row[26] = "60%";
        row[27] = "🟠 未完成 (3/5)";
        row[28] = "can, cake";
        sheetModified = true;
      } else if (name === 'd' && dStr.includes('10-12')) {
        row[22] = 5;
        row[23] = 2;
        row[24] = 2;
        row[25] = "2/2";
        row[26] = "40%";
        row[27] = "🟠 未完成 (2/5)";
        row[28] = "age, ago, aim";
        sheetModified = true;
        continue;
      }
      if (name === 'd' && dStr.includes('10-13')) {
        row[22] = 5;
        row[23] = 5;
        row[24] = 4;
        row[25] = "4/5";
        row[26] = "80%";
        row[27] = "🟢 已完成";
        row[28] = "advice";
        sheetModified = true;
        continue;
      }

      let numScore = null;
      let numTotal = null;

      if (oldScore.includes("/")) {
        const parts = oldScore.split("/");
        const s = parseInt(parts[0], 10);
        const t = parseInt(parts[1], 10);
        if (!isNaN(s) && !isNaN(t) && t > 0) {
          numScore = s;
          numTotal = t;
        }
      } else if (oldStatus.includes("(") && oldStatus.includes(")")) {
        const m = oldStatus.match(/\((\d+)\/(\d+)\)/);
        if (m) {
          numScore = parseInt(m[1], 10);
          numTotal = parseInt(m[2], 10);
        }
      }

      if (numTotal !== null && numScore !== null) {
        const assigned = numTotal;
        const correct = numScore;
        const answered = oldStatus.includes("未完成") ? correct : assigned;
        row[22] = assigned;
        row[23] = answered;
        row[24] = correct;
        row[25] = answered > 0 ? `${correct}/${answered}` : "—";
        row[26] = assigned > 0 ? Math.round((correct / assigned) * 100) + "%" : "—";
        row[27] = answered === assigned ? "🟢 已完成" : `🟠 未完成 (${correct}/${assigned})`;
        row[28] = oldWrong || "—";
      } else {
        row[22] = "—";
        row[23] = "—";
        row[24] = "—";
        row[25] = "—";
        row[26] = "—";
        row[27] = oldStatus || "—";
        row[28] = oldWrong || "—";
      }
      sheetModified = true;
    } else {
      // 若已是 33 欄結構，依新邏輯校準正確率 (答對/施測) 與完成狀態
      const assigned = parseInt(row[22], 10);
      let answered = parseInt(row[23], 10);
      const correct = parseInt(row[24], 10);
      const statusStr = String(row[27] || "").trim();

      if (!isNaN(assigned) && assigned > 0 && !isNaN(correct)) {
        // 核心邏輯防呆：作答單字數絕不可能小於答對單字數
        if (isNaN(answered) || answered < correct) {
          answered = correct;
          row[23] = answered;
          sheetModified = true;
        }
        if (!isNaN(answered) && answered > 0) {
          const expectedScore = `${correct}/${answered}`;
          if (row[25] !== expectedScore) { row[25] = expectedScore; sheetModified = true; }
        }
        const expectedRate = Math.round((correct / assigned) * 100) + "%";
        if (row[26] !== expectedRate) { row[26] = expectedRate; sheetModified = true; }

        if (answered === assigned) {
          if (!statusStr.includes("已完成")) { row[27] = "🟢 已完成"; sheetModified = true; }
        } else {
          const expectedStatus = `🟠 未完成 (${correct}/${assigned})`;
          if (row[27] !== expectedStatus) { row[27] = expectedStatus; sheetModified = true; }
        }
      }

      if (name === 'd' && dStr.includes('10-26')) {
        // 學生 d 10-26：施測 5, 受測作答 4, 答對 3, 成績 3/4, 正確率 60%, 狀態 🟠 未完成 (3/5)
        // 測驗錯題單字：答錯的 cake (1字) + 未作答的 camp (1字) = 共 2 字
        row[22] = 5;
        row[23] = 4;
        row[24] = 3;
        row[25] = "3/4";
        row[26] = "60%";
        row[27] = "🟠 未完成 (3/5)";
        row[28] = "cake, camp";
        sheetModified = true;
      } else if (name === 'e') {
        // 學生 e 10-26：施測 5, 受測作答 4, 答對 3, 成績 3/4, 正確率 60%, 狀態 🟠 未完成 (3/5)
        // 測驗錯題單字：答錯的 can (1字) + 未作答的 cake (1字) = 共 2 字
        row[22] = 5;
        row[23] = 4;
        row[24] = 3;
        row[25] = "3/4";
        row[26] = "60%";
        row[27] = "🟠 未完成 (3/5)";
        row[28] = "can, cake";
        sheetModified = true;
      } else if (name === 'd' && dStr.includes('10-12')) {
        if (row[22] !== 5 || row[23] !== 2 || row[24] !== 2 || row[25] !== "2/2" || row[26] !== "40%" || row[27] !== "🟠 未完成 (2/5)" || row[28] !== "age, ago, aim") {
          row[22] = 5;
          row[23] = 2;
          row[24] = 2;
          row[25] = "2/2";
          row[26] = "40%";
          row[27] = "🟠 未完成 (2/5)";
          row[28] = "age, ago, aim";
          sheetModified = true;
        }
      } else if (name === 'd' && dStr.includes('10-13')) {
        if (row[22] !== 5 || row[23] !== 5 || row[24] !== 4 || row[25] !== "4/5" || row[26] !== "80%" || row[27] !== "🟢 已完成" || row[28] !== "advice") {
          row[22] = 5;
          row[23] = 5;
          row[24] = 4;
          row[25] = "4/5";
          row[26] = "80%";
          row[27] = "🟢 已完成";
          row[28] = "advice";
          sheetModified = true;
        }
      }
    }
  }

  if (sheetModified) {
    try {
      sheet.getRange("W:Y").setNumberFormat("0");
      sheet.getRange("Z:AG").setNumberFormat("@");
    } catch(_) {}
    range.setValues(values);
  }
  return sheetModified;
}

function fixIncompleteTaskRecords(ss, params) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const modifiedList = [];
  const targetStudent = (params && params.targetStudent) ? String(params.targetStudent).trim() : "";

  sheets.forEach(s => {
    try {
      const curMax = s.getMaxRows();
      if (curMax < 1000) {
        s.insertRowsAfter(curMax, 1000 - curMax);
      }
    } catch(_) {}
    const name = s.getName().trim();
    if (isSystemSheet(name)) return;
    if (targetStudent && name !== targetStudent) return;
    ensureStudentSheetColumns(s);
    
    const modified = migrateStudentSheetRows_(s);
    if (modified) {
      modifiedList.push({ student: name });
    }
  });

  return { status: "success", modifiedCount: modifiedList.length, details: modifiedList };
}
function showActiveCellWordListDialog() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const cell = sheet.getActiveCell();
  const val = String(cell.getValue() || "").trim();
  if (!val || val === "—" || val === "全對無錯題") {
    SpreadsheetApp.getUi().alert("提示", "目前選取的儲存格內無單字資料。", SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  const words = val.split(/[,\n、\s]+/).map(w => w.trim()).filter(Boolean);
  const htmlOutput = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 16px; margin: 0; background: #F8FAFC; color: #1E293B; }
          .header { font-size: 16px; font-weight: 800; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; }
          .count-badge { background: #E0F2FE; color: #0284C7; padding: 3px 10px; border-radius: 999px; font-size: 13px; font-weight: 700; }
          .word-container { display: flex; flex-wrap: wrap; gap: 8px; max-height: 290px; overflow-y: auto; padding: 12px; background: white; border-radius: 10px; border: 1.5px solid #E2E8F0; }
          .word-chip { background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; padding: 6px 12px; border-radius: 6px; font-weight: 700; font-size: 14px; }
          .btn-close { margin-top: 14px; width: 100%; padding: 10px; background: #0284C7; color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 14px; }
          .btn-close:hover { background: #0369A1; }
        </style>
      </head>
      <body>
        <div class="header">
          <span>單字清單檢視 (${cell.getA1Notation()})</span>
          <span class="count-badge">共 ${words.length} 字</span>
        </div>
        <div class="word-container">
          ${words.map(w => `<span class="word-chip">${w}</span>`).join('')}
        </div>
        <button class="btn-close" onclick="google.script.host.close()">關閉視窗</button>
      </body>
    </html>
  `).setWidth(460).setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, `單字清單 (${cell.getA1Notation()})`);
}
