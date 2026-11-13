#!/usr/bin/env python3
"""Batch download Azure Neural TTS MP3 files for all vocabulary words into audio/words/."""
import asyncio
import json
import os
from pathlib import Path

try:
    import edge_tts
except ImportError:
    raise SystemExit("Please install edge-tts first: pip install edge-tts")

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
OUT_DIR = REPO_ROOT / "audio" / "words"
VOICE = os.environ.get("AZURE_TTS_VOICE", "en-US-JennyNeural")


async def synthesize_word(sem: asyncio.Semaphore, word: str) -> None:
    out_file = OUT_DIR / f"{word.lower()}.mp3"
    if out_file.exists() and out_file.stat().st_size > 0:
        return
    async with sem:
        communicate = edge_tts.Communicate(word, VOICE)
        await communicate.save(str(out_file))


async def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    words = set()
    for jf in sorted(DATA_DIR.glob("*.json")):
        try:
            items = json.loads(jf.read_text(encoding="utf-8"))
            if isinstance(items, list):
                for item in items:
                    w = str(item.get("w") or item.get("word") or item.get("en") or "").strip().lower()
                    if w:
                        words.add(w)
        except Exception:
            pass
    sem = asyncio.Semaphore(8)
    await asyncio.gather(*(synthesize_word(sem, w) for w in sorted(words)))
    print(f"Done: {len(words)} words synced to {OUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
