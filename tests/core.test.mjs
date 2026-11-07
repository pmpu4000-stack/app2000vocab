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
