// Chapter 01 — Why Distil. Three cards comparing the fast / hard / Distil
// way, then peek-reveal copy below for readers who want to dig in.

import { Chapter } from "@/components/app/Chapter";
import { FadeUp } from "@/components/app/FadeUp";

const WAYS = [
  {
    eyebrow: "The fast way",
    title: "Send the same CV everywhere.",
    body: "Cheap. Disrespectful to your story. Stops working after the first dozen no-replies.",
  },
  {
    eyebrow: "The hard way",
    title: "Tailor it yourself, every time.",
    body: "Honest, but two hours per role. By application six you're cutting corners.",
  },
  {
    eyebrow: "The Distil way",
    title: "Honest tailoring at speed.",
    body: "Two minutes. Your real experience, sharpened to match the role. Gaps named, never invented.",
  },
];

export function ProblemSection() {
  return (
    <section className="px-6 py-32">
      <div className="mx-auto max-w-[1100px]">
        <FadeUp className="text-center">
          <Chapter num="01" label="Why Distil" />
          <h2 className="heading-section mt-6">
            An application is a chance to say{" "}
            <span className="font-serif italic text-orange">
              who you really are
            </span>
            .
          </h2>
        </FadeUp>
        <FadeUp
          stagger
          className="mt-16 grid gap-4 md:grid-cols-3"
        >
          {WAYS.map((way) => (
            <div key={way.eyebrow} className="fade-up h-full">
              <article className="surface-card-interactive flex h-full flex-col">
                <p className="eyebrow-muted">{way.eyebrow}</p>
                <h3 className="mt-5 font-serif text-2xl font-normal leading-tight tracking-tight text-text">
                  {way.title}
                </h3>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                  {way.body}
                </p>
              </article>
            </div>
          ))}
        </FadeUp>
        <FadeUp className="mx-auto mt-20 max-w-[640px] text-base leading-relaxed text-muted-foreground md:text-lg">
          <p>
            Most people send the same CV to twenty roles and hope. Real{" "}
            <span
              className="peek-reveal"
              tabIndex={0}
              data-peek="Rewriting bullets, reordering sections, reading between the lines of the JD."
            >
              tailoring
            </span>{" "}
            takes hours. A good cover letter takes longer. Honest{" "}
            <span
              className="peek-reveal"
              tabIndex={0}
              data-peek="Naming the gaps you'd rather not. Owning the mismatch instead of papering over it."
            >
              fit
            </span>{" "}
            reads take humility. Distil does both, every time —{" "}
            <span
              className="peek-reveal"
              tabIndex={0}
              data-peek="No invented experience. No hollow superlatives. Your story, sharpened."
            >
              honestly
            </span>
            , and in the time it takes to make a coffee.
          </p>
        </FadeUp>
      </div>
    </section>
  );
}
