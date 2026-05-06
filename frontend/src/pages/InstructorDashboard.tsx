import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, useNavigate, Link } from "react-router-dom";
import {
  Send, Loader2, TrendingUp, TrendingDown, Minus,
  ChevronDown, ChevronRight, MessageSquare, Users, BookOpen,
  AlertTriangle, Plus,
} from "lucide-react";
import { AgoraLogo } from "@/components/AgoraLogo";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface LocationState {
  instructorId: string;
  courseName?: string;
}

interface MasteryEntry {
  concept_tag: string;
  current_severity: string;
  trajectory: string;
  attempts: number;
  updated_at: string;
}

interface SessionEntry {
  session_id: string;
  session_mode: string;
  attempt: number;
  started_at: string;
}

interface Student {
  student_id: string;
  name: string;
  email: string;
  mastery: MasteryEntry[];
  sessions: SessionEntry[];
}

interface ClassInsight {
  concept_tag: string;
  pattern_description: string;
  student_count: number;
  session_count: number;
  last_updated: string;
}

interface DashboardData {
  course: { course_id: string; name: string; subject: string; level: string };
  class_insights: ClassInsight[];
  students: Student[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SEVERITY_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-700 border border-red-200",
  medium: "bg-amber-100 text-amber-700 border border-amber-200",
  low: "bg-green-100 text-green-700 border border-green-200",
};

function TrajectoryIcon({ value }: { value: string }) {
  if (value === "improving") return <TrendingUp className="w-3.5 h-3.5 text-green-600" />;
  if (value === "regressing") return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function InstructorDashboard() {
  const { courseId } = useParams<{ courseId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const instructorId = state?.instructorId ?? "";

  const [data, setData] = useState<DashboardData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState("");

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Per-student expanded state
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
  const [activeView, setActiveView] = useState<"class" | "students">("class");

  useEffect(() => {
    if (courseId) fetchDashboard();
  }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function fetchDashboard() {
    setLoadingData(true); setDataError("");
    try {
      const res = await fetch(`${API_URL}/instructor/course/${courseId}/dashboard`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch {
      setDataError("Could not load dashboard data.");
    } finally {
      setLoadingData(false);
    }
  }

  async function sendChatMessage() {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(newMessages);
    setChatLoading(true);
    try {
      const res = await fetch(`${API_URL}/instructor/course/${courseId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, instructor_id: instructorId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setChatMessages([...newMessages, { role: "assistant", content: json.response }]);
    } catch {
      setChatMessages([...newMessages, { role: "assistant", content: "Sorry, something went wrong. Try again." }]);
    } finally {
      setChatLoading(false);
    }
  }

  function toggleStudent(id: string) {
    setExpandedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const courseName = data?.course.name ?? state?.courseName ?? "Course";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border px-6 py-3 flex items-center justify-between">
        <AgoraLogo href="/" size="md" />
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-foreground truncate max-w-xs hidden sm:block">{courseName}</span>
          <button
            onClick={() => navigate("/instructor")}
            className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors"
          >
            All courses
          </button>
          <Link
            to="/instructor/setup"
            state={{ instructorId }}
            className="flex items-center gap-1.5 text-xs text-primary font-medium border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New course
          </Link>
        </div>
      </header>

      {loadingData ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : dataError ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-destructive text-sm">{dataError}</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

          {/* ── Left: data panels ── */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 lg:border-r border-border">

            {/* View toggle */}
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
              <button
                onClick={() => setActiveView("class")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                  ${activeView === "class" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <BookOpen className="w-3.5 h-3.5" /> Class overview
              </button>
              <button
                onClick={() => setActiveView("students")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                  ${activeView === "students" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Users className="w-3.5 h-3.5" /> Students ({data?.students.length ?? 0})
              </button>
            </div>

            {/* ── CLASS VIEW ── */}
            {activeView === "class" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Class-level concept health</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Aggregated from all session insights across the cohort.</p>
                </div>

                {(!data?.class_insights || data.class_insights.length === 0) ? (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center">
                    <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No sessions completed yet. Insights will appear after students finish sessions.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.class_insights.map((insight, i) => (
                      <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-medium text-sm">{insight.concept_tag}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" /> {insight.student_count} students
                            </span>
                            <span>{insight.session_count} sessions</span>
                          </div>
                        </div>
                        {insight.pattern_description && (
                          <p className="text-sm text-muted-foreground">{insight.pattern_description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">Last updated {formatDate(insight.last_updated)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── STUDENTS VIEW ── */}
            {activeView === "students" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Per-student mastery</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Click a student to expand their concept trajectory.</p>
                </div>

                {(!data?.students || data.students.length === 0) ? (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center">
                    <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No students have completed sessions on this course yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.students.map((student) => {
                      const isExpanded = expandedStudents.has(student.student_id);
                      return (
                        <div key={student.student_id} className="rounded-xl border border-border bg-card overflow-hidden">
                          <button
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                            onClick={() => toggleStudent(student.student_id)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
                                {student.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-medium">{student.name}</p>
                                <p className="text-xs text-muted-foreground">{student.sessions.length} session{student.sessions.length !== 1 ? "s" : ""}</p>
                              </div>
                            </div>
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          </button>

                          {isExpanded && (
                            <div className="border-t border-border px-4 py-4 space-y-4">
                              {/* Mastery table */}
                              {student.mastery.length > 0 ? (
                                <div className="space-y-2">
                                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Concept mastery</h4>
                                  <div className="space-y-1.5">
                                    {student.mastery.map((m, mi) => (
                                      <div key={mi} className="flex items-center justify-between gap-3 text-sm">
                                        <span className="flex-1 text-muted-foreground truncate">{m.concept_tag}</span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          <TrajectoryIcon value={m.trajectory} />
                                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_BADGE[m.current_severity] ?? "bg-muted text-muted-foreground"}`}>
                                            {m.current_severity}
                                          </span>
                                          <span className="text-xs text-muted-foreground">{m.attempts}×</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">No mastery data yet.</p>
                              )}

                              {/* Sessions list */}
                              {student.sessions.length > 0 && (
                                <div className="space-y-2">
                                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Session history</h4>
                                  <div className="space-y-1">
                                    {student.sessions.map((s) => (
                                      <Link
                                        key={s.session_id}
                                        to={`/instructor/session/${s.session_id}`}
                                        state={{ courseName, instructorId, courseId }}
                                        className="flex items-center justify-between text-sm rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors group"
                                      >
                                        <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                                          {formatDate(s.started_at)} · {s.session_mode} #{s.attempt}
                                        </span>
                                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                      </Link>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right: Instructor chat ── */}
          <div className="w-full lg:w-96 flex flex-col border-t lg:border-t-0 border-border bg-card/30">
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Ask Agora</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Ask about students, concepts, or lesson planning.</p>
            </div>

            {/* Suggestions */}
            {chatMessages.length === 0 && (
              <div className="p-4 space-y-2">
                {[
                  "What should I review in my upcoming lesson?",
                  "Which concepts are students struggling with most?",
                  "Help me adjust the rubric based on what I'm seeing.",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => { setChatInput(suggestion); }}
                    className="w-full text-left text-xs text-muted-foreground border border-border rounded-lg px-3 py-2 hover:border-primary/50 hover:text-foreground transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap
                    ${msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
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
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-border">
              <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary/50">
                <textarea
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground max-h-24"
                  placeholder="Ask anything about this course…"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage();
                    }
                  }}
                  disabled={chatLoading}
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim() || chatLoading}
                  className="flex-shrink-0 p-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
