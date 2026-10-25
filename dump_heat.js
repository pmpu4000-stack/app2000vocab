const fs = require('fs');
const code = fs.readFileSync('google_apps_script/Index.html', 'utf8');
const lines = code.split(/\r?\n/);

const startIdx = lines.findIndex(l => l.includes('// 5. 📅 練習紀錄（最近 4 週）熱力圖'));
console.log('startIdx:', startIdx);
for (let i = startIdx; i < startIdx + 320; i++) {
  console.log(`${i}: ${lines[i]}`);
}
