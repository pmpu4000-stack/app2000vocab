
let audioCtx = null;
let compressor = null;

/**
 * 🚀 Web Audio API 動態音量平衡器 (DynamicsCompressorNode)：
 * 自動平滑削峰、防止耳機爆音與刺耳破音，維持所有單字音量一致舒適
 */
function getAudioCompressor() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    if (!audioCtx) {
      audioCtx = new Ctx();
      compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-20, audioCtx.currentTime);
      compressor.knee.setValueAtTime(25, audioCtx.currentTime);
      compressor.ratio.setValueAtTime(10, audioCtx.currentTime);
      compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
      compressor.release.setValueAtTime(0.25, audioCtx.currentTime);
      compressor.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return compressor;
  } catch (_) {
    return null;
  }
}

const AUDIO_CACHE_NAME = "spelling-audio-cache-v1";
const audioBlobMap = new Map();

/**
 * 🚀 原生 CacheStorage 音檔預載與永久快取層：
 * 題目一出現即非同步背景預載單字真人發音，二次播放 0 延遲且完全免聯網
 */
export async function prefetchAudio(words) {
  if (typeof window === "undefined" || !("caches" in window) || !Array.isArray(words)) return;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    words.forEach(async (w) => {
      const cleanW = String(w || "").trim().toLowerCase();
      if (!/^[a-z]+$/.test(cleanW)) return;
      const url = `https://ssl.gstatic.com/dictionary/static/sounds/20200429/${cleanW}--_us_1.mp3`;
      if (audioBlobMap.has(url)) return;
      const match = await cache.match(url);
      if (!match) {
        fetch(url, { mode: "cors" }).then(async (resp) => {
          if (resp && resp.ok) {
            await cache.put(url, resp.clone());
            const blob = await resp.blob();
            audioBlobMap.set(url, URL.createObjectURL(blob));
          }
        }).catch(() => {});
      } else {
        const blob = await match.blob();
        audioBlobMap.set(url, URL.createObjectURL(blob));
      }
    });
  } catch (_) {}
}

async function getCachedAudioSrc(url) {
  if (audioBlobMap.has(url)) return audioBlobMap.get(url);
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const cache = await caches.open(AUDIO_CACHE_NAME);
      let resp = await cache.match(url);
      if (!resp) {
        resp = await fetch(url, { mode: "cors" });
        if (resp && resp.ok) {
          cache.put(url, resp.clone());
        }
      }
      if (resp && resp.ok) {
        const blob = await resp.blob();
        const objUrl = URL.createObjectURL(blob);
        audioBlobMap.set(url, objUrl);
        return objUrl;
      }
    } catch (_) {}
  }
  return url;
}

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
let cachedUSVoices = [];

export function getAvailableUSVoices() {
  if (!supported) return [];
  try {
    const all = speechSynthesis.getVoices() || [];
    if (!all.length) return cachedUSVoices;

    // 嚴格篩選純正美式英語 (en-US / en_US 或名稱明確標註為美國英語)
    const usOnly = all.filter(v => {
      const lang = String(v.lang || "").replace(/_/g, "-").toLowerCase();
      const name = String(v.name || "").toLowerCase();
      if (lang === "en-us") return true;
      if (lang.startsWith("en") && (name.includes("united states") || name.includes("u.s.") || /\bus\b/i.test(name))) {
        return true;
      }
      return false;
    });

    // 優先挑選知名高音質美語語音包 (男女聲完整涵蓋，免費可商用)
    const preferredPatterns = [
      /david|zira|mark|aria|jenny|guy|christopher|eric|michelle|samantha|alex|ava|allison|victoria|tom|susan|google us|natural/i
    ];
    const preferred = usOnly.filter(v => preferredPatterns.some(p => p.test(v.name)));
    const result = preferred.length > 0 ? preferred : (usOnly.length > 0 ? usOnly : all.filter(v => /^en/i.test(v.lang)));
    cachedUSVoices = result;
    return result;
  } catch (_) {
    return cachedUSVoices;
  }
}

