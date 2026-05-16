# CLAUDE.md — Job Application Tailoring Service

Single source of truth for any Claude Code session in this codebase. Read this
file before writing any code. Append new *binding* decisions to the relevant
topic in the Decision Log; never stack revisions in place — `git log` carries
the journey.

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
Every file does one thing. Every function has one job. Prefer 10 lines of obvious code over
5 lines of clever code. If a fresh Claude session cannot understand a function on first read,
simplify it.

**No Assumptions Rule**
If a behaviour is not explicitly described in this file or in the prompts, treat it as a
Decision Point. Do not invent behaviour, default values, or UX copy.

**Spec files**
- `CLAUDE.md` (this file): live state, interfaces, decisions.
- `prompts/system-prompt-claude.md`: Sonnet-tuned prompt, loaded on the Anthropic path.
- `prompts/system-prompt-deepseek-flash.md`: Flash-tuned prompt, loaded on the DeepSeek path.
- `app_handoff_v8.md` (repo root): original architecture handoff. Code is authoritative when it disagrees.

---

## Stack at a Glance

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16, TypeScript, App Router | adapts spec sample code from v14 to current API |
| UI | Tailwind v4 + shadcn/ui (Neutral preset, CSS variables) | brand tokens in `app/globals.css` `@theme` block |
| Hosting | Vercel | main → prod; `claude/*` branches → preview |
| DB + Auth + Storage | Supabase | Postgres, email/password auth, private buckets |
| LLM (default) | `deepseek-v4-pro` | OpenAI-compatible function calling; Tavily web search in a client-side tool loop |
| LLM (rollback) | `claude-sonnet-4-6` | flip `LLM_PROVIDER=anthropic`; uses Anthropic SDK + native `web_search` server tool |
| Background jobs | Inngest v4 | one cold-start `concurrency: 1 per user` |
| DOCX rendering | `docx` package | server-side, pure JSON-in / Buffer-out |
| PDF parsing | `unpdf` | serverless-safe |
| DOCX parsing | `mammoth` | |
| Email | Resend | shipped v1 with DOCX attachments + auto-send opt-in |
| Date handling | `date-fns-tz` | cover-letter date in UTC |
| Error tracking | Sentry | 5xx ApiErrors only, `error_code` tag |
| Validation | Zod v4 | single schema drives types, tool definition, validation |
| Telemetry | Supabase `telemetry_events` table | PostHog candidate for v2 |
| Motion | framer-motion ^11 (LazyMotion strict) | wraps app at root; respects `prefers-reduced-motion` |

---

## Repo Structure

