import { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { Loader2, Play, FileText, TrendingUp, TrendingDown, Minus, Clock } from "lucide-react";
import { AgoraLogo } from "@/components/AgoraLogo";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface LocationState {
  studentId: string;
  studentName: string;
  courseName: string;
  subject: string;
  rubric: { concepts?: Array<{ name: string; definition: string; weight?: string }> } | null;
  documents: Array<{ document_id: string; filename: string }>;
}

interface MasteryEntry {
  concept_tag: string;
  current_severity: string;
  trajectory: string;
  attempts: number;
}

interface SessionEntry {
  session_id: string;
  session_mode: string;
  attempt: number;
  started_at: string;
}

function severityToPercent(severity: string): number {
  return { low: 85, medium: 52, high: 22 }[severity] ?? 0;
}

function TrajectoryIcon({ value }: { value: string }) {
  if (value === "improving") return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
  if (value === "regressing") return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

function ProgressBar({ pct, weight }: { pct: number; weight?: string }) {
  const color =
    pct === 0 ? "bg-muted-foreground/30"
    : pct < 40 ? "bg-red-500"
    : pct < 70 ? "bg-amber-500"
    : "bg-primary";
  const heightClass = weight === "high" ? "h-3" : weight === "medium" ? "h-2.5" : "h-2";
  return (
    <div className={`w-full bg-border rounded-full overflow-hidden ${heightClass}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }}
      />
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function StudentCourseDashboard() {
  const { courseId } = useParams<{ courseId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const studentId = state?.studentId ?? "";
  const studentName = state?.studentName ?? "";
  const courseName = state?.courseName ?? "Course";
  const rubric = state?.rubric;
  const documents = state?.documents ?? [];
  const concepts = rubric?.concepts ?? [];

  const [mastery, setMastery] = useState<MasteryEntry[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loadingMastery, setLoadingMastery] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (courseId && studentId) fetchMastery();
  }, [courseId, studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchMastery() {
    setLoadingMastery(true);
    try {
      const res = await fetch(`${API_URL}/enrolled/course/${courseId}/student/${studentId}/mastery`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMastery(data.mastery);
      setSessions(data.sessions);
    } catch {
      // mastery just stays empty — no sessions yet
    } finally {
      setLoadingMastery(false);
    }
  }

  async function startSession() {
    if (!courseId || !studentId || starting) return;
    setStarting(true); setError("");
    try {
      const res = await fetch(`${API_URL}/enrolled/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: studentId, course_id: courseId, session_mode: "practice" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      navigate(`/enrolled/session/${data.session_id}`, {
        state: {
          courseId,
          studentId,
          studentName,
          courseName,
          rubric,
          documents,
          attempt: data.attempt,
        },
      });
    } catch {
      setError("Could not start session. Try again.");
    } finally {
      setStarting(false);
    }
  }

  // Build per-concept mastery map
  const masteryMap: Record<string, MasteryEntry> = {};
  mastery.forEach((m) => { masteryMap[m.concept_tag] = m; });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex-shrink-0 border-b border-border px-6 py-3 flex items-center justify-between">
        <AgoraLogo href="/" size="md" />
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground hidden sm:block">{studentName}</span>
          <button
            onClick={() => navigate("/enrolled")}
            className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors"
          >
            Change course
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* ── Left: concept mastery list ── */}
        <div className="w-full lg:w-72 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-card/30 overflow-y-auto">
          <div className="px-5 py-5 border-b border-border">
            <h2 className="font-semibold text-base">{courseName}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{state?.subject}</p>
          </div>

          {loadingMastery ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : concepts.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-muted-foreground">No concepts defined for this course yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {concepts.map((concept, i) => {
                const m = masteryMap[concept.name];
                const pct = m ? severityToPercent(m.current_severity) : 0;
                const label = m ? `${pct}%` : "Not tested";

                return (
                  <li key={i} className="px-5 py-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug">{concept.name}</p>
                        {concept.weight && (
                          <span className={`text-xs font-medium mt-0.5 inline-block
                            ${concept.weight === "high" ? "text-red-500" : concept.weight === "medium" ? "text-amber-500" : "text-muted-foreground"}`}>
                            {concept.weight} weight
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                        {m && <TrajectoryIcon value={m.trajectory} />}
                        <span className={`text-xs font-semibold tabular-nums
                          ${pct === 0 ? "text-muted-foreground"
                            : pct < 40 ? "text-red-500"
                            : pct < 70 ? "text-amber-500"
                            : "text-primary"}`}>
                          {label}
                        </span>
                      </div>
                    </div>
                    <ProgressBar pct={pct} weight={concept.weight} />
                    {m && (
                      <p className="text-xs text-muted-foreground">{m.attempts} session{m.attempts !== 1 ? "s" : ""}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Right: main content ── */}
        <div className="flex-1 flex flex-col overflow-y-auto px-6 py-8 space-y-8">

          {/* Course hero */}
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold">{courseName}</h1>
              <p className="text-muted-foreground text-sm mt-1">
                {sessions.length === 0
                  ? "You haven't started any sessions yet. Begin your first practice session below."
                  : `${sessions.length} session${sessions.length !== 1 ? "s" : ""} completed.`}
              </p>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <button
              onClick={startSession}
              disabled={starting}
              className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Start practice session
            </button>
          </div>

          {/* Course materials */}
          {documents.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Course materials</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {documents.map((doc) => (
                  <div key={doc.document_id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                    <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm truncate">{doc.filename}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Session history */}
          {sessions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Session history</h2>
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div key={s.session_id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium capitalize">{s.session_mode} — Attempt #{s.attempt}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(s.started_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
