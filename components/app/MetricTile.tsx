// Numeric tile primitive: eyebrow label + serif tabular value.
// Used on landing What-You-Get chapter and (later) on the success view's
// fit-score block. Keep the value short — 1–3 chars or a small phrase
// like "94%". For longer values, prefer a sentence or definition list.

type Props = {
  label: string;
  value: string;
  unit?: string;
};

export function MetricTile({ label, value, unit }: Props) {
  return (
    <div>
      <p className="eyebrow-muted">{label}</p>
      <p className="mt-3 flex items-baseline gap-1 font-serif text-5xl font-light tabular-nums tracking-tight text-text">
        <span>{value}</span>
        {unit ? (
          <span className="text-base font-sans text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </p>
    </div>
  );
}