```
.
├── app/
│   ├── (auth)/login/                   # signIn / signOut server actions
│   ├── (app)/                          # authenticated routes
│   │   ├── dashboard/page.tsx
│   │   ├── upload/page.tsx
│   │   ├── application/
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/page.tsx           # all post-submit states
│   │   ├── history/page.tsx
│   │   ├── settings/page.tsx
│   │   └── admin/                      # gated by requireAdmin() in admin/layout.tsx
│   │       ├── usage/page.tsx
│   │       ├── logs/page.tsx
│   │       ├── telemetry/page.tsx
│   │       ├── users/page.tsx
│   │       └── users/actions.ts        # setUserRole server action
│   ├── faq/page.tsx                    # public-but-auth-aware (uses AuthAwareTopbar)
│   ├── api/
│   │   ├── master-cv/route.ts          # POST
│   │   ├── master-cv/download/route.ts # GET (signed url)
│   │   ├── applications/
│   │   │   ├── route.ts                # POST
│   │   │   └── [id]/
│   │   │       ├── route.ts            # GET (SSE polling fallback target)
│   │   │       ├── events/route.ts     # SSE stream with Last-Event-ID replay
│   │   │       ├── download/[kind]/route.ts
│   │   │       ├── email/route.ts      # manual send
│   │   │       ├── retry/route.ts
│   │   │       └── abandon/route.ts
│   │   ├── inngest/route.ts
│   │   ├── telemetry/route.ts
│   │   └── admin/{usage,logs,telemetry}/route.ts
│   ├── layout.tsx                      # MotionProvider + ScrollIndicator + AmbientParticles + CustomCursor + inline FOUC theme script
│   ├── globals.css                     # @theme tokens + design-system primitives + keyframes
│   └── page.tsx                        # landing
├── components/
│   ├── ui/                             # shadcn primitives
│   ├── upload/                         # UploadForm (drag-and-drop)
│   ├── application/
│   │   ├── ApplicationLiveView.tsx     # SSE + 5s polling fallback
│   │   ├── CvPreview.tsx               # brand band + orange contact rule
│   │   ├── CoverLetterPreview.tsx      # brand-mirror of CvPreview
│   │   ├── PreviewPanel.tsx            # scrollable wrapper with zoom button
│   │   ├── PreviewZoomModal.tsx        # full-viewport overlay
│   │   ├── PagedPreview.tsx            # unused by SuccessView; kept for future print views
│   │   ├── NewApplicationForm.tsx
│   │   ├── EmailMeButton.tsx
│   │   ├── RetryAbandonControls.tsx
│   │   ├── RetryFailedButton.tsx
│   │   └── BehindApplicationHover.tsx
│   ├── history/HistoryList.tsx
│   ├── admin/UserRolePicker.tsx
│   ├── settings/{DeleteAccountForm, EmailOnGenerationToggle}.tsx
│   ├── landing/LandingTopbar.tsx
│   ├── ambient/
│   │   ├── AmbientParticles.tsx        # 35 drifting orange particles
│   │   └── ScrollIndicator.tsx         # 2px spring-smoothed top progress bar
│   └── app/
│       ├── AppShell.tsx                # ToastProvider + keyboard shortcuts + PageTransition
│       ├── AuthAwareTopbar.tsx         # picks LandingTopbar vs AuthedTopbar from session
│       ├── AuthedTopbar.tsx
│       ├── TopbarNav.tsx
│       ├── UserMenu.tsx
│       ├── AdminNav.tsx
│       ├── ChainCard.tsx               # native <details> per-chain card
│       ├── CopyId.tsx
│       ├── CustomCursor.tsx            # dot + ring, RING_LERP tuning inline
│       ├── MagneticDots.tsx            # ambient dot field, cull fast-path inline
│       ├── ThemeToggle.tsx
│       ├── MotionProvider.tsx          # LazyMotion strict + reducedMotion="user"
│       ├── PageTransition.tsx          # cross-fade keyed on pathname
│       ├── MotionList.tsx              # MotionList / MotionListItem / MotionSection
│       ├── animation-variants.ts
│       ├── FadeUp.tsx                  # legacy CSS-driven; still used on landing / faq / HistoryList
│       ├── MissingFieldsBadge.tsx
│       └── ProTip.tsx
├── lib/
│   ├── supabase/{browser,server,service,middleware}.ts
│   ├── auth/
│   │   ├── roles.ts                    # Role type, capability helpers, presentation maps
│   │   └── require-admin.ts
│   ├── llm/
│   │   ├── index.ts                    # picks provider via LLM_PROVIDER env
│   │   ├── types.ts                    # LlmProvider, CallLLMOptions, CallLLMResult
│   │   ├── pricing.ts                  # PRICING + calculateCost + COST_CAPS_BY_MODEL
│   │   ├── cost-cap.ts                 # checkCostCapPre / checkCostCapPost (model-keyed)
│   │   ├── tools.ts                    # neutral LlmTool definition
│   │   ├── build-user-message.ts       # XML tag block (no <region> tag)
│   │   ├── output-schema.ts            # ApplicationOutputSchema (Zod) — strictness audit history at top
│   │   ├── sanitise.ts                 # sanitiseOutput — dash strip etc.
│   │   └── language-check.ts           # detectLanguageDrift (L1 + L3 from docs/llm-output-risks.md)
│   ├── anthropic/
│   │   ├── provider.ts                 # AnthropicProvider implements LlmProvider
│   │   └── tool-schema.ts              # Zod → JSON Schema bridge + webSearchTool
│   ├── deepseek/
│   │   ├── provider.ts                 # DeepseekProvider with client-side tool loop
│   │   └── tavily.ts                   # Tavily client
│   ├── applications/chains.ts          # groupIntoChains
│   ├── parsing/{parse-pdf,parse-docx}.ts
│   ├── docx/
│   │   ├── styles.ts                   # SPACING / SIZES + DENSE + COVER_LETTER profiles + COLOURS
│   │   ├── helpers.ts                  # nameHeading, contactLine, sectionHeading, bullet, etc.
│   │   ├── render-cv.ts                # uses dense profile for every seniority
│   │   ├── render-cover-letter.ts      # uses canonical + expanded structural air
│   │   └── filename.ts                 # {lastname}_{kind}_{company_short}_{yyyymmdd}.docx
│   ├── email/{client,templates,send-application-email}.ts
│   ├── quality/scan.ts                 # runQualityScan(output) — no region param
│   ├── errors/
│   │   ├── codes.ts                    # ERROR_CODES + recovery_kind/headline/hint
│   │   ├── api-error.ts
│   │   ├── sanitise.ts
│   │   └── client.ts
│   ├── logging/
│   │   ├── with-logging.ts             # outer wrapper for route handlers
│   │   └── with-inngest-step.ts        # wraps step.run + cause-chain walker
│   ├── idempotency/with-idempotency.ts
│   ├── telemetry/{events,emit,track}.ts
│   ├── client/{api-fetch,handle-error}.ts
│   ├── design/tokens.ts
│   ├── env.ts                          # Zod-validated env reader
│   └── utils.ts
├── inngest/
│   ├── client.ts                       # isDev: process.env.NODE_ENV !== "production"
│   ├── functions/
│   │   ├── generate-application.ts     # 10.5 steps with language-check at 8.5
│   │   ├── trigger-next-in-queue.ts
│   │   ├── expire-files.ts
│   │   ├── expire-metadata.ts
│   │   ├── sweep-request-logs.ts
│   │   ├── sweep-idempotency-keys.ts
│   │   └── watchdog-stuck-applications.ts  # two passes (A: running >30min, B: queued >60min)
│   └── steps/
│       ├── acquire-slot.ts             # returns { atFrontOfQueue, actualFrontId }
│       ├── load-context.ts
│       ├── inject-date.ts              # UTC date
│       ├── render-and-upload.ts
│       └── finalize.ts
├── prompts/
│   ├── system-prompt-claude.md
│   └── system-prompt-deepseek-flash.md
├── supabase/migrations/
│   ├── 0001_initial.sql
│   ├── 0002_storage_buckets.sql
│   ├── 0003_preserve_generations_after_user_delete.sql  # user_id ON DELETE SET NULL
│   ├── 0004_master_cvs_missing_fields.sql
│   ├── 0005_email_feature.sql          # last_emailed_at + email_on_generation
│   └── 0006_user_roles.sql             # profiles.role TEXT replaces is_admin
├── docs/
│   ├── manual-verification.md
│   ├── smoke-test.md
│   ├── sentry-alerts.md
│   ├── cleanup-smoke-tests.sql
│   └── llm-output-risks.md             # 16 risk classes, L1+L3 shipped
├── proxy.ts                            # Next 16 convention (was middleware.ts)
├── instrumentation.ts                  # Sentry runtime hook + Inngest dev startup check
├── sentry.{client,server,edge}.config.ts
├── next.config.ts
├── tsconfig.json
├── package.json
└── .env.example
```

---

## Interface Contracts

Locked TypeScript signatures for the files most likely to cause drift. Implement these exactly;
do not change without a Decision Point.

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

type RouteContext = { user_id?: string; application_id?: string };
type RouteHandler = (req: NextRequest, context: RouteContext) => Promise<NextResponse>;

export function withLogging(
  name: string,
  handler: RouteHandler
): (req: NextRequest) => Promise<NextResponse>;
```

Behaviour:
- Generates a `request_id` (uuid) at the start of every request.
- Sets Sentry tag `request_id`; on ApiError also sets `error_code`.
- Catches `ApiError`: returns `{ error: { code, message } }` JSON with correct HTTP status.
- Catches everything else: wraps as `internal_error` 500, reports to Sentry.
- Reports 5xx ApiErrors and unknown errors only; 4xx ApiErrors are silent.
- Writes to `request_logs` fire-and-forget.
- Sets `X-Request-Id` response header.

### `lib/idempotency/with-idempotency.ts`

```typescript
type IdempotencyOptions = {
  user_id: string;
  route: string;
  body: unknown;
  idempotencyKey: string | null;   // from Idempotency-Key header
};

