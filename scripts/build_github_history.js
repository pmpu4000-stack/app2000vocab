// scripts/build_github_history.js
// 將 google_apps_script/Index.html 及其所有子模組編譯為完全獨立、可於 GitHub Pages 直營運行的 history.html

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const gasDir = path.join(rootDir, 'google_apps_script');
const indexPath = path.join(gasDir, 'Index.html');
const outputPath = path.join(rootDir, 'history.html');

function build() {
  let content = fs.readFileSync(indexPath, 'utf-8');

  // 正則比對 <?!= include('FileName'); ?> 與 <?!= include("FileName"); ?>
  const includeRegex = /<\?!\s*=\s*include\s*\(\s*['"]([^'"]+)['"]\s*\)\s*;\s*\?>/g;

  content = content.replace(includeRegex, (match, fileName) => {
    const subFilePath = path.join(gasDir, `${fileName}.html`);
    if (fs.existsSync(subFilePath)) {
      let subContent = fs.readFileSync(subFilePath, 'utf-8');
      return subContent;
    } else {
      console.warn(`[WARN] Included file not found: ${subFilePath}`);
      return match;
    }
  });

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(`[SUCCESS] Generated standalone history.html for GitHub Pages: ${outputPath}`);
}

build();
