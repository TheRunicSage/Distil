// Hero — opens the chapter journey. Editorial pacing: no h-display here
// (the big h-display closes the page on ClosingCta). Hero sets the stage:
// eyebrow → lead → CTAs → a small fit-pill preview, with the Forty-Eyes
// ambient grid drifting behind. Word Rise still on the lead's bolded
// promise so the page opens with a beat of motion.

import { ArrowRightIcon } from "lucide-react";
import { EyesGrid } from "./EyesGrid";
import { PrimaryLink } from "@/components/app/PrimaryLink";

export function HeroSection() {
  return (
    <section className="relative flex min-h-[78vh] items-center overflow-hidden px-6 py-24 sm:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <EyesGrid className="h-full w-full max-w-[1400px] opacity-[0.07]" />
      </div>
      <div className="relative z-10 mx-auto grid w-full max-w-[1100px] gap-12 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        <div>
          <p className="eyebrow">Curiosum.ai</p>
          <p className="lead mt-6 max-w-[560px]">
            Distil reads your CV and the role, then writes both documents
            &mdash;{" "}
            <span className="word-rise-stage">
              <span style={{ ["--rise-delay" as string]: "120ms" }}>
                honestly
              </span>
            </span>
            , in the time it takes to make a coffee. Gaps named. Voice kept.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <PrimaryLink href="/login" className="btn-lg">
              Get started
              <ArrowRightIcon size={16} aria-hidden />
            </PrimaryLink>
            <a href="#how-it-works" className="btn-secondary btn-lg">
              See how it works
            </a>
          </div>
        </div>
        {/* Right rail: a teaser fit card. Pure visual; signals what the
            output looks like without committing to render the real thing. */}
        <aside className="relative">
          <div className="surface-card-interactive max-w-sm">
            <p className="eyebrow-muted">Fit assessment</p>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="font-serif text-7xl font-light tabular-nums leading-none text-text">
                82
              </span>
              <span className="text-meta">/100</span>
            </div>
            <p className="mt-4 font-serif text-xl font-normal italic text-text">
              Strong match. Worth applying.
            </p>
            <p className="mt-3 text-meta">
              6 of 7 core signals matched. The gap: formal product title.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
