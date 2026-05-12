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
- `prompts/system-prompt-claude.md`: the Claude-targeting system prompt loaded at module scope on the Anthropic path. (The DeepSeek path loads `prompts/system-prompt-deepseek-flash.md` instead per the dual-prompt arrangement — see Decision Log [8].)

---

## Stack at a Glance

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14, TypeScript, App Router | |
| UI | shadcn/ui + Tailwind | Components copied into repo, not imported |
| Hosting | Vercel | |
| DB + Auth + Storage | Supabase | Postgres, email/password auth, private buckets |
| LLM (default) | deepseek-v4-pro | structured output via OpenAI-compatible function calling; web search via Tavily inside a client-side tool-call loop |
| LLM (rollback) | claude-sonnet-4-6 | flip `LLM_PROVIDER=anthropic` env var; restores Anthropic SDK + native web_search server tool |
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
│   ├── system-prompt-claude.md        # Sonnet-tuned; loaded on Anthropic path
│   └── system-prompt-deepseek-flash.md # Flash-tuned; loaded on DeepSeek path
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

### `lib/llm/{types,index}.ts` and provider implementations

```typescript
// lib/llm/types.ts
export type LlmTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type LlmToolChoice =
  | "auto"
  | "required"                         // both providers: force a tool call, model picks
  | { type: "tool"; name: string };

export type CallLLMOptions = {
  system: string;
  userMessage: string;
  tools: LlmTool[];                    // neutral; provider appends its own web_search internally
  toolChoice: LlmToolChoice;
  applicationId: string;
  maxTokens?: number;                  // defaults to 16000
};

export type CallLLMResult = {
  toolInput: unknown;                  // raw tool input, caller validates with Zod
  usage: {
    input_tokens: number;              // cache-miss portion only (DeepSeek) / total (Anthropic)
    output_tokens: number;
    cache_creation_tokens: number;     // 0 on DeepSeek (writes not separately billed)
    cache_read_tokens: number;
    web_search_count: number;          // Anthropic: native counter; DeepSeek: Tavily call count
  };
  cost_usd: number;                    // computed via calculateCost
  model: ModelName;                    // claude-sonnet-4-6 | deepseek-v4-pro | deepseek-v4-flash
};

export interface LlmProvider {
  callLLM(opts: CallLLMOptions): Promise<CallLLMResult>;
}

// lib/llm/index.ts picks an implementation at module load:
//   AnthropicProvider | DeepseekProvider, switched by getLlmProvider()
//   which reads LLM_PROVIDER (default "anthropic"). Cold-start scoped;
//   flipping the env var takes effect on the next Inngest cold boot —
//   no redeploy needed.
export const llm: LlmProvider;
```

Behaviour shared across providers:
- Pure SDK wrapper: returns usage + cost, **does not** write to `token_usage`. The Inngest `call-llm` step writes the row using `usage`, `cost_usd`, `model`, plus the `user_id` already in scope at the step level (Decision Log step 8 DP-B).
- Does NOT apply cost cap itself — caller (Inngest steps) does that.
- Throws `ApiError('llm_failed')` on non-2xx provider response.
- Throws `ApiError('llm_invalid_output')` if no `submit_application` tool call materialises.

Anthropic-specific (`lib/anthropic/provider.ts`):
- System prompt sent as a single text content block with `cache_control: { type: "ephemeral" }` (Decision Log step 8 DP-C, 2026-04-30 revision).
- Web search is the native `web_search_20250305` server tool (`lib/anthropic/tool-schema.ts:webSearchTool`, `max_uses: 5`); Anthropic runs the search in-band and reports the count via `usage.server_tool_use.web_search_requests`.
- Model: `claude-sonnet-4-6`.

DeepSeek-specific (`lib/deepseek/provider.ts`):
- OpenAI-compatible chat completions at `https://api.deepseek.com` via the `openai` SDK with a custom `baseURL`.
- Caching is automatic: DeepSeek's on-disk KV cache reports `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` per call; we sum them across iterations.
- Web search is **not native**. The provider runs a tool-call loop (see Decision Log step 8 DP-2 entry, 2026-05-02): on each iteration, model emits either a `submit_application` call (terminal — JSON.parse and return) or `web_search` calls that we resolve by hitting Tavily (`lib/deepseek/tavily.ts`, basic depth, 5 results). 5-call budget; the 6th gets a "budget exhausted" tool result (graceful degrade). Iteration cap 8.
- Model: `deepseek-v4-pro` (DP-1, 2026-05-02 — Pro chosen over Flash for closer reasoning parity with Sonnet 4.6).

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

### `lib/llm/cost-cap.ts`

```typescript
import type { ModelName } from "./pricing";

// Estimates cost from raw message size (characters) before the API call,
// using the model's input-per-MTok rate. Throws
// ApiError('generation_too_large') if the estimate exceeds the model's
// pre-cap. Caps are model-keyed in COST_CAPS_BY_MODEL — Anthropic
// $0.50/$1.00, DeepSeek-Pro $0.30/$0.20, DeepSeek-Flash $0.05/$0.03.
export function checkCostCapPre(
  model: ModelName,
  userMessageLength: number,
  systemPromptLength: number,
): void;

// Logs a warning to request_logs if actual cost exceeds the model's
// full cap. Does NOT throw — money is already spent. Tags the Sentry
// warning with `llm_model` so dashboard filters work across providers.
export async function checkCostCapPost(
  model: ModelName,
  cost_usd: number,
  applicationId: string,
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
- CV vs cover letter profiles: every CV uses the **dense** profile
  (`SPACING_DENSE` + `SIZES_DENSE`) regardless of seniority since
  2026-05-01 — paragraph_after 3pt, bullet_after 1pt, body 10pt,
  small / contact_line 9pt, section_heading 11pt, name_heading 15pt.
  The cover letter uses the **canonical** profile (`SPACING` + `SIZES`)
  — paragraph_after 4pt, bullet_after 2pt, body 10.5pt,
  small 9.5pt, section_heading 12pt, name_heading 16pt — for the more
  polished/spacious feel on a one-page document. Line-height (1.15)
  and fonts (Calibri) are identical across both. `getSpacingForSeniority`
  and `getSizesForSeniority` retain their `seniority` parameter as a
  future-flex hook (e.g. Lead/Principal could opt back to the looser
  canonical) but currently always return the dense profile. `renderCV`
  threads both profiles through every helper that emits a paragraph,
  plus the Document `default.document.run.size`.
- Cover letter brand rule: the sender contact line carries the same
  brand-orange bottom border as the CV's contact block (via the shared
  `contactLine(text, withRule=true)` helper), so both documents share
  a visual signature.

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
- `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS`: optional. Both must be set for email delivery to work; missing either fails closed with `ApiError('email_send_failed')` (telemetry fires, toast surfaces failure, auto-email step swallows and continues). With both absent the rest of the app runs normally.
- `SUPABASE_SERVICE_ROLE_KEY`: imported ONLY in `lib/supabase/service.ts`. Never elsewhere.
- Startup validation via Zod in `lib/env.ts`. Fail fast with clear message on missing vars.

---

## Deferred Features (do not build yet)

These are explicitly deferred until after the internal demo milestone.
The schema columns exist (so adding code later is additive). The routes do not.

- Per-user rate limiting (add via Upstash when signups open)
- Magic link auth (single Supabase toggle + 2 file changes when ready)

Email delivery, email confirmation UX, and account deletion have all
graduated from this list (see Decision Log entries dated 2026-05-01
and 2026-05-11). The `/api/applications/[id]/email` route, the
EmailMeButton on the success view, the auto-email Inngest step, and the
Settings → Preferences toggle ship as v1.

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

[18] Output-page polish + cover letter sizing (2026-05-01). User pass on the success-view UX:

* "What we did" cap tightened. §6 of `prompts/system-prompt-v2.md` now requires each item to be a single short sentence at ≤10 words (was ≤14). Examples cut accordingly. Schema cap at 500 chars unchanged — prompt rule does the bound. Reason: "scannable in two seconds" was the intent and 14 words was still letting the model emit nested clauses.
* "Attempt N" line removed from the header block on `app/(app)/application/[id]/page.tsx`. It carried no signal for fresh generations (always `attempt 1`) and the chain disclosure on `/dashboard` and `/history` already covers retries via `parent_application_id`. The "retry of …" inline link stays since it's only rendered when there *is* a parent.
* "Download cover letter" button promoted from `.btn-secondary` → `.btn-primary`. The two outputs are equal-rank deliverables; rendering one as primary and the other as secondary undersold the cover letter.
* CV + cover letter previews always-open and side-by-side. Used to live under separate `<details>` (CV open by default, cover letter collapsed). New layout drops both `<details>`, wraps the previews in a 2-col grid (`grid-cols-1 lg:grid-cols-2`), and breaks out of the (app) layout's `max-w-[720px]` constraint via the `relative left-1/2 right-1/2 -mx-[50vw] w-screen` viewport-breakout pattern so the two columns get real estate to render at. Stacks vertically below `lg`. Each preview wrapped in a `.surface-card` with an eyebrow label.

Cover letter sizing (`lib/docx/render-cover-letter.ts` + `lib/docx/styles.ts`):

* New `SIZES_COVER_LETTER` profile in `styles.ts`:
    body 22 (11pt) — one preset above the CV's 10pt
    small / contact_line 18 (9pt) — matches the CV's dense profile
    name_heading 30 (15pt) — matches the CV's dense profile
* Cover letter renderer now uses `nameHeading()` for the candidate's name (was bespoke bold body text at ~10.5pt). Visual weight finally matches the CV's name heading.
* All body / recipient / salutation / paragraph / signoff calls thread `SIZES_COVER_LETTER` explicitly. Document `default.document.run.size` follows. SPACING stays canonical (4pt paragraph_after) — bigger 11pt body fits naturally without spacing tweaks.

What was *not* changed: cover letter content paragraphs (still locked at 4 by Zod), CV renderer (uses dense profile per [9]), the schema caps, the §0 advocate posture, line-height (1.15).

[14] Light-mode cascade fix + warm palette (2026-05-01, follow-up to the same-day theme-toggle work). The previous turn shipped a `:root` block that redefined the brand tokens (`--color-dark`, `--color-dark2`, etc.) to light values. Bug: that block's selector specificity was 0,0,1 and source-order-tied with the @theme-emitted `:root` rule, so the light values won unconditionally — including in dark mode, which meant `--color-dark` resolved to `#fbfaf6` (white) and the whole dark theme rendered with white surfaces.

Fix: the light-mode brand-token redefinitions moved to `:root:not(.dark)` (specificity 0,1,1, only matches when html lacks `.dark`). @theme dark defaults now win in dark mode; the new selector wins in light mode. The previous shadcn semantic tokens in `:root` are unchanged — they don't conflict because they target different variable names.

Light palette also re-tuned to a single warm hue family so cards / hover / popover read as one piece of paper at different elevations rather than three random greys:
* page (`--color-dark`): `#faf9f4` — warm off-white canvas
* card (`--color-dark2`): `#ffffff` — pure white, raised
* hover (`--color-dark3`): `#f0ebde` — warm cream tint, secondary surface
* popover (`--color-dark4`): `#e3decb` — denser cream, modal/dropdown bg
* text (`--color-text`): `#1a1a17` — warm near-black
* muted (`--color-text-muted`): `#75726a` — warm grey, ~50% lightness
* dim (`--color-dim`): 18% warm-black

Brand orange and semantic accents (success / warn / danger / info) stay identical in both modes — they're the unifying anchor across the two surfaces.

Ambient blobs dimmed to 35% opacity in light mode (`:root:not(.dark) .ambient-blob { opacity: 0.35 }`). The dark-canvas alphas were producing too strong a colour cast on the light canvas; the dim keeps a hint of brand warmth in the corners without overwhelming the surfaces.

[14] Theme toggle + lighter greys + generations survive deletion (2026-05-01).

User asked for three things in one turn:
1. Generations should follow the existing 60-day expiry clock regardless of account deletion.
2. The dark theme greys feel too crushed; lift them without going near white.
3. A light/dark toggle next to the wordmark with a circular reveal animation that "eats" the page from the button outwards.

GENERATIONS SURVIVE ACCOUNT DELETION
Migration `supabase/migrations/0003_preserve_generations_after_user_delete.sql` flips `applications.user_id`, `master_cvs.user_id`, and `token_usage.user_id` from `ON DELETE CASCADE` to `ON DELETE SET NULL`, dropping the NOT NULL on each column. `profiles` keeps cascade (1:1 metadata, no value retaining); `idempotency_keys` keeps cascade (10-min TTL); `request_logs` and `telemetry_events` were already SET NULL in 0001. Behaviour: deleting a user nulls out user_id on rows the user owned but leaves them queryable by service-role. The expire-files / expire-metadata crons run as service-role and key off `files_expire_at` / `metadata_expires_at`, not `user_id`, so generations sweep on the same 60-day / 1-year clocks they always have. RLS policies (`auth.uid() = user_id`) match nothing once user_id is null, which is the desired post-deletion privacy stance: only the service role can see them, and only long enough for the cron to delete them. Comment on `app/(app)/settings/actions.ts` updated to reflect the new contract.

LIGHTER GREYS
`app/globals.css` `@theme` brand tokens lifted by one elevation level: `--color-dark` `#08080a` → `#11111a`, `--color-dark2` `#111114` → `#1a1a24`, `--color-dark3` `#1a1a1f` → `#25252f`, `--color-dark4` `#222228` → `#2f2f3a`. `--color-text-muted` `#7a7a88` → `#9a9aa8` for label text. `--color-dim` opacity 0.22 → 0.28. The `.dark` semantic var `--muted-foreground` opacity 0.5 → 0.66 — the single biggest readability hit was muted-foreground at 50% on a near-black background; 66% reads cleanly without flattening hierarchy.

LIGHT MODE
The codebase uses Tailwind utility classes that bind to literal brand tokens (`bg-dark2/60`, `text-text`, `border-border`). For a working light mode without rewriting every class, the new `:root` block redefines the same brand-token names to a light palette: `--color-dark` `#fbfaf6` (page bg), `--color-dark2` `#ffffff` (cards), `--color-dark3` `#f1f0ea` (hover), `--color-dark4` `#e7e6df` (popover), `--color-text` `#1a1a1a`, `--color-text-muted` `#6e6e66`. Order of elevation is preserved (page → card → hover → popover) but moves whiter rather than darker-grey. Token names are now slightly dissonant in light mode (`dark2 = white`) — a future refactor to semantic tokens (`surface-1`, `surface-2`) is the cleanup, but out of scope for this turn.

THEME TOGGLE WITH CIRCULAR REVEAL
* Inline FOUC-prevention script in `app/layout.tsx` `<head>` reads `localStorage.theme` before paint and toggles `.dark` on `documentElement`. Without this, every load flashed dark-then-light.
* New `components/app/ThemeToggle.tsx` (client) sits in the (app) topbar immediately right of the wordmark. Uses `lucide-react` `SunIcon` / `MoonIcon` (label switches to indicate the destination, not the current state).
* Click handler: writes the click x/y to `--x` / `--y` CSS vars on documentElement, then runs the swap inside `document.startViewTransition(() => applyTheme(next))`. The swap itself is a class toggle.
* CSS in `globals.css` defines `@keyframes theme-reveal` that animates `clip-path: circle(0% at var(--x) var(--y))` to `circle(150%)` on `::view-transition-new(root)`. Reads as the new theme expanding from the click point and "eating" the old one.
* Browsers without View Transitions (older Safari/Firefox) fall through to an instant theme swap — same end state, no animation. Progressive enhancement.
* `prefers-reduced-motion: reduce` disables the keyframe — same instant fallback.

What was *not* changed: AmbientBackground (orange/violet blobs may look slightly off in light mode but are still subtle; revisit if they read as garish), `:root` light tokens that drive the existing preview-card and email-body surfaces (those are independent of the new brand-token redefinitions and stay correct), the (auth) login layout's wordmark (no toggle there yet — limit to authenticated shell so the first-paint experience for new visitors stays predictable).

[14] Topbar reorder, account deletion, admin users page (2026-05-01).

Topbar order changed to `Distil` wordmark | `+ New application` (primary CTA) | `History` | `Settings` (gear icon). The primary action is now leftmost after the wordmark — closer to the eye when scanning the bar — while the icon-only Settings still sits at the right edge. `app/(app)/layout.tsx` is the only file affected.

Account deletion shipped (was deferred per the original spec). New `app/(app)/settings/actions.ts` Server Action `deleteAccount` requires the user to retype their email, hashes it for the `account_deletions` audit table (already in the v1 schema), then calls `supabase.auth.admin.deleteUser(userId)` via the service-role client. Schema cascades clean up profiles / master_cvs / applications / generation_events / token_usage / idempotency_keys; request_logs and telemetry_events SET NULL so operational logs survive. New `components/settings/DeleteAccountForm.tsx` is a two-step client component (reveal → typed-email confirmation), with the destructive button disabled until the typed email exactly matches the session email. Added a "Danger zone" section in `app/(app)/settings/page.tsx`.

Admin Users page (`app/(app)/admin/users/page.tsx`) reads every registered email from `auth.users` via `service.auth.admin.listUsers()` and joins each row to its matching `profiles` entry for the `is_admin` flag inline. Stats: registered count, admin count, recent-deletion count. A "Recent deletions" panel below the table shows the timeline from `account_deletions` (email is hashed sha256 in the table; the panel surfaces ids + timestamps only). Sub-nav in `app/(app)/admin/layout.tsx` gains a fourth entry.

Admin Usage status filter (`app/(app)/admin/usage/page.tsx`) — server-side via `?status=` search param. Pill nav above the table; filter pushed into the SQL `.in('status', [...])` clause so the row cap (50) is applied after filtering rather than before.

Admin Errors compaction (`app/(app)/admin/logs/page.tsx`) — replaced the per-error `<article>` with a single-row `<details>`/`<summary>` per row in a contiguous list. Default-collapsed view is one line per error (source pill + name + truncated message + error_code + time). Click to expand for the full message and footer (duration, application id, user id). Same data, ~3x denser at rest.

Admin Telemetry "Other events" — added bar chart per row, mirroring the funnel section's treatment. Bars use `bg-orange/70` so they read as secondary to the funnel bars (which are full-orange).

What was *not* changed: schema (no migration needed — `account_deletions` already exists per the original spec), the (admin) prod move TODO from Decision Log [13] (still pending), the consumer-facing topbar items (History link still secondary text, gear icon still icon-only).

[14] History as chains, not flat rows (2026-05-01). User-reported on the dashboard "Recent" panel: rows showed cryptic IDs ("7a7eb09d") and an "attempt 1" tag that was visual noise — every fresh generation is attempt 1, so the field carried no signal until a retry happened, and even then it duplicated information already implied by the `parent_application_id` chain.

Three changes:

1. **Group flat rows into chains.** New `lib/applications/chains.ts` walks `parent_application_id` to find each row's chain root within the fetched window, then builds a `ChainCard` per root with `attempts: ChainAttempt[]` for the descendants. `groupIntoChains(rows)` is pure; both dashboard and history pages call it. Effective status: a chain "Ready" if any descendant is `success`; else "In progress" if any live; else the latest descendant's status mapped to a user-facing label (`error` / `cancelled` → "Didn't finish", `insufficient_input` → "Needs more info", `abandoned` → "Abandoned"). Anchor (where the card click goes) is the success leaf if present, else the latest leaf.

2. **Title from JD.** When any descendant has `llm_response_json.status === 'success'`, the chain title becomes `${role_archetype} @ ${company_name}` (e.g. "Data Analyst @ Te Atatū Council"). Falls back to a single field if only one is available, then to the short ID for chains that never reached a successful generation. The ID column was previously the only label, regardless of whether structured output existed.

