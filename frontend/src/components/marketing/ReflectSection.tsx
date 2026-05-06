import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const ACTIVITIES = [
  { slug: "anki", name: "Anki", description: "Generate and flip flashcard decks on any topic.", icon: "🃏" },
  { slug: "blueprint", name: "Blueprint", description: "Analyze a model argument and get structured feedback.", icon: "📐" },
  { slug: "blocks", name: "Blocks", description: "Assemble word blocks into a correct sentence.", icon: "🧩" },
  { slug: "unscramble", name: "Unscramble", description: "Drag shuffled sentences back into logical order.", icon: "🔀" },
  { slug: "logic", name: "Logic", description: "LSAT-style reasoning questions on topics you choose.", icon: "🧠" },
  { slug: "wordmap", name: "WordMap", description: "Map the argument structure of a public domain passage from classic literature.", icon: "🗺️" },
];

export function ReflectSection() {
  return (
    <section id="reflect" className="py-24 bg-muted/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Reflect</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground">Six ways to go deeper</h2>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Practice activities you can do anytime — no session required. Pick a topic, start an activity, and build understanding on your own schedule.
            </p>
          </div>
          <Link
            to="/reflect"
            className="group inline-flex items-center gap-2 shrink-0 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
          >
            Browse all activities
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIVITIES.map((activity) => (
            <Link
              key={activity.slug}
              to={`/reflect/${activity.slug}`}
              className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-md"
            >
              <span className="text-2xl shrink-0" aria-hidden>{activity.icon}</span>
              <div className="min-w-0">
                <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{activity.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground leading-relaxed">{activity.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
