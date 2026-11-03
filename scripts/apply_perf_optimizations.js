const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../google_apps_script/ExportPdfJs.html");
let code = fs.readFileSync(file, "utf8");

// Normalize line endings to LF for replacement
const isCRLF = code.includes("\r\n");
if (isCRLF) {
  code = code.replace(/\r\n/g, "\n");
}

// 1. Optimize speakMasteredWord: local TTS first (0 data consumption, instant audio)
const oldSpeakBlock = `  const singleWordMatch = cleanText.match(/^[A-Za-z]{2,25}$/);
  if (singleWordMatch && typeof Audio !== "undefined") {
    const wordLower = singleWordMatch[0].toLowerCase();
    const dictUrl = \`https:\\x2F\\x2Fssl.gstatic.com/dictionary/static/sounds/20200429/\${wordLower}--_us_1.mp3\`;

    if (_historyWordAudioCache.get(wordLower) !== false) {
      try {
        const audio = new Audio(dictUrl);
        audio.playbackRate = 0.92;
        _activeHistoryAudio = audio;
        let fallbackTriggered = false;
        const triggerFallback = (err) => {
          if (fallbackTriggered || token !== _historyAudioSeqToken) return;
          if (err && err.name === "AbortError") return;
          fallbackTriggered = true;
          _historyWordAudioCache.set(wordLower, false);
          _speakHistoryViaTTS(cleanText, token);
        };
        audio.onerror = () => triggerFallback();
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise.then(() => {
            if (token === _historyAudioSeqToken) {
              _historyWordAudioCache.set(wordLower, true);
            }
          }).catch(triggerFallback);
          return;
        }
      } catch (_) {
        // Fallback below
      }
    }
  }

  _speakHistoryViaTTS(cleanText, token);`;

const newSpeakBlock = `  // 優先使用設備本地 Web Speech TTS 發音，免下載 MP3 音檔（省流量、零延遲）
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    _speakHistoryViaTTS(cleanText, token);
    return;
  }

  const singleWordMatch = cleanText.match(/^[A-Za-z]{2,25}$/);
  if (singleWordMatch && typeof Audio !== "undefined") {
    const wordLower = singleWordMatch[0].toLowerCase();
    const dictUrl = \`https://ssl.gstatic.com/dictionary/static/sounds/20200429/\${wordLower}--_us_1.mp3\`;
    try {
      const audio = new Audio(dictUrl);
      audio.playbackRate = 0.92;
      _activeHistoryAudio = audio;
      audio.play().catch(() => {});
    } catch (_) {}
  }`;

if (code.includes(oldSpeakBlock)) {
  code = code.replace(oldSpeakBlock, newSpeakBlock);
  console.log("TTS optimization applied.");
} else {
  console.log("TTS optimization target not found.");
}

// 2. Optimize conquer word card rendering for low-end devices: chunked rendering (15 words per chunk)
const oldConquerChunk = `          } else if (isAllMode) {
            contentHtml = \`
              <div class="conquer-all-cards-wrap" style="display:flex; flex-direction:column; gap:6px; margin-top:6px;">
                \${list.map(w => _renderConquerWordCard(w)).join("")}
              </div>
            \`;
          }`;

const newConquerChunk = `          } else if (isAllMode) {
            // DOM 分段渲染：防止低階設備一次性插入數千節點導致掉幀或記憶體溢出
            const initialLimit = 15;
            const initialList = list.slice(0, initialLimit);
            const remainingCount = list.length - initialLimit;
            contentHtml = \`
              <div class="conquer-all-cards-wrap" id="conquerAllWrap_\${lv}" style="display:flex; flex-direction:column; gap:6px; margin-top:6px;">
                \${initialList.map(w => _renderConquerWordCard(w)).join("")}
              </div>
              \${remainingCount > 0 ? \`
                <div style="text-align:center; margin-top:8px;" id="conquerMoreWrap_\${lv}">
                  <button type="button" class="btn btn-sm btn-outline-secondary" onclick="(function(){
                    const remaining = \${JSON.stringify(list.slice(initialLimit))};
                    const container = document.getElementById('conquerAllWrap_\${lv}');
                    const moreBtnWrap = document.getElementById('conquerMoreWrap_\${lv}');
                    if (container) {
                      const tempDiv = document.createElement('div');
                      tempDiv.innerHTML = remaining.map(w => _renderConquerWordCard(w)).join('');
                      while (tempDiv.firstChild) { container.appendChild(tempDiv.firstChild); }
                    }
                    if (moreBtnWrap) moreBtnWrap.remove();
                  })()">載入其餘 \${remainingCount} 個單字卡</button>
                </div>
              \` : ""}
            \`;
          }`;

if (code.includes(oldConquerChunk)) {
  code = code.replace(oldConquerChunk, newConquerChunk);
  console.log("Conquer chunked rendering applied.");
} else {
  console.log("Conquer chunked target not found.");
}

if (isCRLF) {
  code = code.replace(/\n/g, "\r\n");
}
fs.writeFileSync(file, code, "utf8");
console.log("ExportPdfJs updated.");
