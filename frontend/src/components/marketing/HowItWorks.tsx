import { Upload, Mic, BrainCircuit, FileCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const steps: { number: string; icon: LucideIcon; title: string; description: string; color: "primary" | "secondary" | "accent" }[] = [
  { number: "01", icon: Upload, title: "Upload Your Materials", description: "Drop in your study materials — PDFs, lecture notes, slides, transcripts, or research papers. Our AI parses the content and identifies key concepts, definitions, and relationships.", color: "primary" },
  { number: "02", icon: Mic, title: "Start Your Session", description: "Begin a structured practice session. The platform guides you through phases — from recognition to retrieval to interpretation — adapting to your responses in real time.", color: "secondary" },
  { number: "03", icon: BrainCircuit, title: "AI Identifies Gaps", description: "As you explain, the model surfaces where reasoning is thin or vague — the kind of follow-up a strong oral exam would use, not just right or wrong.", color: "accent" },
  { number: "04", icon: FileCheck, title: "Get Actionable Feedback", description: "Receive structured feedback: strengths, specific areas to develop, and a recommended next step before your next session.", color: "primary" },
];

const colorClasses = {
  primary: { bg: "bg-primary", bgLight: "bg-primary/10", text: "text-primary", border: "border-primary/30" },
  secondary: { bg: "bg-secondary", bgLight: "bg-secondary/10", text: "text-secondary", border: "border-secondary/30" },
  accent: { bg: "bg-accent", bgLight: "bg-accent/10", text: "text-accent", border: "border-accent/30" },
};

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 rounded-full bg-secondary/10 text-secondary text-sm font-medium mb-4">How It Works</span>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4">
            From upload to{" "}
            <span className="text-secondary">understanding</span>
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-muted-foreground">
            A simple four-step process that transforms passive reading into active understanding.
          </p>
        </div>

        <div className="relative">
          <div className="hidden lg:block absolute top-24 left-[12%] right-[12%] h-0.5 bg-border" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => {
              const colors = colorClasses[step.color];
              const Icon = step.icon;
              return (
                <div key={index} className="relative text-center">
                  <div className={`relative z-10 w-20 h-20 rounded-2xl ${colors.bg} flex items-center justify-center mx-auto mb-6 shadow-lg`}>
                    <Icon className="w-9 h-9 text-white" />
                    <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-card border-2 border-border flex items-center justify-center text-xs font-bold text-foreground">
                      {step.number}
                    </span>
                  </div>
                  <h3 className="font-semibold text-xl text-foreground mb-3">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
