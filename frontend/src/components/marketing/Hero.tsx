import { ArrowRight, Mic, Brain, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { colorClasses, type ColorKey } from "@/lib/colorClasses";

const highlights: { icon: LucideIcon; color: ColorKey; title: string; description: string }[] = [
  { icon: Mic, color: "primary", title: "Oral Sessions", description: "Explain concepts in your own words" },
  { icon: Brain, color: "secondary", title: "AI Analysis", description: "Identify gaps and misconceptions" },
  { icon: MessageSquare, color: "accent", title: "Real Feedback", description: "Actionable insights for growth" },
];

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      <div className="absolute inset-0 animated-gradient-subtle" />

      <div className="absolute top-1/4 left-[10%] w-16 h-16 rounded-2xl bg-primary/10 float-animation" style={{ animationDelay: "0s" }} />
      <div className="absolute top-1/3 right-[15%] w-12 h-12 rounded-full bg-secondary/10 float-animation" style={{ animationDelay: "1s" }} />
      <div className="absolute bottom-1/4 left-[20%] w-10 h-10 rounded-xl bg-accent/10 float-animation" style={{ animationDelay: "2s" }} />
      <div className="absolute bottom-1/3 right-[10%] w-14 h-14 rounded-2xl bg-primary/10 float-animation" style={{ animationDelay: "0.5s" }} />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border mb-8">
            <span className="flex h-2 w-2 rounded-full bg-accent animate-pulse" />
            <span className="text-sm font-medium text-muted-foreground">Understand Out Loud</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-foreground leading-tight mb-6">
            Learn by{" "}
            <span className="relative inline-block">
              <span className="relative z-10 bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                Explaining
              </span>
              <span className="absolute inset-x-0 bottom-2 h-3 bg-primary/20 -rotate-1 rounded" />
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-lg sm:text-xl text-muted-foreground leading-relaxed mb-4">
            The AI platform that evaluates understanding through verbal explanation.
            Because explaining something is how it becomes truly yours.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              to="/start"
              className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold text-primary-foreground animated-gradient hover:opacity-90 transition-opacity pulse-glow"
            >
              Start a practice session
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold text-foreground bg-card border border-border hover:bg-muted transition-colors"
            >
              See How It Works
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {highlights.map((item) => {
              const colors = colorClasses[item.color];
              const Icon = item.icon;
              return (
                <div key={item.title} className={`group p-4 rounded-2xl bg-card border border-border ${colors.cardBorder} transition-colors`}>
                  <div className={`w-12 h-12 rounded-xl ${colors.bgLight} flex items-center justify-center mb-3 mx-auto group-hover:scale-110 transition-transform`}>
                    <Icon className={`w-6 h-6 ${colors.text}`} />
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
