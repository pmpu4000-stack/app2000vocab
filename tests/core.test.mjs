import test from "node:test";
import assert from "node:assert/strict";

// Mock browser globals for pure logic testing
const storageMap = new Map();
globalThis.localStorage = {
  getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  key: (i) => Array.from(storageMap.keys())[i] || null,
  get length() { return storageMap.size; },
  clear: () => storageMap.clear()
};
globalThis.sessionStorage = globalThis.localStorage;

const { LEVELS, getWordLevel, parseCased, misspellings } = await import("../src/levels.js");
const store = await import("../src/store.js");
const { calculateSrsWeight, nextWord } = await import("../src/srs.js");

test("levels.js: 5 levels and getWordLevel mapping", () => {
  assert.equal(LEVELS.length, 5);
  assert.equal(getWordLevel("w0"), 1);
  assert.equal(getWordLevel("w1"), 4);
  const parsed = parseCased("neCeSSary");
  assert.equal(parsed.word, "necessary");
  assert.equal(parsed.mask.filter(Boolean).length, 3);
  const distractors = misspellings("necessary", 3);
  assert.equal(distractors.length, 3);
  assert.ok(!distractors.includes("necessary"));
});

test("store.js: date normalization and grading lifecycle", () => {
  assert.equal(store.normalizeDateStr("2026/5/9"), "2026-05-09");
  assert.equal(store.unpadDateStr("2026-05-09"), "2026-5-9");

  store.reset();
  assert.equal(store.box("w0"), 0);

  // Grade wrong on new word -> stays Box 0, everWrong = true
  const r1 = store.grade("w0", false, 1, "listen", "able", true);
  assert.equal(r1.box, 0);
  assert.equal(store.everWrong("w0"), true);

  // Grade correct -> promotes to Box 1 -> Box 2 -> Box 3 (mastered)
  const r2 = store.grade("w0", true, 1, "listen", "able", true);
  assert.equal(r2.box, 1);
  const r3 = store.grade("w0", true, 1, "listen", "able", true);
  assert.equal(r3.box, 2);
  const r4 = store.grade("w0", true, 1, "listen", "able", true);
  assert.equal(r4.box, 3);
  assert.equal(r4.newlyMastered, true);

  const pre = store.getPrecomputedSummary([]);
  assert.equal(pre.mastered, 1);
  assert.equal(pre.distinctCorrect, 1);
  store.flushSave();
});

test("srs.js: single-pass weighted nextWord selection", () => {
  const samplePool = [
    { id: "w0", word: "able", level: 1 },
    { id: "w1", word: "about", level: 1 }
  ];
  samplePool._byLevel = { 1: samplePool };
  const wt0 = calculateSrsWeight("w0");
  const wt1 = calculateSrsWeight("w1");
  assert.ok(wt0 > 0 && wt1 > 0);
  const picked = nextWord(samplePool, 1, "w0");
  assert.equal(picked.id, "w1");
});

test("remedy_service.js: weekday unfinished mistakes & free practice learned removal", async () => {
  const remedy = await import("../src/remedy_service.js");
  const monStr = store.getWeekRangeDates().monday;
  localStorage.setItem("weekTaskMistakes", JSON.stringify({ [monStr]: ["apple"] }));
  const mistakes1 = remedy.getMonToFriUnfinishedWords();
  assert.ok(mistakes1.includes("apple"));

  remedy.markWordLearnedInFreePractice("apple");
  const mistakes2 = remedy.getMonToFriUnfinishedWords();
  assert.ok(!mistakes2.includes("apple"));
});

test("ui_summary.js & diagnostics.js: history resolution & error taxonomy", async () => {
  const { diagnoseWordMistake } = await import("../src/diagnostics.js");
  assert.equal(diagnoseWordMistake("address", "adress").code, "double_consonant");
  assert.equal(diagnoseWordMistake("knife", "nife").code, "silent_letter");
  assert.equal(diagnoseWordMistake("station", "stasion").code, "suffix_confusion");

  const uiSummary = await import("../src/ui_summary.js");
  assert.equal(uiSummary.formatRatePercentage(null, "4/5"), "80%");
  assert.equal(uiSummary.isValidEnglishWordStr("apple"), true);
  assert.equal(uiSummary.isValidEnglishWordStr("w12"), false);
});

