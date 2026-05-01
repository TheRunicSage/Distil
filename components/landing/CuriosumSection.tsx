// Powered by Curiosum.ai — the closer. Typographic Gravity field of
// Curiosum lineage words sits between the eyebrow + heading and the
// closing wordmark. Heaviest words ("fit", "honesty") pull hardest;
// "match" / "candour" / "shape" stay closer to anchor.

import { GravityField } from "./GravityField";

export function CuriosumSection() {
  return (
    <section className="relative px-6 py-32">
      <div className="mx-auto max-w-[1100px]">
        <div className="text-center">
          <p className="eyebrow">Powered by Curiosum.ai</p>
          <h2 className="mt-6 font-serif text-3xl font-light italic leading-[1.2] tracking-tight text-text md:text-4xl">
            Built on the same craft we apply to every Curiosum brief.
          </h2>
        </div>
        <GravityField className="mx-auto mt-20 h-[420px] w-full max-w-[920px]" />
        <div className="mt-12 text-center">
          <p className="font-serif text-2xl font-light italic tracking-tight text-text">
            Distil, by Curiosum.ai.
          </p>
          <p className="mt-3 text-meta">
            A thousand briefs, one craft. Apply with the same care.
          </p>
        </div>
      </div>
    </section>
  );
}
