// Chapter rhythm marker. Two forms:
//   <Chapter num="01" label="Why Distil" />     — landing, numbered
//   <Chapter label="Settings" />                — app shell, em-dash
// Class primitives (.chapter / .chapter-num / .chapter-line / .chapter-label)
// live in globals.css so the visual is shared across the site.

type Props = { num?: string; label: string };

export function Chapter({ num, label }: Props) {
  return (
    <p className="chapter">
      <span className="chapter-num">{num ?? "—"}</span>
      <span className="chapter-line" aria-hidden />
      <span className="chapter-label">{label}</span>
    </p>
  );
}
