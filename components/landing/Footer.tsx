// Minimal landing footer. Wordmark, attribution, sign-in link.

import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-dark/70 px-6 py-8 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-lg font-light tracking-tight text-text">
            Distil
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange">
            by Curiosum.ai
          </span>
        </div>
        <div className="flex items-center gap-6 text-meta">
          <span>&copy; 2026 Curiosum.ai</span>
          <Link href="/login" className="btn-link-orange">
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}
