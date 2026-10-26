const url = 'https://script.google.com/macros/s/AKfycbx1hyCNJxqFMoaJgIxfZqLYIYH00NegI1Yd8NJP6gRjqwOndWGkmr-H9tGvVwK_axM9/exec';
fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ action: 'checkAndGetData', username: 'e', password: 'e' })
}).then(r => r.json()).then(data => {
  console.log('Student e status:', data.status, 'message:', data.message);
  if (data.data) {
    data.data.slice(0, 5).forEach((r, idx) => {
      console.log(`[${idx}] ${r[0]} | task: ${r[21]} | 施測: ${r[22]} | 作答: ${r[23]} | 答對: ${r[24]} | 成績: ${r[25]} | 正確率: ${r[26]} | 狀態: ${r[27]} | 錯題: ${r[28]}`);
    });
  }
  if (data.dailyTaskHistory) {
    console.log('dailyTaskHistory count:', data.dailyTaskHistory.length);
    console.log('dailyTaskHistory[0]:', JSON.stringify(data.dailyTaskHistory[0], null, 2));
  }
  if (data.todayTaskResult) {
    console.log('todayTaskResult:', JSON.stringify(data.todayTaskResult, null, 2));
  }
});
