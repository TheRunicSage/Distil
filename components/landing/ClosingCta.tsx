// Closing CTA section. The editorial h-display the page has been pacing
// toward — "Apply with care." — paired with one primary action. No
// chapter marker; this is the page's closing beat, not chapter 05.

import { ArrowRightIcon } from "lucide-react";
import { FadeUp } from "@/components/app/FadeUp";
import { PrimaryLink } from "@/components/app/PrimaryLink";

export function ClosingCta() {
  return (
    <section className="px-6 py-32 sm:py-40">
      <FadeUp className="mx-auto max-w-[760px] text-center">
        <h2 className="heading-display">
          Apply{" "}
          <span className="font-serif italic text-orange">with care.</span>
        </h2>
        <p className="lead mx-auto mt-8 max-w-[560px] text-muted-foreground">
          Two minutes from CV to tailored application. Free while in
          private beta.
        </p>
        <div className="mt-10 flex justify-center">
          <PrimaryLink href="/login" className="btn-lg">
            Get started
            <ArrowRightIcon size={16} aria-hidden />
          </PrimaryLink>
        </div>
      </FadeUp>
    </section>
  );
}
