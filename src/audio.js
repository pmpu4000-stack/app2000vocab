// =====================================================================
// audio.js — 雙引擎自然英語發音系統：
// 1. 單一英語單字優先播放真人標準美式發音音檔（清晰男女真人發音）
// 2. 片語、例句或離線時無縫切換至本機自然英語語音 (Web Speech API, 語速 0.8)
// 3. 徹底解決 Chrome/Edge 同步 cancel() 導致的靜音 Bug 與每日時長鎖定阻擋複習發音問題
// =====================================================================
const supported = typeof window !== "undefined" && "speechSynthesis" in window;

// 保持活躍 Utterance 與 Audio 參照以防止瀏覽器 GC 提前資源回收導致音訊中斷
const activeUtterances = new Set();
let currentAudio = null;
let currentSeqTimer = null;
let currentSeqToken = 0;
let cachedEnglishVoice = null;

export function getBestEnglishVoice() {
  if (!supported) return null;
  try {
    const voices = speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    if (cachedEnglishVoice && voices.includes(cachedEnglishVoice)) {
      return cachedEnglishVoice;
    }
    const enVoices = voices.filter(v => /^en(-|_|$)/i.test(String(v.lang || "").trim()));
    if (!enVoices.length) return null;

    // 優先選取本機穩定、免費可商用的作業系統內建男女聲 (避免 Chrome 遠端語音卡死無聲 Bug)
    const localUS = enVoices.filter(v => v.localService && /en[-_]US/i.test(v.lang));
    const localAnyEn = enVoices.filter(v => v.localService);

    const preferredLocalPatterns = [
      /Samantha|Alex|Ava|Allison|Victoria|Daniel|Karen|Moira/i,
      /Microsoft (Zira|David|Mark|Aria|Jenny|Guy)/i,
      /Natural/i
    ];

    for (const pat of preferredLocalPatterns) {
      const mLocalUS = localUS.find(v => pat.test(v.name));
      if (mLocalUS) {
        cachedEnglishVoice = mLocalUS;
        return mLocalUS;
      }
      const mLocalEn = localAnyEn.find(v => pat.test(v.name));
      if (mLocalEn) {
        cachedEnglishVoice = mLocalEn;
        return mLocalEn;
      }
    }

    if (localUS.length > 0) {
      cachedEnglishVoice = localUS.find(v => v.default) || localUS[0];
      return cachedEnglishVoice;
    }
    if (localAnyEn.length > 0) {
      cachedEnglishVoice = localAnyEn[0];
      return cachedEnglishVoice;
    }

    const fallback = enVoices.find(v => /en[-_]US/i.test(v.lang) && v.default)
      || enVoices.find(v => /en[-_]US/i.test(v.lang))
      || enVoices[0];
    cachedEnglishVoice = fallback || null;
    return cachedEnglishVoice;
  } catch (_) {
    return null;
  }
}

if (supported) {
  try {
    getBestEnglishVoice();
    if ("onvoiceschanged" in speechSynthesis) {
      speechSynthesis.addEventListener("voiceschanged", () => {
        cachedEnglishVoice = null;
        getBestEnglishVoice();
      });
    }
  } catch (_) {}
}

export function stopAudio() {
  try {
    currentSeqToken++;
    if (currentSeqTimer) {
      clearTimeout(currentSeqTimer);
      currentSeqTimer = null;
    }
    if (currentAudio) {
      try {
        currentAudio.onended = null;
        currentAudio.onerror = null;
        currentAudio.pause();
        currentAudio.currentTime = 0;
      } catch (_) {}
      currentAudio = null;
    }
    if (supported) {
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
      }
      activeUtterances.clear();
    }
  } catch (_) {}
}

function speakWithTTS(text, rate = 0.8, onEnd = null, token = currentSeqToken) {
  if (!supported || !text) {
    if (onEnd) onEnd();
    return;
  }
  const doSpeak = (useDefaultVoice = false) => {
    if (token !== currentSeqToken) return;
    try {
      if (speechSynthesis.paused) {
        speechSynthesis.resume();
      }
      const u = new SpeechSynthesisUtterance(text);
      if (!useDefaultVoice) {
        const bestVoice = getBestEnglishVoice();
        if (bestVoice) {
          u.voice = bestVoice;
          u.lang = bestVoice.lang || "en-US";
        } else {
          u.lang = "en-US";
        }
      } else {
        u.lang = "en-US";
      }
      u.rate = rate;
      u.pitch = 1.0;

      activeUtterances.add(u);
      u.onend = () => {
        activeUtterances.delete(u);
        if (token === currentSeqToken && onEnd) onEnd();
      };
      u.onerror = () => {
        activeUtterances.delete(u);
        if (!useDefaultVoice && token === currentSeqToken) {
          doSpeak(true);
        } else if (token === currentSeqToken && onEnd) {
          onEnd();
        }
      };

      speechSynthesis.speak(u);
    } catch (e) {
      console.warn("speechSynthesis speak error:", e);
      if (onEnd) onEnd();
    }
  };

  try {
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      speechSynthesis.cancel();
      activeUtterances.clear();
      setTimeout(() => doSpeak(false), 45);
    } else {
      doSpeak(false);
    }
  } catch (_) {
    doSpeak(true);
  }
}

