import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import {
  Send, Mic, LogOut, Loader2, Volume2,
  FileText, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { AgoraLogo } from "@/components/AgoraLogo";
import { ChatWindow, type ChatMessage } from "@/components/ChatWindow";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

interface LocationState {
  courseId: string;
  studentId: string;
  studentName: string;
  courseName: string;
  attempt: number;
  rubric: { concepts?: Array<{ name: string; definition: string; weight?: string }> } | null;
  documents: Array<{ document_id: string; filename: string }>;
}

interface MasteryEntry {
  concept_tag: string;
  current_severity: string;
  trajectory: string;
  attempts: number;
}

interface ChunkRef {
  chunk_id: string;
  text: string;
  page?: number;
}

const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
    : null;

const initializedEnrolledSessions = new Set<string>();

async function playAudioBuffer(buffer: ArrayBuffer): Promise<void> {
  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(buffer);
  return new Promise((resolve) => {
    const source = audioCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(audioCtx.destination);
    source.onended = () => resolve();
    source.start();
  });
}

function severityToPercent(severity: string): number {
  return { low: 85, medium: 52, high: 22 }[severity] ?? 0;
}

function TrajectoryIcon({ value }: { value: string }) {
  if (value === "improving") return <TrendingUp className="w-3 h-3 text-green-500" />;
  if (value === "regressing") return <TrendingDown className="w-3 h-3 text-red-500" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

export default function EnrolledSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const courseId = state?.courseId ?? "";
  const studentId = state?.studentId ?? "";
  const studentName = state?.studentName ?? "";
  const courseName = state?.courseName ?? "Session";
  const concepts = state?.rubric?.concepts ?? [];

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  // Recording
  type RecordState = "idle" | "recording";
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const stoppedByUserRef = useRef(false);
  const finalTranscriptRef = useRef("");
  const sendMessageRef = useRef<(t: string) => void>(() => {});

  // Left panel — live mastery (fetched + updated from API)
  const [mastery, setMastery] = useState<MasteryEntry[]>([]);

  // Right panel — most recent cited chunk
  const [activeChunk, setActiveChunk] = useState<ChunkRef | null>(null);
  const [chunkLoading, setChunkLoading] = useState(false);

  const addMessage = (speaker: ChatMessage["speaker"], text: string) =>
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), speaker, text }]);

  // Fetch mastery on mount
  useEffect(() => {
    if (courseId && studentId) fetchMastery();
  }, [courseId, studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchMastery() {
    try {
      const res = await fetch(`${API_URL}/enrolled/course/${courseId}/student/${studentId}/mastery`);
      if (!res.ok) return;
      const data = await res.json();
      setMastery(data.mastery);
    } catch { /* silent */ }
  }

  // Fetch the cited chunk and surface it in the right panel
  async function showChunk(chunkId: string) {
    if (!chunkId) return;
    setChunkLoading(true);
    try {
      const res = await fetch(`${API_URL}/enrolled/chunk/${chunkId}`);
      if (!res.ok) return;
      const data = await res.json();
      setActiveChunk({ chunk_id: chunkId, text: data.text, page: data.page });
    } catch { /* silent */ } finally {
      setChunkLoading(false);
    }
  }

  const handleAudioResponse = async (res: Response) => {
    const segmentsRaw = res.headers.get("X-Segments") ?? "[]";
    const segments: Array<{ text: string; chunk_id?: string | null }> = JSON.parse(segmentsRaw);
    const agentText = segments.map((s) => s.text).join(" ");
    if (agentText) addMessage("agent", agentText);
    setIsThinking(false);

    // Surface the first cited chunk in the right panel
    const cited = segments.find((s) => s.chunk_id);
    if (cited?.chunk_id) showChunk(cited.chunk_id);

    try {
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 0) {
        setIsPlaying(true);
        await playAudioBuffer(buf);
        setIsPlaying(false);
      }
    } catch {
      setIsPlaying(false);
    }
  };

  // Init session
  useEffect(() => {
    if (!sessionId || !courseId || !studentId) return;
    if (initializedEnrolledSessions.has(sessionId)) return;
    initializedEnrolledSessions.add(sessionId);
    initSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function initSession() {
    setIsThinking(true);
    try {
      const res = await fetch(`${API_URL}/agents/course/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "__init__", session_id: sessionId, course_id: courseId, student_id: studentId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await handleAudioResponse(res);
    } catch (err) {
      addMessage("agent", "Hello! I'm ready to begin your session.");
      setIsThinking(false);
      console.error(err);
    }
  }

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isThinking) return;
    addMessage("student", trimmed);
    setInput("");
    setIsThinking(true);
    try {
      const res = await fetch(`${API_URL}/agents/course/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, session_id: sessionId, course_id: courseId, student_id: studentId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await handleAudioResponse(res);
    } catch (err) {
      addMessage("agent", "Sorry, something went wrong. Please try again.");
      setIsThinking(false);
      console.error(err);
    }
  };

  useEffect(() => { sendMessageRef.current = sendMessage; });

  // ── Speech recognition ──────────────────────────────────────────────────────
  const spawnRecognition = useCallback(() => {
    if (!SpeechRecognitionAPI) return;
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalTranscriptRef.current += r[0].transcript + " ";
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
      setInput(finalTranscriptRef.current);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech") return;
      stoppedByUserRef.current = true;
      setRecordState("idle"); setInterim("");
    };

    recognition.onend = () => {
      setInterim("");
      if (stoppedByUserRef.current) {
        setRecordState("idle");
        const final = finalTranscriptRef.current.trim();
        if (final) { sendMessageRef.current(final); setInput(""); finalTranscriptRef.current = ""; }
      } else {
        try { spawnRecognition(); } catch { setRecordState("idle"); }
      }
    };
    try { recognition.start(); recognitionRef.current = recognition; }
    catch { setRecordState("idle"); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startRecording = useCallback(() => {
    if (!SpeechRecognitionAPI) { alert("Speech recognition not supported. Use Chrome or Edge."); return; }
    stoppedByUserRef.current = false;
    finalTranscriptRef.current = "";
    setInput(""); setInterim(""); setRecordState("recording");
    spawnRecognition();
  }, [spawnRecognition]);

  const stopRecording = useCallback(() => {
    stoppedByUserRef.current = true;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const handleEndSession = async () => {
    if (!sessionId || isEnding) return;
    setIsEnding(true);
    try {
      await fetch(`${API_URL}/agents/insights/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, student_id: studentId, course_id: courseId }),
      });
    } catch { /* still navigate */ }
    navigate(`/enrolled/course/${courseId}`, {
      state: { studentId, studentName, courseId, courseName, rubric: state?.rubric, documents: state?.documents },
    });
  };

  const busy = isThinking || isPlaying;
  const micActive = recordState === "recording";

  // Build mastery map
  const masteryMap: Record<string, MasteryEntry> = {};
  mastery.forEach((m) => { masteryMap[m.concept_tag] = m; });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border px-4 py-2.5 flex items-center justify-between">
        <AgoraLogo href="/" size="sm" />
        <div className="flex items-center gap-3">
          {isPlaying && (
            <span className="flex items-center gap-1 text-xs text-primary font-medium">
              <Volume2 className="w-3.5 h-3.5" /> Speaking…
            </span>
          )}
          <span className="text-sm font-medium text-foreground truncate max-w-[160px] hidden sm:block">{courseName}</span>
          <button
            onClick={handleEndSession}
            disabled={isEnding}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
          >
            {isEnding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            End session
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">

        {/* ── Left panel: concept mastery ── */}
        <div className="hidden lg:flex w-56 flex-shrink-0 flex-col border-r border-border bg-card/30 overflow-y-auto">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Concepts</p>
          </div>
          <ul className="flex-1 divide-y divide-border/60">
            {concepts.map((concept, i) => {
              const m = masteryMap[concept.name];
              const pct = m ? severityToPercent(m.current_severity) : 0;
              return (
                <li key={i} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-medium leading-tight truncate flex-1">{concept.name}</span>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {m && <TrajectoryIcon value={m.trajectory} />}
                      <span className={`text-xs tabular-nums font-semibold
                        ${pct === 0 ? "text-muted-foreground"
                          : pct < 40 ? "text-red-500"
                          : pct < 70 ? "text-amber-500"
                          : "text-primary"}`}>
                        {pct > 0 ? `${pct}%` : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500
                        ${pct === 0 ? "bg-muted-foreground/20"
                          : pct < 40 ? "bg-red-500"
                          : pct < 70 ? "bg-amber-500"
                          : "bg-primary"}`}
                      style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* ── Middle: chat ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ChatWindow messages={messages} isThinking={isThinking} />

          {/* Input bar */}
          <div className="flex-shrink-0 border-t border-border bg-card/50 px-4 py-3">
            <div className="max-w-2xl mx-auto space-y-2">
              <div className="flex justify-center">
                <button
                  onClick={micActive ? stopRecording : startRecording}
                  disabled={busy}
                  className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all
                    disabled:opacity-40 disabled:cursor-not-allowed
                    ${micActive
                      ? "bg-red-500 text-white shadow-lg shadow-red-500/30 scale-110"
                      : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md hover:scale-105"
                    }`}
                >
                  <Mic className={`w-5 h-5 ${micActive ? "animate-pulse" : ""}`} />
                  {micActive && <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />}
                </button>
              </div>
              <div className={`flex items-end gap-2 rounded-xl border bg-card px-3 py-2.5 transition-all
                ${micActive ? "border-red-400 ring-1 ring-red-400/30" : "border-border focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary/50"}`}>
                <textarea
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground max-h-24"
                  placeholder={micActive ? interim || "Listening…" : "Or type your answer…"}
                  value={micActive ? input + interim : input}
                  onChange={(e) => !micActive && setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
                  }}
                  disabled={busy || micActive}
                  readOnly={micActive}
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || busy || micActive}
                  className="flex-shrink-0 p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right panel: reference material ── */}
        <div className="hidden xl:flex w-64 flex-shrink-0 flex-col border-l border-border bg-card/30 overflow-y-auto">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source material</p>
            <p className="text-xs text-muted-foreground mt-0.5">Updates as agent cites content</p>
          </div>

          {chunkLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : activeChunk ? (
            <div className="p-4 space-y-2">
              {activeChunk.page && (
                <p className="text-xs text-muted-foreground font-medium">Page {activeChunk.page}</p>
              )}
              <p className="text-xs leading-relaxed text-foreground bg-primary/5 border border-primary/20 rounded-lg p-3">
                {activeChunk.text}
              </p>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <p className="text-xs text-muted-foreground">Relevant passages from your course material will appear here as the session progresses.</p>
              {state?.documents && state.documents.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Course files</p>
                  {state.documents.map((doc) => (
                    <div key={doc.document_id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{doc.filename}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
