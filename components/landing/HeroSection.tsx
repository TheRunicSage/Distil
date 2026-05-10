// Hero — Word Rise headline over the Forty-Eyes ambient grid.
//
// Concrete-first copy: the eyebrow names the parent brand, the headline
// states the value prop in plain language, the sub paragraph names what
// Distil actually does. Two CTAs: primary "Get started" → /login and
// secondary "See how it works" → #how-it-works smooth-scroll anchor.

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { EyesGrid } from "./EyesGrid";

const HEADLINE_LINE_1 = "Tailor every application.";
const HEADLINE_LINE_2 = "In two minutes, not two hours.";

function RiseLine({ text, baseDelay }: { text: string; baseDelay: number }) {
  // Each word gets its own stage so the overflow:hidden mask sits on the
  // word, not the whole line — words rise independently rather than as
  // one block. Per-word stagger of 70ms reads as a wave, not chaos.
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
    <section className="relative flex min-h-[88vh] items-center overflow-hidden px-6 py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <EyesGrid className="h-full w-full max-w-[1400px] opacity-[0.08]" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[1100px] text-center">
        <p className="eyebrow">Curiosum.ai</p>
        <h1 className="mt-6 font-serif text-5xl font-light leading-[1.05] tracking-tight text-text md:text-6xl lg:text-7xl">
          <RiseLine text={HEADLINE_LINE_1} baseDelay={120} />
          <span className="mt-1 block italic text-orange md:mt-2">
            <RiseLine text={HEADLINE_LINE_2} baseDelay={520} />
          </span>
        </h1>
        <p className="mx-auto mt-8 max-w-[640px] text-base leading-relaxed text-muted-foreground md:text-lg">
          Distil reads your CV and the role, then writes both documents &mdash;
          honestly, with the gaps named.
        </p>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          <Link href="/login" className="btn-primary">
            Get started
            <ArrowRightIcon size={14} aria-hidden />
          </Link>
          <a href="#how-it-works" className="btn-secondary">
            See how it works
          </a>
        </div>
      </div>
    </section>
  );
}
