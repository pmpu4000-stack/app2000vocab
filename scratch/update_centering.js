const fs = require('fs');

// 1. Update Index.html
let indexGas = fs.readFileSync('google_apps_script/Index.html', 'utf8');

// Ensure #login-overlay h2 is block/centered
const oldGasH2Rule = `    #login-overlay h2 {
      color: #232A4D;
      margin: 0 0 8px 0 !important;
      font-size: 22px !important;
      font-weight: 800 !important;
      text-align: center;
    }`;

const newGasH2Rule = `    #login-overlay h2 {
      color: #232A4D;
      margin: 0 0 8px 0 !important;
      font-size: 24px !important;
      font-weight: 800 !important;
      text-align: center !important;
      display: block !important;
      width: 100% !important;
    }
    #login-overlay input,
    #login-user,
    #login-pass,
    .login-input {
      text-align: center !important;
    }
    #login-overlay input::placeholder,
    #login-user::placeholder,
    #login-pass::placeholder,
    .login-input::placeholder {
      text-align: center !important;
    }`;

if (indexGas.includes(oldGasH2Rule)) {
  indexGas = indexGas.replace(oldGasH2Rule, newGasH2Rule);
} else {
  console.log("oldGasH2Rule not matched directly, checking variations...");
}

// Ensure the inline styles for inputs also have text-align:center
indexGas = indexGas.replace(
  'id="login-user" placeholder="請輸入帳號" autocomplete="username" class="login-input"\n          style="width:100%; padding:13px 14px; margin:0; border:1.5px solid #E7E9F5; border-radius:12px; box-sizing:border-box; font-size:15px; outline:none; transition:all .2s;"',
  'id="login-user" placeholder="請輸入帳號" autocomplete="username" class="login-input"\n          style="width:100%; padding:13px 14px; margin:0; border:1.5px solid #E7E9F5; border-radius:12px; box-sizing:border-box; font-size:15px; outline:none; text-align:center; transition:all .2s;"'
);

indexGas = indexGas.replace(
  'id="login-pass" placeholder="請輸入密碼" autocomplete="current-password" class="login-input"\n          style="width:100%; padding:13px 14px; margin:0; border:1.5px solid #E7E9F5; border-radius:12px; box-sizing:border-box; font-size:15px; outline:none; transition:all .2s;"',
  'id="login-pass" placeholder="請輸入密碼" autocomplete="current-password" class="login-input"\n          style="width:100%; padding:13px 14px; margin:0; border:1.5px solid #E7E9F5; border-radius:12px; box-sizing:border-box; font-size:15px; outline:none; text-align:center; transition:all .2s;"'
);

// Also make sure h2 has display:block inline
indexGas = indexGas.replace(
  '<h2 style="color:#232A4D; margin:0 0 8px 0; font-size:24px; font-weight:800; text-align:center;">學習歷程管理系統</h2>',
  '<h2 style="color:#232A4D; margin:0 0 8px 0; font-size:24px; font-weight:800; text-align:center; display:block; width:100%;">學習歷程管理系統</h2>'
);

fs.writeFileSync('google_apps_script/Index.html', indexGas, 'utf8');
fs.copyFileSync('google_apps_script/Index.html', 'teacher_history.html');
console.log('Index.html and teacher_history.html updated.');

// 2. Update css/styles.css
let stylesCss = fs.readFileSync('css/styles.css', 'utf8');

const addition = `
#login-overlay h2 {
  display: block !important;
  text-align: center !important;
  width: 100% !important;
}
#login-overlay input,
#login-user,
#login-pass,
.login-input {
  text-align: center !important;
}
#login-overlay input::placeholder,
#login-user::placeholder,
#login-pass::placeholder,
.login-input::placeholder {
  text-align: center !important;
}
`;

if (!stylesCss.includes('display: block !important;\n  text-align: center !important;')) {
  stylesCss = stylesCss.replace(/(\.login-box-group\s*\{)/, addition + '\n$1');
  fs.writeFileSync('css/styles.css', stylesCss, 'utf8');
  console.log('css/styles.css updated.');
} else {
  console.log('styles.css already has centering.');
}

// 3. Update index.html (Game login page)
let gameIndex = fs.readFileSync('index.html', 'utf8');

// Ensure inputs have text-align: center
gameIndex = gameIndex.replace(
  'id="login-user" placeholder="請輸入學號 (如: 70101)" \n          style="width:100%; padding:13px 14px; margin:0; border:1.5px solid #E7E9F5; border-radius:12px; box-sizing:border-box; font-size:15px; outline:none; transition:all .2s;"',
  'id="login-user" placeholder="請輸入學號 (如: 70101)" \n          style="width:100%; padding:13px 14px; margin:0; border:1.5px solid #E7E9F5; border-radius:12px; box-sizing:border-box; font-size:15px; outline:none; text-align:center; transition:all .2s;"'
);

gameIndex = gameIndex.replace(
  'id="login-pass" placeholder="請輸入密碼" \n          style="width:100%; padding:13px 14px; margin:0; border:1.5px solid #E7E9F5; border-radius:12px; box-sizing:border-box; font-size:15px; outline:none; transition:all .2s;"',
  'id="login-pass" placeholder="請輸入密碼" \n          style="width:100%; padding:13px 14px; margin:0; border:1.5px solid #E7E9F5; border-radius:12px; box-sizing:border-box; font-size:15px; outline:none; text-align:center; transition:all .2s;"'
);

// If CR LF format differed
gameIndex = gameIndex.replace(
  /id="login-user" placeholder="請輸入學號 \(如: 70101\)"\s*style="([^"]+)"/,
  (match, p1) => {
    let style = p1;
    if (!style.includes('text-align:center')) style += '; text-align:center;';
    return `id="login-user" placeholder="請輸入學號 (如: 70101)" style="${style}"`;
  }
);
gameIndex = gameIndex.replace(
  /id="login-pass" placeholder="請輸入密碼"\s*style="([^"]+)"/,
  (match, p1) => {
    let style = p1;
    if (!style.includes('text-align:center')) style += '; text-align:center;';
    return `id="login-pass" placeholder="請輸入密碼" style="${style}"`;
  }
);

fs.writeFileSync('index.html', gameIndex, 'utf8');
console.log('index.html updated.');
