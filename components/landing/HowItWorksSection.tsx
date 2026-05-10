// How it works — Living Diagram. The diagram is the section.
// Anchor target for the hero's secondary CTA.

import { LivingDiagram } from "./LivingDiagram";

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="px-6 py-32">
      <div className="mx-auto max-w-[1100px]">
        <div className="text-center">
          <p className="eyebrow-muted">How it works</p>
          <h2 className="mt-6 font-serif text-3xl font-light leading-[1.2] tracking-tight text-text md:text-4xl">
            Four steps. One pass.
          </h2>
          <p className="mx-auto mt-6 max-w-[560px] text-base leading-relaxed text-muted-foreground">
            No back-and-forth. No template library. Distil reads, decides, and
            writes &mdash; in one shot.
          </p>
        </div>
        <div className="mt-16">
          <LivingDiagram />
        </div>
      </div>
    </section>
  );
}
