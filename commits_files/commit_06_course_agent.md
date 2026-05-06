# Commit 6 — Implement course agent with structured output and context injection
# Message: feat: implement course agent with structured output and context injection

# Create backend/app/models/course.py

cat > backend/app/models/course.py << 'EOF'
from pydantic import BaseModel
from typing import Optional

class ResponseSegment(BaseModel):
    text: str
    chunk_id: Optional[str] = None  # None for conversational filler

class CourseAgentResponse(BaseModel):
    segments: list[ResponseSegment]
    session_id: str

class SessionContext(BaseModel):
    session_id: str
    course_id: str
    student_id: str
    course_name: str
    subject: str
    session_mode: str  # practice | eval | review
    attempt: int
    rubric: Optional[dict] = None
    calibration: Optional[dict] = None
    persistent_gaps: list[str] = []
    strengths: list[str] = []

class CourseMessageRequest(BaseModel):
    session_id: str
    course_id: str
    student_id: str
    message: str
EOF

# Create backend/app/services/context_builder.py

cat > backend/app/services/context_builder.py << 'EOF'
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.models.course import SessionContext


async def build_session_context(
    session_id: str,
    course_id: str,
    student_id: str,
    db: AsyncSession,
) -> SessionContext:
    # Fetch course info
    course_row = await db.execute(
        text("SELECT name, subject, level, rubric, calibration FROM courses WHERE course_id = :id"),
        {"id": course_id},
    )
    course = course_row.fetchone()

    # Fetch session info
    session_row = await db.execute(
        text("SELECT session_mode, attempt FROM sessions WHERE session_id = :id"),
        {"id": session_id},
    )
    session = session_row.fetchone()

    # Fetch mastery profile (persistent gaps and strengths)
    mastery_rows = await db.execute(
        text("""
            SELECT concept_tag, current_severity, trajectory
            FROM student_mastery
            WHERE student_id = :student_id AND course_id = :course_id
        """),
        {"student_id": student_id, "course_id": course_id},
    )
    mastery = mastery_rows.fetchall()

    persistent_gaps = [
        r.concept_tag for r in mastery
        if r.current_severity in ("medium", "high") or r.trajectory == "stagnant"
    ]
    strengths = [
        r.concept_tag for r in mastery
        if r.current_severity == "low" and r.trajectory == "improving"
    ]

    return SessionContext(
        session_id=session_id,
        course_id=course_id,
        student_id=student_id,
        course_name=course.name if course else "Unknown Course",
        subject=course.subject if course else "",
        session_mode=session.session_mode if session else "practice",
        attempt=session.attempt if session else 1,
        rubric=course.rubric if course else None,
        calibration=course.calibration if course else None,
        persistent_gaps=persistent_gaps,
        strengths=strengths,
    )
EOF

# Create backend/app/agents/course_agent.py

cat > backend/app/agents/course_agent.py << 'EOF'
import os
import json
from openai import AsyncOpenAI
from app.models.course import SessionContext, CourseAgentResponse, ResponseSegment
from app.services.retrieval import hybrid_retrieve
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def build_system_prompt(ctx: SessionContext, chunks: list[dict]) -> str:
    chunks_text = "\n\n".join(
        f"[chunk_id: {c['chunk_id']} | page: {c['page']}]\n{c['text']}"
        for c in chunks
    )
    gaps_str = ", ".join(ctx.persistent_gaps) if ctx.persistent_gaps else "none identified yet"
    strengths_str = ", ".join(ctx.strengths) if ctx.strengths else "none identified yet"

    citation_rule = (
        "Tag every factual claim with the chunk_id it came from."
        if ctx.session_mode == "practice"
        else "Do not include chunk_ids. Respond in plain prose."
    )

    return f"""You are an oral exam assistant for {ctx.course_name} ({ctx.subject}).
Session mode: {ctx.session_mode}. Attempt: {ctx.attempt}.

Student profile:
- Persistent gaps: {gaps_str}
- Strengths: {strengths_str}

Instructor rubric: {json.dumps(ctx.rubric) if ctx.rubric else "Standard assessment."}

Source materials (use ONLY these to make factual claims):
{chunks_text}

Response rules:
1. Only make claims grounded in the source chunks above.
2. {citation_rule}
3. Return your response as a JSON object matching this schema exactly:
   {{
     "segments": [
       {{"text": "...", "chunk_id": "uuid-here-or-null"}}
     ]
   }}
4. Use chunk_id: null for conversational turns (greetings, transitions, follow-up questions).
5. If the student shows weakness in [{gaps_str}], probe those concepts with scaffolding.
6. Do not re-cover strengths unless the student raises them.
"""


async def run_course_agent(
    message: str,
    ctx: SessionContext,
    db: AsyncSession,
) -> CourseAgentResponse:
    # 1. Retrieve relevant chunks
    chunks = await hybrid_retrieve(
        query=message,
        course_id=ctx.course_id,
        db=db,
    )

    # 2. Build prompt
    system_prompt = build_system_prompt(ctx, chunks)

    # 3. Call LLM with structured output
    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )

    raw = response.choices[0].message.content
    parsed = json.loads(raw)

    segments = [
        ResponseSegment(text=s["text"], chunk_id=s.get("chunk_id"))
        for s in parsed.get("segments", [])
    ]

    # 4. Append to enriched transcript
    await append_to_transcript(ctx.session_id, message, segments, db)

    return CourseAgentResponse(segments=segments, session_id=ctx.session_id)


async def append_to_transcript(
    session_id: str,
    student_message: str,
    agent_segments: list[ResponseSegment],
    db: AsyncSession,
):
    new_turns = [
        {"speaker": "student", "text": student_message},
        {"speaker": "agent", "segments": [s.model_dump() for s in agent_segments]},
    ]

    await db.execute(
        text("""
            UPDATE sessions
            SET transcript = COALESCE(transcript, '[]'::jsonb) || :new_turns::jsonb
            WHERE session_id = :session_id
        """),
        {
            "session_id": session_id,
            "new_turns": json.dumps(new_turns),
        },
    )
    await db.commit()
EOF

# Create backend/app/api/course.py

cat > backend/app/api/course.py << 'EOF'
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.connection import get_db
from app.models.course import CourseMessageRequest
from app.agents.course_agent import run_course_agent
from app.services.context_builder import build_session_context

router = APIRouter()

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
    response = await run_course_agent(
        message=req.message,
        ctx=ctx,
        db=db,
    )
    return response
EOF

git add backend/app/models/course.py backend/app/services/context_builder.py backend/app/agents/course_agent.py backend/app/api/course.py
git commit -m "feat: implement course agent with structured output and context injection"
