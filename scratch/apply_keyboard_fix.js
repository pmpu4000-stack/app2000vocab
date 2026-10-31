const fs = require('fs');

// ══════════════════════════════════════════════════════════
// 1. Update google_apps_script/Index.html & teacher_history.html
// ══════════════════════════════════════════════════════════
let gasHtml = fs.readFileSync('google_apps_script/Index.html', 'utf8');

// Remove curfew-note-box from #login-overlay
const curfewBoxInGas = `        <div class="curfew-note-box">
          <span class="note-icon">⏰</span>
          <div class="note-body">
            <div>每日開放作答時間：07:30 至 22:00</div>
            <div>請於時段內進行十分鐘指定單字測驗</div>
            <div>並歡迎多加進行自由練習</div>
          </div>
        </div>`;

if (gasHtml.includes(curfewBoxInGas)) {
  gasHtml = gasHtml.replace(curfewBoxInGas + '\n\n', '');
  console.log('curfewBox removed from Index.html');
} else {
  // Regex fallback
  gasHtml = gasHtml.replace(/\s*<div class="curfew-note-box">\s*<span class="note-icon">⏰<\/span>[\s\S]*?<\/div>\s*<\/div>/, '');
  console.log('curfewBox removed via regex from Index.html');
}

// Add CSS for mobile keyboard friendly layout in Index.html
const gasKeyboardCss = `
    /* 行動裝置/平板虛擬鍵盤防遮擋最佳化 */
    #login-overlay {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      height: 100dvh !important;
      min-height: 100dvh !important;
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      overflow-y: auto !important;
      -webkit-overflow-scrolling: touch !important;
      box-sizing: border-box !important;
      padding: 24px 16px !important;
      z-index: 9999 !important;
    }
    #login-overlay > div {
      margin: auto 0 !important;
      max-width: 94vw !important;
      box-sizing: border-box !important;
    }
    @media (max-height: 740px), (max-width: 600px) {
      #login-overlay {
        align-items: flex-start !important;
        padding-top: 24px !important;
        padding-bottom: 260px !important;
      }
      #login-overlay > div {
        margin: 0 auto !important;
      }
    }
`;

gasHtml = gasHtml.replace('#login-overlay h2 {', gasKeyboardCss + '\n    #login-overlay h2 {');

// Add JS for mobile keyboard focus scrolling in Index.html
const keyboardJsSnippet = `
// 行動裝置輸入時自動滾動至可視區域中央，避免被虛擬鍵盤遮擋
(function bindMobileKeyboardHandler() {
  function scrollIntoSafeView(el) {
    if (!el) return;
    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }, 120);
    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }, 350);
  }

  ['login-user', 'login-pass'].forEach(id => {
    const inp = document.getElementById(id);
    if (inp) {
      inp.addEventListener('focus', function() {
        scrollIntoSafeView(this);
      });
    }
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.id === 'login-user' || activeEl.id === 'login-pass')) {
        setTimeout(() => {
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }, 100);
      }
    });
  }
})();
`;

gasHtml = gasHtml.replace('function login() {', keyboardJsSnippet + '\nfunction login() {');

fs.writeFileSync('google_apps_script/Index.html', gasHtml, 'utf8');
fs.copyFileSync('google_apps_script/Index.html', 'teacher_history.html');
console.log('google_apps_script/Index.html and teacher_history.html updated.');

// ══════════════════════════════════════════════════════════
// 2. Update index.html (Game login)
// ══════════════════════════════════════════════════════════
let gameHtml = fs.readFileSync('index.html', 'utf8');

// Remove curfew-note-box from #login-overlay in index.html
gameHtml = gameHtml.replace(
  /\s*<div class="curfew-note-box">\s*<span class="note-icon">.*?<\/span>\s*<div class="note-body">\s*<div>每日開放作答時間[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
  ''
);

// Add JS for mobile keyboard focus scrolling in index.html
gameHtml = gameHtml.replace(
  "loginBtn.addEventListener('click', async () => {",
  keyboardJsSnippet + "\n    loginBtn.addEventListener('click', async () => {"
);

fs.writeFileSync('index.html', gameHtml, 'utf8');
console.log('index.html updated.');

// ══════════════════════════════════════════════════════════
// 3. Update css/styles.css
// ══════════════════════════════════════════════════════════
let stylesCss = fs.readFileSync('css/styles.css', 'utf8');

const stylesKeyboardCss = `
#login-overlay {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  height: 100dvh !important;
  min-height: 100dvh !important;
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch !important;
  box-sizing: border-box !important;
  padding: 24px 16px !important;
}

#login-overlay > div {
  margin: auto 0 !important;
  max-width: 94vw !important;
  box-sizing: border-box !important;
}

@media (max-height: 740px), (max-width: 600px) {
  #login-overlay {
    align-items: flex-start !important;
    padding-top: 24px !important;
    padding-bottom: 260px !important;
  }
  #login-overlay > div {
    margin: 0 auto !important;
  }
}
`;

stylesCss = stylesCss.replace(
  '/* 登入狀態提示條（高清晰、顯眼高質感） */',
  stylesKeyboardCss + '\n/* 登入狀態提示條（高清晰、顯眼高質感） */'
);

fs.writeFileSync('css/styles.css', stylesCss, 'utf8');
console.log('css/styles.css updated.');
