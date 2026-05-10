// Chapter 02 — How it works. The Living Diagram is the section's
// centrepiece; the chapter rhythm + lead set the editorial tone above it.

import { Chapter } from "@/components/app/Chapter";
import { FadeUp } from "@/components/app/FadeUp";
import { LivingDiagram } from "./LivingDiagram";

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="px-6 py-32">
      <div className="mx-auto max-w-[1100px]">
        <FadeUp className="text-center">
          <Chapter num="02" label="How it works" />
          <h2 className="heading-section mt-6">
            Four steps.{" "}
            <span className="font-serif italic text-orange">One pass.</span>
          </h2>
          <p className="lead mx-auto mt-6 max-w-[560px] text-muted-foreground">
            No back-and-forth. No template library. Distil reads, decides, and
            writes &mdash; in one shot.
          </p>
        </FadeUp>
        <FadeUp className="mt-16">
          <LivingDiagram />
        </FadeUp>
      </div>
    </section>
  );
}
