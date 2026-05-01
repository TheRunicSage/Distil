// Why Distil — peek-reveal copy. Three short paragraphs, each with one
// keyword carrying a dashed-orange underline that reveals subtext on
// hover or focus. Pure CSS via .peek-reveal + data-peek attribute, no
// JavaScript, no motion-budget cost.

export function ProblemSection() {
  return (
    <section className="px-6 py-32">
      <div className="mx-auto max-w-[760px] text-center">
        <p className="eyebrow-muted">Why Distil</p>
        <h2 className="mt-6 font-serif text-3xl font-light leading-[1.2] tracking-tight text-text md:text-4xl">
          An application is the chance to show who you really are.
        </h2>
        <div className="mx-auto mt-12 max-w-[600px] space-y-6 text-left text-base leading-relaxed text-muted-foreground md:text-lg">
          <p>
            Most people send the same CV to twenty roles and hope. Real{" "}
            <span
              className="peek-reveal"
              tabIndex={0}
              data-peek="Rewriting bullets, reordering sections, reading between the lines of the JD."
            >
              tailoring
            </span>{" "}
            takes hours.
          </p>
          <p>
            A good cover letter takes longer. Honest{" "}
            <span
              className="peek-reveal"
              tabIndex={0}
              data-peek="Naming the gaps you'd rather not. Owning the mismatch instead of papering over it."
            >
              fit
            </span>{" "}
            reads take humility.
          </p>
          <p>
            Distil does both, every time &mdash;{" "}
            <span
              className="peek-reveal"
              tabIndex={0}
              data-peek="No invented experience. No hollow superlatives. Your story, sharpened."
            >
              honestly
            </span>
            , and in the time it takes to make a coffee.
          </p>
        </div>
      </div>
    </section>
  );
}