export async function withIdempotency<T>(
  opts: IdempotencyOptions,
  handler: () => Promise<T>
): Promise<{ result: T; replayed: boolean }>;
```

Behaviour:
- If `idempotencyKey` is null, calls handler directly, returns `{ result, replayed: false }`.
- Hashes body with SHA-256; throws `ApiError('idempotency_key_conflict')` on mismatch.
- On cache hit, returns stored result with `replayed: true`.
- 10-minute TTL via `idempotency_keys.expires_at`. Uses service-role client.
- Composed *inside* the handler so logging wrapper still writes a row on replay (`metadata.replayed = true`).

### `lib/llm/{types,index}.ts` and provider implementations

```typescript
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
  toolInput: unknown;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens: number;     // 0 on DeepSeek (writes not separately billed)
    cache_read_tokens: number;
    web_search_count: number;          // Anthropic native counter / DeepSeek Tavily call count
  };
  cost_usd: number;
  model: ModelName;                    // claude-sonnet-4-6 | deepseek-v4-pro | deepseek-v4-flash
};

export interface LlmProvider {
  callLLM(opts: CallLLMOptions): Promise<CallLLMResult>;
}

export const llm: LlmProvider;
```

Behaviour shared across providers:
- Pure SDK wrapper: returns usage + cost. Does NOT write `token_usage` — the Inngest `call-llm` step does.
- Does NOT apply the cost cap — caller (Inngest step) does.
- Throws `ApiError('llm_failed')` on non-2xx provider response.
- Throws `ApiError('llm_invalid_output')` if no `submit_application` tool call materialises.

Anthropic provider (`lib/anthropic/provider.ts`):
- System prompt sent as a single text content block with `cache_control: { type: "ephemeral" }`.
- Native `web_search_20250305` server tool (`max_uses: 5`); web search count from `usage.server_tool_use.web_search_requests`.
- Tool choice `{ type: "any" }` lets the model chain `web_search` calls before `submit_application`.
- Model: `claude-sonnet-4-6`.

DeepSeek provider (`lib/deepseek/provider.ts`):
- OpenAI-compatible chat completions via the `openai` SDK with `baseURL: https://api.deepseek.com`.
- KV cache is automatic; `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` summed across iterations.
- Client-side tool loop: each iteration emits either `submit_application` (terminal) or `web_search` calls resolved via Tavily (basic depth, 5 results). 5-call budget; 6th call returns "budget exhausted" tool result (graceful degrade). 8-iteration cap. 270s total wall clock. 60s per-iteration timeout with retry-once.
- Tool choice `"required"`. Model: `deepseek-v4-pro`.

### `lib/client/api-fetch.ts`

```typescript
type ApiFetchOptions = RequestInit & { idempotencyKey?: string };
type ApiFetchResult<T> = { data: T; requestId: string | null };

export async function apiFetch<T>(
  path: string,
  options?: ApiFetchOptions
): Promise<ApiFetchResult<T>>;
```

Behaviour:
- Retries on 5xx and 429 with delays [0ms, 500ms, 2000ms] (3 attempts total).
- Does NOT auto-attach `Idempotency-Key`; only when caller passes `idempotencyKey`.
- On non-2xx after retries, throws `{ code: string, message: string }`.

### `lib/llm/cost-cap.ts`

```typescript
import type { ModelName } from "./pricing";

// Pre-call estimate from raw message size. Throws ApiError('generation_too_large')
// if estimate exceeds the model's pre-cap. Caps are model-keyed in COST_CAPS_BY_MODEL.
export function checkCostCapPre(
  model: ModelName,
  userMessageLength: number,
  systemPromptLength: number,
): void;

// Post-call warning if actual cost exceeds the model's full cap.
// Does NOT throw (money already spent). Tags Sentry warning with llm_model.
export async function checkCostCapPost(
  model: ModelName,
  cost_usd: number,
  applicationId: string,
): Promise<void>;
```

---

## Generation Pipeline (10.5 Inngest steps)

File: `inngest/functions/generate-application.ts`
Triggered by: `application/generate.requested`
Concurrency: `key: event.data.user_id, limit: 1`
Function retries: 2. LLM step retries: 0. All other steps: Inngest defaults.

| Step | Action | Throws |
|---|---|---|
| `kill-switch-check` | Read `GENERATION_ENABLED` env; `team`/`admin` roles bypass | exits cleanly if off + non-bypass role |
| `acquire-slot` | Confirm front of user queue; returns `{ atFrontOfQueue, actualFrontId }` — orchestrator re-fires for `actualFrontId` if different | exits cleanly if not at front |
| `load-context` | Master CV text + application row | `ApiError('database_error')` |
| `mark-running` | status → running, write `llm_started` event | `ApiError('database_error')` |
| `cost-cap-check` | `checkCostCapPre(model, …)` | `ApiError('generation_too_large')` |
| `call-llm` | `llm.callLLM(…)` + write `token_usage` row | `ApiError('llm_failed' \| 'llm_invalid_output')` |
| `cost-cap-postcheck` | `checkCostCapPost`, warning only | never |
| `validate-output` | Strict Zod parse against `ApplicationOutputSchema` | `NonRetriableError("llm_invalid_output")` wrapping `ApiError` wrapping `ZodError` |
| `language-check` | `detectLanguageDrift` — allowed set: Latin-extended ∪ target-country script ∪ chars present in parsed master CV | `NonRetriableError("llm_language_drift")` |
| `inject-date` | Replace `{{TODAY}}` with UTC date | never |
| `quality-scan` | `runQualityScan` warnings → step `request_logs.metadata` | never |
| Branch on status | success / insufficient_input | — |

Success path: `mark-rendering` → `render-docs` → `upload-files` → `finalize-success` → `auto-email` (reads `profiles.email_on_generation`; swallows errors).
- Sets `files_expire_at = now() + 60 days`.
- Sets `metadata_expires_at = now() + 1 year`.

Insufficient_input path: `finalize-insufficient`.
- Stores `insufficient_input_reason`. Sets `metadata_expires_at = now() + 1 year`. Pauses queued items for this user.

After any terminal state: fires `application/generation.completed`. `onFailure` marks application errored
and sets `metadata_expires_at`.

**Critical**: every terminal state transition MUST set `metadata_expires_at`. Affects finalize-insufficient,
onFailure, watchdog (both passes), abandon route.

**Watchdog (`*/15 * * * *`) has two passes**:
- Pass A: `status='running'` >30min → `error`. Guarded `.eq('status','running')`.
- Pass B: `status='queued'` >60min with `started_at IS NULL` → `cancelled`. Guarded `.eq('status','queued').is('started_at', null)`.

---

## Database: Key Rules

Status enum (nine values): `queued`, `paused`, `running`, `rendering`, `success`,
`insufficient_input`, `abandoned`, `error`, `cancelled`.

