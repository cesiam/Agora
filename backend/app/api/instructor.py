import io
import json
import uuid

import PyPDF2
import docx as _docx
from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.admin_agent import ingest_document
from app.agents.instructor_agent import run_calibration, run_instructor_chat, generate_questions
from app.db.connection import get_db
from app.models.instructor import (
    CalibrationChatRequest,
    CreateCourseRequest,
    CreateInstructorRequest,
    InstructorChatRequest,
    UpdateRubricRequest,
)

router = APIRouter()


def _extract_text(file_bytes: bytes, filename: str) -> str:
    if filename.lower().endswith(".docx"):
        doc = _docx.Document(io.BytesIO(file_bytes))
        return " ".join(p.text for p in doc.paragraphs if p.text)
    reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
    return " ".join(page.extract_text() or "" for page in reader.pages)


# ── Instructor identity ───────────────────────────────────────────────────────

@router.post("/login")
async def get_or_create_instructor(
    req: CreateInstructorRequest,
    db: AsyncSession = Depends(get_db),
):
    """Return existing instructor by email, or create a new one."""
    row = await db.execute(
        text("SELECT instructor_id, name, email FROM instructors WHERE email = :email"),
        {"email": req.email},
    )
    existing = row.fetchone()
    if existing:
        return dict(existing._mapping)

    instructor_id = str(uuid.uuid4())
    await db.execute(
        text("INSERT INTO instructors (instructor_id, name, email) VALUES (:id, :name, :email)"),
        {"id": instructor_id, "name": req.name, "email": req.email},
    )
    await db.commit()
    return {"instructor_id": instructor_id, "name": req.name, "email": req.email}


# ── Course management ─────────────────────────────────────────────────────────

@router.post("/course")
async def create_course(
    req: CreateCourseRequest,
    db: AsyncSession = Depends(get_db),
):
    course_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO courses (course_id, instructor_id, name, subject, level)
            VALUES (:course_id, :instructor_id, :name, :subject, :level)
        """),
        {
            "course_id": course_id,
            "instructor_id": req.instructor_id,
            "name": req.name,
            "subject": req.subject,
            "level": req.level,
        },
    )
    await db.commit()
    return {"course_id": course_id}


@router.get("/courses/{instructor_id}")
async def list_courses(
    instructor_id: str,
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        text("""
            SELECT course_id, name, subject, level, created_at
            FROM courses
            WHERE instructor_id = :id
            ORDER BY created_at DESC
        """),
        {"id": instructor_id},
    )
    return {"courses": [dict(r._mapping) for r in rows.fetchall()]}


# ── Document upload ───────────────────────────────────────────────────────────

@router.post("/course/{course_id}/upload")
async def upload_document(
    course_id: str,
    file: UploadFile = File(...),
    instructor_id: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    file_bytes = await file.read()
    file_text = _extract_text(file_bytes, file.filename or "")

    result = await ingest_document(
        file_bytes=file_bytes,
        filename=file.filename or "upload",
        file_text=file_text,
        course_id=course_id,
        instructor_id=instructor_id,
        db=db,
    )
    return result


# ── Calibration chat ──────────────────────────────────────────────────────────

@router.post("/course/{course_id}/calibrate")
async def calibrate(
    course_id: str,
    req: CalibrationChatRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await run_calibration(
        message=req.message,
        history=req.history,
        course_id=course_id,
        db=db,
    )

    # Once the rubric is finalised, automatically generate the question bank
    if result.get("rubric_ready") and result.get("rubric"):
        all_history = list(req.history) + [
            {"role": "user", "content": req.message},
            {"role": "assistant", "content": result["response"]},
        ]
        questions = await generate_questions(
            rubric=result["rubric"],
            calibration_history=all_history,
            course_id=course_id,
            db=db,
        )
        result["rubric"]["questions"] = questions

    return result


# ── Rubric ────────────────────────────────────────────────────────────────────

@router.put("/course/{course_id}/rubric")
async def update_rubric(
    course_id: str,
    req: UpdateRubricRequest,
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("UPDATE courses SET rubric = :rubric WHERE course_id = :course_id"),
        {"rubric": json.dumps(req.rubric), "course_id": course_id},
    )
    await db.commit()
    return {"success": True}


# ── Instructor chat ───────────────────────────────────────────────────────────

@router.post("/course/{course_id}/chat")
async def instructor_chat(
    course_id: str,
    req: InstructorChatRequest,
    db: AsyncSession = Depends(get_db),
):
    response = await run_instructor_chat(
        message=req.message,
        course_id=course_id,
        db=db,
    )
    return {"response": response}


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/course/{course_id}/dashboard")
async def get_dashboard(
    course_id: str,
    db: AsyncSession = Depends(get_db),
):
    course_row = await db.execute(
        text("SELECT course_id, name, subject, level, rubric FROM courses WHERE course_id = :id"),
        {"id": course_id},
    )
    course = course_row.fetchone()

    insights_rows = await db.execute(
        text("""
            SELECT concept_tag, pattern_description, student_count, session_count, last_updated
            FROM course_insights
            WHERE course_id = :id
            ORDER BY student_count DESC
        """),
        {"id": course_id},
    )
    class_insights = [dict(r._mapping) for r in insights_rows.fetchall()]

    students_rows = await db.execute(
        text("""
            SELECT DISTINCT s.student_id, s.name, s.email
            FROM students s
            JOIN sessions ses ON ses.student_id = s.student_id
            WHERE ses.course_id = :id
        """),
        {"id": course_id},
    )
    students_list = [dict(r._mapping) for r in students_rows.fetchall()]

    students_out = []
    for student in students_list:
        mastery_rows = await db.execute(
            text("""
                SELECT concept_tag, current_severity, trajectory, attempts, updated_at
                FROM student_mastery
                WHERE student_id = :sid AND course_id = :cid
                ORDER BY concept_tag
            """),
            {"sid": student["student_id"], "cid": course_id},
        )
        mastery = [dict(r._mapping) for r in mastery_rows.fetchall()]

        session_rows = await db.execute(
            text("""
                SELECT session_id, session_mode, attempt, started_at
                FROM sessions
                WHERE student_id = :sid AND course_id = :cid
                ORDER BY started_at DESC
            """),
            {"sid": student["student_id"], "cid": course_id},
        )
        sessions = [dict(r._mapping) for r in session_rows.fetchall()]
        students_out.append({**student, "mastery": mastery, "sessions": sessions})

    return {
        "course": dict(course._mapping) if course else {},
        "class_insights": class_insights,
        "students": students_out,
    }


# ── Session review ────────────────────────────────────────────────────────────

@router.get("/session/{session_id}/review")
async def get_session_review(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    session_row = await db.execute(
        text("""
            SELECT ses.session_id, ses.session_mode, ses.attempt, ses.started_at, ses.transcript,
                   s.name AS student_name, s.email AS student_email
            FROM sessions ses
            JOIN students s ON s.student_id = ses.student_id
            WHERE ses.session_id = :id
        """),
        {"id": session_id},
    )
    session = session_row.fetchone()

    insights_rows = await db.execute(
        text("""
            SELECT insight_type, description, source_quote, concept_tag, severity, created_at
            FROM student_insights
            WHERE session_id = :id
            ORDER BY created_at
        """),
        {"id": session_id},
    )
    insights = [dict(r._mapping) for r in insights_rows.fetchall()]

    return {
        "session": dict(session._mapping) if session else {},
        "insights": insights,
    }
