import json
from app.models.course import SessionContext, CourseAgentResponse, ResponseSegment
from app.services.retrieval import hybrid_retrieve
from app.services.llm import openai_client
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


PHASE_NAMES = {
    0: "Introduction",
    1: "Recognition",
    2: "Retrieval",
    3: "Interpretation",
    4: "Evaluation",
}

PHASE_INSTRUCTIONS = {
    0: """
── INTRODUCTION ──
You are opening the session. In 2–3 natural sentences:
• Mention the topic warmly (do NOT list every concept).
• Tell the student you'll move through Recognition → Retrieval → Interpretation, then close with feedback.
• Ask your first Recognition question straight away — no preamble, no bullet lists.
""",
    1: """
── PHASE 1: RECOGNITION — *Do you know what you're looking at?* ──
Goal: confirm the student can identify, name, and situate the key concepts from the uploaded material.
Keep questions short and targeted — one concept at a time.
• After a correct answer: one-word/one-phrase confirmation, then immediately ask the next Recognition question.
• After an incorrect/partial answer: give a one-sentence hint using language from the source material, then re-ask.
Do NOT explain the concept in full — that is not your role here.
After 2–3 successful Recognition turns, announce the move to Retrieval.
""",
    2: """
── PHASE 2: RETRIEVAL — *Can you actually reproduce it?* ──
Goal: ask the student to reproduce specific content from the uploaded material — exact definitions,
specific formulas, step-by-step derivations, precise formal statements. Use the source chunks to
know exactly what to ask for.
• After a correct answer: confirm briefly, then immediately probe the next piece.
• After a vague answer: ask "Can you be more precise?" or "How would you state that formally?"
• After two failed attempts: give the exact phrasing from the source material as a quote,
  then ask them to explain it in their own words.
Do NOT rephrase or summarise the concept unprompted.
After 3–4 Retrieval turns, announce the move to Interpretation.
""",
    3: """
── PHASE 3: INTERPRETATION — *What does it mean? What does it imply?* ──
Goal: push beyond reproduction. Ask the student to explain significance, connect to adjacent ideas,
identify where the formalism breaks down, or apply the concept to a novel example from the material.
• Sharp reasoning: acknowledge it precisely ("That's the key insight — ") then dig one level deeper.
• Vague reasoning: ask them to be concrete ("Can you give a specific example of that?").
This phase is the most diagnostic. Surface memorisation cannot survive it.
After 3–4 Interpretation turns, close with the Evaluation.
""",
    4: """
── PHASE 4: EVALUATION — *Closing the session* ──
The session is complete. Do NOT ask any more questions.
Write a short, honest closing assessment with exactly three labelled parts:

**Strength:** What the student did genuinely well, and why it matters.
**Area to develop:** The single most important conceptual gap the session exposed.
**Recommended next step:** One concrete, actionable follow-up they can do now.

Keep the whole thing under 120 words. Be direct and useful, not generic.
End with a single sentence telling them they can end the session when they're ready.
""",
}


def _format_question_bank(questions: dict, current_phase: int) -> str:
    """Build the question bank section of the prompt, highlighting the active phase."""
    if not questions:
        return ""

    phase_map = {1: "recognition", 2: "retrieval", 3: "interpretation"}
    active_key = phase_map.get(current_phase, "")

    lines = ["\n━━━ INSTRUCTOR QUESTION BANK ━━━"]
    lines.append(
        "These questions were written by the instructor specifically for this course material.\n"
        "They are the BACKBONE of this session — treat them as the minimum you must cover.\n\n"
        "RULES:\n"
        "• Work through ALL questions in the current phase before advancing.\n"
        "• You MAY skip a question only if the student has already clearly addressed it unprompted.\n"
        "• You MUST add unscripted follow-up questions whenever:\n"
        "    – The student's answer is vague, hedged, or hand-wavy\n"
        "    – A gap or misconception surfaces that the instructor didn't anticipate\n"
        "    – A deeper layer of understanding is within one push's reach\n"
        "• The question bank is a FLOOR, not a ceiling. Go further when the conversation warrants it.\n"
        "• When you ask a bank question, ask it naturally — don't quote it verbatim or number it.\n"
    )

    phase_labels = {"recognition": "Phase 1 — Recognition", "retrieval": "Phase 2 — Retrieval", "interpretation": "Phase 3 — Interpretation"}
    for key, label in phase_labels.items():
        qs = questions.get(key, [])
        if not qs:
            continue
        marker = " ◀ CURRENT PHASE" if key == active_key else ""
        lines.append(f"{label}{marker}:")
        for q in qs:
            lines.append(f"  • {q}")
        lines.append("")

    return "\n".join(lines)


