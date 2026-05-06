import { Upload, Mic2, Lightbulb, Target, GraduationCap, ShieldCheck, BarChart3, Brain, MessageSquareText } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const features: { icon: LucideIcon; title: string; description: string; color: "primary" | "secondary" | "accent" }[] = [
  { icon: Brain, title: "Content Over Delivery", description: "We evaluate what you say, not how you say it. Logical coherence, reasoning quality, and claim-evidence relationships — the substance nobody else measures.", color: "primary" },
  { icon: Upload, title: "Upload Materials", description: "Drop in PDFs, lecture notes, slides, or research papers. Our AI parses and identifies key concepts, arguments, and relationships automatically.", color: "secondary" },
  { icon: Mic2, title: "Three-Phase Sessions", description: "Move through Recognition, Retrieval, and Interpretation — progressively deeper phases that separate memorization from genuine understanding.", color: "accent" },
  { icon: MessageSquareText, title: "Adaptive Follow-Ups", description: "Questions adapt in real-time based on your responses, surfacing misconceptions and requesting clarification when answers are vague.", color: "primary" },
  { icon: Target, title: "Practice-First", description: "Low-stakes practice sessions today; evaluation workflows can plug in when your institution is ready. Same rigor, no rubric required to start.", color: "secondary" },
  { icon: ShieldCheck, title: "Assessment Integrity", description: "Live explanation cannot be outsourced or AI-generated. No surveillance needed — just genuine evaluation of understanding.", color: "accent" },
  { icon: GraduationCap, title: "For All Learners", description: "From K-12 students to self-taught developers, graduate researchers to lifelong learners exploring quantum mechanics on their own.", color: "primary" },
  { icon: BarChart3, title: "Structured Debrief", description: "End each run with strength, area to develop, and a concrete next step — tied to what you actually said in the session.", color: "secondary" },
];

const colorClasses = {
  primary: { bg: "bg-primary/10", text: "text-primary", border: "group-hover:border-primary/50" },
  secondary: { bg: "bg-secondary/10", text: "text-secondary", border: "group-hover:border-secondary/50" },
  accent: { bg: "bg-accent/10", text: "text-accent", border: "group-hover:border-accent/50" },
};

export function Features() {
  return (
    <section id="features" className="py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">Features</span>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4">
            Everything you need to{" "}
            <span className="text-primary">truly understand</span>
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-muted-foreground">
            Agora transforms how you learn and how educators assess — evaluating the substance of your thinking, not just your performance.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => {
            const colors = colorClasses[feature.color];
            const Icon = feature.icon;
            return (
              <div key={index} className={`group p-6 rounded-2xl bg-card border border-border ${colors.border} transition-all duration-300 hover:shadow-lg`}>
                <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-6 h-6 ${colors.text}`} />
                </div>
                <h3 className="font-semibold text-lg text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
