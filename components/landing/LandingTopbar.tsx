// Public landing-page topbar. Mirrors the (app) shell shape so a visitor
// who later signs in feels visual continuity, but without auth-aware
// nav: the right-hand cluster is theme toggle + "Sign in" + primary
// "Get started". No Supabase, no AppShell, no gear icon.

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { ThemeToggle } from "@/components/app/ThemeToggle";

export function LandingTopbar() {
  return (
    <header className="sticky top-0 z-30 flex h-[60px] shrink-0 items-center justify-between border-b border-border/50 bg-dark/70 px-4 backdrop-blur-md sm:h-[72px] sm:px-6">
      <Link
        href="/"
        className="flex items-baseline gap-3 outline-none focus-visible:opacity-80"
      >
        <span className="font-serif text-2xl font-light tracking-tight text-text sm:text-4xl">
          Distil
        </span>
        <span className="hidden text-sm font-semibold uppercase tracking-[0.18em] text-orange sm:inline">
          Curiosum.ai
        </span>
      </Link>
      <nav className="flex items-center gap-1.5 sm:gap-2.5">
        <Link href="/login" className="btn-ghost">
          Sign in
        </Link>
        <ThemeToggle />
        <Link href="/login" className="btn-primary">
          Get started
          <ArrowRightIcon size={16} aria-hidden />
        </Link>
      </nav>
    </header>
  );
}
