// Two slow-floating, heavily-blurred radial-gradient blobs that sit
// behind the app shell. Pure visual atmosphere — no interactivity, no
// content. The keyframes and blob CSS live in app/globals.css so this
// component is just a tiny structural mount.
//
// Mounted at the root of the (app) layout so every authenticated page
// gets the same ambient backdrop. The login route has its own copy.
//
// Variant prop (2026-05-14):
//   - "default": full intensity + faster drift. Used on landing /
//     login where ambient IS the visual character of the page.
//   - "authed": receded — lower alpha + slower drift period. Used
//     in the (app) shell where ambient is supporting cast, not the
//     leading role. Tuned via [data-variant="authed"] attribute
//     selector in globals.css so the variant lives entirely in CSS.

type Props = { variant?: "default" | "authed" };

export function AmbientBackground({ variant = "default" }: Props = {}) {
  return (
    <>
      <div
        className="ambient-blob ambient-blob-orange"
        data-variant={variant}
        aria-hidden
      />
      <div
        className="ambient-blob ambient-blob-violet"
        data-variant={variant}
        aria-hidden
      />
    </>
  );
}
