# CLAUDE.md — Job Application Tailoring Service

This file is the single source of truth for any Claude Code session working on this codebase.
Read this file completely before writing any code. Update the Decision Log and Build Status
sections as work progresses so the next session can continue without re-reading the full spec.

---

## How to Behave in This Codebase

**Decision Point Protocol**
Whenever you encounter a point where the spec is ambiguous, two reasonable implementations exist,
or you are about to make a non-trivial architectural choice, STOP. Do not proceed. Output a block
in exactly this format:

```
DECISION POINT: [short title]
Context: [one sentence explaining what you are deciding]

Option A — [name]
  What: [what you would build]
  Trade-off: [cost or risk]

Option B — [name]
  What: [what you would build]
  Trade-off: [cost or risk]

Option C — [name]
  What: [what you would build]
  Trade-off: [cost or risk]

Recommendation: [which option and why, one sentence]
```

Wait for the user to select an option before writing any code related to that decision.

**Simplicity Rule**
Every file should do one thing. Every function should have one job. Prefer 10 lines of obvious
code over 5 lines of clever code. If a fresh Claude session cannot understand a function by
reading it once, simplify it.

**No Assumptions Rule**
If a behaviour is not explicitly described in this file or in app_handoff_v8.md, treat it as a
Decision Point. Do not invent behaviour, default values, or UX copy.

**Spec Files**
- `CLAUDE.md` (this file): live state, interfaces, decisions, build status
- `app_handoff_v8.md`: complete architecture reference, DB schema, error codes, Zod schema, env vars
- `prompts/system-prompt-v2.md`: the LLM system prompt loaded at module scope

---

## Stack at a Glance

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14, TypeScript, App Router | |
| UI | shadcn/ui + Tailwind | Components copied into repo, not imported |
| Hosting | Vercel | |
| DB + Auth + Storage | Supabase | Postgres, email/password auth, private buckets |
| LLM | claude-sonnet-4-6 | web_search tool + structured output via tool_use |
| Background jobs | Inngest | Free tier covers internal demo |
| DOCX rendering | docx npm package | Server-side, pure JSON-in Buffer-out |
| PDF parsing | unpdf | Serverless-safe, zero native deps |
| DOCX parsing | mammoth | |
| Email | Resend | DEFERRED past internal demo milestone |
| Date handling | date-fns-tz | |
| Error tracking | Sentry | |
| Validation | Zod | Single schema drives types, tool definition, validation |
| Telemetry | Supabase table | PostHog candidate for v2 |

---

## Repo Structure (complete)

```
.
├── app/
│   ├── (auth)/login/
│   │   ├── page.tsx
│   │   └── actions.ts                  # signIn server action
│   ├── (app)/                          # all authenticated routes
│   │   ├── dashboard/page.tsx
│   │   ├── upload/page.tsx
│   │   ├── application/
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/page.tsx           # handles ALL post-submit states (queued/running/success/error)
│   │   ├── history/page.tsx
│   │   ├── settings/page.tsx
│   │   └── admin/
│   │       ├── usage/page.tsx
│   │       ├── logs/page.tsx
│   │       └── telemetry/page.tsx
│   ├── api/
│   │   ├── master-cv/route.ts
│   │   ├── applications/
│   │   │   ├── route.ts                # POST only
│   │   │   └── [id]/
│   │   │       ├── events/route.ts     # GET SSE
│   │   │       ├── download/[kind]/route.ts
│   │   │       ├── email/route.ts      # DEFERRED
│   │   │       ├── retry/route.ts
│   │   │       └── abandon/route.ts
│   │   ├── inngest/route.ts
│   │   ├── telemetry/route.ts
│   │   └── admin/
│   │       ├── usage/route.ts
│   │       ├── logs/route.ts
│   │       └── telemetry/route.ts
│   ├── layout.tsx
│   ├── globals.css
│   └── not-found.tsx
├── components/
│   ├── ui/                             # shadcn primitives
│   ├── upload/
│   ├── application/
│   │   ├── CvPreview.tsx              # reads llm_response_json, styled React
│   │   └── CoverLetterPreview.tsx     # reads llm_response_json, styled React
│   ├── history/
│   └── admin/
├── lib/
│   ├── supabase/
│   │   ├── browser.ts                 # createBrowserClient
│   │   ├── server.ts                  # createServerClient (cookies)
│   │   ├── service.ts                 # createServiceClient (service role key, Inngest only)
│   │   └── middleware.ts              # session refresh helper
│   ├── anthropic/
│   │   ├── client.ts                  # SDK wrapper — see Interface Contracts below
│   │   ├── pricing.ts                 # PRICING const + calculateCost + COST_CAP_USD
│   │   ├── tool-schema.ts             # zodToJsonSchema bridge
│   │   └── cost-cap.ts                # checkCostCapPre + checkCostCapPost
│   ├── llm/
│   │   ├── build-user-message.ts      # assembles XML user message
│   │   └── output-schema.ts           # ApplicationOutputSchema (Zod) — single source of truth
│   ├── parsing/
│   │   ├── parse-pdf.ts               # unpdf wrapper, 5s timeout, 200 char minimum
│   │   └── parse-docx.ts              # mammoth wrapper
│   ├── docx/
│   │   ├── styles.ts                  # FONTS, SIZES, COLOURS, SPACING, PAGE constants
│   │   ├── helpers.ts                 # heading(), bullet(), contactLine(), roleHeader()
│   │   ├── render-cv.ts               # renderCV(content): Promise<Buffer>
│   │   └── render-cover-letter.ts     # renderCoverLetter(content): Promise<Buffer>
│   ├── email/                         # DEFERRED — stubs only, do not build yet
│   │   ├── client.ts
│   │   └── templates.ts
│   ├── quality/
│   │   └── scan.ts                    # runQualityScan(output, region) — logs warnings, never throws
│   ├── errors/
│   │   ├── codes.ts                   # ERROR_CODES const — copy verbatim from app_handoff_v8.md §7.3
│   │   ├── api-error.ts               # ApiError class — see Interface Contracts below
│   │   ├── sanitise.ts                # sanitiseErrorMessage(msg): string
│   │   └── client.ts                  # getUserMessage(body), isRetryable(body)
│   ├── logging/
│   │   └── with-logging.ts            # withLogging — see Interface Contracts below
│   ├── idempotency/
│   │   └── with-idempotency.ts        # withIdempotency — see Interface Contracts below
│   ├── telemetry/
│   │   ├── events.ts                  # TelemetryEventMap — copy verbatim from app_handoff_v8.md §7.4
│   │   ├── emit.ts                    # emitTelemetry (server)
│   │   └── track.ts                   # trackEvent (client, batches up to 10 / 5s)
│   ├── client/
│   │   ├── api-fetch.ts               # apiFetch — see Interface Contracts below
│   │   └── handle-error.ts            # getUserMessage, isRetryable
│   ├── env.ts                         # Zod-validated env reader, fails fast on missing vars
│   └── utils.ts                       # cn(), tailwind-merge
├── inngest/
│   ├── client.ts                      # createInngestClient
│   ├── functions/
│   │   ├── generate-application.ts    # main function, 10 steps — see Pipeline section
│   │   ├── trigger-next-in-queue.ts
│   │   ├── expire-files.ts
│   │   ├── expire-metadata.ts
│   │   ├── sweep-request-logs.ts
│   │   ├── sweep-idempotency-keys.ts
│   │   └── watchdog-stuck-applications.ts
│   └── steps/
│       ├── acquire-slot.ts
│       ├── load-context.ts
│       ├── inject-date.ts             # overrides {{TODAY}} with Pacific/Auckland date
│       ├── render-and-upload.ts
│       └── finalize.ts
├── prompts/
│   └── system-prompt-v2.md            # loaded at module scope in generate-application.ts
├── supabase/
│   └── migrations/
│       └── 0001_initial.sql           # full SQL in app_handoff_v8.md §6.2
├── proxy.ts                            # Next 16 proxy (was middleware.ts) — calls updateSession from lib/supabase/middleware.ts
├── sentry.client.config.ts
├── sentry.server.config.ts
├── sentry.edge.config.ts
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── .env.example
```

---

## Interface Contracts

These are the locked TypeScript signatures for the files most likely to cause drift across sessions.
Implement exactly these signatures; do not change them without adding a Decision Point.

### `lib/errors/api-error.ts`

