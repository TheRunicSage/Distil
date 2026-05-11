"use client";

// Login screen. First impression — dark theme, Instrument Serif hero per
// §12.3. Polish lands in build sequence step 14; this is the functional
// version per step 6. Generic error message (no user enumeration).

import Link from "next/link";
import { useActionState } from "react";
import { MagneticDots } from "@/components/app/MagneticDots";
import { signIn, type SignInResult } from "./actions";

const initialState: SignInResult = undefined;

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <>
      {/* Minimal header so a visitor who reached /login from a campaign
          link can return to the marketing site via the brand wordmark.
          No nav cluster — login is intentionally distraction-free. */}
      <header className="sticky top-0 z-30 flex h-[60px] shrink-0 items-center border-b border-border/50 bg-dark/70 px-4 backdrop-blur-md sm:px-6">
        <Link
          href="/"
          aria-label="Distil home"
          className="flex items-baseline gap-3 outline-none focus-visible:opacity-80"
        >
          <span className="font-serif text-2xl font-light tracking-tight text-text">
            Distil
          </span>
          <span className="hidden text-sm font-semibold uppercase tracking-[0.18em] text-orange sm:inline">
            Curiosum.ai
          </span>
        </Link>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-6 py-16">
        <div className="ambient-blob ambient-blob-orange" aria-hidden />
        <div className="ambient-blob ambient-blob-violet" aria-hidden />
        <MagneticDots />
      <div className="relative z-10 w-full max-w-md">
        <header className="mb-12 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-orange">
            Curiosum.ai
          </p>
          <h1 className="mt-3 font-serif text-5xl font-light tracking-tight text-foreground">
            Distil
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Your CV, stripped to its sharpest form.
          </p>
        </header>

        <form action={formAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Email
            </span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="h-12 rounded-xl border border-border bg-dark2/80 px-4 text-sm text-foreground backdrop-blur-sm placeholder:text-dim focus:border-orange focus:outline-none"
              placeholder="you@curiosum.ai"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Password
            </span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-12 rounded-xl border border-border bg-dark2/80 px-4 text-sm text-foreground backdrop-blur-sm placeholder:text-dim focus:border-orange focus:outline-none"
            />
          </label>

          {state?.error ? (
            <p
              role="alert"
              className="text-sm text-danger"
              data-testid="signin-error"
            >
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-3 h-12 rounded-xl bg-orange px-4 text-sm font-semibold tracking-wide text-white transition-[transform,box-shadow,background-color] duration-200 hover:bg-orange-light hover:shadow-[0_6px_18px_rgba(226,97,59,0.28)] disabled:cursor-not-allowed disabled:opacity-60 motion-safe:active:scale-[0.97]"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
      </main>
    </>
  );
}
