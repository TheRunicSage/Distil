// Public FAQ page. Two purposes:
//   1. Trust surface — be honest about what we store, what's
//      encrypted, how long it sticks around, and how to delete it.
//      Deliberately does NOT name our LLM provider or describe the
//      generation pipeline — those are commercial details we don't
//      put on a public page.
//   2. Standards explainer — what ATS is, why it matters, what
//      recruiters look for, and the principles Distil's outputs
//      follow. High-level posture, not a recipe.
//
// Lives outside the (app) shell so unauthenticated visitors hit it.
// Topbar is rendered via <AuthAwareTopbar /> so signed-in visitors
// get the (app)-style topbar (with their UserMenu + primary CTA) and
// anonymous visitors get the LandingTopbar — without /faq itself
// needing to know about auth. The content body is pure static.
//
// Disclosure discipline: keep the "what" (you get a CV + cover
// letter, ATS-safe, tailored to the JD, generated quickly), keep
// the data commitments (encrypted, retention windows, no model
// training, you can delete your account). Don't name vendors,
// don't describe the prompt structure, don't reveal the pipeline.
// If a claim here ever drifts from reality, fix this page before
// the implementation changes — but specifics about how the
// implementation does it stay internal.

import { AmbientBackground } from "@/components/app/AmbientBackground";
import { AuthAwareTopbar } from "@/components/app/AuthAwareTopbar";
import { FadeUp } from "@/components/app/FadeUp";
import { Footer } from "@/components/landing/Footer";

export const metadata = {
  title: "FAQ — Distil",
  description:
    "How Distil's CVs and cover letters meet ATS standards, what recruiters look for, and how we treat your data.",
};

type FaqItem = { q: string; a: React.ReactNode };
type FaqSection = { eyebrow: string; heading: string; items: FaqItem[] };

