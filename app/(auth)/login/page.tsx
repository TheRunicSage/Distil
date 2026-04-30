"use client";

// Login screen. First impression — dark theme, Instrument Serif hero per
// §12.3. Polish lands in build sequence step 14; this is the functional
// version per step 6. Generic error message (no user enumeration).

import { useActionState } from "react";
import { signIn, type SignInResult } from "./actions";

const initialState: SignInResult = undefined;

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <main className="relative flex flex-1 items-center justify-center px-6 py-16">
      <div className="ambient-blob ambient-blob-orange" aria-hidden />
      <div className="ambient-blob ambient-blob-violet" aria-hidden />
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
            className="mt-3 h-12 rounded-xl bg-orange px-4 text-sm font-semibold tracking-wide text-white transition-colors hover:bg-orange-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
