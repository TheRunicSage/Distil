# Handoff prompt — UI polish: scale down + micro-interactions

Paste the body below into a fresh Claude Code chat in this worktree.
Self-contained; do not need to refer back to this conversation.

---

We're working on Distil (Job Application Tailoring Service, Next.js 16 App Router on Vercel + Supabase). Worktree: `C:\Users\ZnD\Desktop\webbbb`. Pull main first, read `CLAUDE.md` end-to-end before writing any code.

## Context

A 14-commit UI refresh (phases 1 → 6d → 7a) was attempted and **reverted entirely** — see commit `f5563da Revert UI refresh entirely; back to 18fa780`. Tree state is now back at `18fa780 "Guided error recovery"` which was the last good commit. Reading the Decision Log in CLAUDE.md is essential — it documents what the refresh tried, why it didn't work, and what's locked. Do **not** re-litigate any of those decisions.

What was tried in the refresh and reverted:
- Wholesale typography swap (Outfit → Inter, add JetBrains Mono)
- Token layer (5-level surface elevation, 3-tier text scale, 3-level line system, larger radii, orange-deep / orange-tint)
- Primitive retune (.pill family, .dot-pulse, .lead, .chapter, .mono, .tabular)
- UserMenu dropdown replacing standalone ThemeToggle + Settings gear
- Per-page polish (chapter rhythm, italic-emphasis h-sections)

The refresh was reverted because it didn't carry the polish — felt awkward, "missing something." Lessons: wholesale changes break the calibration; small targeted improvements work better than big rewrites; mockup-driven layout porting doesn't survive contact with real schema constraints.

## What the user wants now

Two coupled goals, expressed by the user verbatim:

1. **"Introduce small interactions, system responsiveness to user navigation so things like glow on hover, small kickback from the UI when a user clicks on something."**
2. **"Make the UI appear more naturally on the full resolution, currently entire UI seems to be oversized a bit can we scale everything down?"**

Goal 1 is *additive* (new behaviour, no risk). Goal 2 is *recalibrative* (touches the existing audit-pass tuning).

## Where the calibration sits today

After the revert, we're at the audit-pass-4 calibration (Decision Log [14] 2026-05-09):
- `.btn-primary` / `.btn-secondary`: `px-5 py-2.5 text-base` (~40px tall — already modern-app norm per Linear/Vercel/Stripe)
- `.btn-icon`: `size-10` (40px — meets WCAG 2.2 AAA tap target)
- `.btn-ghost`: `px-4 py-2 text-base`
- `.heading-display`: `text-4xl sm:text-6xl` (← desktop hero may genuinely be too big at text-6xl)
- `.heading-section`: `text-3xl sm:text-4xl`
- `.surface-card`: `p-6 sm:p-8` (32px desktop padding inside a 720px max-width column)
- `(app)/layout.tsx` topbar: `h-[60px] sm:h-[72px]`, wordmark `text-2xl sm:text-4xl`, main `py-10 sm:py-16`, max-w-[760px]
- Body text via `font-sans` defaults to Tailwind's `text-base` (16px)

The audit-pass-2 commit explicitly bumped everything one notch up because one teammate found grey/secondary text undersized. Audit-pass-4 walked back the BUTTONS to modern norms but kept headings and surface paddings at the bumped sizes. The user is now saying that wasn't enough — desktop full-resolution still feels oversized for everything else (likely headings, surface paddings, vertical chrome between sections).

The May-3 contrast lift on `--muted-foreground` from rgba(0.66) → rgba(0.82) (the actual a11y readability fix) is locked — don't undo that. Size and contrast are independent levers.

## Locked surfaces (don't touch)

