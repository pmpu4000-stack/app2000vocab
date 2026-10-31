const fs = require('fs');

// 1. Update google_apps_script/Code.gs
let codeGs = fs.readFileSync('google_apps_script/Code.gs', 'utf8');
codeGs = codeGs.replace('.setTitle("學生學習歷程查詢系統")', '.setTitle("學習歷程管理系統")');
fs.writeFileSync('google_apps_script/Code.gs', codeGs, 'utf8');
console.log('Code.gs updated.');

// 2. Update google_apps_script/Index.html
let indexGas = fs.readFileSync('google_apps_script/Index.html', 'utf8');

// Title tags and h2
indexGas = indexGas.replace('<title>學生學習歷程查詢系統</title>', '<title>學習歷程管理系統</title>');
indexGas = indexGas.replace('<h2>📊 學生學習歷程查詢系統</h2>', '<h2>📊 學習歷程管理系統</h2>');

// Prevent layout shift and hide scrollbars
const scrollbarCss = `
    /* 防止展開時右側出現滑條導致畫面往左閃動 (No scrollbar jump / Zero Layout Shift) */
    html {
      scrollbar-gutter: stable;
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }
    body {
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }
    html::-webkit-scrollbar,
    body::-webkit-scrollbar,
    *::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }
`;

indexGas = indexGas.replace('body {', scrollbarCss + '\n    body {');

fs.writeFileSync('google_apps_script/Index.html', indexGas, 'utf8');
fs.copyFileSync('google_apps_script/Index.html', 'teacher_history.html');
console.log('Index.html & teacher_history.html updated.');

// 3. Update css/styles.css for game webpage too
let stylesCss = fs.readFileSync('css/styles.css', 'utf8');
if (!stylesCss.includes('scrollbar-gutter: stable;')) {
  stylesCss = scrollbarCss + '\n' + stylesCss;
  fs.writeFileSync('css/styles.css', stylesCss, 'utf8');
  console.log('css/styles.css updated.');
}
