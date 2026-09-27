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

// Speak a word or sentence at the given rate (default 0.9).
export function say(text, rate = 0.9) {
  if (!supported) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate;
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

// Spell a word out one letter at a time (slower), for the "wrong answer" hint.
export function spellOut(word) {
  if (!supported) return;
  speechSynthesis.cancel();
  for (const c of word) {
    const u = new SpeechSynthesisUtterance(c);
    u.lang = "en-US";
    u.rate = 0.7;
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  }
}
