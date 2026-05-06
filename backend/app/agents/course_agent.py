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
    chunks = await hybrid_retrieve(
        query=message,
        course_id=ctx.course_id,
        db=db,
    )

    system_prompt = build_system_prompt(ctx, chunks)

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
