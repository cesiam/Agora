import os
import json
import uuid
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.models.insights import InsightsAgentResponse, Insight

openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

INSIGHTS_SYSTEM_PROMPT = """You are an educational analyst reviewing a student's oral exam transcript.

The transcript includes enriched metadata: silence_before_ms, disfluencies, trailing_off, and confidence per turn.
Use these signals alongside the spoken text to produce accurate insights.

A student who says the right answer with low confidence and long silence likely has surface recall without deep understanding — mark as knowledge_gap, not strength.

Return a JSON object matching this schema exactly:
{
  "insights": [
    {
      "insight_type": "misconception | knowledge_gap | strength | reasoning_error",
      "description": "one sentence describing what was observed",
      "source_quote": "exact quote from the transcript that triggered this insight",
      "concept_tag": "short concept label e.g. Vieta equations",
      "severity": "low | medium | high"
    }
  ]
}

Only return insights supported by explicit transcript evidence. Do not infer beyond what was said."""


async def analyze_session(
    session_id: str,
    student_id: str,
    course_id: str,
    db: AsyncSession,
) -> InsightsAgentResponse:
    # 1. Fetch enriched transcript
    result = await db.execute(
        text("SELECT transcript FROM sessions WHERE session_id = :id"),
        {"id": session_id},
    )
    row = result.fetchone()
    transcript = row.transcript if row else []

    transcript_str = json.dumps(transcript, indent=2)

    # 2. Call LLM
    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": INSIGHTS_SYSTEM_PROMPT},
            {"role": "user", "content": f"Transcript:\n{transcript_str}"},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )

    raw = response.choices[0].message.content
    parsed = json.loads(raw)
    insights = [Insight(**i) for i in parsed.get("insights", [])]

    # 3. Write student_insights rows
    for insight in insights:
        await db.execute(
            text("""
                INSERT INTO student_insights
                  (insight_id, session_id, student_id, course_id,
                   insight_type, description, source_quote, concept_tag, severity)
                VALUES
                  (:insight_id, :session_id, :student_id, :course_id,
                   :insight_type, :description, :source_quote, :concept_tag, :severity)
            """),
            {
                "insight_id": str(uuid.uuid4()),
                "session_id": session_id,
                "student_id": student_id,
                "course_id": course_id,
                **insight.model_dump(),
            },
        )

    # 4. Upsert student_mastery
    for insight in insights:
        trajectory = "improving" if insight.severity == "low" else "stagnant"
        await db.execute(
            text("""
                INSERT INTO student_mastery
                  (mastery_id, student_id, course_id, concept_tag,
                   attempts, current_severity, trajectory, last_session_id)
                VALUES
                  (:mastery_id, :student_id, :course_id, :concept_tag,
                   1, :severity, :trajectory, :session_id)
                ON CONFLICT (student_id, course_id, concept_tag) DO UPDATE SET
                  attempts = student_mastery.attempts + 1,
                  current_severity = EXCLUDED.current_severity,
                  trajectory = CASE
                    WHEN EXCLUDED.current_severity < student_mastery.current_severity THEN 'improving'
                    WHEN EXCLUDED.current_severity > student_mastery.current_severity THEN 'regressing'
                    ELSE 'stagnant'
                  END,
                  last_session_id = EXCLUDED.last_session_id,
                  updated_at = NOW()
            """),
            {
                "mastery_id": str(uuid.uuid4()),
                "student_id": student_id,
                "course_id": course_id,
                "concept_tag": insight.concept_tag,
                "severity": insight.severity,
                "trajectory": trajectory,
                "session_id": session_id,
            },
        )

    # 5. Aggregate into course_insights (pure SQL, no LLM)
    await db.execute(
        text("""
            INSERT INTO course_insights (insight_id, course_id, concept_tag, pattern_description, student_count, session_count)
            SELECT
              uuid_generate_v4(),
              course_id,
              concept_tag,
              'Aggregated from student insights',
              COUNT(DISTINCT student_id),
              COUNT(DISTINCT session_id)
            FROM student_insights
            WHERE course_id = :course_id
            GROUP BY course_id, concept_tag
            ON CONFLICT (course_id, concept_tag) DO UPDATE SET
              student_count = EXCLUDED.student_count,
              session_count = EXCLUDED.session_count,
              last_updated = NOW()
        """),
        {"course_id": course_id},
    )

    await db.commit()

    return InsightsAgentResponse(
        session_id=session_id,
        student_id=student_id,
        course_id=course_id,
        insights=insights,
    )
