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
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <header className="mb-10 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange">
            Curiosum
          </p>
          <h1 className="mt-2 font-serif italic text-4xl text-foreground">
            Distil
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Sign in to continue.
          </p>
        </header>

        <form action={formAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Email
            </span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="h-11 rounded-sm border border-border bg-dark3 px-3.5 text-sm text-foreground placeholder:text-dim focus:border-orange focus:outline-none"
              placeholder="you@curiosum.ai"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Password
            </span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-11 rounded-sm border border-border bg-dark3 px-3.5 text-sm text-foreground placeholder:text-dim focus:border-orange focus:outline-none"
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
            className="mt-2 h-11 rounded-sm bg-orange px-4 text-sm font-medium text-white transition-colors hover:bg-orange-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
