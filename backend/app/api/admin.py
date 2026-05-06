import PyPDF2
import io
from fastapi import APIRouter, UploadFile, File, Form, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.connection import get_db
from app.agents.admin_agent import ingest_document

router = APIRouter()

@router.post("/ingest")
async def ingest(
    file: UploadFile = File(...),
    course_id: str = Form(...),
    instructor_id: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    file_bytes = await file.read()

    # Extract text from PDF
    reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
    file_text = " ".join(
        page.extract_text() or "" for page in reader.pages
    )

    result = await ingest_document(
        file_bytes=file_bytes,
        filename=file.filename,
        file_text=file_text,
        course_id=course_id,
        instructor_id=instructor_id,
        db=db,
    )
    return result
