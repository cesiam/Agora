from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.connection import get_db
from app.models.course import CourseMessageRequest
from app.agents.course_agent import run_course_agent
from app.services.context_builder import build_session_context

router = APIRouter()

@router.post("/message")
async def course_message(
    req: CourseMessageRequest,
    db: AsyncSession = Depends(get_db),
):
    ctx = await build_session_context(
        session_id=req.session_id,
        course_id=req.course_id,
        student_id=req.student_id,
        db=db,
    )
    response = await run_course_agent(
        message=req.message,
        ctx=ctx,
        db=db,
    )
    return response
