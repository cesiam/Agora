"use client";

import { useState, useEffect } from "react";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  BookOpen, 
  User, 
  Bot,
  ChevronRight,
  Award,
  TrendingUp,
  Target,
  Lightbulb
} from "lucide-react";

const sessionMessages = [
  {
    type: "ai",
    text: "I've reviewed the Altizio notes on Vieta's Formulas — the quadratic and cubic cases, derivation from factored form, and symmetric sums. This is a graded session scored against the rubric your instructor uploaded. Let's start broad and go deeper.",
  },
  {
    type: "ai",
    text: "State Vieta's formulas for a quadratic ax² + bx + c = 0 with roots r₁ and r₂. What are the sum and product of the roots?",
  },
  {
    type: "student",
    text: "The sum is −b/a and the product is c/a. So r₁ + r₂ = −b/a and r₁r₂ = c/a.",
  },
  {
    type: "ai",
    text: "Correct. Now derive both identities — don't just state them. Start from the factored form a(x − r₁)(x − r₂) and expand it. Match coefficients to the standard form to show where the formulas come from.",
  },
  {
    type: "student",
    text: "If I expand a(x − r₁)(x − r₂), I get a[x² − (r₁ + r₂)x + r₁r₂], which equals ax² − a(r₁ + r₂)x + ar₁r₂. Matching with ax² + bx + c: the coefficient of x gives −a(r₁ + r₂) = b, so r₁ + r₂ = −b/a. The constant gives ar₁r₂ = c, so r₁r₂ = c/a.",
  },
  {
    type: "ai",
    text: "Good — clean derivation. Now extend to the cubic ax³ + bx² + cx + d = 0 with roots r₁, r₂, r₃. Write all three Vieta relations. And explain the sign: why does the product of all three roots carry a minus sign while the sum does not?",
  },
  {
    type: "student",
    text: "The three relations are: r₁ + r₂ + r₃ = −b/a, then r₁r₂ + r₂r₃ + r₃r₁ = c/a, and r₁r₂r₃ = −d/a. The sign alternates because when you expand (x − r₁)(x − r₂)(x − r₃), the constant term picks up three minus signs — one from each factor — giving (−r₁)(−r₂)(−r₃) = −r₁r₂r₃. So the product is −d/a.",
  },
  {
    type: "ai",
    text: "Exactly right — the alternating sign is a direct consequence of the factored form, not a rule to memorize. Now apply it. Let p and q be the roots of t² − 7t + 5 = 0. Find p² + q² without solving for p and q explicitly.",
  },
  {
    type: "student",
    text: "From Vieta's: p + q = 7 and pq = 5. I need p² + q², which isn't directly a Vieta quantity — but I can write it as (p + q)² − 2pq. That gives 7² − 2·5 = 49 − 10 = 39.",
  },
  {
    type: "ai",
    text: "Correct. What's the general principle you just used — why did you reach for (p + q)² − 2pq rather than trying to compute p and q directly?",
  },
  {
    type: "student",
    text: "The general move is to rewrite whatever expression you need in terms of the elementary symmetric polynomials — sum, pairwise sum, product — and then substitute the Vieta values. You never need to find the actual roots. p² + q² looks asymmetric, but it decomposes into symmetric quantities. That decomposition is the whole trick.",
  },
];

const rubricScores = [
  { criterion: "Statement of Vieta's for quadratics — sum and product, notation", predicted: 20, max: 20 },
  { criterion: "Derivation from the factored form of a polynomial", predicted: 23, max: 25 },
  { criterion: "Extension to cubic and general degree — symmetric sums, sign pattern", predicted: 22, max: 25 },
  { criterion: "Application: solving problems using Vieta's without finding roots", predicted: 26, max: 30 },
];

const totalPredicted = rubricScores.reduce((sum, s) => sum + s.predicted, 0);
const totalMax = rubricScores.reduce((sum, s) => sum + s.max, 0);