- **Queue cap** at submit: rows in `(queued, paused, running, rendering)` ≥ 3 → `ApiError('queue_full')`.
- **Snapshot rule**: record `master_cv_id` on the application row at submit time. Replacing the master CV
  later does NOT affect queued applications.
- **Retry chain**: new row with `parent_application_id`. `attempt_number` hard-capped at 3.
- **Expiry clocks** start at `completed_at`, not `created_at`.
- **`is_demo = true` rows** skip the expiry crons.
- **`GENERATION_ENABLED` and `DAILY_COST_CEILING_USD`**: read at request time (not module scope).
- **User deletion**: `applications.user_id` / `master_cvs.user_id` / `token_usage.user_id` are `ON DELETE SET NULL`
  (migration 0003). Generations survive account deletion until their existing 60-day / 1-year expiry clocks fire.
- **RLS**: users see only their own rows; admin tables are admin-read-only; Inngest functions use the service-role key.

---

## DOCX Rendering Rules

- **Pipe separator**: filter empty values BEFORE joining with " | ".
- **Empty sections**: if `key_projects`, `leadership_and_interests`, or `technical_skills` are empty, omit the entire section including the heading.
- **Recipient block**: if `company_address` is null, omit that line only.
- **Date in cover letter**: injected server-side by `inject-date` (UTC). LLM outputs `{{TODAY}}` placeholder.
- **Sign-off**: split on `\n`, render each line as a separate paragraph.
- **Filename**: `{lastname}_{CV|CoverLetter}_{company_short}_{yyyymmdd}.docx`. Source of truth: `lib/docx/filename.ts`.
- **ATS rules**: no headers, no footers, no page numbers, no text boxes, no tables.
- **Font**: Calibri throughout. Brand orange `#E85A0E` for section headings + contact rule; everything else black/grey.
- **CV uses the dense profile** (`SPACING_DENSE` + `SIZES_DENSE`) for every seniority — body 10pt, small/contact_line 9pt, section_heading 11pt, name_heading 15pt, paragraph_after 3pt, bullet_after 1pt, margins 15mm.
- **Cover letter uses canonical `SIZES` + `SPACING_COVER_LETTER`** — body 11pt, name 15pt, with expanded structural air (14pt at four seams: name+rule → date, date → recipient, recipient → salutation, salutation → first body, last body → sign-off). Body-to-body uses 9pt `body_paragraph_after`; sign-off block uses 4pt `signoff_between`. Brand orange contact rule via shared `contactLine(text, withRule=true)` helper.
- **Education details**: render inline-joined with " · "; not as bullets.
- **Referees**: inline grey meta line at the bottom, not a section heading. ATS still matches the "Referees:" prefix.
- **Certifications** belong in Technical Skills as a category called "Certifications"; never under Education.
- **Constants** live in `lib/docx/styles.ts`. Use them; do not hardcode.

---

## Screen Map

Single `app/(app)/application/[id]/page.tsx` handles all post-submit states.
Branch on `application.status`:

| Status | Screen | Key content |
|---|---|---|
| queued / paused | Queued view | "Queued, position N of M" + read-only JD and notes |
| running / rendering | Live | SSE phase labels + four-phase indicator + 10s/5s polling fallback |
| success | Success | CvPreview + CoverLetterPreview (PreviewPanel + click-to-zoom modal) + What we did + Fit + downloads + Email me button |
| insufficient_input (attempt < 3) | Recovery | reason + retry form + "Use new CV" toggle |
| insufficient_input (attempt 3) | Dead-end | reason + "Continue queued applications" button |
| error | Guided recovery | reads latest `error_code` from `request_logs`; renders matching `ErrorRecoverySection` (input_fixable / transient / non_recoverable / system_paused) |
| cancelled | Recovery | "retry now and it'll go straight through" copy |

SSE event shape (locked): `{ phase, application_id, timestamp, payload? }`.
Four phases: `llm_started`, `llm_completed`, `rendering_started`, `finalized`.

**Polling fallback**: kicks in after 10s of SSE silence; 5s tick against `GET /api/applications/[id]`.
EventSource auto-sends `Last-Event-ID` on reconnect; server supports replay via header + `?lastEventId=`.

**Submit-button debounce**: 3-second post-click lockout (separate from `pending` so submit-failure
clears `pending` immediately for retry but `debounced` keeps the guard).

**History/Dashboard visibility**: filter on `started_at IS NOT NULL`. Pre-LLM rows are excluded from
`/history` and the Dashboard "Recent" widget (but the application detail page still server-renders
them by direct URL). `started_at` is written by `mark-running`.

**Chains, not flat rows**: `lib/applications/chains.ts` groups parent_application_id chains; `ChainCard`
renders one row per chain on dashboard + history. Title: `${role_archetype} @ ${company_name}` when any
descendant has structured output.

---

## Environment Variables

