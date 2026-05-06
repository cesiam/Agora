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
    concepts: list[dict] = []    # [{name, definition}, …] saved at setup
    questions: dict = {}         # {recognition:[...], retrieval:[...], interpretation:[...]}
    # 0=Introduction, 1=Recognition, 2=Retrieval, 3=Interpretation, 4=Evaluation
    current_phase: int = 0
    turn_number: int = 0         # number of completed student turns
    history: list[dict] = []     # raw transcript entries for LLM message history

class CourseMessageRequest(BaseModel):
    session_id: str
    course_id: str
    student_id: str
    message: str
