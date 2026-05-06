import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, BookOpen } from "lucide-react";
import { AgoraLogo } from "@/components/AgoraLogo";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

type Step = "identity" | "course";

export default function EnrolledLogin() {
  const navigate = useNavigate();

  // identity
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [studentId, setStudentId] = useState("");

  // course
  const [courseId, setCourseId] = useState("");

  const [step, setStep] = useState<Step>("identity");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleIdentity() {
    if (!name.trim() || !email.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_URL}/enrolled/student`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStudentId(data.student_id);
      setStep("course");
    } catch {
      setError("Could not sign in. Check the connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinCourse() {
    if (!courseId.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_URL}/enrolled/course/${courseId.trim()}`);
      if (res.status === 404) throw new Error("Course not found. Check the ID and try again.");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      navigate(`/enrolled/course/${courseId.trim()}`, {
        state: {
          studentId,
          studentName: name,
          courseName: data.course.name,
          subject: data.course.subject,
          rubric: data.course.rubric,
          documents: data.documents,
        },
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not join course.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex-shrink-0 border-b border-border px-6 py-3 flex items-center justify-between">
        <AgoraLogo href="/" size="md" />
        <span className="text-sm text-muted-foreground">Student access</span>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-8">

          {/* Step dots */}
          <div className="flex items-center justify-center gap-2">
            {(["identity", "course"] as Step[]).map((s) => (
              <div key={s} className={`w-2 h-2 rounded-full transition-colors
                ${step === s ? "bg-primary" : s === "identity" && step === "course" ? "bg-primary/40" : "bg-border"}`}
              />
            ))}
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {/* ── Step: identity ── */}
          {step === "identity" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="w-6 h-6 text-primary" />
                </div>
                <h1 className="text-2xl font-semibold">Student sign-in</h1>
                <p className="text-muted-foreground mt-1 text-sm">Enter your details to access your enrolled courses.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Full name</label>
                  <input
                    className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Alex Johnson"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleIdentity()}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email</label>
                  <input
                    className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="alex@university.edu"
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

          {/* ── Step: course ── */}
          {step === "course" && (
            <div className="space-y-6">
              <div className="text-center">
                <h1 className="text-2xl font-semibold">Enter course ID</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  Your instructor will share this with you.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Course ID</label>
                <input
                  className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinCourse()}
                />
              </div>
              <button
                onClick={handleJoinCourse}
                disabled={!courseId.trim() || loading}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Access course
              </button>
              <button
                onClick={() => { setStep("identity"); setError(""); }}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back
              </button>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