- `GENERATION_ENABLED` (read at request time; default true).
- `DAILY_COST_CEILING_USD` (read at request time; default 10.00).
- `LLM_PROVIDER` (module-load; default "anthropic"; flip to "deepseek" on next Inngest cold boot).
- `RESEND_API_KEY` + `EMAIL_FROM_ADDRESS` (optional; both required for email to send, fails closed with `email_send_failed` otherwise).
- `SUPABASE_SERVICE_ROLE_KEY` — imported ONLY in `lib/supabase/service.ts`.
- `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` — required in production only.
- `INNGEST_DEV` — override the dev-server `/health` URL.
- `SLACK_WEBHOOK_URL`, `ADMIN_EMAIL` — daily-summary fallback chain.
- `NEXT_PUBLIC_*` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_URL`) — public; validated module-scope.
- All validated via Zod in `lib/env.ts`. Fail fast on missing required vars.

**Operational note**: preview deployments need `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` exposed to Preview scope in Vercel, or the build fails at "Collecting page data".

---

## Deferred Features

These are explicitly deferred until public signups open:

- Per-user rate limiting (add via Upstash).
- Magic link auth (single Supabase toggle + 2 file changes).

Email delivery, email confirmation UX, and account deletion all ship as v1.

---

## Build Sequence

Initial scaffold-to-launch sequence is complete; see `git log` for shipped order. The current
pipeline is documented in the **Generation Pipeline** section; current repo layout in
**Repo Structure**; current bindings in **Decision Log**.

---

## Decision Log

This section records *current binding decisions* — what is true today. Journey and superseded
versions live in `git log`. Tuning of motion / cursor / dot / animation constants is documented
in code comments (`CustomCursor.tsx`, `MagneticDots.tsx`, `AmbientParticles.tsx`,
`ScrollIndicator.tsx`, `MotionProvider.tsx`) and not here.

When a new decision lands: append a binding rule under the relevant topic. When a decision is
reversed: rewrite the binding entry in place. Do not stack "X was Y, then Z" — `git log` carries that.

### Standing principles

- **Latest stable for new tools.** When adopting a tool, take the latest stable version. Adapt spec sample code to the current API rather than pinning the old version.
- **Targeted-fix-per-surfaced-failure.** Schema relaxations, prompt patches, and watchdog passes land only after real failures surface in `request_logs.metadata.zod_issues` or telemetry. Don't pre-emptively relax constraints "in case the model drifts".
- **GitHub main is source of truth.** Local `tsc` errors from missing env / packages are environmental drift. Verify via Vercel build; never act on errors in files you didn't touch.
- **Single source of truth per rule.** Each binding rule lives in exactly one file. Cross-reference rather than duplicate. Prompts in `prompts/`; schema in `lib/llm/output-schema.ts`; error codes in `lib/errors/codes.ts`; design primitives in `app/globals.css`; tuning in code comments.

### Tooling & framework

- **Next.js 16** with App Router. Root middleware file is `proxy.ts` (Next 16 convention); helper `lib/supabase/middleware.ts` exports `updateSession`.
- **Tailwind v4** CSS-first `@theme` block in `app/globals.css`. No `tailwind.config.ts`.
- **shadcn/ui** Neutral preset + CSS variables, mapped to brand tokens.
- **Supabase CLI** as a dev dependency; invoke via `npx supabase`. `supabase/config.toml` has `project_id = "distil"`. Migrations applied via `npx supabase db push` against the linked remote.
- **`lib/env.ts`** validates at module scope. Public env always; server env behind `typeof window === 'undefined'`. Kill switch + daily ceiling exposed via getters that re-read `process.env` per call.
- **`lib/design/tokens.ts`** centralises brand tokens.
- **GitHub repo**: `https://github.com/TheRunicSage/Distil`. Supabase project: `kgezbvqtfcjorcgvjknm`.

### LLM provider layer

- **Provider switch via `LLM_PROVIDER`** env, read at module load in `lib/llm/index.ts` via `pickProvider()`. Default Anthropic Sonnet 4.6; `LLM_PROVIDER=deepseek` flips to DeepSeek V4 Pro. Vercel UI toggle takes effect on next Inngest cold start — no redeploy.
- **`LlmProvider` interface** is the contract. Per-provider behaviour is in Interface Contracts above.
- **`token_usage` row** is written by the `call-llm` Inngest step (not the SDK wrapper) using `usage`, `cost_usd`, `model` from the result plus the `user_id` / `application_id` already in scope at the step.
- **Tool schema bridge** (`lib/anthropic/tool-schema.ts`): derives `submitApplicationTool` from `ApplicationOutputSchema` via `z.toJSONSchema({ target: 'openapi-3.0', unrepresentable: 'any' })`, then flattens the discriminated-union branches into a single root `type: "object"` schema with `status` enum as the only required field. Both providers require this shape; branch correctness is enforced post-call by `validate-output`.
- **Per-model cost caps** in `COST_CAPS_BY_MODEL` (`lib/llm/pricing.ts`). Anthropic $0.50 pre / $1.00 post. DeepSeek-Pro $0.30 / $0.20. DeepSeek-Flash $0.05 / $0.03. `checkCostCapPre` keyed on the model that will run the call.
- **DeepSeek timeouts**: 60s per-iteration with retry-once-on-timeout (non-timeout errors fail fast). 270s total wall clock is the real ceiling.

### System prompts

- **Two prompts**, both load at module scope in `inngest/functions/generate-application.ts`. `pickSystemPrompt()` reads `LLM_PROVIDER`:
  - `prompts/system-prompt-claude.md` (Anthropic path) — Sonnet-tuned, ~16K tokens.
  - `prompts/system-prompt-deepseek-flash.md` (DeepSeek path) — Flash-tuned, ~9K tokens. Not a port.
- **Prompts are the canonical source for prompt rules.** This Decision Log records cross-cutting decisions; per-section rules live in the prompt files.
- **Advocate posture (load-bearing).** §0 (Claude) / §1 (Flash): the model is the candidate's advocate. The only gate is mechanically unreadable inputs (§7.3 Claude / §9.1 Flash). All other gaps handled by best-light framing: bridging language, soft-skill labels candidate-owned, certifications honesty ladder (Branch 3 bridging), cross-domain advocate framing with "transferable spine" exemplar.
- **Soft-skill rule.** *Labels* are candidate-owned and JD-derived freely. *Factual scaffolding* (numbers, dates, employers, role titles, specific events/anecdotes) is master-CV-owned. JD = target list; master CV = evidence list. Output lives in the intersection. §5.4 / §5.8 numeric fidelity rules cover the scaffolding side.
- **Voice rules.** Warm/specific/human. Five rules: sentence-length variance, contractions natural, concrete anchor per paragraph, warmth-not-humour (dry observation OK, jokes/puns/quirky openers banned), "could anyone write this" test. Worked BAD/GOOD exemplars in §5.3.1 (Claude) and §6.3 (Flash).
- **Cover letter shape.** 5 paragraphs (Opening / Story 1 / Story 2 / Company Connection / Closing). Word target 380–440. Story 2 must be a different beat from Story 1. Closing: specific callback + human voice; template phrases ("I would welcome the opportunity", etc.) banned per §2.2 / §7.2.
- **Region detection on the fly.** Model detects `target_country` from JD signals. Universal floor + per-country conventions for Anglo markets (NZ/AU/UK/US/IE/CA/ZA). Unfamiliar markets get one optional Phase 1.5 search. Cover-letter date in UTC.
- **Web search budget shared across phases.** 5-call cap covers Phase 1.5 (optional) + Phase 2 (2 mandatory + 0–1 optional) + Phase 4 (1–2 salary search). At most one extra optional across all three.
- **§10 self-check counts**: Claude 24 items, Flash 20. Schema-shape items are not in §10 — Zod preprocesses cover them.
- **DeepSeek temperature** stays at 0.4 (numeric-fidelity priority). Voice priming + worked exemplars substitute for higher-temperature voice flair.

### Output schema strictness

Schema is intentionally permissive — the cushion against model drift. Prompt rules are primary; schema is the runaway-prose guard.

