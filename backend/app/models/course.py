from pydantic import BaseModel
from typing import Optional

class ResponseSegment(BaseModel):
    text: str
    chunk_id: Optional[str] = None

class CourseAgentResponse(BaseModel):
    segments: list[ResponseSegment]
    session_id: str

class SessionContext(BaseModel):
    session_id: str
    course_id: str
    student_id: str
    course_name: str
    subject: str
    session_mode: str  # practice | eval | review
    attempt: int
    rubric: Optional[dict] = None
    calibration: Optional[dict] = None
    persistent_gaps: list[str] = []
    strengths: list[str] = []

class CourseMessageRequest(BaseModel):
    session_id: str
    course_id: str
    student_id: str
    message: str
