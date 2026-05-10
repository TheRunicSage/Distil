// Chapter 04 — Powered by Curiosum. Heritage chapter: who's behind the
// product. The Gravity field of lineage words ("fit", "candour", "shape"
// pulling toward "honesty") sits between the chapter heading and the
// closing wordmark. Heaviest words pull hardest; lighter ones drift.

import { Chapter } from "@/components/app/Chapter";
import { FadeUp } from "@/components/app/FadeUp";
import { GravityField } from "./GravityField";

export function CuriosumSection() {
  return (
    <section className="relative px-6 py-32">
      <div className="mx-auto max-w-[1100px]">
        <FadeUp className="text-center">
          <Chapter num="04" label="Powered by Curiosum" />
          <h2 className="heading-section mt-6">
            Built by the same team behind{" "}
            <span className="font-serif italic text-orange">
              Curiosum Management Consulting
            </span>
            .
          </h2>
          <p className="lead mx-auto mt-6 max-w-[640px] text-muted-foreground">
            Twenty years of helping people land roles they're proud of
            &mdash; distilled into a tool that does the same job in two
            minutes, with the same honesty.
          </p>
        </FadeUp>
        <FadeUp>
          <GravityField className="mx-auto mt-20 h-[420px] w-full max-w-[920px]" />
        </FadeUp>
        <FadeUp className="mt-12 flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://curiosum.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            curiosum.ai
          </a>
        </FadeUp>
      </div>
    </section>
  );
}
