// Hero — opens the chapter journey. Centred composition with a proper
// editorial headline (h-display + italic emphasis), lead, two CTAs, and
// the three qualitative fit levels we actually deliver. The Forty-Eyes
// ambient grid drifts behind. Word Rise carries the headline so the
// page opens with a beat of motion.

import { ArrowRightIcon } from "lucide-react";
import { EyesGrid } from "./EyesGrid";
import { PrimaryLink } from "@/components/app/PrimaryLink";

const HEADLINE_LINE_1 = "Tailor every application.";
const HEADLINE_LINE_2 = "In two minutes, not two hours.";

function RiseLine({ text, baseDelay }: { text: string; baseDelay: number }) {
  const words = text.split(" ");
  return (
    <span className="block">
      {words.map((word, i) => (
        <span
          key={i}
          className="word-rise-stage mr-[0.25em]"
          style={{ ["--rise-delay" as string]: `${baseDelay + i * 70}ms` }}
        >
          <span>{word}</span>
        </span>
      ))}
    </span>
  );
}

export function HeroSection() {
  return (
    <section className="relative flex min-h-[88vh] items-center overflow-hidden px-6 py-24 sm:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <EyesGrid className="h-full w-full max-w-[1400px] opacity-[0.07]" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[1100px] text-center">
        <p className="eyebrow">Curiosum.ai</p>
        <h1 className="mt-8 font-serif text-5xl font-light leading-[1.05] tracking-tight text-text md:text-6xl lg:text-7xl">
          <RiseLine text={HEADLINE_LINE_1} baseDelay={120} />
          <span className="mt-1 block italic text-orange md:mt-2">
            <RiseLine text={HEADLINE_LINE_2} baseDelay={520} />
          </span>
        </h1>
        <p className="lead mx-auto mt-10 max-w-[640px] text-muted-foreground">
          Distil reads your CV and the role, then writes both documents
          &mdash; honestly, in the time it takes to make a coffee. Gaps
          named. Voice kept.
        </p>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          <PrimaryLink href="/login" className="btn-lg">
            Get started
            <ArrowRightIcon size={16} aria-hidden />
          </PrimaryLink>
          <a href="#how-it-works" className="btn-secondary btn-lg">
            See how it works
          </a>
        </div>
        {/* Honest fit signal: we assess every application against the
            role and return one of three qualitative levels. No invented
            numerics, no fake percentages — what the schema actually
            ships. */}
        <div className="mt-16 flex flex-col items-center gap-3">
          <p className="eyebrow-muted text-xs tracking-[0.20em]">
            Honest fit, every time
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="pill pill-success">Strong</span>
            <span className="pill pill-warn">Moderate</span>
            <span className="pill pill-danger">Weak</span>
          </div>
        </div>
      </div>
    </section>
  );
}
