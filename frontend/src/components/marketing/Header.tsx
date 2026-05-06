import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { AgoraLogo } from "@/components/AgoraLogo";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <AgoraLogo href="/" size="md" />

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
            <a href="#modes" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Modes</a>
            <a href="#reflect" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Reflect</a>
            <a href="#about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">About</a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/instructor"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-lg border border-border"
            >
              Instructor
            </Link>
            <Link
              to="/start"
              className="text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 transition-colors px-4 py-2 rounded-lg"
            >
              Start a session
            </Link>
          </div>

          <button
            type="button"
            className="md:hidden p-2 text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border">
            <div className="flex flex-col gap-4">
              <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMobileMenuOpen(false)}>Features</a>
              <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMobileMenuOpen(false)}>How It Works</a>
              <a href="#modes" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMobileMenuOpen(false)}>Modes</a>
              <a href="#reflect" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMobileMenuOpen(false)}>Reflect</a>
              <a href="#about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMobileMenuOpen(false)}>About</a>
              <div className="pt-4 border-t border-border flex flex-col gap-2">
                <Link
                  to="/instructor"
                  className="block text-sm font-medium text-center text-foreground border border-border hover:bg-muted transition-colors px-4 py-2 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Instructor
                </Link>
                <Link
                  to="/start"
                  className="block text-sm font-medium text-center text-primary-foreground bg-primary hover:bg-primary/90 transition-colors px-4 py-2 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Start a session
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
