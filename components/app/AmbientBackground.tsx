// Two slow-floating, heavily-blurred radial-gradient blobs that sit
// behind the app shell. Pure visual atmosphere — no interactivity, no
// content. The keyframes and blob CSS live in app/globals.css so this
// component is just a tiny structural mount.
//
// Mounted at the root of the (app) layout so every authenticated page
// gets the same ambient backdrop. The login route has its own copy.

export function AmbientBackground() {
  return (
    <>
      <div className="ambient-blob ambient-blob-orange" aria-hidden />
      <div className="ambient-blob ambient-blob-violet" aria-hidden />
    </>
  );
}