```typescript
import { ERROR_CODES, ErrorCode } from './codes';

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;

  constructor(code: ErrorCode, overrideMessage?: string) {
    const entry = ERROR_CODES[code];
    super(overrideMessage ?? entry.user_message);
    this.code = code;
    this.httpStatus = entry.http_status;
    this.name = 'ApiError';
  }
}
```

### `lib/logging/with-logging.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';

type RouteContext = {
  user_id?: string;
  application_id?: string;
};

type RouteHandler = (
  req: NextRequest,
  context: RouteContext
) => Promise<NextResponse>;

export function withLogging(
  name: string,
  handler: RouteHandler
): (req: NextRequest) => Promise<NextResponse>;
```

Behaviour:
- Generates a `request_id` (uuid) at the start of every request
- Sets Sentry tag `request_id`
- Catches `ApiError`: returns `{ error: { code, message } }` JSON with correct HTTP status
- Catches everything else: wraps as `internal_error` 500, reports to Sentry
- Never reports 4xx to Sentry, only 5xx
- Writes to `request_logs` fire-and-forget (do not await)
- Sets `X-Request-Id` response header

### `lib/idempotency/with-idempotency.ts`

```typescript
type IdempotencyOptions = {
  user_id: string;
  route: string;
  body: unknown;
  idempotencyKey: string | null;   // from Idempotency-Key header, null if absent
};

export async function withIdempotency<T>(
  opts: IdempotencyOptions,
  handler: () => Promise<T>
): Promise<{ result: T; replayed: boolean }>;
```

Behaviour:
- If `idempotencyKey` is null, calls handler directly, returns `{ result, replayed: false }`
- Hashes body with SHA-256; throws `ApiError('idempotency_key_conflict')` on hash mismatch
- On cache hit, returns stored result with `replayed: true`
- 10-minute TTL via `idempotency_keys.expires_at`
- Uses service-role client (bypasses RLS)

### `lib/anthropic/client.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { ModelName } from './pricing';

type CallLLMOptions = {
  system: string;
  userMessage: string;
  tools: Anthropic.Messages.ToolUnion[];   // accepts native + server tools (web_search)
  toolChoice:
    | Anthropic.ToolChoiceAuto
    | Anthropic.ToolChoiceTool
    | Anthropic.ToolChoiceAny;
  applicationId: string;
  maxTokens?: number;             // defaults to 16000
};

type CallLLMResult = {
  toolInput: unknown;             // raw tool input, caller validates with Zod
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens: number;
    cache_read_tokens: number;
    web_search_count: number;
  };
  cost_usd: number;               // computed via calculateCost
  model: ModelName;               // surfaced so the caller can write token_usage.model
};

export async function callLLM(opts: CallLLMOptions): Promise<CallLLMResult>;
```

Behaviour:
- Pure SDK wrapper: returns usage + cost, **does not** write to `token_usage`. The Inngest `call-llm` step writes the row using `usage`, `cost_usd`, `model`, plus the `user_id` already in scope at the step level (Decision Log step 8 DP-B — supersedes the original "fire-and-forget at SDK boundary" rule).
- Does NOT apply cost cap itself — caller (Inngest steps) does that
- System prompt is sent as a single text content block with `cache_control: { type: "ephemeral" }`. Per Decision Log step 8 DP-C (REVISED 2026-04-30), caching is now enabled to amortise the ~7-8K-token system prompt across back-to-back generations and retries. Cache token counts continue to feed `calculateCost`.
- `web_search_count` is read from `response.usage.server_tool_use.web_search_requests` (Anthropic's billing source of truth — Decision Log step 8 DP-D).
- Throws `ApiError('llm_failed')` on non-2xx Anthropic response
- Throws `ApiError('llm_invalid_output')` if no tool_use block in response
- Model is always `claude-sonnet-4-6`

### `lib/client/api-fetch.ts`

```typescript
type ApiFetchOptions = RequestInit & {
  idempotencyKey?: string;        // if provided, sets Idempotency-Key header
};

type ApiFetchResult<T> = {
  data: T;
  requestId: string | null;      // from X-Request-Id response header
};

export async function apiFetch<T>(
  path: string,
  options?: ApiFetchOptions
): Promise<ApiFetchResult<T>>;
```

Behaviour:
- Retries on 5xx and 429 with delays [0ms, 500ms, 2000ms] (3 attempts total)
- Does NOT auto-attach `Idempotency-Key`; only sets it if caller provides `idempotencyKey`
- On non-2xx after retries, throws an object with shape `{ code: string, message: string }`
- Returns parsed JSON body as `data`

### `lib/anthropic/cost-cap.ts`

```typescript
// Estimates cost from raw message size (characters) before the API call.
// Throws ApiError('generation_too_large') if estimated input cost > COST_CAP_PRECHECK_USD (0.50)
export function checkCostCapPre(userMessageLength: number, systemPromptLength: number): void;