- **Do not re-tighten without a DP.** Six audits over 2026-04-30 → 2026-05-13 relaxed: per-string min(1) → preprocess-and-strip, `.length(n)` → `.min/.max` with cushion, `.email()` / `.url()` → `string.min(1).max(N)` (verbatim copy, no validation).
- **Current caps that matter**:
  - `cover_letter_content.paragraphs`: `.min(4).max(6)` with preprocess stripping empty/whitespace strings. Prompt rule: exactly 5.
  - `jd_analysis.ats_keywords`: `.min(5).max(16)`. Prompt rule: 8–12.
  - `what_we_did_checklist`: `.min(5).max(10)`. Prompt rule: 5–7.
  - `professional_experience.bullets`: `.min(1).max(8)`. Lead/Principal stub roles can carry one summary bullet.
  - `cv_content.profile`: `.min(100)` (Graduate budget can yield tight 3-sentence profiles).
  - `cv_content.education` and `professional_experience`: preprocess strips orphan entries with empty identifying fields before bounds run.
  - `key_projects.context`: `.max(200)`. Prompt rule: short tag (≤6 words); descriptive content belongs in `bullets`.
  - `email` (contact_details + cover_letter_header) and `source_url` (recent_news + salary_band): `string.min(1).max(N)` — no validation.
  - `insufficient_input_reason`: `.max(2000)` (rendered as a paragraph to the user).
- **Discriminated union** on `status` ("success" | "insufficient_input") is the gatekeeper. Branch-specific fields stay required at the Zod layer; the *tool schema* flattens them to optional.
- **Audit history** lives in the top-of-file comment block in `lib/llm/output-schema.ts`.

### Inngest pipeline + observability

- **`withInngestStep`** in `lib/logging/with-inngest-step.ts` wraps every step's `step.run` for `request_logs` writes. Cause-chain walker (depth-capped at 8) lifts an `ApiError` code anywhere in the chain into `error_code` (not the outermost wrapper class); and lifts a `ZodError`'s issues (capped at 20, run through `sanitiseErrorMessage`) into `metadata.zod_issues`. Companion `withCronLog` for crons.
- **`validate-output` failure shape**: `NonRetriableError("llm_invalid_output") → ApiError("llm_invalid_output") → ZodError`. Inngest needs the NonRetriable to skip retries; the ApiError + ZodError chain feeds the cause-chain walker.
- **`acquire-slot`** returns `{ atFrontOfQueue, actualFrontId }`. Orchestrator re-fires `application/generate.requested` for `actualFrontId` if different. Inngest's per-user `concurrency: 1` dedupes re-fires. Watchdog Pass B is a backstop, not the primary cleanup.
- **`build-user-message`** emits `<master_cv>`, `<job_description>`, `<attempt_number>`, optional `<user_notes>`. No `<region>` tag — region detection happens inside the prompt. No XML escaping; the prompt's untrusted-data discipline neutralises injection.
- **Inngest v4 API**: `createFunction(opts)` with `triggers: [...]` inside the single options arg. Event-payload typing at the callsite via `DistilEvent` union exported from `inngest/client.ts`.
- **Inngest client dev-mode flag**: `inngest/client.ts` passes `isDev: process.env.NODE_ENV !== "production"` and only attaches `eventKey` in prod. Without this the SDK errors locally when `INNGEST_EVENT_KEY` is unset. `lib/env.ts` requires `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` only in production.

### SSE + API surface

- **SSE route** `/api/applications/[id]/events`: 15s comment heartbeat, 23s total stream bound (Vercel 25s floor), initial heartbeat fires immediately to flush response headers. Server supports `Last-Event-ID` replay via header + `?lastEventId=` query.
- **`withLogging` shape**: outer wrapper. Handler receives `(req, ctx)` where `ctx` is a small mutable handle (`ctx.user_id = ...`, `ctx.application_id = ...`) for the finally-block to write a complete `request_logs` row. `withIdempotency` is composed inside the handler so cache-hit replays still get a row.
- **`sanitiseErrorMessage`** strips emails, NZ + E.164 phones, runs of 20+ chars from `[A-Za-z0-9+/=_-]`; safe-lists canonical UUIDs (`application_id` / `request_id`). Truncates to 1000 chars after redaction.
- **`Idempotency-Key`** not auto-attached by `apiFetch`; only when caller passes `idempotencyKey`. Email button generates `email-{appId}-{Date.now()}` per click.
- **`queue_position`**: `max(queue_position) + 1` per user across all rows.
- **Download filename**: `{lastname}_{CV|CoverLetter}_{company_short}_{yyyymmdd}.docx`. `company_short` slugified to `[A-Za-z0-9_]`, capped at 24 chars. Source of truth: `lib/docx/filename.ts` (manual-email attachments use the same helper).
- **`runQualityScan`** is pure (returns `QualityWarning[]`); the `quality-scan` Inngest step writes warnings into step `request_logs.metadata`. Never blocks delivery. Banned-phrase array lives inline in `lib/quality/scan.ts` with a top-of-file comment pointing at the prompt §2.2.
- **`parse-pdf`** uses `Promise.race` against a 5s `setTimeout` rejection. Serverless invocations reap orphaned promises on completion.
- **`trackEvent`** stores `session_id` in `sessionStorage` with lazy init.

### Crons + watchdog

- **Watchdog (`*/15 * * * *`)** has two passes (see Generation Pipeline section).
- **Every terminal state transition sets `metadata_expires_at = now() + 1 year`**: finalize-success, finalize-insufficient, onFailure, both watchdog passes, abandon route.
- **`expire-metadata` cron** uses inline JS: list superseded master CVs, fetch referenced `master_cv_id` set via `applications`, delete the difference. Storage removed first; row delete only proceeds on storage success.
- **`is_demo = true` rows** are skipped by `expire-files` / `expire-metadata`.
- **Daily summary cron (`0 21 * * *` UTC = 09:00 NZT)**: Resend (if `RESEND_API_KEY` + `ADMIN_EMAIL` + `EMAIL_FROM_ADDRESS`) → Slack (if `SLACK_WEBHOOK_URL`) → no-op. Body includes window totals, status breakdown, top error code.
- **Operational — Supabase SQL Editor**: `auth.uid()` returns NULL (editor runs as `postgres`). One-off cleanup queries that filter `where user_id = auth.uid()` silently match zero rows. Filter by status / `started_at` / literal UUID instead.

### Auth + roles

