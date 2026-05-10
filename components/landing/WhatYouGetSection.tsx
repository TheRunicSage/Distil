// What you get — three surface cards, one sentence each. Static.
// Mirrors the dashboard's surface-card composition so a returning user
// recognises the visual language.

import { FileTextIcon, MailIcon, GaugeIcon } from "lucide-react";

const ITEMS = [
  {
    icon: FileTextIcon,
    title: "Tailored CV",
    body: "Two pages, ATS-safe, written from your real experience — not invented.",
  },
  {
    icon: MailIcon,
    title: "Cover letter",
    body: "One page, story-led, signed in your voice.",
  },
  {
    icon: GaugeIcon,
    title: "Honest fit read",
    body: "Score, salary band, and the gaps you should know about.",
  },
];

export function WhatYouGetSection() {
  return (
    <section className="px-6 py-32">
      <div className="mx-auto max-w-[1100px]">
        <div className="text-center">
          <p className="eyebrow-muted">What you get</p>
          <h2 className="mt-6 font-serif text-3xl font-light leading-[1.2] tracking-tight text-text md:text-4xl">
            Two documents. One read of fit.
          </h2>
        </div>
        <ul className="mt-16 grid gap-4 md:grid-cols-3">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.title} className="surface-card flex flex-col">
                <div className="flex size-10 items-center justify-center rounded-xl border border-orange/40 bg-orange-subtle text-orange">
                  <Icon size={18} aria-hidden />
                </div>
                <h3 className="mt-6 heading-section">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
