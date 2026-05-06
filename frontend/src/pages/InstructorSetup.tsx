import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, FileText, ArrowRight, CheckCircle, Loader2, X,
  BookOpen, Send,
} from "lucide-react";
import { AgoraLogo } from "@/components/AgoraLogo";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const ACCEPTED = [".pdf", ".docx"];

type Phase =
  | "identity"      // enter name + email
  | "course_info"   // enter course name, subject, level
  | "upload"        // upload documents
  | "calibration"   // 3-question calibration chat
  | "rubric"        // review / edit rubric
  | "done";         // published — show course ID

interface CalibrationMessage {
  role: "user" | "assistant";
  content: string;
}

interface RubricConcept {
  name: string;
  definition: string;
  weight: "high" | "medium" | "low";
}

interface QuestionBank {
  recognition: string[];
  retrieval: string[];
  interpretation: string[];
}

interface Rubric {
  concepts: RubricConcept[];
  understanding_markers: string[];
  common_misconceptions: string[];
  questions?: QuestionBank;
}

const WEIGHT_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

export default function InstructorSetup() {
  const navigate = useNavigate();

  // identity
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [instructorId, setInstructorId] = useState("");

  // course info
  const [courseName, setCourseName] = useState("");
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState("undergraduate");
  const [courseId, setCourseId] = useState("");

  // upload
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedCount, setUploadedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // calibration
  const [calHistory, setCalHistory] = useState<CalibrationMessage[]>([]);
  const [calInput, setCalInput] = useState("");

  // rubric
  const [rubric, setRubric] = useState<Rubric | null>(null);

  const [phase, setPhase] = useState<Phase>("identity");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Helpers ──────────────────────────────────────────────────────────────

  const err = (msg: string) => { setError(msg); setLoading(false); };

  // ── Step handlers ─────────────────────────────────────────────────────────

  async function handleIdentity() {
    if (!name.trim() || !email.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_URL}/instructor/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setInstructorId(data.instructor_id);
      setPhase("course_info");
    } catch (e) {
      err("Could not create profile. Check the connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCourseInfo() {
    if (!courseName.trim() || !subject.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_URL}/instructor/course`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: courseName.trim(),
          subject: subject.trim(),
          level,
          instructor_id: instructorId,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCourseId(data.course_id);
      setPhase("upload");
    } catch (e) {
      err("Could not create course. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      ACCEPTED.some((ext) => f.name.toLowerCase().endsWith(ext))
    );
    setFiles((prev) => [...prev, ...dropped]);
  }

  async function handleUpload() {
    if (files.length === 0) return;
    setLoading(true); setError("");
    let count = 0;
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("instructor_id", instructorId);
        const res = await fetch(`${API_URL}/instructor/course/${courseId}/upload`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
        count++;
        setUploadedCount(count);
      }
      // Kick off calibration with first agent question
      await startCalibration();
    } catch (e: unknown) {
      err(e instanceof Error ? e.message : "Upload error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function startCalibration() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_URL}/instructor/course/${courseId}/calibrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "__start__", history: [] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCalHistory([{ role: "assistant", content: data.response }]);
      setPhase("calibration");
    } catch (e) {
      err("Could not start calibration. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCalibrationSend() {
    const msg = calInput.trim();
    if (!msg || loading) return;
    setCalInput("");
    const newHistory: CalibrationMessage[] = [...calHistory, { role: "user", content: msg }];
    setCalHistory(newHistory);
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_URL}/instructor/course/${courseId}/calibrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history: newHistory }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.rubric_ready) {
        setRubric(data.rubric);
        setCalHistory([...newHistory, { role: "assistant", content: data.response }]);
        setPhase("rubric");
      } else {
        setCalHistory([...newHistory, { role: "assistant", content: data.response }]);
      }
    } catch (e) {
      err("Error during calibration. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish() {
    if (!rubric) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_URL}/instructor/course/${courseId}/rubric`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubric }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPhase("done");
    } catch (e) {
      err("Could not save rubric. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function goToDashboard() {
    navigate(`/instructor/course/${courseId}`, {
      state: { instructorId, courseName, courseId },
    });
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const steps = ["Profile", "Course", "Upload", "Calibration", "Rubric"];
  const stepIndex = { identity: 0, course_info: 1, upload: 2, calibration: 3, rubric: 4, done: 4 };
  const activeStep = stepIndex[phase];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border px-6 py-3 flex items-center justify-between">
        <AgoraLogo href="/" size="md" />
        <span className="text-sm text-muted-foreground">Instructor setup</span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-start px-4 py-12">
        <div className="w-full max-w-xl space-y-8">

          {/* Stepper */}
          {phase !== "done" && (
            <div className="flex items-center justify-between">
              {steps.map((label, i) => (
                <div key={label} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border
                    ${i < activeStep ? "bg-primary text-primary-foreground border-primary"
                      : i === activeStep ? "border-primary text-primary"
                      : "border-border text-muted-foreground"}`}>
                    {i < activeStep ? <CheckCircle className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`text-xs hidden sm:inline ${i === activeStep ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                  {i < steps.length - 1 && <div className="flex-1 h-px bg-border mx-2 w-6 sm:w-10" />}
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {/* ── Phase: identity ── */}
          {phase === "identity" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold">Welcome, instructor</h1>
                <p className="text-muted-foreground mt-1 text-sm">Enter your details to get started or continue where you left off.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Full name</label>
                  <input
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Dr. Jane Smith"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleIdentity()}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email</label>
                  <input
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="jane@university.edu"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleIdentity()}
                  />
                </div>
              </div>
              <button
                onClick={handleIdentity}
                disabled={!name.trim() || !email.trim() || loading}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Continue
              </button>
            </div>
          )}

          {/* ── Phase: course_info ── */}
          {phase === "course_info" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold">Create a course</h1>
                <p className="text-muted-foreground mt-1 text-sm">This creates a reusable course that students can be assigned to.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Course name</label>
                  <input
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Linear Algebra — Chapter 4"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Subject</label>
                  <input
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Mathematics"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Level</label>
                  <select
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                  >
                    <option value="secondary">Secondary</option>
                    <option value="undergraduate">Undergraduate</option>
                    <option value="postgraduate">Postgraduate</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleCourseInfo}
                disabled={!courseName.trim() || !subject.trim() || loading}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Continue
              </button>
            </div>
          )}

          {/* ── Phase: upload ── */}
          {phase === "upload" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold">Upload course materials</h1>
                <p className="text-muted-foreground mt-1 text-sm">Upload the PDFs students will be examined on. You can upload multiple files.</p>
              </div>
              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onDrop={handleFileDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Drag & drop PDF or DOCX files here, or <span className="text-primary underline">browse</span></p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const selected = Array.from(e.target.files ?? []);
                    setFiles((prev) => [...prev, ...selected]);
                  }}
                />
              </div>

              {files.length > 0 && (
                <ul className="space-y-2">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border bg-card">
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm flex-1 truncate">{f.name}</span>
                      {i < uploadedCount
                        ? <CheckCircle className="w-4 h-4 text-green-500" />
                        : (
                          <button onClick={(e) => { e.stopPropagation(); setFiles(files.filter((_, j) => j !== i)); }}>
                            <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                          </button>
                        )
                      }
                    </li>
                  ))}
                </ul>
              )}

              <button
                onClick={handleUpload}
                disabled={files.length === 0 || loading}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing {uploadedCount}/{files.length}…</>
                  : <><ArrowRight className="w-4 h-4" /> Upload & continue</>
                }
              </button>
            </div>
          )}

          {/* ── Phase: calibration ── */}
          {phase === "calibration" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold">Calibration</h1>
                <p className="text-muted-foreground mt-1 text-sm">Answer 3 questions so Agora can build an accurate assessment profile for this course.</p>
              </div>

              <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                {calHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm leading-relaxed
                      ${msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm"}`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5">
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-end gap-2 rounded-2xl border border-border bg-card px-4 py-3 focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary/50">
                <textarea
                  rows={2}
                  className="flex-1 resize-none bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
                  placeholder="Type your answer…"
                  value={calInput}
                  onChange={(e) => setCalInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleCalibrationSend();
                    }
                  }}
                  disabled={loading}
                />
                <button
                  onClick={handleCalibrationSend}
                  disabled={!calInput.trim() || loading}
                  className="flex-shrink-0 p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Phase: rubric ── */}
          {phase === "rubric" && rubric && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold">Review your rubric</h1>
                <p className="text-muted-foreground mt-1 text-sm">Edit before publishing. You can refine it from the dashboard later.</p>
              </div>

              {/* Concepts */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Concepts</h2>
                {rubric.concepts.map((c, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <input
                        className="text-sm font-medium bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none flex-1"
                        value={c.name}
                        onChange={(e) => {
                          const updated = [...rubric.concepts];
                          updated[i] = { ...c, name: e.target.value };
                          setRubric({ ...rubric, concepts: updated });
                        }}
                      />
                      <select
                        className={`text-xs px-2 py-0.5 rounded-full border font-medium ${WEIGHT_COLORS[c.weight]}`}
                        value={c.weight}
                        onChange={(e) => {
                          const updated = [...rubric.concepts];
                          updated[i] = { ...c, weight: e.target.value as "high" | "medium" | "low" };
                          setRubric({ ...rubric, concepts: updated });
                        }}
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <textarea
                      rows={2}
                      className="w-full text-sm text-muted-foreground bg-transparent resize-none focus:outline-none border-b border-transparent hover:border-border focus:border-primary"
                      value={c.definition}
                      onChange={(e) => {
                        const updated = [...rubric.concepts];
                        updated[i] = { ...c, definition: e.target.value };
                        setRubric({ ...rubric, concepts: updated });
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Understanding markers */}
              <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Understanding markers</h2>
                <ul className="space-y-1.5">
                  {rubric.understanding_markers.map((m, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <BookOpen className="w-3.5 h-3.5 mt-0.5 text-primary flex-shrink-0" />
                      <input
                        className="text-sm flex-1 bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none"
                        value={m}
                        onChange={(e) => {
                          const updated = [...rubric.understanding_markers];
                          updated[i] = e.target.value;
                          setRubric({ ...rubric, understanding_markers: updated });
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </div>

              {/* Misconceptions */}
              <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Common misconceptions</h2>
                <ul className="space-y-1.5">
                  {rubric.common_misconceptions.map((m, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-amber-500 text-sm mt-0.5 flex-shrink-0">⚠</span>
                      <input
                        className="text-sm flex-1 bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none"
                        value={m}
                        onChange={(e) => {
                          const updated = [...rubric.common_misconceptions];
                          updated[i] = e.target.value;
                          setRubric({ ...rubric, common_misconceptions: updated });
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </div>

              {/* Question bank */}
              {rubric.questions && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Question bank</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Generated from your materials + calibration notes. The agent uses these as a backbone — edit or add freely.</p>
                  </div>
                  {(["recognition", "retrieval", "interpretation"] as const).map((phase) => {
                    const phaseLabels = { recognition: "Phase 1 — Recognition", retrieval: "Phase 2 — Retrieval", interpretation: "Phase 3 — Interpretation" };
                    const questions = rubric.questions![phase] ?? [];
                    return (
                      <div key={phase} className="space-y-2">
                        <h3 className="text-xs font-semibold text-foreground">{phaseLabels[phase]}</h3>
                        <div className="space-y-2">
                          {questions.map((q, qi) => (
                            <div key={qi} className="flex items-start gap-2">
                              <span className="text-xs text-muted-foreground mt-2 w-4 flex-shrink-0">{qi + 1}.</span>
                              <input
                                className="flex-1 text-sm rounded-lg border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                value={q}
                                onChange={(e) => {
                                  const updated = [...questions];
                                  updated[qi] = e.target.value;
                                  setRubric({ ...rubric, questions: { ...rubric.questions!, [phase]: updated } });
                                }}
                              />
                              <button
                                onClick={() => {
                                  const updated = questions.filter((_, j) => j !== qi);
                                  setRubric({ ...rubric, questions: { ...rubric.questions!, [phase]: updated } });
                                }}
                                className="mt-2 text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => {
                              const updated = [...questions, ""];
                              setRubric({ ...rubric, questions: { ...rubric.questions!, [phase]: updated } });
                            }}
                            className="text-xs text-primary hover:underline"
                          >
                            + Add question
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={handlePublish}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Publish course
              </button>
            </div>
          )}

          {/* ── Phase: done ── */}
          {phase === "done" && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">Course published</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  <span className="font-medium text-foreground">{courseName}</span> is ready for students.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-left space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Course ID (share with students)</p>
                <p className="font-mono text-sm break-all select-all">{courseId}</p>
              </div>
              <button
                onClick={goToDashboard}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                <ArrowRight className="w-4 h-4" />
                Go to dashboard
              </button>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