export function getRandomUSVoice() {
  const list = getAvailableUSVoices();
  if (!list || !list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

const FEMALE_VOICE_REGEX = /zira|samantha|ava|allison|victoria|jenny|aria|susan|michelle|katherine|lisa|stephanie|female/i;
const MALE_VOICE_REGEX = /david|alex|guy|mark|tom|christopher|eric|george|richard|male/i;

export function getUSFemaleVoice() {
  const list = getAvailableUSVoices();
  if (!list || !list.length) return null;
  const females = list.filter(v => FEMALE_VOICE_REGEX.test(v.name));
  if (females.length > 0) {
    return females[Math.floor(Math.random() * females.length)];
  }
  return list[0];
}

export function getUSMaleVoice() {
  const list = getAvailableUSVoices();
  if (!list || !list.length) return null;
  const males = list.filter(v => MALE_VOICE_REGEX.test(v.name));
  if (males.length > 0) {
    return males[Math.floor(Math.random() * males.length)];
  }
  const notFemale = list.filter(v => !FEMALE_VOICE_REGEX.test(v.name));
  if (notFemale.length > 0) {
    return notFemale[Math.floor(Math.random() * notFemale.length)];
  }
  return list[list.length - 1];
}

export function parseDialogue(text) {
  if (!text) return null;
  const raw = String(text).trim();
  const match = raw.match(/^(?:A|甲):\s*(.+?)\s*(?:\n|\/|\s{1,4})\s*(?:B|乙):\s*(.+)$/is);
  if (match) {
    return {
      partA: match[1].trim(),
      partB: match[2].trim(),
      isDialogue: true
    };
  }
  return null;
}

export function getBestEnglishVoice() {
  return getRandomUSVoice() || null;
}

if (supported) {
  try {
    getAvailableUSVoices();
    if ("onvoiceschanged" in speechSynthesis) {
      speechSynthesis.addEventListener("voiceschanged", () => {
        cachedUSVoices = [];
        getAvailableUSVoices();
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

function speakWithTTS(text, rate = 0.8, onEnd = null, token = currentSeqToken, targetVoice = null) {
  if (!supported || !text) {
    if (onEnd) onEnd();
    return;
  }
  const chosenVoice = targetVoice || getRandomUSVoice();
  const doSpeak = (useDefaultVoice = false) => {
    if (token !== currentSeqToken) return;
    try {
      if (speechSynthesis.paused) {
        speechSynthesis.resume();
      }
      const u = new SpeechSynthesisUtterance(text);
      if (!useDefaultVoice) {
        const v = chosenVoice || getRandomUSVoice();
        if (v) {
          u.voice = v;
          u.lang = v.lang || "en-US";
        } else {
          u.lang = "en-US";
        }
      } else {
        u.lang = "en-US";
      }
      u.rate = rate;
      u.pitch = 1.0;
      u.volume = 0.88; // 智慧音量平衡防爆音

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

function playSingleWordOrTTS(rawText, rate = 0.8, onEnd = null, token = currentSeqToken, targetVoice = null) {
  const clean = String(rawText || "")
    .replace(/\(已訂正\)/g, "")
    .replace(/🔊/g, "")
    .replace(/×\d+/g, "")
    .trim();
  if (!clean) {
    if (onEnd) onEnd();
    return;
  }

  // 若為情境微對話 (A: ... B: ...)，使用美式女聲(A)與男聲(B)雙聲道互動朗讀
  const dlg = parseDialogue(clean);
  if (dlg) {
    const femaleVoice = getUSFemaleVoice();
    const maleVoice = getUSMaleVoice();
    speakWithTTS(dlg.partA, rate || 0.85, () => {
      if (token !== currentSeqToken) return;
      currentSeqTimer = setTimeout(() => {
        if (token !== currentSeqToken) return;
        speakWithTTS(dlg.partB, rate || 0.85, onEnd, token, maleVoice);
      }, 450);
    }, token, femaleVoice);
    return;
  }

  // 若為單一英文單字，隨機使用免費可商用、純正美語腔之語音包 (約 50% 使用 Google US 真人發音音檔，50% 隨機使用系統優質美語 TTS 語音包)
  if (/^[a-zA-Z]+$/.test(clean) && typeof Audio !== "undefined") {
    const wordLower = clean.toLowerCase();
    const audioUrl = `https://ssl.gstatic.com/dictionary/static/sounds/20200429/${wordLower}--_us_1.mp3`;

    const useAudioMp3 = Math.random() < 0.5;

    if (useAudioMp3) {
      let fallbackTriggered = false;
      const triggerFallback = (err) => {
        if (fallbackTriggered || token !== currentSeqToken) return;
        if (err && err.name === "AbortError") return;
        fallbackTriggered = true;
        currentAudio = null;
        speakWithTTS(clean, rate, onEnd, token, targetVoice);
      };

      try {
        getCachedAudioSrc(audioUrl).then(srcUrl => {
          if (token !== currentSeqToken) return;
          try {
            const audio = new Audio(srcUrl);
            audio.playbackRate = 0.92;
            audio.volume = 0.88; // 智慧音量平衡防爆音
            currentAudio = audio;
            try {
              if (srcUrl.startsWith("blob:")) {
                const comp = getAudioCompressor();
                if (comp && audioCtx) {
                  const source = audioCtx.createMediaElementSource(audio);
                  source.connect(comp);
                }
              }
            } catch (_) {}
            audio.onended = () => {
              if (currentAudio === audio) currentAudio = null;
              if (!fallbackTriggered && token === currentSeqToken && onEnd) onEnd();
            };
            audio.onerror = () => {
              triggerFallback();
            };
            const playPromise = audio.play();
            if (playPromise && typeof playPromise.catch === "function") {
              playPromise.catch((err) => {
                triggerFallback(err);
              });
            }
          } catch (_) {
            triggerFallback();
          }
        }).catch(triggerFallback);
        return;
      } catch (_) {
        triggerFallback();
        return;
      }
    } else {
      // 隨機使用本機優質美語 TTS 語音包發音
      speakWithTTS(clean, rate, onEnd, token, targetVoice);
      return;
    }
  }

  speakWithTTS(clean, rate, onEnd, token, targetVoice);
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

let _lastSayWordText = "";
let _lastSayWordAt = 0;

// 專供點擊「答對的單字 / 答錯的單字 / 精通單字」發音，永遠允許播放且防重複連點觸發兩次發音
export function sayWord(word, rate = 0.8, onEnd = null) {
  const clean = String(word || "").trim().toLowerCase();
  const now = Date.now();
  if (clean && clean === _lastSayWordText && (now - _lastSayWordAt) < 180) {
    return;
  }
  _lastSayWordText = clean;
  _lastSayWordAt = now;
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
 * 核心保證：
 * 1. 若為情境微對話（A: ... B: ...），例句部分啟用雙聲道（角色 A 女聲提問、角色 B 男聲回答），自然交替朗讀。
 * 2. 若為一般例句，全程使用「完全相同的同一個美式語音包」，避免單字與例句聲音突變。
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

  const cleanWord = String(word || "").trim();
  let cleanSent = String(sentence || "").trim();
  // 若例句中有底線或挖空，自動替換為真實單字
  if (cleanWord) {
    cleanSent = cleanSent.replace(/_+/g, cleanWord);
  }

  // 隨機挑選一個純正美語語音包；若為微對話則準備女聲與男聲
  const sessionVoice = getRandomUSVoice();
  const femaleVoice = getUSFemaleVoice();
  const maleVoice = getUSMaleVoice();

  const speakPart = (text, rate, callback, targetVoice = sessionVoice) => {
    if (token !== currentSeqToken) return;
    speakWithTTS(text, rate, () => {
      if (token === currentSeqToken) callback();
    }, token, targetVoice);
  };

  const dlg = parseDialogue(cleanSent);

  const speakSentPart = (callback) => {
    if (dlg) {
      // 角色 A：女聲提問 (速度 0.85)
      speakPart(dlg.partA, 0.85, () => {
        if (token !== currentSeqToken) return;
        // 角色之間自然呼吸停頓 0.45 秒
        currentSeqTimer = setTimeout(() => {
          if (token !== currentSeqToken) return;
          // 角色 B：男聲回答 (速度 0.85)
          speakPart(dlg.partB, 0.85, () => {
            if (token !== currentSeqToken) return;
            callback();
          }, maleVoice);
        }, 450);
      }, femaleVoice);
    } else {
      // 一般例句：全程鎖定使用同一個美語語音包
      speakPart(cleanSent, 0.8, callback, sessionVoice);
    }
  };

  // 缺單字或缺例句時退回單純朗讀
  if (!cleanWord || !cleanSent) {
    if (dlg) {
      speakSentPart(cleanup);
    } else {
      speakPart(cleanSent || cleanWord, 0.8, cleanup, sessionVoice);
    }
    return;
  }

  // 1. 播放單字 (速度 0.8，使用 sessionVoice)
  speakPart(cleanWord, 0.8, () => {
    if (token !== currentSeqToken) return;
    // 2. 停頓 1.0 秒
    currentSeqTimer = setTimeout(() => {
      if (token !== currentSeqToken) return;
      // 3. 播放例句 (微對話則雙聲道女問男答，一般例句則同一個 sessionVoice)
      speakSentPart(() => {
        if (token !== currentSeqToken) return;
        // 4. 停頓 1.0 秒
        currentSeqTimer = setTimeout(() => {
          if (token !== currentSeqToken) return;
          // 5. 再次播放單字 (速度 0.8，使用完全相同的 sessionVoice)
          speakPart(cleanWord, 0.8, () => {
            cleanup();
          }, sessionVoice);
        }, 1000);
      });
    }, 1000);
  }, sessionVoice);
}