export function SampleSession() {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;
    
    if (currentMessageIndex < sessionMessages.length) {
      const timer = setTimeout(() => {
        setCurrentMessageIndex(prev => prev + 1);
      }, 2500);
      return () => clearTimeout(timer);
    } else {
      setIsPlaying(false);
      setShowResults(true);
    }
  }, [isPlaying, currentMessageIndex]);

  const handlePlay = () => {
    if (currentMessageIndex >= sessionMessages.length) {
      setCurrentMessageIndex(0);
      setShowResults(false);
    }
    setIsPlaying(true);
  };

  const handlePause = () => setIsPlaying(false);

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentMessageIndex(0);
    setShowResults(false);
  };

  const handleSkipToEnd = () => {
    setIsPlaying(false);
    setCurrentMessageIndex(sessionMessages.length);
    setShowResults(true);
  };

  const visibleMessages = sessionMessages.slice(0, currentMessageIndex);

  return (
    <section id="demo" className="py-24 bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-12">
          <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            See It In Action
          </span>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4 text-balance">
            A real{" "}
            <span className="text-primary">evaluation session</span>
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-muted-foreground text-pretty">
            Watch how Articulate guides a student through Vieta&apos;s Formulas,
            pushing from recall to derivation to application — without ever computing a root.
          </p>
        </div>

        {/* Session info banner */}
        <div className="max-w-4xl mx-auto mb-6">
          <div className="flex flex-wrap items-center justify-center gap-4 p-4 rounded-2xl bg-card border border-border">
            <div className="flex items-center gap-2 text-sm">
              <BookOpen className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground">Competition Math</span>
            </div>
            <div className="w-px h-4 bg-border hidden sm:block" />
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Topic:</span>
              <span className="font-medium text-foreground">Vieta&apos;s Formulas — Quadratic &amp; Cubic</span>
            </div>
            <div className="w-px h-4 bg-border hidden sm:block" />
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Student:</span>
              <span className="font-medium text-foreground">AMC Level</span>
            </div>
          </div>
        </div>

        {/* Main session container */}
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl bg-card border border-border overflow-hidden shadow-xl">
            {/* Session header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="ml-2 text-sm font-medium text-foreground">Evaluation Mode</span>
              </div>
              
              {/* Playback controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  title="Reset"
                >
                  <RotateCcw className="w-4 h-4 text-muted-foreground" />
                </button>
                {isPlaying ? (
                  <button
                    onClick={handlePause}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={handlePlay}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    {currentMessageIndex === 0 ? "Play Session" : "Continue"}
                  </button>
                )}
                <button
                  onClick={handleSkipToEnd}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-muted text-sm text-muted-foreground transition-colors"
                >
                  Skip to Results
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages area */}
            <div className="h-[400px] overflow-y-auto p-6 space-y-4">
              {visibleMessages.length === 0 && !showResults && (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <Play className="w-8 h-8 text-primary" />
                  </div>
                  <p className="text-muted-foreground">Click &quot;Play Session&quot; to watch the evaluation unfold</p>
                </div>
              )}

              {visibleMessages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-3 ${message.type === "student" ? "flex-row-reverse" : ""} animate-fade-in-up`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    message.type === "ai" 
                      ? "bg-primary/10" 
                      : "bg-secondary/10"
                  }`}>
                    {message.type === "ai" ? (
                      <Bot className="w-4 h-4 text-primary" />
                    ) : (
                      <User className="w-4 h-4 text-secondary" />
                    )}
                  </div>
                  <div className={`max-w-[80%] p-4 rounded-2xl ${
                    message.type === "ai"
                      ? "bg-muted text-foreground rounded-tl-sm"
                      : "bg-primary text-primary-foreground rounded-tr-sm"
                  }`}>
                    <p className="text-sm leading-relaxed">{message.text}</p>
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isPlaying && currentMessageIndex < sessionMessages.length && (
                <div className={`flex gap-3 ${sessionMessages[currentMessageIndex].type === "student" ? "flex-row-reverse" : ""}`}>
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    sessionMessages[currentMessageIndex].type === "ai" 
                      ? "bg-primary/10" 
                      : "bg-secondary/10"
                  }`}>
                    {sessionMessages[currentMessageIndex].type === "ai" ? (
                      <Bot className="w-4 h-4 text-primary" />
                    ) : (
                      <User className="w-4 h-4 text-secondary" />
                    )}
                  </div>
                  <div className={`p-4 rounded-2xl ${
                    sessionMessages[currentMessageIndex].type === "ai"
                      ? "bg-muted rounded-tl-sm"
                      : "bg-primary/20 rounded-tr-sm"
                  }`}>
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Results panel */}
              {showResults && (
                <div className="animate-fade-in-up mt-6 space-y-6">
                  {/* Score card */}
                  <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 border border-primary/20">
                    <div className="flex items-center gap-3 mb-4">
                      <Award className="w-6 h-6 text-primary" />
                      <h3 className="font-display text-xl font-bold text-foreground">Session Results</h3>
                    </div>
                    
                    <div className="flex items-center gap-4 mb-6">
                      <div className="text-5xl font-bold text-primary">{totalPredicted}</div>
                      <div className="text-2xl text-muted-foreground">/ {totalMax}</div>
                      <div className="ml-auto px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-medium">
                        Predicted Score
                      </div>
                    </div>

                    {/* Rubric breakdown */}
                    <div className="space-y-3">
                      {rubricScores.map((score, index) => (
                        <div key={index} className="flex items-center gap-4">
                          <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-foreground">{score.criterion}</span>
                              <span className="text-muted-foreground">{score.predicted}/{score.max}</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div 
                                className="h-full rounded-full bg-primary transition-all duration-1000"
                                style={{ width: `${(score.predicted / score.max) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Feedback cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <span className="text-sm font-semibold text-green-700 dark:text-green-400">Strength</span>
                      </div>
                      <p className="text-sm text-green-800 dark:text-green-300">
                        Your derivation was clean and structural — you showed where the formulas come from rather than reciting them. Explaining the alternating sign through the factored form showed you see Vieta&apos;s as a single coherent idea, not a list of rules.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Area to Develop</span>
                      </div>
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        In the cubic case you stated the formulas correctly but didn&apos;t explicitly divide by the leading coefficient when reading off the product of roots — a systematic error that will cost you on non-monic polynomials.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 mb-2">
                        <Lightbulb className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">Next Step</span>
                      </div>
                      <p className="text-sm text-blue-800 dark:text-blue-300">
                        Solve Review Problem 5 from the Altizio notes: given roots a, b of x²−mx+2 = 0, find q when a+1/b and b+1/a are roots of a new quadratic. Do it without computing a or b.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div className="px-6 py-3 border-t border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Progress</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${(currentMessageIndex / sessionMessages.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{currentMessageIndex}/{sessionMessages.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