- **Roles via `profiles.role TEXT`** (CHECK constraint `user | team | admin`) — replaces legacy `is_admin BOOLEAN`. Migration `0006_user_roles.sql` backfills + drops the flag. TEXT + CHECK chosen over PG enum so adding a future role (e.g. `pro`) is a CHECK alter, not an enum migration.
- **Single source of truth**: `lib/auth/roles.ts`. `Role` type, `ROLES` const, capability helpers (`isAdmin`, `isTeam`, `bypassesKillSwitch`, `bypassesDailyCostCeiling`, `canManageUsers`), presentation maps (`ROLE_LABELS`, `ROLE_TONES`, `ROLE_DESCRIPTIONS`).
- **`team`** bypasses kill switch + daily cost ceiling (operator cutoffs). Per-generation cost caps still apply.
- **`admin`** inherits team capabilities plus `/admin/*` access and user-role management.
- **Last-admin guard**: `setUserRole` server action refuses to drop the admin count to 0.
- **`requireAdmin()`** in `lib/auth/require-admin.ts` gates the admin layout once; `/api/admin/*` routes use the same helper.
- **TODO before public signups**: move admin off `app/(app)/admin/*` into its own `app/(admin)/` route group so consumer nav can never link to admin.

### UI + design system

- **Topbar (signed-in)**: `Distil` wordmark | `+ New application` primary CTA (or `Upload CV` if no master CV) | `History` | `Settings` (icon button, collapses Settings/Admin/Sign-out). Mobile-first: shell shrinks to 60px / px-4 below `sm:`; CTA labels hidden below `sm:` so the icon remains visible.
- **AuthAwareTopbar binding rule**: any page *outside* `(app)/` that serves both anonymous and signed-in visitors MUST use `<AuthAwareTopbar />`, not `<LandingTopbar />` directly. `LandingTopbar` is reserved for the landing page itself and the future Sign in / Sign up flow. Future Pricing / Terms / Privacy follow the same rule as `/faq`.
- **Theme**: dark default; light mode via `:root:not(.dark)` redefining the same brand tokens. **FOUC-prevention inline script in `<head>`** (must run before paint — do NOT swap to a `useEffect` ThemeBootstrap component; that flashes dark→light every load). View Transitions circular reveal on toggle, falls through to instant swap when unsupported and for `prefers-reduced-motion`.
- **Light palette**: pure-white `bg-dark3` cards on warm off-white canvas, lifted by shadow + warm-near-black border. `backdrop-filter` explicitly disabled in light mode. Linear / Vercel / Tailwind UI idiom. Tokens stay dark-named for migration sanity.
- **Design system primitives in `app/globals.css`** (single source of truth): `.eyebrow` / `.eyebrow-muted`, `.heading-display` (`text-4xl sm:text-6xl`), `.heading-section` (`text-3xl sm:text-4xl`), `.text-meta`, `.surface-card` (`p-6 sm:p-8`), `.surface-card-interactive`, `.surface-row`, `.panel` (no padding — for admin tables), `.btn-primary` / `.btn-secondary` / `.btn-disabled-shell` (`px-5 py-2.5 text-base`, ~40px tall), `.btn-ghost` (`px-4 py-2 text-base`, ~36px), `.btn-icon` (size-10, ~40px), `.btn-link-orange` (`text-base`), `.btn-pill` (chip pattern for "View all" / back-links), `.status-pill`.
- **Button calibration**: buttons sit at modern-app norms (text-base / 40px). The audit-pass-2 size overshoot was walked back; what stayed is the muted-foreground contrast lift to rgba(0.82) dark / `#3f3d36` light — the actual a11y fix.
- **Mobile responsiveness**: `sm:` breakpoints in the primitives layer, not per-surface overrides.
- **Motion layer**: `MotionProvider` (LazyMotion strict + reducedMotion="user") wraps the app at root. `PageTransition` inside `AppShell` cross-fades route changes. `MotionList` / `MotionListItem` / `MotionSection` replace `FadeUp` on `(app)` pages. `FadeUp` stays for landing / faq / `HistoryList` / `MissingFieldsBadge` / `BehindApplicationHover`. `AmbientParticles` + `ScrollIndicator` mount at body; both gated to ≥1024px and reduced-motion-aware.
- **Cursor + dots**: `CustomCursor` (dot + ring) and `MagneticDots` (cursor halo + cushioned dot field). Tuning constants documented inline in each file; do not re-document in CLAUDE.md.
- **PagedPreview is no longer in `SuccessView`**. CV and cover letter previews render in `max-h-[900px] overflow-y-auto` `PreviewPanel` with click-to-zoom `PreviewZoomModal`. The `PagedPreview` module stays in the codebase for future print views.
- **Brand band**: 6px brand-orange top stripe on both `CvPreview` and `CoverLetterPreview`; orange contact rule mirrored from CV (matches the DOCX `contactLine(text, withRule=true)` treatment).
- **`ApplicationLiveView`**: SSE + polling fallback, four-phase indicator with three independent rail segments between circles. No "did-you-know" carousel.
- **Guided error recovery**: `lib/errors/codes.ts` carries `recovery_kind` (`input_fixable | transient | non_recoverable | system_paused | no_recovery`), `recovery_headline`, `recovery_hint` per code. The error branch of `app/(app)/application/[id]/page.tsx` reads the latest `error_code` from `request_logs` via service-role, maps to the descriptor, and renders the matching `ErrorRecoverySection` (warn-tone for input-fixable with inline retry form; danger-tone "team alerted" for transient; muted for non-recoverable; info for system-paused). Raw error message in a collapsed `<details>`.
- **History/Dashboard chains**: `lib/applications/chains.ts` + `ChainCard` (server component, native `<details>`/`<summary>` per-attempt disclosure). Title is `${role_archetype} @ ${company_name}` when any descendant has structured output.

### DOCX rendering decisions

- **CV uses dense profile** (`SPACING_DENSE` + `SIZES_DENSE`) for every seniority. `getSpacingForSeniority` / `getSizesForSeniority` retain the `seniority` parameter as a future-flex hook but currently always return dense.
- **Cover letter** uses canonical `SIZES_COVER_LETTER` + `SPACING_COVER_LETTER` (expanded structural air). Helpers' canonical defaults stay `SPACING` / `SIZES` so any future caller keeps the looser profile.
- **Brand band + orange contact rule** on both DOCX docs via the shared `contactLine(text, withRule=true)` helper.
- **Education details** render inline-joined with " · "; not bullets.
- **Referees** as inline grey meta line; not a section heading.
- **Filename source of truth**: `lib/docx/filename.ts` (extracted so manual-email attachment names match the download route).

### Email (v1)

