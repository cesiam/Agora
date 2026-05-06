# Commit 10 — Extend admin agent with calibration chat and rubric generation
# Message: feat: admin agent — calibration chat, rubric generation, instructor feedback loop

# ─────────────────────────────────────────────
# 1. backend/app/models/admin.py  (replace full file)
# ─────────────────────────────────────────────

cat > backend/app/models/admin.py << 'EOF'
from pydantic import BaseModel
from typing import Optional

class IngestResponse(BaseModel):
    document_id: str
    chunks_indexed: int
    storage_path: str

# ── Calibration ──────────────────────────────

class CalibrationTurn(BaseModel):
    role: str           # "agent" | "instructor"
    content: str

class CalibrationStartRequest(BaseModel):
    course_id: str
    instructor_id: str

class CalibrationMessageRequest(BaseModel):
    course_id: str
    instructor_id: str
    message: str
    history: list[CalibrationTurn]  # full conversation so far

class CalibrationResponse(BaseModel):
    reply: str
    history: list[CalibrationTurn]
    complete: bool                  # True when all 3 answers collected
    calibration_profile: Optional[dict] = None  # populated when complete=True

# ── Rubric ───────────────────────────────────

class RubricGenerateRequest(BaseModel):
    course_id: str
    instructor_id: str
    calibration_profile: dict       # from completed calibration
    existing_rubric_text: Optional[str] = None  # parsed from upload if provided

class RubricFeedbackRequest(BaseModel):
    course_id: str
    instructor_id: str
    current_rubric: dict
    feedback: str                   # instructor's free-text feedback

class RubricResponse(BaseModel):
    rubric: dict
    summary: str                    # human-readable explanation of the rubric
    pending_feedback: bool = False
EOF

# ─────────────────────────────────────────────
# 2. backend/app/agents/admin_agent.py  (replace full file)
# ─────────────────────────────────────────────

cat > backend/app/agents/admin_agent.py << 'EOF'
import os
import uuid
import json
import boto3
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.models.admin import (
    IngestResponse,
    CalibrationTurn,
    CalibrationResponse,
    RubricResponse,
)

openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

s3 = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_REGION"),
)

BUCKET = os.getenv("AWS_BUCKET_NAME")
CHUNK_SIZE = 400
CHUNK_OVERLAP = 50

# ── Calibration questions (ordered) ──────────

CALIBRATION_QUESTIONS = [
    "Provide a sample question you'd like to be asked during an oral exam session for this course.",
    "Are there concepts or skills you want to probe that aren't fully captured in the rubric?",
    "What would make you feel a session fell short of your expectations?",
]

CALIBRATION_SYSTEM_PROMPT = """You are a course setup assistant for Agora, an oral exam platform.
Your job is to calibrate how the AI examiner will behave for this instructor's course.

You ask exactly three questions, one at a time, in this order:
1. {q1}
2. {q2}
3. {q3}

Rules:
- Ask one question at a time. Wait for the instructor's answer before proceeding.
- After each answer, briefly acknowledge it (1 sentence) then ask the next question.
- After the third answer is collected, return a JSON object with this schema:
  {{
    "complete": true,
    "calibration_profile": {{
      "sample_question": "...",
      "extra_concepts": "...",
      "session_failure_criteria": "..."
    }},
    "reply": "Thank you — I now have everything I need to configure your session."
  }}
- For all non-final turns return:
  {{
    "complete": false,
    "calibration_profile": null,
    "reply": "your acknowledgment + next question here"
  }}
- Never ask more than three questions total.
- Never deviate from the question order.
""".format(
    q1=CALIBRATION_QUESTIONS[0],
    q2=CALIBRATION_QUESTIONS[1],
    q3=CALIBRATION_QUESTIONS[2],
)


async def run_calibration_turn(
    message: str,
    history: list[CalibrationTurn],
    db: AsyncSession,
    course_id: str,
) -> CalibrationResponse:
    """
    One conversational turn of the calibration chat.
    history is the full conversation so far (agent + instructor turns).
    On the first call, message should be empty and history should be empty —
    the agent opens with question 1.
    """
    messages = [{"role": "system", "content": CALIBRATION_SYSTEM_PROMPT}]

    for turn in history:
        role = "assistant" if turn.role == "agent" else "user"
        messages.append({"role": role, "content": turn.content})

    if message:
        messages.append({"role": "user", "content": message})

    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        response_format={"type": "json_object"},
        temperature=0.3,
    )

    raw = json.loads(response.choices[0].message.content)
    reply = raw.get("reply", "")
    complete = raw.get("complete", False)
    calibration_profile = raw.get("calibration_profile", None)

    # Build updated history
    updated_history = list(history)
    if message:
        updated_history.append(CalibrationTurn(role="instructor", content=message))
    updated_history.append(CalibrationTurn(role="agent", content=reply))

    # Persist calibration profile to DB when complete
    if complete and calibration_profile:
        await db.execute(
            text("""
                UPDATE courses
                SET calibration = :calibration
                WHERE course_id = :course_id
            """),
            {
                "calibration": json.dumps(calibration_profile),
                "course_id": course_id,
            },
        )
        await db.commit()

    return CalibrationResponse(
        reply=reply,
        history=updated_history,
        complete=complete,
        calibration_profile=calibration_profile if complete else None,
    )


