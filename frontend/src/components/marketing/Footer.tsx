import { Link } from "react-router-dom";
import { Github, Linkedin, Twitter } from "lucide-react";
import { AgoraLogo } from "@/components/AgoraLogo";

const footerLinks = {
  product: [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Modes", href: "#modes" },
    { label: "Reflect", href: "/reflect" },
    { label: "Pricing", href: "/pricing" },
  ],
  resources: [
    { label: "Documentation", href: "/docs" },
    { label: "Help Center", href: "/help" },
    { label: "Blog", href: "/blog" },
    { label: "Research", href: "/research" },
  ],
  company: [
    { label: "About", href: "#about" },
    { label: "Careers", href: "/careers" },
    { label: "Contact", href: "/contact" },
    { label: "Partners", href: "/partners" },
  ],
  legal: [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "Security", href: "/security" },
  ],
};

export function Footer() {
  return (
    <footer id="about" className="bg-muted/30 border-t border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
          <div className="col-span-2">
            <AgoraLogo href="/" size="md" className="mb-4" />
            <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-xs">
              The platform that evaluates understanding by listening to how you explain it. Built for students and educators everywhere.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://github.com" className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors" target="_blank" rel="noopener noreferrer">
                <Github className="w-4 h-4" />
              </a>
              <a href="https://linkedin.com" className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors" target="_blank" rel="noopener noreferrer">
                <Linkedin className="w-4 h-4" />
              </a>
              <a href="https://twitter.com" className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors" target="_blank" rel="noopener noreferrer">
                <Twitter className="w-4 h-4" />
              </a>
            </div>
          </div>

          {(["product", "resources", "company", "legal"] as const).map((section) => (
            <div key={section}>
              <h3 className="font-semibold text-foreground mb-4 capitalize">{section}</h3>
              <ul className="space-y-3">
                {footerLinks[section].map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith("#") || link.href.startsWith("http") ? (
                      <a href={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{link.label}</a>
                    ) : (
                      <Link to={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{link.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">2026 Agora. All rights reserved.</p>
          <p className="text-sm text-muted-foreground">Built for learners everywhere</p>
        </div>
      </div>
    </footer>
  );
}