3. **Single ChainCard component for both pages.** New `components/app/ChainCard.tsx` is a server component using a native `<details>`/`<summary>` element for the per-attempt disclosure (no client JS). The card shows title + effective status pill + last-activity time; expanding the disclosure shows each attempt's id + raw status pill + creation time, each linking to its own `/application/[id]` page so the user can still inspect a failed original after the success retry. The "attempt N" column is gone; chains with only one attempt show no disclosure at all.

Dashboard `page.tsx` and `history/page.tsx` updated to fetch `parent_application_id` and `llm_response_json`, group into chains, and render `<ChainCard>` instead of bespoke list rows. `HistoryList` rewritten to filter on chain effective status (`Ready` / `Needs info` / `Didn't finish` / `In progress`) and search by title or any id in the chain. Eyebrow + display-heading classes used for the page hero.

A separate `docs/cleanup-smoke-tests.sql` snippet covers the user's request to remove the 18 original smoke-test rows: the snippet documents the SQL Editor `auth.uid() = NULL` gotcha (Decision Log [12]) and provides INSPECT-then-DELETE steps with notes on FK constraints and orphaned storage objects.

[18] Success-view restyle + content-length tightening (2026-05-01). User-reported: the rendered "What we did" checklist and "Fit" reasoning were both wall-of-text — wordy, cramped, hard to scan. Two layers:

Frontend (`app/(app)/application/[id]/page.tsx` SuccessView):
- Fit section: score is now a coloured pill (success / warn / danger tones via `FIT_TONE` map). Salary band moved up next to the pill as a green chip (range + confidence in muted form). Reasoning is one short paragraph below. Warnings rendered as a tight list with a small warn-tone dot marker, not a list-disc paragraph dump.
- "What we did" section: kept the orange-subtle surface treatment (still signals "highlighted moment") but dropped the serif-italic styling — items are short and punchy now, ornament was working against legibility. Each item gets a green `CheckCircleIcon` from lucide-react, satisfying the user's "few green checks for confidence" ask.
- Download buttons promoted to `.btn-primary` (CV) and `.btn-secondary` (cover letter) for visual hierarchy. Files-expire-at uses `.text-meta`.
- CV / Cover letter preview details switched to `.surface-card` styling for parity with the rest of the page.

Prompt (`prompts/system-prompt-v2.md`):
- §3 Phase 3 Fit reasoning: was "1 to 2 sentences explaining the score honestly", now "**exactly one sentence, max 25 words**. Lead with strongest matching evidence, then name the most material gap concisely. No multi-clause sentences." Worked example included.
- §3 warnings: was unbounded text, now "0 to 4 items, each one plain-English sentence, **max 20 words**. Action-oriented, not narrative. State the gap, not the consequence."
- §6 What We Did Checklist: was 5 to 8 items with no length cap; now 5 to 7 items, **max 14 words each**, single clause, no nested constructions, no enumerations after a colon, lead with a strong past-tense verb. Refreshed example items to match the new shape.

What was NOT changed: schema caps in `lib/llm/output-schema.ts` (would trip Decision Log [7] — fit_assessment.reasoning is still capped at 1500 chars, what_we_did_checklist[] at 500, warnings[] at 600; the prompt rules tighten content guidance well below those ceilings without changing validation). The §0 advocate posture and §7.0 stop-and-reconsider gate are untouched. Cover letter, CV body, and DOCX rendering are all unaffected.

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

[9] Graduate font-size profile (2026-05-01, follow-up to the 2026-04-30 graduate work). The renderer-side `SPACING_GRADUATE` density tweak plus the §4.4 prompt budget were not enough on their own — a real graduate generation was still landing at 3 pages. The user empirically tested by selecting all body text in Word and pressing the "decrease font size" preset (one click); the result fit naturally on 2 pages. Ported that into the renderer as `SIZES_GRADUATE` in `lib/docx/styles.ts`:

- body: 21 → 20 (10.5pt → 10pt)
- small / contact_line: 19 → 18 (9.5pt → 9pt — at the ATS floor; only used for one-line meta text under role headers and the contact line, never for body content)
- section_heading: 24 → 22 (12pt → 11pt)
- name_heading: 32 → 30 (16pt → 15pt)

New `SizeProfile` type and `getSizesForSeniority(seniority)` helper. `lib/docx/helpers.ts`: every helper that emits a `TextRun` now takes an optional `sizes: SizeProfile = SIZES` argument; default behaviour for any caller that doesn't pass one (cover letter renderer, future callers) is unchanged. `lib/docx/render-cv.ts` threads `sizes` through every helper call, the inline `TextRun` for professional-experience role headers, and the Document `default.document.run.size`.

Why 9pt is acceptable for `small`/`contact_line`: those fields are limited to single-line meta text (`Auckland | 2024 to 2025`, contact pipe-joined fields). The 9pt ATS floor applies primarily to body content, where 10pt remains the new graduate floor. Calibri at 9pt is also slightly larger visually than Times at 9pt, which is what most ATS guidance is calibrated against. Mid+ stays at 10.5pt body / 9.5pt meta; this profile is opt-in via seniority.

What was not changed: line-height (1.15 still — going below feels cramped at 10pt), margins, fonts, spacing-graduate (still in place; the two profiles compose), the §4.4 prompt content budget (still primary lever — a verbose graduate output at 10pt will still overflow). Cover letter renderer is unaffected (passes the canonical defaults).

[9] Promote dense profile to all seniorities + brand the cover letter (2026-05-01, follow-up to the same-day SIZES_GRADUATE work). Two changes after the user reviewed a real graduate generation:

1. The dense font/spacing profile is now the CV default for every seniority. Originally introduced as a graduate-only safety net, the user reported "I can easily read it and it's more information packed instead of cramped, prefer this throughout." `SPACING_GRADUATE` renamed to `SPACING_DENSE`, `SIZES_GRADUATE` renamed to `SIZES_DENSE`. `getSpacingForSeniority` and `getSizesForSeniority` retain the `seniority` argument as a future-flex hook but currently always return the dense profile. The canonical `SPACING` / `SIZES` constants are kept untouched and continue to drive the cover letter and the helper defaults — so any caller that wants the looser/larger profile gets it for free, and the cover letter is unaffected by this change.

2. Cover letter sender block now carries the same brand-orange bottom rule as the CV's contact block. Replaced the bespoke `Paragraph` construction in `lib/docx/render-cover-letter.ts` with the shared `contactLine(text, withRule=true)` helper, so both documents share a visual signature without duplicating the border setup. Color, weight, and spacing of the rule are identical across CV and cover letter (1pt brand-orange under the contact pipe-joined line).

What was not changed: helpers' canonical defaults (still SPACING / SIZES, so cover letter and any future caller stays on the larger profile by default), cover letter spacing/sizes (intentionally larger than the CV — one page already, no density pressure), the §4.4 prompt content budget, the §0 advocate posture, fonts, margins, line-height, the ATS rules.

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

[10] DECISION POINT `llm_invalid_output` observability: Option A — observability-only first, then field fix in a follow-up. Real generations were failing with `llm_invalid_output` at the validate-output step, but the failures could not be diagnosed from `request_logs` because (a) the step threw `NonRetriableError("llm_invalid_output", { cause: parsed.error })`, which is not an `ApiError`, so `withInngestStep` recorded `error_code = 'internal_error'` (not `llm_invalid_output`), and (b) `parsed.error.issues` were never persisted to `metadata` at all — they only reached Sentry and the Inngest run timeline. A SQL query for `error_code = 'llm_invalid_output'` returned zero rows by design. Two surgical changes (no schema or prompt changes — those will land in the follow-up grounded in real Zod paths):

  - `lib/logging/with-inngest-step.ts`: walk the `cause` chain (depth-capped at 8) when an error is caught. If an `ApiError` is found anywhere in the chain, record its code instead of `internal_error`. If a `ZodError` is found anywhere in the chain, lift `error.issues` (capped at 20) into `metadata.zod_issues = [{ path, code, message }]` with `path` joined on `.`. Both helpers are local; `findApiError` and `findZodError` are tiny pure-walks; `summariseZodIssues` runs each issue's message through `sanitiseErrorMessage` so PII guards still apply.
  - `inngest/functions/generate-application.ts:validate-output`: keep the outer `NonRetriableError("llm_invalid_output")` (Inngest needs that to skip retries) but wrap an `ApiError("llm_invalid_output")` as the cause, and the `ZodError` as the cause of *that*. Chain shape: `NonRetriableError → ApiError → ZodError`. The wrapper's chain walk now lights up both the right `error_code` and the issue paths in metadata.

  Side effect (deliberate): any inngest step that throws something with an `ApiError` somewhere in its cause chain will now be classified by that ApiError code rather than by the outermost wrapper. This is strictly an improvement in fidelity for the existing call sites; nothing currently chains an ApiError through a wrapper unintentionally.

  Rejected: Option B (bundle a guess fix like bumping `max_tokens` to 24K and pre-emptively relaxing email/url validators in the same commit) — bundles a guess into the same change without data; if truncation isn't the actual cause, the bump is dead-weight. Option C (relax the strict validators and bump max_tokens without metadata capture) — highest blast radius, lowest signal; even if it works we wouldn't know which field carried the day, and the next failure mode lands us back at zero observability.

  Follow-up plan: run a real generation against a known-failing JD, query `select metadata, error_message from request_logs where source='inngest_step' and name='validate-output' and error_code='llm_invalid_output' order by created_at desc limit 20`, group by `metadata.zod_issues[*].path`, and ship the targeted fix (raise a specific cap, relax a specific validator, raise `max_tokens`, or whatever the data shows) as a separate commit.

[7] Output-schema follow-up grounded in real Zod paths (2026-05-01, follow-up to the observability commit above). First production query after the metadata-capture change returned a single failing path: `jd_analysis.ats_keywords`, `too_big`, "expected array to have <=12 items". The model emitted 13+ keywords; schema cap was `.min(8).max(12)`, prompt §1 Phase 1 said "Top 8 to 12" with no explicit ceiling language. Same pattern as Decision Log [7] (2026-04-30) — schema and prompt agreed exactly on the upper bound, leaving zero cushion against model drift.

  Three-part fix:
  - `lib/llm/output-schema.ts`: raised `ats_keywords` cap 12 → 16. The 8–12 rule remains the prompt's primary lever; the schema cushion is a runaway-prose guard, not a green light to emit 16.
  - `prompts/system-prompt-v2.md` §1 Phase 1: appended "**Hard cap at 12. Pick the most important ones; do not pad past 12.** This is a count limit, not a target — 8 strong keywords beat 12 weak ones." Makes the upper bound explicit so the model treats it as a count limit, not a quality target it can exceed for completeness.
  - `prompts/system-prompt-v2.md` §10 self-check item 22: forces the model to count the array and trim to ≤12 before returning.

  Proactive companion fix on the same shape: `recent_news` had the same exact-match pattern (schema `.max(3)`, prompt "up to 3 items"). Cap raised 3 → 5 in the same commit. No production overflow yet; raised pre-emptively because the failure mode is identical and the cost of one drop-zero is another paid generation lost.

  Audit of remaining count-based caps: kept strict for `paragraphs.length(4)` (intentional, schema and prompt both say exactly four), `professional_experience.bullets.max(8)` (comfortably above prompt's 3-5), `key_projects.max(5)` (comfortably above prompt's 2-3), `what_we_did_checklist.min(5).max(8)` vs prompt "5 to 7" (already has cushion). No other tight matches identified.

[14] ApplicationLiveView redesign for the ~2-minute wait (2026-05-01). User feedback after a real generation: the centre block read as small and top-anchored, the 1-2-3-4 stage indicator was visibly left-justified (rails consumed flex-1 to the right of each circle, leaving the last quarter empty), and the phrase pool was thin enough that the same six research phrases were looping ~5 times during a 2-minute wait. Fix in `components/application/ApplicationLiveView.tsx`:

  - Stage indicator rebuilt on a 4-col CSS grid with the connecting rail absolutely positioned at top-14px between 12.5%-87.5% (the centres of quarters 1 and 4). Active fill on the rail tweens via width: `calc((87.5% - 12.5%) * fill)`. Result: stages are at 12.5%, 37.5%, 62.5%, 87.5% — visually centred. Replaced the old "flex-1 li with rail-after" pattern that was responsible for the left-skew.
  - Hero block: dual-ring spinner now sits inside a radial-gradient halo (orange-glow, breathing 2.6s loop). Two stacked radial-gradient backdrops on the section give the card a luminous "warm centre" feel without adding image assets. Phrase typography promoted to font-serif text-2xl with an "Now happening" eyebrow. Spinner glyph now switches per-phase (·, ?, ✎, ▤, ✓).
  - "In this step" panel: 4 mini-bullet captions per phase, dot-marker list with staggered fade-in. Gives the user something specific to read about *what is currently being done* rather than just a phrase rotation.
  - "Did you know" rotating tip carousel on an independent 6.5s timer. 15 product-confident, factually-grounded tips (covers research, content rules, ATS keywords, fit-score honesty, file-expiry, cost cap, cache, observability). Two streams of fresh copy means the page never feels static.
  - Phrase pools expanded: research 6 → 28 (~90s before repeat at 3.2s/phrase), generation 5 → 8, render 2 → 4, wrap 2 → 4. Research is the dominant phase (LLM call ~90s of the wait); 28 phrases × 3.2s = 89.6s, longer than the typical wait.
  - Elapsed timer line gains "typically 1m 30s to 2m" so users have a wall-clock expectation.
  - Visual polish: card switched from `surface-card` to a custom rounded-2xl + dark2/60 + backdrop-blur shell so the gradient halos read through. Active stage circle gains an orange shadow-glow and ping ring.

  What was *not* changed: SSE / polling-fallback logic, phase event mapping, terminal-state guard, router.refresh() behaviour. The animation timings live inside scoped `<style jsx>` blocks per sub-component and are uniquely-prefixed (`live-fade-up`, `live-pulse`, `live-spin`, `live-fade-in`, `live-tip`) so they don't collide with any existing globals.

[8] Web search budget: tool-side cap + prompt rewrite (2026-05-01). User reported per-generation cost creeping toward $0.50 again. Investigation against `token_usage`:

  - 7-day average: 22 generations, avg_cost $0.286, avg_searches 2.95, avg_input_tokens 30K, avg_output_tokens 3.3K, avg_cache_read 44K, avg_cache_write 28K. Average is $0.29 not $0.50.
  - Latest generation (`22471e6a-...`): $0.4864 actual cost. 6 web searches, 80K cache_creation_tokens, 181K cache_read_tokens. Cost breakdown: cache write $0.30 (62%), output $0.06, web search $0.06, cache read $0.05, input $0.01. The 6 searches drove the cost — each invocation appends its result blocks (3-8K tokens each) to the messages array and Anthropic re-runs the model with the full prefix on every iteration, so cumulative cache reads/writes grow quadratically with search count.
  - Spec audit: §3 Phase 2 emits 6 research outputs (snapshot, recent_news, industry_context, is_public_sector, role_toolkit, company_reference_used) and §3 Phase 4 emits salary_band. Realistic minimum: 1 broad about-page search (snapshot + industry + public-sector flag inferable from one page), 1 recent-news search (covers recent_news AND the cover-letter project reference), 1 salary search. Three mandatory + 1-2 for reformulation or dedicated toolkit lookup = 4-5 typical, 5 hard cap. The 6th search is almost always the model fact-checking itself or following the "engineering blog, StackShare, GitHub..." source list as a per-source checklist.

  Two-part fix:
  - Tool-side: `max_uses: 5` on the web_search tool in `lib/anthropic/tool-schema.ts:106`. Hard backstop. Catches outliers like the $0.49 generation; doesn't change behaviour for typical 2-3-search runs.
  - Prompt-side: §3 Phase 2 rewritten with an explicit "2 to 3 web_search calls" budget at the top, plus a numbered search order (about-page → news → optional reformulation → optional toolkit). Industry, public-sector, and role-toolkit reframed as **inferred from the about-page result and the JD, not searched separately**. The "engineering blog, StackShare, GitHub org, case studies" list reframed as a *last-resort optional source*, not a per-source checklist. §3 Phase 4 gains a "1 to 2 web_search calls" budget — user explicitly carved out room for a salary triangulation search; one broad "[role] [seniority] salary NZ" query usually returns Hays/RW/Seek/Trade Me aggregator results in one go, second search optional. §10 self-check item 23 added to enforce the budget at output time.

  Effective cost target: avg should drop from $0.29 toward $0.20-$0.25; worst-case tail capped at ~$0.35 (the 5-search-with-large-tool-results case). Reassess after 2-3 weeks of new data via the same `select count(*), avg(cost_usd), avg(web_search_count), ...` query.

  What was not changed: tool_choice "any" (still required so the model can call web_search before submit_application), system prompt caching (still on, still amortising the ~11K-token system prompt), schema caps on research_summary fields. The §3 Phase 2 emit list is unchanged in shape — the change is purely in *how* the model is told to gather the data.

