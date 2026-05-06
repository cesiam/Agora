import json
import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.services.llm import openai_client

MOCK_CALIBRATION = os.getenv("MOCK_CALIBRATION", "false").lower() == "true"

# ── Hardcoded responses for Vieta's Formulas material ────────────────────────

_CALIBRATION_QUESTIONS = [
    "What are the 3–5 most important concepts students must understand in this material?",
    "What does genuine understanding look like here — what separates a student who truly gets it from one who's just memorised the surface?",
    "What misconceptions or knowledge gaps are most common among your students on this topic?",
]

_MOCK_RUBRIC = {
    "concepts": [
        {
            "name": "Vieta's Formulas",
            "definition": (
                "Relations between the roots and coefficients of a polynomial: for a polynomial "
                "with roots r₁, r₂, …, rₙ, the elementary symmetric polynomials of the roots "
                "equal (up to sign) the normalised coefficients."
            ),
            "weight": "high",
        },
        {
            "name": "Coefficient–Root Relationship (Quadratic)",
            "definition": (
                "For ax² + bx + c with roots r₁, r₂: "
                "r₁ + r₂ = −b/a and r₁ · r₂ = c/a."
            ),
            "weight": "high",
        },
        {
            "name": "Polynomial Construction from Roots",
            "definition": (
                "Given roots, the polynomial is recovered by expanding (x−r₁)(x−r₂)···(x−rₙ); "
                "the resulting coefficients are determined by Vieta's formulas."
            ),
            "weight": "medium",
        },
        {
            "name": "Generalisation to Degree n > 2",
            "definition": (
                "Vieta's formulas extend to any degree: the k-th elementary symmetric polynomial "
                "of the roots equals (with alternating sign) the (n−k)-th coefficient divided by "
                "the leading coefficient."
            ),
            "weight": "medium",
        },
        {
            "name": "Problem Solving with Vieta's",
            "definition": (
                "Using sum and product of roots directly to evaluate expressions or find unknown "
                "coefficients — without solving for individual roots."
            ),
            "weight": "high",
        },
    ],
    "understanding_markers": [
        "Can state both Vieta's formulas for a quadratic without prompting",
        "Uses sum/product of roots to find unknowns without solving for individual roots",
        "Can explain WHY the formulas hold by deriving them from the factored form",
        "Correctly generalises to degree n > 2",
    ],
    "common_misconceptions": [
        "Sign error: writing r₁ + r₂ = b/a instead of −b/a",
        "Believing Vieta's only works for quadratics",
        "Trying to find individual roots when Vieta's gives the answer directly",
        "Misapplying the product formula when the leading coefficient ≠ 1",
    ],
}

_MOCK_QUESTIONS = {
    "recognition": [
        "In the context of polynomials, what do Vieta's formulas relate?",
        "For a quadratic ax² + bx + c with roots r₁ and r₂, what does r₁ + r₂ equal in terms of the coefficients?",
        "True or false — Vieta's formulas only apply to quadratic polynomials.",
    ],
    "retrieval": [
        "State both Vieta's formulas for a general quadratic ax² + bx + c — give the exact expressions for the sum and product of the roots.",
        "Starting from the factored form (x − r₁)(x − r₂), expand it and explain how the coefficients of the resulting quadratic are related to r₁ and r₂.",
        "Write down the three Vieta relations for a monic cubic x³ + px² + qx + r with roots r₁, r₂, r₃.",
    ],
    "interpretation": [
        "If you know the sum and product of the roots of a quadratic but not the roots themselves, how can you recover the polynomial? Why is this useful?",
        "A student says: 'Vieta's formulas don't help me because I still need to find the roots first.' What is the misconception, and how would you correct it?",
        "How do Vieta's formulas change when the leading coefficient is not 1? What does that tell you about the relationship between roots and the polynomial's normalised form?",
    ],
}