Per CLAUDE.md and the Decision Log:
- DOCX renderer (`lib/docx/`) — canonical artefact, ATS spec
- CV preview (`components/application/CvPreview.tsx`) — fixed-pixel A4 pagination contract; `PagedPreview` math is keyed to a 1123px page height, so any html-base-font bump will silently break it
- Cover letter preview (`components/application/CoverLetterPreview.tsx`)
- PreviewPanel / PreviewZoomModal / PagedPreview
- LLM output schema (`lib/llm/output-schema.ts`) — `fit_assessment.score` is the enum `["strong", "moderate", "weak"]`; do not invent metrics like "82/100" or "6 of 7 signals"
- System prompt (`prompts/system-prompt-v2.md`)
- Inngest pipeline (10 steps, retry route, watchdog)
- Brand orange `#e2613b` and the existing `.dark` / `:root:not(.dark)` token palette
- The May-3 `--muted-foreground` rgba(0.82) contrast lift — that's an a11y fix, separate from sizing
- Outfit sans + Fraunces serif as the typography pair

## What to do (per CLAUDE.md Decision Point Protocol)

Surface DPs first, wait for picks, then code. Do **not** start coding immediately. Specifically expect DPs around:

1. **Scale-down strategy** — single html base-font reduction (cascades cleanly but the html-base-font path is **booby-trapped** by `PagedPreview`'s 1123px constant, so this is risky); manual primitive-by-primitive walk-back of headings + surface paddings + topbar / main chrome (slow but bisectable); or hybrid with explicit overrides on preview islands.
2. **What's "oversized"** — confirm the user's mental model: is it primarily heading scale, surface padding, vertical section gaps, body text base, or something else? An audit pass should sample 3 pages (e.g. dashboard, application/[id] success view, settings) at 1920×1080 vs 1440×900 vs 1280×800 and name the worst offender per page before any commit lands.
3. **Glow-on-hover scope** — apply to all primary CTAs and interactive surfaces site-wide (the polish thesis from the reverted phase 4); apply only to the hero + dashboard chains + settings rows (the "first three surfaces a user touches" set); or apply per-primitive opt-in (a `.glow-on-hover` modifier added to specific call sites). Each option has implications for the visual baseline.
4. **Click kickback shape** — `transform: scale(0.97)` on `:active` (universal, instant, no JS); a CSS ripple from cursor xy via a tiny client wrapper (the reverted PrimaryLink approach — needs a client component); or a colour-deepen + brief inset-shadow on `:active` (no transform, low risk). Different visual languages.
5. **Verification** — code-inspection ship + Vercel preview check (matches established Decision Log [14] pattern); or run dev server locally at 1920/1440/1280 viewports before push.
6. **Commit boundary** — one commit per concern (interactions in one, scale-down in another); one commit per page (dashboard separate from application/[id] separate from settings); or single coherent commit "phase 7b polish" if changes are small enough.

## Standing principles from CLAUDE.md

- "Every file should do one thing"
- "Prefer 10 lines of obvious code over 5 lines of clever code"
- "If a behaviour is not explicitly described in this file or in app_handoff_v8.md, treat it as a Decision Point"
- Per-pass discipline: small enough to bisect a regression
- The 18fa780 → f5563da revert was non-destructive (single revert commit) so re-introducing select pieces of the refresh by cherry-pick or by hand is viable if the user wants — but only with explicit DP picks, not as a sweep

## Push flow

Branch on `claude/<your-worktree-name>`. Push: `git push origin <branch>:main`. `npx tsc --noEmit` clean expected (only pre-existing `lib/deepseek/provider.ts` errors are OK).

## Report back in this order

1. Confirmation you've pulled main, read CLAUDE.md (especially the Decision Log [14] entries from 2026-05-08 / 2026-05-09 audit passes 1–4 and the 2026-05-10 refresh entries that landed before the revert), and read this handoff
2. Sample of the divergence audit — name 2–3 pages with the biggest "feels oversized at desktop" gap and what specifically reads as too large (2-3 lines per page, no implementation plan yet)
3. The DPs (per the six points above)
4. Proposed commit order

Wait for user picks before any code.
