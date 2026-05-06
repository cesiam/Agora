import { Header } from "@/components/marketing/Header";
import { Hero } from "@/components/marketing/Hero";
import { Features } from "@/components/marketing/Features";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { Modes } from "@/components/marketing/Modes";
import { SampleSession } from "@/components/marketing/SampleSession";
import { ReflectSection } from "@/components/marketing/ReflectSection";
import { CTA } from "@/components/marketing/CTA";
import { Footer } from "@/components/marketing/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header />
      <Hero />
      <Features />
      <HowItWorks />
      <Modes />
      <SampleSession />
      <ReflectSection />
      <CTA />
      <Footer />
    </main>
  );
}
