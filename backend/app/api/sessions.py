import io
import os
import uuid
import json
import traceback
from typing import AsyncGenerator
import PyPDF2
import docx
from fastapi import APIRouter, UploadFile, File, Form, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.db.connection import get_db, AsyncSessionLocal
from app.agents.admin_agent import ingest_document
from app.services.llm import openai_client

MOCK_CALIBRATION = os.getenv("MOCK_CALIBRATION", "false").lower() == "true"

router = APIRouter()

DEMO_INSTRUCTOR_ID = "00000000-0000-0000-0000-000000000001"
DEMO_STUDENT_ID = "00000000-0000-0000-0000-000000000002"


async def _extract_concepts(content: str) -> list[dict]:
    response = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "Extract 5-8 key concepts from the text. "
                    'Return JSON: {"concepts": [{"name": "...", "definition": "one sentence"}]}'
                ),
            },
            {"role": "user", "content": content[:4000]},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    parsed = json.loads(response.choices[0].message.content)
    return parsed.get("concepts", [])


def _event(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _extract_text(file_bytes: bytes, filename: str) -> str:
    if filename.lower().endswith(".docx"):
        doc = docx.Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs if p.text)
    reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
    return " ".join(page.extract_text() or "" for page in reader.pages)


@router.post("/setup")
async def setup_session(
    files: list[UploadFile] = File(default=[]),
    text_content: str | None = Form(None),
):
    # Read all file bytes eagerly before streaming starts, since UploadFile
    # objects become unavailable once the request scope closes.
    file_data: list[tuple[str, bytes]] = []
    for upload in files:
        file_data.append((upload.filename, await upload.read()))

    async def stream() -> AsyncGenerator[str, None]:
        # Own the DB session inside the generator so it stays alive for the
        # full duration of the stream (FastAPI closes Depends before iterating).
        async with AsyncSessionLocal() as db:
            try:
                yield _event({"type": "progress", "message": "Setting up session…"})

                await db.execute(
                    text("""
                        INSERT INTO instructors (instructor_id, name, email)
                        VALUES (:id, 'Demo Instructor', 'instructor@agora.ai')
                        ON CONFLICT (email) DO NOTHING
                    """),
                    {"id": DEMO_INSTRUCTOR_ID},
                )
                await db.execute(
                    text("""
                        INSERT INTO students (student_id, name, email)
                        VALUES (:id, 'Demo Student', 'student@agora.ai')
                        ON CONFLICT (email) DO NOTHING
                    """),
                    {"id": DEMO_STUDENT_ID},
                )

                course_id = str(uuid.uuid4())
                if file_data:
                    first_name = file_data[0][0].rsplit(".", 1)[0]
                    title = first_name if len(file_data) == 1 else f"{first_name} + {len(file_data) - 1} more"
                else:
                    title = "Pasted Notes"

                await db.execute(
                    text("""
                        INSERT INTO courses (course_id, instructor_id, name, subject)
                        VALUES (:course_id, :instructor_id, :name, 'General')
                    """),
                    {"course_id": course_id, "instructor_id": DEMO_INSTRUCTOR_ID, "name": title},
                )

                session_id = str(uuid.uuid4())
                await db.execute(
                    text("""
                        INSERT INTO sessions (session_id, student_id, course_id, session_mode, attempt)
                        VALUES (:session_id, :student_id, :course_id, 'practice', 1)
                    """),
                    {
                        "session_id": session_id,
                        "student_id": DEMO_STUDENT_ID,
                        "course_id": course_id,
                    },
                )
                await db.commit()

                all_text = ""

                if file_data:
                        for i, (filename, file_bytes) in enumerate(file_data, 1):
                            yield _event({"type": "progress", "message": f"Reading file {i}/{len(file_data)}: {filename}…"})
                            file_text = _extract_text(file_bytes, filename)
                            all_text += f"\n\n{file_text}"

                            if not MOCK_CALIBRATION:
                                yield _event({"type": "progress", "message": f"Embedding {filename}…"})
                                await ingest_document(
                                    file_bytes=file_bytes,
                                    filename=filename,
                                    file_text=file_text,
                                    course_id=course_id,
                                    instructor_id=DEMO_INSTRUCTOR_ID,
                                    db=db,
                                )
                elif text_content:
                    all_text = text_content
                    if not MOCK_CALIBRATION:
                        await ingest_document(
                            file_bytes=text_content.encode("utf-8"),
                            filename="pasted.txt",
                            file_text=text_content,
                            course_id=course_id,
                            instructor_id=DEMO_INSTRUCTOR_ID,
                            db=db,
                        )

                yield _event({"type": "progress", "message": "Extracting key concepts…"})
                if MOCK_CALIBRATION:
                    from app.agents.instructor_agent import _MOCK_RUBRIC
                    concepts = _MOCK_RUBRIC["concepts"]
                else:
                    concepts = await _extract_concepts(all_text)

                # Persist concepts into the course so the agent can use them
                if MOCK_CALIBRATION:
                    from app.agents.instructor_agent import _MOCK_RUBRIC, _MOCK_QUESTIONS
                    rubric_payload = {**_MOCK_RUBRIC, "questions": _MOCK_QUESTIONS}
                else:
                    rubric_payload = {"concepts": concepts}
                await db.execute(
                    text("UPDATE courses SET rubric = :rubric WHERE course_id = :course_id"),
                    {"rubric": json.dumps(rubric_payload), "course_id": course_id},
                )
                await db.commit()

                for concept in concepts:
                    yield _event({"type": "concept", "concept": concept})

                yield _event({
                    "type": "complete",
                    "sessionId": session_id,
                    "courseId": course_id,
                    "studentId": DEMO_STUDENT_ID,
                    "title": title,
                })

            except Exception as exc:
                traceback.print_exc()
                yield _event({"type": "error", "message": str(exc)})

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.get("/{session_id}")
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT s.transcript, s.session_mode, s.student_id, s.course_id, c.name as course_name
            FROM sessions s
            JOIN courses c ON c.course_id = s.course_id
            WHERE s.session_id = :id
        """),
        {"id": session_id},
    )
    row = result.fetchone()
    if not row:
        return {"error": "Session not found"}

    return {
        "transcript": row.transcript or [],
        "session_mode": row.session_mode,
        "student_id": str(row.student_id),
        "course_id": str(row.course_id),
        "course_name": row.course_name,
    }