QUESTION_GEN_SYSTEM_PROMPT = """You are preparing an oral exam question bank for a university-level course.

You have been given:
1. The course rubric (concepts, understanding markers, common misconceptions).
2. Sample passages from the actual uploaded course material.
3. The instructor's calibration notes (what they care about, what they've seen go wrong).

Generate a structured question bank with EXACTLY this structure:

{
  "questions": {
    "recognition": [
      "Question 1 — short, targeted, tests basic familiarity",
      "Question 2",
      "Question 3"
    ],
    "retrieval": [
      "Question 1 — asks student to reproduce a definition, formula, or derivation",
      "Question 2",
      "Question 3"
    ],
    "interpretation": [
      "Question 1 — asks for meaning, implication, or connection to another concept",
      "Question 2",
      "Question 3"
    ]
  }
}

Rules:
- Every question must be SPECIFIC to the uploaded material — not generic.
  Reference the actual content: specific formulas, named theorems, concrete examples from the text.
- Recognition: 3–4 questions. Short. Confirm the student knows what they're looking at.
- Retrieval: 3–4 questions. Ask them to reproduce something precisely.
  If the material has equations or derivations, ask for those explicitly.
- Interpretation: 3–4 questions. Push beyond reproduction — meaning, implications, edge cases, connections.
- Write the questions exactly as the agent should ask them (complete sentences, clear and direct).
- Do not number them in the JSON — just the question strings.
"""


# ── Calibration ──────────────────────────────────────────────────────────────

CALIBRATION_SYSTEM_PROMPT = """You are helping an instructor configure an oral exam for their course.
Your job is to ask exactly 3 targeted questions to build a rubric, then generate it.

Ask them one at a time in this order:
1. "What are the 3–5 most important concepts students must understand in this material?"
2. "What does genuine understanding look like here — what separates a student who truly gets it from one who's just memorised the surface?"
3. "What misconceptions or knowledge gaps are most common among your students on this topic?"

After the instructor answers the third question, output ONLY this JSON (no other text):
{
  "rubric_ready": true,
  "rubric": {
    "concepts": [
      {"name": "...", "definition": "...", "weight": "high|medium|low"}
    ],
    "understanding_markers": ["..."],
    "common_misconceptions": ["..."]
  }
}

Before the third answer is in, output ONLY this JSON:
{"rubric_ready": false, "response": "<your next question or acknowledgement + next question>"}

Count the number of instructor answers in the history to know which question to ask next.
Never output anything other than the JSON schemas above."""


async def run_calibration(
    message: str,
    history: list[dict],
    course_id: str,
    db: AsyncSession,
) -> dict:
    if MOCK_CALIBRATION:
        return await _mock_calibration(message, history, course_id, db)

    messages = [{"role": "system", "content": CALIBRATION_SYSTEM_PROMPT}]
    for entry in history:
        messages.append({"role": entry["role"], "content": entry["content"]})
    messages.append({"role": "user", "content": message})

    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        response_format={"type": "json_object"},
        temperature=0.4,
    )

    raw = json.loads(response.choices[0].message.content)

    if raw.get("rubric_ready"):
        rubric = raw["rubric"]
        await db.execute(
            text("UPDATE courses SET rubric = :rubric WHERE course_id = :course_id"),
            {"rubric": json.dumps(rubric), "course_id": course_id},
        )
        await db.commit()
        return {
            "rubric_ready": True,
            "response": "I've built a rubric from our conversation. Review and edit it below before publishing.",
            "rubric": rubric,
        }

    return {"rubric_ready": False, "response": raw.get("response", "")}


async def _mock_calibration(
    message: str,
    history: list[dict],
    course_id: str,
    db: AsyncSession,
) -> dict:
    """
    Mock calibration: asks the 3 pre-defined questions in order, accepts any answer,
    and returns the hardcoded rubric after the third answer. No LLM calls.
    """
    # Count how many user answers are already in the history
    user_turns = sum(1 for e in history if e.get("role") == "user")

    # After 3 answers → finalise
    if user_turns >= 3:
        rubric = {**_MOCK_RUBRIC}
        await db.execute(
            text("UPDATE courses SET rubric = :rubric WHERE course_id = :course_id"),
            {"rubric": json.dumps(rubric), "course_id": course_id},
        )
        await db.commit()
        return {
            "rubric_ready": True,
            "response": "Thanks — I've built the rubric from your notes. Review and edit it below before publishing.",
            "rubric": rubric,
        }

    # Ask the next question
    next_q = _CALIBRATION_QUESTIONS[user_turns]
    if user_turns == 0:
        # First response: acknowledge the message and ask Q1
        response_text = f"Let's set up the assessment profile. {next_q}"
    else:
        response_text = f"Got it. {next_q}"

    return {"rubric_ready": False, "response": response_text}


