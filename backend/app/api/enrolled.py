import uuid
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.connection import get_db

router = APIRouter()


# ── Pydantic models ───────────────────────────────────────────────────────────

class StudentLoginRequest(BaseModel):
    name: str
    email: str


class JoinCourseRequest(BaseModel):
    student_id: str
    course_id: str


class CreateEnrolledSessionRequest(BaseModel):
    student_id: str
    course_id: str
    session_mode: str = "practice"


# ── Student identity ──────────────────────────────────────────────────────────

@router.post("/student")
async def get_or_create_student(
    req: StudentLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Return existing student by email, or create a new one."""
    row = await db.execute(
        text("SELECT student_id, name, email FROM students WHERE email = :email"),
        {"email": req.email},
    )
    existing = row.fetchone()
    if existing:
        return dict(existing._mapping)

    student_id = str(uuid.uuid4())
    await db.execute(
        text("INSERT INTO students (student_id, name, email) VALUES (:id, :name, :email)"),
        {"id": student_id, "name": req.name, "email": req.email},
    )
    await db.commit()
    return {"student_id": student_id, "name": req.name, "email": req.email}


# ── Course overview ───────────────────────────────────────────────────────────

@router.get("/course/{course_id}")
async def get_course_overview(
    course_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Public course info — used by students to verify a course ID before joining."""
    row = await db.execute(
        text("SELECT course_id, name, subject, level, rubric FROM courses WHERE course_id = :id"),
        {"id": course_id},
    )
    course = row.fetchone()
    if not course:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Course not found")

    docs_rows = await db.execute(
        text("SELECT document_id, filename FROM documents WHERE course_id = :id ORDER BY uploaded_at"),
        {"id": course_id},
    )
    documents = [dict(r._mapping) for r in docs_rows.fetchall()]

    return {
        "course": dict(course._mapping),
        "documents": documents,
    }


# ── Student mastery for a course ──────────────────────────────────────────────

@router.get("/course/{course_id}/student/{student_id}/mastery")
async def get_student_mastery(
    course_id: str,
    student_id: str,
    db: AsyncSession = Depends(get_db),
):
    mastery_rows = await db.execute(
        text("""
            SELECT concept_tag, current_severity, trajectory, attempts, updated_at
            FROM student_mastery
            WHERE student_id = :sid AND course_id = :cid
            ORDER BY concept_tag
        """),
        {"sid": student_id, "cid": course_id},
    )
    mastery = [dict(r._mapping) for r in mastery_rows.fetchall()]

    session_rows = await db.execute(
        text("""
            SELECT session_id, session_mode, attempt, started_at
            FROM sessions
            WHERE student_id = :sid AND course_id = :cid
            ORDER BY started_at DESC
        """),
        {"sid": student_id, "cid": course_id},
    )
    sessions = [dict(r._mapping) for r in session_rows.fetchall()]

    return {"mastery": mastery, "sessions": sessions}


# ── Session creation ──────────────────────────────────────────────────────────

@router.post("/session")
async def create_enrolled_session(
    req: CreateEnrolledSessionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new session for an enrolled student on an existing course."""
    count_row = await db.execute(
        text("SELECT COUNT(*) FROM sessions WHERE student_id = :sid AND course_id = :cid"),
        {"sid": req.student_id, "cid": req.course_id},
    )
    attempt = (count_row.scalar() or 0) + 1

    session_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO sessions (session_id, student_id, course_id, session_mode, attempt)
            VALUES (:session_id, :student_id, :course_id, :session_mode, :attempt)
        """),
        {
            "session_id": session_id,
            "student_id": req.student_id,
            "course_id": req.course_id,
            "session_mode": req.session_mode,
            "attempt": attempt,
        },
    )
    await db.commit()
    return {"session_id": session_id, "attempt": attempt}


# ── Chunk fetch (reference panel) ────────────────────────────────────────────

@router.get("/chunk/{chunk_id}")
async def get_chunk(
    chunk_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Fetch chunk text for the session reference panel."""
    row = await db.execute(
        text("SELECT chunk_id, text, page, chunk_index FROM chunks WHERE chunk_id = :id"),
        {"id": chunk_id},
    )
    chunk = row.fetchone()
    if not chunk:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Chunk not found")
    return dict(chunk._mapping)
