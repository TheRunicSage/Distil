# Session bootstrap prompt

Paste this into a fresh Claude Code session to bring the agent up to speed
on the current state of Distil. Updated 2026-05-16 after the CLAUDE.md
refactor (1826 → 789 lines, topic-first Decision Log).

---

We're working on **Distil** — a Next.js 16 App Router job-application tailoring
service. Master CV + JD in, tailored CV + cover letter (DOCX) out.

Stack: Next.js 16 / React 19.2.4 stable / Tailwind v4 / shadcn-ui / Supabase /
Vercel / Inngest v4 / framer-motion ^11. LLM via a provider switch
(`LLM_PROVIDER=anthropic` default → Sonnet 4.6 with native web search;
`LLM_PROVIDER=deepseek` → V4 Pro with Tavily web search in a client-side tool
loop). Dual system prompts at `prompts/system-prompt-claude.md` and
`prompts/system-prompt-deepseek-flash.md`. Repo:
https://github.com/TheRunicSage/Distil.

## Step 1 — Sync

- `git pull origin main`. Confirm clean working tree.
- Confirm the worktree. If there are siblings under `.claude/worktrees/`, stay
  in the most recent one (shell cwd resets between bash calls on Windows; use
  absolute paths).
- Report HEAD commit (hash + one-line title).

## Step 2 — Read CLAUDE.md end-to-end

It's 789 lines (just refactored). Pay attention to:

- **How to Behave in This Codebase** — Decision Point Protocol, Simplicity Rule,
  No Assumptions Rule. Binding.
- **Interface Contracts** — locked TypeScript signatures for `ApiError`,
  `withLogging`, `withIdempotency`, `LlmProvider`, `apiFetch`, `cost-cap`. Don't
  change these without a Decision Point.
- **Generation Pipeline (10.5 steps)** — `language-check` at 8.5; cause-chain
  failure shape for `validate-output`; watchdog has two passes.
- **Decision Log** — organised topic-first now (was step-number-prefixed). Each
  topic carries the *current binding state*, not the journey. Read the topic
  headers (Standing principles · Tooling · LLM provider · System prompts ·
  Output schema strictness · Inngest pipeline · SSE + API · Crons · Auth +
  roles · UI + design system · DOCX · Email · Sentry · Verification). Anything
  superseded is in `git log`, not here.
- **Open TODOs** — admin route-group split, DeepSeek strict-mode / thinking
  mode, language-drift L5–L12 followups, `applications.region` cleanup.

Also worth knowing without reading:

- **Tuning of motion / cursor / dot constants lives in code comments**, not in
  CLAUDE.md (`components/app/CustomCursor.tsx`, `MagneticDots.tsx`,
  `components/ambient/AmbientParticles.tsx`, `ScrollIndicator.tsx`,
  `components/app/MotionProvider.tsx`). Don't re-document it.
- **GitHub main is source of truth.** Local `tsc` errors from missing env /
  packages are environmental drift — verify via Vercel build, never act on
  errors in files you didn't touch.
- **`prompts/system-prompt-claude.md` and `prompts/system-prompt-deepseek-flash.md`
  are the canonical source for prompt rules.** Don't reproduce them in CLAUDE.md
  edits — point at the file.

## Step 3 — Map the app

Don't read every file. Skim names + spot-check anything that looks orphaned or
that CLAUDE.md's Decision Log references:

- `app/` — App Router pages. `(app)/` for authenticated; top-level for
  public-but-auth-aware (`faq`) and landing/login. API routes under `app/api/`.
- `prompts/` — two active system prompts; switched at function-invocation time
  via `LLM_PROVIDER`.
- `lib/llm/` — neutral provider switch (`index.ts`), types, output schema
  (with audit history at top), cost cap, neutral tool definition, sanitiser,
  language-check.
- `lib/anthropic/`, `lib/deepseek/` — provider implementations.
- `lib/auth/` — roles (`roles.ts`), `require-admin.ts`. Migration 0006 replaced
  `is_admin BOOLEAN` with `role TEXT` (user/team/admin).
- `inngest/functions/generate-application.ts` — the 10.5-step pipeline.
- `lib/docx/` — DOCX rendering. CV uses dense profile; cover letter uses
  canonical + expanded structural air. Brand band on both.
- `components/` — `app/` shell (topbar, theme toggle, AmbientBackground,
  MagneticDots, AppShell, MotionProvider, PageTransition, ChainCard, FadeUp),
  `application/` (success view, previews, zoom modal, live view),
  `ambient/` (AmbientParticles, ScrollIndicator), `admin/` (role picker).
- `supabase/migrations/` — 0001–0006. Never modify a past migration.
- `docs/` — operational docs (`llm-output-risks.md`, `manual-verification.md`,
  `smoke-test.md`, `sentry-alerts.md`).

## Step 4 — Report back

When synced and oriented, reply with:

- Confirmation you've pulled latest main and the tree is clean.
- HEAD commit hash + one-line title.
- Confirmation you've read CLAUDE.md end-to-end.
- A one-paragraph summary of what Distil is and where the most recent work
  landed (look at the last 5–10 commits via `git log`).
- A short note flagging any inconsistencies you spot between CLAUDE.md and the
  actual code while mapping.

Then standby. Do not propose changes, write code, or run anything beyond the
git pull + reading until I give a concrete task.
