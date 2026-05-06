import { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { Loader2, ChevronLeft, Tag } from "lucide-react";
import { AgoraLogo } from "@/components/AgoraLogo";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface LocationState {
  courseName?: string;
  instructorId?: string;
  courseId?: string;
}

interface TranscriptEntry {
  speaker: "student" | "agent";
  text?: string;
  segments?: Array<{ text: string; chunk_id?: string | null }>;
}

interface Insight {
  insight_type: string;
  description: string;
  source_quote: string;
  concept_tag: string;
  severity: string;
  created_at: string;
}

interface ReviewData {
  session: {
    session_id: string;
    session_mode: string;
    attempt: number;
    started_at: string;
    transcript: TranscriptEntry[] | null;
    student_name: string;
    student_email: string;
  };
  insights: Insight[];
}

const INSIGHT_COLORS: Record<string, { border: string; badge: string; dot: string }> = {
  strength: { border: "border-green-200", badge: "bg-green-100 text-green-700", dot: "bg-green-500" },
  knowledge_gap: { border: "border-amber-200", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  misconception: { border: "border-red-200", badge: "bg-red-100 text-red-700", dot: "bg-red-500" },
  reasoning_error: { border: "border-orange-200", badge: "bg-orange-100 text-orange-700", dot: "bg-orange-400" },
};

const SEVERITY_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-700 border border-red-200",
  medium: "bg-amber-100 text-amber-700 border border-amber-200",
  low: "bg-green-100 text-green-700 border border-green-200",
};

function getText(entry: TranscriptEntry): string {
  if (entry.text) return entry.text;
  if (entry.segments) return entry.segments.map((s) => s.text).join(" ");
  return "";
}

/** Returns the index of the insight whose source_quote best overlaps with a transcript turn, or -1. */
function matchInsight(turnText: string, insights: Insight[]): number {
  const lower = turnText.toLowerCase();
  return insights.findIndex((ins) => {
    const quote = ins.source_quote?.toLowerCase() ?? "";
    if (!quote) return false;
    // Check if ≥6 consecutive words of the quote appear in the turn
    const words = quote.split(/\s+/).filter(Boolean);
    if (words.length < 3) return lower.includes(quote);
    for (let i = 0; i <= words.length - 3; i++) {
      const chunk = words.slice(i, i + 3).join(" ");
      if (lower.includes(chunk)) return true;
    }
    return false;
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function SessionReview() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const state = location.state as LocationState | null;

  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedInsight, setSelectedInsight] = useState<number | null>(null);

  useEffect(() => {
    if (sessionId) fetchReview();
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchReview() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_URL}/instructor/session/${sessionId}/review`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch {
      setError("Could not load session review.");
    } finally {
      setLoading(false);
    }
  }

  const backTo = state?.courseId
    ? `/instructor/course/${state.courseId}`
    : "/instructor";
  const backState = state?.courseId
    ? { instructorId: state.instructorId, courseName: state.courseName, courseId: state.courseId }
    : undefined;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex-shrink-0 border-b border-border px-6 py-3 flex items-center justify-between">
        <AgoraLogo href="/" size="md" />
        <Link
          to={backTo}
          state={backState}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to dashboard
        </Link>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      ) : data && (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

          {/* ── Left: transcript ── */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {/* Session meta */}
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold">{data.session.student_name}</h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium capitalize">
                  {data.session.session_mode}
                </span>
                <span className="text-xs text-muted-foreground">Attempt #{data.session.attempt}</span>
              </div>
              <p className="text-sm text-muted-foreground">{formatDate(data.session.started_at)}</p>
            </div>

            {/* Transcript */}
            <div className="space-y-4">
              {(data.session.transcript ?? []).map((entry, i) => {
                const text = getText(entry);
                if (!text) return null;
                const insightIdx = entry.speaker === "student"
                  ? matchInsight(text, data.insights)
                  : -1;
                const insight = insightIdx >= 0 ? data.insights[insightIdx] : null;
                const colors = insight ? INSIGHT_COLORS[insight.insight_type] ?? INSIGHT_COLORS.knowledge_gap : null;
                const isHighlighted = selectedInsight === insightIdx && insightIdx >= 0;

                return (
                  <div key={i} className={`flex ${entry.speaker === "student" ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[75%] space-y-1">
                      <div
                        className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed transition-all
                          ${entry.speaker === "student"
                            ? `bg-primary/10 text-foreground rounded-br-sm
                               ${insight ? `border-2 ${colors!.border} cursor-pointer` : ""}`
                            : "bg-muted text-foreground rounded-bl-sm"
                          }
                          ${isHighlighted ? "ring-2 ring-primary/50" : ""}
                        `}
                        onClick={() => {
                          if (insightIdx >= 0) {
                            setSelectedInsight(isHighlighted ? null : insightIdx);
                          }
                        }}
                      >
                        {text}
                      </div>

                      {/* Inline insight chip */}
                      {insight && (
                        <button
                          onClick={() => setSelectedInsight(isHighlighted ? null : insightIdx)}
                          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition-all
                            ${colors!.badge} ${isHighlighted ? "opacity-100" : "opacity-70 hover:opacity-100"}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${colors!.dot}`} />
                          <Tag className="w-3 h-3" />
                          {insight.concept_tag} · {insight.insight_type.replace("_", " ")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Right: insights panel ── */}
          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border overflow-y-auto">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold">Session insights</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Click an insight to highlight the source quote in the transcript.</p>
            </div>

            {data.insights.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-muted-foreground">No insights generated yet. They appear after the session ends.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {data.insights.map((insight, i) => {
                  const colors = INSIGHT_COLORS[insight.insight_type] ?? INSIGHT_COLORS.knowledge_gap;
                  const isSelected = selectedInsight === i;
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedInsight(isSelected ? null : i)}
                      className={`w-full text-left px-4 py-3 space-y-2 transition-colors
                        ${isSelected ? "bg-muted/60" : "hover:bg-muted/30"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${colors.dot}`} />
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
                            {insight.insight_type.replace("_", " ")}
                          </span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${SEVERITY_BADGE[insight.severity] ?? ""}`}>
                          {insight.severity}
                        </span>
                      </div>

                      <p className="text-sm text-foreground leading-snug">{insight.description}</p>

                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground font-medium">{insight.concept_tag}</span>
                      </div>

                      {insight.source_quote && (
                        <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2 leading-relaxed">
                          "{insight.source_quote}"
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
