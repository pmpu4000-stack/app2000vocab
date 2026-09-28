// =====================================================================
// audio.js — text-to-speech via the browser's built-in voices.
// Degrades silently if speechSynthesis is unavailable.
// =====================================================================
const supported = typeof window !== "undefined" && "speechSynthesis" in window;

let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  voice =
    vs.find((v) => /en[-_]US/i.test(v.lang) && /female|samantha|karen|zira|aria/i.test(v.name)) ||
    vs.find((v) => /en[-_]US/i.test(v.lang)) ||
    vs.find((v) => /^en/i.test(v.lang)) ||
    null;
}
if (supported) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice; // voices load asynchronously
}

// 保持活躍 Utterance 參照以防止瀏覽器 GC 提前資源回收導致音訊斷音 (iOS Safari / Chrome 修復)
const activeUtterances = new Set();

// Speak a word or sentence at the given rate (default 0.9).
export function say(text, rate = 0.9) {
  if (!supported) return;
  try {
    speechSynthesis.cancel();
    activeUtterances.clear();
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = rate;
    if (voice) u.voice = voice;

    activeUtterances.add(u);
    u.onend = () => activeUtterances.delete(u);
    u.onerror = () => activeUtterances.delete(u);

    speechSynthesis.speak(u);
  } catch(e) {
    console.warn("speechSynthesis say error:", e);
  }
}

// Spell a word out one letter at a time (slower), for the "wrong answer" hint.
export function spellOut(word) {
  if (!supported) return;
  try {
    speechSynthesis.cancel();
    activeUtterances.clear();
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
    }
    for (const c of word) {
      const u = new SpeechSynthesisUtterance(c);
      u.lang = "en-US";
      u.rate = 0.7;
      if (voice) u.voice = voice;

      activeUtterances.add(u);
      u.onend = () => activeUtterances.delete(u);
      u.onerror = () => activeUtterances.delete(u);

      speechSynthesis.speak(u);
    }
  } catch(e) {
    console.warn("speechSynthesis spellOut error:", e);
  }
}

