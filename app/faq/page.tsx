// Public FAQ page. Two purposes:
//   1. Trust surface — be honest about what we store, what we send to
//      LLM providers, what's encrypted, and what isn't. We do NOT
//      have signed zero-data-retention addenda with either Anthropic
//      or DeepSeek; the data section reflects each provider's
//      published default API policy.
//   2. Standards explainer — what ATS is, why it matters, what
//      recruiters actually look for, and how Distil's outputs are
//      built to clear those hurdles.
//
// Lives outside the (app) shell so unauthenticated visitors hit it.
// Uses the LandingTopbar / Footer / AmbientBackground from the
// existing landing-page composition for visual continuity. No
// Supabase, no auth check — pure server-rendered static content.
//
// Update discipline: every concrete claim ("60-day expiry", "Calibri
// 10pt floor", "no headers / footers / tables") is grounded in a
// spec line or a Decision Log entry. If a claim ever drifts from the
// implementation, this page is wrong and needs updating before the
// implementation changes.

import { AmbientBackground } from "@/components/app/AmbientBackground";
import { Footer } from "@/components/landing/Footer";
import { LandingTopbar } from "@/components/landing/LandingTopbar";

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
            Every CV we generate uses Calibri throughout, body text at
            10–10.5pt (above the common 9pt parser floor), no headers,
            footers, page numbers, text boxes, or tables. Section
            labels (Profile, Professional Experience, Education) are
            the conventional ones every parser recognises.
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
            at a recognisable employer, outcomes expressed in
            numbers (% lift, $ saved, headcount led), and the
            specific skills the JD calls out. Distil structures every
            bullet as <em>action → outcome</em> for exactly this
            reason.
          </>
        ),
      },
      {
        q: "Why does ATS keyword matching matter so much?",
        a: (
          <>
            Many recruiters filter the ATS results by keyword before
            reading anything. If the JD says "stakeholder management"
            and your CV says "client relationships", the parser
            doesn't bridge that gap. Distil reads the JD, identifies
            the keywords that matter, and surfaces them in your
            tailored CV without inventing experience you don't have.
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
        q: "What's the structure?",
        a: (
          <>
            Four paragraphs: an opening that names the role and what
            you bring, a story paragraph showing one specific
            outcome, a paragraph tying your fit to something concrete
            about the company, and a closing. Signed off as a real
            letter, addressed to a real recipient where the JD names
            one.
          </>
        ),
      },
      {
        q: "How is it tailored?",
        a: (
          <>
            We research the company live (recent news, what they do,
            their stated direction) and weave one specific reference
            into the letter. The story paragraph is built from your
            master CV, not invented — Distil never fabricates
            experience.
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
            On Supabase (Postgres + Storage), hosted on AWS. All data
            is encrypted at rest by Supabase's default AES-256 disk
            encryption, and in transit via TLS. Your CV and
            applications are private to your account — only you and
            the Distil service role can read them.
          </>
        ),
      },
      {
        q: "Is my data used to train AI models?",
        a: (
          <>
            Distil itself doesn't train any AI models. Your CV and
            the job description are sent to our LLM provider for the
            single generation call. We use API endpoints (not the
            consumer chat products), but we have not signed
            zero-data-retention addenda with either provider — so
            the standard published API policies apply, summarised
            honestly below.
          </>
        ),
      },
      {
        q: "Which LLM provider runs the generation?",
        a: (
          <>
            <p>
              By default, Distil currently uses{" "}
              <strong>DeepSeek V4 Pro</strong> via DeepSeek's chat
              completions API. We can fall back to{" "}
              <strong>Anthropic Claude Sonnet 4.6</strong> behind a
              runtime toggle. The provider running any given
              generation is recorded against that generation in our
              admin records.
            </p>
            <p className="mt-3">
              <strong className="text-text">DeepSeek default policy:</strong>{" "}
              per their published terms, inputs and outputs may be
              retained and used to improve their services, which can
              include model training. We have not opted out of this.
              Treat anything you put into a generation as something
              that could be processed by DeepSeek under their default
              terms.
            </p>
            <p className="mt-3">
              <strong className="text-text">Anthropic default policy:</strong>{" "}
              per Anthropic's commercial terms, API inputs and
              outputs are <em>not</em> used to train their models.
              They retain prompts and completions for up to 30 days
              for trust-and-safety review, then delete. We have not
              signed a separate ZDR addendum, so the 30-day retention
              window applies.
            </p>
            <p className="mt-3">
              If you'd prefer the Anthropic path, email{" "}
              <a
                href="mailto:hello@curiosum.ai"
                className="btn-link-orange"
              >
                hello@curiosum.ai
              </a>{" "}
              — we'll switch your generations to it. We'll tighten
              this answer further if and when we secure ZDR
              addenda with either provider.
            </p>
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
            Only you (via your account) and one administrator (for
            ops + cost monitoring). Admin access is gated by an
            explicit flag on our staff accounts and is not granted by
            default. We don't share data with third parties beyond
            the LLM provider that runs the generation.
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
        <LandingTopbar />
        <main className="flex-1 px-6 py-16">
          <div className="mx-auto max-w-[760px] space-y-16">
            <header className="text-center">
              <p className="eyebrow">Frequently asked</p>
              <h1 className="heading-display mt-3">Standards, fairness, and your data.</h1>
              <p className="mx-auto mt-5 max-w-[560px] text-base leading-relaxed text-muted-foreground">
                What ATS is and how Distil clears it, what recruiters
                actually scan for in 30 seconds, and the truth about
                what we store, what we don't, and how to delete it
                all.
              </p>
            </header>

            {SECTIONS.map((section) => (
              <FaqSectionBlock key={section.heading} section={section} />
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