// Logs a warning to request_logs if actual cost > COST_CAP_USD (1.00).
// Does NOT throw — money is already spent.
export async function checkCostCapPost(
  cost_usd: number,
  applicationId: string
): Promise<void>;
```

---

## Generation Pipeline (10 Inngest steps)

File: `inngest/functions/generate-application.ts`
Triggered by: `application/generate.requested`
Concurrency: `key: event.data.user_id, limit: 1`
Function retries: 2. LLM step retries: 0. All other steps: Inngest defaults.

| Step name | What it does | Throws on failure |
|---|---|---|
| `kill-switch-check` | Read GENERATION_ENABLED env at runtime; exit if false | Exits cleanly, status stays queued |
| `acquire-slot` | Confirm this application is at front of user queue | Exits cleanly if not |
| `load-context` | Load master CV text + application row from DB | ApiError('database_error') |
| `mark-running` | status -> running, write llm_started event | ApiError('database_error') |
| `cost-cap-check` | checkCostCapPre on message size | ApiError('generation_too_large') |
| `call-llm` | callLLM(), retries: 0 | ApiError('llm_failed') or ('llm_invalid_output') |
| `cost-cap-postcheck` | checkCostCapPost, logs warning only | never throws |
| `validate-output` | Zod parse ApplicationOutputSchema, ATS superRefine | ApiError('llm_invalid_output') |
| `inject-date` | Replace {{TODAY}} with Pacific/Auckland date as "26 April 2026" | never throws |
| `quality-scan` | runQualityScan, logs warnings to request_logs | never throws |
| Branch on status | success path or insufficient_input path | see below |

Success path: mark-rendering -> render-docs -> upload-files -> finalize-success
- Sets `files_expire_at = now() + 60 days`
- Sets `metadata_expires_at = now() + 1 year`
- Status -> success

Insufficient_input path: finalize-insufficient
- Status -> insufficient_input
- Stores `insufficient_input_reason`
- Sets `metadata_expires_at = now() + 1 year`
- Pauses all queued items for this user (status queued -> paused)

After any terminal state: fires `application/generation.completed` event.
`onFailure` handler: marks application errored, sets `metadata_expires_at = now() + 1 year`.

**Critical watchdog rule**: the watchdog update query MUST include `.eq('status', 'running')` guard.
**Critical spec rule**: every terminal state transition MUST set `metadata_expires_at = now() + 1 year`.
Affects: finalize-insufficient, onFailure handler, watchdog, abandon route.

**Watchdog now has TWO passes** (Decision Log step 12 DP — adds a second pass on top of the spec):
- Pass A (spec): `status='running'` >30min → `error`. Resumes paused, fires `generation.completed`.
- Pass B (added): `status='queued'` >60min with `started_at IS NULL` → `cancelled`. Catches rows orphaned because Inngest never picked them up (dev server off, kill-switch flipped, worker crashed before claim). Same `metadata_expires_at` discipline; same guarded update; fires `generation.completed` so the queue trigger advances.

---

## Database: Key Rules

Full SQL in `app_handoff_v8.md §6.2`. Do not rewrite schema; run migrations as written.

Status enum values (all nine): `queued`, `paused`, `running`, `rendering`, `success`,
`insufficient_input`, `abandoned`, `error`, `cancelled`

Queue cap at submit time: count rows with status IN (queued, paused, running, rendering).
If count >= 3, return ApiError('queue_full').

Snapshot rule: record `master_cv_id` on the application row at submit time.
Replacing the master CV later does NOT affect queued applications.

Retry chain: new applications row with `parent_application_id` linking back.
`attempt_number` is hard-capped at 3. Attempt 3 = Screen 10, no more retries.

Expiry clocks start at `completed_at`, not `created_at`.

`is_demo = true` rows: skipped by expiry crons (expire-files, expire-metadata).
`GENERATION_ENABLED` and `DAILY_COST_CEILING_USD`: read at request time, not module scope.

RLS summary:
- User tables: users see only their own rows
- Admin tables (request_logs, token_usage, telemetry_events): admin read only
- Inngest functions: use service-role key to bypass RLS

---

## DOCX Rendering Rules

Full layout spec in `app_handoff_v8.md §5`. Key rules that cause bugs if missed:

- Pipe separator: filter empty values BEFORE joining with " | " (no stray pipes)
- Empty sections: if `key_projects`, `leadership_and_interests`, or `technical_skills` arrays
  are empty, omit the ENTIRE section including the heading
- Recipient block: if `company_address` is null, omit that line only
- Date in cover letter: injected server-side by `inject-date` Inngest step. LLM outputs
  `{{TODAY}}` as a placeholder. The renderer receives the already-replaced value.
- Sign-off: split `signoff` string on `\n`, render each as a separate paragraph
- Filename format: `{lastname}_CV_{company_short}_{yyyymmdd}.docx` — set by download route,
  NOT by renderer
- ATS rules: no headers, no footers, no page numbers, no text boxes, no tables in either doc
- Font: Calibri throughout. Body 10.5pt (21 half-points in docx package). Name 16pt (32). Section
  headings 12pt (24). Margins 15mm. Section headings + contact rule are Curiosum brand orange
  (#E85A0E); everything else is black/grey for ATS reliability. Sizes were tightened 2026-04-30
  to land typical Mid/Senior CVs on 2 pages instead of 3 — see Decision Log entry below.
- All constants already defined in `lib/docx/styles.ts` — use them, do not hardcode values
- Per-seniority spacing: `getSpacingForSeniority(seniority)` returns `SPACING_GRADUATE`
  for Graduate / Junior (paragraph_after 4pt → 3pt, bullet_after 2pt → 1pt) and the
  canonical `SPACING` profile for everything Mid and above. Fonts and line-height are
  unchanged across seniorities; only the inter-paragraph and inter-bullet gaps shrink
  for graduate. `renderCV` takes `seniority` and threads the chosen profile through
  every helper that emits a paragraph.

---

## Screen Map

Single `app/(app)/application/[id]/page.tsx` handles all post-submit states.
Branch on `application.status`:

| Status | Screen | Key content |
|---|---|---|
| queued / paused | Queued view | "Queued, position N of M" + read-only JD and notes |
| running / rendering | Screen 8 loading | SSE phase labels rotating |
| success | Screen 8 | CvPreview + CoverLetterPreview + View/Download buttons |
| insufficient_input (attempt 1 or 2) | Screen 9 | Reason + retry form + "Use new CV" toggle |
| insufficient_input (attempt 3) | Screen 10 | Reason + "Continue queued applications" button |
| error | Screen 12 | Error message + retry button |

SSE event shape (locked): `{ phase: string, application_id: string, timestamp: string, payload?: object }`
Four phases: `llm_started`, `llm_completed`, `rendering_started`, `finalized`

SSE polling fallback: if no SSE event received for 10+ seconds, poll
`GET /api/applications/[id]` every 5 seconds. This is belt-and-braces for Vercel SSE timeouts.

Submit button: 3-second debounce lockout after click (prevent double-submit).

---

## Environment Variables

Full list with purposes in `app_handoff_v8.md §7.1`. Key notes:

- `GENERATION_ENABLED`: read at request time (not module scope). Default true if unset.
- `DAILY_COST_CEILING_USD`: read at request time. Default 10.00 if unset.
- `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS`: optional (email feature deferred).
- `SUPABASE_SERVICE_ROLE_KEY`: imported ONLY in `lib/supabase/service.ts`. Never elsewhere.
- Startup validation via Zod in `lib/env.ts`. Fail fast with clear message on missing vars.

---

## Deferred Features (do not build yet)

These are explicitly deferred until after the internal demo milestone.
The schema columns exist (so adding code later is additive). The routes do not.

- `/api/applications/[id]/email` route
- `lib/email/client.ts` and `lib/email/templates.ts` (create stubs only)
- Email button on Screen 8
- Email confirmation modal
- `email.send.*` telemetry event emission (schema entries in events.ts are fine)
- Per-user rate limiting (add via Upstash when signups open)
- Magic link auth (single Supabase toggle + 2 file changes when ready)
- Account deletion flow

---

## Build Sequence

Follow this order exactly. Each step depends on the previous.

- [x] = done  [ ] = not started  [~] = in progress

```
[x] 1.  Project scaffold: Next.js + TypeScript + Tailwind + shadcn init + Sentry + env files
[x] 2.  Folder skeleton per repo structure above
[x] 3.  lib/env.ts — Zod env validation, fails fast
[x] 4.  supabase/migrations/0001_initial.sql — run the full SQL from app_handoff_v8.md §6.2
[x] 5.  lib/supabase/{browser,server,service,middleware}.ts — three clients (+ proxy.ts wired)
[x] 6.  Login page + admin user setup + UPDATE profiles SET is_admin = true   (admin user created and is_admin flipped; smoke-test login confirmed)
[x] 7.  Shared modules (in this order):
        lib/errors/codes.ts
        lib/errors/api-error.ts
        lib/errors/sanitise.ts
        lib/errors/client.ts
        lib/logging/with-logging.ts
        lib/idempotency/with-idempotency.ts
        lib/telemetry/events.ts
        lib/telemetry/emit.ts
        lib/telemetry/track.ts
        lib/llm/output-schema.ts
        lib/parsing/parse-pdf.ts
        lib/parsing/parse-docx.ts
        lib/quality/scan.ts
[x] 8.  lib/anthropic/{pricing.ts, tool-schema.ts, cost-cap.ts, client.ts}
[x] 9.  lib/docx/{styles.ts, helpers.ts, render-cv.ts, render-cover-letter.ts}
[x] 10. inngest/client.ts + all 7 functions + 5 step helpers
[x] 11. API routes (in dependency order):
        api/master-cv/route.ts
        api/applications/route.ts           (POST — includes kill switch + daily ceiling)
        api/applications/[id]/events/route.ts  (GET SSE + Last-Event-ID replay)
        api/applications/[id]/download/[kind]/route.ts
        api/applications/[id]/retry/route.ts
        api/applications/[id]/abandon/route.ts
        api/inngest/route.ts
        api/telemetry/route.ts
        api/admin/usage/route.ts
        api/admin/logs/route.ts
        api/admin/telemetry/route.ts
[x] 12. Five crons (watchdog must have .eq('status','running') guard + metadata_expires_at set)
[x] 13. Admin panel (build BEFORE user screens):
        app/(app)/admin/usage/page.tsx   — last 50 applications
        app/(app)/admin/logs/page.tsx    — last 20 errors
        app/(app)/admin/telemetry/page.tsx — 7-day cost total
[x] 14. Frontend screens in journey order:
        app/(auth)/login/page.tsx
        app/(app)/dashboard/page.tsx
        app/(app)/upload/page.tsx
        app/(app)/application/new/page.tsx
        app/(app)/application/[id]/page.tsx (all states: queued/running/success/error)
        components/application/CvPreview.tsx
        components/application/CoverLetterPreview.tsx
        app/(app)/history/page.tsx
        app/(app)/settings/page.tsx
