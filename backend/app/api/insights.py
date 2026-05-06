from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.connection import get_db
from app.agents.insights_agent import analyze_session

router = APIRouter()

class AnalyzeRequest(BaseModel):
    session_id: str
    student_id: str
    course_id: str

@router.post("/analyze")
async def analyze(
    req: AnalyzeRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await analyze_session(
        session_id=req.session_id,
        student_id=req.student_id,
        course_id=req.course_id,
        db=db,
    )
    return result
