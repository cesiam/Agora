import { ClipboardCheck, BookOpen, Lightbulb, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { colorClasses, type ColorKey } from "@/lib/colorClasses";

const modes: {
  icon: LucideIcon; title: string; subtitle: string; description: string;
  features: string[]; color: ColorKey;
  gradient: string; href: string | null; cta: string; popular?: boolean;
}[] = [
  {
    icon: ClipboardCheck, title: "Evaluation Mode", subtitle: "Formal Assessment",
    description: "Rubric-driven, scored sessions for oral midterms, thesis defenses, and qualifying exams. On the roadmap for pilot institutions.",
    features: ["Rubric-based scoring", "Predicted grades", "Formal feedback reports", "Institution integration"],
    color: "primary", gradient: "from-primary/20 to-primary/5", href: null, cta: "Coming soon",
  },
  {
    icon: BookOpen, title: "Practice Mode", subtitle: "Low-Stakes Learning",
    description: "Ungraded sessions where the platform works through material with you. Surface gaps and prepare for the real thing without scoring pressure.",
    features: ["No scoring pressure", "Structured phases", "Adaptive follow-ups", "Exam preparation"],
    color: "secondary", gradient: "from-secondary/20 to-secondary/5", popular: true, href: "/start", cta: "Start practicing",
  },
  {
    icon: Lightbulb, title: "Brainstorming Mode", subtitle: "Develop Your Ideas",
    description: "No material, no rubric, no judgment. Bring a half-formed idea and develop it before you have to defend it anywhere.",
    features: ["No preparation needed", "Idea development", "Creative exploration", "Build clarity"],
    color: "accent", gradient: "from-accent/20 to-accent/5", href: null, cta: "Coming soon",
  },
];

export function Modes() {
  return (
    <section id="modes" className="py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-medium mb-4">Three Modes</span>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4">
            Choose your{" "}
            <span className="text-accent">learning path</span>
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-muted-foreground">
            Practice is live today; evaluation and brainstorming are next. Agora adapts to how you learn.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {modes.map((mode) => {
            const colors = colorClasses[mode.color];
            const Icon = mode.icon;
            return (
              <div key={mode.title} className={`relative group p-8 rounded-3xl bg-card border-2 border-border ${colors.hover} transition-all duration-300 hover:shadow-xl`}>
                {mode.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className={`px-4 py-1 rounded-full ${colors.bg} text-white text-xs font-semibold`}>Available now</span>
                  </div>
                )}
                <div className={`absolute inset-0 rounded-3xl bg-gradient-to-b ${mode.gradient} opacity-0 group-hover:opacity-100 transition-opacity`} />
                <div className="relative z-10">
                  <div className={`w-14 h-14 rounded-2xl ${colors.bgLight} flex items-center justify-center mb-6`}>
                    <Icon className={`w-7 h-7 ${colors.text}`} />
                  </div>
                  <span className={`text-sm font-medium ${colors.text}`}>{mode.subtitle}</span>
                  <h3 className="font-display text-2xl font-bold text-foreground mb-3">{mode.title}</h3>
                  <p className="text-muted-foreground leading-relaxed mb-6">{mode.description}</p>
                  <ul className="space-y-2 mb-8">
                    {mode.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm text-foreground">
                        <span className={`w-1.5 h-1.5 rounded-full ${colors.bg}`} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {mode.href ? (
                    <Link to={mode.href} className={`inline-flex items-center gap-2 text-sm font-semibold ${colors.text} group-hover:gap-3 transition-all`}>
                      {mode.cta}
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground cursor-not-allowed">{mode.cta}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