[x] 15. Sentry wiring: sentry.{client,server,edge}.config.ts + three alerts
[x] 16. Inngest dev startup check (dev mode only)
[x] 17. Daily summary cron: Resend email to ADMIN_EMAIL or Slack webhook fallback
[x] 18. Manual verification gate: read 3 real generations end to end before opening to team  (process — see docs/manual-verification.md)
[x] 19. End-to-end smoke test (see app_handoff_v8.md §10 for full checklist)  (process — see docs/smoke-test.md)
```

---

## Decision Log

Record every Decision Point resolution here so future sessions do not re-litigate them.
Format: `[step number] DECISION POINT title: Option chosen — brief reason`

[1] Package manager: npm. Lowest friction for an internal demo; no spec dependency on a specific manager.
[1] Next.js version: 16 (latest stable). Supersedes "14" in spec; spec patterns (Server Actions, route handlers, middleware) still work; adapt code where 14→16 patterns shifted.
[1] System prompt path: move repo-root `system_prompt_v2.md` to `prompts/system-prompt-v2.md` (hyphen, inside `prompts/`). Matches every spec reference.
[2] `lib/design/tokens.ts` inclusion: include now. Milestone 0 already wires brand tokens; CLAUDE.md repo-structure block updated to list it.
[1] Tailwind: v4 (latest stable, GA Jan 2025). Supersedes the v3 sample in app_handoff §12.6. Brand tokens live in a CSS-first `@theme` block in `app/globals.css`; no `tailwind.config.ts` is generated by default in v4. Per the standing principle, adapt the spec's v3 config to v4 idioms rather than pinning v3.
[1] shadcn/ui base: Neutral + CSS variables, then map shadcn semantic vars (`--background`, `--foreground`, `--primary`, etc.) onto our brand tokens. Primitives inherit brand orange/dark theme automatically.
[2] Skeleton stub content: one-line `// TODO:` marker per file naming the file's job. Locked Interface Contracts land in step 7, not now.
[1] GitHub repo: `https://github.com/TheRunicSage/Distil` (canonical capitalisation). Vercel is linked to this repo so every push to `main` and every PR branch deploys automatically. Supabase project URL: `https://kgezbvqtfcjorcgvjknm.supabase.co` (project ref `kgezbvqtfcjorcgvjknm`). Anon key + service-role key still pending — needed for `.env.local` and Vercel env vars before Step 4 migration runs.
[1] `middleware.ts` vs `proxy.ts`: Next.js 16 deprecated the `middleware` file convention in favour of `proxy.ts` (same API, new filename). RESOLVED in step 5 — root file is now `proxy.ts` exporting `proxy(request)`. The helper module at `lib/supabase/middleware.ts` keeps its spec-named filename since it lives under `lib/` and isn't subject to the Next 16 convention. The export name inside the helper is `updateSession` per @supabase/ssr docs.
[1] shadcn Nova preset: `shadcn init -d` selected the Nova preset, which pulled in extra dependencies the spec doesn't list — `@base-ui/react`, `class-variance-authority`, `clsx`, `lucide-react`, `tailwind-merge`, `tw-animate-css`, plus the `shadcn` runtime package. All are standard shadcn-ecosystem tooling and don't conflict with the architecture. Geist (also pulled by Nova) was removed from `app/layout.tsx` so DM Sans + Instrument Serif are the only fonts loaded.
[1] Light theme scoping: dark theme is global via `<html class="dark">`. For preview islands (CvPreview, CoverLetterPreview, email body) we render content using the `--color-l-*` brand utilities directly (`bg-l-bg`, `text-l-text`) rather than stripping `.dark` from a subtree. Cleaner than CSS variable override gymnastics inside a `.dark` ancestor.
[1] `.claude/settings.local.json` ignored, `settings.json` committed — standard Claude Code convention. The committed settings.json carries project-level harness config; settings.local.json holds per-machine overrides.
[1] `next.config.ts` `turbopack.root` pinned to `__dirname` to silence the multiple-lockfiles warning caused by an unrelated `package-lock.json` in `$HOME`.
[3] `lib/env.ts` validation strategy: module-scope validation for public env (everywhere) and server env (server-only via `typeof window === 'undefined'` guard). Kill switch (`GENERATION_ENABLED`) and daily ceiling (`DAILY_COST_CEILING_USD`) exposed via `isGenerationEnabled()` / `getDailyCostCeilingUsd()` getters that read `process.env` every call, per app_handoff §7.1's "read at request time" rule. Build will fail fast on a clean clone without `.env.local`; that is the spec intent.
[3] Zod v4 issue iteration: `error.flatten().fieldErrors` types each value as `unknown` in v4, breaking the v3 `msgs.join()` pattern. Use `error.issues.map(...)` directly — same output, properly typed.
[6] Server Action return shape: `signIn` returns `SignInResult = { error: string } | undefined` (used with React 19's `useActionState`) rather than throwing. The form renders the generic error inline so we never reveal whether the email exists; only success path calls `redirect('/dashboard')`. `signOut` is colocated since it's a one-line companion action.
[6] Login form primitives: raw `<input>` + Tailwind brand classes for now, not shadcn `Input`. Step 14 (frontend polish) is when we install `shadcn add input label` and refactor; this is the minimum to satisfy step 6's "functional login" goal.
[4] Supabase CLI: installed as a dev dependency (`supabase` package), invoked via `npx supabase`. Keeps tooling per-project and out of the global PATH. `supabase/config.toml` has `project_id = "distil"` (was the default `webbbb` from working directory name).
[4] Migration filename: kept as `0001_initial.sql` per spec rather than the timestamp format the CLI's `migration new` generates. The CLI accepts the integer-prefix form. New migrations can use either format as long as the version sorts after the previous one; `supabase migration new <name>` will generate timestamps from here forward, which is fine.
[4] Migration application path: `npx supabase db push` against the linked remote, not local Docker. Spec doesn't require local-first development; remote-only is simpler for a single-environment internal demo and skips the Docker dependency entirely.
[7] DECISION POINT `withLogging` wrapping pattern: Option C — wrapper used as `export const POST = withLogging('name', async (req, ctx) => { ... })`. The `ctx` is a small mutable handle the handler can populate (`ctx.user_id = ...`, `ctx.application_id = ...`) so the wrapper's finally block can write a complete `request_logs` row.
[7] DECISION POINT `withLogging` / `withIdempotency` composition: Option C — logging is the outer wrapper; the handler calls `withIdempotency(...)` internally. On a cache hit the wrapper still writes a `request_logs` row with `metadata.replayed = true` so replays remain traceable.
[7] DECISION POINT `sanitiseErrorMessage` rule precision: Option C — strip RFC-5322 emails, NZ + E.164 phones, and runs of 20+ characters from the alphabet `[A-Za-z0-9+/=_-]` (covers JWTs, base64, hex, API keys), but explicitly safe-list canonical UUIDs (8-4-4-4-12 with dashes) since `application_id` / `request_id` UUIDs appear all over our error messages. Truncate to 1000 chars after redaction.
[7] DECISION POINT `runQualityScan` return shape: Option B — pure function returns `QualityWarning[]`. The Inngest `quality-scan` step writes the warnings into the step's `request_logs` row metadata. Keeps `lib/quality` free of Supabase coupling and trivially unit-testable.
[7] DECISION POINT Quality-scan banned-phrase source of truth: Option C — banned phrases live as a `const` array inline in `lib/quality/scan.ts` with a top-of-file comment pointing at system-prompt §2.2. The system prompt is markdown loaded by the LLM at runtime, so genuine de-duplication is impossible; an explicit "edit both" comment is more honest than pretending a shared module fixes the drift.
[7] DECISION POINT `parse-pdf` 5-second timeout mechanism: Option A — `Promise.race` against a 5s `setTimeout` rejection. Serverless invocations are short-lived; an orphaned parse promise will be reaped when the invocation ends. Worker isolation isn't worth the complexity for a single internal-demo upload path.
[7] DECISION POINT `trackEvent` session_id storage: Option A — `sessionStorage` with lazy init, guarded by `typeof window !== 'undefined'`. Survives in-tab reloads, matches the spec's per-tab semantics, no extra fallback for Safari private mode (admin uses Chrome).
[8] DECISION POINT Zod→JSON-Schema bridge for the `submit_application` tool: Zod v4 native `z.toJSONSchema(..., { target: 'openapi-3.0', unrepresentable: 'any' })`. We're already on Zod v4 so a third-party bridge would add a redundant dep; the openapi-3.0 target produces the pragmatic shape Anthropic's tool engine expects (no $ref/allOf nesting). The success branch's `superRefine` is enforced again at validate-output, so its absence from the tool schema is by design.

[8] **REVISED (DP-A — submit_application tool schema shape):** Option A — flat root object, all branch-specific fields optional, only `status` required. The original plan let `z.toJSONSchema` emit the discriminated union as-is, which produced a root-level `oneOf` with no `type: "object"`. Anthropic's tool API rejects that shape: `tools.0.custom.input_schema.type: Field required`. Fix lives entirely in `lib/anthropic/tool-schema.ts`: still derive from `ApplicationOutputSchema` via `z.toJSONSchema`, then merge the two oneOf branches at the bridge layer into a single root `type: "object"` schema. Status enum becomes `["success", "insufficient_input"]`; every other field is optional at the schema level. Branch correctness ("if status='success' then these fields must be present") is enforced post-call by the Inngest validate-output step's strict discriminated-union Zod parse — runtime semantics in `lib/llm/output-schema.ts` are unchanged. Tool description spells out the two-branch contract for the model. Considered alternatives: `allOf` + `if/then/else` (rejected — Anthropic's tool engine is finicky with nested allOf, and Zod already enforces post-call); hand-written tool schema (rejected — loses single source of truth).
[8] DECISION POINT `token_usage.user_id` source: Option 3 — write the `token_usage` row from the Inngest `call-llm` step rather than the SDK wrapper. `callLLM` returns `usage`, `cost_usd`, and `model`; the step has `user_id` and `application_id` already in scope from `load-context`. This is a deliberate change to the previously-locked `callLLM` interface contract; the contract block above is updated.
[8] DECISION POINT Prompt caching for v1: skip entirely. Web search is the freshness lever, master CV + JD change every run, and the demo is internal. The 5-min cache TTL would only help on retries within the same window, which isn't a workload we're optimising for. `cache_creation_tokens` and `cache_read_tokens` stay in the cost calculation so any incidental caching by Anthropic is still billed accurately.

[8] **REVISED (2026-04-30): system prompt caching turned ON.** Single cache breakpoint on the system prompt only — sent as `system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]` in `lib/anthropic/client.ts`. Reason: real generations were costing ~$0.50 each, of which ~$0.025 per call is the static ~7–8K-token system prompt at $3/MTok input. With caching that drops to ~$0.0024 per cache hit ($0.30/MTok), and the 5-min TTL covers the common patterns we actually see (back-to-back retries on `insufficient_input` / `llm_invalid_output`, plus pairs of submissions in the same admin session). First call still pays the cache write at $3.75/MTok (~$0.030, slightly more than the uncached input), so the break-even is one cache hit. Tools and the user message are NOT cached (tools are small; user message varies per call). Token counts already flow into `calculateCost` per the original DP-C, so billing accuracy was not a blocker.
[8] DECISION POINT `web_search_count` extraction: read `response.usage.server_tool_use.web_search_requests`. This is Anthropic's own count of search invocations and matches what they bill, so cost calculation never diverges from the invoice. Counting result blocks would diverge on partial errors.
[10] DECISION POINT `build-user-message` XML structure: Option A — newline-separated tag blocks, no XML escaping, in spec order (`<master_cv>`, `<job_description>`, `<region>`, `<attempt_number>`, optional `<user_notes>`). Matches the system prompt §1 tag references verbatim; the prompt's untrusted-data discipline neutralises injection without escaping.
[10] DECISION POINT `acquire-slot` exit when not at front of queue: Option A — sentinel return and the orchestrator branches early. Throwing would wrongly trip `onFailure` and mark the application errored on a normal "wait your turn" path.

[10] **REVISED:** `acquire-slot` now returns `{ atFrontOfQueue, actualFrontId }`, and the orchestrator re-fires `application/generate.requested` for `actualFrontId` whenever it differs from the event's named row. Reason: the original design relied solely on `triggerNextInQueue` (fires on `generation.completed`) to advance the queue, which dead-locks if the front row never had a live function run for it (Inngest dev off at submit time, app not registered, kill switch flipped — symptom: every new submission inserts behind a ghost, runs once, exits at acquire-slot, sits in `queued` forever). Inngest's `concurrency: 1 per user` deduplicates re-fires, so the cost of an idempotent nudge is zero, and bounded recovery is O(N) where N is the number of stuck rows. Watchdog Pass B (60min) is now a backstop, not the primary cleanup.
[10] DECISION POINT Inngest step `request_logs` writes: Option A — central `withInngestStep(step, name, ctx, fn)` helper in `lib/logging/with-inngest-step.ts`, mirroring `withLogging`. Companion `withCronLog(name, fn)` for crons writes `source='cron'` rows.
[10] Inngest v4 API note: v4 dropped `EventSchemas`/`fromRecord` and changed `createFunction(opts, trigger, handler)` to a single options arg with `triggers: [...]` inside. Event-payload typing is now done at the callsite via the `DistilEvent` union exported from `inngest/client.ts`. The handler's `event.data` is read with explicit shape narrowing.
[10] `withInngestStep` typing: `step.run` in Inngest v4 has a heavily-generic `Jsonify<T>` return that fights TypeScript variance for no real gain in our pass-through wrapper. `StepLike` is typed loosely as `{ run: (name: string, fn: () => any) => Promise<any> }` (with a single eslint-disable on the `any`); the wrapper still preserves the caller's `T` via its own generic. This costs nothing at runtime and keeps callsites readable.
[11] DECISION POINT SSE keep-alive heartbeat: Option B — 15-second SSE comment heartbeat (`:\n\n`) on `/api/applications/[id]/events`. Stream is also bounded to 23 seconds total to stay under Vercel's 25s safety floor; the client's 5-second polling fallback (spec §6.7) handles drops and reconnects via `Last-Event-ID`. Initial heartbeat fires immediately on stream start to flush response headers.
[11] Admin gate location: new `lib/auth/require-admin.ts` with `requireAdmin()` returning `{ id, email }` or throwing `not_authenticated` / `not_admin`. Used by every `/api/admin/*` route and (later) the admin pages, so the rule lives in one place.
[11] `queue_position` allocation: `max(queue_position) + 1` per user across all rows (not just active ones). Cheapest unique-monotonic strategy and avoids races within a single submit transaction. Fine for the internal demo's one-user volume.
[11] Download filename derivation: `{lastname}_{CV|CoverLetter}_{company_short}_{yyyymmdd}.docx`, where `company_short` is the LLM-emitted `company_name` slugified to `[A-Za-z0-9_]` and capped at 24 chars; date is `completed_at` (UTC). The signed Supabase URL carries the filename via `download` option so the browser uses it on the redirected response.
[12] Orphaned master CV detection: inline JS, not an SQL function. The `expire-metadata` cron lists all superseded master CVs, fetches the set of currently-referenced `master_cv_id` values via `applications`, and deletes the difference. Storage objects are removed first; the row delete only proceeds on storage success, so a failed remove leaves the row to retry next run. Saves a migration for a one-user demo; revisit if volume grows enough to make the round-trip wasteful.
[13] Admin panel rendering pattern: Server Components reading directly via `createServiceClient()` rather than calling the matching `/api/admin/*` routes from the client. The admin layout (`app/(app)/admin/layout.tsx`) gates the entire subtree once via `requireAdmin()` — unauthenticated → `/login`, non-admin → `/dashboard`. The `/api/admin/*` routes still exist for external clients and (later) any client-side polling, so the layer is not redundant. Pages opt into `dynamic = 'force-dynamic'` so admins always see fresh data.
[14] (app) shell pattern: topbar at 50px (matches admin layout) rather than the 260px sidebar option in §12.5. Auth gating happens in proxy.ts plus a redundant `getUser()` check in `app/(app)/layout.tsx` (cheap, defensive against proxy regressions). The `Admin` link in the topbar appears only when `profiles.is_admin = true`, so non-admins don't see a dead link.
[14] Missing API route surfaced by step 14: `GET /api/applications/[id]` for the SSE polling fallback. Spec §6.7 referenced this route but §6.5's API surface table omitted it. Added now at `app/api/applications/[id]/route.ts`. Returns the row fields the frontend branches on plus `llm_response_json` for terminal-state replay.
[14] Live-state pattern: Server Component `app/(app)/application/[id]/page.tsx` renders the initial state; for non-terminal statuses it embeds `<ApplicationLiveView>` (client) which subscribes to SSE and `router.refresh()`es on `finalized`. Polling fallback runs inside the same client component (5s tick, only kicks in after 10s of SSE silence per spec §6.7).
[14] Supabase select-string typing trap: `.select(literal_a + literal_b)` makes Supabase's TS inference fall back to `GenericStringError` (the parser only types known column lists when the argument is a single literal). Fix: keep every `.select(...)` as a single uninterrupted string literal even when long. Hit twice in step 14 (`/api/applications/[id]` and the application page).
[14] Submit-button debounce: 3-second post-click lockout in `NewApplicationForm.tsx` via a `setTimeout`-driven `debounced` flag separate from `pending`. The button stays disabled while either flag is set; on submit failure `pending` clears immediately so the user can correct the input, but `debounced` keeps the duplicate-click guard alive for the full 3s.
[15] Sentry runtime hook: App Router uses `instrumentation.ts` at the project root, which dynamically imports `sentry.server.config.ts` or `sentry.edge.config.ts` based on `NEXT_RUNTIME`. The browser config is loaded via `withSentryConfig` in `next.config.ts`. `instrumentation.ts` also re-exports `captureRequestError` (Sentry v10 renamed; v8 docs use `onRequestError`) so unhandled route handler errors surface.
[15] `withLogging` 5xx Sentry rule clarified: ApiErrors with `httpStatus >= 500` are now reported (was previously silent for *all* ApiErrors). 4xx ApiErrors stay out of Sentry per spec §6.10. `error_code` is also added as a Sentry tag so dashboard alerts can filter on `llm_failed` / `llm_invalid_output`.
[15] Cost-cap Sentry hook: `checkCostCapPost` calls `Sentry.captureMessage` with `level: 'warning'` and `tags: { cost_cap_exceeded: 'true' }` whenever a generation actually exceeds `COST_CAP_USD`. Alert 3 (single call > $1) wires against this tag from the dashboard.
[15] Three Sentry alerts are dashboard-configured, not code. Recipes documented at `docs/sentry-alerts.md` with verification steps (manual smoke test for each before opening the demo).
[16] Inngest dev startup check: 750ms HEAD-style ping to the dev server's `/health` endpoint (default `http://localhost:8288`, override via `INNGEST_DEV`). Lives in `instrumentation.ts` under the `nodejs` runtime branch and only fires when `NODE_ENV === 'development'`. Logs success on hit, prints a loud warning on miss; never throws so prod boot is unaffected.
[17] Daily summary delivery order: Resend (if both `RESEND_API_KEY` and `ADMIN_EMAIL` and `EMAIL_FROM_ADDRESS` are set) → Slack webhook (if `SLACK_WEBHOOK_URL` is set) → no-op (operator still has the admin panel). Cron fires at `0 21 * * *` UTC = 09:00 NZT. Body includes window, totals, status breakdown, and top error code if any.
[18] Manual verification gate: process step, not code. Checklist at `docs/manual-verification.md` covers cover letter (date, salutation, sign-off, banned phrases, story-led paragraph 2), CV (profile length per seniority, no fabrication, ATS-safe formatting), fit assessment, and the "what we did" checklist. Three real generations must pass before opening to the team.
[19] End-to-end smoke test: process step, not code. Checklist at `docs/smoke-test.md` covers happy path (upload → submit → SSE → success → download) and failure paths (insufficient_input retry, attempt-3 cap, queue cap, cost cap pre-check, kill switch, daily ceiling). Each path has a verification step that mutates a Vercel env var temporarily and requires reverting after.

[14] DECISION POINT History/Dashboard visibility scope: filter on `started_at IS NOT NULL`. Pre-LLM rows (queued, paused-from-start, abandoned/cancelled while still queued) are excluded from `/history` and the Dashboard "Recent" widget. The application detail page still server-renders pre-LLM rows by direct URL so the new-application redirect flow is unaffected. Reason: exploratory submissions made while Inngest or the API key were misconfigured were polluting the user's record and reading like real generations. `started_at` is written by the `mark-running` step (`inngest/steps/finalize.ts:107`) immediately before `call-llm`, so it's the precise "handed to LLM" moment. Side-effect: HistoryList "Active" pill renamed to "In progress" and narrowed to running/rendering only, since queued/paused can no longer reach the list.

[14] IA pass + design system — nav restructure (2026-04-30, follow-up to the earlier UX pass below). User-reported friction: `Distil` wordmark and `Dashboard` nav item both pointed to `/dashboard`, the topbar had no primary action, and the dashboard was doing dual duty as both "home" and "master CV settings".

Topbar shape changed to: `Distil` wordmark (left, the only "home" affordance) | `History` (text link, secondary nav) | `Settings` (gear icon button, collapses Settings/Admin/Sign-out behind one entry) | `+ New application` (primary orange CTA, always one click away). When the user has no master CV, the same primary slot renders as `Upload CV` linking to `/upload` with an upload icon — same button, contextual label, no dead-end "you need to upload first" friction. Auth layout fetches `master_cvs` once and threads `hasCv` into the topbar.

Post-login routing: `signIn` server action now queries `master_cvs` after a successful sign-in and redirects no-CV users to `/upload` instead of `/dashboard`. First-session users land on the only screen that's actually meaningful at that moment.

Dashboard restructure: `app/(app)/dashboard/page.tsx` no longer surfaces the Master CV card (moved to `/settings`). Three states: (1) no CV → full-width "Upload your master CV first" surface card with primary CTA; (2) has CV but zero history → full-width "Tailor your first application" CTA; (3) has CV + history → optional "In progress" panel (live: queued/paused/running/rendering) + "Recent" panel (terminal states only, last 5). The split prevents the same row appearing in both lists, and the live panel surfaces in-flight work without needing to dig into `/history`.

Settings becomes the home for Master CV management: full-state display (format / size / upload date) inline, Replace CTA in the same surface card, plus existing Account / Admin tools / Sign-out sections — all using the new design-system classes for consistency.

Design system classes added to `app/globals.css` under `@layer components`. One definition per visual primitive: `.eyebrow` / `.eyebrow-muted` (the orange uppercase micro-label used everywhere), `.heading-display` (Fraunces 4xl light, page hero), `.heading-section` (Fraunces 2xl, panel title), `.text-meta` (small grey timestamps/IDs), `.surface-card` / `.surface-card-interactive` (primary card pattern, with hover variant), `.surface-row` (clickable list rows), `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.btn-icon` / `.btn-link-orange` / `.btn-disabled-shell`, `.status-pill` (per-status badge shell). The radius scale is locked to `md` (inputs/kbd) → `xl` (buttons, list rows, ID chips) → `2xl` (cards, panels) → `full` (pills); surfaces are locked to `dark` (page bg) → `dark2/60` (primary card) → `dark3` (hover/active) → `dark4` (popover only). New (app) pages should reach for these classes before writing one-off Tailwind strings; out-of-scope pages (history, application/[id], admin, upload) still use bespoke styling and will migrate page-by-page rather than in one giant churn commit.

Icons via `lucide-react` (`SettingsIcon`, `PlusIcon`, `UploadIcon`). Was originally inlined as SVG because the package was in `package.json` but not in `node_modules`; reinstalled in the same turn after the user asked whether any plugin/install would help. Tree-shakes per-icon so bundle stays small.

What was not changed: AppShell (toast provider + keyboard shortcuts intact, including the `D` shortcut for `/dashboard`), AmbientBackground, the cover-letter renderer, any spec-locked behaviour. The (admin) prod move TODO from earlier [13] is still untouched — admin still lives inside (app) gated by `requireAdmin()` and now sits behind the Settings icon rather than a topbar item, which is closer to the prod target shape but not yet the route-group split.

[14] UX pass — nav cleanup, AppShell, interactive elements: locked in this session.
- Topbar reduced to `Dashboard | History | Settings` (sticky with backdrop blur). Admin moved into Settings as a gated section; sign-out lives only there. Admin layout stripped of its duplicate full-height topbar (was stacking under the parent shell) — replaced with an inline sub-nav + "Back to Settings" link.
- New `components/app/AppShell.tsx` (client wrapper) hosts a Toast provider (`components/ui/toast.tsx`) and global keyboard shortcuts (`N` new app, `D` dashboard, `H` history, `S` settings, `?` help). Shortcuts ignored while typing in inputs/textareas/contentEditable.
- Drag-and-drop master CV upload with three states (idle / drag-over / file ready). Toast on success and failure.
- `ApplicationLiveView` replaces the bare spinner with a four-phase checklist (research → cover letter → render → wrap up) plus live elapsed timer. Active step pulses orange; completed steps go green.
- New-application form gains a four-band JD strength gauge (`empty` / `too_short` / `short` / `ok`) driving a coloured progress bar; submit button stays disabled below minimum.
- `components/app/CopyId.tsx` ghost chip replaces static truncated mono spans for application IDs (extensible to other ids later).

[12] DECISION POINT Watchdog Pass B for stuck queued rows: extend the existing watchdog cron (`*/15 * * * *`) with a second pass that catches rows in `status='queued'` for >60min with `started_at IS NULL`, marks them `cancelled`, and fires `application/generation.completed`. Reason: queue-cap query at `app/api/applications/route.ts:86` counts `(queued, paused, running, rendering)`; rows orphaned because Inngest was off / worker crashed / kill-switch flipped during submit will sit in `queued` forever and lock the user out at the cap. Spec only had Pass A (running >30min → error). Implementation: same `withCronLog` envelope; both passes return separate counts (`recoveredRunning`, `recoveredQueued`) for the cron-log row. Update is guarded with `.eq('status','queued').is('started_at', null)` so a row that just got claimed is never stomped.

[12] Supabase SQL Editor `auth.uid()` gotcha (operational note for future cleanup queries): the SQL Editor runs as the `postgres` role, not as a logged-in user, so `auth.uid()` returns NULL. Cleanup queries that filter `where user_id = auth.uid()` silently match zero rows and report "0 rows affected" — not an error. For one-off cleanup against a single-user demo, filter by status / `started_at` only, or paste the admin user's literal UUID from Authentication → Users.

[10] Inngest client dev-mode flag: `inngest/client.ts` now passes `isDev: process.env.NODE_ENV !== "production"` and only attaches `eventKey` in prod. Without this, the SDK refuses to send events locally because `INNGEST_EVENT_KEY` is unset (the Inngest dev server doesn't need one, but the SDK doesn't auto-detect that from the absence of the key — it errors out with "Failed to send event ... we couldn't find an event key"). Symptom: `applications.submit` logs `internal_error` with the event-key message; the application row is created but `application/generate.requested` is never delivered, so the row sits in `queued` forever (Pass B watchdog now catches these after 60min — Decision Log step 12). The webhook handler `app/api/inngest/route.ts` reads `isDev` from the same client instance, so no separate change is needed there. `lib/env.ts` keeps `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` required only when `NODE_ENV === 'production'`.

**Standing principle (set in this session):** prefer the latest *stable* version of any tool we adopt; when spec sample code targets an older version, modify the code to match the current API rather than pinning to the older version.

[13] Admin access location (TODO for prod): admin currently lives inside the authenticated user shell at `app/(app)/admin/*`, gated by `requireAdmin()` in `app/(app)/admin/layout.tsx` (Decision Log [13] from earlier). This is fine for the internal demo. **For the prod build, move admin off `/dashboard` etc. into a separate `/admin` route group** (e.g. its own `app/(admin)/layout.tsx` + own ambient/topbar) so the admin surface is no longer reachable from the consumer nav and so any future signups never see an admin link in their topbar. The `is_admin` profile flag and the `requireAdmin()` helper stay; only the file location and the topbar conditional change. Do this before opening signups.

[18] System prompt §7.1 — `insufficient_input` is reserved for the six exhaustive triggers (JD too short / gibberish / non-English; company unidentifiable; CV empty/fragmentary/non-CV). Contact-detail cosmetics — phone formatting, missing LinkedIn URL, missing work rights / availability, email or location layout — are explicit non-triggers. The model copies whatever the master CV shows, infers sensibly when fields are silent, and proceeds to `success`. Reason: a real generation bailed out because the master CV had `+64 0220293753` (country code combined with leading zero) and no full LinkedIn URL — content the candidate can fix in the docx in seconds. Section 10 self-check item 18 enforces it pre-return.

[18] System prompt §7 restructure (after second and third bail-outs on the same submission): renamed §7.1 → §7.0 stop-and-reconsider gate (a hard rule listed BEFORE the trigger list, since the model was reading the trigger list first and inventing reasons that overlapped with it); §7.1 is now a defaults table (`Available on request` for missing work_rights / availability; `LinkedIn` literal as placeholder for missing LinkedIn; copy phone/email/location verbatim with no inference); §7.2 is a worked example showing wrong vs correct response for the exact phone+LinkedIn+work_rights+availability case that has been failing; §7.3 is the real triggers (exhaustive); §7.4 is retry behaviour. Soft language ("infer conservatively", "infer sensibly") removed — the model used those phrases as a permission slip to ask the user. Defaults are now literal strings the model just copies in.

[18] `insufficient_input_reason` Zod cap raised from 800 → 2000 chars in `lib/llm/output-schema.ts`. An over-cautious model emitted a long enumeration of contact-detail concerns that overflowed 800 chars and failed `validate-output` as `llm_invalid_output` — masking the real "model bailed when it shouldn't" signal. The reason field is rendered as a paragraph to the user; verbose-but-readable is fine, opaque is not.

[18] System prompt §0 added (Mission and Operating Posture). After three rounds of bail-out fixes (contact-detail v1, contact-detail v2, then a fresh seniority/fit hand-wringing), the prompt was treating the model as a gatekeeper that needed exhaustive carve-outs for each new bail-out class. Inverted the posture: the model is now positioned as the candidate's advocate, the service is paid and one-shot (no back-and-forth), and the only gate is mechanically unreadable inputs (§7.3). Concrete additions: §0.1 advocate-not-gatekeeper rules; §0.2 "best-light principle" requiring gaps be handled by bridging language and emphasis on strongest evidence rather than refusal; §0.3 hard one-tool-call no-prose rule (the latest failure was prose preamble before the tool call); §0.4 plain-English definition of what insufficient_input actually means. §3 Phase 3 reframed: fit assessment is informational metadata, never a gate. §7.0 expanded to bucket bail-out reasons into "contact-detail concerns" and "fit/seniority/qualifications concerns" — both buckets force `status: "success"`. §10 self-check items 19 (no prose outside tool call) and 20 (no gap-acknowledgement leaking into CV/cover letter prose) added. Trigger: the model emitted "Before I generate the full tailored CV and cover letter, there is a genuine concern to flag regarding candidate fit…" as preamble text on a Careerforce Data Analyst role where the candidate's experience was below the stated minimum — exactly the case the user explicitly wants handled by leading with strongest evidence + bridging language, not by refusal or warning.

[8] tool_choice changed from `{ type: "tool", name: "submit_application" }` to `{ type: "any" }` in `inngest/functions/generate-application.ts:177`. Root cause of "Before generating a full application for this submission, let me run the research needed to complete it." being emitted into `insufficient_input_reason`: forcing tool_choice to a specific tool makes the model call that tool *immediately on its first move*, which means `web_search` (a server tool) is unreachable. The model could not run Phase 2 company research even though the system prompt mandates it, so it bailed with conversational prose. `{ type: "any" }` still forbids text-only output (the response must end on a tool call) but lets the model chain `web_search` calls (executed server-side by Anthropic in-band) before the final `submit_application` call. Submitter will be picked correctly: `lib/anthropic/client.ts` `find(block => block.type === "tool_use")` skips `server_tool_use` blocks (web_search) and lands on the `submit_application` tool_use. `CallLLMOptions.toolChoice` type union extended to include `Anthropic.ToolChoiceAny` (locked interface contract above updated). This was the underlying cause of the entire bail-out cascade — the model wasn't being timid, it was being prevented from doing its job — so it kept finding new shapes for "I can't do this" prose every time we patched the prompt.

[9] DOCX density and Curiosum branding (2026-04-30, `lib/docx/styles.ts` + `helpers.ts` + `render-cv.ts`). User feedback after first end-to-end generation: CV rendered at 3 pages where 2 was expected, and the original "no Curiosum branding on user docs" rule from app_handoff_v8.md §5.1 v8 was overridden in favour of subtle brand cues. Two parallel changes:

Density (combined ~10–12% page-area savings):
- Body 11pt → 10.5pt (size 22 → 21). 9.5pt small/contact-line. Stays comfortably above the 9pt ATS floor.
- Section heading 13pt → 12pt (26 → 24).
- Name 18pt → 16pt (36 → 32).
- Margins 20mm → 15mm (1134 → 850 twips).
- `paragraph_after` 6pt → 4pt; `section_after` 12pt → 9pt; `heading_before` 12pt → 9pt; `heading_after` 4pt → 3pt; new `bullet_after` 2pt (was hardcoded 4pt in `bullet()`).
- Line height kept at 1.15 — going below feels cramped at 10.5pt.

Branding (subtle, ATS-safe — solid color text in headings is fine for ATS; the danger is graphics, tables, and text boxes, not RGB on text):
- New `COLOURS.brand_orange = "E85A0E"` (matches `--color-orange` in app/globals.css).
- New `COLOURS.brand_orange_dim = "F4B58E"` for the section-heading bottom rule.
- Section heading text: black → brand_orange.
- Section heading rule: grey → brand_orange_dim (paler so it doesn't fight the orange text).
- Contact closing rule: grey → brand_orange (the document's main brand signature, 1pt instead of 0.75pt).
- Body, bullets, meta lines, name heading: unchanged (black/grey).

Hardcoded magic numbers in `render-cv.ts` (`after: 80`, `after: 120`, `line: 276`) refactored to reference `SPACING.paragraph_after` / `SPACING.line_115` so future tuning lives in one place. CLAUDE.md DOCX Rendering Rules block updated to match the new sizes.

[9] Graduate page-count fix (2026-04-30, follow-up to the same-day density+branding work). User-reported: a graduate with limited internships rendered at 3 pages, violating §4.4 "Graduate / Junior: 1 to 2 pages, never more than 2." Two layered changes (Option C of the Decision Point):

Renderer (safety net, mild):
- New `SPACING_GRADUATE` profile in `lib/docx/styles.ts`: identical to `SPACING` except `paragraph_after` 4pt → 3pt (80 → 60 twips) and `bullet_after` 2pt → 1pt (40 → 20 twips). Fonts, line-height, heading rhythm, margins all unchanged. New `getSpacingForSeniority(seniority)` helper returns `SPACING_GRADUATE` for `Graduate`/`Junior` and the canonical `SPACING` for everything else. New `SpacingProfile` type exported alongside.
- `lib/docx/helpers.ts`: every paragraph builder (`nameHeading`, `contactLine`, `sectionHeading`, `bodyParagraph`, `bullet`, `roleHeader`, `metaLine`) now takes an optional `spacing: SpacingProfile = SPACING` final argument. Default behaviour for any caller that doesn't pass one is unchanged, so the cover letter renderer and any future caller stays on the canonical profile.
- `lib/docx/render-cv.ts`: signature is now `renderCV(content, seniority)`. The function picks the spacing profile once and threads it through every helper call plus the inline `Paragraph` constructions for Technical Skills, Key Projects technologies, and Leadership/Interests. `inngest/steps/render-and-upload.ts` passes `output.jd_analysis.seniority`.

Prompt (primary lever): §4.4 Graduate / Junior block rewritten as a content budget rather than a content list. Profile defaults to 3 sentences (not 4), Key Projects to 2–3 (not 3–5), bullets per role to 2–3 (cap 4 only for the most relevant role), Technical Skills to 3–4 categories with ≤25 skills total. New "Selection over inclusion" framing makes explicit that the master CV is the archive and the tailored CV is the recruiter's two-minute scan. New §10 self-check item 21 forces the model to mentally render the page count for Graduate/Junior outputs and trim before returning.

What was *not* changed: schema caps in `lib/llm/output-schema.ts` (would trip [7]), font sizes (would risk the 9pt ATS floor), margins, line-height, the §0 advocate posture, or the §7.0/§7.1/§7.3 stop-and-reconsider gate. Trim is by selection of the strongest items, not by gap-acknowledgement or refusal. Cover letter rendering is unaffected (one page already, no density change).

[7] Output-schema cap and superRefine tuning (2026-04-30, `lib/llm/output-schema.ts`):
- ATS keyword coverage `superRefine` (hard-reject below 60%) **removed entirely**. It conflicted with §0.2 — a weak-fit candidate's CV will have lower direct keyword matching by design, and failing the generation on that ratio means the user gets nothing for their paid attempt. Coverage now reported as a non-blocking warning by `lib/quality/scan.ts` (warns whenever `< 60%`), still surfaced in `request_logs.metadata` for ops visibility but never blocks delivery.
- Full length-cap audit after the third whack-a-mole `llm_invalid_output` failure on a single generation. Caps were tuned for the old gatekeeping posture; advocate-style outputs legitimately run longer. Bumps applied as a single pass rather than reactively per-field. Internal-metadata fields (fit/research/JD/salary): generous since they don't render to docx. Docx-rendered fields (CV bullets, CL paragraphs): sized so the renderer comfortably fits "action + outcome" bullets and 80–100-word cover letter paragraphs. Identifier-style fields (phone, dates, salutation): unchanged. Bumps:
  - `fit_assessment.reasoning` 500 → 1500
  - `fit_assessment.warnings[]` 300 → 600
  - `RecentNewsItem.headline` 300 → 400
  - `research_summary.company_snapshot` 500 → 800
  - `research_summary.industry_context` 300 → 600
  - `research_summary.company_reference_used` 500 → 800
  - `research_summary.company_reference_note` 500 → 800
  - `jd_analysis.role_archetype` 100 → 200
  - `jd_analysis.must_haves[]` 200 → 400
  - `jd_analysis.nice_to_haves[]` 200 → 400
  - `jd_analysis.ats_keywords[]` 80 → 120
  - `salary_band.range` 100 → 200
  - `salary_band.source_name` 100 → 200
  - `TechnicalSkillsGroup.category` 80 → 120
  - `TechnicalSkillsGroup.skills[]` 80 → 160
  - `ProfessionalExperienceItem.role_title` 120 → 200
  - `ProfessionalExperienceItem.company` 120 → 200
  - `ProfessionalExperienceItem.bullets[]` 400 → 600
  - `KeyProject.bullets[]` 400 → 600
  - `KeyProject.technologies[]` 60 → 100
  - `EducationItem.details[]` 300 → 500
  - `LeadershipInterestItem.description` 400 → 600
  - `cv_content.profile` 800 → 1400
  - `cover_letter_content.paragraphs[]` 1500 → 2000
  - `what_we_did_checklist[]` 300 → 500
  - `insufficient_input_reason` 800 → 2000 (separate failure mode, see [18] entries)
  Trigger: three consecutive `llm_invalid_output` failures on the same paid generation — `industry_context`, `profile`, `technical_skills.skills[0]`, then `fit_assessment.reasoning`. Each round was throwing away a complete, successful, web-researched generation worth ~$0.50 because of validation tuning, not output quality.

---

## Known Gaps to Watch

These are areas where the spec is intentionally high-level. Raise a Decision Point if you
reach them and the right answer is not obvious from context.

1. **`withLogging` route handler wrapping pattern** — the spec describes behaviour but not whether
   it wraps the Next.js route export directly or is called inside the handler. Raise Decision Point.

2. **SSE route keep-alive on Vercel** — Vercel serverless has a ~25s response timeout. The spec
   calls for SSE polling fallback as belt-and-braces. The exact keep-alive heartbeat interval
   (if any) is not specified. Raise Decision Point when building the SSE route.

3. **`acquire-slot` exit behaviour** — if the application is not at the front of the queue,
   the step "exits cleanly." This likely means the Inngest function returns without error,
   trusting `triggerNextInQueue` to re-fire. Confirm this pattern before implementing.

4. **Screen UI visual design** — open question in spec. shadcn/ui defaults are acceptable.
   If you want a specific design direction, raise it as a Decision Point before building Screen 1.

5. **`lib/llm/build-user-message.ts` XML structure** — the spec describes the tags but not the
   exact whitespace, encoding, or ordering within each tag. Keep it simple and consistent.

---

## Quick Reference: Error Codes

Full catalogue in `app_handoff_v8.md §7.3`. Most common ones:

| Code | HTTP | When |
|---|---|---|
| invalid_request | 400 | Generic bad input |
| master_cv_required | 400 | No CV uploaded yet |
| master_cv_too_large | 400 | File > 3MB |
| master_cv_parse_failed | 400 | Less than 200 chars extracted |
| jd_too_short | 400 | JD below minimum length |
| generation_too_large | 400 | Pre-call cost estimate > $0.50 |
| not_authenticated | 401 | No session |
| not_admin | 403 | Not an admin |
| queue_full | 409 | 3 items already in queue |
| retry_limit_reached | 409 | attempt_number already 3 |
| files_expired | 410 | 60-day file expiry passed |
| internal_error | 500 | Catch-all system error |
| llm_failed | 502 | Anthropic non-2xx |
| llm_invalid_output | 502 | Bad tool output or Zod fail |
| generation_disabled | 503 | GENERATION_ENABLED=false |
| daily_cost_ceiling_reached | 503 | Daily spend > DAILY_COST_CEILING_USD |

---

## Pricing Constants (verified 27 April 2026)

Model: `claude-sonnet-4-6`
Input: $3.00 / MTok
Output: $15.00 / MTok
Cache write 5-min: $3.75 / MTok
Cache write 1-hr: $6.00 / MTok
Cache read: $0.30 / MTok
Web search: $0.01 / call

Per-generation cost cap: $1.00 (COST_CAP_USD)
Pre-call estimate cap: $0.50 (COST_CAP_PRECHECK_USD)
Daily ceiling default: $10.00 (DAILY_COST_CEILING_USD env var)
