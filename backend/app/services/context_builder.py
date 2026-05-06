from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.models.course import SessionContext


async def build_session_context(
    session_id: str,
    course_id: str,
    student_id: str,
    db: AsyncSession,
) -> SessionContext:
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
