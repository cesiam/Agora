import os
import io
import uuid
import json
from typing import AsyncGenerator
import PyPDF2
import docx
from fastapi import APIRouter, UploadFile, File, Form, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from openai import AsyncOpenAI
from app.db.connection import get_db
from app.agents.admin_agent import ingest_document

router = APIRouter()
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

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
    db: AsyncSession = Depends(get_db),
):
    async def stream() -> AsyncGenerator[str, None]:
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
            if files:
                first_name = files[0].filename.rsplit(".", 1)[0]
                title = first_name if len(files) == 1 else f"{first_name} + {len(files) - 1} more"
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

            if files:
                for i, upload in enumerate(files, 1):
                    yield _event({"type": "progress", "message": f"Reading file {i}/{len(files)}: {upload.filename}…"})
                    file_bytes = await upload.read()
                    file_text = _extract_text(file_bytes, upload.filename)
                    all_text += f"\n\n{file_text}"

                    yield _event({"type": "progress", "message": f"Embedding {upload.filename}…"})
                    await ingest_document(
                        file_bytes=file_bytes,
                        filename=upload.filename,
                        file_text=file_text,
                        course_id=course_id,
                        instructor_id=DEMO_INSTRUCTOR_ID,
                        db=db,
                    )
            elif text_content:
                all_text = text_content
                await ingest_document(
                    file_bytes=text_content.encode("utf-8"),
                    filename="pasted.txt",
                    file_text=text_content,
                    course_id=course_id,
                    instructor_id=DEMO_INSTRUCTOR_ID,
                    db=db,
                )

            yield _event({"type": "progress", "message": "Extracting key concepts…"})
            concepts = await _extract_concepts(all_text)
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
