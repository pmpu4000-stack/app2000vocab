const fs = require('fs');

// 1. Update Index.html
let html = fs.readFileSync('google_apps_script/Index.html', 'utf8');

// Title
html = html.replace(
  '<h2 style="color:#232A4D; margin:0 0 8px 0; font-size:24px; font-weight:800; text-align:center;">教師管理系統</h2>',
  '<h2 style="color:#232A4D; margin:0 0 8px 0; font-size:24px; font-weight:800; text-align:center;">學習歷程管理系統</h2>'
);

// #login-msg CSS in Index.html
const oldCss = `    #login-msg.login-status-banner {
      display: none !important;
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
      transition: opacity 0.2s ease, background 0.2s, border-color 0.2s;
    }
    #login-msg.login-status-banner.active {
      display: flex !important;
      visibility: visible !important;
      opacity: 1 !important;
      pointer-events: auto !important;
    }`;

const newCss = `    #login-msg.login-status-banner {
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

if (!html.includes(oldCss)) {
  console.error("oldCss not matched in Index.html");
  process.exit(1);
}
html = html.replace(oldCss, newCss);

// setBtnLoading & fetchData login text
const oldSetBtnLoading = `function setBtnLoading(btnId, isLoading, text) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = isLoading;
  btn.style.opacity = isLoading ? "0.75" : "1";
  btn.innerHTML = isLoading ? \`<div class="spinner"></div> 處理中...\` : text;
}`;

const newSetBtnLoading = `function setBtnLoading(btnId, isLoading, text) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = isLoading;
  btn.style.opacity = isLoading ? "0.85" : "1";
  if (btnId === "btnLogin" || btnId === "login-btn") {
    btn.innerHTML = "登入";
    return;
  }
  btn.innerHTML = isLoading ? \`<div class="spinner"></div> 處理中...\` : text;
}`;

if (!html.includes(oldSetBtnLoading)) {
  console.error("oldSetBtnLoading not matched");
  process.exit(1);
}
html = html.replace(oldSetBtnLoading, newSetBtnLoading);

html = html.replace('const btnText = isRefresh ? "🔄 同步最新" : "登入系統";', 'const btnText = isRefresh ? "🔄 同步最新" : "登入";');

fs.writeFileSync('google_apps_script/Index.html', html, 'utf8');
fs.copyFileSync('google_apps_script/Index.html', 'teacher_history.html');
console.log('Index.html and teacher_history.html updated.');

// 2. Update css/styles.css
let css = fs.readFileSync('css/styles.css', 'utf8');
const oldStylesCss = `#login-msg.login-status-banner {
  display: none !important;
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
  transition: opacity 0.2s ease, background 0.2s, border-color 0.2s;
}
#login-msg.login-status-banner.active {
  display: flex !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}`;

const newStylesCss = `#login-msg.login-status-banner {
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

if (!css.includes(oldStylesCss)) {
  console.error("oldStylesCss not matched in styles.css");
  process.exit(1);
}
css = css.replace(oldStylesCss, newStylesCss);
fs.writeFileSync('css/styles.css', css, 'utf8');
console.log('css/styles.css updated.');
