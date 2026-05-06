import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { AgoraLogo } from "@/components/AgoraLogo";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Modes", href: "#modes" },
  { label: "Reflect", href: "#reflect" },
  { label: "About", href: "#about" },
];

const navLinkClass = "text-sm font-medium text-muted-foreground hover:text-foreground transition-colors";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMobile = () => setMobileMenuOpen(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <AgoraLogo href="/" size="md" />

          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <a key={link.label} href={link.href} className={navLinkClass}>{link.label}</a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2">
            <Link to="/enrolled" className={`${navLinkClass} px-4 py-2 rounded-lg border border-border`}>
              Enrolled student
            </Link>
            <Link to="/instructor" className={`${navLinkClass} px-4 py-2 rounded-lg border border-border`}>
              Instructor
            </Link>
            <Link to="/start" className="text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 transition-colors px-4 py-2 rounded-lg">
              Practice session
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
              {NAV_LINKS.map((link) => (
                <a key={link.label} href={link.href} className={navLinkClass} onClick={closeMobile}>{link.label}</a>
              ))}
              <div className="pt-4 border-t border-border flex flex-col gap-2">
                <Link
                  to="/enrolled"
                  className="block text-sm font-medium text-center text-foreground border border-border hover:bg-muted transition-colors px-4 py-2 rounded-lg"
                  onClick={closeMobile}
                >
                  Enrolled student
                </Link>
                <Link
                  to="/instructor"
                  className="block text-sm font-medium text-center text-foreground border border-border hover:bg-muted transition-colors px-4 py-2 rounded-lg"
                  onClick={closeMobile}
                >
                  Instructor
                </Link>
                <Link
                  to="/start"
                  className="block text-sm font-medium text-center text-primary-foreground bg-primary hover:bg-primary/90 transition-colors px-4 py-2 rounded-lg"
                  onClick={closeMobile}
                >
                  Practice session
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
