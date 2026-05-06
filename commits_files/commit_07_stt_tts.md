# Commit 7 — Implement STT (Smallest AI) and TTS (ElevenLabs) services
# Message: feat: implement STT (Smallest AI) and TTS (ElevenLabs) services

cat > backend/app/services/stt.py << 'EOF'
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
    """
    Send audio bytes to Smallest AI Pulse via WebSocket and return enriched transcript turn.
    """
    start_ms = int(time.time() * 1000)

    async with websockets.connect(
        SMALLEST_WS_URL,
        extra_headers={"Authorization": f"Bearer {SMALLEST_API_KEY}"},
    ) as ws:
        # Send audio as base64
        payload = {
            "audio": base64.b64encode(audio_bytes).decode("utf-8"),
            "format": "wav",
        }
        await ws.send(json.dumps(payload))

        # Receive transcript
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
EOF

cat > backend/app/services/tts.py << 'EOF'
import os
import httpx

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "19STyYD15bswVz51nqLf")
ELEVENLABS_MODEL = "eleven_multilingual_v2"
ELEVENLABS_URL = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"


async def synthesize_speech(text: str) -> bytes:
    """
    Convert text to speech using ElevenLabs Samara voice.
    Returns raw audio bytes (mp3).
    """
    payload = {
        "text": text,
        "model_id": ELEVENLABS_MODEL,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": True,
        },
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            ELEVENLABS_URL,
            headers={
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            json=payload,
            timeout=30.0,
        )
        response.raise_for_status()
        return response.content
EOF

# Add a combined voice endpoint to the course API

cat >> backend/app/api/course.py << 'EOF'


from fastapi import UploadFile, File, Form
from fastapi.responses import Response
from app.services.stt import transcribe_audio
from app.services.tts import synthesize_speech
import json

@router.post("/voice")
async def course_voice(
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    course_id: str = Form(...),
    student_id: str = Form(...),
    silence_before_ms: int = Form(0),
    db: AsyncSession = Depends(get_db),
):
    """
    Full voice turn:
    1. STT: audio bytes → enriched transcript turn
    2. Course agent: transcript text → structured response
    3. TTS: agent text → audio bytes
    Returns audio/mpeg + transcript metadata in headers
    """
    audio_bytes = await audio.read()

    # 1. STT
    turn = await transcribe_audio(audio_bytes, silence_before_ms)

    # 2. Course agent
    ctx = await build_session_context(
        session_id=session_id,
        course_id=course_id,
        student_id=student_id,
        db=db,
    )
    agent_response = await run_course_agent(
        message=turn.text,
        ctx=ctx,
        db=db,
    )

    # 3. TTS — synthesize full agent response as plain text
    agent_text = " ".join(s.text for s in agent_response.segments)
    audio_out = await synthesize_speech(agent_text)

    # Return audio with metadata headers
    return Response(
        content=audio_out,
        media_type="audio/mpeg",
        headers={
            "X-Transcript": turn.text,
            "X-Confidence": turn.confidence,
            "X-Segments": json.dumps([s.model_dump() for s in agent_response.segments]),
        },
    )
EOF

git add backend/app/services/stt.py backend/app/services/tts.py backend/app/api/course.py
git commit -m "feat: implement STT (Smallest AI) and TTS (ElevenLabs) services"
