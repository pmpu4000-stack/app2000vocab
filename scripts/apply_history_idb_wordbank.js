const fs = require("fs");
const path = require("path");

const repoDir = path.join(__dirname, "..");
const teacherJsPath = path.join(repoDir, "google_apps_script/TeacherJs.html");
let code = fs.readFileSync(teacherJsPath, "utf8");

const isCRLF = code.includes("\r\n");
code = code.replace(/\r\n/g, "\n");

const targetBlock = `let WORD_BANK_2000 = [];
const WORDBANK_STORAGE_KEY = "app2000_wordbank_v1";
const WORDBANK_REMOTE_URL = "https://pmpu4000-stack.github.io/app2000vocab/data/wordbank2000.json";
let _wordBankLoadingPromise = null;

function initWordBankMaps() {
  if (!Array.isArray(WORD_BANK_2000) || WORD_BANK_2000.length === 0) return;
  if (!window._wordBankZhMap) window._wordBankZhMap = new Map();
  if (!window._wordBankLevelMap) window._wordBankLevelMap = new Map();
  for (let i = 0; i < WORD_BANK_2000.length; i++) {
    const item = WORD_BANK_2000[i];
    if (item && item[0]) {
      const w = String(item[0]).toLowerCase();
      if (!window._wordBankZhMap.has(w)) window._wordBankZhMap.set(w, item[1] || "");
      if (!window._wordBankLevelMap.has(w)) window._wordBankLevelMap.set(w, item[2] || 1);
    }
  }
}

function ensureWordBankLoaded(onReady) {
  if (Array.isArray(WORD_BANK_2000) && WORD_BANK_2000.length > 0) {
    initWordBankMaps();
    if (typeof onReady === "function") onReady(WORD_BANK_2000);
    return Promise.resolve(WORD_BANK_2000);
  }

  if (_wordBankLoadingPromise) {
    if (typeof onReady === "function") _wordBankLoadingPromise.then(onReady);
    return _wordBankLoadingPromise;
  }

  _wordBankLoadingPromise = (async () => {
    // 1. 本地快取秒開
    try {
      const cached = localStorage.getItem(WORDBANK_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          WORD_BANK_2000 = parsed;
          initWordBankMaps();
          if (typeof onReady === "function") onReady(WORD_BANK_2000);
          return WORD_BANK_2000;
        }
      }
    } catch (_) {}

    // 2. 雲端 CDN 靜態載入 (僅 ~50KB)
    try {
      const res = await fetch(WORDBANK_REMOTE_URL, { cache: "force-cache" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          WORD_BANK_2000 = data;
          initWordBankMaps();
          try { localStorage.setItem(WORDBANK_STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
          if (typeof onReady === "function") onReady(WORD_BANK_2000);
          return WORD_BANK_2000;
        }
      }
    } catch (err) {
      console.warn("載入外部單字庫失敗:", err);
    }
    if (typeof onReady === "function") onReady(WORD_BANK_2000 || []);
    return WORD_BANK_2000 || [];
  })();

  return _wordBankLoadingPromise;
}`;

const replacementBlock = `let WORD_BANK_2000 = [];
const WORDBANK_STORAGE_KEY = "app2000_wordbank_v1";
const WORDBANK_REMOTE_URL = "https://pmpu4000-stack.github.io/app2000vocab/data/wordbank2000.json";
let _wordBankLoadingPromise = null;

// 🚀 IndexedDB 高效能單字庫快取：原生二進位/物件儲存，免除反覆 JSON.parse 解析 CPU 耗損
const _WB_IDB_NAME = "App2000VocabDB";
const _WB_STORE_NAME = "wordbank_store";

function _openWordBankIDB() {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) return resolve(null);
    try {
      const req = indexedDB.open(_WB_IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(_WB_STORE_NAME)) {
          db.createObjectStore(_WB_STORE_NAME);
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}

async function _getWordBankFromIDB() {
  const db = await _openWordBankIDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(_WB_STORE_NAME, "readonly");
      const store = tx.objectStore(_WB_STORE_NAME);
      const req = store.get(WORDBANK_STORAGE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}

async function _saveWordBankToIDB(data) {
  const db = await _openWordBankIDB();
  if (!db) return;
  try {
    const tx = db.transaction(_WB_STORE_NAME, "readwrite");
    const store = tx.objectStore(_WB_STORE_NAME);
    store.put(data, WORDBANK_STORAGE_KEY);
  } catch (_) {}
}

function initWordBankMaps() {
  if (!Array.isArray(WORD_BANK_2000) || WORD_BANK_2000.length === 0) return;
  if (!window._wordBankZhMap) window._wordBankZhMap = new Map();
  if (!window._wordBankLevelMap) window._wordBankLevelMap = new Map();
  for (let i = 0; i < WORD_BANK_2000.length; i++) {
    const item = WORD_BANK_2000[i];
    if (item && item[0]) {
      const w = String(item[0]).toLowerCase();
      if (!window._wordBankZhMap.has(w)) window._wordBankZhMap.set(w, item[1] || "");
      if (!window._wordBankLevelMap.has(w)) window._wordBankLevelMap.set(w, item[2] || 1);
    }
  }
}

function ensureWordBankLoaded(onReady) {
  if (Array.isArray(WORD_BANK_2000) && WORD_BANK_2000.length > 0) {
    initWordBankMaps();
    if (typeof onReady === "function") onReady(WORD_BANK_2000);
    return Promise.resolve(WORD_BANK_2000);
  }

  if (_wordBankLoadingPromise) {
    if (typeof onReady === "function") _wordBankLoadingPromise.then(onReady);
    return _wordBankLoadingPromise;
  }

  _wordBankLoadingPromise = (async () => {
    // 1. 優先從 IndexedDB 秒速提取 (0 CPU 耗損，1ms 啟動)
    try {
      const idbData = await _getWordBankFromIDB();
      if (Array.isArray(idbData) && idbData.length > 0) {
        WORD_BANK_2000 = idbData;
        initWordBankMaps();
        if (typeof onReady === "function") onReady(WORD_BANK_2000);
        return WORD_BANK_2000;
      }
    } catch (_) {}

    // 2. 本地 LocalStorage 快取備援
    try {
      const cached = localStorage.getItem(WORDBANK_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          WORD_BANK_2000 = parsed;
          initWordBankMaps();
          _saveWordBankToIDB(parsed);
          if (typeof onReady === "function") onReady(WORD_BANK_2000);
          return WORD_BANK_2000;
        }
      }
    } catch (_) {}

    // 3. 雲端 CDN 靜態載入 (僅 ~50KB)
    try {
      const res = await fetch(WORDBANK_REMOTE_URL, { cache: "force-cache" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          WORD_BANK_2000 = data;
          initWordBankMaps();
          _saveWordBankToIDB(data);
          try { localStorage.setItem(WORDBANK_STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
          if (typeof onReady === "function") onReady(WORD_BANK_2000);
          return WORD_BANK_2000;
        }
      }
    } catch (err) {
      console.warn("載入外部單字庫失敗:", err);
    }
    if (typeof onReady === "function") onReady(WORD_BANK_2000 || []);
    return WORD_BANK_2000 || [];
  })();

  return _wordBankLoadingPromise;
}`;

if (code.includes(targetBlock)) {
  code = code.replace(targetBlock, replacementBlock);
  if (isCRLF) code = code.replace(/\n/g, "\r\n");
  fs.writeFileSync(teacherJsPath, code, "utf8");
  console.log("TeacherJs.html wordbank IndexedDB upgrade completed.");
} else {
  console.log("Target block not found in TeacherJs.html.");
}
