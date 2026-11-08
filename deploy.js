import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { GAS_DEPLOYMENT_ID } from './src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = __dirname;
const commitMsg = process.argv[2] || "deploy: auto update";

console.log("== [0/4] Running automated unit tests ==");
execSync('node --test tests/core.test.mjs', { cwd: root, stdio: 'inherit' });

// Auto-generate AST symbol skeleton for token optimization
try {
  const sDir = path.join(root, 'src');
  const sFiles = fs.readdirSync(sDir).filter(f => f.endsWith('.js'));
  const skel = {};
  for (const f of sFiles) {
    skel[f] = [];
    fs.readFileSync(path.join(sDir, f), 'utf8').split('\n').forEach((l, i) => {
      const m = l.match(/^\s*export\s+(async\s+)?(function|class|const|let|var)\s+([a-zA-Z0-9_$]+)/);
      if (m) skel[f].push({ name: m[3], type: m[2], line: i + 1 });
    });
  }
  fs.writeFileSync(path.join(root, '.symbol_skeleton.json'), JSON.stringify(skel, null, 2), 'utf8');
} catch (e) {}

console.log("== [1/4] Syncing TeacherJs.html from src/teacher_portal.js & compacting CSS ==");
const tpSrc = fs.readFileSync(path.join(root, 'src', 'teacher_portal.js'), 'utf8');
const tpCompact = tpSrc
  .replace(/^[ \t]*\/\/.*$/gm, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
fs.writeFileSync(path.join(root, 'google_apps_script', 'TeacherJs.html'), '<script>\n' + tpCompact + '\n</script>', 'utf8');

// Auto-sync WORD_LEVELS from src/levels.js (Single Source of Truth) into google_apps_script/Code.gs
const levelsSrc = fs.readFileSync(path.join(root, 'src', 'levels.js'), 'utf8');
const wlMatch = levelsSrc.match(/export\s+const\s+WORD_LEVELS\s*=\s*"([1-5]+)"/);
const codeGsPath = path.join(root, 'google_apps_script', 'Code.gs');
if (wlMatch && fs.existsSync(codeGsPath)) {
  const codeGsRaw = fs.readFileSync(codeGsPath, 'utf8');
  const codeGsNext = codeGsRaw.replace(/const\s+WORD_LEVELS\s*=\s*"[1-5]+"/, `const WORD_LEVELS = "${wlMatch[1]}"`);
  if (codeGsNext !== codeGsRaw) fs.writeFileSync(codeGsPath, codeGsNext, 'utf8');
}

const cssPath = path.join(root, 'css', 'styles.css');
if (fs.existsSync(cssPath)) {
  const rawCss = fs.readFileSync(cssPath, 'utf8');
  const cleanCss = rawCss
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
  if (cleanCss !== rawCss) fs.writeFileSync(cssPath, cleanCss, 'utf8');
}

console.log("== [2/4] Syncing index.html to GAS, mirrors, and bumping SW/CSS cache ==");
const nowTag = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const bumpVer = (fPath, regex) => {
  if (!fs.existsSync(fPath)) return;
  const raw = fs.readFileSync(fPath, 'utf8');
  const next = raw.replace(regex, `$1?v=${nowTag}`);
  if (next !== raw) fs.writeFileSync(fPath, next, 'utf8');
};
bumpVer(path.join(root, 'index.html'), /(css\/styles\.css|sw\.js|src\/auth_sync\.js|src\/teacher_portal\.js|src\/time_limits\.js)\?v=[0-9A-Za-z_]+/g);
bumpVer(path.join(root, 'history.html'), /(css\/styles\.css|sw\.js)\?v=[0-9A-Za-z_]+/g);

const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let gasIdx = idx;
const authSyncPath = path.join(root, 'src', 'auth_sync.js');
if (fs.existsSync(authSyncPath)) {
  const authSyncSrc = fs.readFileSync(authSyncPath, 'utf8')
    .replace('new URL("./app.js", import.meta.url).href', '"./src/app.js"');
  gasIdx = idx.replace(
    /<script type="module" src="src\/auth_sync\.js\?v=[0-9A-Za-z_]+"><\/script>/,
    () => `<script type="module">\n${authSyncSrc}\n</script>`
  );
}
fs.writeFileSync(path.join(root, 'google_apps_script', 'Index.html'), gasIdx, 'utf8');
fs.writeFileSync(path.join(root, 'teacher_history.html'), idx, 'utf8');
fs.writeFileSync(path.join(root, 'google_apps_script', 'teacher_history.html'), gasIdx, 'utf8');

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
  execSync(`cmd /c "clasp deploy -i ${GAS_DEPLOYMENT_ID} -d auto"`, { cwd: path.join(root, 'google_apps_script'), stdio: 'inherit' });
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