# ── Rubric generation ─────────────────────────

RUBRIC_SYSTEM_PROMPT = """You are an academic rubric designer for Agora, an oral exam platform.

Given:
- A calibration profile from the instructor (their preferences, sample questions, failure criteria)
- Optionally, an existing rubric the instructor uploaded (may be partial or informal)
- Course name and subject

Your job is to produce a structured rubric the AI examiner will use to assess student responses.

The rubric must:
- Have 4–6 clearly named criteria
- Each criterion has: name, description, weight (weights sum to 1.0), and four performance levels:
  exceeds (4), meets (3), approaches (2), below (1)
- Reflect the instructor's calibration profile — especially their extra concepts and failure criteria
- If an existing rubric was provided, preserve its intent and fill any gaps

Return a JSON object matching this schema exactly:
{
  "criteria": [
    {
      "name": "...",
      "description": "...",
      "weight": 0.25,
      "levels": {
        "exceeds": "...",
        "meets": "...",
        "approaches": "...",
        "below": "..."
      }
    }
  ],
  "summary": "One paragraph explaining the rubric to the instructor."
}"""


async def generate_rubric(
    course_id: str,
    calibration_profile: dict,
    existing_rubric_text: str | None,
    db: AsyncSession,
) -> RubricResponse:
    # Fetch course info for context
    result = await db.execute(
        text("SELECT name, subject FROM courses WHERE course_id = :id"),
        {"id": course_id},
    )
    course = result.fetchone()
    course_name = course.name if course else "Unknown"
    subject = course.subject if course else ""

    user_content = f"""Course: {course_name} ({subject})

Calibration profile:
{json.dumps(calibration_profile, indent=2)}
"""
    if existing_rubric_text:
        user_content += f"\nExisting rubric provided by instructor (fill gaps):\n{existing_rubric_text}"
    else:
        user_content += "\nNo existing rubric provided — generate from scratch."

    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": RUBRIC_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )

    raw = json.loads(response.choices[0].message.content)
    rubric = {"criteria": raw.get("criteria", [])}
    summary = raw.get("summary", "")

    # Persist rubric to DB
    await db.execute(
        text("UPDATE courses SET rubric = :rubric WHERE course_id = :id"),
        {"rubric": json.dumps(rubric), "id": course_id},
    )
    await db.commit()

    return RubricResponse(rubric=rubric, summary=summary, pending_feedback=True)


async def refine_rubric_with_feedback(
    course_id: str,
    current_rubric: dict,
    feedback: str,
    db: AsyncSession,
) -> RubricResponse:
    """
    Instructor reviews the generated rubric and provides free-text feedback.
    Agent revises and returns updated rubric.
    """
    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": RUBRIC_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"""Here is the current rubric:
{json.dumps(current_rubric, indent=2)}

Instructor feedback:
{feedback}