# ── Question generation ──────────────────────────────────────────────────────

async def generate_questions(
    rubric: dict,
    calibration_history: list[dict],
    course_id: str,
    db: AsyncSession,
) -> dict:
    """
    Generate a phase-structured question bank from the rubric + source material.
    Returns {"recognition": [...], "retrieval": [...], "interpretation": [...]}.
    When MOCK_CALIBRATION=true, returns the hardcoded question bank without any LLM call.
    """
    if MOCK_CALIBRATION:
        questions = _MOCK_QUESTIONS
    else:
        chunks_rows = await db.execute(
            text("""
                SELECT text FROM chunks
                WHERE course_id = :cid
                ORDER BY chunk_index
                LIMIT 12
            """),
            {"cid": course_id},
        )
        sample_chunks = "\n\n---\n\n".join(r.text for r in chunks_rows.fetchall())
        cal_notes = "\n".join(
            f"{e['role'].upper()}: {e['content']}"
            for e in calibration_history
            if e.get("role") == "user"
        )
        user_content = (
            f"RUBRIC:\n{json.dumps(rubric, indent=2)}\n\n"
            f"INSTRUCTOR NOTES (from calibration):\n{cal_notes or '(none)'}\n\n"
            f"SAMPLE COURSE MATERIAL:\n{sample_chunks or '(none)'}"
        )
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": QUESTION_GEN_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
            temperature=0.4,
        )
        raw = json.loads(response.choices[0].message.content)
        questions = raw.get("questions", {"recognition": [], "retrieval": [], "interpretation": []})

    updated_rubric = {**rubric, "questions": questions}
    await db.execute(
        text("UPDATE courses SET rubric = :rubric WHERE course_id = :course_id"),
        {"rubric": json.dumps(updated_rubric), "course_id": course_id},
    )
    await db.commit()
    return questions


# ── Instructor chat ───────────────────────────────────────────────────────────

INSTRUCTOR_CHAT_SYSTEM_PROMPT = """You are an educational analytics assistant embedded in an instructor dashboard.
You have access to real-time student performance data: mastery trajectories, concept-level weaknesses,
session counts, and severity trends.

You can answer questions like:
- "How is [student name] doing?" → give a specific, evidence-based summary per concept
- "What should I review in my upcoming lesson?" → name the 2–3 concepts with the most systemic weakness
- "Which concepts are students struggling with most?" → rank by student_count or severity
- "Help me adjust the rubric" → suggest specific changes based on observed gaps

Rules:
- Be concise and direct. No filler.
- Always cite the data when making a claim ("3 out of 5 students show high severity on X").
- If the data is insufficient to answer (e.g. no sessions yet), say so plainly.
- Never fabricate student names or scores not present in the context."""


async def run_instructor_chat(
    message: str,
    course_id: str,
    db: AsyncSession,
) -> str:
    course_row = await db.execute(
        text("SELECT name, subject, rubric FROM courses WHERE course_id = :id"),
        {"id": course_id},
    )
    course = course_row.fetchone()

    insights_rows = await db.execute(
        text("""
            SELECT concept_tag, pattern_description, student_count, session_count
            FROM course_insights
            WHERE course_id = :id
            ORDER BY student_count DESC
        """),
        {"id": course_id},
    )
    class_insights = [dict(r._mapping) for r in insights_rows.fetchall()]

    mastery_rows = await db.execute(
        text("""
            SELECT s.name AS student_name, sm.concept_tag, sm.current_severity,
                   sm.trajectory, sm.attempts
            FROM student_mastery sm
            JOIN students s ON s.student_id = sm.student_id
            WHERE sm.course_id = :id
            ORDER BY s.name, sm.concept_tag
        """),
        {"id": course_id},
    )
    mastery = [dict(r._mapping) for r in mastery_rows.fetchall()]

    context = (
        f"Course: {course.name if course else 'Unknown'} ({course.subject if course else ''})\n\n"
        f"Class-level concept weaknesses:\n{json.dumps(class_insights, indent=2)}\n\n"
        f"Per-student mastery:\n{json.dumps(mastery, indent=2)}"
    )

    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": INSTRUCTOR_CHAT_SYSTEM_PROMPT},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {message}"},
        ],
        temperature=0.4,
    )

    return response.choices[0].message.content
