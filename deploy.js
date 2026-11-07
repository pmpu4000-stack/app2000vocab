import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = __dirname;
const commitMsg = process.argv[2] || "deploy: auto update";

console.log("== [0/4] Running automated unit tests ==");
execSync('node --test tests/core.test.mjs', { cwd: root, stdio: 'inherit' });

console.log("== [1/4] Syncing TeacherJs.html from src/teacher_portal.js ==");
const tpSrc = fs.readFileSync(path.join(root, 'src', 'teacher_portal.js'), 'utf8');
fs.writeFileSync(path.join(root, 'google_apps_script', 'TeacherJs.html'), '<script>\n' + tpSrc + '\n</script>', 'utf8');

console.log("== [2/4] Syncing index.html to GAS, mirrors, and bumping SW/CSS cache ==");
const nowTag = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const bumpVer = (fPath, regex) => {
  if (!fs.existsSync(fPath)) return;
  const raw = fs.readFileSync(fPath, 'utf8');
  const next = raw.replace(regex, `$1?v=${nowTag}`);
  if (next !== raw) fs.writeFileSync(fPath, next, 'utf8');
};
bumpVer(path.join(root, 'index.html'), /(css\/styles\.css|sw\.js|src\/teacher_portal\.js|src\/time_limits\.js)\?v=[0-9A-Za-z_]+/g);

const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
fs.writeFileSync(path.join(root, 'google_apps_script', 'Index.html'), idx, 'utf8');
fs.writeFileSync(path.join(root, 'teacher_history.html'), idx, 'utf8');
fs.writeFileSync(path.join(root, 'google_apps_script', 'teacher_history.html'), idx, 'utf8');

const mirrorPairs = [
  ['google_apps_script/StylePrint.html', 'teacher_style_print.html'],
  ['google_apps_script/ExportExcelJs.html', 'teacher_export_excel.html'],
  ['google_apps_script/ExportPdfJs.html', 'teacher_export_pdf.html']
];
for (const [srcRel, dstRel] of mirrorPairs) {
  const srcPath = path.join(root, srcRel);
  const dstPath = path.join(root, dstRel);
  if (fs.existsSync(srcPath)) fs.copyFileSync(srcPath, dstPath);
}

const swPath = path.join(root, 'sw.js');
if (fs.existsSync(swPath)) {
  const swContent = fs.readFileSync(swPath, 'utf8');
  const updatedSw = swContent.replace(/const CACHE_NAME = 'spelling-app-shell-v(\d+)';/, (_, v) => `const CACHE_NAME = 'spelling-app-shell-v${parseInt(v, 10) + 1}';`);
  fs.writeFileSync(swPath, updatedSw, 'utf8');
}

console.log("== [3/4] Pushing to Google Apps Script (clasp) ==");
try {
  execSync('cmd /c "clasp push -f"', { cwd: path.join(root, 'google_apps_script'), stdio: 'inherit' });
  // push 只更新 HEAD；必須 deploy -i 才會讓正式 Web App URL 生效
  execSync('cmd /c "clasp deploy -i AKfycbx1hyCNJxqFMoaJgIxfZqLYIYH00NegI1Yd8NJP6gRjqwOndWGkmr-H9tGvVwK_axM9 -d auto"', { cwd: path.join(root, 'google_apps_script'), stdio: 'inherit' });
} catch (e) {
  console.error("Clasp push error:", e.message);
}

console.log("== [4/4] Committing and pushing to Git ==");
try {
  execSync('git add -A', { cwd: root, stdio: 'inherit' });
  execSync(`git commit -q -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd: root, stdio: 'inherit' });
  execSync('git push -q', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.error("Git error:", e.message);
}

console.log("== Deployment complete! ==");
