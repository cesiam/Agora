import json
import asyncio
from fastapi import APIRouter, Depends, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.connection import get_db, AsyncSessionLocal
from app.models.course import CourseMessageRequest
from app.agents.course_agent import run_course_agent, _write_transcript
from app.services.context_builder import build_session_context
from app.services.stt import transcribe_audio
from app.services.tts import synthesize_speech

router = APIRouter()


async def _save_transcript(session_id: str, save_turns: list) -> None:
    """Persist transcript in its own DB session so it can run in parallel with TTS."""
    async with AsyncSessionLocal() as db:
        await _write_transcript(session_id, save_turns, db)


@router.post("/message")
async def course_message(
    req: CourseMessageRequest,
    db: AsyncSession = Depends(get_db),
):
    ctx = await build_session_context(
        session_id=req.session_id,
        course_id=req.course_id,
        student_id=req.student_id,
        db=db,
    )
    response, save_turns = await run_course_agent(
        message=req.message,
        ctx=ctx,
        db=db,
    )
    agent_text = " ".join(s.text for s in response.segments)

    # TTS and transcript save run in parallel — neither blocks the other
    audio_out, _ = await asyncio.gather(
        synthesize_speech(agent_text),
        _save_transcript(req.session_id, save_turns),
    )

    return Response(
        content=audio_out,
        media_type="audio/mpeg",
        headers={
            "X-Segments": json.dumps([s.model_dump() for s in response.segments]),
            "Access-Control-Expose-Headers": "X-Segments",
        },
    )


@router.post("/transcribe")
async def course_transcribe(
    audio: UploadFile = File(...),
    silence_before_ms: int = Form(0),
):
    audio_bytes = await audio.read()
    turn = await transcribe_audio(audio_bytes, silence_before_ms)
    return {"transcript": turn.text, "confidence": turn.confidence}


@router.post("/voice")
async def course_voice(
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    course_id: str = Form(...),
    student_id: str = Form(...),
    silence_before_ms: int = Form(0),
    db: AsyncSession = Depends(get_db),
):
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
    agent_response, save_turns = await run_course_agent(
        message=turn.text,
        ctx=ctx,
        db=db,
    )

    # 3. TTS and transcript save in parallel
    agent_text = " ".join(s.text for s in agent_response.segments)
    audio_out, _ = await asyncio.gather(
        synthesize_speech(agent_text),
        _save_transcript(session_id, save_turns),
    )

    return Response(
        content=audio_out,
        media_type="audio/mpeg",
        headers={
            "X-Transcript": turn.text,
            "X-Confidence": turn.confidence,
            "X-Segments": json.dumps([s.model_dump() for s in agent_response.segments]),
        },
    )
