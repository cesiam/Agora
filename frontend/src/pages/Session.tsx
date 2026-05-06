import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { Send, Mic, LogOut, Loader2, Volume2 } from "lucide-react";
import { AgoraLogo } from "@/components/AgoraLogo";
import { ChatWindow, type ChatMessage } from "@/components/ChatWindow";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// Extend window for webkit-prefixed Speech API
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

interface LocationState {
  courseId: string;
  studentId: string;
  title: string;
}

type RecordState = "idle" | "recording";

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

const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
    : null;

// Module-level guard: persists across React Strict Mode's remount cycle
// (useRef resets on remount, but module scope does not).
const initializedSessions = new Set<string>();

export default function Session() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const courseId = state?.courseId ?? "";
  const studentId = state?.studentId ?? "";
  const title = state?.title ?? "Session";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState(""); // live speech-to-text preview
  const [isThinking, setIsThinking] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [isEnding, setIsEnding] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const stoppedByUserRef = useRef(false);
  const finalTranscriptRef = useRef("");
  const sendMessageRef = useRef<(t: string) => void>(() => {});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const addMessage = (speaker: ChatMessage["speaker"], text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), speaker, text },
    ]);
  };

  const handleAudioResponse = async (res: Response) => {
    const segmentsRaw = res.headers.get("X-Segments") ?? "[]";
    const segments: Array<{ text: string }> = JSON.parse(segmentsRaw);
    const agentText = segments.map((s) => s.text).join(" ");
    if (agentText) addMessage("agent", agentText);

    // Text is in chat — hide thinking dots before audio starts
    setIsThinking(false);

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

  // Agent opens the conversation — no student message shown.
  // Module-level set guards against React Strict Mode's fresh-instance remount.
  useEffect(() => {
    if (!sessionId || !courseId || !studentId) return;
    if (initializedSessions.has(sessionId)) return;
    initializedSessions.add(sessionId);
    initSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const initSession = async () => {
    setIsThinking(true);
    try {
      const res = await fetch(`${API_URL}/agents/course/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "__init__",
          session_id: sessionId,
          course_id: courseId,
          student_id: studentId,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await handleAudioResponse(res);
    } catch (err) {
      addMessage("agent", "Hello! I'm ready to begin your session.");
      setIsThinking(false);
      console.error(err);
    }
  };

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
        body: JSON.stringify({
          message: trimmed,
          session_id: sessionId,
          course_id: courseId,
          student_id: studentId,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await handleAudioResponse(res);
    } catch (err) {
      addMessage("agent", "Sorry, something went wrong. Please try again.");
      setIsThinking(false);
      console.error(err);
    }
  };

  // Keep a stable ref so speech recognition callbacks always call the latest sendMessage
  useEffect(() => { sendMessageRef.current = sendMessage; });

  const handleSend = () => sendMessage(input);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Speech recognition ──────────────────────────────────────────────────────

  const spawnRecognition = useCallback(() => {
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.continuous = false;    // simpler restart loop than continuous=true
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          finalTranscriptRef.current += r[0].transcript + " ";
        } else {
          interim += r[0].transcript;
        }
      }
      setInterim(interim);
      setInput(finalTranscriptRef.current);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech") return; // harmless — we'll restart below
      console.error("Speech recognition error:", event.error);
      stoppedByUserRef.current = true;
      setRecordState("idle");
      setInterim("");
    };

    recognition.onend = () => {
      setInterim("");
      if (stoppedByUserRef.current) {
        // User pressed the button — finalise and send
        setRecordState("idle");
        const final = finalTranscriptRef.current.trim();
        if (final) {
          sendMessageRef.current(final);
          setInput("");
          finalTranscriptRef.current = "";
        }
      } else {
        // Chrome auto-stopped — restart to keep listening
        try {
          spawnRecognition();
        } catch {
          setRecordState("idle");
        }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.error("Recognition start failed:", err);
      setRecordState("idle");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startRecording = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge, or type your answer.");
      return;
    }
    stoppedByUserRef.current = false;
    finalTranscriptRef.current = "";
    setInput("");
    setInterim("");
    setRecordState("recording");
    spawnRecognition();
  }, [spawnRecognition]);

  const stopRecording = useCallback(() => {
    stoppedByUserRef.current = true;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const toggleRecording = () => {
    if (busy) return;
    if (recordState === "idle") startRecording();
    else stopRecording();
  };

  const handleEndSession = async () => {
    if (!sessionId || !courseId || !studentId || isEnding) return;
    setIsEnding(true);
    try {
      await fetch(`${API_URL}/agents/insights/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          student_id: studentId,
          course_id: courseId,
        }),
      });
    } catch {
      // still navigate even if insights fails
    }
    navigate("/");
  };

  const busy = isThinking || isPlaying;
  const micActive = recordState === "recording";

  // Placeholder shows live interim speech while recording, otherwise default hint
  const textPlaceholder = micActive
    ? interim || "Listening…"
    : "Or type your answer…";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border px-6 py-3 flex items-center justify-between">
        <AgoraLogo href="/" size="md" />
        <div className="flex items-center gap-4">
          {isPlaying && (
            <span className="flex items-center gap-1.5 text-xs text-primary font-medium">
              <Volume2 className="w-3.5 h-3.5" />
              Speaking…
            </span>
          )}
          <span className="hidden sm:block text-sm font-medium text-foreground truncate max-w-xs">
            {title}
          </span>
          <button
            onClick={handleEndSession}
            disabled={isEnding}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
          >
            {isEnding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            End session
          </button>
        </div>
      </header>

      {/* Chat */}
      <ChatWindow messages={messages} isThinking={isThinking} />

      {/* Input bar */}
      <div className="flex-shrink-0 border-t border-border bg-card/50 px-4 py-4">
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Mic button */}
          <div className="flex justify-center">
            <button
              onClick={toggleRecording}
              disabled={busy}
              title={micActive ? "Stop recording" : "Start recording"}
              className={`
                relative w-16 h-16 rounded-full flex items-center justify-center transition-all
                disabled:opacity-40 disabled:cursor-not-allowed
                ${micActive
                  ? "bg-red-500 text-white shadow-lg shadow-red-500/30 scale-110"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md hover:scale-105"
                }
              `}
            >
              <Mic className={`w-6 h-6 ${micActive ? "animate-pulse" : ""}`} />
              {micActive && (
                <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />
              )}
            </button>
          </div>

          {/* Text input */}
          <div className={`flex items-end gap-2 rounded-2xl border bg-card px-4 py-3 transition-all ${
            micActive
              ? "border-red-400 ring-2 ring-red-400/30"
              : "border-border focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary/50"
          }`}>
            <textarea
              ref={textareaRef}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none max-h-32"
              placeholder={textPlaceholder}
              value={micActive ? input + interim : input}
              onChange={(e) => !micActive && setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={busy || micActive}
              readOnly={micActive}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || busy || micActive}
              className="flex-shrink-0 p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {micActive && (
            <p className="text-center text-xs text-muted-foreground">
              Press the mic again to stop and send
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
