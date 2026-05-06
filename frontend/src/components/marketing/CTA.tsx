import { ArrowRight, Mic } from "lucide-react";
import { Link } from "react-router-dom";

export function CTA() {
  return (
    <section className="py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl animated-gradient p-12 md:p-16 lg:p-20">
          <div className="absolute top-8 left-8 w-20 h-20 rounded-full bg-white/10 float-animation" />
          <div className="absolute bottom-8 right-12 w-16 h-16 rounded-2xl bg-white/10 float-animation" style={{ animationDelay: "1s" }} />
          <div className="absolute top-1/2 right-1/4 w-12 h-12 rounded-xl bg-white/10 float-animation" style={{ animationDelay: "2s" }} />

          <div className="relative z-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-8">
              <Mic className="w-8 h-8 text-white" />
            </div>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
              Ready to transform how you learn?
            </h2>
            <p className="max-w-2xl mx-auto text-lg text-white/80 mb-10">
              Join thousands of students and educators who are discovering the power of explaining out loud. Start your first session in minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/start"
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-semibold text-primary bg-white hover:bg-white/90 transition-colors shadow-lg"
              >
                Start a practice session
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="#demo"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-semibold text-white border-2 border-white/30 hover:bg-white/10 transition-colors"
              >
                Watch sample
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
