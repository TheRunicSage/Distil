# UI Refresh — Migration Brief

Source of truth for the 2026-05-10 design refresh. Future sessions: read
this end-to-end before touching any visual primitive.

Source assets (Claude Design HTML exports, ~3-7 MB each, fonts inlined):
`Sign in.html` · `Landing _ full flow.html` · `Master CV upload.html` ·
`Settings.html` · `Paused _ needs more input.html` · `History _ grouped_
scannable.html` · `Ready to send.html` (located in `~/Downloads/` on the
user's machine, not staged — too large for git).

---

## Thesis

> "Make the website look more modern and polished. Utilise **glow over
> hover** for buttons and other things that make the website look polished."
> — User, 2026-05-10

Glow-over-hover is the unifying polish lever. Where today we use bg-color
shifts on hover (`bg-dark3` ← `bg-dark2`), the refresh prefers a subtle
orange-glow box-shadow halo as the primary hover affordance for primary
actions, with bg-shifts retained as a secondary cue. Modern app convention
(Linear, Vercel, Stripe). WCAG 2.2 AA contrast preserved — glow is purely
additive.

---

## Token diff (current → refresh)

### Brand orange (✓ unchanged)
| Token | Current | Refresh |
|---|---|---|
| `--color-orange` | `#e2613b` | same |
| `--color-orange-light` | `#f07050` | same |
| `--color-orange-subtle` | `rgba(..., 0.08)` | same |
| `--color-orange-glow` | `rgba(..., 0.18)` | same |
| `--color-orange-dim` | `rgba(..., 0.15)` | `rgba(..., 0.08)` (refresh tightens) |
| **NEW** `--orange-deep` | — | `#c44a26` (depth shadow / pressed states) |
| **NEW** `--orange-tint` | — | `rgba(..., 0.04)` (super-subtle wash) |

### Surface elevation (dark mode — slightly tweaked)
| Token | Current | Refresh |
|---|---|---|
| `--color-dark` | `#11111a` | `#0f0f15` |
| `--color-dark2` | `#1a1a24` | `#16161e` |
| `--color-dark3` | `#25252f` | `#1d1d27` |
| `--color-dark4` | `#2f2f3a` | `#262631` |
| **NEW** `--bg-elev` | — | `#2f2f3a` (popover / floating surface) |

Refresh adds a 5th elevation level. Page → subordinate → card → hover →
popover/floating now five rungs. Our current scale collapsed popover and
hover into one (`dark4`).

### Light mode (✓ largely unchanged)
| Token | Current (`:root:not(.dark)`) | Refresh (`--paper-*`) |
|---|---|---|
| Page bg | `#f5f3ed` | `#fbfaf6` (slightly warmer) |
| Card | `#ffffff` | `#ffffff` |
| Border | `#e8e8e0` | `#e8e6dd` |
| Text primary | `#15140e` | `#15140e` ✓ |
| Text muted | `#3f3d36` | `#6b6960` (refresh is lighter — better proportional contrast vs new sans) |

### Text scale (gains a 3rd tier)
| Token | Current | Refresh |
|---|---|---|
| Primary | `--color-text: #f0efe8` | `--text: #f3f1ea` |
| Secondary | `--color-text-muted: #cfceda` | `--text-2: #cfceda` ✓ |
| **NEW** Tertiary | — | `--text-3: #8e8d99` (timestamps, IDs, dim labels) |
| Dim | `--color-dim: rgba(0.36)` | `--text-dim: rgba(243,241,234,0.42)` |

### Lines / borders (gains a 3-level system)
| Token | Current | Refresh |
|---|---|---|
| `--border` | `rgba(255,255,255,0.07)` (single value) | `--line: 6%` |
| **NEW** | — | `--line-2: 10%` (medium emphasis) |
| **NEW** | — | `--line-strong: 16%` (focused / selected) |

### Radii (more explicit scale)
| Token | Current | Refresh |
|---|---|---|
| `--r-xs` | calc-derived ~6px | `6px` |
| `--r-sm` | calc-derived ~8px | `8px` |
| `--r-md` | calc-derived ~10px | `12px` |
| `--r-lg` | calc-derived ~14px | `16px` |
| `--r-xl` | calc-derived ~18px | `22px` |
| `--r-2xl` | calc-derived ~22px | `28px` |

Refresh radii are larger and more generous — cards / panels feel softer.

### Semantic accents (✓ unchanged)
`--success #3ecf8e` · `--warn #f0a030` · `--danger #e25b5b` ·
`--info #4b9fe8` · `--innovation #8b7ee8`. Our `--rose` / `--cyan`
admin tokens have no refresh equivalent — keep as-is.

### Typography (2 changes)
| Family | Current | Refresh |
|---|---|---|
| Serif | `Fraunces` | `Fraunces` ✓ |
| Sans | **`Outfit`** (next/font/google) | **`Inter`** |
| Mono | none | **`JetBrains Mono`** (NEW) |

Inter is denser at the same px size — paragraphs may feel tighter without
scale change. JetBrains Mono is the de-facto modern app mono (used for
IDs, timestamps, queue positions, anywhere `.tabular` numerics matter).

---

## Primitive vocabulary mapping

Refresh markup uses these semantic class names. Most map to existing
Distil primitives; a few are net-new.

### Existing — keep, retune
| Refresh class | Distil class | Action |
|---|---|---|
| `.btn-primary` | `.btn-primary` | Retune sizing + glow on hover |
| `.btn-secondary` | `.btn-secondary` | Retune + glow |
| `.btn-ghost` | `.btn-ghost` | Retune |
| `.btn-link` | `.btn-link-orange` | Rename or alias |
| `.eyebrow` / `.eyebrow-muted` | same | Retune to refresh weight |
| `.surface` | `.surface-card` | Add `.surface-card-interactive` glow |
| `.surface-row` | `.surface-row` | Add glow on hover |
| `.h-display` | `.heading-display` | Rename or alias; retune scale |
| `.h-section` | `.heading-section` | Same |
| `.meta` | `.text-meta` | Same |
| `.ambient` / `.ambient-orange` / `.ambient-violet` | same | ✓ unchanged |
| `.wordmark` / `.wordmark-name` / `.wordmark-by` | bespoke recipe | Extract into primitive |

### Net-new primitives
| Class | Role |
|---|---|
| `.pill` + `.pill-success` / `.pill-running` / `.pill-queued` / `.pill-warn` / `.pill-danger` / `.pill-info` | Status pill with state variants. Replaces our current `status-pill + tone classes` recipe. |
| `.dot` + `.dot-pulse` | Small status dot affordance (running state cue). |
| `.btn-lg` / `.btn-sm` | Button size variants. We currently have one size only. |
| `.mono` | Monospace text helper (uses `--mono`). |
| `.tabular` | Tabular numerics (`font-variant-numeric: tabular-nums`). |
| `.lead` | Leading paragraph below an h-display. |
| `.kbd` | Inline keyboard shortcut chip. |
| `.chapter` + `.chapter-num` | Numbered section markers (landing rhythm). |
| `.paper` | Light-mode preview surface (distinct from card — preview-document treatment). |
| `.serif` / `.italic` / `.fade-up` / `.rise` | Inline font/animation helpers. |

### Glow polish — applied per primitive
| Primitive | Glow recipe (hover) |
|---|---|
| `.btn-primary` | `box-shadow: 0 0 0 1px var(--orange), 0 0 24px -2px var(--orange-glow), 0 4px 20px -8px rgba(0,0,0,0.4)` |
| `.btn-secondary` | Subtle orange tint glow + border-color shift to orange/40 |
| `.surface-card-interactive` | `box-shadow: 0 0 0 1px var(--orange-glow), 0 8px 28px -8px var(--orange-glow)` |
| `.surface-row` | Same shape as interactive card, lower amplitude |
| `.btn-pill` | Border-color → orange/40 + small glow |
| `.btn-icon` (active) | Subtle outline glow on focus / active state |

Glow uses CSS transitions on `box-shadow` (220ms ease-out). Falls back
gracefully on browsers / users with reduced motion (still gets the
shadow, just no transition).

---

## Topbar redesign (DP-4 Option C + DP-5 Option B)

### Current topbar
`Distil` wordmark · New application (orange CTA) · History · ThemeToggle ·
Settings (gear icon)

### Refresh topbar
`Distil` wordmark · New application (orange + GLOW on hover) · History ·
**`<UserMenu>` dropdown** (replaces ThemeToggle + Settings)

### `<UserMenu>` dropdown contents
1. **Email header** (read-only, top of panel, muted)
2. **Theme** — toggle item (Sun/Moon icon + label, click toggles)
3. **FAQ** — link → `/faq`
4. **Settings** — link → `/settings`
5. **Sign out** — form action

### Trigger
Small circular avatar showing the user's email's first letter. Uses
`.btn-icon`-sized shell with a 1px orange ring on hover (glow). Avatar
bg = `--color-orange-subtle`, text = `--color-orange`.

### Accessibility (WAI-ARIA Authoring Practices)
- Trigger: `aria-haspopup="menu"`, `aria-expanded={open}`, `aria-label="Account menu"`
- Panel: `role="menu"`
- Items: `role="menuitem"` (or `menuitemcheckbox` for theme toggle)
- Keyboard: ArrowUp/Down navigates, Enter activates, Esc closes, Tab moves focus to next page element
- Focus management: trap focus inside panel when open; return focus to trigger on close
- Click outside panel closes
- Pointer-events: panel positioned absolutely, no scroll-lock (small dropdown)

### Settings page changes
With Sign-out moving to the dropdown, /settings drops the "Session" section.
Settings page becomes:
- Account (email, member since, role)
- Master CV management
- Admin tools (gated)
- Standards & data
- Danger zone (delete account)

`/settings` is now reachable ONLY via the UserMenu (per user directive). No
gear icon in topbar. /admin/* still has its sub-nav and "Back to settings"
back-link, both unchanged.

### Landing topbar (signed-out)
No UserMenu (no user). Keep: `Distil` wordmark · Sign in (btn-ghost) ·
ThemeToggle (still useful for unauth visitors deciding theme) · Get
started (btn-primary). The standalone ThemeToggle stays on landing
because there's no UserMenu to host it. Avoids requiring sign-in to
choose theme.

---

## Migration roadmap

Phase order locked from DP-1 Option A. Each phase = single commit, deployed
to Vercel preview, verified before next phase.

| Commit | Surface | What changes | Risk |
|---|---|---|---|
| 1 | docs | Stage this brief | none |
| 2 | tokens | `app/globals.css` `@theme` + light-mode overrides | low — primitives still resolve correctly via existing names; new tokens are additive |
| 3 | typography | `app/layout.tsx` Outfit→Inter; add JetBrains Mono | medium — every text element shifts metrics |
| 4 | primitives + glow | `app/globals.css` `@layer components` retune + new primitives + glow on hover | medium — affects every page using primitives |
| 5 | topbar redesign | UserMenu dropdown component + TopbarNav rewrite + Settings page sign-out removal | low — scoped to topbar + settings page |
| 6+ | per-page polish | One commit per surface in priority order: dashboard, application/[id], settings, upload, history, admin, application/new, landing | varies — bounded per page |

Verification checklist per phase:
- `npx tsc --noEmit` clean (only pre-existing DeepSeek errors)
- Vercel preview at 375 / 768 / 1024px viewports
- Both light + dark themes
- Keyboard navigation through topbar + dropdown
- Screen reader announcement of dropdown state changes

---

## What's NOT changing (locked)

Per CLAUDE.md and prior Decision Log entries:
- DOCX renderer (`lib/docx/`) — canonical artefact, ATS spec
- CV preview (`components/application/CvPreview.tsx`) — fixed-pixel pagination contract
- Cover letter preview (`components/application/CoverLetterPreview.tsx`) — same
- PreviewPanel / PreviewZoomModal / PagedPreview
- LLM output schema (`lib/llm/output-schema.ts`)
- System prompt (`prompts/system-prompt-v2.md`)
- Inngest pipeline (10 steps, retry route, watchdog)
- The `--rose` and `--cyan` admin status pill colors (no refresh equivalent; serve a different role)
- Brand orange color value (`#e2613b`) — refresh keeps it identical

---

## Decision Log entries to add

Each commit should add a `[14]` entry to CLAUDE.md Decision Log under the
existing audit-pass / refresh history. Reference this file for the broader
plan to avoid re-litigating decisions per commit.

The decisions captured here:
- DP-1 = A (phased migration)
- DP-2 = A (Outfit → Inter wholesale)
- DP-3 = A (add JetBrains Mono via next/font/google)
- DP-4 = C (5-item UserMenu dropdown: Email · Theme · FAQ · Settings · Sign out)
- DP-5 = B (glow on primary buttons, applied site-wide as polish thesis)
- DP-6 = A (this brief)