def build_system_prompt(ctx: SessionContext, chunks: list[dict]) -> str:
    chunks_text = "\n\n".join(
        f"[chunk_id: {c['chunk_id']}]\n{c['text']}"
        for c in chunks
    )
    gaps_str = ", ".join(ctx.persistent_gaps) if ctx.persistent_gaps else "none identified yet"
    strengths_str = ", ".join(ctx.strengths) if ctx.strengths else "none identified yet"
    concept_names = ", ".join(c["name"] for c in ctx.concepts) if ctx.concepts else "to be inferred from material"

    phase_name = PHASE_NAMES.get(ctx.current_phase, "Recognition")
    phase_instruction = PHASE_INSTRUCTIONS.get(ctx.current_phase, PHASE_INSTRUCTIONS[1])
    question_bank = _format_question_bank(ctx.questions, ctx.current_phase)

    return f"""You are a Socratic tutor conducting a PRACTICE MODE oral session on {ctx.course_name} ({ctx.subject}).

Session turn: {ctx.turn_number}. Current phase: {ctx.current_phase} — {phase_name}.

Topic concepts: {concept_names}
Student gaps: {gaps_str}
Student strengths: {strengths_str}

━━━ BEFORE EVERY RESPONSE — INTERNAL CHECK (do this silently, do not say it aloud) ━━━
Ask yourself three questions before you write anything:

  A. COVERAGE: Have I genuinely tested the student on the core ideas in the source material?
     List the key concepts in the chunks below. If any remain untested, stay in the current phase.
     Do NOT move to the next phase until the student has been meaningfully tested on the material.

  B. HAND-WAVING DETECTION: Was the student's last response vague, hedged, or suspiciously broad?
     Signs of hand-waving: uses filler phrases ("basically", "kind of", "I think", "something like"),
     gives a correct-sounding statement without any specifics, can't name a formula or term precisely,
     restates the question back as an answer, or gives a definition that would apply to ten other things.
     If you detect hand-waving → do NOT accept it. Ask a pointed clarification:
     "Can you be more specific?" / "What exactly does X equal in that case?" / "Can you give the precise statement?"

  C. DEPTH CHECK: Has this student actually demonstrated understanding, or just pattern-matched the right words?
     A correct answer that the student cannot unpack is not genuine understanding.
     If something feels surface-level, probe one layer deeper before moving on.

━━━ PRACTICE MODE RULES ━━━
1. ALWAYS acknowledge the student's last response before anything else.
   • Correct and specific: one brief confirmation ("Exactly." / "Right —") then ask the next question.
   • Correct but vague/hand-wavy: "That's the right direction — can you be more precise? [specific follow-up]"
   • Partially correct: name what's right in one sentence, then ask about the gap.
   • Wrong: do NOT state the correct answer — ask a guiding question that leads them there.

2. EVERY response MUST end with exactly ONE question. No exceptions.
   (Exception: Evaluation phase — close with feedback + "Feel free to end the session when you're ready.")

3. DO NOT explain or lecture unprompted. You are probing, not teaching.
   The only time you may state a fact is when giving a hint after the student is clearly stuck
   (two failed attempts at the same point). Even then, keep it to one sentence and follow with a question.

4. Ground every question in the SOURCE MATERIAL below. Ask about specific formulas, derivations,
   examples, and definitions from the uploaded content — not generic topic questions.

5. You CAN backtrack, offer hints, rephrase, or stay in a phase as long as needed.
   There is no rush. Thoroughness matters more than pace.

6. Advance phases only when the student has genuinely demonstrated understanding of the current phase's
   concepts. Announce a phase change in one short sentence ("Let's move to retrieval — ...").

{phase_instruction}
{question_bank}
━━━ OUTPUT FORMAT ━━━
Return ONLY a JSON object with this schema — no markdown, no preamble:
{{
  "segments": [
    {{"text": "...", "chunk_id": "uuid-or-null"}}
  ]
}}
Use chunk_id: null for your own words (reactions, questions, transitions).
Tag direct factual claims with the chunk_id they come from.

━━━ SOURCE MATERIAL ━━━
{chunks_text}
"""


