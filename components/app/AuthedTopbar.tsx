// Authenticated topbar JSX, factored out of app/(app)/layout.tsx so any
// public-but-auth-aware page (FAQ, future Pricing / Terms, etc.) can
// render the same shape via <AuthAwareTopbar> without duplicating the
// wordmark + nav structure. Server component — no client JS in this
// file (the children of <nav> are the (app) shell's existing client
// components and bring their own "use client").

import Link from "next/link";
import { TopbarNav } from "@/components/app/TopbarNav";
import type { Role } from "@/lib/auth/roles";

type Props = {
  email: string;
  hasCv: boolean;
  role: Role;
};

export function AuthedTopbar({ email, hasCv, role }: Props) {
  return (
    <header className="sticky top-0 z-30 flex h-[56px] shrink-0 items-center justify-between border-b border-border/50 bg-dark/70 px-4 backdrop-blur-md sm:h-[64px] sm:px-6">
      <Link
        href="/dashboard"
        className="flex items-baseline gap-3 outline-none focus-visible:opacity-80"
      >
        <span className="wordmark-breathe font-serif text-xl font-light tracking-tight text-text sm:text-3xl">
          Distil
        </span>
        <span className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-orange sm:inline">
          Curiosum.ai
        </span>
      </Link>
      <nav className="flex items-center gap-1.5 sm:gap-2.5">
        <TopbarNav hasCv={hasCv} email={email} role={role} />
      </nav>
    </header>
  );
}
