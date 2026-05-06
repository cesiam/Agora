import PyPDF2
import docx as _docx
import io
from fastapi import APIRouter, UploadFile, File, Form, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.connection import get_db
from app.agents.admin_agent import ingest_document

router = APIRouter()


def _extract_text(file_bytes: bytes, filename: str) -> str:
    if filename.lower().endswith(".docx"):
        doc = _docx.Document(io.BytesIO(file_bytes))
        return " ".join(p.text for p in doc.paragraphs if p.text)
    reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
    return " ".join(page.extract_text() or "" for page in reader.pages)


@router.post("/ingest")
async def ingest(
    file: UploadFile = File(...),
    course_id: str = Form(...),
    instructor_id: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    file_bytes = await file.read()
    file_text = _extract_text(file_bytes, file.filename or "")

    result = await ingest_document(
        file_bytes=file_bytes,
        filename=file.filename,
        file_text=file_text,
        course_id=course_id,
        instructor_id=instructor_id,
        db=db,
    )
    return result
