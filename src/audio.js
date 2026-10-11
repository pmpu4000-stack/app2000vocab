// =====================================================================
// audio.js — text-to-speech via the browser's built-in voices.
// Degrades silently if speechSynthesis is unavailable.
// 完全對齊 Google Apps Script 歷程系統發音規格 (lang: en-US, rate: 0.88, 系統預設語音)
// =====================================================================
const supported = typeof window !== "undefined" && "speechSynthesis" in window;

// 保持活躍 Utterance 參照以防止瀏覽器 GC 提前資源回收導致音訊斷音 (iOS Safari / Chrome 修復)
const activeUtterances = new Set();

// Speak a word or sentence at the given rate (預設 0.88，與 GAS Web App 一致).
export function say(text, rate = 0.88) {
  if (typeof window !== "undefined" && window.__dailyUsageTimeIsUp) return;
  if (!supported || !text) return;
  try {
    speechSynthesis.cancel();
    activeUtterances.clear();
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = rate;

    activeUtterances.add(u);
    u.onend = () => activeUtterances.delete(u);
    u.onerror = () => activeUtterances.delete(u);

    speechSynthesis.speak(u);
  } catch(e) {
    console.warn("speechSynthesis say error:", e);
  }
}

// 朗讀整個單字發音 (原一個字母一個字母發音，改為完整單字朗讀)
export function spellOut(word) {
  if (!supported || !word) return;
  say(word, 0.88);
}