test("Google Apps Script (Code.gs & AuthService.js): cloud sync sanitization & auth hash", async () => {
  const fs = await import("node:fs");
  const vm = await import("node:vm");
  const crypto = await import("node:crypto");

  const cacheStore = new Map();
  const sandbox = {
    console,
    Date, Math, JSON, Object, Array, Set, Map, String, Number, Boolean, RegExp, parseInt, parseFloat, isNaN,
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (_alg, str) => Array.from(crypto.createHash("sha256").update(str, "utf8").digest()),
      formatDate: (d, _tz, fmt) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        if (fmt === "yyyy-MM-dd") return `${y}-${m}-${day}`;
        return `${y}-${m}-${day} 08:00:00`;
      }
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => cacheStore.get(k) || null,
        put: (k, v) => cacheStore.set(k, String(v)),
        remove: (k) => cacheStore.delete(k)
      })
    },
    logError: () => {}
  };

  vm.createContext(sandbox);
  const codeGs = fs.readFileSync("google_apps_script/Code.gs", "utf8");
  const authGs = fs.readFileSync("google_apps_script/AuthService.js", "utf8");
  vm.runInContext(codeGs.slice(0, codeGs.indexOf("function doPost")), sandbox);
  vm.runInContext(authGs, sandbox);

  const hashed = sandbox.hashPassword("123456");
  assert.equal(sandbox.isHashedPassword(hashed), true);
  assert.equal(sandbox.formatStandardDateYMD("2026/5/8"), "2026-05-08");

  const tok = sandbox.registerStudentDevice("90101");
  assert.ok(tok.startsWith("ST_"));
  assert.equal(sandbox.isStudentTokenValid("90101", tok), true);
  assert.equal(sandbox.isStudentTokenValid("90102", tok), false);
  const wafHit = sandbox.inspectRequestForAttacks({}, { note: "<svg onload=alert(1)>" }, {});
  assert.ok(wafHit && wafHit.method.includes("XSS"));
  assert.equal(sandbox.constantTimeEqual("abc123", "abc123"), true);
  assert.equal(sandbox.constantTimeEqual("abc123", "abc124"), false);
  assert.equal(sandbox.isTeacherAllowedForClass({ success: true, role: "teacher", isAdmin: false, classList: ["901", "902"] }, "902班"), true);
  assert.equal(sandbox.isTeacherAllowedForClass({ success: true, role: "teacher", isAdmin: false, classList: ["901", "902"] }, "903班"), false);

  const summary = vm.runInContext(
    "calculateSummaryFromAgentData({ stat: { w0: { a: 3, c: 3 }, w1: { a: 2, c: 1 } }, box: { w0: 3, w1: 1 } }, null)",
    sandbox
  );
  assert.equal(summary.mastered, 1);
  assert.equal(summary.learning, 1);
  assert.equal(summary.testedVocab, 2);
  assert.equal(summary.distinctCorrect, 2);
  assert.equal(summary.passRate, "100%");

  const cleanedAgentStr = vm.runInContext(`
    const dirtyRecords = {
      "spellAgent.v2": JSON.stringify({
        dailyPractice: {
          "2026-05-01": { words: { apple: { word: "apple" } } },
          "2026-05-02": { words: { book: { word: "book", a: 1, lastResult: "correct" } } }
        }
      }),
      "task_words_2026-05-01": JSON.stringify(new Array(40).fill("apple"))
    };
    sanitizeStudentRecordsObj_(dirtyRecords, [{ date: "2026-05-02", taskName: "平日測驗", freeTested: 1 }]);
    JSON.stringify(dirtyRecords);
  `, sandbox);
  const resRecords = JSON.parse(cleanedAgentStr);
  const cleanedAgent = JSON.parse(resRecords["spellAgent.v2"]);
  assert.equal(cleanedAgent.dailyPractice["2026-05-01"], undefined);
  assert.ok(cleanedAgent.dailyPractice["2026-05-02"]);
  assert.equal(resRecords["task_words_2026-05-01"], undefined);
});

test("auth_sync.js & wordbank.js: SHA-256 zero-plaintext credential guard & XSS escapeHtml", async () => {
  localStorage.setItem("current_pass", "plaintext_secret");
  const { sha256HexClient, sanitizeCredentialStorage } = await import("../src/auth_sync.js");
  sanitizeCredentialStorage();
  assert.equal(localStorage.getItem("current_pass"), null);

  const h1 = await sha256HexClient("123456");
  assert.equal(h1.length, 64);
  const h2 = await sha256HexClient(h1);
  assert.equal(h2, h1);

  const { escapeHtml } = await import("../src/wordbank.js");
  assert.equal(escapeHtml('<script>alert("xss")</script>'), "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");

  const fs = await import("node:fs");
  const vm = await import("node:vm");
  const crypto = await import("node:crypto");
  const authServiceCode = fs.readFileSync("google_apps_script/AuthService.js", "utf-8");
  const authSandbox = {
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      computeDigest: (_alg, str) => Array.from(crypto.createHash("sha256").update(str, "utf8").digest())
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    Logger: { log: () => {} },
    Date, Math, Object, Array, String, Number, RegExp, parseInt
  };
  vm.createContext(authSandbox);
  vm.runInContext(authServiceCode, authSandbox);

  assert.equal(vm.runInContext('constantTimeEqual("abc123", "abc123")', authSandbox), true);
  assert.equal(vm.runInContext('constantTimeEqual("abc123", "abc124")', authSandbox), false);
  assert.equal(vm.runInContext('isStudentTokenValid("80101", "ST_OK")', authSandbox), false);
  const validTok = vm.runInContext('registerStudentDevice("80101")', authSandbox);
  assert.equal(vm.runInContext(`isStudentTokenValid("80101", "${validTok}")`, authSandbox), true);
  assert.equal(vm.runInContext(`isStudentTokenValid("80102", "${validTok}")`, authSandbox), false);
  assert.ok(vm.runInContext('inspectRequestForAttacks(null, { a: "\' =IMPORTXML(1,2)" }, {})', authSandbox));
  assert.equal(vm.runInContext('isTeacherAllowedForStudent_(null, { success: true, role: "teacher", isAdmin: false, classList: ["801"] }, "80105")', authSandbox), true);
  assert.equal(vm.runInContext('isTeacherAllowedForStudent_(null, { success: true, role: "teacher", isAdmin: false, classList: ["801"] }, "80205")', authSandbox), false);
  assert.equal(vm.runInContext('isTeacherAllowedForStudent_(null, { success: true, role: "teacher", isAdmin: false, classList: ["801"] }, "ALL")', authSandbox), false);
});