const SECTIONS: FaqSection[] = [
  {
    eyebrow: "Standards",
    heading: "What is ATS, and why it matters",
    items: [
      {
        q: "What's an ATS?",
        a: (
          <>
            Most companies route applications through an{" "}
            <strong>applicant tracking system</strong> before a human
            sees them. The ATS extracts text from your CV, matches it
            against the job's required skills, and ranks candidates.
            If your CV's structure or formatting confuses the parser,
            you may be filtered out before a recruiter ever sees your
            name — even if you're a strong fit.
          </>
        ),
      },
      {
        q: "What gets a CV rejected by an ATS?",
        a: (
          <>
            Headers, footers, page numbers, text boxes, multi-column
            layouts, tables, embedded images, decorative icon fonts,
            and unusual section labels. Parsers built around
            traditional CV structure miss content that lives outside
            the main text flow.
          </>
        ),
      },
      {
        q: "How does Distil avoid those traps?",
        a: (
          <>
            Distil's outputs use industry-standard fonts, sizes, and
            section labels that mainstream ATS parsers read reliably,
            with a single-column structure and no decorative elements
            that confuse parsers. The result is built to be machine-
            scannable first and human-readable second.
          </>
        ),
      },
    ],
  },
  {
    eyebrow: "What recruiters look for",
    heading: "30 seconds with your CV",
    items: [
      {
        q: "How long does a recruiter spend on each CV?",
        a: (
          <>
            Industry research consistently lands around{" "}
            <strong>30–60 seconds</strong> for a first-pass screen.
            Recruiters scan for fit, not depth. They're checking that
            you've done the kind of work the role wants and that your
            outcomes are recognisable — not reading every bullet.
          </>
        ),
      },
      {
        q: "What grabs attention in that scan?",
        a: (
          <>
            A clear role title and seniority match, recent experience
            at recognisable employers, outcomes expressed concretely
            (numbers and results, not just responsibilities), and the
            specific skills the job description calls out.
          </>
        ),
      },
      {
        q: "Why does keyword matching matter so much?",
        a: (
          <>
            Many recruiters filter the ATS results by keyword before
            reading anything. If the job says "stakeholder management"
            and your CV says "client relationships", the parser
            doesn't bridge that gap. Distil's tailoring surfaces the
            language the role uses — without inventing experience you
            don't have.
          </>
        ),
      },
    ],
  },
  {
    eyebrow: "Cover letter",
    heading: "What a strong cover letter does",
    items: [
      {
        q: "What does a strong cover letter look like?",
        a: (
          <>
            Concise, role-specific, written like a real letter rather
            than a generic introduction, addressed to the named
            recipient where the job posting includes one, and signed
            off properly. It should add context to the CV — why this
            role, why you, what you'd bring — without restating the
            CV bullet by bullet.
          </>
        ),
      },
      {
        q: "How is it tailored?",
        a: (
          <>
            Distil reads the role, considers the company's context,
            and produces a letter pitched at this specific
            opportunity. Everything is grounded in your master CV —
            we never fabricate experience or claim things you didn't
            do.
          </>
        ),
      },
    ],
  },
  {
    eyebrow: "Your data",
    heading: "How we treat what you upload",
    items: [
      {
        q: "Where is my data stored?",
        a: (
          <>
            On encrypted cloud storage with AES-256 at rest and TLS
            in transit. Your CV and applications are private to your
            account — only you and Distil's service role can read
            them.
          </>
        ),
      },
      {
        q: "Is my data used to train AI models?",
        a: (
          <>
            Distil itself doesn't train any AI models, and we don't
            sell or share your data with anyone outside what's
            strictly required to generate your documents. Generation
            is performed by a third-party AI service under their
            standard terms, which may briefly retain inputs for
            trust-and-safety purposes before deletion. If this matters
            to you for a specific application, email{" "}
            <a
              href="mailto:hello@curiosum.ai"
              className="btn-link-orange"
            >
              hello@curiosum.ai
            </a>{" "}
            and we'll talk through your options.
          </>
        ),
      },
      {
        q: "How long is my data kept?",
        a: (
          <>
            Generated CV and cover letter <strong>files</strong> are
            auto-deleted after 60 days. The underlying{" "}
            <strong>application metadata</strong> (job description
            you pasted, generated content) is auto-deleted after 1
            year. Your <strong>master CV</strong> is replaced when
            you upload a new one (the old one is removed). These are
            cron-driven and run regardless of whether your account
            is active.
          </>
        ),
      },
      {
        q: "Can I delete everything?",
        a: (
          <>
            Yes. Settings → Danger zone → Delete account. This
            removes your account, login, and master CV immediately.
            Generated documents continue to expire on the same 60-day
            file / 1-year metadata cron, unlinked from your account
            from the moment of deletion. There's no way to access
            them after you've deleted your account.
          </>
        ),
      },
      {
        q: "Who can see my data inside Distil?",
        a: (
          <>
            Only you (via your account) and a small number of staff
            with explicit admin access for operations and support.
            Admin access is gated by a flag on staff accounts and is
            not granted by default.
          </>
        ),
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <>
      <AmbientBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <AuthAwareTopbar />
        <main className="flex-1 px-6 py-16">
          <div className="mx-auto max-w-[760px] space-y-16">
            <header className="text-center">
              <p className="eyebrow">Frequently asked</p>
              <h1 className="heading-display mt-3">Standards, fairness, and your data.</h1>
              <p className="mx-auto mt-5 max-w-[560px] text-base leading-relaxed text-muted-foreground">
                What ATS is, what recruiters look for in a 30-second
                scan, and how we treat your data — what we keep, for
                how long, and how to delete it.
              </p>
            </header>

            {SECTIONS.map((section) => (
              <FadeUp key={section.heading} mode="scroll">
                <FaqSectionBlock section={section} />
              </FadeUp>
            ))}

            <section className="surface-card text-center">
              <p className="eyebrow">Still curious?</p>
              <p className="mt-3 text-base text-text">
                Email{" "}
                <a
                  href="mailto:hello@curiosum.ai"
                  className="btn-link-orange"
                >
                  hello@curiosum.ai
                </a>{" "}
                — we read everything that comes in.
              </p>
            </section>
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}

function FaqSectionBlock({ section }: { section: FaqSection }) {
  return (
    <section className="space-y-6">
      <header>
        <p className="eyebrow">{section.eyebrow}</p>
        <h2 className="heading-section mt-2">{section.heading}</h2>
      </header>
      <div className="divide-y divide-border/60 rounded-2xl border border-border bg-dark2/60 backdrop-blur-sm">
        {section.items.map((item, i) => (
          // <details>/<summary> keeps this a server component and gives
          // us native open/close + keyboard behaviour without client JS.
          // Group is open by default for the first item per section so
          // the page doesn't read as an empty-looking accordion.
          <details
            key={i}
            open={i === 0}
            className="group px-5 py-4"
          >
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-left text-sm font-semibold text-text transition-colors hover:text-orange">
              <span>{item.q}</span>
              <span
                aria-hidden
                className="mt-0.5 shrink-0 font-mono text-xs text-orange transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <div className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {item.a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