- **Recipient**: user's auth email only. No per-send recipient field.
- **Attachments**: real Resend `attachments: [...]`, base64-encoded DOCX bytes. ~30–80 KB each.
- **Trigger**: manual button on success view + optional auto-send via Inngest step. Auto-send reads `profiles.email_on_generation` (default false); swallows errors so application terminal state is independent of email outcome.
- **State**: `applications.last_emailed_at TIMESTAMPTZ`. SuccessView shows "Emailed X ago" muted line; `router.refresh()` after manual send pulls the new stamp.
- **Idempotency**: button generates `email-{appId}-{Date.now()}` per click.
- **Body**: plaintext + HTML multipart. `lib/email/templates.ts` `clean()` helper degrades gracefully on missing fields (no bracket placeholders, no empty values render).
- **Env vars**: `RESEND_API_KEY` + `EMAIL_FROM_ADDRESS`. Both optional; if either is absent at call time, throws `ApiError('email_send_failed')` (telemetry fires, toast surfaces failure).

### Sentry + monitoring

- **Runtime hook**: `instrumentation.ts` at repo root, dynamic-imports `sentry.server.config.ts` or `sentry.edge.config.ts` based on `NEXT_RUNTIME`. Browser config via `withSentryConfig` in `next.config.ts`. Re-exports `captureRequestError` (Sentry v10 name; v8 docs used `onRequestError`).
- **`withLogging`** reports 5xx ApiErrors only (4xx silent). `error_code` is a Sentry tag.
- **`checkCostCapPost`** captures a warning with `cost_cap_exceeded: 'true'` and `llm_model` tags whenever an actual call exceeds its model's full cap.
- **Three Sentry alerts** are dashboard-configured. Recipes at `docs/sentry-alerts.md`.
- **Inngest dev startup check**: 750ms ping to `/health` (default `http://localhost:8288`, override via `INNGEST_DEV`). Dev-only; logs success or a loud warning, never throws.

### Verification + smoke tests

- **Manual verification checklist**: `docs/manual-verification.md` (cover letter date / salutation / sign-off / banned phrases / story-led paragraph 2; CV profile length per seniority + no fabrication; fit assessment; "what we did").
- **End-to-end smoke test**: `docs/smoke-test.md` (happy path + insufficient_input retry + attempt-3 cap + queue cap + cost cap pre-check + kill switch + daily ceiling).
- **LLM output risks catalogue**: `docs/llm-output-risks.md` (16 risk classes). L1 + L3 shipped via `lib/llm/language-check.ts`. L5–L12 followups (repetition, markdown bleed, instruction-tag / injection / refusal rejects, JD-input tag hardening, truncation monitoring) ship if real failures surface.

---

## Open TODOs

- **Admin route-group split** — move `app/(app)/admin/*` to its own `app/(admin)/` route group before public signups, so consumer nav can never link to admin.
- **DeepSeek strict-mode tool** — beta endpoint supports `strict: true` on function tools. Defer to a separate preview-deployment test; current Zod safety net is sufficient.
- **DeepSeek thinking mode** — currently disabled. Re-enabling at low effort technically fits the 270s budget; deferred to post-prompt-ship quality data.
- **Language-drift followups** — L5 repetition / degenerate-decoding; L6 markdown emphasis bleed; L7 + L11 + L12 instruction-tag / injection / refusal rejects; L11 JD-input tag-block hardening; L10 truncation monitoring on `token_usage`.
- **`applications.region` column** — legacy / unused at the LLM boundary (region detection now happens in the prompt). Drop the column once we confirm no admin query references it.

---

## Quick Reference: Error Codes

Common codes (full catalogue in `lib/errors/codes.ts`; each entry carries `recovery_kind`,
`recovery_headline`, `recovery_hint`):

| Code | HTTP | recovery_kind | When |
|---|---|---|---|
| `invalid_request` | 400 | no_recovery | generic bad input |
| `master_cv_required` | 400 | no_recovery | no CV uploaded yet |
| `master_cv_too_large` | 400 | no_recovery | file > 3MB |
| `master_cv_parse_failed` | 400 | input_fixable | < 200 chars extracted |
| `jd_too_short` | 400 | input_fixable | JD below minimum length |
| `generation_too_large` | 400 | input_fixable | pre-call cost estimate exceeds model cap |
| `idempotency_key_conflict` | 409 | no_recovery | body hash mismatch on retry |
| `not_authenticated` | 401 | no_recovery | no session |
| `not_admin` | 403 | no_recovery | not an admin |
| `queue_full` | 409 | no_recovery | 3 items already in queue |
| `retry_limit_reached` | 409 | non_recoverable | attempt_number already 3 |
| `files_expired` | 410 | non_recoverable | 60-day file expiry passed |
| `internal_error` | 500 | transient | catch-all system error |
| `database_error` | 500 | transient | Supabase error |
| `storage_failed` | 500 | transient | Supabase Storage error |
| `rendering_failed` | 500 | transient | DOCX render failure |
| `email_send_failed` | 500 | no_recovery | Resend missing keys or rejection |
| `llm_failed` | 502 | transient | provider non-2xx |
| `llm_invalid_output` | 502 | input_fixable | bad tool output or Zod fail |
| `llm_language_drift` | 502 | transient | disallowed codepoints in output |
| `generation_disabled` | 503 | system_paused | `GENERATION_ENABLED=false` |
| `daily_cost_ceiling_reached` | 503 | non_recoverable | daily spend cap reached |
| `service_unavailable` | 503 | transient | upstream dependency down |

---

## Pricing Constants

**`claude-sonnet-4-6`** (verified 27 April 2026)
Input: $3.00 / MTok · Output: $15.00 / MTok · Cache write 5-min: $3.75 / MTok · Cache write 1-hr: $6.00 / MTok · Cache read: $0.30 / MTok · Web search: $0.01 / call

**`deepseek-v4-pro`** (verified 2 May 2026)
Input cache-miss: $1.74 / MTok · Output: $3.48 / MTok · Cache write: $0 (automatic, not separately billed) · Cache read (cache-hit): $0.145 / MTok

**`deepseek-v4-flash`** (verified 2 May 2026)
Input cache-miss: $0.14 / MTok · Output: $0.28 / MTok · Cache write: $0 · Cache read (cache-hit): $0.028 / MTok

**Tavily Search** (DeepSeek path web search)
Basic depth: $0.008 / call

**Per-generation cost caps** (model-keyed in `COST_CAPS_BY_MODEL`):
- Anthropic: $0.50 pre / $1.00 post
- DeepSeek-Pro: $0.30 pre / $0.20 post
- DeepSeek-Flash: $0.05 pre / $0.03 post

**Daily ceiling default**: $10.00 (`DAILY_COST_CEILING_USD` env var)