[9] CV layout / prompt fixes after a real graduate-ish overflow (2026-05-01). User-reported on a generation for a candidate with Master's + ~3y work + internships:

  - **Page 3 contained only "Referees: Available on request"**: a section heading + body paragraph for one stock phrase was burning ~3 lines of vertical space. Fix in `lib/docx/render-cv.ts`: render the referees block as a single small grey inline line at the bottom (`metaLine(\`Referees: \${referees}\`, ...)`), no separate section heading. ATS parsers still match on the "Referees:" prefix as a section-equivalent keyword. Lifts the most-common-overflow case onto 2 pages without changing any other content.
  - **Education was rendering each detail line as a bullet**: the `details: string[]` array got `bullet()` per item, costing a full line + bullet indent per detail. With 3-4 details (e.g. GPA, specialisation, two certifications) that's 4 wasted lines per education entry. Fix in `lib/docx/render-cv.ts`: render details as a single `bodyParagraph` joining items with " · " (typographic middle dot) instead of multiple bullets. Most education entries naturally have 1-2 substantive details which fit comfortably on one line; the join collapses gracefully when there's just one.
  - **Certifications were appearing under Education**: the model put `AWS Certified Machine Learning Engineer (AWS, 2025)` and `Google Cloud Generative AI Leader (Google, 2025)` into `cv_content.education[].details[]`. The schema has no separate certifications field, so the model invented a placement. Fix in `prompts/system-prompt-v2.md`: §4.1 gains an explicit "Certifications placement (hard rule)" block — certifications belong in **Technical Skills as a category called 'Certifications'**, formatted `Vendor Name (Issuer, Year)`. §4.4 graduate Education line gains "Do not put certifications here." §4.4 mid Education line gains the same. §10 self-check item 24 added: scan every education detail string for "Certified", "AWS", "Azure", "GCP", "PMP", "Scrum", "ITIL" etc. — if any match, move to Technical Skills before returning.
  - **Graduate budget enforcement weakened**: §4.4 Graduate Education line tightened from "1 to 3 detail lines" to "0 to 2 detail lines" (default 1) since each detail now takes only one inline slot but still counts against page budget. New §10 self-check item 25 makes the model do a mental render-line count before returning: ~58 lines lands cleanly on 2 pages with the dense profile, 65+ overflows; if approaching 65, drop the lowest-relevance role / second key project / 1-2 technical skill groups. Trim once, do not return-then-trim.

  What was not changed: bullet rendering for professional_experience and key_projects (still bullets — that's the right rhythm for outcome-bearing role bullets), section ordering, font sizes, margins, the dense profile, schema shape (still no `certifications` field — Technical Skills group covers it). The Referees section name still appears on page (greppable for ATS), just one line shorter and without a heading.

[14] Did-you-know carousel removed from waiting screen (2026-05-01). User-reported the rotating tip carousel revealed implementation details (cost cap, cache TTL, observability, file expiry windows) that customers should not see. Removed entirely from `components/application/ApplicationLiveView.tsx` along with the 15-tip pool, tip rotation timer, and `DidYouKnow` sub-component. The "In this step" panel (which describes the work being done in user-friendly terms — "Researching the company live on the web") stays since it covers the visible work, not the secret sauce.

[7] Schema strictness audit — `paragraphs.length(4)` failure + sweep of every same-shape constraint (2026-05-01). Real failure: ZodError captured via the observability pipeline showed `cover_letter_content.paragraphs` had 5 entries, the 5th an empty string — tripped both `.length(4)` (too_big) and the per-string `.min(1)` (too_small). Same shape as the 2026-04-30 cap audit and the 2026-05-01 ats_keywords/recent_news audit: schema strictness vs realistic model output, no cushion against drift.

  Pulled the audit forward to every constraint with the same risk profile (strict count equality, strict format validators, strict-but-realistic-tight bounds). Six relaxations + one preprocess shipped in `lib/llm/output-schema.ts`:

  - `cover_letter_content.paragraphs`: `.length(4)` → `.min(3).max(5)` with a `z.preprocess` that strips empty/whitespace-only strings before bounds are checked. The 4-paragraph rule stays primary in the prompt (§5.2 now spells out "exactly four non-empty strings, no trailing empty 5th"), and §10 self-check item 26 enforces it. Schema is the cushion, not the gate.
  - `email` (contact_details + cover_letter_header): `z.string().email()` → `string.min(1).max(200)`. Prompt §7.1 explicitly says "copy verbatim, do not validate" — strict RFC-5322 was directly contradicting the prompt for any CV with a non-canonical email.
  - `source_url` (recent_news[] + salary_band): `z.string().url()` → `string.min(1).max(500)`. Renderer prints clickable links; malformed URLs degrade gracefully on the user side instead of dropping the whole generation.
  - `jd_analysis.ats_keywords`: `.min(8)` → `.min(5)`. Short or vague JDs may yield 6-7 strong keywords; the 8-12 prompt rule stays primary.
  - `professional_experience.bullets`: `.min(2)` → `.min(1)`. System prompt §4.4 Lead/Principal explicitly says older roles "collapse to one line each: role, company, dates, no bullets" — schema was directly contradicting the prompt. min(1) keeps a single summary bullet as the floor (§10 item 27 enforces); empty bullets arrays are not allowed.
  - `cv_content.profile`: `.min(150)` → `.min(100)`. Graduate §4.4 budget can produce a tight 3-sentence profile under 150 chars; quality scan still flags short profiles via the sentence-bound check.

  What stayed strict: the discriminated-union shape (`status` enum is the gatekeeper), every required field's existence (not null/missing), enum fields (score, confidence, seniority), array caps where the prompt and schema agree on the upper bound as a content-quality lever (`paragraphs.max(5)`, `what_we_did_checklist.max(8)`, `ats_keywords.max(16)`), and per-string maximums.

  Prompt-side companion changes: §5.2 gains "Hard rules for the paragraphs array" block (exactly 4 non-empty, no trailing empty 5th, do not split a paragraph across entries). §10 self-check items 26 (paragraph count + non-empty), 27 (every role has ≥1 bullet, no empty arrays), 28 (email copied verbatim, do not "fix" format).

  Side effect: any other Zod failure that previously dropped a generation now either passes (because the schema is more forgiving) or surfaces a more specific issue path through the same observability pipeline. Re-querying `request_logs` after a few weeks of new data should narrow remaining failure modes; the schema is now sized for the model's real output, not for the gatekeeping posture it was originally tuned against.

[14] Light-mode design system pass for the admin panel (2026-05-01). User-reported: "all the white elements are looking weird almost muddy" in the admin panel. Root cause: the previous light palette mapped `dark2 → #ffffff` and `dark3 → #f0ebde` (cream), so the admin pages — which expect "container bg-dark3 BRIGHTER than header bg-dark2" per the dark-mode elevation idiom — got the opposite layering in light mode (cream container with a white header band on an off-white page = three near-white tints clustering with no clear hierarchy).

  Three coordinated fixes in `app/globals.css`:

  - **Light palette retuned** to mirror dark mode's "going up = more elevated/brighter" direction: `dark` (#f5f3ed) page → `dark2` (#faf8f2) subordinate tint → `dark3` (#ffffff) primary card → `dark4` (#ffffff) popover. Now every component using `bg-dark3` for a container with `bg-dark2` inside renders correctly in both modes (container is brighter than its inner band). `--color-dim` switched to a flat warm-grey `#b8b6ad` so `bg-dim/15` produces a visible 15% wash instead of the previous near-vanishing rgba(black, 0.18) at 15% (~3% effective alpha).
  - **`.panel` primitive added** alongside `.surface-card`: same elevation treatment, no baked-in padding. Used for admin tables (which need overflow + flush table inside) and stat cards (which want custom padding). Replaces all the bare `rounded-lg border border-border bg-dark3 p-X` recipes scattered across `admin/usage`, `admin/logs`, `admin/telemetry`, `admin/users`.
  - **Light-mode surface elevation via shadow** (`:root:not(.dark)` overrides on `.surface-card`, `.surface-card-interactive`, `.panel`, `.surface-row`, `.btn-secondary`, `.btn-ghost:hover`, `.btn-icon:hover`): pure-white `bg-dark3` surfaces sit on the `dark` page bg, lifted by a two-layer shadow stack (1px ambient + 4px depth) and a subtle warm-near-black border at rgba(21, 20, 14, 0.08). `backdrop-filter` is explicitly disabled in light mode since there's nothing to blur underneath a white card on an off-white page — saves CPU. Hover states bump the border to brand orange and deepen the shadow.

  This is the Linear / Vercel / Tailwind UI idiom: pure-white cards on a warm off-white canvas with shadow elevation, not tinted "elevation by darker shade" which is the dark-mode pattern.

  Admin pages refactored to use `.panel`: `admin/usage`, `admin/logs`, `admin/telemetry`, `admin/users`. Stat cards and table containers now share the same elevation treatment in both modes. Subordinate states inside panels (table `<thead>`, filter pill inactive state, logs footer band) still use `bg-dark2` / `bg-dark2/40` / `bg-dark2/60` — those resolve to the new subtle warm tint in light mode and read as proper subordinate bands inside the white panel.

  What was *not* changed: dark mode (still uses cream-free dark2/3/4 progression as before), brand orange / semantic accents (the unifying anchor across modes), the `:root` light tokens for preview-card islands (those are independent of the brand-token redefinitions), the AmbientBackground layer.

[8] DeepSeek V4 migration — provider-switchable LLM layer (2026-05-02). Anthropic Sonnet 4.6 was costing ~$0.29/gen with caching ON; user asked to evaluate DeepSeek V4 (released as preview 2026-04-24). Migration shipped behind a runtime env-var toggle (`LLM_PROVIDER=deepseek` to use DeepSeek, anything else falls back to Anthropic). Six DPs decided in one round before any code:

  - **DP-1 model: deepseek-v4-pro.** Pro positions explicitly vs top closed-source models (rivals Sonnet 4.6); Flash positions for "simple agent tasks" — ours is not simple (multi-phase web research + 50-field structured output + storytelling cover letter + honest fit reasoning). Cost delta Pro→Flash is pennies/gen at our volume so the savings come from search choice (DP-2), not the model tier. Promote to Flash later if Pro proves overkill.

  - **DP-2 web search: Tavily, client-side tool loop.** DeepSeek has no server-side search equivalent of Anthropic's `web_search_20250305`. Picked Tavily ($0.008/call basic) over Brave (cheaper, lower quality), Exa (semantic, less natural for company-name queries), and Perplexity Sonar (answer-shaped, would replace the research phase rather than augment it). Loop semantics live in `lib/deepseek/provider.ts`: each iteration sends `{messages, tools: [submit_application, web_search]}`; on `submit_application` we JSON.parse and return; on `web_search` we hit Tavily and append a `tool` role result message; cap 5 search calls / 8 iterations. The 6th search returns a "budget exhausted" tool result instead of erroring (graceful degrade so the model can finish with what it has). User ratified the 5-call hard cap on the basis that searches CAN return nothing useful (sparse results need reformulation) and salary triangulation is genuinely useful.

  - **DP-3 tool-use mechanism: OpenAI function-calling, keep flat-root schema.** DeepSeek follows OpenAI spec exactly — `tools: [{type: "function", function: {name, description, parameters}}]`, `tool_choice: "required"` (= Anthropic's `{type: "any"}`), tool_calls returned with stringified arguments needing `JSON.parse`. Critically, the `submitApplicationTool` JSON Schema produced by `lib/anthropic/tool-schema.ts` (the flat-root form from DP-A revision) drops directly under `function.parameters` — no schema rewrite. Strict mode (DeepSeek beta) skipped: requires the beta base URL and would force a schema reshape; we already enforce correctness with the post-call Zod discriminated-union parse in `validate-output`.

  - **DP-4 prompt caching: automatic, no markers.** DeepSeek's KV cache is on-disk and implicit — no `cache_control` markers. Cache hit/miss reported as `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` per call; we sum them across iterations. Cache writes are NOT separately metered or billed (unlike Anthropic's 1.25x-input write rate), so `cache_creation_tokens` is always 0 on the DeepSeek path. The system prompt naturally benefits as a stable prefix.

  - **DP-5 cost caps: rescaled per-provider.** Anthropic kept at $0.50 pre / $1.00 post. DeepSeek-Pro at $0.30 pre (matches the ~166K-token tolerance at $1.74/MTok) / $0.20 post (3.5x of projected $0.05 average). Flash at $0.05 / $0.03. Caps live in `COST_CAPS_BY_MODEL` (`lib/llm/pricing.ts`) keyed on the model that ran the call, so a mid-queue env-var flip uses the right thresholds. Pre-call estimator now takes the model as its first arg and reads the matching `input_per_mtok`.

  - **DP-6 module structure: thin adapter.** New `lib/llm/{types,provider,index,pricing,cost-cap,tools}.ts`. `lib/anthropic/client.ts` + `lib/anthropic/cost-cap.ts` + `lib/anthropic/pricing.ts` deleted; their contents moved (Anthropic SDK call body now lives in `lib/anthropic/provider.ts` as `class AnthropicProvider implements LlmProvider`; pricing + cost-cap are provider-neutral and live under `lib/llm`). `lib/anthropic/tool-schema.ts` stays — still the canonical `submitApplicationTool` (Anthropic-typed) and the `webSearchTool` (Anthropic server tool, only used by the Anthropic provider). `lib/llm/tools.ts` lifts the Anthropic tool's `input_schema` body out as a neutral `LlmTool.parameters`. The Inngest call site (`generate-application.ts`) now reads `import { llm, ... } from "@/lib/llm"` and calls `llm.callLLM({...})` — no other call sites changed.

  Locked Interface Contracts in CLAUDE.md updated to reflect the neutral types and the per-provider behaviour. The original `callLLM` contract under `lib/anthropic/client.ts` is replaced by the `LlmProvider.callLLM` contract under `lib/llm/{types,index}.ts`.

  Migration order shipped in this commit: env scaffold → neutral types/pricing/cost-cap → tools bridge → Anthropic provider → Tavily client → DeepSeek provider with tool loop → provider switch → Inngest call-site update → typecheck. Default stays `LLM_PROVIDER=anthropic` so production traffic is unaffected until the env var is flipped explicitly. Rollback is a Vercel UI toggle (no redeploy) — the `getLlmProvider()` reader is module-scoped so the next Inngest cold start picks up the change. If `getLlmProvider()` ever needs to be per-request instead of per-cold-start (mid-queue rollback), it can mirror the kill-switch convention without touching the providers.

  What was NOT changed: `ApplicationOutputSchema` (per the [7] strictness audits — schema shape is the contract; if V4 emits something it rejects, the existing `request_logs.metadata.zod_issues` observability tells us which field, and that's data for a follow-up commit, not pre-emptive relaxation), the system prompt (the §3 Phase 2 / §3 Phase 4 web-search budget rules apply equally to the Tavily-backed loop — same 2-3 typical / 5 cap), the cover letter renderer, the DOCX styles, the Inngest pipeline shape (still 10 steps, `mark-running → cost-cap-check → call-llm → cost-cap-postcheck → validate-output → ...`).

  Test plan deferred: one preview-deployment run per seniority tier (Graduate / Mid / Lead) with `LLM_PROVIDER=deepseek` set on the preview env only, before flipping production. Side-by-side comparison against an Anthropic baseline for the same JD will gate the prod flip; the high-risk fields are `fit_assessment.reasoning`, `research_summary` (Phase 2 quality with Tavily-fed results vs Anthropic's in-band search), and the storytelling paragraph 2.

[18] Duplicate-role guard + cross-domain advocate framing (2026-05-08, prompt-only). User-reported: a successful generation produced a CV with the same professional_experience role emitted twice — same role title, same company, same dates, near-identical bullets. Existing prompt had no rule forbidding role duplication; §5.4 covered unsourced industry/market claims and numeric fidelity, but duplication was not framed as a hallucination class. Self-check items 1–31 had no pair-comparison check. Three DPs decided before edits:

  - **DP-1 placement → Option C (fold into §5.4 as a duplication-as-hallucination class).** Same mental model as the existing numeric fidelity rule: "every claim traces to a single source, do not invent additional occurrences". Extends a frame the model already self-checks against, rather than introducing a parallel "uniqueness" concept under §4. Option B (broader §4.5 covering roles + bullets-within-role + skills-across-categories) rejected — speculative, no failure evidence yet for the other surfaces, and the schema-side comments already established a *targeted-fix-per-surfaced-failure* discipline (mirrored here on the prompt side).
  - **DP-2 self-check placement → Option A (narrow item 32, professional_experience only).** Same targeted discipline. Item 32 instructs the model to compare every pair of roles by `role_title` + `company` after trim/lowercase; if any pair matches, drop or merge before returning. Option B (broader scan across experience + projects + skills) rejected — couples three failure modes into one item; if any of the others surface in real generations they get their own item.
  - **DP-3 strictness → Option B (loose: match on role_title + company only).** A strict 4-field match (role + company + start_date + end_date) lets the model squeak a near-duplicate through by emitting "2022 to 2024" and "2022 to Present" for the same role — exactly the failure mode dedup needs to catch. Loose match also forces the model to think before emitting two entries at the same company with different titles, which is legitimate (promotions, lateral moves) and the right action there is to rename or merge. Option C's "near-duplicate advisory" (same company + different titles + same dates) declined — over-engineered for a hypothetical not yet seen.

  Cross-domain advocate framing added in the same commit at user request: new §0.2 point 6 **"No application is too far a stretch"**, illustrated with a doctor-applying-to-construction worked example. Sits next to the existing seniority-mismatch guidance (point 4) since cross-domain pivots are the next severity tier up: not just below the experience bar, but in a different field. Reframes the model's job as "find the transferable spine of the master CV and build the application around it", with bridging language for trade-specific gaps and zero apologetic framing for the pivot itself in the prose. `fit_assessment` carries the honest "this is a stretch" signal as metadata (descriptive, not deterring per §0.1).

  What was *not* changed: `lib/llm/output-schema.ts` (no Zod uniqueness `superRefine` added — schema is the safety net per the [7]/[8] strictness audits, and a runtime reject would drop the whole paid generation rather than letting the model self-correct at emission). DOCX renderer, LLM provider layer, §0 advocate posture surrounding the new point 6, §7.0 stop-and-reconsider gate, §7.3 trigger list — all untouched. Three edits in one commit; rollback is a single `git revert`.

  Test plan: re-submit the failing master CV + JD against a new generation, query `cv_content.professional_experience` and confirm no two entries share `(role_title.trim().toLowerCase(), company.trim().toLowerCase())`. Spot-check that legitimate same-company promotions (different titles) are preserved as separate roles when the master CV has them. Re-audit if the failure shape returns despite the rule + self-check.

[8] DeepSeek per-iteration timeout 45s → 60s for tail-latency absorption (2026-05-08). Real failure: `llm_failed` with message `DeepSeek chat completion exceeded 45000ms (iteration 3)`. Looking at the four-row pattern in `request_logs`:

  | Time (UTC) | Duration | Outcome |
  |---|---|---|
  | 03:17 | 55s | success |
  | 05:13 | 50s | success |
  | 06:31 | 53s | success |
  | 07:19 | 58s | failed — iter 3 > 45s |

  Successful neighbours sat at 50-55s total wall-clock, meaning typical search iterations finished in ~5-15s. The failure was a single tail-latency spike on one iteration (iters 0-2 took ~13s combined; iter 3 alone consumed the full 45s before the Promise.race killed it). Almost certainly DeepSeek API queue jitter — not a runaway model, not a structural over-budget situation.

  Three DPs surfaced before edit:
  - **DP-1 absorption strategy → Option A (raise timeout 45s → 60s).** Single-line tuning, addresses observed failure with margin, no architectural change. Option B (90s) declined as overshoot; Option C (retry-once-on-timeout in same iter) declined as premature complexity — if a second failure shape lands (e.g. all iterations consistently slow rather than one tail spike), Option C becomes the right answer with data to size it.
  - **DP-2 collateral changes → Option A (just the timeout, nothing else).** `MAX_ITERATIONS=6`, `MAX_WEB_SEARCH=5`, `TOTAL_LOOP_BUDGET_MS=270_000` untouched. The system-prompt §3 Phase 2 + Phase 4 search budgets are quality-bearing and shouldn't be cut to absorb infra jitter; the 270s wall clock still catches a string of genuinely-slow iterations stacking up. Worst case on paper rises 5×45+60=285s → 5×60+60=360s, but the 270s total wall clock is the real ceiling and is unchanged.
  - **DP-3 documentation → Option A (update inline comments + Decision Log).** Third tuning pass on these constants; the next session needs the trail to know whether to keep tuning or restructure (the Option C retry-once is the next move if this fails to hold).

  What was *not* changed: `MAX_WEB_SEARCH`, `MAX_ITERATIONS`, `TOTAL_LOOP_BUDGET_MS`, `FINAL_ITERATION_TIMEOUT_MS`, the Promise.race architecture, the SDK `{ timeout }` belt-and-braces, the abort controller. Just the search-iter constant + comment block.

  Test path: next real generation exercises this. If it succeeds, fix held; if it fails with `iter N > 60_000ms`, retry-once-on-timeout (Option C above) becomes the next move. Rollback is a single `git revert`.

[8] DeepSeek retry-once-on-timeout (2026-05-08, follow-up). Real failure later same day: two concurrent generations both timed out at `iteration 0 > 60_000ms`. Different shape from the morning's iter-3 fix:

  - Iter 0 = first call to DeepSeek, messages array is just `[system, user]`, no accumulated context. Output expected ~50-100 tokens (a `web_search` tool call). Healthy iter 0 on Flash should finish in 3-8s. Consistent >60s is base-latency degradation, not tail-latency jitter.
  - Diagnostic query: `select count(*), avg(web_search_count) from token_usage where created_at > now() - interval '6 hours'` returned 4 successful generations averaging 4.5 web_searches in the same 6-hour window. So DeepSeek wasn't down — the API is intermittently slow on first calls, with most generations completing normally.

  Bumping the timeout further would mask the symptom without fixing it. The right fix is the Option C deferred yesterday — retry-once-on-timeout per iteration. Implementation in `lib/deepseek/provider.ts`:

  - Iter loop's race-against-timeout block extracted into `attemptOnce()` inner function (creates fresh `AbortController` + `Promise.race` per call).
  - On the first timeout in any iter, log a warn line and call `attemptOnce()` again.
  - On the second timeout, throw a distinct `ApiError("llm_failed")` with `(iteration N retry failed)` in the message so the failure mode is recognisable in `request_logs` vs a single-shot timeout.
  - Non-timeout errors (HTTP 4xx/5xx, network failures) throw immediately on the first attempt as before — only timeouts are retryable.
  - `isTimeoutApiError(err)` discriminates by regex on the message text, narrow enough that no other ApiError shape matches.

  Worst-case wall-clock impact: today's worst case (5 search × 60s + 1 final × 60s = 360s) is already capped by `TOTAL_LOOP_BUDGET_MS=270s`. With retry-once it becomes 5 × 120s + 60s = 660s on paper, still capped at 270s by the wall-clock guard. The total budget stays the real ceiling; retry-once just gives one slow call a second swing inside that ceiling instead of dying on the first miss.

  Next-move ladder if this isn't enough: provider-layer Anthropic failover (Option D from yesterday's DPs — on persistent DeepSeek failure, automatically retry on Anthropic), or temporary `LLM_PROVIDER=anthropic` env-var flip (zero code change, ~$0.29/gen vs ~$0.05/gen). Both deferred until we see whether retry-once holds.

  Rollback: single `git revert`.

[8] Dual-prompt arrangement — provider-keyed system prompt selection (2026-05-12). The Sonnet-tuned prompt was running on both Anthropic and DeepSeek paths since the original 2026-05-02 migration. After a full audit against the documented [18] failure-mode history (13 DPs in the 2026-05-12 audit, all picked + applied across commits 1-5), the prompt fell into two distinct shapes — one for Sonnet's prose-rich tolerance, one for Flash's directive-density preference. Split into two files behind a runtime selector.

  **Files:**
  - `prompts/system-prompt-claude.md` (renamed from `system-prompt-v2.md`) — the Sonnet-tuned prompt, ~16K tokens. Battle-tested across two months of [18] failure-mode patches. Loaded on the Anthropic path.
  - `prompts/system-prompt-deepseek-flash.md` — NEW, ~9K tokens, fresh design for Flash. Not a port. Loaded on the DeepSeek path.

  **Selection mechanism:** both files load at module scope in `inngest/functions/generate-application.ts` (~100KB combined memory cost, negligible). New `pickSystemPrompt()` reads `process.env.LLM_PROVIDER` per invocation: `"deepseek"` → Flash prompt, else Claude prompt. Mirrors the existing `pickProvider()` switch in `lib/llm/index.ts`. Cold-start scoped — a Vercel env-var flip takes effect on the next Inngest cold boot, no redeploy.

  **Flash prompt design choices** (10 internal DPs decided in one round before any code, all picked + locked):

  - **F-1 layout → C (hybrid).** Tight Mission first (advocate posture is the load-bearing rule across all [18] failures), then Constants (§0), then Schema (§2, early), then Inputs / Process / Rules / Self-check. Flash benefits from schema-first framing per the Lightrains + codersera community guidance ("define output format in JSON/tables"). Claude's Mission → Inputs → Rules → Process → Schema order preserved on the Claude path.
  - **F-2 self-check → B (12-15 items).** Trimmed 37 → 14 high-impact items. Schema-shape items dropped (Zod preprocesses cover them per the [7] strictness audits). Behavioural items (em-dash ban, advocate posture, hallucination check, voice rules, numeric fidelity, UK pairing, cultural-ack tests) kept. Order: highest-impact first (em-dash → status decision → numeric → JD salary → hallucination → bullet caps → grad page count → archetype dedup → null discipline → 5 paragraphs → voice → region → cultural ack), descending.
  - **F-3 banned phrases → B (research-backed condensation).** Em / en dash bans kept verbatim — DeepSeek V4 research (deepseekai.guide, deepseeksguides.com) confirms Flash's default voice is "flat / stiff / repetitive without explicit priming", so em-dash detection by recruiters compounds. Phrase / verb / adjective / structural bans condensed to 8-10 examples per class grouped by purpose. Lost ~50 specific phrase entries from the Claude prompt's §2.2, kept the high-signal categories.
  - **F-4 strict-mode tool → C (deferred test commit).** DeepSeek's beta endpoint (`https://api.deepseek.com/beta`) supports `strict: true` on function tools — server-side JSON-Schema validation before the response returns. Would structurally prevent the empty-array-padding class the five [7] strictness audits have patched reactively. Defer to a separate preview-deployment test commit; ship the Flash prompt with the current Zod safety net first, evaluate strict mode on a known-failing JD before flipping prod.
  - **F-5 thinking mode → A (kept disabled).** Re-enabling at low effort technically fits under Vercel Hobby 300s ceiling (worst case 5 search iters × +20s reasoning + 50s base = 150-200s, inside the 270s `TOTAL_LOOP_BUDGET_MS`). AUTO / high effort risks blowing the 60s `FINAL_ITERATION_TIMEOUT_MS` on the submit emission. Decision deferred to post-prompt-ship quality data; current `thinking: { type: "disabled" }` + `temperature: 0.4` stay.
  - **F-6 heading style → B (strict hierarchy).** `## section / ### subsection`, `**bold**` reserved for rule statements only — no mid-paragraph bolding for emphasis. Flash parses predictable markdown structure more reliably than Sonnet handles mixed-emphasis prose.
  - **F-7 worked examples → B (5-7 highest-impact).** Kept §5.7 soft-skill rubric examples (Mid / Senior / Graduate HIGH), §5.6 contact-detail null table, §5.8 + §5.9 widow tighten / extend examples, §7.4 honesty ladder examples, plus a new §6.3 cover-letter voice example (bad flat AI prose + good target prose, 6 reasons it works). The §6.3 example is the single most load-bearing addition for "fun sociable human" cover-letter output per the user's explicit emphasis.
  - **F-8 cross-refs → A (§-notation).** Same `§4.4` / `§0 C2` style as Claude prompt. Compact, Flash trained on Markdown-style anchors. Saves tokens.
  - **F-9 Constants block → B (compressed table).** Same C1-C18 IDs as Claude prompt (cross-reference discipline matches both prompts), but compressed from prose-rich table to 18 single-line rows. Same canonical values; same authoritative status downstream.
  - **F-10 anti-AI-prose section → B (single source).** Claude prompt's §2.2 + §5.3 + §5.4 + §2.5 (four sections all about avoiding AI-sounding prose) collapsed into one §7 section. User meta-rule: "ensure there are single instances of each thing that covers their respective scopes completely." Applied throughout — advocate posture lives only at §1, bail-out gate only at §9.1, null-emit only at §5.6, banned phrases only at §7.2.

  **Voice priming for cover letters (the user-emphasised piece):** F-3 research surfaced that Flash's default voice is "flat / stiff / generic" without explicit voice instruction. Two prompt levers applied:
  - §6.1 Voice rules: 5 concrete directives covering "concrete details over hype", "one conversational beat per paragraph if anchored to research", "vary sentence rhythm deliberately", "curiosity beats enthusiasm", and the "Could anyone write this" test.
  - §6.3 worked example: bad flat AI prose vs good target prose for a Mid Data Engineer Paragraph 2. The good example uses specific project names, specific numbers, varied sentence rhythm, and one honest "the hard part was X" beat — the things that make the prose sound human.

  Temperature: kept at `0.4` (locked in `lib/deepseek/provider.ts`). DeepSeek's own creative-writing guidance recommends 1.5 for prose flair, but at 1.5 we lose the §5.8 numeric-fidelity discipline. Per the user's standing "no hallucinations" priority, 0.4 holds. The voice priming in §6.1 + §6.3 substitutes for the temperature lever.

  **Out-of-scope follow-ups (flagged in commit 7's message):** DP F-4 strict-mode tool test, DP F-5 thinking re-enable, the master-CV upload-side validation pivot from the original DP-12, the pre-cost-cap mis-keying fixed inline during commit 7 (was already keyed to Pro, corrected to Flash).

  Rollback: single `git revert` of commit 7 restores the single-prompt loader. The two prompt files stay readable in the tree; reverting just the loader code restores the Claude prompt for both providers.

[18] Region detection on the fly + universal-floor §8 rewrite (2026-05-08). User-reported: an Australian-visa job came through and the system applied NZ rules (the runtime hardcoded `region: "NZ"` at insert and the prompt's §8 was a NZ-only block). User asked for "research how to cleanly implement that it searches for best practices for that country research on the fly. No region boundation."

  Five DPs decided before edits:
  - **DP-1 country source → Option A (LLM detects from JD signals).** Most aligned with "no boundation" — no closed-list dropdown, no required user field. Most JDs state location, currency, work-rights phrasing, or local legislation cues in the first 50 words; LLM detection is reliable for the 95% case. Optional manual-override field deferred until a real failure shape lands ("JD said Sydney but candidate is moving to Brisbane").
  - **DP-2 rules supply → Option C (universal floor + live research, condition-gated).** A new §8.1 Universal Floor covers the genuinely cross-region rules (no photo/age/etc., anti-discrimination defaults, "always include Referees", §2.2 punctuation bans). Per-country conventions (salutation, sign-off, spelling variant, work-rights phrasing, cultural-acknowledgement protocol) live in §8.2-8.6 with explicit conventions for the major Anglo markets (NZ, AU, UK, US, IE, CA, ZA) since the model has strong working knowledge there. For unfamiliar markets, the model can spend an *optional* `web_search` in Phase 1.5 to look up the local conventions. Avoids both extremes: no maintained closed-list preset library, no mandatory live search burning budget for known markets.
  - **DP-3 search budget → Option D (rebalance, keep MAX_WEB_SEARCH=5).** Original recommendation was Option A (raise cap 5→6); user pushed back with "can we not make room any other way?" — yes. The 5-call cap is now shared across three phases instead of two: Phase 1.5 (0 mandatory + 0-1 optional, only for unfamiliar markets), Phase 2 (2 mandatory + 0-1 optional reformulation/toolkit), Phase 4 (2 mandatory + 0-1 optional tiebreaker). The model spends *at most one* extra search across the three phase optionals combined. Familiar Anglo markets get 0 cost (Phase 1.5 skipped), so the typical case is unchanged at 4 calls. Unfamiliar markets pay one optional. Pure prompt-side rebalance, no provider/code change.
  - **DP-4 date timezone → Option C (UTC).** The cover-letter date carries no location semantics — it's "the day the letter was written", not "the date in the employer's timezone". UTC is the simplest universal answer and ages well as the system handles non-NZ generations. Was Pacific/Auckland.
  - **DP-5 schema/admin → no DB migration; quality-scan check deleted; admin UI unchanged.** `applications.region` column stays as legacy/unused at the LLM boundary (still selected by API row reads for backwards-compat with old rows; the LLM pipeline no longer reads it). New rows still default to 'NZ' at the schema level so old admin queries don't break. The `region === "NZ"` Kia ora warning in `lib/quality/scan.ts` deleted entirely — the model is now authoritative on salutation per its researched country.

  Edits in one commit:
  - **`prompts/system-prompt-v2.md`**: added §3 Phase 1.5 (target country detection + conditional conventions search); rephrased §3 Phase 2 / Phase 4 budgets to share the 5-call cap across three phases via "at most one extra optional" language; replaced Phase 4's NZ-specific salary query template with `[target_country]` placeholder + per-country recruiter ecosystem notes; full §8 rewrite from "Region Rules: NZ (v1)" to "Region Detection and Local Conventions" with subsections 8.1 Universal Floor, 8.2 Cover Letter Conventions Per Country (NZ/AU/UK/US/IE/CA/ZA explicit; "other markets" handled by Phase 1.5 search + working knowledge fallback), 8.3 Spelling Variant, 8.4 Punctuation, 8.5 Work Rights and Availability Phrasing, 8.6 Cultural Acknowledgement Specificity (universal three-test rule). Updated §10 self-check items 16 (Te Tiriti → broader cultural-acknowledgement), 23 (search budget reflects shared-across-phases shape), 30 (recruiter agencies extended with AU/UK/US examples), and added new item 33 (target_country / spelling / salutation cross-check).
  - **`lib/llm/output-schema.ts`**: added `research_summary.target_country` as `nullableMaxString(80)` (mirrors the company_reference_* pattern from the 2026-05-03 audit — model omitting or emitting null on edge cases coerces to "" rather than failing the whole generation).
  - **`lib/llm/build-user-message.ts`**: dropped the hardcoded `<region>NZ</region>` tag and the `region` parameter on `BuildUserMessageOptions`. Spec: §1 of the system prompt no longer references a runtime region tag.
  - **`inngest/steps/load-context.ts`**: dropped `region` from the `GenerationContext` type and from the SQL select. The DB column stays (legacy for admin/retry paths); the LLM pipeline no longer reads it.
  - **`inngest/functions/generate-application.ts`**: dropped `region: ctx.region` from the `buildUserMessage` call; updated `runQualityScan(dated, "NZ")` to `runQualityScan(dated)`.
  - **`lib/quality/scan.ts`**: dropped the `region` parameter on `runQualityScan` and the `missing_kia_ora_salutation` warning (and its `QualityWarningKind` union member).
  - **`inngest/steps/inject-date.ts`**: switched timezone constant from `Pacific/Auckland` to `UTC`. Renamed `nzTodayString` to `todayString`; kept `nzTodayString` as a backwards-compat alias until call sites are updated.

  What was *not* changed: `applications.region` DB column / migration, `app/api/applications/route.ts` insert which still writes `region: "NZ"` (harmless legacy default; the column is no longer read by the pipeline), the retry route which still carries parent.region forward (same reason), admin pages, the Inngest pipeline shape, the LLM provider layer, `MAX_WEB_SEARCH`, `MAX_ITERATIONS`, the cover-letter renderer, the §0 advocate posture, §7.0 stop-and-reconsider gate, §7.3 trigger list. Dropping the unused DB column is a future cleanup once we confirm no admin query references it.

  Test path: one preview-deployment generation against an Australian-visa JD (target_country="Australia", no Kia ora, AUD currency, "Available on request" defaults intact); one against a UK JD (target_country="United Kingdom", "Yours sincerely / Yours faithfully" pairing, GBP currency); one against an NZ JD (regression — target_country="New Zealand", Kia ora only on confirmed public-sector with master-CV cultural engagement evidence, NZD currency, Te Tiriti only when all three §8.6 tests pass). Confirm `research_summary.target_country` populates correctly in all three; confirm spelling variant matches §8.3 per country; confirm cover letter date renders in UTC. Pre-existing tsc errors in `lib/deepseek/provider.ts` (openai module resolution + implicit any on line 407) are unrelated to this change and predate it.

  Rollback: single `git revert`. If only the prompt is wrong but the code edits are fine, a follow-up commit to §8 / §3 in isolation is sufficient.

[14] Typography + muted-text legibility bump (2026-05-08, follow-up to 2026-05-03 readability pass). User-reported: "the grey font is still illegible to a person in our team". The May 3 pass had nudged primitives one-by-one (eyebrow 11→12, text-meta 12→12.5, dark `--muted-foreground` 0.50→0.66, dark `--color-text-muted` #9a9aa8→#b6b5c4, light `--color-text-muted` #6c6a60→#5a5851). Each was a half-pixel or 0.16 alpha step, accumulating but never decisively crossing the legibility threshold for one teammate.

  Two coupled levers ship together this round:

  - **Base font scale lifted html 16px → 17px.** Single line in [`@layer base`](app/globals.css). Affects every rem-sized utility (Tailwind `text-sm` / `text-base` / `text-lg`, default body, headings) by +6.25%. One DP recommendation Option A picked over B (18px) and C (per-utility overrides): A is universal, surgical, easy to dial up to B if A still doesn't land for the affected user. The May 3 strategy of nudging individual primitives by half-pixels was the long-way-round version of the same intent — a base-rem bump cascades correctly.
  - **Fixed-px primitives nudged +1px to keep the relative rhythm coherent against the new rem baseline.** `.eyebrow` / `.eyebrow-muted` 12 → 13, `.text-meta` 12.5 → 13.5. Heading classes (`.heading-display` text-4xl, `.heading-section` text-2xl) pick up the html bump automatically since they use Tailwind text-* utilities.
  - **Muted-text contrast lifted past the May 3 nudges.** Dark mode `--muted-foreground` rgba(0.66) → rgba(0.82); dark mode `--color-text-muted` #b6b5c4 → #cfceda; light mode `--color-text-muted` #5a5851 → #3f3d36 (opposite-direction-of-contrast: muted-on-light wants darker, muted-on-dark wants lighter, both for more separation from background). Body text still reads at 1.0 alpha so the visual hierarchy survives — these tokens are now noticeably more readable but still distinct as "secondary".

  What was *not* changed: ambient layers, brand orange, semantic accents (success / warn / danger / info / cyan / rose / innovation), heading text classes, the dark/light surface palette (`--color-dark` / `dark2` / `dark3` / `dark4`), the cover letter and CV docx renderers (the user clarified item 4 was the website UI, not generated documents — the docx font-size profiles in `lib/docx/styles.ts` are untouched).

  Rollback: single `git revert`. If only the html bump regresses some layout (admin tables at narrow viewports are the most likely candidate), the per-primitive +1px and contrast bumps can stand alone.

  Companion commit (047c1f7) shipped the same day: master CV download via new `GET /api/master-cv/download` route + Settings button, plus a fix for `RetryAbandonControls.callRoute` discarding the new application id from the retry response (handler now navigates to `/application/<newId>` instead of bouncing to `/dashboard`).

[14] Audit-pass scale-up across the (app) shell (2026-05-08, follow-up to the html-16→17 rollback). User-reported the html font-size bump from `87d1d73` broke the PagedPreview's pagination — the rendered CV/cover-letter previews showed as "1 long page" instead of paginated A4 frames — and asked for a coordinated audit pass scaling all elements together "by 1 scale, ~20%".

  Root cause of the preview regression: [`components/application/PagedPreview.tsx`](components/application/PagedPreview.tsx) uses `A4_PAGE_HEIGHT_PX = 1123` (a hardcoded pixel constant calculated for 96 DPI / 16px html base) for its page-break math. The +6.25% rem cascade pushed text-rendering offsets past the pagination thresholds in unpredictable ways, producing edge cases where `pageOffsets = [0]` and the frame degraded to natural content height.

  Two coupled changes ship together:

  - **html font-size reverted 17px → 16px (browser default).** Removed entirely from `@layer base` rather than tuned. Restores the PagedPreview's pagination contract.
  - **Manual audit pass across the (app) shell.** Each surface bumped one Tailwind step explicitly so we control which surfaces scale (the (app) shell) and which stay pinned (CV/cover letter previews, which mirror the DOCX and must not drift from their fixed-pixel pagination contract). Files touched:

    | Surface | Bumped |
    |---|---|
    | `app/globals.css` design-system primitives | `.eyebrow` / `.eyebrow-muted` 13px → text-sm (14px); `.text-meta` 13.5px → 14.5px; `.heading-display` text-4xl → text-5xl; `.heading-section` text-2xl → text-3xl; `.surface-card` / `.surface-card-interactive` p-7 → p-8; `.surface-row` py-3 → py-3.5; `.btn-primary` / `.btn-secondary` / `.btn-disabled-shell` text-sm → text-base + px-5 py-2.5 → px-6 py-3; `.btn-ghost` text-sm → text-base + px-3 py-1.5 → px-4 py-2; `.btn-icon` size-9 → size-10; `.btn-link-orange` text-sm → text-base; `.status-pill` text-[10px] → text-[11px] + px-2 → px-2.5 |
    | `app/(app)/layout.tsx` (topbar) | h-[60px] → h-[68px]; px-6 → px-7; wordmark text-2xl → text-3xl; corner badge text-[10px] → text-xs; main py-12 → py-14; max-w-[720px] → max-w-[760px] |
    | `components/app/TopbarNav.tsx` | New-application icon size 14 → 16; History link text-sm → text-base + px-3 py-1.5 → px-4 py-2; Settings icon size 16 → 18 + size-9 → size-10 |
    | `components/app/AdminNav.tsx` | text-sm → text-base + px-3 py-1.5 → px-4 py-2 + gap-1.5 → gap-2 |
    | `app/(app)/dashboard/page.tsx` | mt-3/mt-2 → mt-4; copy text-sm → text-base; section header gaps mb-4 → mb-5; chain list space-y-2 → space-y-2.5 |
    | `app/(app)/history/page.tsx` | header mt-3 → mt-4; copy text-sm → text-base + mt-2 → mt-3 |
    | `app/(app)/upload/page.tsx` | text-[11px]/text-4xl/text-sm → eyebrow + heading-display + text-base; current-on-file pill text-[11px]/text-sm/text-xs → text-xs/text-base/text-sm + p-5 → p-6; bespoke section → surface-card + heading-section |
    | `app/(app)/application/new/page.tsx` | mt-3 → mt-4; copy text-sm → text-base |
    | `components/application/NewApplicationForm.tsx` | strength tag text-[11px] → text-xs; textarea p-5 → p-6 + text-sm → text-base + mt-3 → mt-4; strength bar h-1 → h-1.5 + mt-3 → mt-4; strength caption text-xs → text-sm + min-h-[1.25rem] → min-h-[1.5rem]; spinner h-3.5 w-3.5 → h-4 w-4; debounced text text-xs → text-sm |
    | `app/(app)/application/[id]/page.tsx` | back-link text-xs → text-sm; h1 text-lg → text-xl + mt-2 → mt-3; status pill rolled into `.status-pill`; retry-of text text-xs → text-sm; insufficient_input + error sections text-[10px]/text-sm → text-xs/text-base + p-6/p-7 → p-7/p-8; abandoned text-sm → text-base + p-6 → p-7; Fit pills text-[11px] → text-xs + px-3 → px-3.5 + gap-2 → gap-2.5; reasoning text-sm → text-base; warnings list text-sm → text-base + space-y-1.5 → space-y-2 + dot size-1.5 → mt-1.5; What-we-did checklist text-sm → text-base + icon 16 → 18 + space-y-2.5 → space-y-3; sign-off serif text-2xl/sm:text-3xl → text-3xl/sm:text-4xl + below text-base/sm:text-lg → text-lg/sm:text-xl + caption text-xs → text-sm; expiry text-[11px] → text-xs |
    | `app/(app)/settings/page.tsx` | dl text-sm → text-base + space-y-2 → space-y-2.5 + mt-4 → mt-5; trailing copy text-xs → text-sm; standards list text-sm → text-base + dot h-1.5 w-1.5 → h-2 w-2 + space-y-3 → space-y-3.5; FAQ link text-sm dropped (uses btn-link-orange text-base now); session/danger-zone same |
    | `app/(app)/admin/layout.tsx` | space-y-6 → space-y-7; pb-4 → pb-5; gap-4 → gap-5; "Admin" label text-[10px] → text-xs + tracking 0.12 → 0.14; back link text-xs → text-sm |
    | `app/(app)/admin/usage/page.tsx` | h1 text-2xl → text-3xl; subtitle text-sm → text-base; section padding p-6 → p-7; status nav text-xs → text-sm + px-3 py-1 → px-4 py-1.5 + gap-1.5 → gap-2; table text-sm → text-base + thead text-xs → text-sm; row body text-xs → text-sm + py-3 → py-3.5; pills text-[10px] → text-[11px] + px-2 → px-2.5; Stat helper text-[10px]/text-2xl/p-4 → text-xs/text-3xl/p-5; ProviderSpend text-xs/text-sm/text-[10px] → text-sm/text-base/text-xs |
    | `app/(app)/admin/logs/page.tsx` | h1 text-2xl → text-3xl + subtitle text-sm → text-base + space-y-6 → space-y-7; row summary text-xs → text-sm + px-4 py-2.5 → px-5 py-3; pills text-[10px] → text-[11px] + px-2 → px-2.5; details body text-xs → text-sm + px-4 py-3 → px-5 py-4; gap-3 → gap-4 |
    | `app/(app)/admin/telemetry/page.tsx` | h1 text-2xl → text-3xl + subtitle text-sm → text-base + space-y-8 → space-y-9; section panels p-6 → p-7 + h2 text-[10px] → text-xs + tracking 0.12 → 0.14; table text-sm → text-base + thead text-xs → text-sm; all `text-xs` → `text-sm` and all `text-[10px]` semibold pills → `text-[11px]`; Stat helper text-[10px]/text-2xl/p-4 → text-xs/text-3xl/p-5 |
    | `app/(app)/admin/users/page.tsx` | h1 text-2xl → text-3xl + subtitle text-sm → text-base + space-y-8 → space-y-9; table text-sm → text-base + thead text-xs → text-sm; row text-xs → text-sm + py-3 → py-3.5; user pills text-[10px] → text-[11px] + px-2 → px-2.5; Recent deletions panel p-6/text-[10px]/text-xs → p-7/text-xs/text-sm; Stat helper p-4/text-[10px]/text-2xl → p-5/text-xs/text-3xl |
    | `components/app/ChainCard.tsx` | row gap-4 px-4 py-3 → gap-4 px-5 py-4; title text-sm → text-base; date text-xs → text-sm + mt-0.5 → mt-1; status pill text-[10px] → text-[11px] + px-2 → px-2.5; download spacer h-8 w-8 → h-9 w-9; details summary text-xs → text-sm + px-4 py-2 → px-5 py-2.5; per-attempt list text-xs → text-sm + px-4 pb-3 → px-5 pb-3.5 + px-2 py-1.5 → px-2.5 py-2 |

  Excluded on purpose: `components/application/CvPreview.tsx`, `components/application/CoverLetterPreview.tsx`, `components/application/PagedPreview.tsx` (the preview must mirror the DOCX dimensions and pagination — bumping it would drift from the docx contract). DOCX renderer (`lib/docx/*`). Auth pages ((auth)/login). Public FAQ. Generated documents.

  Muted-foreground contrast lifts from the rolled-back commit kept (colour-only, don't affect layout): dark `--muted-foreground` rgba(0.82), dark `--color-text-muted` `#cfceda`, light `--color-text-muted` `#3f3d36`.

  Test path: every (app) page rendered side-by-side with previous deploy. Visual regression check on admin tables at narrow viewports (768px). Confirmation that PagedPreview pagination produces correct page count + controls visibility for both 1-page cover letter and multi-page CV.

  Rollback: single `git revert` of the audit commit reverts everything atomically. If only one surface is wrong, the per-file edits are clean enough to walk back individually.

[14] Audit pass 2 — second scale-up notch (2026-05-08, follow-up to the same-day audit pass `0f9d2d2`). User-reported via screenshot of `/dashboard`: even after the first audit pass, grey/secondary text (chain row dates, body subtitle, status pills) still reads as too small for one teammate. User asked to "increase size for everything by 1 notch so the grey text is automatically bigger and clearer". DPs A/A/A: continue the manual primitive-by-primitive approach (not a second html bump — that's the failure mode that necessitated the first audit pass), scope to the entire (app) shell in lockstep (not piecemeal), bump headings up too (consistent "everything one notch up" matches the user's literal ask).

  Bumps applied as a single pass on top of `0f9d2d2`:

  | Surface | Bumped |
  |---|---|
  | `app/globals.css` design-system primitives | `.eyebrow` / `.eyebrow-muted` text-sm → text-base; `.text-meta` text-[14.5px] → text-base; `.heading-display` text-5xl → text-6xl; `.heading-section` text-3xl → text-4xl; `.surface-row` px-5 py-3.5 → px-6 py-4; `.btn-primary` / `.btn-secondary` / `.btn-disabled-shell` text-base → text-lg + px-6 py-3 → px-7 py-3.5; `.btn-ghost` text-base → text-lg + px-4 py-2 → px-5 py-2.5; `.btn-icon` size-10 → size-11; `.btn-link-orange` text-base → text-lg; `.status-pill` text-[11px] → text-xs + px-2.5 → px-3 |
  | `app/(app)/layout.tsx` (topbar) | h-[68px] → h-[72px]; px-7 → px-8; wordmark text-3xl → text-4xl; corner badge text-xs → text-sm; main py-14 → py-16; max-w-[760px] → max-w-[800px] |
  | `components/app/TopbarNav.tsx` | New-app icon size 16 → 18; History link text-base → text-lg + px-4 py-2 → px-5 py-2.5; Settings icon size 18 → 20 + size-10 → size-11 |
  | `components/app/AdminNav.tsx` | text-base → text-lg + px-4 py-2 → px-5 py-2.5 |
  | `components/app/ChainCard.tsx` | row gap-4 px-5 py-4 → gap-5 px-6 py-5; title text-base → text-lg; date text-sm → text-base + mt-1 → mt-1.5; status pill bumps via class; download spacer h-9 w-9 → h-10 w-10; details summary text-sm → text-base + px-5 py-2.5 → px-6 py-3; per-attempt list text-sm → text-base + px-5 pb-3.5 → px-6 pb-4 |
  | `app/(app)/dashboard/page.tsx` | mt-4 → mt-5; subtitle text-base → text-lg; section header gaps mb-5 → mb-6; chain list space-y-2.5 → space-y-3 |
  | `app/(app)/history/page.tsx` | header mt-4 → mt-5; copy text-base → text-lg + mt-3 → mt-4 |
  | `app/(app)/upload/page.tsx` | mt-4 → mt-5; copy text-base → text-lg; current-on-file pill text-xs/text-base/text-sm → text-sm/text-lg/text-base + p-6 → p-7; section mt-6 → mt-7 + ProTip mt-7 → mt-8 |
  | `app/(app)/application/new/page.tsx` | mt-4 → mt-5; copy text-base → text-lg |
  | `components/application/NewApplicationForm.tsx` | space-y-6 → space-y-7; strength tag text-xs → text-sm; textarea p-6 → p-7 + text-base → text-lg + mt-4 → mt-5; strength bar h-1.5 → h-2 + mt-4 → mt-5; strength caption text-sm → text-base + min-h-[1.5rem] → min-h-[1.75rem]; debounced text text-sm → text-base; error text-base → text-lg |
  | `app/(app)/application/[id]/page.tsx` | back-link text-sm → text-base; h1 text-xl → text-2xl + mt-3 → mt-4; retry-of text-sm → text-base; insufficient_input + error sections text-xs/text-base → text-sm/text-lg + p-7/p-8 → p-8/p-9 + icon 14/26 → 16/30; abandoned text-base → text-lg + p-7 → p-8; Fit pills text-xs → text-sm + px-3.5 → px-4 + gap-2.5 → gap-3; reasoning text-base → text-lg; warnings list text-base → text-lg + space-y-2 → space-y-2.5 + dot mt-1.5 → mt-2; What-we-did checklist text-base → text-lg + icon 18 → 20 + space-y-3 → space-y-3.5; sign-off serif text-3xl/sm:text-4xl → text-4xl/sm:text-5xl + below text-lg/sm:text-xl → text-xl/sm:text-2xl + caption text-sm → text-base; expiry text-xs → text-sm |
  | `app/(app)/settings/page.tsx` | dl text-base → text-lg + space-y-2.5 → space-y-3 + mt-5 → mt-6; trailing copy text-sm → text-base; standards list text-base → text-lg + dot h-2 w-2 → h-2.5 w-2.5 + space-y-3.5 → space-y-4; danger-zone heading text-xs → text-sm |
  | `app/(app)/admin/layout.tsx` | space-y-7 → space-y-8; pb-5 → pb-6; gap-5 → gap-6; "Admin" label text-xs → text-sm + tracking 0.14 → 0.16; back link text-sm → text-base |
  | `app/(app)/admin/usage/page.tsx` | h1 text-3xl → text-4xl; subtitle text-base → text-lg; section padding p-7 → p-8; status nav text-sm → text-base + px-4 py-1.5 → px-5 py-2; table text-base → text-lg + thead text-sm → text-base; row body text-sm → text-base + py-3.5 → py-4; pills text-[11px] → text-xs + px-2.5 → px-3; Stat helper text-xs/text-3xl/p-5 → text-sm/text-4xl/p-6; ProviderSpend text-sm/text-base/text-xs → text-base/text-lg/text-sm |
  | `app/(app)/admin/logs/page.tsx` | h1 text-3xl → text-4xl + subtitle text-base → text-lg + space-y-7 → space-y-8; row summary text-sm → text-base + px-5 py-3 → px-6 py-3.5 + gap-3 → gap-4; pills text-[11px] → text-xs + px-2.5 → px-3; details body text-sm → text-base + px-5 py-4 → px-6 py-5; footer gap-3 → gap-4 |
  | `app/(app)/admin/telemetry/page.tsx` | h1 text-3xl → text-4xl + subtitle text-base → text-lg + space-y-9 → space-y-10; section panels p-7 → p-8 + h2 text-xs → text-sm + tracking 0.14 → 0.16; table text-base → text-lg + thead text-sm → text-base; all `text-sm` cells → `text-base`; pills text-[11px]/px-2 → text-xs/px-2.5; bars h-1.5 → h-2; Stat helper p-5/text-xs/text-3xl → p-6/text-sm/text-4xl |
  | `app/(app)/admin/users/page.tsx` | h1 text-3xl → text-4xl + subtitle text-base → text-lg + space-y-9 → space-y-10; table text-base → text-lg + thead text-sm → text-base; row text-sm → text-base + py-3.5 → py-4; user pills text-[11px] → text-xs + px-2.5 → px-3; Recent deletions panel p-7/text-xs/text-sm → p-8/text-sm/text-base + py-2.5 → py-3; Stat helper p-5/text-xs/text-3xl → p-6/text-sm/text-4xl |

  `surface-card` p-8 stayed put — already roomy at 32px; widening further would push card content noticeably less wide on the 800px (app) max-width without buying back legibility. The padding bump deferred until we see if a third audit pass is needed.

  Excluded for the same reasons as `0f9d2d2`: `components/application/CvPreview.tsx`, `components/application/CoverLetterPreview.tsx`, `components/application/PagedPreview.tsx` (preview must mirror DOCX, fixed-pixel pagination contract). DOCX renderer (`lib/docx/*`). (auth)/login. Public landing / FAQ.

  Test path: dashboard / history / settings / admin pages compared side-by-side with the `0f9d2d2` deploy. Confirmation that PagedPreview pagination still produces correct page count + controls visibility for both 1-page cover letter and multi-page CV (the previews are excluded so this should be unaffected).

  Rollback: single `git revert`. If only one surface is wrong, per-file edits walk back cleanly.

[14] Drop PagedPreview from SuccessView; scrollable CV + click-to-zoom modal + brand band on the CV (2026-05-08, follow-up to audit pass 2). User-reported the previews still felt like "a single long page" and asked: CV scrollable with colored theme, cover letter can stay one page, click-to-zoom into a full-screen scroll. DPs A/B/A/A + clarification (a) "make brand orange more prominent on the CV":

- **CV preview**: PagedPreview wrapper removed. CV now renders directly inside a `max-h-[900px] overflow-y-auto` container in `PreviewPanel`. `overscroll-behavior: contain` on the scroll container keeps wheel events from chaining to the underlying (app) main when the user scrolls past the bottom. The article fills the column width naturally — no A4-width fixed-pixel scaling, no offsetTop walking, no clipping. Reason: the docx download is the canonical page-break artefact; the preview's job is content verification, not docx-page navigation. Pagination was hiding brand colors and forcing the user to click through pages to read content they could just scroll.
- **Cover letter preview**: same shape (PreviewPanel + scrollable container). `CoverLetterPreview`'s own `min-height: 1123px` keeps it reading as a complete A4 letter inside the scroll frame; on most viewports the user sees one full page with no scroll.
- **Click-to-zoom**: new `components/application/PreviewZoomModal.tsx` (~50 lines, native `<dialog>`-style overlay built with `fixed inset-0 z-50` + `role="dialog"` + `aria-modal`). Esc key, close button, and backdrop click all dismiss. `overscroll-behavior: contain` on the modal's scroll container too. New `PreviewPanel` client wrapper (~70 lines) holds zoom state per panel, renders the preview content twice when open (once in the card, once in the modal — both stateless previews so duplication is cheap). Zoom button is a Maximize2 icon next to the download button in each card header, NOT a click anywhere on the preview body (preserves text selection inside the preview for content verification).
- **Brand-colored theme on CV**: `CvPreview` gets a 6px (`h-1.5`) full-width orange band at the top of the paper as a Distil signature. Section heading rules thickened from 1px light-grey → 2px brand-orange/30 (parity with DOCX, more visible). Contact closing rule from 1px light-grey → 2px brand-orange/40 (matches DOCX's 1pt brand-orange contact line). Article wrapped in `overflow-hidden` so the orange band sits cleanly inside the rounded corner. Cover letter intentionally NOT touched — user said "the resume should be scrollable with colored theme" (singular). Cover letter brand signature stays in the DOCX.
- **Header layout**: card header is unchanged in structure — eyebrow on the left, action buttons on the right. Action buttons grew from one (download) to two (zoom + download) in a `flex items-center gap-2` row. Zoom is the secondary visual treatment (orange-bordered ring, dark interior); download stays the primary (filled orange).

What was *not* changed: `PagedPreview.tsx` itself stays in the codebase but is no longer imported by SuccessView. Leaving in case the design pivots back, or for a future print-view path that wants the page-break math. `data-page-section` attributes on CvPreview / CoverLetterPreview stay (no-ops once PagedPreview isn't wrapping them; harmless and cheap to keep). DOCX renderer (`lib/docx/*`), output schema, system prompt, the Inngest pipeline. The audit-pass 2 (app) shell sizing.

Files: NEW `components/application/PreviewZoomModal.tsx`, NEW `components/application/PreviewPanel.tsx`, MODIFIED `components/application/CvPreview.tsx` (top band + thicker orange rules), MODIFIED `app/(app)/application/[id]/page.tsx` (drop PagedPreview import + DownloadIcon import; replace each preview block with `<PreviewPanel>`).

Test path: a real success page side-by-side with the previous deploy. Confirm CV scrolls inside the card; zoom button opens a full-viewport overlay; Esc / close button / backdrop click all dismiss; cover letter renders as one page in both card and modal; download icon still routes to `/api/applications/[id]/download/[kind]`; brand orange stripe + thicker rules visible on the CV; cover letter unchanged.

Rollback: single `git revert`. PagedPreview is still importable so a partial rollback (drop the new components, swap the imports back) is also viable.

[14] Affordance pass — landing topbar parity, `.btn-pill` primitive, surface-row admin tools (2026-05-09, follow-up to audit passes 1 + 2). Five user-reported low-affordance surfaces; one commit; one new primitive.

* **Landing topbar (`components/landing/LandingTopbar.tsx`).** Audit pass 2 bumped the (app) shell primitives but left the public landing topbar on its pre-audit shell — `h-[60px]` with audit-pass-2 buttons inside, so right-cluster controls rendered at three different heights (~44px ghost / ~32px theme toggle / ~52px primary CTA spilling past the 60px shell). Lifted to (app) parity: `h-[60px]` → `h-[72px]`, wordmark `text-2xl` → `text-4xl`, Curiosum.ai badge `text-[10px]` → `text-sm`, right-cluster `gap-2` → `gap-2.5`, ArrowRightIcon `size={14}` → `size={16}`. Sign in (btn-ghost) + ThemeToggle + Get started (btn-primary) now share the same vertical rhythm. DP-1 picked Option A; rejected B (one-off classes — drift waiting to happen) and C (icon-only Sign in — regresses the most important secondary action on a public surface).

* **ThemeToggle (`components/app/ThemeToggle.tsx`).** Local `btn-icon size-8` override forced the toggle to 32px while `.btn-icon` is now `size-11` (44px) post-audit. The override was actively fighting the audit pass on every (app) page that hosts the toggle, not just on landing. Dropped the `size-8`; `SunIcon` / `MoonIcon` `size={15}` → `size={20}` to match `SettingsIcon` in `TopbarNav.tsx`. Net: theme toggle is now the same dimension as the Settings icon button on every page.

* **`.btn-pill` primitive (new, in `app/globals.css` under `@layer components`).** Defined as `inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-base text-muted-foreground transition-colors hover:border-orange/40 hover:bg-dark3 hover:text-text`. Reads as a small navigable chip — heavier than a `text-meta` link, lighter than `btn-ghost`, shares the surface-row hover treatment so it sits in the same visual family as the (app) shell's row patterns. DPs 2/3/4 all picked Option C: unify "View all" and both back-links under a single new primitive rather than reach for `btn-ghost` (too heavy at text-lg) or `btn-link-orange` (commits to the same affordance class that DP-5 was moving away from).

* **`View all →` on `/dashboard` Recent panel (`app/(app)/dashboard/page.tsx`).** Was `text-meta hover:text-text` — read as a date stamp. Now `btn-pill` with explicit `<ArrowRightIcon size={14}>`.

* **`← Back to Dashboard` on `/application/[id]` (`app/(app)/application/[id]/page.tsx`) and `← Back to Settings` on `/admin/*` (`app/(app)/admin/layout.tsx`).** Both were `text-base text-muted-foreground hover:text-text` — weak affordance. Now `btn-pill` with explicit `<ArrowLeftIcon size={14}>` from lucide. Inline arrow character (`←`) replaced with the icon component for consistency with other lucide-backed nav icons.

* **Admin tools list on `/settings` (`app/(app)/settings/page.tsx`).** Was three `<li>` with `btn-link-orange` (text-lg orange copies, no row affordance) inside a `surface-card` wrapper. DP-5 picked Option B with B' refinement: drop the outer `surface-card` wrapper (avoids panel-inside-panel, matches the dashboard's "In progress" / "Recent" framing where the eyebrow + section header alone are enough), replace the link copies with three `surface-row` entries, each with title + sub-description + `<ChevronRightIcon size={18}>`. Same affordance class the user already knows reads as clickable from `/dashboard` chains and `/history`.

What was *not* changed: history / login / FAQ / upload / new application surfaces (no reported affordance issues there); the four lucide arrow inline characters elsewhere in the codebase (kept where they're inside primary buttons, not nav-link affordances); CvPreview / CoverLetterPreview / PreviewPanel / PreviewZoomModal / PagedPreview / DOCX renderer / output schema / system prompt; the Inngest pipeline; the audit-pass-2 (app) shell sizing (this commit fixes the lone surface — landing — that audit pass missed, and adds a primitive on top, rather than touching primitives the audit pass already tuned).

Test path: visual diff on `/`, `/dashboard` (Recent panel), `/application/<id>`, `/admin/*` header band, `/settings` Admin tools list. Confirm landing topbar right-cluster reads as three controls at one rhythm. Confirm `.btn-pill` reads as clickable but doesn't compete with eyebrow headers. Confirm admin tools list reads as a stack of clickable rows.

Rollback: single `git revert`. The new `.btn-pill` primitive is additive — if it doesn't earn its keep at a future audit, the four call sites can revert to bespoke recipes and the primitive can be dropped from globals.css.

[14] Audit pass 3 — mobile responsiveness for the (app) shell + design-system primitives (2026-05-09, follow-up to audit passes 1 + 2). The audit-pass-1/2 commits bumped primitives universally for desktop legibility with no `sm:` breakpoints — mobile (<640px) inherited the bumped scale, producing topbar overflow at 375px (4 controls + text-4xl wordmark wouldn't fit), heading-display text-6xl wrapping awkwardly, and btn-primary text-lg labels overflowing inside flex-wrap rows.

DPs picked: Option A on all three. Approach: mobile-first base + `sm:` bump in the primitives layer, not per-surface overrides. Topbar: shrink shell + drop primary CTA labels below sm:, keep all 4 controls visible. Verification: code-inspection scan over callsites (FAQ, login, admin pages, every (app) page using these primitives), live browser verification deferred to user.

* **Headings.** `.heading-display` text-6xl → `text-4xl sm:text-6xl`. `.heading-section` text-4xl → `text-3xl sm:text-4xl`.
* **Surfaces.** `.surface-card` / `.surface-card-interactive` p-8 → `p-6 sm:p-8`. `.surface-row` `px-6 py-4` → `px-5 py-3.5 sm:px-6 sm:py-4`.
* **Buttons.** `.btn-primary`, `.btn-secondary`, `.btn-disabled-shell` `px-7 py-3.5 text-lg` → `px-5 py-3 text-base sm:px-7 sm:py-3.5 sm:text-lg`. `.btn-ghost` `px-5 py-2.5 text-lg` → `px-3 py-2 text-base sm:px-5 sm:py-2.5 sm:text-lg`. The other primitives (`.btn-icon` size-11, `.btn-link-orange` text-lg, `.btn-pill` text-base, `.eyebrow` / `.eyebrow-muted` / `.text-meta` / `.status-pill`) stay untouched — already mobile-comfortable.
* **(app) topbar (`app/(app)/layout.tsx`).** `h-[72px] px-8` → `h-[60px] px-4 sm:h-[72px] sm:px-8`. Wordmark `text-4xl` → `text-2xl sm:text-4xl`. Right-cluster gap `gap-2.5` → `gap-1.5 sm:gap-2.5`. Main padding `px-6 py-16` → `px-4 py-10 sm:px-6 sm:py-16`.
* **Landing topbar (`components/landing/LandingTopbar.tsx`).** Same shell shape: `h-[60px] px-4 sm:h-[72px] sm:px-6`, wordmark `text-2xl sm:text-4xl`, right-cluster `gap-1.5 sm:gap-2.5`. Three controls (Sign in / ThemeToggle / Get started); the btn-primary primitive change makes "Get started" fit comfortably below sm:.
* **TopbarNav primary CTA (`components/app/TopbarNav.tsx`).** "+ New application" / "Upload CV" labels wrapped in `<span className="hidden sm:inline">`; PlusIcon / UploadIcon stay visible. `aria-label` added to the Link so the icon-only state still announces. Settings button was already icon-only at all viewports — primary CTA now matches that pattern below sm:. History link active-state recipe got the same `text-base sm:text-lg` + `px-3 sm:px-5` mobile-first treatment so the active variant stays in lockstep with `.btn-ghost`.
* **NewApplicationForm textarea (`components/application/NewApplicationForm.tsx`).** `p-7 text-lg` → `p-5 text-base sm:p-7 sm:text-lg`. Submit button picks up the new btn-primary mobile size automatically.

What was *not* changed: ThemeToggle (already btn-icon, fine at 44px in both modes); .btn-icon size-11 (44px, already meets tap-target); .btn-pill (text-base px-4 py-2 ≈ 36px — chip pattern, smaller-than-tap-target is conventional for nav chips); admin tables (already overflow-x-auto + hidden sm:table-cell); login page (already mobile-friendly with max-w-md + h-12 + text-sm); preview islands (CV / cover letter / PreviewPanel / PreviewZoomModal — fixed-pixel pagination contract); DOCX renderer; output schema; system prompt; auth layout; PageL preview height max-h-[900px] (acceptable on mobile, scrolls naturally).

Inspection scan completed pre-commit:
- `heading-display` callsites: dashboard, settings, upload, history, application/new, faq — all picked up the breakpoint without one-off overrides.
- `heading-section` callsites: dashboard, upload, faq, WhatYouGetSection — same.
- Login page uses bespoke `text-5xl` Distil heading + `h-12` inputs — not affected.
- Admin pages use bespoke `text-4xl` page headers (not heading-display) — not affected by the primitive change. They already use `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` for stat grids and `overflow-x-auto` for tables.

Test path (deferred to user, post-merge): visual diff at 375px / 768px / 1024px on landing, /dashboard, /history, /upload, /application/new, /application/<id>, /settings, /admin/* (admin login required). Confirm topbar fits without overflow at 375px on both shells; confirm heading-display + btn-primary read as one piece with their desktop variants at the sm: boundary; confirm NewApplicationForm textarea is usable at 375px.

Rollback: single `git revert`. Each primitive change is a clean `text-X sm:text-Y` revert if any one of them needs walking back independently.

[14] Audit pass 4 — calibrate buttons to modern app norms (2026-05-09, follow-up to audit passes 2 + 3). User-reported: "some things are bigger than they need to be especially after some new button additions." Audit-pass-2 had bumped every primitive a notch in response to "one teammate finds grey/secondary text undersized" — but the same commit also lifted muted-foreground rgba(0.66) → rgba(0.82), which is the *actual* a11y fix. The size bumps stacked on top of the contrast lift and overshot modern app norms (Linear, Vercel dashboard, GitHub Primer, Stripe — all 14-16px button text, 32-40px button height; Distil was at 18px text, ~52px height after pass 2).

DPs picked: C / A / A. Targeted roll-back of buttons only (DP-1 C: headings, surface-card padding, eyebrow, text-meta untouched — those are taste, not a11y violations). One size at all viewports (DP-2 A: drop the audit-pass-3 `sm:` breakpoints on buttons since the rolled-back size already works at mobile too — WCAG 2.2 AAA 44×44 tap target is met at 40px height with 24px touch padding). Code-inspection ship + invite calibration with affected teammate (DP-3 A).

* **Buttons.** `.btn-primary` / `.btn-secondary` / `.btn-disabled-shell` `px-5 py-3 text-base sm:px-7 sm:py-3.5 sm:text-lg` → `px-5 py-2.5 text-base` (~40px tall, drops sm: bump). `.btn-ghost` `px-3 py-2 text-base sm:px-5 sm:py-2.5 sm:text-lg` → `px-4 py-2 text-base` (~36px). `.btn-icon` size-11 → size-10 (40px, still meets WCAG 2.2 AAA + cleaner against the smaller buttons). `.btn-link-orange` text-lg → text-base.
* **TopbarNav.** History active-state recipe `px-3 py-2 text-base sm:px-5 sm:py-2.5 sm:text-lg` → `px-4 py-2 text-base font-semibold`. Settings active-state size-11 → size-10; SettingsIcon size 20 → 18 to match the smaller button shell.
* **ThemeToggle.** SunIcon / MoonIcon size 20 → 18 to match the smaller btn-icon. Already on btn-icon class so picks up size-10 automatically.
* **AdminNav.** Tab recipe `px-5 py-2.5 text-lg` → `px-4 py-2 text-base` for both active and inactive states.
* **NewApplicationForm.** Textarea `p-5 text-base sm:p-7 sm:text-lg` → `p-5 text-base` (drop sm: bump — was overscale on desktop too).

What was *not* changed: headings (`.heading-display` text-4xl sm:text-6xl, `.heading-section` text-3xl sm:text-4xl) — heading sizing is taste, doesn't fail any WCAG check, the user's complaint was specifically about buttons. Surface card padding (`.surface-card` p-6 sm:p-8). Eyebrow / text-meta / status-pill / surface-row primitives. ChainCard row title (text-lg — content, not button affordance, retained per DP-1 C scope). Topbar shells (audit pass 3's h-60 sm:h-72 + wordmark text-2xl sm:text-4xl + main padding still appropriate for header surface). The .btn-pill primitive (already at the right size — `text-base px-4 py-2` ≈ 36px). Audit pass 2's muted-foreground contrast lift to rgba(0.82) — kept; that's the actual a11y readability fix the size bumps were proxying for.

WCAG 2.2 + modern-app size table:

| Element | Pre-pass-4 | Post-pass-4 | Modern app | WCAG 2.2 |
|---|---|---|---|---|
| btn-primary height | ~52px | ~40px | 32-40px | AAA 44×44 met (40px height + 5px gutter on each side via flex/gap) |
| btn-icon | 44px | 40px | 32-36px | AAA met |
| btn-ghost | ~44px | ~36px | ~32px | AA 24×24 met |
| body / btn text | 18px | 16px | 14-16px | ≥16 recommended |

Test path (deferred to user, post-merge): visual diff on `/dashboard`, `/settings`, `/admin/*`, `/application/[id]`, `/application/new`, `/upload`, `/`. Confirm buttons read at modern-app weight. Calibration with the original teammate from pass-2 — confirm muted-foreground rgba(0.82) at text-base is readable for them (the size bump was a hedge, the contrast lift was the real fix).

Rollback: single `git revert`. If the affected teammate finds the smaller buttons regressive, the next move is Option B from DP-1 → cherry-pick which buttons stay larger (e.g. CTAs only) rather than re-bumping every primitive.

[14] Login back-to-home + denser MagneticDots without more compute (2026-05-09). Two unrelated tweaks shipped together since they're both small.

* **Login back-to-home (`app/(auth)/login/page.tsx`).** /login had no return path to / for visitors who'd reached it from a campaign / external link. Added a minimal sticky header at the top of the page (h-[60px], no nav cluster) with a single `Distil` wordmark linked to `/`. Mirrors Stripe / Vercel / Linear convention: brand mark at top-left of auth surfaces. Centered "Distil" hero inside the form is unchanged — it's the form's visual anchor; the corner wordmark is the navigational affordance. Two "Distil" tokens on screen is intentional — different roles (one is the page hero, one is the home link).
* **MagneticDots density (`components/app/MagneticDots.tsx`).** User asked for denser pattern without more compute. Doubled density: `CELL_PX` 80 → 56 (~2× more dots in the same area), `DOT_CAP` 400 → 800. Held per-frame cost flat by adding a cull fast-path inside the RAF tick: any dot with `dist > RANGE_CULL_PX (= RANGE_PX + 60)` AND state already within `REST_EPSILON (0.05)` of rest skips the four lerps and the two DOM writes entirely (`continue`s). Cursor approach inside `RANGE_CULL_PX` reactivates the dot automatically. In any given frame the active set is the dots within ~260px of the cursor + dots still settling — typically <15% of the rendered population — so per-frame DOM writes drop from ~400 to ~50-100, well below the pre-change baseline. The cull also moved the distance computation up (cheap to compute, lets the branch short-circuit before state allocation or smoothstep).

What was *not* changed: dot radius (still 1.7px — keeps the "fine grain" character), RANGE_PX, MAX_PUSH_PX, LERP_FACTOR, halo, theme-conditioned profiles, the matchMedia gates (touch / reduced-motion / <1024px viewport still skip the loop entirely). Login form contents, ambient blobs, theme toggle.

Test path: visual diff on / and /login at desktop — denser dot field, same animation feel; FPS should be unchanged or slightly better. /login's top-left wordmark navigates to / on click + keyboard activation.

Rollback: single `git revert`. The cull fast-path is independent of the density bump — if the cull misbehaves, the constants can be reverted alone (CELL_PX → 80, DOT_CAP → 400) without touching the cull branch.

[14] MagneticDots density bump 2 + light-mode visibility (2026-05-09, follow-up). User: "make the magnetic dot pattern even more dense, also for light mode can you make the dots/ui more pink. Its mostly just white." — picked DP-1 A (denser) + a modified DP-2 ("Proceed with orange only. NO PINK. Proceed with B but dont change color at all. Just make it more visible.").

* **Density.** `CELL_PX` 56 → 44 (~1.6× more dots). `DOT_CAP` 800 → 1300. Cull fast-path inside the RAF tick (added in the previous commit) keeps the per-frame active set bounded to dots within `RANGE_CULL_PX` of the cursor + still-settling dots, so the per-frame DOM-write cost stays roughly flat despite ~3.2× the total dot count vs. the pre-bump-1 baseline. Dot radius (1.7px), RANGE_PX, lerp factors, halo size all unchanged — the field reads tighter without becoming a noise pattern.
* **Light-mode visibility (orange only — no pink).** `LIGHT_PROFILE` rest 0.32 → 0.46, active 0.55 → 0.72, haloPeak 0.22 → 0.34. Brand orange (`#e2613b`) at the previous alpha was washing out against the cream canvas (`#f5f3ed`) — the page read as "mostly white". Bumped opacities so the dot grid + cursor halo carry presence. Dark mode `DARK_PROFILE` untouched.
* **Light-mode ambient blob.** New `:root:not(.dark) .ambient-blob-orange` override in `globals.css` swaps the radial gradient from the desaturated `var(--color-orange-glow)` (rgba 226,97,59,0.18) to a stacked-stop gradient peaking at rgba 0.42 inside, falling through 0.18 at 35%, transparent at 70%. Blur tightened 80px → 60px so the corner glow has crisper edges in light mode without losing softness. Dark mode `.ambient-blob-orange` rule (the canonical block above) is unchanged.

What was *not* changed: brand orange itself (`--color-orange` still `#e2613b` in both modes — no pink, no rose, no palette work); ambient-blob-violet; halo blend mode (still `multiply` in light mode — preserves the warmth on the off-white canvas); the cull fast-path; dot radius; dark-mode profile values; canvas tint (`--color-dark` light value still `#f5f3ed`); buttons / surfaces / typography.

Test path: visual diff on / and /login at light mode + dark mode. Confirm denser dots actually paint (Chrome DevTools "Rendering" → enable Paint flashing should show no extra paint thrash from the density bump). Confirm the orange ambient corner is visible in light mode — should read as a clear "warm corner glow" rather than a barely-there wash.

Rollback: single `git revert`. The density change (`CELL_PX` + `DOT_CAP`) is independent of the visibility change (`LIGHT_PROFILE` opacities + ambient-blob override) so either can be walked back alone if one regresses.

[7] Strictness audit 5: cv_content.education orphan-entry preprocess (2026-05-09). Same locked-in pattern from four prior audits (paragraphs 2026-05-01, research_summary nullables 2026-05-03, technical_skills 2026-05-05, professional_experience 2026-05-07): model occasionally pads an array with a trailing orphan entry, schema's strict per-string min(1) on the orphan tanks the whole paid generation. Surfaced today via three back-to-back failures (4e2fd751, faebc6e6, 4f246db7 — including a successful retry-attempt-3 also failing) all with identical zod_issues paths: `cv_content.education[1].institution`, `.location`, `.dates` all empty strings tripping `too_small` (≥1 char).

Fix in `lib/llm/output-schema.ts`: `cv_content.education` wrapped in a `z.preprocess` that filters entries where `qualification` OR `institution` is empty after trim (those are the identifying fields). Outer `.min(1).max(6)` bounds still run after the strip, so the truly-empty case (no education at all) still fails as before. Mirrors the `professional_experience` preprocess shape exactly. Per-item `EducationItemSchema` strict per-string min(1) checks left untouched — once the orphan is stripped, the remaining entries must carry real content.

DP-1 picked Option A (targeted scope, matches discipline). Not Option B (pre-emptive details preprocess — no failure evidence) or C (prompt §10 self-check — schema-only is sufficient when the failure is purely structural padding rather than a semantic gap to teach the model around).

What was *not* changed: `EducationItemSchema` per-string min(1) checks (still strict, only stripped orphan now); `education[].details` (deferred per discipline, no failure evidence on inner detail strings yet); other still-strict fields (`key_projects.bullets`, `key_projects.technologies`, `leadership_and_interests`); the system prompt; any other schema field. The schema's top-of-file comment block gains a 2026-05-09 entry mirroring the prior four.

Test path: re-submit any of the failing JD + master CV combinations. Confirm `validate-output` step in `request_logs` lands as `[ok]` and the generation reaches `success`. If the same JD now produces a complete CV with one valid education entry (the model's intent — second was always orphan padding), the fix held.

Rollback: single `git revert`. Schema change is internal — no migration, no prompt rewrite, no API surface change.

[14] Stage rail polished + cover letter preview brand-mirrored to CV (2026-05-09). Two unrelated polish items shipped together since they're both small.

* **Stage rail (`components/application/ApplicationLiveView.tsx`).** Single rail at `top: 14px` running 12.5%–87.5% across the row was passing through circles 2 and 3. The active circle's `bg-orange-subtle` (8% alpha) wasn't opaque enough to mask the line, so it visibly ran through the centre. Replaced with three independent rail segments — one between each adjacent circle pair — positioned via `calc(${centerPct}% + 18px)` so the 18px gap from circle edges holds at any viewport width regardless of the 30px circle's percent share. Each segment has a base track (border colour) plus an active fill (orange) that animates via `transform: scaleX(0→1)` with `transform-origin: left` when its preceding stage completes. Net: circles now read as connected by individual line segments rather than a single continuous bar passing through them. DP-1 picked Option A; B (raise active-circle bg opacity) rejected because the panel sits on a radial-gradient ambient glow that would never match a static fill cleanly.

* **CoverLetterPreview brand mirror (`components/application/CoverLetterPreview.tsx`).** CV preview had carried the orange brand band (full-width 6px stripe at the top of the paper) + orange-tinted contact-rule (border-b-2 border-orange/40 under the contact pipe-line) + `overflow-hidden` on the article since 2026-05-08 (Decision Log [14] entry "Drop PagedPreview from SuccessView"); cover letter preview never picked them up. User screenshot showed the visual asymmetry — CV looked branded, cover letter looked plain. Mirrored all three: article gains `overflow-hidden`, drops the outer `p-14`; new orange band div as first child; remaining content wrapped in `<div className="p-14">` so the band is full-bleed against the paper edge. Sender contact pipe-line gains the same `border-b-2 border-orange/40 pb-2` treatment as the CV's contact line. min-h `1123px` (the A4 page-fill rule) stays on the article so the cover letter still fills one A4 page regardless of content length. DP-2 picked Option A (full mirror); B (just band) and C (just contact rule) rejected as half-mirrors that read as incomplete.

What was *not* changed: cover letter content / paragraph layout / signoff structure, CV preview (already had the brand treatment), DOCX renderers (the canonical artefacts — see Decision Log [9] / [18] entries; DOCX cover letter ALREADY carried the brand band via `contactLine(text, withRule=true)` in 2026-05-01, so the preview is just catching up to what the DOCX has shown for over a week), the discriminated-union schema, the system prompt, the Inngest pipeline.

Test path: any /application/[id] in success state — confirm both previews now share the orange band signature and contact-rule treatment side-by-side. Any /application/[id] in running state — confirm rail segments connect circles cleanly without crossing through them, fill cascades segment-by-segment as stage events arrive.

Rollback: single `git revert`. Both changes are surface-only — no schema, no API, no pipeline.

[14] Guided error recovery on /application/[id] — input-fixable vs system-side branches (2026-05-09). User asked to build "user journey when the app returns invalid llm output or any kind of error that is related to either their cv/job description that needs to change. Then connect it with retry on the spot. I want them to be guided." Plus: "when its our system side error then give user a soft message saying things like 'Seems like something is wrong... admin/we has/have been informed and are looking into this'."

DPs: C / A / A. Categorize every error code with `recovery_kind` + headline + hint (DP-1 C); read the latest error_code from request_logs at page render rather than persist on the row (DP-2 A — no schema change); reuse the existing `RetryAbandonControls` Screen-9 form for input_fixable cases (DP-3 A — same component already does inline JD edit + use-new-cv toggle + retry/abandon).

* **`lib/errors/codes.ts`.** Each `ERROR_CODES` entry now carries three new fields: `recovery_kind` ("input_fixable" | "transient" | "non_recoverable" | "system_paused" | "no_recovery"), `recovery_headline` (friendly H1), and `recovery_hint` (one-sentence "what to try", null for codes with no actionable user step). New exported `RecoveryKind` type. Tags by code:
  - **input_fixable** — `jd_too_short`, `generation_too_large`, `llm_invalid_output`, `master_cv_parse_failed`. User can fix the JD or re-upload the CV.
  - **transient** — `internal_error`, `database_error`, `rendering_failed`, `llm_failed`, `storage_failed`, `service_unavailable`. System-side; hint copy explicitly says "Our team has been alerted automatically and we're looking into it" (Sentry alerts wired per Decision Log [15]).
  - **non_recoverable** — `retry_limit_reached`, `daily_cost_ceiling_reached`, `files_expired`. Dead-end, no retry.
  - **system_paused** — `generation_disabled`. Try-later messaging.
  - **no_recovery** — sentinel for codes that pre-empt creation (auth, submit-time validation, email_send_failed) and never land on the application detail page.

* **`app/(app)/application/[id]/page.tsx`.** When `app.status === "error"`, the page now queries `request_logs` for the latest `error_code` on this application via service-role (the table is admin-RLS gated; one extra select on the rare error path). Maps the code → recovery descriptor; falls back to `transient` if no code is logged or the code is `no_recovery`. Renders one of four branches via the new `ErrorRecoverySection` component (defined inline at the bottom of the page):
  - **input_fixable**: warn-tone banner with PencilIcon, headline + hint, then `RetryAbandonControls` (Screen 9's form — JD editor pre-filled, notes textarea, "Use new master CV" checkbox, Retry/Abandon buttons). Same retry route as before; user can fix the JD inline and resubmit on the spot.
  - **transient**: danger-tone banner with AlarmClockOffIcon, headline + soft "team has been alerted, retry usually does the trick" hint, then `RetryFailedButton` + "New application" link.
  - **system_paused**: info-tone banner with PauseIcon, "we're checking on it" hint, "Back to dashboard" + "Try a new submission" links.
  - **non_recoverable**: muted-tone banner with BanIcon, contextual hint (cap reached / files expired / daily limit), "Back to dashboard" + "New application" links (the latter starts a fresh attempt-1 chain rather than retrying this one, which is the only viable path forward).
  - All four branches surface the raw `error_message` inside a `<details>` "Technical details" disclosure at the bottom — collapsed by default, useful for support, never primary communication.

* **`cancelled` status branch** kept separate (its own section), unchanged copy: that path is system-side but specifically about Inngest never picking the run up — current "retry now and it'll go straight through" copy is already the right shape.

What was *not* changed: `applications` table schema (no error_code column added — the page reads from `request_logs` on demand); the retry route (already accepts JD/notes/use_new_cv from any non-success terminal state); `RetryAbandonControls` (reused as-is — its existing copy works for both Screen 9 and the input_fixable error case); insufficient_input branch; success / abandoned branches; cancelled branch; the system prompt; the LLM provider layer; the DOCX renderer; the schema validation. Sentry wiring (already in place per Decision Log [15]) — the new "team has been alerted" copy is honest, not aspirational.

Test path: trigger `llm_invalid_output` (today's three identical failures will retry cleanly now that the schema preprocess strips orphan education entries — but if a future model glitch produces another flavour of llm_invalid_output, the input_fixable branch shows the JD editor with the friendly "sometimes the AI gets confused" hint). Trigger transient by simulating a failed Inngest send (already-failing path on the retry route in the catch block) — should render the danger-tone soft-message branch with the soft "we've been alerted" copy. Trigger `daily_cost_ceiling_reached` by tripping the daily limit — should render the muted non_recoverable branch with no retry button.

Rollback: single `git revert`. The codes-table additions are additive (new optional-shape fields); the page changes are scoped to the error branch. The new `ErrorRecoverySection` component is inline so removal is a single-block delete.

[14] Public-but-auth-aware topbar primitive (2026-05-11). User-reported: clicking FAQ from the UserMenu dropdown navigated to /faq but showed the LandingTopbar (with "Sign in" + "Get started") instead of the authenticated (app)-style topbar — read as "I've been signed out."

Root cause: `app/faq/page.tsx` lives outside the `(app)` group (so anonymous visitors can reach it) and hard-coded `<LandingTopbar />` regardless of session state. The LandingTopbar's right-hand cluster is unconditional Sign in + Get started, so a signed-in user landing there sees public chrome with no awareness of their auth state.

Two new server-component primitives in `components/app/`:

- **`AuthedTopbar.tsx`** — the authenticated topbar JSX (wordmark + nav with `<TopbarNav>`), extracted from `app/(app)/layout.tsx` so there's one canonical source for "what the authenticated topbar looks like". (app) layout now imports it; the inline header JSX is gone.
- **`AuthAwareTopbar.tsx`** — server component that reads the session and renders either `<LandingTopbar />` (anon) or `<AuthedTopbar email hasCv isAdmin />` (signed in). Fetches `master_cvs` + `profiles.is_admin` in parallel, same shape as `(app)/layout.tsx`. Doesn't redirect — anon visitors still see the page, just with the public chrome.

`app/faq/page.tsx` now uses `<AuthAwareTopbar />`. Behaviour: signed-in user clicks FAQ → lands on /faq with their UserMenu in the corner + primary CTA still visible; anonymous visitor hits /faq → sees the public Sign in + Get started chrome.

**Convention going forward (binding):** any page outside the `(app)` route group that should serve both anonymous and signed-in visitors MUST use `<AuthAwareTopbar />` instead of `<LandingTopbar />` directly. The latter is only correct for pages that are explicitly anonymous-only (the landing page itself; future Sign up / Sign in flow). Future Pricing / Terms / Privacy etc. fall under the same rule as FAQ — public reachability, auth-aware chrome.

What was *not* changed: `LandingTopbar` itself (still the right component for the landing page); `(app)/layout.tsx`'s data-fetch block (already fetches the same fields, just delegates rendering); FAQ content; root layout. The `AuthAwareTopbar` does a small extra round-trip on every /faq render — same query shape as the (app) layout, so cost is negligible (`maybeSingle` on indexed user_id).

Rollback: single `git revert`. Both primitives are additive; reverting restores the previous `<LandingTopbar />` + inline (app) header JSX.

[v6→v1 email-delivery] Email graduates from "Deferred Features" to v1 (2026-05-11). Resend + DOCX attachments + per-user auto-email opt-in. Eight DPs decided before code:

- **DP-1 recipient → A**: user's auth email only. No per-send recipient field. Anti-abuse default; session already carries the address.
- **DP-2 attachments → A**: true Resend `attachments: [...]`, base64-encoded DOCX bytes pulled from Supabase Storage. ~30–80 KB each, well under Resend's 40 MB cap.
- **DP-3 trigger → A**: single primary "Email me both documents" button on the success view, inside a new "Send to inbox" surface-card section between What we did and the previews. Plus a companion (i) info popover that links to the auto-email toggle in Settings — affordance for users who want this to be automatic.
- **DP-4 confirmation → A**: one-click action, toast feedback. No modal — recipient is fixed to the session email so there's nothing to confirm. Success copy "Sent to {auth-email} — check your inbox."; failure copy "Couldn't send the email. Try again, or download the files directly."
- **DP-5 body content → C**: both plaintext and HTML multipart. Plaintext fallback covers spam-filter posture; HTML carries the brand wordmark + a single brand-orange rule. **Graceful fallback rule** (user-added): the template MUST never render bracket placeholders or empty values that read as broken software. `lib/email/templates.ts` `clean()` helper treats blank / `[]` / em-dash strings as empty; subject degrades from "Your tailored CV and cover letter — {company}" → "Your tailored CV and cover letter" when company is missing; greeting degrades from "Hi {first},\n" → "Hi there,"; lead sentence picks one of four shapes depending on which of role/company are present.
- **DP-6 rate limit → A+C combined**: no count cap, but Idempotency-Key support (mirror of the rest of the API). The button generates a per-click key `email-{appId}-{Date.now()}` so double-click is safe but two genuine clicks from different sessions both send.
- **DP-7 send mechanism → A**: synchronous in the route handler for the manual button. Two attachments + one Resend call is a couple seconds wall-clock, well under the 300s function timeout. Resend has its own retry. Auto-email runs as a step inside the existing generate-application Inngest pipeline, not a separate function — closer to the work; failures emit telemetry but do NOT fail the application (the user still has files via download + the manual button).
- **DP-8 sent state → B**: new `applications.last_emailed_at TIMESTAMPTZ NULL` column. Set by both code paths. SuccessView renders "Emailed X ago" muted line under the button when set; `router.refresh()` after a successful manual send pulls the new stamp from the server.

Shipped in 3 commits:

1. **`Email infra`** — migration `0005_email_feature.sql` (adds `applications.last_emailed_at` + `profiles.email_on_generation BOOLEAN DEFAULT false`), `resend ^6.12.3`, `lib/email/{client,templates,send-application-email}.ts`, `lib/docx/filename.ts` (extracted from the download route — single source of truth so attachment filenames stay aligned with download filenames). Download route refactored to import from the new module; no behaviour change.
2. **`Email manual-send route + Email me button`** — `app/api/applications/[id]/email/route.ts` POST handler (auth + ownership via RLS client + Idempotency-Key + service-role call to shared sender); `components/application/EmailMeButton.tsx` (one-click + (i) popover + Emailed-X-ago line); integration into the success view.
3. **`Email auto-send + Settings toggle`** — `setEmailOnGeneration` server action; `components/settings/EmailOnGenerationToggle.tsx` (optimistic switch with rollback-on-failure toast); new "Preferences" section on `/settings` at delay 200; auto-email Inngest step appended to the success branch in `inngest/functions/generate-application.ts` after `finalize-success` (reads the user's preference; calls `sendApplicationEmail`; swallows errors so the application's terminal state is independent of email outcome).

Env vars (existing, kept `.optional()` per Decision Log [3]): `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`. The client throws `ApiError('email_send_failed')` if either is missing at call time — `telemetry: email.send.failed` fires, the manual button surfaces the toast failure, the auto-email pipeline step logs and continues. So production traffic with these env vars absent fails closed and visibly (no half-broken sends).

What was *not* changed: the discriminated-union output schema; the DOCX renderer; the system prompt; the LLM provider layer; the queue / retry / abandon routes; the Inngest pipeline shape outside the new step; download route filename output (still bit-for-bit identical, helpers just moved). The `email_send_failed` error code, `email.send.{attempted,succeeded,failed}` telemetry events, and Resend env vars were all already scaffolded — this graduates them.

Rollback: each commit reverts cleanly on its own. The migration is additive (both columns nullable / defaulted) so rolling back the code without rolling back the schema is safe. If the schema needs to go too, `DROP COLUMN` on both is non-blocking.

Future work (not in v1): per-recipient input (DP-1 B), HTML what-we-did checklist body (DP-5 B+), history-list re-send action (DP-3 B), Inngest-job send for batch use cases (DP-7 B). All deferred until a real user pull surfaces.

[18] Output-quality pass — widow control, soft-skill rubric, cover-letter density (2026-05-12). Three coupled output-quality changes shipped in one session, prompt-first per the §0 advocate posture and the [7]/[18] strictness/posture discipline. No schema strictness re-tightening, no DOCX dense-profile changes on the CV.

**Commit 1 — §4.5 widow control + §10 item 36 (prompt-only).** Real symptom: rendered CV bullets / profile sentences / detail lines that wrap onto a final line with only a 1–2-word widow eat a full line of vertical space and read as a low-quality artefact. New §4.5 documents two fixes: (a) tighten upstream phrasing (cut redundant adjectives, replace multi-word phrases with single-word equivalents, drop connectors); (b) extend with a real outcome / scope / detail from the master CV — never pad with filler, never fabricate. Calibration anchor at ~95 characters per rendered line (CV dense profile, 10.5pt Calibri body, A4 with 15mm margins, bullet indent included) is a tripwire only — bullets landing at 80–94 chars are most at risk. Worked examples for both fixes included. §10 item 36 forces the mental-render check before return, covers `professional_experience.bullets`, `key_projects.bullets`, `profile` sentences, `education.details`, and `cover_letter_content.paragraphs`. DP-1 picked Option C (prose guidance leading + character heuristic as calibration anchor) — neither alone gave the model enough to act on consistently.

**Commit 2 — §4.6 soft-skill evidence rubric + §10 item 37 (prompt-only).** Real symptom: soft skills routinely missing from generated CVs even for HIGH-need fields (healthcare, sales, consulting). 3-bucket field rubric (HIGH / MEDIUM / LOWER) crossed with a 4-tier seniority layer (Graduate/Junior, Mid, Senior, Lead/Principal) — the combination determines whether soft-skill evidence is mandatory, optional, or context-gated by the JD. DP-2 picked Option A (3-bucket list); user added the seniority dimension. HIGH-need fields require evidence at every seniority (even Graduate in nursing must show empathy/teamwork from clinical placement / group work / volunteering); MEDIUM-need scales with seniority (Graduate/Junior optional, Senior+ mandatory); LOWER-need is gated on the JD naming a soft skill explicitly or seniority being Lead/Principal (where leadership implies people skills even in deep-technical roles). §4.6.4 anchors with three worked examples (Mid technical, Senior technical, Graduate clinical) showing what *behavioural* evidence looks like vs declarative ("strong communicator", "team player") — the bullet still follows §4.3 action+outcome shape, the soft skill is the *what was done*. §10 item 37 forces the bucket × seniority check before return.

Field rubric grounded in 2026 industry research: management 91%, business ops 86%, engineering 81% of postings list soft skills as top requirements (Soft Skills Statistics 2026; GHE Australia "soft skills vs hard skills 2026"). Higher-than-hypothesised baseline means the MEDIUM tier is load-bearing — a strict 2-bucket binary would force engineering CVs to over-index on soft skills alongside healthcare. Schema unchanged (soft-skill evidence folds into existing `profile` + `professional_experience.bullets`).

**Commit 3 — Cover letter density: 5 paragraphs + expanded structural spacing.** Real symptom: 4-paragraph cover letters at ~230 words top-anchor on a half-empty A4 page; the letter reads as visually thin even when content is strong. Three coupled changes in one bisect-friendly commit:

(a) `lib/llm/output-schema.ts`: `CoverLetterParagraphsSchema` cap raised `.min(3).max(5)` → `.min(4).max(6)`. DP-3a picked Option B — drift cushion on both sides of the new 5-paragraph target, mirrors the 2026-05-01 strictness-audit shape (prompt rule primary, schema as runaway-prose guard). min(4) keeps a one-step graceful fallback; max(6) catches trailing-empty drift.

(b) `prompts/system-prompt-v2.md` §5.1 + §5.2: word target 320–380 → 380–440, paragraph count 4 → 5. New order: Opening / Story 1 (primary, ~80–95w) / Story 2 (secondary, ~50–70w, lighter) / Company Connection / Closing. DP-3b picked Option D (split the existing "primary story + brief secondary evidence" structure across two paragraphs — cleanest evolution of the §5.2 shape rather than introducing a new content beat like mission-alignment, which would hit §2.2 / §5.4 AI-tells risk). Story 2 has two documented shapes: Shape A (different must-have than Story 1) or Shape B (complementary soft-skill / cross-functional thread — pairs with §4.6 for HIGH/MEDIUM-need roles). Hard rule: Story 2 must not repeat or rephrase Story 1; if the master CV has only one strong beat, keep Story 2 brief and use Shape B. §10 item 26 updated for the new count + the Story-2-different-beat rule; §10 item 7 updated for the new word target.

(c) `lib/docx/styles.ts` + `lib/docx/render-cover-letter.ts`: new `SPACING_COVER_LETTER` profile (mirrors the `SIZES_COVER_LETTER` pattern from 2026-05-01). DP-3c (revised after the user clarified the goal was to EXPAND spacing to fill the page, not tighten it) picked Option D with magnitudes: structural air bumped 9pt → 14pt at four seams (name+contact rule → date, date → recipient, recipient → salutation, salutation → first body paragraph, last body paragraph → sign-off). Body-paragraph rhythm stays at 9pt via new `body_paragraph_after` field — keeps the letter body reading as one coherent unit while the structure breathes. Sign-off block gets a new `signoff_between` field (4pt, was 0pt) so "Kind regards," and the candidate's name sit as a balanced two-line block. Renderer body loop now branches on `i === paragraphs.length - 1` to apply `section_after` (14pt) only above the sign-off; all other body-to-body gaps use `body_paragraph_after` (9pt).

Page-fill math: 5 paragraphs at ~95w avg + expanded structural air ≈ 575pt of ~740pt usable A4 height (≈78%); original was ~330pt (≈45%). Fills cleanly without overflow risk.

What was *not* changed: CV dense-profile (`SPACING_DENSE` + `SIZES_DENSE`) — locked since 2026-05-01 per [9]; `SIZES_COVER_LETTER` profile — already tuned 2026-05-01; canonical `SPACING` / `SIZES` — still drive the helpers' defaults so any future caller stays on the looser profile; schema strictness on any other field; the discriminated-union shape; the §0 advocate posture; §7.0 stop-and-reconsider gate; §7.3 trigger list; the Inngest pipeline.

Test path: one preview generation each for (a) a HIGH-need role (e.g. nursing or sales) at Mid seniority — confirm Story 2 lands as Shape B with one soft-skill thread, confirm profile carries a soft-skill thread, confirm CV bullets carry one soft-skill behavioural bullet, confirm no widows on dense-profile lines; (b) a MEDIUM-need role (e.g. data engineer) at Senior seniority — confirm at least one bullet shows collaboration / stakeholder management, confirm Story 2 is a different must-have or complementary thread; (c) a LOWER-need role (e.g. backend engineer IC) at Mid seniority — confirm soft skills omitted unless the JD names one, confirm letter still hits 5 paragraphs at the new word target. Visual diff: cover letter docx renders with the expanded header/footer breath and lands as a balanced one-page letter.

Rollback: each commit reverts cleanly on its own (bisect-friendly). The new `SPACING_COVER_LETTER` profile is additive — reverting commit 3 leaves the renderer back on canonical `SPACING` with no migration needed.

[18] Soft-skill source-of-truth rule (2026-05-13, prompt-only — both Claude and Flash). Real failure: a Customer Service Rep generation for Auckland Transport produced a CV that simultaneously (a) ignored 5 of the candidate's 7 explicitly-declared soft skills (`Leadership and Team Facilitation`, `Communication and Brand Development`, `Problem-Solving and Analytical Thinking`, `Collaboration in Cross-Functional Teams`, `Community Building`) and (b) invented 3 new ones not in the master CV anywhere (`Conflict resolution and de-escalation`, `Empathetic communication`, `Cross-cultural engagement`). The cover letter compounded with a fabricated specific anecdote (`"a speaker's presentation materials went missing twenty minutes before their session..."`) not traceable to any master-CV bullet.

Root cause: the §4.6 (Claude) / §5.7 (Flash) soft-skill rubric established WHEN to surface soft skills (HIGH × any seniority mandatory; MEDIUM scales; LOWER JD-gated) and WHAT shape they take (behavioural not declarative), but never WHICH soft skills to claim — i.e. no source-of-truth rule anchoring on the master CV. Both prompts said `"never fabricate"` and `"draw from master CV"` but the model treated the JD's required-skills list as evidence of what the candidate HAS rather than what the recruiter WANTS, then bridged from generic master-CV signals (`"communication and relationship-building"`) to specific JD terms (`"conflict resolution and de-escalation"`) and asserted those terms as facts.

User picked Option C (both source rule + fidelity rule + paired self-check item) on the basis "It's a human's CV. Soft skills are must."

Three coordinated edits in one commit:

* **Claude prompt §4.6 intro:** added anchor sentence pointing at the new §4.6.5 for the source-of-truth rule; called out explicitly `"never claim a soft skill the master CV is silent on"`.
* **Claude prompt new §4.6.5 (Source-of-Truth Rule):** establishes three sources in priority order — (1) explicit `"Soft Skills"` / `"Strengths"` / `"Personal Attributes"` / `"Core Competencies"` / `"Key Strengths"` section if the master CV has one (canonical declared list, JD-relevant subset picked + rephrased), (2) behavioural evidence in bullets across `professional_experience` / `key_projects` / `leadership_and_interests`, (3) the JD is NOT a source. Distinguishes bridging (rephrase master-CV `"Communication and Brand Development"` → `"Stakeholder communication"` — allowed) from invention (claim `"de-escalation"` when neither word is in the master CV — banned). Honest gap handling: JD-required soft skills the candidate doesn't claim go in `fit_assessment.warnings`, not `cv_content`. Worked example using the AT customer-service failure mode (wrong vs right output for the candidate's actual 7-skill list).
* **Flash prompt §5.7:** appended a compact Flash-style "Source-of-truth rule" paragraph with the same three-source priority, bridging-OK / invention-banned distinction, honest-gap handling, and the same AT-style worked example.
* **§10 self-check items:** new item 42 (Claude) and 18 (Flash). Forces scan of every soft-skill claim in `cv_content` — Skills section entries, profile threads, bullets in professional_experience / key_projects / leadership_and_interests — and traces each to one of the three master-CV sources. Special vigilance list calls out the highest-risk JD-derived terms: `"conflict resolution"`, `"de-escalation"`, `"empathetic communication"`, `"emotional intelligence"`, `"resilience"`. If those (or close cousins) appear nowhere in the master CV, delete from CV. Flash intro count bumped from 14 → 18 (was already lagging the true item count).

What was *not* changed: §4.6.x rubric itself (HIGH / MEDIUM / LOWER buckets unchanged; seniority layer unchanged; behavioural-not-declarative rule unchanged; the existing `"Soft skills do not get their own category inside the Skills section"` rule in §4.6 intro — known-tension with non-tech roles where Skills section is dominated by soft skills, but addressing it is broader scope than the current failure mode). `lib/llm/output-schema.ts` — schema-side strictness is locked per [7] discipline; soft-skill claims are prose-shaped (not structurally enforceable). The §5.4 / §5.8 numeric-fidelity rules (separate fidelity class). The Inngest pipeline. The LLM provider layer. The DOCX renderer.

Test path: re-submit the AT Customer Service Rep generation on a preview deployment. Confirm (a) the Skills section uses the JD-relevant subset of the candidate's declared 7 soft skills (rephrased: `"Communication and stakeholder engagement, Team leadership and facilitation, Cross-functional collaboration, Problem-solving in fast-paced environments, Event coordination and logistics, Community building"`); (b) no `"conflict resolution"` / `"de-escalation"` / `"empathetic communication"` / `"cross-cultural engagement"` in `cv_content` since none of those phrases are in the master CV; (c) profile + at least one bullet evidence soft skills behaviourally from real master-CV outcomes (the verbatim `"Demonstrated strong communication and relationship-building across 100+ events, achieving 96% customer satisfaction"` bullet should surface as-is or close); (d) the cover letter's primary story uses an actual master-CV bullet, not a fabricated specific anecdote; (e) if any JD-required soft skill is genuinely not in the master CV, it surfaces in `fit_assessment.warnings`. Run the same JD across both providers (LLM_PROVIDER=anthropic and LLM_PROVIDER=deepseek) since both prompts got the fix.

Rollback: single `git revert`. The §4.6.5 subsection is additive; the §10 items are append-only; the §4.6 intro anchor sentence is one-line.

[18] Soft-skill source-of-truth framing correction (2026-05-13, same-day follow-up to the entry above). User pushback on the previous commit's framing: `"JD is a source. Fix it."` The framing `"the JD is NOT a source"` overshot — the JD IS a source, for *which* soft skills the recruiter wants to see, what language to mirror for ATS, which master-CV claims to prioritise and rephrase. What the JD is *not* a source for is **evidence of what the candidate has**. Two different jobs; the previous commit conflated them.

Reframed both prompts (§4.6.5 Claude / §5.7 Flash) around a two-input model:

| Source | Job (its source-of-truth role) | Not its job |
|---|---|---|
| **JD** | The *target list*: which soft skills the recruiter wants; ATS framing language; which master-CV claims to prioritise and rephrase. | Evidence of which soft skills the candidate has. |
| **Master CV** | The *evidence list*: which soft skills the candidate can credibly claim; verbatim self-descriptions; behavioural outcomes. | Filtering for role-relevance — the JD does that. |

Output's soft-skill claims live in the **intersection**: master-CV-evidenced claims framed using JD language when the underlying skill matches. The previous commit's three-source priority list rewrote rule 3 from `"The JD is NOT a source."` (over-strong) to `"JD-only terms — verify against the master CV before claiming."` (accurate). The bridging-vs-invention distinction stayed: bridging means using JD framing for a skill the master CV claims (`"Communication and Brand Development"` → `"Stakeholder communication"`, allowed); invention means asserting a skill the master CV is silent on regardless of JD framing (`"De-escalation"` when neither term is in the master CV, banned).

Edits in this commit:
* Claude §4.6 intro: anchor sentence rewritten — `"The JD tells you which soft skills the recruiter wants (the target list); the master CV tells you which soft skills the candidate can credibly claim (the evidence list). Output lives in the intersection."` Calls out `"Never claim a soft skill the master CV is silent on, even when the JD names it explicitly."` to keep the invention guard explicit.
* Claude §4.6.5: header changed from `"anchor on the master CV, never on the JD"` → `"two inputs, two different jobs"`. Replaced the three-rule list's rule 3 (`"The JD is NOT a source"`) with a corrected version (`"JD-only terms — verify against the master CV before claiming"`). Added the two-input source-vs-job table at the top so the model can't miss the framing. Worked example updated to make explicit that the wrong-output failure mode was the model using the JD as evidence-list instead of target-list, and the right output uses JD framing while sourcing claims from the master CV's declared seven soft skills.
* Flash §5.7: same source-vs-job table at the top, same three-rule list with corrected rule 3, same worked example treatment with the same "target list / evidence list" framing.
* §10 self-check items (Claude item 42, Flash item 18): rewritten lead sentence — `"The JD is the *target list* (what the recruiter wants); the master CV is the *evidence list* (what the candidate can claim). Output lives in the intersection."` Body unchanged in shape — scan every soft-skill claim, trace to one of three master-CV sources, delete if the claim was inferred from the JD with no master-CV evidence. Added one explicit line — `"The JD being a source for *which skills to look for* never authorises claiming a skill the master CV is silent on."` — so the rule's *spirit* is unambiguous even when applied to edge cases.

What was *not* changed: the rubric (§4.6.1–§4.6.4 / §5.7 buckets), the seniority layer, the behavioural-not-declarative rule, the honest-gap-handling routing to `fit_assessment.warnings`, the bridging-vs-invention distinction itself (just better-framed now), the schema, the LLM provider layer, the renderer.

Test path: same as the entry above — re-submit the AT Customer Service Rep generation. Expected output identical to the previous entry's "right" example: Skills section uses the JD-relevant subset of the declared 7 soft skills rephrased with JD framing (`"Communication and stakeholder engagement, Team leadership and facilitation, Cross-functional collaboration, Problem-solving in fast-paced environments, Event coordination and logistics, Community building"`); no `"conflict resolution"` / `"de-escalation"` / `"empathetic communication"` in `cv_content`; `fit_assessment.warnings` carries the honest line about the gap; behavioural bullet evidences soft skills from real master-CV outcomes.

Rollback: single `git revert` — this commit reverts cleanly, restoring the previous "JD is not a source" framing. Reverting the previous commit too restores the pre-source-rule state.

[18] Soft-skill labels are candidate-owned (2026-05-13, same-day second walk-back of the source-of-truth rule). User direction: `"invention is fine. the user can back it up."` The premise of the previous two commits — that JD-derived soft-skill labels not present in the master CV are *fabrication* — was wrong for soft skills as a class. Soft skills are character traits and ways of working that the candidate owns and backs up at interview and on the job. The model is the candidate's advocate (§0.1), not their soft-skill fact-checker. The previous commits' insistence on master-CV evidence for every soft-skill *label* was over-policing.

New framing in both prompts (Claude §4.6.5 / Flash §5.7 + Claude §4.6 intro + §10 items 42/18):

- **Soft-skill labels are candidate-owned.** Mirror the JD's terminology liberally — `"empathy"`, `"conflict resolution"`, `"de-escalation"`, `"interpersonal skills"`, `"emotional intelligence"`, `"resilience"`, `"positive attitude"`, `"adaptability"`, `"cross-cultural engagement"` all permitted in `cv_content.technical_skills`, `cv_content.profile`, and behavioural bullets even when the master CV does not use the same words. ATS keyword alignment is the model's job.
- **Behavioural bullets: master-CV facts + JD labels.** A behavioural bullet's *action and outcome* must come from a real master-CV bullet (real role, real number, real date); the *soft-skill label* attached to the action can be the JD's term. Example: master CV `"Demonstrated strong communication and relationship-building skills across 100+ events, achieving 96% customer satisfaction"` + JD asks for `"empathy and de-escalation"` → bullet `"Built rapport with diverse customers across 100+ events, empathising with concerns and de-escalating issues to maintain 96% satisfaction"`. Numbers and scope from master CV; labels from JD.
- **No `fit_assessment.warnings` entry needed for soft-skill labels missing from master CV.** Warnings flag verifiable gaps a recruiter can confirm and the candidate cannot improvise — technical-skill gaps, years-of-experience gaps, certification gaps, formal qualification gaps. Soft-skill labels are not in that class.
- **What still requires master-CV fidelity (§5.4 / §5.8 unchanged):** every NUMBER, every DATE / DURATION / TENURE, every NAMED EMPLOYER / ROLE TITLE / PROJECT NAME, and every SPECIFIC EVENT or ANECDOTE in the cover letter. The cover letter's fabricated anecdote in the original AT failure (`"a speaker's presentation materials went missing twenty minutes before their session"`) is still a §5.4 violation — the candidate did not tell us this story, can't easily back up a specific event they never lived. Story 1 / Story 2 / Company Connection paragraphs all draw their specific events from real master-CV experience.

The line: soft-skill *labels* are candidate-owned and JD-derived freely. Factual *scaffolding* (numbers, employers, dates, specific events) is master-CV-owned. §5.4 / §5.8 fidelity rules unchanged in shape and scope; the §4.6.5 / §5.7 source rule no longer covers labels.

Edits in this commit:
* Claude §4.6 intro: rewritten to the candidate-owned framing; explicit `"the model is the candidate's advocate, not their soft-skill fact-checker"`; pointer to §4.6.5 for permitted JD-derived labels.
* Claude §4.6.5: subsection retitled `"Soft-Skill Claims Are Candidate-Owned (use JD labels liberally)"`. Body rewritten as a four-point permitted list (mirror JD terminology / anchor bullets in master-CV experience / no warnings needed / what's still master-CV-bound). Worked example shows three lines: Skills section OK with JD labels mixed; behavioural bullet OK with master-CV facts + JD labels; cover letter NOT OK with fabricated specific anecdote. Bridging-vs-invention table removed (no longer the right framing); replaced with labels-vs-facts framing.
* Flash §5.7: same shape, compact Flash style. Same worked example. Replaced the table and the three-priority rule list with the permitted/not-permitted/worked-example structure.
* §10 self-check items (Claude 42 / Flash 18): rewritten as the labels-vs-scaffolding check. Body scans every soft-skill bullet, profile thread, and cover-letter story for the four factual classes (numbers / dates / employers / specific events) and fails on the *fact* not the *label*. The soft-skill label test is dropped entirely — labels are not a fact-check class.

What was *not* changed: the rubric (§4.6.1 – §4.6.4 / §5.7 buckets), the seniority layer, the behavioural-not-declarative shape rule, the honest-gap-handling routing for non-soft-skill gaps (technical / experience / certification / qualification gaps still go to `fit_assessment.warnings`), §5.4 / §5.8 numeric fidelity, the schema, the LLM provider layer, the renderer. Specifically: the cover-letter Story 1 / Story 2 / Company Connection requirement to anchor specific events in master-CV bullets is unchanged. Soft-skill labels are permitted to flow freely; specific events still need a master-CV source.

Test path: same AT Customer Service Rep generation as the previous two entries. Expected output:
- Skills section liberally uses JD labels (`"Empathy and de-escalation"`, `"Conflict resolution"`, `"Cross-cultural engagement"`) alongside the candidate's declared soft-skill themes. Both classes welcome.
- Behavioural bullets in `professional_experience` use JD soft-skill labels but the actions / numbers / outcomes all trace to master-CV bullets verbatim.
- `fit_assessment.warnings` is no longer required to flag soft-skill terms missing from master CV (the previous commits' flag is dropped). Warnings still surface technical / experience / certification / qualification gaps where applicable.
- Cover letter Story 1 / Story 2 / Company Connection draw their specific events from real master-CV bullets (e.g. the 100+ AUT Events satisfaction story); no fabricated specific anecdotes like the original `"speaker's presentation materials went missing"`.

Rollback: single `git revert` of this commit reverts cleanly to the previous "two inputs, two different jobs" framing (which itself reverted the earlier "JD is not a source" framing). Two `git revert`s restore the pre-source-rule state. All three commits are bisect-clean.

[7] Strictness audit 6: what_we_did_checklist tight cushion + key_projects.context shape (2026-05-13). Real failures via the [10] observability pipeline: three `llm_invalid_output` attempts on a Colliers Assistant Systems Analyst submission across 2026-05-12, two distinct Zod paths:

  - `what_we_did_checklist` `too_big >8 items` (twice). Prompt §6 / C14 says `"5 to 7 items"`; schema was `.min(5).max(8)` (cushion of 1). Exact-match shape with the 2026-04-30 ats_keywords audit: prompt upper bound matched the schema cap with no drift cushion, model overshot, generation tanked. Relaxed schema to `.max(10)` (cushion of 3 above the prompt's upper bound). Prompt stays primary at 5-7 via §6 + new §10 item 43 (Claude) / item 19 (Flash) enforcing trim before return.
  - `cv_content.key_projects[0].context` `too_big >120 chars` (twice). Different shape — the schema cap was already ~7x the prompt example (`"Master's Thesis"`, ~16 chars), but the prompt never said `context` is a category tag. The word "context" naturally invites a sentence-length description in English, so the model emits one. Two-layer fix: schema relaxed `.max(120)` → `.max(200)` as tail safety; prompt clarified at the schema example line (Claude line 889, Flash schema-example line 98) that `context` is a short category tag (≤ 6 words) and NOT a description sentence, with explicit examples (`"Master's Thesis"`, `"Personal Project"`, `"University Coursework"`, `"Hackathon"`, `"Open Source Contribution"`). The descriptive content belongs in `bullets`. Self-check item 43 / 19 also enforces the tag shape pre-return.

  Three failures, two paths, one commit. Targeted-fix-per-surfaced-failure discipline maintained; no other caps touched in this audit. Schema caps not hit in these failures (paragraphs cushion already raised 2026-05-12, profile, fit_assessment.warnings each item) stay put — re-audit if real failures land.

  Schema audit-history comment block at the top of `lib/llm/output-schema.ts` gains a `2026-05-13` entry documenting both fixes alongside the previous five audits.

  Test path: re-submit the Colliers JD. Expected: schema accepts the model's natural emission (10 checklist items OK at the schema level, 6-word context tag OK at the schema level); prompt-side §10 item 43 forces trim to 7 items before return AND reshapes any sentence-context emission to a short tag with content moved to bullets. `request_logs.metadata.zod_issues` should no longer show these two paths.

  Rollback: single `git revert`. Each change is additive (cap bumps + prompt clarifications + new self-check items); no schema migration, no API surface change.

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
| llm_failed | 502 | Provider non-2xx (Anthropic or DeepSeek) |
| llm_invalid_output | 502 | Bad tool output or Zod fail |
| generation_disabled | 503 | GENERATION_ENABLED=false |
| daily_cost_ceiling_reached | 503 | Daily spend > DAILY_COST_CEILING_USD |

---

## Pricing Constants

**`claude-sonnet-4-6`** (verified 27 April 2026)
Input: $3.00 / MTok · Output: $15.00 / MTok · Cache write 5-min: $3.75 / MTok · Cache write 1-hr: $6.00 / MTok · Cache read: $0.30 / MTok · Web search: $0.01 / call

**`deepseek-v4-pro`** (verified 2 May 2026 against api-docs.deepseek.com/quick_start/pricing)
Input cache-miss: $1.74 / MTok · Output: $3.48 / MTok · Cache write: $0 (automatic, not separately billed) · Cache read (cache-hit): $0.145 / MTok

**`deepseek-v4-flash`** (verified 2 May 2026)
Input cache-miss: $0.14 / MTok · Output: $0.28 / MTok · Cache write: $0 · Cache read (cache-hit): $0.028 / MTok

**Tavily Search** (used by the DeepSeek provider in place of Anthropic's server-side web_search)
Basic depth: $0.008 / call

**Per-generation cost caps** (model-keyed in `COST_CAPS_BY_MODEL`):
- Anthropic: $0.50 pre / $1.00 post
- DeepSeek-Pro: $0.30 pre / $0.20 post
- DeepSeek-Flash: $0.05 pre / $0.03 post

**Daily ceiling default**: $10.00 (DAILY_COST_CEILING_USD env var)
