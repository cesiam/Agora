import os
import json
import asyncio
import websockets
import base64
import time
from dataclasses import dataclass

SMALLEST_API_KEY = os.getenv("SMALLEST_API_KEY")
SMALLEST_WS_URL = "wss://api.smallest.ai/waves/v1/pulse/get_text"


@dataclass
class TranscriptTurn:
    text: str
    silence_before_ms: int
    duration_ms: int
    disfluencies: list[str]
    trailing_off: bool
    confidence: str  # low | medium | high


def detect_disfluencies(text: str) -> list[str]:
    markers = []
    for word in ["um", "uh", "er", "like", "you know", "hmm"]:
        if word in text.lower():
            markers.append(word)
    if text.strip().endswith("..."):
        markers.append("...")
    return markers


def infer_confidence(text: str, silence_before_ms: int, disfluencies: list[str]) -> str:
    score = 0
    if silence_before_ms > 3000:
        score += 2
    elif silence_before_ms > 1500:
        score += 1
    score += len(disfluencies)
    if text.strip().endswith("?") and not text.strip().startswith("What") and not text.strip().startswith("How"):
        score += 1
    if score >= 3:
        return "low"
    if score >= 1:
        return "medium"
    return "high"


async def transcribe_audio(audio_bytes: bytes, silence_before_ms: int = 0) -> TranscriptTurn:
    start_ms = int(time.time() * 1000)

    async with websockets.connect(
        SMALLEST_WS_URL,
        extra_headers={"Authorization": f"Bearer {SMALLEST_API_KEY}"},
    ) as ws:
        payload = {
            "audio": base64.b64encode(audio_bytes).decode("utf-8"),
            "format": "wav",
        }
        await ws.send(json.dumps(payload))
        result_raw = await ws.recv()
        result = json.loads(result_raw)

    end_ms = int(time.time() * 1000)
    text = result.get("text", "").strip()
    duration_ms = end_ms - start_ms

    disfluencies = detect_disfluencies(text)
    trailing_off = text.endswith("...") or text.endswith(",")
    confidence = infer_confidence(text, silence_before_ms, disfluencies)

    return TranscriptTurn(
        text=text,
        silence_before_ms=silence_before_ms,
        duration_ms=duration_ms,
        disfluencies=disfluencies,
        trailing_off=trailing_off,
        confidence=confidence,
    )