function playSingleWordOrTTS(rawText, rate = 0.8, onEnd = null, token = currentSeqToken) {
  const clean = String(rawText || "")
    .replace(/\(已訂正\)/g, "")
    .replace(/🔊/g, "")
    .replace(/×\d+/g, "")
    .trim();
  if (!clean) {
    if (onEnd) onEnd();
    return;
  }

  // 若為單一英文單字，優先播放清晰真人發音 MP3 音檔，失敗或無音檔時即時無縫切換至本機自然語音 TTS
  if (/^[a-zA-Z]+$/.test(clean) && typeof Audio !== "undefined") {
    const wordLower = clean.toLowerCase();
    const audioUrl = `https://ssl.gstatic.com/dictionary/static/sounds/20200429/${wordLower}--_us_1.mp3`;
    let fallbackTriggered = false;
    const triggerFallback = () => {
      if (fallbackTriggered || token !== currentSeqToken) return;
      fallbackTriggered = true;
      currentAudio = null;
      speakWithTTS(clean, rate, onEnd, token);
    };

    try {
      const audio = new Audio(audioUrl);
      audio.playbackRate = 0.92;
      currentAudio = audio;
      audio.onended = () => {
        if (currentAudio === audio) currentAudio = null;
        if (!fallbackTriggered && token === currentSeqToken && onEnd) onEnd();
      };
      audio.onerror = () => {
        triggerFallback();
      };
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          triggerFallback();
        });
      }
      return;
    } catch (_) {
      triggerFallback();
      return;
    }
  }

  speakWithTTS(clean, rate, onEnd, token);
}

// Speak a word or sentence at the given rate (預設 0.8).
// forcePlay = true 時不受每日練習時長到期鎖定限制（供點擊單字複習發音使用）
export function say(text, rate = 0.8, onEnd = null, forcePlay = false) {
  if (!forcePlay && typeof window !== "undefined" && window.__dailyUsageTimeIsUp) {
    if (onEnd) onEnd();
    return;
  }
  if (!text) {
    if (onEnd) onEnd();
    return;
  }
  stopAudio();
  const token = currentSeqToken;
  playSingleWordOrTTS(text, rate, onEnd, token);
}

// 專供點擊「答對的單字 / 答錯的單字 / 精通單字」發音，永遠允許播放
export function sayWord(word, rate = 0.8, onEnd = null) {
  say(word, rate, onEnd, true);
}

// 朗讀整個單字發音 (單字速度 0.8)
export function spellOut(word) {
  if (!word) return;
  say(word, 0.8, null, true);
}

/**
 * 嘉義縣單字王比賽標準播放模式：
 * 順序：【單字 (0.8)】 ➔ 停頓 1.0 秒 ➔ 【例句 (0.8)】 ➔ 停頓 1.0 秒 ➔ 【單字 (0.8)】
 */
export function playContestSentence(word, sentence, onEnd = null) {
  if (typeof window !== "undefined" && window.__dailyUsageTimeIsUp) {
    if (onEnd) onEnd();
    return;
  }
  if (!word && !sentence) {
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
    playSingleWordOrTTS(text, rate, () => {
      if (token === currentSeqToken) callback();
    }, token);
  };

  const cleanWord = String(word || "").trim();
  let cleanSent = String(sentence || "").trim();
  // 若例句中有底線或挖空，自動替換為真實單字
  if (cleanWord) {
    cleanSent = cleanSent.replace(/_+/g, cleanWord);
  }

  // 缺單字或缺例句時退回單純朗讀 (速度 0.8)
  if (!cleanWord || !cleanSent) {
    say(cleanSent || cleanWord, 0.8, cleanup);
    return;
  }

  // 1. 播放單字 (速度 0.8)
  speakPart(cleanWord, 0.8, () => {
    if (token !== currentSeqToken) return;
    // 2. 停頓 1.0 秒
    currentSeqTimer = setTimeout(() => {
      if (token !== currentSeqToken) return;
      // 3. 播放例句 (速度 0.8)
      speakPart(cleanSent, 0.8, () => {
        if (token !== currentSeqToken) return;
        // 4. 停頓 1.0 秒
        currentSeqTimer = setTimeout(() => {
          if (token !== currentSeqToken) return;
          // 5. 再次播放單字 (速度 0.8)
          speakPart(cleanWord, 0.8, () => {
            cleanup();
          });
        }, 1000);
      });
    }, 1000);
  });
}
