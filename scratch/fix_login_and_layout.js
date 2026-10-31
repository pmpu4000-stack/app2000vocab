const fs = require('fs');

// ══════════════════════════════════════════════════════════
// 1. 修復 google_apps_script/Index.html & teacher_history.html
// ══════════════════════════════════════════════════════════
let gasHtml = fs.readFileSync('google_apps_script/Index.html', 'utf8');

// (A) 修復 #login-overlay CSS
const oldGasOverlayCssRegex = /\/\* 行動裝置\/平板虛擬鍵盤防遮擋最佳化 \*\/[\s\S]*?#login-overlay > div \{\s*margin: 0 auto !important;\s*\}\s*\}/;

const newGasOverlayCss = `/* 登入遮罩與滑條消除、防鍵盤遮擋最佳化 */
    #login-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      height: 100dvh;
      min-height: 100dvh;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      box-sizing: border-box;
      padding: 24px 16px;
      z-index: 9999;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    #login-overlay::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }
    #login-overlay.hidden,
    #login-overlay[style*="display: none"],
    #login-overlay[style*="display:none"] {
      display: none !important;
    }
    #login-overlay > div {
      margin: auto 0;
      max-width: 94vw;
      box-sizing: border-box;
    }
    @media (max-height: 740px), (max-width: 600px) {
      #login-overlay {
        align-items: flex-start;
        padding-top: 24px;
        padding-bottom: 32px;
      }
      #login-overlay > div {
        margin: 0 auto;
      }
    }`;

gasHtml = gasHtml.replace(oldGasOverlayCssRegex, newGasOverlayCss);

// (B) 鎖定狀態方塊高度 44px，出現時下方方塊完全不往下移
const oldStatusCss = `    #login-msg.login-status-banner {
      display: flex !important;
      visibility: hidden !important;
      opacity: 0 !important;
      min-height: 44px;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      box-sizing: border-box;
      margin: 0 !important;
      padding: 11px 16px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 800;
      line-height: 1.45;
      text-align: center;
      border: 1.5px solid transparent;
      background: transparent;
      pointer-events: none !important;
      transition: opacity 0.2s ease, background 0.2s, border-color 0.2s;
    }
    #login-msg.login-status-banner.active {
      visibility: visible !important;
      opacity: 1 !important;
      pointer-events: auto !important;
    }`;

const newStatusCss = `    #login-msg.login-status-banner {
      display: flex !important;
      visibility: hidden !important;
      opacity: 0 !important;
      height: 44px !important;
      min-height: 44px !important;
      max-height: 44px !important;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      box-sizing: border-box !important;
      margin: 0 !important;
      padding: 0 16px !important;
      border-radius: 12px;
      font-size: 13.5px;
      font-weight: 700;
      line-height: 1.2;
      text-align: center;
      border: 1.5px solid transparent !important;
      background: transparent !important;
      box-shadow: none !important;
      pointer-events: none !important;
      transition: opacity 0.2s ease, background 0.2s, border-color 0.2s;
    }
    #login-msg.login-status-banner.active {
      visibility: visible !important;
      opacity: 1 !important;
      pointer-events: auto !important;
    }`;

gasHtml = gasHtml.replace(oldStatusCss, newStatusCss);

// (C) 確保 initTeacherDashboard 與學生登入時能徹底隱藏 overlay
gasHtml = gasHtml.replace(
  'if (overlay) overlay.style.display = "none";',
  'if (overlay) { overlay.style.setProperty("display", "none", "important"); overlay.classList.add("hidden"); }'
);
gasHtml = gasHtml.replace(
  'document.getElementById("login-overlay").style.display = "none";',
  'const _ov = document.getElementById("login-overlay"); if (_ov) { _ov.style.setProperty("display", "none", "important"); _ov.classList.add("hidden"); }'
);

fs.writeFileSync('google_apps_script/Index.html', gasHtml, 'utf8');
fs.copyFileSync('google_apps_script/Index.html', 'teacher_history.html');
console.log('google_apps_script/Index.html and teacher_history.html updated.');

// ══════════════════════════════════════════════════════════
// 2. 修復 css/styles.css
// ══════════════════════════════════════════════════════════
let stylesCss = fs.readFileSync('css/styles.css', 'utf8');

const oldStylesOverlayRegex = /#login-overlay\s*\{\s*position:\s*fixed\s*!important;[\s\S]*?#login-overlay > div\s*\{\s*margin:\s*0\s*auto\s*!important;\s*\}\s*\}/;

const newStylesOverlay = `#login-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  height: 100dvh;
  min-height: 100dvh;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  box-sizing: border-box;
  padding: 24px 16px;
  z-index: 9999;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
#login-overlay::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
#login-overlay.hidden,
#login-overlay[style*="display: none"],
#login-overlay[style*="display:none"] {
  display: none !important;
}
#login-overlay > div {
  margin: auto 0;
  max-width: 94vw;
  box-sizing: border-box;
}
@media (max-height: 740px), (max-width: 600px) {
  #login-overlay {
    align-items: flex-start;
    padding-top: 24px;
    padding-bottom: 32px;
  }
  #login-overlay > div {
    margin: 0 auto;
  }
}`;

stylesCss = stylesCss.replace(oldStylesOverlayRegex, newStylesOverlay);

const oldStylesStatus = `#login-msg.login-status-banner {
  display: flex !important;
  visibility: hidden !important;
  opacity: 0 !important;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 !important;
  padding: 11px 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.45;
  text-align: center;
  border: 1.5px solid transparent;
  background: transparent;
  pointer-events: none !important;
  transition: opacity 0.2s ease, background 0.2s, border-color 0.2s;
}
#login-msg.login-status-banner.active {
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}`;

const newStylesStatus = `#login-msg.login-status-banner {
  display: flex !important;
  visibility: hidden !important;
  opacity: 0 !important;
  height: 44px !important;
  min-height: 44px !important;
  max-height: 44px !important;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box !important;
  margin: 0 !important;
  padding: 0 16px !important;
  border-radius: 12px;
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  border: 1.5px solid transparent !important;
  background: transparent !important;
  box-shadow: none !important;
  pointer-events: none !important;
  transition: opacity 0.2s ease, background 0.2s, border-color 0.2s;
}
#login-msg.login-status-banner.active {
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}`;

stylesCss = stylesCss.replace(oldStylesStatus, newStylesStatus);

fs.writeFileSync('css/styles.css', stylesCss, 'utf8');
console.log('css/styles.css updated.');

// ══════════════════════════════════════════════════════════
// 3. 修復 index.html (遊戲登入)
// ══════════════════════════════════════════════════════════
let gameHtml = fs.readFileSync('index.html', 'utf8');

gameHtml = gameHtml.replace(
  "document.getElementById('login-overlay').style.display = 'none';",
  "const _ov = document.getElementById('login-overlay'); if (_ov) { _ov.style.setProperty('display', 'none', 'important'); _ov.classList.add('hidden'); }"
);

fs.writeFileSync('index.html', gameHtml, 'utf8');
console.log('index.html updated.');
