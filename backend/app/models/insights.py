from pydantic import BaseModel
from typing import Optional

class Insight(BaseModel):
    insight_type: str   # misconception | knowledge_gap | strength | reasoning_error
    description: str
    source_quote: str
    concept_tag: str
    severity: str       # low | medium | high

class InsightsAgentResponse(BaseModel):
    session_id: str
    student_id: str
    course_id: str
    insights: list[Insight]
