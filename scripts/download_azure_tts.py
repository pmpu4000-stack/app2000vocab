#!/usr/bin/env python3
"""Batch download Azure Neural TTS MP3 files for all vocabulary words into audio/words/."""
import asyncio
import hashlib
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
EX_DIR = REPO_ROOT / "audio" / "examples"
VOICE = os.environ.get("AZURE_TTS_VOICE", "en-US-JennyNeural")


async def synthesize_text(sem: asyncio.Semaphore, text: str, out_file: Path) -> None:
    if out_file.exists() and out_file.stat().st_size > 0:
        return
    async with sem:
        communicate = edge_tts.Communicate(text, VOICE)
        await communicate.save(str(out_file))


async def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    EX_DIR.mkdir(parents=True, exist_ok=True)
    words = set()
    examples = {}
    for jf in sorted(DATA_DIR.glob("*.json")):
        try:
            data = json.loads(jf.read_text(encoding="utf-8"))
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        w = str(item.get("w") or item.get("word") or item.get("en") or "").strip().lower()
                        if w:
                            words.add(w)
            elif isinstance(data, dict):
                for val in data.values():
                    if isinstance(val, dict):
                        s = str(val.get("sent") or "").strip()
                        if s:
                            examples[hashlib.sha1(s.encode("utf-8")).hexdigest()[:16]] = s
                        for sub in (val.get("sents") or []):
                            if isinstance(sub, str) and sub.strip():
                                examples[hashlib.sha1(sub.strip().encode("utf-8")).hexdigest()[:16]] = sub.strip()
                            elif isinstance(sub, dict):
                                en = str(sub.get("en") or sub.get("sent") or "").strip()
                                if en:
                                    examples[hashlib.sha1(en.encode("utf-8")).hexdigest()[:16]] = en
        except Exception:
            pass
    sem = asyncio.Semaphore(8)
    tasks = [synthesize_text(sem, w, OUT_DIR / f"{w}.mp3") for w in sorted(words)]
    tasks.extend(synthesize_text(sem, txt, EX_DIR / f"{h}.mp3") for h, txt in examples.items())
    await asyncio.gather(*tasks)
    print(f"Done: {len(words)} words, {len(examples)} examples synced")


if __name__ == "__main__":
    asyncio.run(main())