HISTORY_WINDOW = 10  # keep last N transcript entries (≈ 5 back-and-forth turns)

# Short filler replies that don't warrant a fresh embedding call
_FILLER_WORDS = {"yes", "no", "ok", "okay", "sure", "right", "correct",
                 "i see", "got it", "i think", "i don't know", "i'm not sure",
                 "not sure", "maybe", "hmm", "yeah", "nope", "yep"}


def _needs_fresh_retrieval(message: str) -> bool:
    """Return False for short/filler messages that won't improve retrieval."""
    if message == "__init__":
        return True
    words = message.lower().strip().rstrip(".?!").split()
    return len(words) >= 5 and message.lower().strip() not in _FILLER_WORDS


def build_messages(system_prompt: str, history: list[dict], current_message: str) -> list[dict]:
    """Convert stored transcript (trimmed) + current message into OpenAI messages array."""
    messages: list[dict] = [{"role": "system", "content": system_prompt}]

    # Only keep the most recent window to limit token spend
    recent = history[-HISTORY_WINDOW:] if len(history) > HISTORY_WINDOW else history

    for entry in recent:
        if entry.get("speaker") == "student":
            messages.append({"role": "user", "content": entry["text"]})
        elif entry.get("speaker") == "agent":
            agent_text = " ".join(
                s["text"] for s in entry.get("segments", []) if s.get("text")
            )
            if agent_text:
                messages.append({"role": "assistant", "content": agent_text})

    if current_message == "__init__":
        messages.append({"role": "user", "content": "[Open the session — give the introduction and ask your first question.]"})
    else:
        messages.append({"role": "user", "content": current_message})

    return messages


# Module-level cache: session_id → last retrieval chunks
# Reused when the student's message is too short to improve retrieval
_chunk_cache: dict[str, list[dict]] = {}


async def run_course_agent(
    message: str,
    ctx: SessionContext,
    db: AsyncSession,
) -> tuple[CourseAgentResponse, list]:
    """Returns (response, save_turns) — caller must persist save_turns."""
    if _needs_fresh_retrieval(message):
        query = message if message != "__init__" else ctx.course_name
        chunks = await hybrid_retrieve(query=query, course_id=ctx.course_id, db=db)
        _chunk_cache[ctx.session_id] = chunks
    else:
        # Reuse last retrieved chunks — skip the embedding round-trip
        chunks = _chunk_cache.get(ctx.session_id) or await hybrid_retrieve(
            query=message, course_id=ctx.course_id, db=db
        )

    system_prompt = build_system_prompt(ctx, chunks)
    messages = build_messages(system_prompt, ctx.history, message)

    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        response_format={"type": "json_object"},
        temperature=0.3,
    )

    raw = response.choices[0].message.content
    parsed = json.loads(raw)
    segments = [
        ResponseSegment(text=s["text"], chunk_id=s.get("chunk_id"))
        for s in parsed.get("segments", [])
        if s.get("text")  # skip null/empty segments the LLM occasionally emits
    ]

    # Build transcript entries to persist — returned to caller for parallel saving
    if message != "__init__":
        save_turns = [
            {"speaker": "student", "text": message},
            {"speaker": "agent", "segments": [s.model_dump() for s in segments]},
        ]
    else:
        save_turns = [
            {"speaker": "agent", "segments": [s.model_dump() for s in segments]},
        ]

    return CourseAgentResponse(segments=segments, session_id=ctx.session_id), save_turns


async def _write_transcript(session_id: str, new_turns: list, db: AsyncSession):
    await db.execute(
        text("""
            UPDATE sessions
            SET transcript = COALESCE(transcript, '[]'::jsonb) || CAST(:new_turns AS jsonb)
            WHERE session_id = :session_id
        """),
        {
            "session_id": session_id,
            "new_turns": json.dumps(new_turns),
        },
    )
    await db.commit()
