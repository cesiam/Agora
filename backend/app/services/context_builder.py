import json as _json
from dataclasses import dataclass
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.models.course import SessionContext

# ---------------------------------------------------------------------------
# Static context cache (course info + mastery) — keyed by session_id.
# This data never changes mid-session, so we fetch it once and reuse it.
# The cache is process-local and cleared automatically on server restart.
# ---------------------------------------------------------------------------
@dataclass
class _StaticCtx:
    course_name: str
    subject: str
    session_mode: str
    attempt: int
    rubric: dict | None
    calibration: dict | None
    persistent_gaps: list[str]
    strengths: list[str]
    concepts: list[dict]
    questions: dict

_static_cache: dict[str, _StaticCtx] = {}


async def build_session_context(
    session_id: str,
    course_id: str,
    student_id: str,
    db: AsyncSession,
) -> SessionContext:

    # --- Static data (cached after first fetch) ---
    if session_id not in _static_cache:
        course_row = await db.execute(
            text("SELECT name, subject, level, rubric, calibration FROM courses WHERE course_id = :id"),
            {"id": course_id},
        )
        course = course_row.fetchone()

        session_row = await db.execute(
            text("SELECT session_mode, attempt FROM sessions WHERE session_id = :id"),
            {"id": session_id},
        )
        session = session_row.fetchone()

        mastery_rows = await db.execute(
            text("""
                SELECT concept_tag, current_severity, trajectory
                FROM student_mastery
                WHERE student_id = :student_id AND course_id = :course_id
            """),
            {"student_id": student_id, "course_id": course_id},
        )
        mastery = mastery_rows.fetchall()

        rubric = course.rubric if course else None
        concepts: list[dict] = []
        questions: dict = {}
        if rubric:
            raw = rubric if isinstance(rubric, dict) else _json.loads(rubric)
            concepts = raw.get("concepts", [])
            questions = raw.get("questions", {})

        _static_cache[session_id] = _StaticCtx(
            course_name=course.name if course else "Unknown Course",
            subject=course.subject if course else "",
            session_mode=session.session_mode if session else "practice",
            attempt=session.attempt if session else 1,
            rubric=rubric,
            calibration=course.calibration if course else None,
            persistent_gaps=[
                r.concept_tag for r in mastery
                if r.current_severity in ("medium", "high") or r.trajectory == "stagnant"
            ],
            strengths=[
                r.concept_tag for r in mastery
                if r.current_severity == "low" and r.trajectory == "improving"
            ],
            concepts=concepts,
            questions=questions,
        )

    static = _static_cache[session_id]

    # --- Dynamic data (transcript — changes every turn) ---
    transcript_row = await db.execute(
        text("SELECT transcript FROM sessions WHERE session_id = :id"),
        {"id": session_id},
    )
    row = transcript_row.fetchone()
    transcript = row.transcript if row else None

    if transcript:
        raw_t = transcript if isinstance(transcript, list) else _json.loads(transcript)
        history = raw_t
        student_turns = sum(1 for e in raw_t if e.get("speaker") == "student")
    else:
        history = []
        student_turns = 0

    turn_number = student_turns
    # 5-phase arc — boundaries are guidelines; agent uses them as cues, not hard cuts
    if turn_number == 0:
        current_phase = 0   # Introduction (agent opens, no student turns yet)
    elif turn_number <= 3:
        current_phase = 1   # Recognition
    elif turn_number <= 7:
        current_phase = 2   # Retrieval
    elif turn_number <= 11:
        current_phase = 3   # Interpretation
    else:
        current_phase = 4   # Evaluation — agent wraps up with written feedback

    return SessionContext(
        session_id=session_id,
        course_id=course_id,
        student_id=student_id,
        course_name=static.course_name,
        subject=static.subject,
        session_mode=static.session_mode,
        attempt=static.attempt,
        rubric=static.rubric,
        calibration=static.calibration,
        persistent_gaps=static.persistent_gaps,
        strengths=static.strengths,
        concepts=static.concepts,
        questions=static.questions,
        current_phase=current_phase,
        turn_number=turn_number,
        history=history,
    )
