from pydantic import BaseModel


class CreateInstructorRequest(BaseModel):
    name: str
    email: str


class CreateCourseRequest(BaseModel):
    name: str
    subject: str
    level: str = "undergraduate"
    instructor_id: str


class CalibrationChatRequest(BaseModel):
    message: str
    history: list[dict] = []


class UpdateRubricRequest(BaseModel):
    rubric: dict


class InstructorChatRequest(BaseModel):
    message: str
    instructor_id: str
