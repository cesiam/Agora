import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { Send, Mic, MicOff, Square, LogOut, Loader2 } from "lucide-react";
import { AgoraLogo } from "@/components/AgoraLogo";
import { ChatWindow, type ChatMessage } from "@/components/ChatWindow";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface LocationState {
  courseId: string;
  studentId: string;
  title: string;
}

type RecordState = "idle" | "recording" | "processing";

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
  const [isThinking, setIsThinking] = useState(false);
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [isEnding, setIsEnding] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const silenceStartRef = useRef<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const addMessage = (speaker: ChatMessage["speaker"], text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), speaker, text },
    ]);
  };

  // Kick off the first agent message on mount
  useEffect(() => {
    if (!sessionId || !courseId || !studentId) return;
    sendMessage("Hello, I'm ready to begin.");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = async (text: string) => {
    if (!text.trim() || isThinking) return;
    addMessage("student", text);
    setInput("");
    setIsThinking(true);

    try {
      const res = await fetch(`${API_URL}/agents/course/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          session_id: sessionId,
          course_id: courseId,
          student_id: studentId,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const agentText = (data.segments as Array<{ text: string }>)
        .map((s) => s.text)
        .join(" ");
      addMessage("agent", agentText);
    } catch (err) {
      addMessage("agent", "Sorry, something went wrong. Please try again.");
      console.error(err);
    } finally {
      setIsThinking(false);
    }
  };

  const handleSend = () => sendMessage(input);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      silenceStartRef.current = Date.now();

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await submitVoice(blob);
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setRecordState("recording");
    } catch {
      alert("Microphone access denied.");
    }
  }, []);

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecordState("processing");
  };

  const submitVoice = async (blob: Blob) => {
    const silenceMs = Date.now() - silenceStartRef.current;
    const form = new FormData();
    form.append("audio", blob, "recording.webm");
    form.append("session_id", sessionId ?? "");
    form.append("course_id", courseId);
    form.append("student_id", studentId);
    form.append("silence_before_ms", String(silenceMs));

    setIsThinking(true);
    try {
      const res = await fetch(`${API_URL}/agents/course/voice`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const transcript = res.headers.get("X-Transcript") ?? "";
      const segmentsRaw = res.headers.get("X-Segments") ?? "[]";
      const segments: Array<{ text: string }> = JSON.parse(segmentsRaw);
      const agentText = segments.map((s) => s.text).join(" ");

      if (transcript) addMessage("student", transcript);
      if (agentText) addMessage("agent", agentText);

      // play audio response
      const audioBuf = await res.arrayBuffer();
      const audioCtx = new AudioContext();
      const decoded = await audioCtx.decodeAudioData(audioBuf);
      const source = audioCtx.createBufferSource();
      source.buffer = decoded;
      source.connect(audioCtx.destination);
      source.start();
    } catch (err) {
      addMessage("agent", "Sorry, I couldn't process that audio. Try typing instead.");
      console.error(err);
    } finally {
      setIsThinking(false);
      setRecordState("idle");
    }
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border px-6 py-3 flex items-center justify-between">
        <AgoraLogo href="/" size="md" />
        <div className="flex items-center gap-4">
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
      <div className="flex-shrink-0 border-t border-border px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-end gap-3">
          <div className="flex-1 flex items-end gap-2 rounded-2xl border border-border bg-card px-4 py-3 focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary/50">
            <textarea
              ref={textareaRef}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none max-h-32"
              placeholder="Type your answer…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isThinking || recordState !== "idle"}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isThinking || recordState !== "idle"}
              className="flex-shrink-0 p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* Voice button */}
          {recordState === "idle" && (
            <button
              onClick={startRecording}
              disabled={isThinking}
              className="flex-shrink-0 w-11 h-11 rounded-xl border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-40"
              title="Hold to record"
            >
              <Mic className="w-5 h-5" />
            </button>
          )}

          {recordState === "recording" && (
            <button
              onClick={stopRecording}
              className="flex-shrink-0 w-11 h-11 rounded-xl bg-red-500 text-white flex items-center justify-center animate-pulse"
              title="Stop recording"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          )}

          {recordState === "processing" && (
            <div className="flex-shrink-0 w-11 h-11 rounded-xl border border-border bg-card flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          )}

          {isThinking && recordState === "idle" && (
            <div className="flex-shrink-0 w-11 h-11 rounded-xl border border-border bg-card flex items-center justify-center">
              <MicOff className="w-5 h-5 text-muted-foreground/40" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
