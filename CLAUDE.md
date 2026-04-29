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
  toolChoice: Anthropic.ToolChoiceAuto | Anthropic.ToolChoiceTool;
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
- Does NOT enable prompt caching (Decision Log step 8 DP-C). Cache token counts in the response are still surfaced in `usage` for accurate cost accounting.
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
- Font: Calibri throughout. Body 11pt (22 half-points in docx package). Name 18pt (36). Section
  headings 13pt (26).
- All constants already defined in `lib/docx/styles.ts` — use them, do not hardcode values

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
[~] 6.  Login page + admin user setup + UPDATE profiles SET is_admin = true   (page + actions done; awaiting admin user creation in Supabase)
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
[8] DECISION POINT `token_usage.user_id` source: Option 3 — write the `token_usage` row from the Inngest `call-llm` step rather than the SDK wrapper. `callLLM` returns `usage`, `cost_usd`, and `model`; the step has `user_id` and `application_id` already in scope from `load-context`. This is a deliberate change to the previously-locked `callLLM` interface contract; the contract block above is updated.
[8] DECISION POINT Prompt caching for v1: skip entirely. Web search is the freshness lever, master CV + JD change every run, and the demo is internal. The 5-min cache TTL would only help on retries within the same window, which isn't a workload we're optimising for. `cache_creation_tokens` and `cache_read_tokens` stay in the cost calculation so any incidental caching by Anthropic is still billed accurately.
[8] DECISION POINT `web_search_count` extraction: read `response.usage.server_tool_use.web_search_requests`. This is Anthropic's own count of search invocations and matches what they bill, so cost calculation never diverges from the invoice. Counting result blocks would diverge on partial errors.
[10] DECISION POINT `build-user-message` XML structure: Option A — newline-separated tag blocks, no XML escaping, in spec order (`<master_cv>`, `<job_description>`, `<region>`, `<attempt_number>`, optional `<user_notes>`). Matches the system prompt §1 tag references verbatim; the prompt's untrusted-data discipline neutralises injection without escaping.
[10] DECISION POINT `acquire-slot` exit when not at front of queue: Option A — sentinel return (`{ atFrontOfQueue: boolean }`) and the orchestrator branches early. Throwing would wrongly trip `onFailure` and mark the application errored on a normal "wait your turn" path.
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

**Standing principle (set in this session):** prefer the latest *stable* version of any tool we adopt; when spec sample code targets an older version, modify the code to match the current API rather than pinning to the older version.

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
