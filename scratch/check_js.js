const fs = require('fs');

const gasHtml = fs.readFileSync('google_apps_script/Index.html', 'utf8');
const scriptMatches = gasHtml.matchAll(/<script(?![^>]*src=)[\s\S]*?>([\s\S]*?)<\/script>/gi);
let idx = 0;
for (const m of scriptMatches) {
  idx++;
  const code = m[1];
  if (!code || !code.trim()) continue;
  try {
    new Function(code);
    console.log(`GAS inline script #${idx}: OK (${code.length} chars)`);
  } catch (e) {
    console.error(`GAS inline script #${idx} ERROR:`, e);
  }
}

const gameHtml = fs.readFileSync('index.html', 'utf8');
const gameScripts = gameHtml.matchAll(/<script(?![^>]*src=)[\s\S]*?>([\s\S]*?)<\/script>/gi);
idx = 0;
for (const m of gameScripts) {
  idx++;
  const code = m[1];
  if (!code || !code.trim()) continue;
  try {
    new Function(code);
    console.log(`Game inline script #${idx}: OK (${code.length} chars)`);
  } catch (e) {
    console.error(`Game inline script #${idx} ERROR:`, e);
  }
}
