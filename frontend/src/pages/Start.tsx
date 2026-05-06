import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, ArrowRight, CheckCircle, Loader2, X } from "lucide-react";
import { AgoraLogo } from "@/components/AgoraLogo";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

type Phase = "idle" | "uploading" | "ready";

interface Concept {
  name: string;
  definition: string;
}

const ACCEPTED = [".pdf", ".docx"];

function isAccepted(file: File) {
  return ACCEPTED.some((ext) => file.name.toLowerCase().endsWith(ext));
}

export default function Start() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [progressMsg, setProgressMsg] = useState("");
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [sessionData, setSessionData] = useState<{
    sessionId: string;
    courseId: string;
    studentId: string;
    title: string;
  } | null>(null);
  const [error, setError] = useState("");

  const canSubmit = selectedFiles.length > 0 || pastedText.trim().length > 0;

  const addFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    const valid = list.filter(isAccepted);
    const rejected = list.length - valid.length;
    if (rejected > 0) setError(`${rejected} file(s) skipped — only PDF and DOCX are supported.`);
    else setError("");

    if (valid.length === 0) return;
    setSelectedFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      const deduped = valid.filter((f) => !existing.has(f.name));
      return [...prev, ...deduped];
    });
    setPastedText("");
  };

  const removeFile = (name: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setPhase("uploading");
    setError("");
    setConcepts([]);

    const form = new FormData();
    if (selectedFiles.length > 0) {
      for (const file of selectedFiles) form.append("files", file);
    } else {
      form.append("text_content", pastedText);
    }

    try {
      const res = await fetch(`${API_URL}/sessions/setup`, {
        method: "POST",
        body: form,
      });

      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line);
          } catch {
            continue; // skip non-JSON lines
          }
          if (event.type === "progress") {
            setProgressMsg(event.message as string);
          } else if (event.type === "concept") {
            setConcepts((prev) => [...prev, event.concept as Concept]);
          } else if (event.type === "complete") {
            setSessionData({
              sessionId: event.sessionId as string,
              courseId: event.courseId as string,
              studentId: event.studentId as string,
              title: event.title as string,
            });
            setPhase("ready");
          } else if (event.type === "error") {
            throw new Error(event.message as string);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("idle");
    }
  };

  const handleStart = () => {
    if (sessionData) {
      navigate(`/session/${sessionData.sessionId}`, {
        state: {
          courseId: sessionData.courseId,
          studentId: sessionData.studentId,
          title: sessionData.title,
        },
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-6 py-4">
        <AgoraLogo href="/" size="md" />
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          <div className="mb-10 text-center">
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">
              Start a session
            </h1>
            <p className="text-muted-foreground">
              Upload one or more PDFs or DOCX files — Agora will build a session around them.
            </p>
          </div>

          {phase === "idle" && (
            <div className="space-y-6">
              {/* Drop zone */}
              <div
                className={`rounded-2xl border-2 border-dashed transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : selectedFiles.length > 0
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && addFiles(e.target.files)}
                />

                {selectedFiles.length > 0 ? (
                  <div className="p-4 space-y-2">
                    {selectedFiles.map((file) => (
                      <div key={file.name} className="flex items-center gap-3 p-3 rounded-xl bg-background border border-border">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                        </div>
                        <button
                          className="p-1 rounded-lg hover:bg-muted text-muted-foreground flex-shrink-0"
                          onClick={() => removeFile(file.name)}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      Add more files
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center py-12 px-6 text-center"
                  >
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
                      <Upload className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground mb-1">Drop files here or click to browse</p>
                    <p className="text-sm text-muted-foreground">PDF and DOCX — multiple files supported</p>
                  </button>
                )}
              </div>

              {/* Divider + paste — only shown when no files selected */}
              {selectedFiles.length === 0 && (
                <>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-sm text-muted-foreground">or paste text</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <textarea
                    className="w-full h-40 p-4 rounded-2xl border border-border bg-card text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 placeholder:text-muted-foreground"
                    placeholder="Paste lecture notes, a textbook excerpt, or any content you want to be quizzed on…"
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                  />
                </>
              )}

              {error && (
                <p className="text-sm text-red-500 text-center">{error}</p>
              )}

              <button
                disabled={!canSubmit}
                onClick={handleSubmit}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-semibold text-primary-foreground bg-primary hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Set up session
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {phase === "uploading" && (
            <div className="rounded-2xl border border-border bg-card p-8">
              <div className="flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <p className="font-medium text-foreground">{progressMsg || "Setting up…"}</p>
                {concepts.length > 0 && (
                  <div className="w-full text-left space-y-2">
                    <p className="text-sm font-semibold text-foreground">Key concepts found:</p>
                    <ul className="space-y-1">
                      {concepts.map((c) => (
                        <li key={c.name} className="flex items-start gap-2 text-sm">
                          <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                          <span>
                            <span className="font-medium text-foreground">{c.name}</span>
                            {" — "}
                            <span className="text-muted-foreground">{c.definition}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {phase === "ready" && sessionData && (
            <div className="rounded-2xl border border-primary/30 bg-card p-8 space-y-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-primary" />
                <h2 className="font-display text-xl font-bold text-foreground">
                  Ready — {sessionData.title}
                </h2>
              </div>

              {concepts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Key concepts:</p>
                  <ul className="space-y-2">
                    {concepts.map((c) => (
                      <li key={c.name} className="flex items-start gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span>
                          <span className="font-medium text-foreground">{c.name}</span>
                          {" — "}
                          <span className="text-muted-foreground">{c.definition}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={handleStart}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-semibold text-primary-foreground bg-primary hover:bg-primary/90 transition-colors"
              >
                Start session
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
