// =====================================================================
// audio.js — text-to-speech via the browser's built-in voices.
// Degrades silently if speechSynthesis is unavailable.
// 完全對齊 Google Apps Script 歷程系統發音規格 (lang: en-US, rate: 0.88, 系統預設語音)
// =====================================================================
const supported = typeof window !== "undefined" && "speechSynthesis" in window;

// 保持活躍 Utterance 參照以防止瀏覽器 GC 提前資源回收導致音訊斷音 (iOS Safari / Chrome 修復)
const activeUtterances = new Set();
let currentSeqTimer = null;
let currentSeqToken = 0;

export function stopAudio() {
  if (!supported) return;
  try {
    currentSeqToken++;
    if (currentSeqTimer) {
      clearTimeout(currentSeqTimer);
      currentSeqTimer = null;
    }
    speechSynthesis.cancel();
    activeUtterances.clear();
  } catch(_) {}
}

// Speak a word or sentence at the given rate (預設 0.7).
export function say(text, rate = 0.7, onEnd = null) {
  if (typeof window !== "undefined" && window.__dailyUsageTimeIsUp) return;
  if (!supported || !text) {
    if (onEnd) onEnd();
    return;
  }
  try {
    stopAudio();
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = rate;

    activeUtterances.add(u);
    u.onend = () => {
      activeUtterances.delete(u);
      if (onEnd) onEnd();
    };
    u.onerror = () => {
      activeUtterances.delete(u);
      if (onEnd) onEnd();
    };

    speechSynthesis.speak(u);
  } catch(e) {
    console.warn("speechSynthesis say error:", e);
    if (onEnd) onEnd();
  }
}

// 朗讀整個單字發音 (單字速度 0.7)
export function spellOut(word) {
  if (!supported || !word) return;
  say(word, 0.7);
}

/**
 * 嘉義縣單字王比賽標準播放模式：
 * 順序：【單字 (0.7)】 ➔ 停頓 1.0 秒 ➔ 【例句 (0.7)】 ➔ 停頓 1.0 秒 ➔ 【單字 (0.7)】
 */
export function playContestSentence(word, sentence, onEnd = null) {
  if (typeof window !== "undefined" && window.__dailyUsageTimeIsUp) {
    if (onEnd) onEnd();
    return;
  }
  if (!supported || (!word && !sentence)) {
    if (onEnd) onEnd();
    return;
  }

  stopAudio();
  const token = ++currentSeqToken;

  const cleanup = () => {
    if (token === currentSeqToken && onEnd) {
      onEnd();
    }
  };

  const speakPart = (text, rate, callback) => {
    if (token !== currentSeqToken) return;
    try {
      if (speechSynthesis.paused) speechSynthesis.resume();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = rate;
      activeUtterances.add(u);
      u.onend = () => {
        activeUtterances.delete(u);
        if (token === currentSeqToken) {
          callback();
        }
      };
      u.onerror = () => {
        activeUtterances.delete(u);
        cleanup();
      };
      speechSynthesis.speak(u);
    } catch(e) {
      cleanup();
    }
  };

  const cleanWord = String(word || "").trim();
  let cleanSent = String(sentence || "").trim();
  // 若例句中有底線或挖空，自動替換為真實單字
  if (cleanWord) {
    cleanSent = cleanSent.replace(/_+/g, cleanWord);
  }

  // 缺單字或缺例句時退回單純朗讀 (速度 0.7)
  if (!cleanWord || !cleanSent) {
    say(cleanSent || cleanWord, 0.7, cleanup);
    return;
  }

  // 1. 播放單字 (速度 0.7)
  speakPart(cleanWord, 0.7, () => {
    if (token !== currentSeqToken) return;
    // 2. 停頓 1.0 秒
    currentSeqTimer = setTimeout(() => {
      if (token !== currentSeqToken) return;
      // 3. 播放例句 (速度 0.7)
      speakPart(cleanSent, 0.7, () => {
        if (token !== currentSeqToken) return;
        // 4. 停頓 1.0 秒
        currentSeqTimer = setTimeout(() => {
          if (token !== currentSeqToken) return;
          // 5. 再次播放單字 (速度 0.7)
          speakPart(cleanWord, 0.7, () => {
            cleanup();
          });
        }, 1000);
      });
    }, 1000);
  });
}
