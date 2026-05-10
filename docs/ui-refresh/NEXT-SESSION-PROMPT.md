# Fresh-session prompt — UI refresh phase 7 (layout migration)

Copy the block below into a new Claude Code chat. It's self-contained — the
new session has no memory of this one.

---

We're working on Distil (Job Application Tailoring Service, Next.js 16
App Router on Vercel + Supabase). Worktree: `C:\Users\ZnD\Desktop\webbbb`.
Pull main first, read CLAUDE.md end-to-end, and read
`docs/ui-refresh/REFRESH.md` end-to-end before writing any code.

## Context

A 6-phase UI refresh shipped over 9 commits. What landed:

1. Token layer — refresh palette, 5-level surface elevation, 3-tier text
   scale, 3-level line system, larger radii (`docs/ui-refresh/REFRESH.md`
   has the full diff)
2. Typography — Outfit→Inter, JetBrains Mono added
3. Primitives + glow polish — all `.btn-*` / surfaces gain orange-glow
   halo on hover; new `.pill` family, `.dot`/`.dot-pulse`, `.lead`,
   `.mono`, `.tabular`, `.kbd`, `.chapter`, `.paper`, `.btn-lg/sm`
4. UserMenu dropdown — replaces the standalone ThemeToggle + Settings
   gear in the (app) topbar. Settings reachable only via UserMenu
5. Per-page polish (commits 6a–6d) — `.lead` for hero subtitles,
   `.pill ${variant}` for status pills, dot-pulse on running states,
   `.mono`/`.tabular` for IDs

## The problem

User feedback: **the site reads as LESS polished than it did before the
refresh started.**

Diagnosis: the primitives and tokens migration shipped, but the
underlying page LAYOUTS and COMPOSITION patterns are still on the
pre-refresh structure. New vocabulary speaking through old grammar.
Per-element substitutions (`.lead`, `.pill`) don't fix:

- Section spacing rhythm (gap between hero / panels / cards)
- Card composition density (which content sits inside `.surface-card` vs
  outside it)
- Information hierarchy (eyebrow → display → lead → meta cadence on each
  page)
- The "chapter" rhythm on landing — refresh markup uses `.chapter` +
  `.chapter-num` for numbered section markers; we never adopted them
- The right-rail / 2-column composition on Settings (refresh splits
  account info from action surfaces)
- Empty-state vs populated-state layouts (refresh uses different padding
  + max-widths for each)
- Column / grid breakpoints across history, dashboard, admin

## Source assets

7 Claude Design HTML exports (~3-7 MB each) on the user's machine, NOT
in the repo:

```
C:\Users\ZnD\Downloads\Sign in.html
C:\Users\ZnD\Downloads\Landing _ full flow.html
C:\Users\ZnD\Downloads\Master CV upload.html
C:\Users\ZnD\Downloads\Settings.html
C:\Users\ZnD\Downloads\Paused _ needs more input.html
C:\Users\ZnD\Downloads\History _ grouped_ scannable.html
C:\Users\ZnD\Downloads\Ready to send.html
```

**Reading shape**: each file has fonts inlined as base64 (multi-MB),
then a single `<style>` block (mostly @font-face), then a `<body>` with
inline-style attributes carrying the design tokens as CSS custom
properties. Do NOT `Read` these whole — they'll blow context. Use
`ctx_execute` (Node) to extract:

- Body markup tree (skip `style="..."` attribute soup, keep tag/class
  outline)
- Section ordering and grid composition
- max-width values per major container
- Spacing values (margin/padding) at each layout breakpoint
- Specific component compositions (e.g. how `.surface` panels stack on
  Settings)

The previous session already extracted the design tokens — those are in
`docs/ui-refresh/REFRESH.md`. You're after LAYOUT now, not tokens.

## What to do

Per CLAUDE.md "How to Behave in This Codebase" Decision Point Protocol:
**surface DPs first, wait for the user to pick, THEN write code.**

Do NOT start coding immediately — surface the migration plan as DPs.
Specifically I expect DPs around:

1. **Audit method**: read all 7 mockups vs current pages and produce a
   per-page divergence list, OR pick the 2–3 highest-payoff pages first
   and iterate
2. **Per-page commit boundary**: one commit per page, OR group related
   pages (e.g. all admin in one commit)
3. **How to handle composition primitives we don't have yet** — the
   refresh uses some layout-level patterns (`.chapter`, hero/lead
   pairing, panel-inside-section structure) that may need new component
   files OR section-shaped class primitives in `globals.css`
4. **Verification approach**: visual diff on Vercel preview deferred to
   me, OR you spin up the dev server and check at 375/768/1024 (note:
   user's pattern is to verify on Vercel after the commit lands)

## Locked surfaces (do not touch)

Per CLAUDE.md and the Decision Log:
- DOCX renderer (`lib/docx/`) — canonical artefact, ATS spec
- CV preview (`components/application/CvPreview.tsx`) — fixed-pixel A4
  pagination contract
- Cover letter preview (`components/application/CoverLetterPreview.tsx`)
- PreviewPanel / PreviewZoomModal / PagedPreview
- LLM output schema (`lib/llm/output-schema.ts`)
- System prompt (`prompts/system-prompt-v2.md`)
- Inngest pipeline (10 steps, retry route, watchdog)
- Brand orange `#e2613b` and the `.dark` / `:root:not(.dark)` token
  values just shipped — don't re-litigate the palette
- The `--rose` and `--cyan` admin status pill colors

## Standing principles

- "Every file should do one thing"
- "Prefer 10 lines of obvious code over 5 lines of clever code"
- Prefer the latest stable version of any tool we adopt
- Per-pass discipline: each commit small enough to bisect a regression

## Push flow

Branch on `claude/affectionate-brown-c1d822` (or whatever your worktree
sets). Push: `git push origin <branch>:main`. `npx tsc --noEmit` clean
expected (only pre-existing `lib/deepseek/provider.ts` errors are OK).

## Report back in this order

1. Confirmation you've pulled main, read CLAUDE.md, and read REFRESH.md
2. Sample of the divergence audit — name 3 pages with the biggest
   layout-vs-mockup gap and what specifically diverges (2-3 lines per
   page, no implementation plan yet)
3. The DPs (per the four points above)
4. Proposed commit order

Wait for my picks before any code.
