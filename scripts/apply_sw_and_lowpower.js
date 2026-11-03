const fs = require("fs");
const path = require("path");

const repoDir = path.join(__dirname, "..");

// 1. 更新 sw.js：加入 Chart.js、字型及關鍵資源快取，升級 Cache-First 快取版本
const swPath = path.join(repoDir, "sw.js");
let swCode = fs.readFileSync(swPath, "utf8");

const oldSwAssets = `const CACHE_NAME = 'spelling-app-shell-v2';
const STATIC_ASSETS = [
  './',
  'index.html',
  'history.html',
  'css/styles.css',
  'src/app.js',
  'src/ui.js',
  'src/ui_export.js',
  'src/ui_weak_words.js',
  'src/store.js',
  'src/audio.js',
  'src/wordbank.js',
  'src/levels.js',
  'src/data.js',
  'src/diagnostics.js',
  'src/srs.js',
  'src/confetti.js',
  'src/anticheat.js',
  'data/words2000.json',
  'data/wordbank2000.json'
];`;

const newSwAssets = `const CACHE_NAME = 'spelling-app-shell-v3';
const STATIC_ASSETS = [
  './',
  'index.html',
  'history.html',
  'css/styles.css',
  'src/app.js',
  'src/ui.js',
  'src/ui_export.js',
  'src/ui_weak_words.js',
  'src/store.js',
  'src/audio.js',
  'src/wordbank.js',
  'src/levels.js',
  'src/data.js',
  'src/diagnostics.js',
  'src/srs.js',
  'src/confetti.js',
  'src/anticheat.js',
  'data/words2000.json',
  'data/wordbank2000.json',
  'https://cdn.jsdelivr.net/npm/chart.js'
];`;

if (swCode.includes(oldSwAssets)) {
  swCode = swCode.replace(oldSwAssets, newSwAssets);
  fs.writeFileSync(swPath, swCode, "utf8");
  console.log("sw.js pre-cache updated.");
}

// 2. 更新 css/styles.css：加入低階手機與省電模式自動降級機制 (prefers-reduced-motion 與 low-power 類別)
const cssPath = path.join(repoDir, "css/styles.css");
let cssCode = fs.readFileSync(cssPath, "utf8");

const lowPowerCss = `
/* 🚀 低階手機與節能自適應降級模式 (Adaptive Low-Power Mode) */
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

body.low-end-device *,
body.low-power-mode * {
  animation: none !important;
  transition: none !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  text-shadow: none !important;
}

body.low-end-device .btn,
body.low-power-mode .btn {
  transform: none !important;
}
`;

if (!cssCode.includes("Adaptive Low-Power Mode")) {
  cssCode += lowPowerCss;
  fs.writeFileSync(cssPath, cssCode, "utf8");
  console.log("css/styles.css low-power rules added.");
}

// 3. 更新 index.html：在頁面初始化時自動偵測硬體效能 (CPU 核心數 / 記憶體 / 節電模式)
const indexPath = path.join(repoDir, "index.html");
let indexCode = fs.readFileSync(indexPath, "utf8");

const perfDetectSnippet = `
    // 🚀 自適應低階設備與節電模式偵測 (Adaptive Low-Power Mode)
    (function detectLowEndDevice() {
      try {
        const isLowMemory = navigator.deviceMemory && navigator.deviceMemory <= 2;
        const isLowCores = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
        const isReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (isLowMemory || isLowCores || isReducedMotion) {
          document.body.classList.add("low-end-device");
          console.log("⚡ 偵測到平價或低階設備，已自動啟用極速省電降級模式（關閉陰影、模糊與高耗能轉場）");
        }
      } catch(_) {}
    })();
`;

if (!indexCode.includes("detectLowEndDevice")) {
  indexCode = indexCode.replace("<body>", "<body>" + perfDetectSnippet);
  fs.writeFileSync(indexPath, indexCode, "utf8");
  console.log("index.html low-end detection added.");
}

console.log("Asset pre-cache and low-power script completed.");
