// Distil public landing page. Replaces the Milestone-0 placeholder.
//
// Server component: no auth check, no Supabase calls, no AppShell. Just
// composes the landing-page sections and wraps them in the shared
// MotionRoot so each motion primitive subscribes to one RAF loop. The
// AmbientBackground from the (app) shell is reused here for visual
// continuity between landing and authenticated surfaces.
//
// Structure (locked, see Decision Log [14] follow-up):
//   1. Hero — Word Rise headline + Forty-Eyes ambient grid
//   2. Why Distil — peek-reveal copy
//   3. How it works — Living Diagram
//   4. What you get — three surface cards
//   5. Powered by Curiosum — Typographic Gravity field
//
// Motion budget enforced inside MotionRoot: viewport >= 1024px AND
// prefers-reduced-motion: no-preference, otherwise every primitive
// degrades to a static fallback at the component level.

import { AmbientBackground } from "@/components/app/AmbientBackground";
import { MagneticDots } from "@/components/app/MagneticDots";
import { ClosingCta } from "@/components/landing/ClosingCta";
import { CuriosumSection } from "@/components/landing/CuriosumSection";
import { Footer } from "@/components/landing/Footer";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { LandingTopbar } from "@/components/landing/LandingTopbar";
import { MotionRoot } from "@/components/landing/MotionRoot";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { WhatYouGetSection } from "@/components/landing/WhatYouGetSection";

export default function LandingPage() {
  return (
    <MotionRoot>
      <AmbientBackground />
      <MagneticDots />
      <div className="relative z-10 flex min-h-screen flex-col">
        <LandingTopbar />
        <main className="flex-1">
          <HeroSection />
          <ProblemSection />
          <HowItWorksSection />
          <WhatYouGetSection />
          <CuriosumSection />
          <ClosingCta />
        </main>
        <Footer />
      </div>
    </MotionRoot>
  );
}