Revise the rubric based on this feedback. Return the full updated rubric JSON.""",
            },
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )

    raw = json.loads(response.choices[0].message.content)
    updated_rubric = {"criteria": raw.get("criteria", [])}
    summary = raw.get("summary", "")

    # Persist updated rubric
    await db.execute(
        text("UPDATE courses SET rubric = :rubric WHERE course_id = :id"),
        {"rubric": json.dumps(updated_rubric), "id": course_id},
    )
    await db.commit()

    return RubricResponse(rubric=updated_rubric, summary=summary, pending_feedback=False)


# ── Document ingestion (unchanged from commit 4) ──

def parse_and_chunk(text: str) -> list[str]:
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i : i + CHUNK_SIZE])
        chunks.append(chunk)
        i += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


async def embed(text: str) -> list[float]:
    response = await openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    return response.data[0].embedding


async def ingest_document(
    file_bytes: bytes,
    filename: str,
    file_text: str,
    course_id: str,
    instructor_id: str,
    db: AsyncSession,
) -> IngestResponse:
    document_id = str(uuid.uuid4())
    storage_path = f"courses/{course_id}/{document_id}/{filename}"

    s3.put_object(Bucket=BUCKET, Key=storage_path, Body=file_bytes)

    await db.execute(
        text("""
            INSERT INTO documents (document_id, course_id, filename, storage_path)
            VALUES (:document_id, :course_id, :filename, :storage_path)
        """),
        {
            "document_id": document_id,
            "course_id": course_id,
            "filename": filename,
            "storage_path": storage_path,
        },
    )

    chunks = parse_and_chunk(file_text)

    for idx, chunk_text in enumerate(chunks):
        chunk_id = str(uuid.uuid4())
        embedding = await embed(chunk_text)
        embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"

        await db.execute(
            text("""
                INSERT INTO chunks (chunk_id, document_id, course_id, chunk_index, text, embedding)
                VALUES (:chunk_id, :document_id, :course_id, :chunk_index, :text, :embedding::vector)
            """),
            {
                "chunk_id": chunk_id,
                "document_id": document_id,
                "course_id": course_id,
                "chunk_index": idx,
                "text": chunk_text,
                "embedding": embedding_str,
            },
        )

    await db.commit()

    return IngestResponse(
        document_id=document_id,
        chunks_indexed=len(chunks),
        storage_path=storage_path,
    )
EOF

# ─────────────────────────────────────────────
# 3. backend/app/api/admin.py  (replace full file)
# ─────────────────────────────────────────────

cat > backend/app/api/admin.py << 'EOF'
import PyPDF2
import io
from fastapi import APIRouter, UploadFile, File, Form, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.connection import get_db
from app.agents.admin_agent import (
    ingest_document,
    run_calibration_turn,
    generate_rubric,
    refine_rubric_with_feedback,
)
from app.models.admin import (
    CalibrationStartRequest,
    CalibrationMessageRequest,
    RubricGenerateRequest,
    RubricFeedbackRequest,
)

router = APIRouter()


# ── Document ingestion ────────────────────────

@router.post("/ingest")
async def ingest(
    file: UploadFile = File(...),
    course_id: str = Form(...),
    instructor_id: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    file_bytes = await file.read()
    reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
    file_text = " ".join(page.extract_text() or "" for page in reader.pages)

    result = await ingest_document(
        file_bytes=file_bytes,
        filename=file.filename,
        file_text=file_text,
        course_id=course_id,
        instructor_id=instructor_id,
        db=db,
    )
    return result


# ── Calibration chat ──────────────────────────

@router.post("/calibration/start")
async def calibration_start(
    req: CalibrationStartRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Opens the calibration chat — agent sends question 1.
    Call this once after document ingestion.
    """
    return await run_calibration_turn(
        message="",         # no instructor message yet, agent opens
        history=[],
        db=db,
        course_id=req.course_id,
    )


@router.post("/calibration/message")
async def calibration_message(
    req: CalibrationMessageRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Send one instructor message. Returns agent reply + updated history.
    When complete=True, calibration_profile is populated — proceed to /rubric/generate.
    """
    return await run_calibration_turn(
        message=req.message,
        history=req.history,
        db=db,
        course_id=req.course_id,
    )


# ── Rubric generation ─────────────────────────

@router.post("/rubric/generate")
async def rubric_generate(
    course_materials: UploadFile = File(None),  # optional existing rubric
    course_id: str = Form(...),
    instructor_id: str = Form(...),
    calibration_profile: str = Form(...),       # JSON string
    db: AsyncSession = Depends(get_db),
):
    """
    Generate rubric from calibration profile.
    Optionally accepts an existing rubric PDF to parse and fill gaps from.
    """
    import json as _json
    calibration = _json.loads(calibration_profile)
    existing_rubric_text = None

    if course_materials:
        rubric_bytes = await course_materials.read()
        reader = PyPDF2.PdfReader(io.BytesIO(rubric_bytes))
        existing_rubric_text = " ".join(page.extract_text() or "" for page in reader.pages)

    return await generate_rubric(
        course_id=course_id,
        calibration_profile=calibration,
        existing_rubric_text=existing_rubric_text,
        db=db,
    )


@router.post("/rubric/feedback")
async def rubric_feedback(
    req: RubricFeedbackRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Instructor reviews generated rubric and submits free-text feedback.
    Agent revises and returns updated rubric.
    Call as many times as needed until instructor is satisfied.
    """
    return await refine_rubric_with_feedback(
        course_id=req.course_id,
        current_rubric=req.current_rubric,
        feedback=req.feedback,
        db=db,
    )
EOF

git add backend/app/models/admin.py backend/app/agents/admin_agent.py backend/app/api/admin.py
git commit -m "feat: admin agent — calibration chat, rubric generation, instructor feedback loop"
