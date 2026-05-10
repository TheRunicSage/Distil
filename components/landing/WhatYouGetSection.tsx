// Chapter 03 — What you get. Two documents + a read of fit. Three
// eyebrow-labeled cards, with the fit card carrying a tabular numeric
// read so the page's editorial tabular rhythm shows up before the
// success view ever does.

import { FileTextIcon, MailIcon } from "lucide-react";
import { Chapter } from "@/components/app/Chapter";
import { FadeUp } from "@/components/app/FadeUp";

export function WhatYouGetSection() {
  return (
    <section className="px-6 py-32">
      <div className="mx-auto max-w-[1100px]">
        <FadeUp className="text-center">
          <Chapter num="03" label="What you get" />
          <h2 className="heading-section mt-6">
            Two documents.{" "}
            <span className="font-serif italic text-orange">
              One read of fit.
            </span>
          </h2>
        </FadeUp>
        <FadeUp stagger className="mt-16 grid gap-4 md:grid-cols-3">
          <div className="fade-up h-full">
            <article className="surface-card-interactive flex h-full flex-col">
              <div className="flex size-10 items-center justify-center rounded-xl border border-orange/40 bg-orange-subtle text-orange">
                <FileTextIcon size={18} aria-hidden />
              </div>
              <p className="eyebrow-muted mt-6">Document one</p>
              <h3 className="mt-4 font-serif text-2xl font-normal leading-tight tracking-tight text-text">
                Tailored CV
              </h3>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                Two pages, ATS-safe, written from your real experience &mdash;
                not invented.
              </p>
            </article>
          </div>
          <div className="fade-up h-full">
            <article className="surface-card-interactive flex h-full flex-col">
              <div className="flex size-10 items-center justify-center rounded-xl border border-orange/40 bg-orange-subtle text-orange">
                <MailIcon size={18} aria-hidden />
              </div>
              <p className="eyebrow-muted mt-6">Document two</p>
              <h3 className="mt-4 font-serif text-2xl font-normal leading-tight tracking-tight text-text">
                Cover letter
              </h3>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                One page, story-led, signed in your voice. No hollow
                superlatives.
              </p>
            </article>
          </div>
          <div className="fade-up h-full">
            <article className="surface-card-interactive flex h-full flex-col">
              <p className="eyebrow">+ a read of fit</p>
              <p className="mt-5 flex items-baseline gap-2">
                <span className="font-serif text-6xl font-light tabular-nums leading-none text-text">
                  82
                </span>
                <span className="text-meta">/100</span>
              </p>
              <p className="mt-4 font-serif text-xl font-normal italic leading-snug text-text">
                Strong match. Worth applying.
              </p>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                Score, salary band, and the gaps you should know about &mdash;
                before you apply.
              </p>
            </article>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}
