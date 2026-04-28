# Project Handoff: Job Application Tailoring Service (v8)

This document is the single, self-contained handoff at the end of conversation 6. It consolidates and supersedes v2, v3, v4, v5, v6, and v7. The only companion file you need going forward is:

- `system_prompt_v2.md`: the LLM system prompt the backend will send on every generation.

If you are picking this project up in a fresh conversation, drop these two files into your project files and you have everything needed to begin building.

---

## 1. What Has Been Decided So Far

The project has been worked through five planning conversations. The cumulative output:

- **Conversation 1 (v2):** foundation. Problem definition, target user, scope. Stack locked. System prompt v1 written and tested mentally. NZ region rules locked.
- **Conversation 2 (v3):** user journey mapped screen-by-screen. DOCX templates fully specified. Architecture begun: repo structure, database schema, storage buckets.
- **Conversation 3 (v4):** architecture finished. Auth, API routes, generation pipeline, error handling, background jobs, telemetry. Plus build-readiness work: env vars, repo layout, pricing constants, error code catalogue, telemetry event catalogue, Zod output schema, DOCX template definitions.
- **Conversation 4 (v6):** demo sustainability layer added. Per-generation cost cap, output quality scanner, Sentry alerts, minimal admin panel ahead of full UI build, PDF parse hardening, SSE polling fallback, system prompt versioning, plus three substantive new features: server-side date enforcement, in-app preview component, and email-the-files-to-the-user flow. System prompt upgraded to v2 with seniority calibration, sentence variety rule, "could anyone write this" test, NZ-research-backed structural improvements, and storytelling-led cover letter paragraph 2.
- **Conversation 5 (v7):** internal-demo prioritisation pass. Sustainability layer reranked into a clear "must-have / cheap-insurance / skip" hierarchy for internal-only use. Four additions: kill switch env var, daily cost ceiling, manual verification process for first three real generations, daily summary email to admin (pulled forward from open questions). Email-to-user feature deprioritised: spec stays intact in section 6.11 but build sequence pushes it past the internal demo milestone. No architectural changes; this is a build-priority and risk-management refinement.
- **Conversation 6 (v8):** brand and visual design layer added. Curiosum Brand Master v1.1 integrated as the single source of truth for the web app UI, the email template, and any Curiosum-owned surfaces. New Section 12 holds the full design system (colour tokens, typography, components, layout). Open Question 4 (visual design) is resolved. Two important boundaries established: (a) the web app UI uses the brand dark theme; (b) the user's CV and cover letter DOCX files remain ATS-optimised and Curiosum-unbranded, because they are the user's professional documents, not Curiosum deliverables. DOCX font choice (Calibri vs DM Sans) is explicitly resolved in favour of Calibri for ATS safety, with rationale recorded. Email template restyled per the Curiosum signature standard. Domain references updated from placeholder to curiosum.ai. No changes to architecture, schema, error codes, or build sequence beyond a single new step (Tailwind brand token setup) folded into the existing project scaffold.

The architecture phase is complete. The next conversation begins build mode.

---

## 2. Stack

| Layer | Choice |
|---|---|
| Frontend + Backend | Next.js (TypeScript), App Router |
| UI components | shadcn/ui |
| Hosting | Vercel |
| Database + Auth + Storage | Supabase (Postgres + email/password for now + private buckets) |
| LLM | Claude Sonnet 4.6 (`claude-sonnet-4-6`) with web search and structured output |
| Background jobs | Inngest |
| DOCX rendering | `docx` npm package, server-side templates in code |
| PDF parsing | `unpdf` (serverless-safe, zero native deps) |
| DOCX parsing | `mammoth` |
| Email delivery | Resend |
| Date handling | `date-fns-tz` |
| Error tracking | Sentry |
| Validation | Zod |
| Telemetry | Supabase table for v1, PostHog candidate for v2 |

---

## 3. End-to-End Pipeline

1. Admin signs in via email + password.
2. Admin uploads master CV (PDF or DOCX, under 3MB) via `POST /api/master-cv`. Versioned: any existing CV is marked superseded. Parsing happens at upload time using `unpdf` (PDF) or `mammoth` (DOCX), with hard timeout and minimum-text checks.
3. Admin submits an application by pasting a JD plus optional notes. `POST /api/applications` validates, snapshots `master_cv_id`, enforces queue cap, inserts a row with status `queued`, fires an Inngest event.
4. The `generateApplication` Inngest function runs, gated by an acquire-slot step (FIFO per user, cap of 1 concurrent enforced by Inngest).
5. When the application reaches the front of the queue, status moves to `running`, the per-generation cost cap is checked, then a single LLM call runs with web search + structured output. The result is validated (Zod + ATS keyword refinement), the date is injected server-side, a quality scan runs, and the function branches:
   - **Success:** render docs, upload to `generated` bucket, status moves to `success`, set `files_expire_at` and `metadata_expires_at`.
   - **Insufficient_input:** status moves to `insufficient_input`, store the reason, pause any queued items for this user.
   - **Error:** `onFailure` or watchdog marks status `error`, resumes paused queue items.
6. After any terminal state, the `application/generation.completed` event fires `triggerNextInQueue`, which finds and triggers the next queued application.
7. Frontend renders one of: Screen 8 (success, with View / Download / Email actions), Screen 9 (insufficient_input attempts 1 or 2), Screen 10 (insufficient_input attempt 3), Screen 12 (error).
8. On Screen 8, the user can view the CV and cover letter rendered as styled React components reading directly from `applications.llm_response_json`. They can download the DOCX files via signed URLs, or enter their email address and have the documents sent as attachments via Resend (sender: Curiosum).

---

## 4. User Journey Decisions

**Returning users:** master CV is reused by default with an option to replace.

**History:** every generation is logged. The user can re-download files for **60 days**. Metadata (role, company, date, fit score) stays for **1 year** after generation, then the row is deleted.

**Master CV retention:** persists until the user replaces it or deletes the account. Not on the 60-day timer.

**Mid-generation browser close:** generation continues server-side. The user returns to the dashboard and sees the result waiting.

**Concurrent applications:** queued (FIFO), capped at 3 total (1 generating + 2 queued). Above that, blocked at submit time with a polite modal.

**Cancel during generation:** none in v1. Cost is committed once the API call fires.

**Mobile:** usable on mobile but not optimised. Desktop-first.

**Insufficient_input + queue interaction:** if A returns insufficient_input while B is queued, B is **paused**. The user must resolve A (retry, abandon, or hit attempt 3 with the explicit "continue with queued applications" button) before B resumes.

**Master CV snapshot rule:** when a user clicks Generate, a snapshot reference to the current master CV is recorded. If the user replaces the master CV while B is queued, B still uses the snapshotted CV. UX includes a small notice in the replace flow ("You have N applications queued. They will continue using your previous CV.").

**Insufficient_input retry with new CV:** Screen 9 includes a "Use my new master CV for this retry?" toggle, defaulting to off.

**Delete account:** cancels everything immediately (in-flight + queued), eats any in-flight Anthropic cost. Confirmation modal copy mentions this.

**Retry chain semantics (locked in v6):** when a user retries an `insufficient_input` application, a new applications row is created with `parent_application_id` linking back. The parent's status, `metadata_expires_at`, and `files_expire_at` are all unchanged. Each row in a chain has its own independent expiry timers. The History page renders the chain flat, with a small "Retry of [date]" subtitle on rows that have a `parent_application_id`. Chain depth is hard-capped at 3 by the `attempt_number` field. When the user clicks "continue with queued applications" on Screen 10 (attempt 3 hit), this is an abandon of the parent, not a retry; no new row is created.

**Queued-state route behaviour:** the same `application/[id]/page.tsx` handles all post-submit states. When status is `queued` or `paused`, the page renders a "Queued, position N of M" view with the application's submitted JD and notes shown read-only.

**Other low-impact decisions:** 60-day file expiry clock starts at completion timestamp. 1-year metadata expiry clock starts at completion timestamp. Drop the parsed-text preview on the CV upload screen. Keep CV soft-warning at 100 words and JD soft-warning at 150 words.

---

## 5. DOCX Template Decisions

### 5.1 Library and Page

**v8 note on brand alignment:** the user's CV and cover letter DOCX files are deliberately **not** Curiosum-branded. They are the user's professional documents going to a third-party employer. Adding Curiosum headers, footers, orange rules, or the Curiosum tagline to the user's CV would be (a) inappropriate (it's not Curiosum's document), and (b) bad for ATS parsing. The brand standards (Section 12) apply to the **web app UI**, the **email template**, and any **Curiosum-owned surfaces** (e.g. internal admin dashboards, login page). The DOCX templates below remain ATS-first. See Section 11 (final paragraph) for the full reasoning.

**Library:** `docx` npm package (dolan-miu version), not docxtemplater. Templates built in code.

**Page setup:** A4, 20mm margins all sides, single column, no header/footer.

**Font:** Calibri throughout. Body 11pt. H1 (name) 18pt. H2 (sections) 12pt bold ALL CAPS.

**Heading hierarchy (flatter, ATS-safer):**
- H1: candidate name only, top of CV.
- H2: section headings (PROFILE, TECHNICAL SKILLS, etc.).
- Role titles, project names, education entries: regular paragraph with bold styling. NOT a heading style.

**Bullets:** round dot via Word's List Bullet style. Hanging indent 0.4cm, indent 0.4cm.

**Date format:**
- CV roles and education: "Apr 2024 to Present" (three-letter month abbreviation, word "to" between dates).
- Cover letter date line: "26 April 2026" (NZ format, full month name). The system fills this; the LLM outputs `{{TODAY}}` as a placeholder per system prompt section 5.2.

**Hyperlinks:** plain text everywhere. Email and LinkedIn rendered as text, not clickable.

**Line spacing:** 1.15 throughout body text. 4pt space after each bullet.

**Alignment:** left-aligned everywhere. No justified text.

**Page breaks:** "keep with next" on role title and project name paragraphs.

**Pipe separator:** the renderer filters empty values before joining with " | " to avoid stray pipes.

**Empty section handling:** if `key_projects`, `leadership_and_interests`, or `technical_skills` arrays are empty, omit the entire section including the heading.

**Recipient block (cover letter):** if `company_address` is null, omit that line. If `company_name` is empty, omit that line. Always at least the recipient_line.

**Sender block (cover letter):** Name (bold 11pt), Location (11pt), Phone | Email | LinkedIn (11pt).

**Sign-off:** "Nga mihi," then empty paragraph then full name. Renderer splits on `\n`.

### 5.2 Shared Style Constants

For `lib/docx/styles.ts`:

```typescript
export const FONTS = {
  body: 'Calibri',
  heading: 'Calibri',
} as const;

export const SIZES = {
  // docx package expects half-points, so 22 = 11pt
  body: 22,                  // 11pt
  small: 20,                 // 10pt
  contact_line: 20,          // 10pt
  section_heading: 26,       // 13pt
  name_heading: 36,          // 18pt
} as const;

export const COLOURS = {
  black: '000000',
  dark_grey: '333333',
  medium_grey: '666666',
  rule: 'BFBFBF',
} as const;

export const SPACING = {
  // docx expects twips, 240 = 12pt
  paragraph_after: 120,      // 6pt
  section_after: 240,        // 12pt
  heading_before: 240,
  heading_after: 80,
  bullet_indent: 360,        // 0.25 inch
} as const;

export const PAGE = {
  // A4 in twips: 11906 x 16838
  width: 11906,
  height: 16838,
  margin_top: 1134,          // 2cm
  margin_bottom: 1134,
  margin_left: 1134,
  margin_right: 1134,
} as const;
```

### 5.3 CV Layout

One document, single column, no tables, no text boxes (ATS-friendly per system prompt sections 2.6 and 8.2). Section order matches system prompt 4.1:

1. **Name block.** Full name, 18pt bold, left-aligned.
2. **Contact line.** One paragraph, 10pt, dark grey. Pipe-separated: `Location | Email | Phone | LinkedIn`. Plus a second line: `Work Rights: ... | Availability: ...`.
3. **Horizontal rule.** Bottom border on the contact paragraph, light grey.
4. **Profile.** Heading, then a single paragraph.
5. **Technical Skills.** Heading, then for each group, a paragraph of the form `Category: skill, skill, skill`. Bold the category prefix.
6. **Professional Experience.** Heading, then for each role: first line `Role Title, Company` bold; second line `Location | Start Date to End Date` in 10pt grey; bullets, 11pt, indented 0.25 inch.
7. **Key Projects.** Heading, then for each project: first line `Project Name` bold then ` | ` then `Context` in italics; bullets; final line `Technologies: comma-separated list` in 10pt grey.
8. **Education.** Heading, then for each item: first line `Qualification, Institution` bold; second line `Location | Dates` in 10pt grey; detail bullets if present.
9. **Leadership and Interests.** Heading, then for each item: `Title: Description` as a single paragraph.
10. **Referees.** Heading, then a single paragraph with the referees string.

Section headings: 13pt, bold, all caps, slight letter spacing, bottom border.

### 5.4 Cover Letter Layout

One document, single column, four paragraphs.

1. **Sender block** (top-left for ATS friendliness): name bold, then phone, email, linkedin, location stacked, 10pt.
2. **Date** on its own line, 11pt, with paragraph space below. Filled by the system, not by the LLM.
3. **Recipient block.** Recipient line, company name, company address (if non-null), each on its own line, 11pt.
4. **Salutation.** 11pt, with paragraph space after.
5. **Body paragraphs.** Each from `cover_letter_content.paragraphs`, 11pt, full justification, paragraph space after.
6. **Sign-off.** Each line of `signoff` rendered as a paragraph, 11pt. The string contains `\n` already.

### 5.5 File Structure for Templates

- `lib/docx/styles.ts` (shared style constants, above)
- `lib/docx/helpers.ts` (helpers: `heading(text)`, `bullet(text)`, `contactLine(parts)`, `roleHeader(...)` to keep the render functions readable)
- `lib/docx/render-cv.ts` (`renderCV(content): Buffer`)
- `lib/docx/render-cover-letter.ts` (`renderCoverLetter(content): Buffer`)

All pure: JSON in, Buffer out. Caller handles storage.

**Implementation notes:**
- The Inngest `render-docs` step calls them and passes the buffer to `upload-files`.
- Filenames are set by the API `download` route, not by the renderer: `{candidate_lastname}_CV_{company_short}_{yyyymmdd}.docx` and `{candidate_lastname}_CoverLetter_{company_short}_{yyyymmdd}.docx`.
- For ATS friendliness, no headers, no footers, no page numbers in either document.

---

## 6. Architecture

### 6.1 Repo Structure

```
.
├── app/                              # Next.js App Router
│   ├── (auth)/
│   │   └── login/
│   │       ├── page.tsx
│   │       └── actions.ts            # signIn server action
│   ├── (app)/                        # authenticated routes group
│   │   ├── dashboard/page.tsx
│   │   ├── upload/page.tsx
│   │   ├── application/
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── history/page.tsx
│   │   ├── settings/page.tsx
│   │   └── admin/
│   │       ├── usage/page.tsx
│   │       ├── logs/page.tsx
│   │       └── telemetry/page.tsx
│   ├── api/
│   │   ├── master-cv/route.ts
│   │   ├── applications/
│   │   │   ├── route.ts              # POST (submit)
│   │   │   └── [id]/
│   │   │       ├── events/route.ts   # GET SSE
│   │   │       ├── download/[kind]/route.ts
│   │   │       ├── email/route.ts    # POST (email files to user)
│   │   │       ├── retry/route.ts
│   │   │       └── abandon/route.ts
│   │   ├── inngest/route.ts          # Inngest webhook
│   │   ├── telemetry/route.ts
│   │   └── admin/
│   │       ├── usage/route.ts
│   │       ├── logs/route.ts
│   │       └── telemetry/route.ts
│   ├── layout.tsx
│   ├── globals.css
│   └── not-found.tsx
├── components/
│   ├── ui/                           # shadcn primitives, copied in
│   ├── upload/
│   ├── application/
│   │   ├── CvPreview.tsx             # styled React preview from JSON
│   │   └── CoverLetterPreview.tsx    # styled React preview from JSON
│   ├── history/
│   └── admin/
├── lib/
│   ├── supabase/
│   │   ├── browser.ts
│   │   ├── server.ts
│   │   ├── service.ts
│   │   └── middleware.ts             # session refresh helper
│   ├── anthropic/
│   │   ├── client.ts                 # SDK wrapper, logs token usage, cost cap
│   │   ├── pricing.ts                # cost constants
│   │   ├── tool-schema.ts            # zod-to-json-schema bridge
│   │   └── cost-cap.ts               # per-generation cap check
│   ├── llm/
│   │   ├── build-user-message.ts
│   │   └── output-schema.ts          # the Zod ApplicationOutputSchema
│   ├── parsing/
│   │   ├── parse-pdf.ts              # unpdf wrapper with timeout
│   │   └── parse-docx.ts             # mammoth wrapper
│   ├── docx/
│   │   ├── render-cv.ts
│   │   ├── render-cover-letter.ts
│   │   ├── styles.ts                 # shared font/spacing constants
│   │   └── helpers.ts
│   ├── email/
│   │   ├── client.ts                 # Resend wrapper
│   │   └── templates.ts              # plain-text email template
│   ├── quality/
│   │   └── scan.ts                   # output quality scanner
│   ├── errors/
│   │   ├── codes.ts                  # ERROR_CODES const
│   │   ├── api-error.ts              # ApiError class
│   │   ├── sanitise.ts
│   │   └── client.ts                 # frontend mapping helpers
│   ├── logging/
│   │   └── with-logging.ts
│   ├── idempotency/
│   │   └── with-idempotency.ts
│   ├── telemetry/
│   │   ├── events.ts                 # TelemetryEventMap
│   │   ├── emit.ts                   # server-side emitTelemetry
│   │   └── track.ts                  # client-side trackEvent
│   ├── client/
│   │   ├── api-fetch.ts              # browser to API wrapper
│   │   └── handle-error.ts
│   ├── env.ts                        # zod-validated env reader
│   ├── design/
│   │   └── tokens.ts                 # brand tokens re-exported for TS use (v8)
│   └── utils.ts                      # cn(), tailwind-merge, etc
├── inngest/
│   ├── client.ts
│   ├── functions/
│   │   ├── generate-application.ts
│   │   ├── trigger-next-in-queue.ts
│   │   ├── expire-files.ts
│   │   ├── expire-metadata.ts
│   │   ├── sweep-request-logs.ts
│   │   ├── sweep-idempotency-keys.ts
│   │   └── watchdog-stuck-applications.ts
│   └── steps/                        # reusable step helpers
│       ├── acquire-slot.ts
│       ├── load-context.ts
│       ├── inject-date.ts            # server-side date override
│       ├── render-and-upload.ts
│       └── finalize.ts
├── prompts/
│   └── system-prompt-v2.md           # copy of project file
├── supabase/
│   └── migrations/
│       └── 0001_initial.sql          # consolidated schema
├── middleware.ts                     # session refresh, route gating
├── sentry.client.config.ts
├── sentry.server.config.ts
├── sentry.edge.config.ts
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── .env.example
```

Key points about this layout:

- Route groups `(auth)` and `(app)` exist purely to share layouts and gating logic. They don't show up in URLs.
- A single page component handles Screens 8/9/10/12 plus the queued state (`app/(app)/application/[id]/page.tsx`) branching on application status.
- `lib/llm/output-schema.ts` is the single source of truth. The Anthropic tool definition is generated from it. The Inngest validation step runs against it. Frontend types come from the same file via `z.infer`.
- `prompts/system-prompt-v2.md` is loaded at module scope, not per call, so the file read cost is paid once per cold start.
- New v6 directories: `lib/parsing/` (PDF + DOCX parsing), `lib/email/` (Resend wrapper + template), `lib/quality/` (output quality scanner). New v6 step: `inngest/steps/inject-date.ts` (server-side date override).
- New v6 components: `CvPreview.tsx` and `CoverLetterPreview.tsx` render the application's `llm_response_json` as styled React, used on Screen 8.
- New v8 module: `lib/design/tokens.ts` exports the Curiosum brand tokens (colours, spacing, font stacks) as TypeScript constants for any component code that needs token values outside Tailwind classes (e.g. the DOCX renderer's accent colour, Resend HTML email styling). Tailwind config (`tailwind.config.ts`) wires the same tokens as theme extensions so Tailwind classes like `bg-dark2`, `text-text`, `border-border` work natively. See Section 12 for the full token list.

### 6.2 Database Schema

**Core tables:**
- `profiles`: mirrors `auth.users`, has `is_admin boolean` for v1.
- `master_cvs`: versioned with `superseded_at`/`superseded_by`, partial index for current.
- `applications`: central table. Status enum with all 9 states. `master_cv_id` FK enforces snapshot rule. `inngest_run_id` for cancellation. `files_expire_at` and `metadata_expires_at` for cron sweeps. `llm_response_json` as JSONB blob. `parent_application_id` for retry chains. **New in v6:** `system_prompt_version`, `is_demo`, `email_send_count`.
- `generation_events`: append-only phase log, drives SSE stream and replay-on-reconnect.
- `account_deletions`: audit trail, hashed email only, no PII.

**Operational tables:**
- `request_logs`: every API route call and Inngest step. 30-day retention.
- `token_usage`: every Anthropic API call with cost computed at insert time. Kept forever.
- `idempotency_keys`: 10-minute TTL on `POST /api/applications`.
- `telemetry_events`: 30-day retention, swept with `request_logs`.

**Status enum:** `queued`, `paused`, `running`, `rendering`, `success`, `insufficient_input`, `abandoned`, `error`, `cancelled`.

**Queue ordering:** lives in `applications.queue_position`. No separate queue table. FIFO ordering within `(user_id, queue_position ASC)` filtered to status in queued/paused.

**RLS policies:** every user-facing table is RLS-enabled, users see only their own rows. Admin tables (`request_logs`, `token_usage`, `telemetry_events`) are admin-read-only. Inngest functions use the service-role key to bypass.

**Consolidated migration SQL** for `supabase/migrations/0001_initial.sql`:

```sql
-- ===== Profiles =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  is_admin boolean not null default false
);
alter table public.profiles enable row level security;
create policy "profiles_self_read" on public.profiles for select using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, created_at) values (new.id, now())
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== Master CVs =====
create table public.master_cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  file_size_bytes integer not null,
  parsed_text text,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by uuid references public.master_cvs(id)
);
create unique index master_cvs_one_current_per_user
  on public.master_cvs (user_id) where superseded_at is null;
create index master_cvs_superseded_at_idx
  on public.master_cvs (superseded_at) where superseded_at is not null;
alter table public.master_cvs enable row level security;
create policy "master_cvs_owner_all" on public.master_cvs
  for all using (auth.uid() = user_id);

-- ===== Applications =====
create type public.application_status as enum (
  'queued', 'paused', 'running', 'rendering',
  'success', 'insufficient_input', 'abandoned', 'error', 'cancelled'
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  master_cv_id uuid not null references public.master_cvs(id),
  parent_application_id uuid references public.applications(id),
  job_description text not null,
  user_notes text,
  region text not null default 'NZ',
  attempt_number integer not null default 1,
  status public.application_status not null default 'queued',
  queue_position integer not null,
  inngest_run_id text,
  llm_response_json jsonb,
  insufficient_input_reason text,
  error_message text,
  cv_storage_path text,
  letter_storage_path text,
  files_expire_at timestamptz,
  metadata_expires_at timestamptz,
  files_deleted_at timestamptz,
  abandoned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  -- v6 additions:
  system_prompt_version text not null default 'v2',
  is_demo boolean not null default false,
  email_send_count integer not null default 0
);
create index applications_user_id_idx on public.applications (user_id);
create index applications_status_idx on public.applications (status);
create index applications_queue_idx
  on public.applications (user_id, queue_position)
  where status in ('queued', 'paused');
create index applications_files_expiry_idx
  on public.applications (files_expire_at)
  where files_deleted_at is null and status = 'success' and is_demo = false;
create index applications_metadata_expiry_idx
  on public.applications (metadata_expires_at) where is_demo = false;
create index applications_stuck_idx
  on public.applications (started_at) where status = 'running';
alter table public.applications enable row level security;
create policy "applications_owner_all" on public.applications
  for all using (auth.uid() = user_id);

-- ===== Generation Events =====
create table public.generation_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  application_id uuid not null references public.applications(id) on delete cascade,
  phase text not null,
  payload jsonb
);
create index generation_events_application_id_idx
  on public.generation_events (application_id, created_at);
alter table public.generation_events enable row level security;
create policy "generation_events_owner_read" on public.generation_events for select using (
  exists (
    select 1 from public.applications a
    where a.id = generation_events.application_id and a.user_id = auth.uid()
  )
);

-- ===== Account Deletions =====
create table public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  hashed_email text not null,
  deleted_at timestamptz not null default now(),
  reason text
);
alter table public.account_deletions enable row level security;
-- no public policies; admin-only via service role

-- ===== Request Logs =====
create table public.request_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  source text not null check (source in ('api_route', 'inngest_step', 'cron')),
  name text not null,
  duration_ms integer not null,
  status text not null check (status in ('ok', 'error')),
  error_code text,
  error_message text,
  metadata jsonb
);
create index request_logs_created_at_idx on public.request_logs (created_at desc);
create index request_logs_user_id_idx on public.request_logs (user_id);
create index request_logs_application_id_idx on public.request_logs (application_id);
create index request_logs_status_idx on public.request_logs (status) where status = 'error';
alter table public.request_logs enable row level security;
create policy "request_logs_admin_read" on public.request_logs for select using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

-- ===== Token Usage =====
create table public.token_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  web_search_count integer not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  metadata jsonb
);
create index token_usage_created_at_idx on public.token_usage (created_at desc);
create index token_usage_user_id_idx on public.token_usage (user_id);
create index token_usage_application_id_idx on public.token_usage (application_id);
alter table public.token_usage enable row level security;
create policy "token_usage_admin_read" on public.token_usage for select using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

-- ===== Idempotency Keys =====
create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  route text not null,
  request_hash text not null,
  response_status integer not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  unique (user_id, key, route)
);
create index idempotency_keys_expires_at_idx on public.idempotency_keys (expires_at);
alter table public.idempotency_keys enable row level security;
-- no public policies; service-role only

-- ===== Telemetry Events =====
create table public.telemetry_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  request_id uuid,
  session_id text,
  name text not null,
  properties jsonb
);
create index telemetry_events_created_at_idx on public.telemetry_events (created_at desc);
create index telemetry_events_name_idx on public.telemetry_events (name);
create index telemetry_events_user_id_idx on public.telemetry_events (user_id);
create index telemetry_events_application_id_idx on public.telemetry_events (application_id);
create index telemetry_events_request_id_idx on public.telemetry_events (request_id);
alter table public.telemetry_events enable row level security;
create policy "telemetry_admin_read" on public.telemetry_events for select using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);
```

### 6.3 Storage

**Two private buckets:** `master-cvs` and `generated`.

**Path patterns:**
- `master-cvs/{user_id}/{master_cv_id}.{ext}`
- `generated/{user_id}/{application_id}/cv.docx`
- `generated/{user_id}/{application_id}/letter.docx`

**RLS** via `storage.foldername(name)[1] = auth.uid()::text`.

**Downloads** served via signed URLs (60s expiry) generated on demand by the API route.

**Master CV uploads** go through the API route (parse + validate + atomic DB insert), not direct browser-to-storage.

**File lifecycle:**
- 60-day file expiry runs as a daily Inngest cron (skips rows where `is_demo = true`).
- 1-year metadata expiry runs as a daily Inngest cron (skips rows where `is_demo = true`).
- Orphaned master CV cleanup runs alongside the metadata cron.
- Rare race condition between expiry-mid-download is acceptable for v1 (user just clicks again, sees expired state).

### 6.4 Auth (Admin-Only For v1)

**Reasoning:** v1 has a single admin user. Email + password keeps RLS and session machinery identical to the eventual magic link version. Swap is a one-file change plus a Supabase toggle when ready.

**Supabase auth config:**
- Email provider on, password sign-in only.
- Confirm email: off (admin user pre-confirmed).
- Allow signups: off (one user only).
- Site URL and redirect URLs configured per environment.

**Admin user:** created manually via Supabase dashboard. Auto-confirmed. **Important:** after creating the auth user, run `UPDATE public.profiles SET is_admin = true WHERE id = '<admin_user_id>';` because the trigger creates the profile row with `is_admin = false` by default.

**Three Supabase clients:**
- `lib/supabase/browser.ts`: browser client, anon key, used in client components.
- `lib/supabase/server.ts`: server client, anon key, honours RLS, used in Server Components, route handlers, Server Actions.
- `lib/supabase/service.ts`: service-role client, bypasses RLS, used **only** in Inngest functions and crons. Never imported into anything that runs in browser.

**Middleware:** refreshes session via `supabase.auth.getUser()`, redirects unauthenticated users from `/dashboard|/application|/upload|/history|/settings` to `/login`, redirects authenticated users away from `/login`. Matcher excludes static assets.

**Login flow:** `/login` page renders a client form, submit goes through Server Action `signIn(formData)`, calls `signInWithPassword`, redirects to `/dashboard` on success. Generic error message on failure (no user enumeration).

**Sign-out:** Server Action calling `supabase.auth.signOut()` then redirect to `/login`.

**Reading current user in server code:** always `getUser()`, never `getSession()` (the former validates the JWT against Supabase, the latter just reads cookies which can be tampered with).

**`is_admin` boolean on `profiles`:** added now, defaults false, manually true for the admin user. Used to gate the admin panel. Ready for the day signups open.

**Deferred to magic-link work:**
- Replace `signInWithPassword` with `signInWithOtp`.
- Add `/auth/callback` route for code exchange.
- Re-enable signups in Supabase dashboard.
- Build account deletion flow (cancel Inngest runs, hash email, write `account_deletions`, etc.).
- Email change flow.

### 6.5 API Routes

**Surface (10 routes plus telemetry pair):**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/master-cv` | Upload or replace master CV |
| POST | `/api/applications` | Submit a new application |
| GET | `/api/applications/[id]/events` | SSE stream of generation phases |
| GET | `/api/applications/[id]/download/[kind]` | Signed-URL redirect for cv or letter |
| POST | `/api/applications/[id]/email` | Send DOCX files to user-supplied email (v6) |
| POST | `/api/applications/[id]/retry` | Retry an insufficient_input application |
| POST | `/api/applications/[id]/abandon` | Abandon an insufficient_input application |
| POST | `/api/inngest` | Inngest webhook (handled by SDK) |
| POST | `/api/telemetry` | Client telemetry batch ingestion |
| GET | `/api/admin/usage` | Admin: token usage summary |
| GET | `/api/admin/logs` | Admin: recent request logs |
| GET | `/api/admin/telemetry` | Admin: telemetry summary |

**Conventions:**
- JSON bodies, validated with Zod at the route boundary.
- Success: raw JSON, 200/201/202.
- Error envelope: `{ error: { code, message, details? } }`.
- Auth via `createClient()` server-side, `supabase.auth.getUser()`.
- Every route wrapped in `withLogging(name, handler)`.

**Server Actions vs API routes split:** Server Actions for purely user-driven mutations (signin, signout). API routes for anything that needs a typed JSON response, idempotency, or interaction with Inngest.

**Idempotency on `POST /api/applications`:** optional `Idempotency-Key` header (UUID), 10-minute TTL, replay returns cached response. Body hash protects against key reuse with different payloads. See 6.7.

**Snapshot rule on submit:** `master_cv_id` recorded on the application row. Replacing the master CV later doesn't affect already-queued applications.

**Queue cap of 3:** enforced at submit time by counting rows with status in (queued, paused, running, rendering). Returns 409 `queue_full` if at cap.

**Master CV upload route specifics (v6 hardening):**
- Body: `multipart/form-data` with file field
- Server validates file size (under 3MB), MIME type (PDF or DOCX)
- Parses with `unpdf` (PDF) or `mammoth` (DOCX), wrapped in 5-second timeout
- Validates extracted text length (minimum 200 chars, returns `master_cv_parse_failed` otherwise)
- Stores file in storage bucket; stores parsed text in `master_cvs.parsed_text`
- Atomic: if any step fails, the whole upload is rolled back

**Retry route specifics:**
- Only valid for `attempt_number` 1 or 2.
- Body: `{ job_description?, user_notes?, use_new_master_cv? }`. All optional. Pure resubmit allowed.
- Creates a new applications row with `parent_application_id` linking back. Parent's status, expiries, and other fields are unchanged.
- Resumes any paused queue items for the user.

**Abandon route specifics:**
- Marks application `abandoned`, sets `abandoned_at`, sets `metadata_expires_at = now() + 1 year` if not already set.
- Resumes paused queue items.
- Used for both Screen 9 (attempts 1/2) and Screen 10 (attempt 3 explicit "continue queue" button).

**Download route specifics:**
- Generates signed URL (60s expiry) and 302 redirects.
- 410 Gone if `files_expire_at` past.

**Email route specifics (v6):**
- Body: `{ recipient_email: string }`. Required. Validated as a real email format via Zod.
- Verifies user owns the application, status is `success`, and `email_send_count < 5`.
- Fetches both DOCX buffers from Supabase storage.
- Calls Resend with the plain-text template (see 6.11), Curiosum as sender display name.
- Increments `email_send_count` on the application row.
- Logs `email.send.attempted`, `email.send.succeeded` or `email.send.failed` telemetry.
- Returns `{ success: true }` on success, `email_send_failed` (502) or `email_limit_reached` (409) on failure.

### 6.6 Generation Pipeline

**Inngest is the runtime.** Two functions:

**`generateApplication`:** triggered by `application/generate.requested` event. Concurrency `key: event.data.user_id, limit: 1`. Function-level retries: 2. `onFailure` handler marks application errored. Steps:

1. `acquire-slot`: DB read, exits cleanly if not at front of user's queue.
2. `load-context`: load master CV text + application row.
3. `mark-running`: status -> `running`, write `llm_started` event.
4. `cost-cap-check`: estimate input cost from message size, throw `generation_too_large` if over half the cap (USD 0.50).
5. `call-llm`: **retries: 0**. Goes through `lib/anthropic/client.ts` wrapper which logs token usage at SDK boundary. **Loads `prompts/system-prompt-v2.md`** (the version pinned via `applications.system_prompt_version`).
6. `cost-cap-postcheck`: compute actual cost, log `cost_cap_exceeded` warning to `request_logs` if over USD 1.00 (does not fail the run, money already spent).
7. `validate-output`: Zod parse with the ATS keyword refinement (must match >=60% of `ats_keywords` in CV body). Throws on failure.
8. `inject-date`: server-side override of `cover_letter_content.header.date` with today's date in `Pacific/Auckland` timezone, formatted as "26 April 2026". Replaces the LLM's `{{TODAY}}` placeholder.
9. `quality-scan`: deterministic scanner runs through CV and cover letter content, logs warnings to `request_logs` metadata for: em/en dashes present, banned phrases present, missing "Kia ora" salutation when region is NZ, ATS keyword coverage 50-60% (Zod already failed below 50%), profile sentence count outside seniority range. Does NOT fail the run.
10. Branch on `validated.status`:
    - **success:** mark-rendering -> render-docs -> upload-files (storage upsert: true, idempotent) -> finalize-success (set `files_expire_at = now() + 60d`, `metadata_expires_at = now() + 1y`, status `success`).
    - **insufficient_input:** finalize-insufficient (status `insufficient_input`, store `insufficient_input_reason`, set `metadata_expires_at = now() + 1y`, **pause queue**: any `queued` items for this user become `paused`).

After terminal state, send `application/generation.completed` event.

**`triggerNextInQueue`:** listens for `application/generation.completed`. Concurrency 1 per user. Finds next `queued` row for user, fires `generate.requested`. The acquire-slot step is the actual gate; this just nudges the system.

**Anthropic call:**
- Model: `claude-sonnet-4-6`.
- Tools: `web_search_20250305` plus a custom `submit_application` tool whose input schema is generated from the Zod `ApplicationOutputSchema`.
- `tool_choice: { type: 'tool', name: 'submit_application' }` forces structured output.
- `max_tokens: 16000`.
- System prompt loaded from `prompts/system-prompt-v2.md` at module scope.

**SSE phase events** (in `generation_events.phase`): `llm_started`, `llm_completed`, `rendering_started`, `finalized`. The five internal LLM phases (JD analysis, company research, fit assessment, salary band, drafting) map to a single `llm_started -> llm_completed` window. Frontend can show rotating labels during this window. Real per-phase visibility is a v2 conversation (would require breaking the system prompt into multiple LLM calls).

**SSE event payload shape (v6 lock):** every event sent over SSE has the form `{ phase: string, application_id: string, timestamp: string, payload?: object }`. Phase is one of the four above. Timestamp is ISO 8601. Payload is event-specific and may be empty. Frontend reads phase to determine which UI state to show.

**Errors do not pause the queue, only `insufficient_input` does.** Hard errors leave queued items running.

**The user message builder (`lib/llm/build-user-message.ts`):** assembles `<master_cv>`, `<job_description>`, `<region>NZ</region>`, `<attempt_number>N</attempt_number>`, optional `<user_notes>`. Trims whitespace; doesn't sanitise content (system prompt handles untrusted-data discipline).

**Output validation** via Zod discriminated union on `status`. The JSON schema for the Anthropic tool definition is generated from the same Zod schema using `zod-to-json-schema`, so they can never drift. **The success branch includes a `superRefine` that enforces ATS keyword coverage >= 60% in the CV body.**

### 6.7 Error Handling, Retries, Idempotency

**Three-layer error model:**
- **Validation errors:** 400, no DB row, frontend shows inline.
- **Insufficient_input:** valid request, LLM determined inputs unworkable. Application row exists, status `insufficient_input`. User retries via Screen 9/10.
- **System errors:** something broke. Application row exists, status `error`. User retries via Screen 12.

**Error taxonomy** in `lib/errors/codes.ts`. Single `ERROR_CODES` const with code, http_status, category, user_message, client_retryable for every error in the system. Frontend imports the same const for user-facing messages. Categories: validation, auth, conflict, system, external. Full catalogue in section 7.3.

**`ApiError` class** in `lib/errors/api-error.ts`. Routes throw `new ApiError('queue_full')`, the wrapper produces JSON envelope and status code automatically.

**`withLogging` wrapper:**
- Generates `request_id` (uuid) at request start.
- Sets Sentry tag `request_id`.
- Catches `ApiError` (returns proper status), other errors (wraps as `internal_error` 500).
- Reports 5xx to Sentry, never 4xx.
- Writes to `request_logs` fire-and-forget.
- Sets `X-Request-Id` response header.

**Idempotency** via `idempotency_keys` table:
- `(user_id, key, route)` unique constraint.
- 10-minute TTL via `expires_at`.
- Body hashed with SHA-256, mismatched hash on key reuse returns 409 `idempotency_key_conflict`.
- Service-role-only access, no user RLS policy.
- Helper: `withIdempotency({ user_id, route, body, request }, handler)`.
- Used only on `POST /api/applications` in v1.

**Retry policy by layer:**
- **Browser to API:** `apiFetch` wrapper retries 5xx and 429 with backoff [0, 500, 2000]ms. Never auto-attaches Idempotency-Key (caller's responsibility).
- **API to Supabase:** SDK internal retries only.
- **Inngest steps:** per-step config (LLM step is **0 retries**, others use defaults).
- **Storage uploads:** `upsert: true` makes them idempotent on retry.
- **SSE reconnect:** standard EventSource reconnect with `Last-Event-ID`. The `/api/applications/[id]/events` route reads the header, queries `generation_events` where `id > last_event_id`, replays, then streams new events.
- **SSE polling fallback (v6):** the application page additionally polls `GET /api/applications/[id]` every 5 seconds if no SSE event has been received for 10+ seconds. This is belt-and-braces for Vercel's serverless SSE timeout edge cases.

**Stuck application watchdog:** 15-minute cron finds applications in `running` for >30 minutes, marks them errored, resumes queue. **Critical:** the update must include `.eq('status', 'running')` guard to avoid overwriting a real `success` row that completed between find and update. **Critical:** the watchdog must set `metadata_expires_at = now() + 1 year` when transitioning to error.

**Error message sanitisation** via `lib/errors/sanitise.ts`. Strips emails, phones, long alphanumeric tokens. Truncates to 1000 chars. Applied before any error message is persisted.

**Frontend error mapping** via `lib/client/handle-error.ts`. `getUserMessage(body)` and `isRetryable(body)` helpers. Components branch on `error.code` for richer per-code UX where useful.

### 6.8 Background Jobs

**Five Inngest scheduled functions:**

| Function | Schedule (UTC) | Purpose |
|---|---|---|
| `expireFiles` | `0 14 * * *` (daily 02:00 NZT) | Delete generated docx files past 60 days, set `files_deleted_at`. Skips `is_demo = true` rows. |
| `expireMetadata` | `15 14 * * *` (daily 02:15 NZT) | Delete application rows past 1 year, plus orphaned superseded master CVs. Skips `is_demo = true` rows. |
| `sweepRequestLogs` | `30 14 * * *` (daily 02:30 NZT) | Delete `request_logs` and `telemetry_events` older than 30 days |
| `sweepIdempotencyKeys` | `45 14 * * *` (daily 02:45 NZT) | Delete `idempotency_keys` rows past `expires_at` |
| `watchdogStuckApplications` | `*/15 * * * *` | Mark `running` applications stuck > 30 min as errored, set `metadata_expires_at` |

**Cron pattern:** every cron is wrapped to write a `request_logs` row with `source = 'cron'` and a summary in metadata. Admin panel can answer "did the cron run last night?".

**Idempotency:** every cron filters on a "not yet processed" predicate (e.g. `files_deleted_at IS NULL`, `expires_at < now()`). Re-running on partial failure is safe.

**Storage delete order:** delete from storage first, then DB row. If storage fails, DB row stays, next cron run retries. If DB delete fails, the next run sees an "expired" row, tries to delete already-deleted files (Supabase shrugs), DB delete retries.

**Watchdog `.eq('status', 'running')` guard on update:** prevents overwriting a real `success` row if the function actually completed between find and update.

**Spec rule (every terminal state transition):** every state transition into `insufficient_input`, `abandoned`, `cancelled`, or `error` must set `metadata_expires_at = now() + 1 year`, otherwise the rows leak forever. Affects: `finalize-insufficient` step, `markApplicationErrored` (both function and watchdog versions), abandon route, future cancel route.

### 6.9 Telemetry

**Storage choice:** `telemetry_events` Supabase table for v1, behind a thin interface (`emitTelemetry`, `trackEvent`). Mental note: evaluate PostHog when signups open. Single file change to swap implementations.

**Event taxonomy** in `lib/telemetry/events.ts`. Roughly 30 events including v6 additions. Full map in section 7.4. Categories:
- Auth (signin attempts, success, fail, signout)
- Master CV (upload started/succeeded/failed)
- JD input (focused, first_edit, short_warning_shown) plus notes_input.first_edit
- Application submission (attempted, succeeded, failed)
- Generation lifecycle (started, llm_completed, finalized) duplicates `generation_events` deliberately, different consumer
- Retry / abandon
- Downloads (requested, failed)
- Email (attempted, succeeded, failed) **v6**
- Preview (viewed) **v6**
- Page views (single `page.viewed` event with path)

`TelemetryEventMap` type enforces correct properties per event name.

**Server emission:** `emitTelemetry(name, properties, context)` writes directly via service-role client.

**Client emission:** `trackEvent(name, properties)` buffers up to 10 events / 5 seconds, flushes via `keepalive` fetch to `POST /api/telemetry`. `pagehide` event triggers final flush. Per-tab `session_id` via `sessionStorage`.

**`/api/telemetry` route:** accepts batches up to 50 events. Trusts client-side type system for event names (no server-side enum). Forward-compatible with stale clients.

**PII rules:** never CV/JD content, emails, phones, names, free-text. Only ids, durations, sizes, enums, counts. Discipline enforced at code review.

**Request correlation:** `request_id` (uuid) generated in `withLogging`, flows through `request_logs.id`, `telemetry_events.request_id`, Sentry tag, and `X-Request-Id` response header.

**Admin panel:** `/api/admin/telemetry` endpoint mirrors `/api/admin/logs` shape. Two charts expected useful in v1: submission funnel and outcome distribution.

**Retention:** 30 days, same as `request_logs`. Folded into the `sweepRequestLogs` cron.

### 6.10 Observability and Logging

**`request_logs` table:** every API route call and Inngest step writes a row. Columns: id, created_at, user_id, application_id, source (`api_route` | `inngest_step` | `cron`), name, duration_ms, status (`ok` | `error`), error_code, error_message, metadata. Admin-only RLS.

**`token_usage` table:** every Anthropic API call writes a row. Token counts (input, output, cache creation, cache read), web_search_count, cost_usd computed at insert time, model name, application_id. Admin-only RLS. Kept forever (small, useful for billing analysis).

**Sentry:** wired in via `@sentry/nextjs`. 5xx errors auto-reported, 4xx errors only logged to `request_logs`. PII scrubbing on (`sendDefaultPii: false`). No session replay (privacy concern given CV uploads).

**Sentry alerts (v6 - configure before first real demo):**
- Any 5xx in `request_logs` count > 0 over 15 min window: email admin
- `llm_failed` or `llm_invalid_output` count > 0 over 1 hour window: email admin
- Any `token_usage` row with `cost_usd > 1.00` for a single call: email admin (catches runaway prompts)

**`request_logs` retention:** 30 days, swept by daily cron.

**Token usage admin visibility:** admin panel only. Never user-facing in v1.

### 6.11 Email (v6, deprioritised in v7 for internal demo)

**Build status:** the spec below stays intact and accurate. For the internal-only demo, this feature is deferred until after the first round of real internal use. Internal testers can download DOCX files directly via Screen 8's Download button. Email adds a Resend dependency, an env var (`RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`), an extra error path (`email_send_failed`, `email_limit_reached`), and a rate-limit column to maintain. None of that earns its keep before there is observed user demand. Build the View and Download actions on Screen 8 first, ship to internal users, see if anyone actually asks for email before building it. The schema column `email_send_count` and the error codes can stay in the initial migration so adding the route later is a pure additive change.

**Library:** Resend, via `lib/email/client.ts` thin wrapper.

**Sender:** Curiosum `<applications@curiosum.ai>` (set via `EMAIL_FROM_ADDRESS` env var). Display name is "Curiosum". Per brand standards (see Section 12), the canonical domain is curiosum.ai across all surfaces.

**Recipient:** user-supplied via Screen 8 input field, defaulted to authenticated user's email from `auth.users`. User can override.

**Trigger:** `POST /api/applications/[id]/email` with body `{ recipient_email: string }`.

**Rate limit:** max 5 sends per application, tracked via `applications.email_send_count`. Returns `email_limit_reached` (409) above this.

**Body template** (plain text, in `lib/email/templates.ts`). Aligned with the Curiosum email signature standard (see Section 12.7):

```
Kia ora,

Attached are the tailored CV and cover letter for your {role} application at {company}.

Good luck with your application. We hope it lands you the interview.

Nga mihi
Curiosum
curiosum.ai
```

When the email feature ships, the HTML version uses the canonical Curiosum signature block (DM Sans, orange 2px×40px rule, brand contact details). For internal demo, plain text is sufficient. See Section 12.7 for the full signature spec.

**Subject:** `Your tailored application for {role} at {company}`.

**Attachments:** both DOCX files, fetched from Supabase storage at send time (not pre-baked).

**Failure handling:** Resend non-2xx returns `email_send_failed` (502). User sees toast, can retry via the same button. No automatic queue-based retries in v1.

**Telemetry:** `email.send.attempted`, `email.send.succeeded`, `email.send.failed` events.

### 6.12 Preview Components (v6)

**Components:** `components/application/CvPreview.tsx` and `components/application/CoverLetterPreview.tsx`.

**Source data:** read directly from `applications.llm_response_json`. No additional storage, no additional Inngest step.

**Visual design:** Tailwind-based, echoes the DOCX layout. Uses the **light theme** brand tokens (white page, #F7F6F2 surface, #111110 text, #888880 meta) so the preview matches what the rendered DOCX will look like. The rest of the app shell is dark theme; the preview is the one place light theme appears in the UI, by design. It's the deliverable view. Not pixel-perfect to the DOCX; the DOCX is the canonical deliverable. The preview is the confidence-builder: lets the user check "did the AI capture this right?" before downloading or emailing. See Section 12.3 for typography and Section 12.2 for the light theme palette.

**Placement:** Screen 8, expandable/collapsible panels above the action buttons (View / Download / Email).

**Telemetry:** `preview.viewed` event when first opened.

---

## 7. Build-Readiness Detail

### 7.1 Environment Variables

All public vars validated at startup via Zod (`lib/env.ts`); a fresh clone fails-fast with a clear console message if any are missing or malformed. `.env.example` is checked into the repo with empty values so the variable list is visible without trawling code.

**Public (browser-readable, prefixed `NEXT_PUBLIC_`):**

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key, RLS-enforced |
| `NEXT_PUBLIC_APP_URL` | Canonical app origin, used for redirect URL building |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry browser DSN |

**Server-only:**

| Variable | Purpose | Notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS. Used only in Inngest functions and crons. | Never exposed to browser. Single import site is `lib/supabase/service.ts`. |
| `ANTHROPIC_API_KEY` | Anthropic SDK auth | Rotate yearly. |
| `INNGEST_EVENT_KEY` | Required for production Inngest event sending | Not needed in dev (Inngest dev server handles it). |
| `INNGEST_SIGNING_KEY` | Verifies webhook calls from Inngest cloud | Not needed in dev. |
| `RESEND_API_KEY` | Resend SDK auth (v6) | Optional for internal demo. Required when email feature is built. |
| `EMAIL_FROM_ADDRESS` | Sender email address (v6) | Optional for internal demo. e.g. `applications@curiosum.ai`, displayed as "Curiosum". |
| `SENTRY_AUTH_TOKEN` | Source map upload at build time | Build-time only. |
| `SENTRY_ORG` | Sentry org slug | Build-time only. |
| `SENTRY_PROJECT` | Sentry project slug | Build-time only. |
| `ADMIN_EMAIL` | The single admin user's email. Read at startup for sanity checks. Also the recipient for daily summary emails (v7). | Optional in dev. |
| `GENERATION_ENABLED` | Kill switch (v7). When `false`, `POST /api/applications` returns a friendly "temporarily disabled" message. Defaults to `true` if unset. | Read at request time, not module scope, so toggling in Vercel takes effect without redeploy. |
| `DAILY_COST_CEILING_USD` | Daily spend ceiling (v7). When today's `token_usage` total exceeds this, new submissions are refused with `daily_cost_ceiling_reached`. Defaults to 10.00 if unset. | Read at request time. |
| `SLACK_WEBHOOK_URL` | Optional fallback delivery channel for the daily summary cron (v7). Used only when Resend is not configured. | Optional. |
| `NODE_ENV` | Standard | Set automatically by Next.js / Vercel. |

**Literal `.env.example` contents:**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SENTRY_DSN=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
RESEND_API_KEY=
EMAIL_FROM_ADDRESS=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=
ADMIN_EMAIL=
GENERATION_ENABLED=true
DAILY_COST_CEILING_USD=10.00
SLACK_WEBHOOK_URL=
```

### 7.2 Anthropic Pricing Constants

For `lib/anthropic/pricing.ts`. Verified against the official Anthropic pricing page (27 April 2026). Sonnet 4.6 is $3/MTok input, $15/MTok output. Cache writes 1.25x input (5-min TTL) or 2x input (1-hour TTL). Cache reads 0.1x input. Web search is $0.01 per call ($10 per 1,000).

```typescript
export const PRICING = {
  'claude-sonnet-4-6': {
    input_per_mtok: 3.00,
    output_per_mtok: 15.00,
    cache_write_5m_per_mtok: 3.75,    // 1.25x input
    cache_write_1h_per_mtok: 6.00,    // 2.0x input
    cache_read_per_mtok: 0.30,        // 0.10x input
  },
} as const;

export const TOOL_PRICING = {
  web_search_per_call: 0.01,          // $10 per 1000 searches
} as const;

export type ModelName = keyof typeof PRICING;

export function calculateCost(usage: {
  model: ModelName;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;      // assume 5-min TTL by default
  cache_read_tokens: number;
  web_search_count: number;
}): number {
  const p = PRICING[usage.model];
  const tokenCost =
    (usage.input_tokens / 1_000_000) * p.input_per_mtok +
    (usage.output_tokens / 1_000_000) * p.output_per_mtok +
    (usage.cache_creation_tokens / 1_000_000) * p.cache_write_5m_per_mtok +
    (usage.cache_read_tokens / 1_000_000) * p.cache_read_per_mtok;
  const toolCost = usage.web_search_count * TOOL_PRICING.web_search_per_call;
  return Number((tokenCost + toolCost).toFixed(4));
}

// v6: per-generation cost cap
export const COST_CAP_USD = 1.00;
export const COST_CAP_PRECHECK_USD = 0.50;  // half-cap on input alone
```

### 7.3 Error Code Catalogue

For `lib/errors/codes.ts`. Single const containing every error code in the system, shared by frontend and backend. Routes throw `new ApiError('queue_full')` and the wrapper looks up `http_status` and `category` automatically. New codes only get added when the frontend actually needs to branch on them; everything else is `internal_error`.

Categories:
- `validation`: bad request, no DB row created
- `auth`: not signed in, or signed in but not authorised
- `conflict`: resource state prevents the action (queue full, idempotency conflict)
- `system`: our problem, retryable by user
- `external`: dependency failed (Anthropic, Supabase storage, Resend)

```typescript
export const ERROR_CODES = {
  // ----- validation (400) -----
  invalid_request: {
    http_status: 400,
    category: 'validation',
    user_message: 'The information sent does not look right. Check the form and try again.',
    client_retryable: false,
  },
  master_cv_required: {
    http_status: 400,
    category: 'validation',
    user_message: 'Upload a master CV before submitting an application.',
    client_retryable: false,
  },
  master_cv_too_large: {
    http_status: 400,
    category: 'validation',
    user_message: 'Master CV files must be 3 MB or smaller.',
    client_retryable: false,
  },
  master_cv_unsupported_type: {
    http_status: 400,
    category: 'validation',
    user_message: 'Master CV must be a PDF or DOCX file.',
    client_retryable: false,
  },
  master_cv_parse_failed: {
    http_status: 400,
    category: 'validation',
    user_message: 'We could not read your CV file. If it is a scanned PDF, please upload a text-based version or a DOCX.',
    client_retryable: false,
  },
  jd_too_short: {
    http_status: 400,
    category: 'validation',
    user_message: 'The job description is too short. Paste the full posting and try again.',
    client_retryable: false,
  },
  invalid_application_state: {
    http_status: 400,
    category: 'validation',
    user_message: 'This application cannot be changed in its current state.',
    client_retryable: false,
  },
  generation_too_large: {
    http_status: 400,
    category: 'validation',
    user_message: 'The combined size of your CV and job description is too large for a single generation. Try shortening either input.',
    client_retryable: false,
  },

  // ----- auth (401, 403) -----
  not_authenticated: {
    http_status: 401,
    category: 'auth',
    user_message: 'Sign in to continue.',
    client_retryable: false,
  },
  not_admin: {
    http_status: 403,
    category: 'auth',
    user_message: 'You do not have access to this area.',
    client_retryable: false,
  },
  not_owner: {
    http_status: 403,
    category: 'auth',
    user_message: 'You do not have access to this application.',
    client_retryable: false,
  },

  // ----- conflict (404, 409, 410) -----
  application_not_found: {
    http_status: 404,
    category: 'conflict',
    user_message: 'That application could not be found.',
    client_retryable: false,
  },
  queue_full: {
    http_status: 409,
    category: 'conflict',
    user_message: 'You already have 3 applications in progress. Wait for one to finish before submitting another.',
    client_retryable: false,
  },
  idempotency_key_conflict: {
    http_status: 409,
    category: 'conflict',
    user_message: 'A different request with the same key was already received. Refresh and try again.',
    client_retryable: false,
  },
  retry_limit_reached: {
    http_status: 409,
    category: 'conflict',
    user_message: 'You have used all retry attempts for this application.',
    client_retryable: false,
  },
  email_limit_reached: {
    http_status: 409,
    category: 'conflict',
    user_message: 'You have already emailed this application 5 times. Please download instead.',
    client_retryable: false,
  },
  files_expired: {
    http_status: 410,
    category: 'conflict',
    user_message: 'These files have expired and are no longer available.',
    client_retryable: false,
  },

  // ----- system (500) -----
  internal_error: {
    http_status: 500,
    category: 'system',
    user_message: 'Something went wrong on our side. Please try again.',
    client_retryable: true,
  },
  database_error: {
    http_status: 500,
    category: 'system',
    user_message: 'We could not save your data. Please try again.',
    client_retryable: true,
  },
  rendering_failed: {
    http_status: 500,
    category: 'system',
    user_message: 'We generated the content but could not produce the documents. Please retry.',
    client_retryable: true,
  },

  // ----- external (502, 503) -----
  llm_failed: {
    http_status: 502,
    category: 'external',
    user_message: 'The AI service did not respond as expected. Please retry.',
    client_retryable: true,
  },
  llm_invalid_output: {
    http_status: 502,
    category: 'external',
    user_message: 'The AI returned an unexpected result. Please retry.',
    client_retryable: true,
  },
  storage_failed: {
    http_status: 502,
    category: 'external',
    user_message: 'We could not save the generated files. Please retry.',
    client_retryable: true,
  },
  email_send_failed: {
    http_status: 502,
    category: 'external',
    user_message: 'We could not send the email. Please try again or download the files instead.',
    client_retryable: true,
  },
  service_unavailable: {
    http_status: 503,
    category: 'external',
    user_message: 'A required service is temporarily unavailable. Please try again shortly.',
    client_retryable: true,
  },

  // ----- v7: kill switch and daily ceiling -----
  generation_disabled: {
    http_status: 503,
    category: 'system',
    user_message: 'New applications are temporarily paused. Please try again later.',
    client_retryable: true,
  },
  daily_cost_ceiling_reached: {
    http_status: 503,
    category: 'system',
    user_message: 'Today\'s usage limit has been reached. Please try again tomorrow.',
    client_retryable: false,
  },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
```

### 7.4 Telemetry Event Catalogue

For `lib/telemetry/events.ts`.

```typescript
export type TelemetryEventMap = {
  // ----- auth -----
  'auth.signin.attempted': { method: 'password' };
  'auth.signin.succeeded': { method: 'password'; duration_ms: number };
  'auth.signin.failed': { method: 'password'; error_code: string };
  'auth.signout': {};

  // ----- master cv -----
  'master_cv.upload.started': { file_size_bytes: number; mime_type: string };
  'master_cv.upload.succeeded': { file_size_bytes: number; mime_type: string; duration_ms: number };
  'master_cv.upload.failed': { error_code: string };

  // ----- application input -----
  'jd_input.focused': {};
  'jd_input.first_edit': {};
  'jd_input.short_warning_shown': { length_chars: number };
  'notes_input.first_edit': {};

  // ----- application submission -----
  'application.submit.attempted': { has_notes: boolean; jd_length_chars: number };
  'application.submit.succeeded': { application_id: string; queue_position: number };
  'application.submit.failed': { error_code: string };

  // ----- generation lifecycle (mirror of generation_events for analytics) -----
  'generation.started': { application_id: string };
  'generation.llm_completed': { application_id: string; duration_ms: number };
  'generation.finalized': {
    application_id: string;
    outcome: 'success' | 'insufficient_input' | 'error';
    duration_ms: number;
  };

  // ----- retry / abandon -----
  'application.retry.attempted': { parent_application_id: string; attempt_number: 2 | 3 };
  'application.retry.succeeded': { application_id: string; parent_application_id: string };
  'application.abandon': { application_id: string; attempt_number: 1 | 2 | 3 };

  // ----- downloads -----
  'download.requested': { application_id: string; kind: 'cv' | 'cover_letter' };
  'download.failed': { application_id: string; kind: 'cv' | 'cover_letter'; error_code: string };

  // ----- email (v6) -----
  'email.send.attempted': { application_id: string };
  'email.send.succeeded': { application_id: string; duration_ms: number };
  'email.send.failed': { application_id: string; error_code: string };

  // ----- preview (v6) -----
  'preview.viewed': { application_id: string; kind: 'cv' | 'cover_letter' };

  // ----- page views -----
  'page.viewed': { path: string };
};

export type TelemetryEventName = keyof TelemetryEventMap;
```

### 7.5 Zod ApplicationOutputSchema

For `lib/llm/output-schema.ts`. v6 changes: profile bounds tightened (min 150 chars, max 800), bullets per role minimum bumped to 2, `superRefine` added for ATS keyword coverage at 60% threshold, date field expects literal `{{TODAY}}` placeholder.

```typescript
import { z } from 'zod';

// ------ shared sub-schemas ------

const FitAssessmentSchema = z.object({
  score: z.enum(['strong', 'moderate', 'weak']),
  reasoning: z.string().min(1).max(500),
  warnings: z.array(z.string().min(1).max(300)).max(8),
});

const RecentNewsItemSchema = z.object({
  headline: z.string().min(1).max(300),
  source_url: z.string().url(),
});

const ResearchSummarySchema = z.object({
  company_snapshot: z.string().min(1).max(500),
  recent_news: z.array(RecentNewsItemSchema).max(3),
  industry_context: z.string().min(1).max(300),
  is_public_sector: z.boolean(),
  company_reference_used: z.string().min(1).max(500),
  company_reference_note: z.string().max(500).optional(),
});

const JdAnalysisSchema = z.object({
  role_archetype: z.string().min(1).max(100),
  seniority: z.enum(['Graduate', 'Junior', 'Mid', 'Senior', 'Lead', 'Principal']),
  must_haves: z.array(z.string().min(1).max(200)).max(20),
  nice_to_haves: z.array(z.string().min(1).max(200)).max(20),
  ats_keywords: z.array(z.string().min(1).max(80)).min(8).max(12),
});

const SalaryBandSchema = z.object({
  range: z.string().min(1).max(100),
  source_name: z.string().min(1).max(100),
  source_url: z.string().url(),
  confidence: z.enum(['high', 'medium', 'low']),
});

// ------ CV content ------

const ContactDetailsSchema = z.object({
  full_name: z.string().min(1).max(120),
  location: z.string().min(1).max(120),
  phone: z.string().min(1).max(40),
  email: z.string().email(),
  linkedin: z.string().min(1).max(200),
  work_rights: z.string().min(1).max(200),
  availability: z.string().min(1).max(120),
});

const TechnicalSkillsGroupSchema = z.object({
  category: z.string().min(1).max(80),
  skills: z.array(z.string().min(1).max(80)).min(1).max(20),
});

const ProfessionalExperienceItemSchema = z.object({
  role_title: z.string().min(1).max(120),
  company: z.string().min(1).max(120),
  location: z.string().min(1).max(120),
  start_date: z.string().min(1).max(40),
  end_date: z.string().min(1).max(40),
  bullets: z.array(z.string().min(1).max(400)).min(2).max(8),  // v6: min bumped to 2
});

const KeyProjectSchema = z.object({
  name: z.string().min(1).max(120),
  context: z.string().min(1).max(120),
  bullets: z.array(z.string().min(1).max(400)).min(1).max(6),
  technologies: z.array(z.string().min(1).max(60)).max(15),
});

const EducationItemSchema = z.object({
  qualification: z.string().min(1).max(160),
  institution: z.string().min(1).max(160),
  location: z.string().min(1).max(120),
  dates: z.string().min(1).max(40),
  details: z.array(z.string().min(1).max(300)).max(6),
});

const LeadershipInterestItemSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(400),
});

const CvContentSchema = z.object({
  contact_details: ContactDetailsSchema,
  profile: z.string().min(150).max(800),  // v6: tightened from 1..1500
  technical_skills: z.array(TechnicalSkillsGroupSchema).min(1).max(8),
  professional_experience: z.array(ProfessionalExperienceItemSchema).min(1).max(12),
  key_projects: z.array(KeyProjectSchema).min(0).max(5),
  education: z.array(EducationItemSchema).min(1).max(6),
  leadership_and_interests: z.array(LeadershipInterestItemSchema).max(8),
  referees: z.string().min(1).max(200),
});

// ------ Cover letter content ------

const CoverLetterHeaderSchema = z.object({
  full_name: z.string().min(1).max(120),
  phone: z.string().min(1).max(40),
  email: z.string().email(),
  linkedin: z.string().min(1).max(200),
  location: z.string().min(1).max(120),
  date: z.string().min(1).max(40),  // accepts {{TODAY}} placeholder, system overrides
  recipient_line: z.string().min(1).max(200),
  company_name: z.string().min(1).max(160),
  company_address: z.string().max(300).nullable(),
});

const CoverLetterContentSchema = z.object({
  header: CoverLetterHeaderSchema,
  salutation: z.string().min(1).max(120),
  paragraphs: z.array(z.string().min(1).max(1500)).length(4),
  signoff: z.string().min(1).max(200),
});

// ------ Top-level: discriminated union on status ------

const SuccessSchema = z.object({
  status: z.literal('success'),
  fit_assessment: FitAssessmentSchema,
  research_summary: ResearchSummarySchema,
  jd_analysis: JdAnalysisSchema,
  salary_band: SalaryBandSchema,
  cv_content: CvContentSchema,
  cover_letter_content: CoverLetterContentSchema,
  what_we_did_checklist: z.array(z.string().min(1).max(300)).min(5).max(8),
}).superRefine((data, ctx) => {
  // v6: ATS keyword coverage check
  const cvText = [
    data.cv_content.profile,
    ...data.cv_content.technical_skills.flatMap((g) => g.skills),
    ...data.cv_content.professional_experience.flatMap((r) => r.bullets),
    ...data.cv_content.key_projects.flatMap((p) => [...p.bullets, ...p.technologies]),
  ]
    .join(' ')
    .toLowerCase();
  const keywords = data.jd_analysis.ats_keywords.map((k) => k.toLowerCase());
  const matched = keywords.filter((k) => cvText.includes(k)).length;
  const coverage = matched / keywords.length;
  if (coverage < 0.6) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Only ${matched} of ${keywords.length} ATS keywords (${Math.round(coverage * 100)}%) appear in the CV; minimum 60% required`,
      path: ['cv_content'],
    });
  }
});

const InsufficientInputSchema = z.object({
  status: z.literal('insufficient_input'),
  insufficient_input_reason: z.string().min(1).max(800),
});

export const ApplicationOutputSchema = z.discriminatedUnion('status', [
  SuccessSchema,
  InsufficientInputSchema,
]);

export type ApplicationOutput = z.infer<typeof ApplicationOutputSchema>;
export type ApplicationOutputSuccess = z.infer<typeof SuccessSchema>;
export type ApplicationOutputInsufficient = z.infer<typeof InsufficientInputSchema>;
```

### 7.6 Demo Sustainability Layer (v7 prioritised)

This is the layer that keeps internal team testing safe and observable. v7 reranks the v6 list and adds four new items based on the constraint that the demo is internal-only. Items are grouped into three tiers: **must-haves** (non-negotiable, build before first real use), **cheap insurance** (low effort, build alongside), and **deferred for internal demo** (skip until after first round of internal use or until signups open).

#### Tier 1: Must-haves (non-negotiable)

1. **Per-generation cost cap (USD 1.00).** Pre-call estimate based on message size; if estimated input cost > USD 0.50 throw `generation_too_large`. Post-call check using actual usage; if real cost > USD 1.00 log `cost_cap_exceeded` warning to `request_logs` (do not fail run, money already spent). Lives in `lib/anthropic/cost-cap.ts`, called from the Inngest pipeline (steps 4 and 6 of `generateApplication`).

2. **Daily cost ceiling (v7).** At submit time on `POST /api/applications`, query `token_usage` for the last 24 hours summed by `cost_usd`. If total exceeds `DAILY_COST_CEILING_USD` (default 10.00), refuse the submission with `daily_cost_ceiling_reached` (503). Per-generation cap protects against runaway single calls; daily ceiling protects against runaway volume. Internal use means this should never trigger in normal operation, which is exactly why it earns its keep: 50 runaway generations is the difference between a USD 50 surprise and a USD 500 one. Implementation is one extra SQL query at submit time.

3. **Kill switch env var (v7).** Read `GENERATION_ENABLED` at request time (not module scope) inside `POST /api/applications`. If `false`, return `generation_disabled` (503) with a friendly message. Toggling in Vercel env takes effect without redeploy. Five minutes to build. Saves you from having to do an emergency deploy if anything goes catastrophically wrong (cost spike, prompt regression, Anthropic outage). Pair with a similar check inside the Inngest `generateApplication` function so already-queued items also halt cleanly when flipped.

4. **Watchdog completeness.** Verify the `eq('status', 'running')` guard is present on the watchdog's update query, so it doesn't overwrite a real `success` row that completed between find and update. Verify the watchdog sets `metadata_expires_at = now() + 1 year` when transitioning to error. These are the two specific bugs that would surface in week three of a demo where nobody can reproduce them.

5. **Three Sentry alerts** (configure before first real demo):
   - 5xx count > 0 over 15 min: email admin
   - `llm_failed` or `llm_invalid_output` > 0 over 1 hour: email admin
   - Any single `token_usage` row with `cost_usd > 1.00`: email admin

6. **Minimal admin panel.** Build immediately after the API routes (build sequence step 13), not after all 12 user screens. Must include: last 50 applications with status / user / cost / duration; last 20 errors from `request_logs` with code and message; 7-day cost total. Three SQL queries, one page. For a demo, this is more critical than half the user-facing screens, because internal users won't tell you when something feels off, they'll just stop using it.

7. **Manual verification of first three real generations (v7).** This is process, not code. Before declaring the demo "ready", a human reads three real generations end to end: cover letter, CV, fit warnings, salary band, what-we-did checklist. The output quality scanner catches mechanical issues; only a human catches "this sounds wrong" issues. Block the internal-team rollout on this step.

#### Tier 2: Cheap insurance (low effort, build alongside)

8. **PDF parse hardening.** 5-second hard timeout on `unpdf` extraction. Minimum 200 chars of extracted text after parsing. Returns `master_cv_parse_failed` (400) on either failure with a clear message ("If it is a scanned PDF, please upload a text-based version or a DOCX").

9. **Submit button debounce.** 3-second lockout after click. Internal testers click things twice. Without this you get duplicate queue entries and confused state.

10. **SSE polling fallback.** Application page polls `GET /api/applications/[id]` every 5 seconds if no SSE event has arrived for 10+ seconds. Page is also fully recoverable from a single GET (browser refresh always works), which is the more important safety net.

11. **Output quality scanner** (`lib/quality/scan.ts`). Runs after `validate-output` in the Inngest pipeline. Logs warnings to `request_logs` metadata for: em/en dashes in CV or letter, banned phrases from system prompt section 2.2, missing "Kia ora" salutation when region is NZ, ATS keyword coverage between 50% and 60% (Zod fails below 50%), profile sentence count outside seniority range. Does NOT fail the run. This is your early warning system for prompt drift; internal testers won't catch every subtle quality issue, but the scanner will surface patterns.

12. **Inngest dev startup check.** In dev mode only, ping the Inngest dev server on app boot; log a clear warning if it's not running. Saves the team from hours of "applications stuck in queued" debugging.

13. **Daily summary email (v7).** A small Inngest cron (e.g. `0 21 * * *` UTC, daily 09:00 NZT) queries the last 24 hours of `applications` and `token_usage` and sends one email to `ADMIN_EMAIL` with: total submissions, count by terminal status, total spend, top error code if any. One query, one email, weekly drift detection without needing to log into the admin panel. Folded forward from open question 13 because internal users notably don't volunteer feedback. Note: requires Resend wired up. If email is also deferred (see Tier 3 item 17), this item slips with it; in that case post the same payload to a Slack webhook instead via a `SLACK_WEBHOOK_URL` env var.

#### Tier 3: Deferred for internal demo (skip until signups open or observed need)

14. **`system_prompt_version` column** on `applications`. Defaults to `'v2'`. Set at submit time. The column itself stays in the initial migration (cheap to keep), but no A/B testing infrastructure or dashboards. For internal use you can correlate manually by date.

15. **`is_demo` flag** on `applications`. Defaults to `false`. Skip the admin SQL workflow until you actually hit the 60-day expiry on test data and find it annoying. Column stays in the initial migration so adding the workflow later is non-breaking.

16. **Idempotency key UX polish.** The `Idempotency-Key` header support stays correct architecturally and the table stays in the migration. The submit-button debounce (item 9) handles the actual duplicate-click case for internal users; client-side key generation can wait.

17. **Email-to-user feature (section 6.11).** Spec stays intact. Build the View and Download actions on Screen 8 first. If internal users ask for email, build it then. Resend env vars (`RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`) become optional at this point. Schema column `email_send_count` and the two error codes (`email_send_failed`, `email_limit_reached`) stay in the initial migration so adding the route later is purely additive.

18. **Email rate limit enforcement.** Trivially deferred with item 17.

---

## 8. Open Questions

These are decisions deferred or not yet needed:

1. Search and filter on the History page. Suggestion: defer, ship reverse-chronological list with retry-chain subtitles.
2. Backups. Supabase Pro gives daily. Worth flagging if going to paid testers.
3. Tests. No test setup in v1. Add before broader rollout.
4. ~~Visual design (colours, typography beyond template fonts). Defer until first screen build.~~ Resolved in v8: Curiosum Brand Master v1.1 is the source of truth. Full spec in Section 12.
5. "Generate again with these inputs" feature. Out of scope for v1.
6. Edit-the-docx-in-app feature. Out of scope for v1.
7. Per-user rate limiting on `/api/applications` and `/api/master-cv`. Not needed for one user. Add via Upstash when signups open.
8. Circuit breaker on Anthropic. Add when traffic warrants.
9. Customer-facing status page. Skip until customers exist.
10. Distinguishing transient vs permanent LLM errors. Currently all map to `llm_failed`. Could split for better UX.
11. Anthropic prompt caching to cut input cost. Easy win when costs become measurable.
12. Watchdog for stuck `rendering` status. Add only if observed in practice.
13. ~~Daily summary email to admin~~ Resolved in v7 (see section 7.6 Tier 2 item 13).
14. Configurable retention windows. Defer.
15. PostHog vs custom analytics UI when signups open.
16. Anonymous-id tracking pre-signin. Defer.
17. GDPR / privacy compliance for public launch. Telemetry without PII keeps us out of most issues. Confirm with advice pre-launch.
18. HTML email template (currently plain text). Brand standards (Section 12.7) define the canonical Curiosum signature block. Upgrade plain-text template to React Email using that signature when bandwidth allows.
19. Async email send via Inngest (currently synchronous from API route). Move to event-driven only if Resend latency becomes an issue.
20. Mobile breakpoints. Decision: usable, not optimised. Brand layout standards (Section 12.5) are desktop-first. Specific mobile adjustments (e.g. sidebar collapse, topbar shrink) when first screen is built.

---

## 9. Mental Notes Carried Forward

Captured here so they don't get lost in section text:

1. **Magic link auth** is deferred. Single Supabase toggle plus two file changes (login page, new callback route) to swap.
2. **Account deletion** deferred with magic link. Full flow spec'd in section 6.4 deferred list.
3. **PostHog evaluation** when signups open. Single file change behind `emitTelemetry` / `trackEvent`.
4. **Spec rule:** every terminal state transition must set `metadata_expires_at = now() + 1 year`. Affects insufficient_input, abandoned, cancelled, error transitions.
5. **System prompt versioning:** the `system_prompt_version` column lets us A/B test prompt iterations honestly. When you write v3 of the prompt, increment the default and the old applications still trace back to v2.
6. **Email recipient is user-supplied for v1.** When signups open, consider auto-defaulting to the authenticated user's email and adding a "remember this address" preference. Out of scope for v1.
7. **Email feature is deferred for internal demo (v7).** Spec is intact in section 6.11. Schema columns and error codes stay in the initial migration so adding the route later is a pure additive change. Build only when internal users actually ask for it.
8. **Kill switch lives in two places (v7).** `GENERATION_ENABLED` is checked at the top of `POST /api/applications` (refuses new submissions) AND at the top of the Inngest `generateApplication` function (halts items already in the queue). Without the second check, flipping the switch only stops new submissions while a queue of 50 keeps spending.
9. **Daily cost ceiling is a soft guard, not a hard one (v7).** It's enforced at submit time, not mid-generation. An in-flight call that pushes over the ceiling completes; the next submission gets refused. This is intentional: never abandon a generation the user has already paid for.

---

## 10. Pickup Point for the Next Conversation

Start the next conversation with this exact context:

> Continuing from handoff v8. Architecture is complete: targets 2.1 to 2.9 (repo, schema, storage, auth, API routes, generation pipeline, error handling, background jobs, telemetry) plus build-readiness 2.10 to 2.16 (env vars, repo layout, pricing constants, error code catalogue, telemetry event catalogue, Zod output schema, DOCX template definitions) plus v6 additions (server-side date enforcement, in-app preview component, email-to-user flow spec, system prompt v2 with seniority calibration) plus v7 prioritisation (demo sustainability layer ranked into must-haves / cheap-insurance / deferred, four v7 must-haves: daily cost ceiling, kill switch env var, daily summary email, manual verification gate) plus v8 brand layer: Curiosum Brand Master v1.1 integrated as the source of truth for the web app UI and Curiosum-owned surfaces, with an explicit boundary that user CV/letter DOCX files remain ATS-optimised and Curiosum-unbranded. Ready to begin build. First step: project scaffolding with Tailwind brand token configuration, env setup, and the consolidated initial migration.

Files to drop into the new project:
- `system_prompt_v2.md`
- `app_handoff_v8.md` (this file)
- `Curiosum_Brand_Master.html` (reference, not consumed by code; Section 12 of this handoff is the build-relevant extract)

### Suggested Build Sequence

The sequence below reflects v7 prioritisation. Tier 1 (must-have) work is front-loaded and the demo is gated on it. Tier 3 (deferred) items appear at the end and can slip past the first internal milestone without blocking the demo.

In order of dependency:

1. **Project scaffold:** Next.js, TypeScript, Tailwind, shadcn init, env files (per 7.1), Supabase project setup, Inngest account, Sentry account. Resend account is optional at this stage (deferred per v7). Configure Tailwind with the Curiosum brand tokens per Section 12 (colours, spacing, fonts loaded from Google Fonts: Instrument Serif and DM Sans). Set `<body>` to dark theme by default per brand standards.
2. **Folder skeleton** per 6.1, including `lib/design/tokens.ts` with the brand token constants.
3. **`lib/env.ts`** with Zod validation, reading the variables listed in 7.1. Make `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` optional. Include `GENERATION_ENABLED` (default true) and `DAILY_COST_CEILING_USD` (default 10.00).
4. **Initial migration:** the consolidated SQL from 6.2 (includes columns for deferred features so they're additive later: `system_prompt_version`, `is_demo`, `email_send_count`).
5. **The three Supabase clients** and middleware.
6. **Login page**, admin user setup, **and the `UPDATE profiles SET is_admin = true` step** for that user.
7. **Shared modules in this order:**
   - `lib/errors/codes.ts` per 7.3 (includes v6 + v7 error codes: `generation_disabled`, `daily_cost_ceiling_reached`)
   - `lib/errors/api-error.ts`
   - `lib/errors/sanitise.ts`
   - `lib/logging/with-logging.ts`
   - `lib/idempotency/with-idempotency.ts`
   - `lib/telemetry/events.ts` per 7.4 (includes v6 events)
   - `lib/telemetry/emit.ts` and `lib/telemetry/track.ts`
   - `lib/llm/output-schema.ts` per 7.5 (with v6 `superRefine` and tightened bounds)
   - `lib/parsing/parse-pdf.ts` and `lib/parsing/parse-docx.ts` (v6 must-haves: unpdf + mammoth wrappers with timeout/min-length checks)
   - `lib/quality/scan.ts` (v6 cheap insurance: output quality scanner)
8. **Anthropic client wrapper** with token usage logging, plus `lib/anthropic/pricing.ts` per 7.2, `lib/anthropic/tool-schema.ts` (zod-to-json-schema bridge), and `lib/anthropic/cost-cap.ts` (v6 must-have: per-generation cost cap).
9. **DOCX templates:** `lib/docx/styles.ts`, `lib/docx/helpers.ts`, `lib/docx/render-cv.ts`, `lib/docx/render-cover-letter.ts` per section 5.
10. **Inngest client and `generateApplication` function** including the v6 steps: `cost-cap-check`, `cost-cap-postcheck`, `inject-date`, `quality-scan`. Plus a kill-switch check at the top of the function (v7). Plus `triggerNextInQueue`.
11. **API routes** in dependency order: master-cv (with v6 PDF parse hardening), applications (with v7 kill-switch check and v7 daily cost ceiling check), events (with v6 SSE replay logic), download, retry, abandon, telemetry, admin/usage, admin/logs, admin/telemetry. Note: `/api/applications/[id]/email` and `/api/email` are skipped at this stage per v7 deferral.
12. **The five crons** (watchdog must include `metadata_expires_at` setting per v6 must-have).
13. **Minimal admin panel (v6 must-have, v7 priority):** last 50 applications, last 20 errors, 7-day cost total. Three SQL queries, one page. Build BEFORE the user-facing screens.
14. **Frontend screens** in journey order (1 through 12). Screen 8 includes:
    - `<CvPreview>` and `<CoverLetterPreview>` components reading `llm_response_json` (v6)
    - View / Download buttons only at this stage (Email button deferred per v7)
    - 3-second submit button debounce on Screen 7 (v6 cheap insurance)
    - SSE polling fallback on Screen 8 / queued state (v6 cheap insurance)
15. **Sentry wiring** (server, client, edge configs) plus the **three v6 alerts**: 5xx counter, llm_failed counter, single-call cost > $1. (v6 must-have)
16. **Inngest dev startup check** for local development (v6 cheap insurance).
17. **Daily summary cron (v7 cheap insurance).** If Resend is wired, send email to `ADMIN_EMAIL`. If not, post to `SLACK_WEBHOOK_URL`. Picks one based on what's configured.
18. **Manual verification gate (v7 must-have).** Read three real generations end to end before opening to internal team. Block on this. Not code, process, but it goes in the build plan because skipping it defeats half the point of building the safety nets.
19. **End-to-end smoke test** against the admin user: upload CV, submit JD, watch SSE, view preview, download docs, retry an insufficient_input, hit the queue cap, hit the cost cap with a deliberately oversized JD, hit the kill switch (set `GENERATION_ENABLED=false` and confirm friendly message), hit the daily cost ceiling (set `DAILY_COST_CEILING_USD=0.01` temporarily and confirm the refusal).

**Deferred to a later build conversation (v7 Tier 3):**
- Resend module (`lib/email/client.ts`, `lib/email/templates.ts`)
- `/api/applications/[id]/email` route
- Email button on Screen 8
- Email confirmation modal with recipient input
- `email.send.*` telemetry events (the schema entries can stay; they cost nothing)

Each of these is a manageable chunk for a focused build conversation.

---

## 11. Reference: Why These Choices

### Why Inngest over Vercel functions or a separate worker
Vercel function timeouts (even on Pro) are tight for a 90-second LLM call. Building our own queue worker on Railway/Fly is reinventing what Inngest gives us free. Free tier covers internal demo and 3 to 5 testers (50k function runs/month). Native step functions and queueing map directly to our queue cap of 3 and pause-on-fail rule. Browser-close-continues is trivially true because the function runs on Inngest's infra, not tied to an HTTP request.

### Why shadcn/ui over hand-rolled or Material UI
Accessible primitives out of the box. Code copied into our repo, no lock-in. Tailwind-based, fits the rest of the styling. Lower visual-design burden for v1 while still looking professional.

### Why versioned master CVs (snapshot at queue time)
The user might replace their CV mid-queue. Without snapshotting, a queued application could end up tailored against a different CV than the user expected. Snapshotting via `master_cv_id` on the application row makes the rule enforced at the schema level. Old CVs only get deleted once no application references them, so the data is always consistent.

### Why two storage buckets, both private
Different lifecycle rules (master CVs persist long-term, generated files expire at 60 days). Private + signed URLs avoids accidental public exposure of personal documents. RLS at the storage layer is belt-and-braces alongside our API route auth.

### Why admin-only auth in v1
Single user means magic link, account deletion, password reset flows are all wasted work right now. The admin user with email + password gives us a real `auth.users` row, a real session, real RLS, real `profiles` trigger, all of which work identically when we swap to magic link later. The only throwaway code is the password-based login page itself.

### Why `request_logs` table and not just Vercel logs
Vercel logs are siloed and not joinable to application data. Table costs nothing on Supabase free tier. Lets the admin panel show "this error happened during this user's third retry" with one SQL query.

### Why zero auto-retries on the LLM step
Each call costs money. Inngest's default retry policy would silently spend 3x on transient failures. The system prompt has its own retry semantics (the `attempt_number` field) and the user owns the retry decision. Cleaner to fail fast, surface clearly, let the user click Retry.

### Why errors don't pause the queue but insufficient_input does
Insufficient_input means the inputs themselves are problematic; if the user has 2 more queued applications against the same broken CV or the same misunderstanding, they'll all fail the same way. Pausing gives them a chance to fix. Hard errors are the system's fault, not the inputs'; queued items are still likely to succeed and shouldn't wait.

### Why structured output via tool_use rather than JSON mode
Anthropic's tool_use lets us declare a JSON schema upfront and force the model to call exactly that tool. Validates as part of the API call, not after. Plays cleanly alongside the web_search tool which is also declared as a tool. Single coherent mechanism.

### Why error taxonomy as a single TypeScript const
Frontend and backend share the same error codes and user messages. No drift between "what does `queue_full` mean" in one codebase vs another. Adding a new code is a single-file change.

### Why telemetry as a Supabase table for v1
One user. PostHog's value is funnels, retention, cohorts, all of which require multi-user data. Table gives us joinable analytics data for the admin panel. Migration to PostHog later is a single file (`lib/telemetry/emit.ts`).

### Why unpdf over pdf-parse (v6)
pdf-parse depends on the `canvas` native module, which doesn't compile on Vercel's serverless runtime. Multiple recent posts document people losing hours debugging this exact stack (Next.js + Vercel + Supabase + pdf-parse). unpdf is built specifically for serverless, ships its own PDF.js build with canvas mocked out, has zero native dependencies, is actively maintained under the UnJS umbrella, and is explicitly designed as the modern replacement for pdf-parse. Given the Vercel hosting choice, this isn't really a tradeoff, it's the only sane choice.

### Why React preview from JSON over DOCX-in-browser (v6)
The preview's job is to let the user check "did the AI capture this right?" before downloading. They don't need pixel-perfect parity with the DOCX, they need to be able to read the content quickly and decide if it's good. A clean React component does that better than a pdf-style viewer because it's instantly responsive and accessible. The DOCX is the canonical deliverable; the preview is the confidence-builder. Two different jobs, two different formats. Bonus: zero new server work, zero new storage, zero new Inngest steps.

### Why server-side date enforcement (v6)
The LLM has no reliable knowledge of today's date. Sonnet 4.6's training data has a cutoff, and even with web search it might pick up a date from a referenced article rather than today. The fix is to never trust the LLM for the date. Two layers: prompt instructs the LLM to output `{{TODAY}}` as a placeholder; server-side step in the Inngest pipeline overrides with today's date in `Pacific/Auckland` timezone. Trivial code, eliminates an entire class of failure.

### Why per-generation cost cap rather than daily cap (v6)
Daily cap accumulates silently and is hard to reason about ("did I spend $4 today and have $1 left?"). Per-generation cap puts a known ceiling on each individual run, which matches the unit of work the user submits. USD 1.00 is roughly 2.5x the worst plausible real cost (~USD 0.40 worst-case) and catches anything genuinely runaway. Pre-call estimate at half-cap blocks pathological inputs before they spend; post-call check logs warnings without failing the run (money already spent at that point).

### Why minimal admin panel before user screens (v6)
For a demo, the admin panel is more critical than half the user-facing screens, because it's how you triage when something looks off. Three queries, one page, no charts: last 50 applications, last 20 errors, 7-day cost. Without it, you find out about problems by the user telling you. With it, you spot drift in 30 seconds.

### Why storytelling-led cover letter paragraph 2 (v2 prompt)
NZ recruiter research (Robert Half NZ, Hays, Tahatū) consistently emphasises that cover letters that tell one specific story outperform ones that list three skills. AI-detection research separately shows that the #1 detection signal is "sentences any candidate could write". Storytelling is the natural defence against generic-sounding output, because a story has specific details that only this candidate has lived. The change costs nothing but produces measurably more authentic-feeling output.

### Why the user's DOCX is not Curiosum-branded (v8)
The Curiosum Brand Master defines a polished, distinctive document style: Georgia italic headings, DM Sans body, orange rules, Curiosum header/footer, the standing commitment paragraph. That style is correct for **Curiosum's own deliverables** (proposals, board briefs, reverse briefs), where Curiosum is the author. It is wrong for the user's CV and cover letter, where the user is the author and the recipient is a third-party employer. Three reasons. First, branding the user's CV with another company's identity is presumptuous and dilutes the user's professional voice. Second, ATS systems parse CVs by reading text content; headers, footers, decorative rules, and non-standard fonts increase the risk of parsing errors that drop the candidate from the shortlist. Third, the entire system prompt is built around producing an ATS-optimised CV (Section 2.6 of the prompt mandates standard fonts, no graphics, no tables). Loading Curiosum brand styling on top would directly contradict the prompt's intent. So: Calibri 11pt body, no header/footer, no decorative rules in the user's DOCX. The Curiosum brand applies to the app shell, the email template, and any Curiosum-owned admin surface, where Curiosum *is* the author.

---

## 12. Brand & Visual Design (v8)

This section is the build-relevant extract of Curiosum Brand Master v1.1. It is the single source of truth for the web app UI, the email template, and any Curiosum-owned surface. It does **not** apply to the user's CV or cover letter DOCX (see Section 5.1 v8 note and Section 11 final paragraph for why).

### 12.1 Scope: Where the Brand Applies

| Surface | Brand applies? | Notes |
|---|---|---|
| Web app shell (topbar, sidebar, dashboard, all screens 1 to 12) | Yes, dark theme | Default surface |
| Login page | Yes, dark theme | First impression |
| Admin panel | Yes, dark theme | Internal Curiosum surface |
| CV preview component (Screen 8) | Yes, light theme | Mirrors the DOCX deliverable |
| Cover letter preview component (Screen 8) | Yes, light theme | Mirrors the DOCX deliverable |
| Email template (when built) | Yes, light theme + signature | Curiosum is the sender |
| User's CV DOCX | **No** | User's professional document, ATS-optimised |
| User's cover letter DOCX | **No** | User's professional document, ATS-optimised |

The light theme appears in two places: the in-app previews on Screen 8, and the email body. Everywhere else in the app shell is dark theme.

### 12.2 Colour Tokens

All colours are defined as CSS custom properties at the `:root` level and as Tailwind theme extensions. Use the token, never the hex.

**Core brand:**

| Token | Hex / value | Use |
|---|---|---|
| `--o` (orange) | `#E85A0E` | Primary brand. CTAs, primary buttons, section labels, key borders, focus rings |
| `--o-light` | `#FF7A35` | Hover state on primary buttons |
| `--o-dim` | `rgba(232,90,14,0.15)` | Tinted backgrounds (callouts, hover on tinted surfaces) |

**Dark theme (web app default):**

| Token | Hex / value | Use |
|---|---|---|
| `--dark` | `#0A0A09` | Page background (`<body>`) |
| `--dark2` | `#111110` | Topbar, sidebar, panel headers, primary card background |
| `--dark3` | `#191917` | Content cards, nested elements, inputs (resting) |
| `--dark4` | `#252522` | Deeply nested elements, hover state on dark3 |
| `--border` | `rgba(255,255,255,0.07)` | Default card and panel borders |
| `--border2` | `rgba(255,255,255,0.13)` | Prominent dividers, focused borders, header rules |
| `--text` | `#EEEDe6` | Primary text (body, headings, key data) |
| `--muted` | `rgba(238,237,230,0.5)` | Secondary text (descriptions, supporting copy) |
| `--dim` | `rgba(238,237,230,0.22)` | Tertiary text (timestamps, meta labels, placeholders) |

**Critical brightness rule:** body copy on dark backgrounds is `--text` (full brightness). Only use `--muted` for genuinely secondary text and `--dim` for meta only. Pre-Apr 11 brand assets had body text at low opacity; this was corrected. Don't repeat that mistake.

**Light theme (preview components and email body only):**

| Token | Hex / value | Use |
|---|---|---|
| `--l-bg` | `#FFFFFF` | Page background |
| `--l-surface` | `#F7F6F2` | Section backgrounds, alternating table rows, card surfaces |
| `--l-text` | `#111110` | All body text |
| `--l-mid` | `#888880` | Meta text, labels, footer text |
| `--l-border` | `#E8E7E0` | Section dividers, table borders |

**Semantic accents** (use for status, never decorative):

| Token | Hex | Semantic meaning |
|---|---|---|
| `--grb` | `#3EC87A` | Success, approved, complete (e.g. status `success`) |
| `--blb` | `#4B9FE8` | Info, scheduled, neutral state (e.g. status `queued`) |
| `--amb` | `#F0A030` | In progress, warning, caution (e.g. status `running`, `paused`, fit score `moderate`) |
| `--pub` | `#8B7EE8` | Innovation, special (use sparingly) |
| `--red` | `#FF4B6E` | Error, danger, urgent (e.g. status `error`, fit score `weak`) |

**Reserved (do not use elsewhere):** `--cya` (`#00D4FF`) is reserved for the Star Trek demo only per brand standards. Not for this app.

**Status colour mapping for the application status enum:**

| Status | Token | Notes |
|---|---|---|
| `queued` | `--blb` | Neutral, scheduled |
| `paused` | `--amb` | Warning, attention needed (parent insufficient_input) |
| `running` | `--amb` | In progress |
| `rendering` | `--amb` | In progress |
| `success` | `--grb` | Done, downloadable |
| `insufficient_input` | `--amb` | Needs user action |
| `abandoned` | `--dim` | Tertiary, faded |
| `error` | `--red` | Problem |
| `cancelled` | `--dim` | Tertiary, faded |

Fit score: `strong` = `--grb`, `moderate` = `--amb`, `weak` = `--red`.

### 12.3 Typography

**Web fonts (loaded from Google Fonts in `app/layout.tsx`):**
- `Instrument Serif` weights `0,1` (regular and italic). Used for hero moments, page titles, and the cover letter preview heading. Italic style is the brand signature.
- `DM Sans` weights `300,400,500,600,700`. Used for everything else.

**Font stacks:**
- Sans (`--sans`): `"DM Sans", Helvetica, Arial, sans-serif`
- Serif (`--serif`): `"Instrument Serif", Georgia, serif`

**Type scale (web app):**

| Element | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Page hero title | Serif italic | 36px | 400 | Login screen, marketing surfaces |
| Section heading (within page) | Serif | 20-24px | 400 | Major page sections |
| H1 (in-app) | Sans | 24px | 600 | App page titles |
| H2 | Sans | 18px | 600 | Subsection titles |
| Body | Sans | 14px | 400 | Default body copy |
| Small / supporting | Sans | 13px | 400 | Captions, supporting text |
| Section label | Sans uppercase | 9-10px | 700 | Letter-spacing 0.12em, orange |
| Meta / timestamp | Sans | 11px | 400 | Use `--dim` for colour |
| Button | Sans | 13-14px | 500-600 | All caps for primary CTAs optional |

**Type scale (light-theme preview, mirroring DOCX):**

| Element | Font | Size | Notes |
|---|---|---|---|
| Cover letter heading (sender name) | Sans | 14px bold | DM Sans |
| Cover letter date / recipient | Sans | 11pt-equivalent | DM Sans |
| Cover letter body | Sans | 11pt-equivalent | DM Sans, line-height 1.5 |
| CV name (top) | Sans | 18pt-equivalent | DM Sans, bold |
| CV section heading | Sans uppercase | 10pt-equivalent | DM Sans bold, orange or `--l-text` |
| CV body | Sans | 11pt-equivalent | DM Sans |

The preview font stack is DM Sans (matching brand), even though the actual DOCX renders Calibri (matching ATS optimisation). This is deliberate: the preview shows what the **content** looks like rendered cleanly; the DOCX is the deliverable that needs to survive ATS parsing.

### 12.4 Component Patterns

**Status badges** (used for application status, fit score, and queue position indicators):

- Pill shape, border-radius 20px
- 9-10px text, 700 weight, uppercase, letter-spacing 0.05em
- Padding 3px 10px
- 0.5px border, semi-transparent fill matching the semantic colour
- Pattern: `bg-[--grb]/12 text-[--grb] border-[--grb]/25` for "approved" style

**Cards:**

- Background `--dark3`, border `--border` (0.5px), border-radius 10px
- Padding 14-16px default, 1.25rem for content cards
- Shadow only on hover or modal cards: `0 2px 12px rgba(0,0,0,0.4)`

**Buttons:**

- Primary: orange fill `--o`, white text, hover to `--o-light`. Border-radius 6-8px. Padding 8px 16px. Sans 14px 500.
- Secondary: transparent fill, `--text` colour, `--border2` border. Hover: `--dark4` fill.
- Tertiary / text: `--muted` text, hover to `--text`, no border, no fill.
- Destructive: `--red` text, transparent fill, hover to `--red`/10 fill.

**Inputs:**

- Background `--dark3` (or `--dark4` for nested context like a card)
- Border `--border` 0.5px
- Border-radius 6px
- Padding 10px 14px
- Text `--text` 14px DM Sans
- Placeholder `--dim`
- Focus ring: `--o` border, no box-shadow

**North Star block** (for the "what we did" checklist on Screen 8 and any callout that emphasises the Curiosum voice):

- Left border 3px solid `--o`
- Background `--o-dim` (orange tint at 5-15% opacity)
- Padding 1rem 1.25rem
- Body text: Instrument Serif italic 16px, colour `--text`
- Border-radius `0 var(--radius) var(--radius) 0` (square left edge to meet the orange bar)

This is the brand's signature component. Use it on Screen 8 to wrap the "what we did" summary or a key callout. Don't overuse it.

**Back navigation** (top of Screen 8 and other deep pages):

- 36px height, dark2 background, 0.5px border
- Border-radius 6px
- Dim text 11px 600, hover to orange
- Pattern: `← Back to Dashboard | ◆ Screen Name`

### 12.5 Layout Standards

| Element | Value | Notes |
|---|---|---|
| Topbar height | 50px | All app pages, `flex-shrink: 0` |
| Sidebar width | 260px | If sidebar is used, `flex-shrink: 0` |
| Back nav height | 36px | Application detail pages |
| Border radius small | 6px | Buttons, badges, inputs |
| Border radius default | 10px | Cards, panels |
| Border radius large | 14px | Hero blocks, modals |
| Card padding default | 14-16px | Standard interior padding |
| Section gap | 2-2.5rem | Between major sections on a page |
| Page max-width | 960-1200px | Centred container |

### 12.6 Tailwind Configuration

`tailwind.config.ts` extends the theme to expose all brand tokens:

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Core brand
        orange: { DEFAULT: '#E85A0E', light: '#FF7A35', dim: 'rgba(232,90,14,0.15)' },
        // Dark theme
        dark: '#0A0A09',
        dark2: '#111110',
        dark3: '#191917',
        dark4: '#252522',
        text: '#EEEDe6',
        muted: 'rgba(238,237,230,0.5)',
        dim: 'rgba(238,237,230,0.22)',
        border: { DEFAULT: 'rgba(255,255,255,0.07)', strong: 'rgba(255,255,255,0.13)' },
        // Light theme (preview / email)
        'l-bg': '#FFFFFF',
        'l-surface': '#F7F6F2',
        'l-text': '#111110',
        'l-mid': '#888880',
        'l-border': '#E8E7E0',
        // Semantic
        success: '#3EC87A',
        info: '#4B9FE8',
        warn: '#F0A030',
        innovation: '#8B7EE8',
        danger: '#FF4B6E',
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '10px',
        lg: '14px',
      },
      boxShadow: {
        card: '0 2px 12px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

`app/globals.css` defines the same tokens as CSS custom properties for any non-Tailwind use, sets `<body>` to dark theme by default, and loads the Google Fonts.

`lib/design/tokens.ts` re-exports the values as TypeScript constants for code that needs token values outside Tailwind classes (e.g. inline styling for the email HTML, or anywhere we need the orange hex string in JS).

### 12.7 Email Signature Standard

When the email feature is built (currently deferred per v7), the HTML email body uses the canonical Curiosum signature block. Plain-text fallback is what ships in the initial template (see Section 6.11).

**Signature block (HTML):**

- White background, 16px 20px padding, border-radius 6px
- Sender block:
  - Name: DM Sans 14px bold, `#111110`
  - Title: DM Sans 12px, `#888880` ("Curiosum" or "Curiosum Management Consulting")
- Orange rule: 2px tall, 40px wide, `#E85A0E`, 10px margin above contact block
- Contact block: DM Sans 11px, line-height 1.8
  - Email link: `#E85A0E`, no underline
  - Phone: `#888880`
  - Website: `curiosum.ai` (no `https://` prefix), `#888880`, no underline
- Tagline (optional): DM Sans 10px italic, `#aaa`, "Think differently. Transform deliberately."

**Rules:**
- No logo image (breaks in many email clients). The orange rule is the brand mark.
- No social icons in the initial version.
- All client-facing email uses this format.

### 12.8 Voice & Tone (Web App Surfaces)

The Curiosum brand voice is "specific over general, honest over diplomatic, active over passive." This applies to UI copy in the web app: button labels, error messages, empty states, toast notifications, the "what we did" checklist, and the `insufficient_input_reason` framing.

These rules already align with the system prompt's AI-tells blacklist (Section 2.2 of `system_prompt_v2.md`) and the "could anyone write this" test (Section 2.5). The brand voice and the prompt voice reinforce each other; no conflict.

**UI copy examples:**

- Bad: "Your application is being processed."
- Good: "Drafting your CV and cover letter."
- Bad: "Something went wrong. Please try again."
- Good: "We couldn't reach the AI service. Try again in a moment."
- Bad: "Submit your application to begin the tailoring process."
- Good: "Submit. We'll tailor your CV and cover letter."

The error code catalogue user messages in Section 7.3 should be reviewed against this tone before launch. A handful (e.g. `internal_error`: "Something went wrong on our side. Please try again.") are deliberately generic for safety; that's fine. Specific, honest, active phrasing is the goal everywhere else.

### 12.9 Domain & Identity Constants

Use these exact strings everywhere. Set them as constants in `lib/design/tokens.ts` so they aren't sprinkled as string literals.

| Constant | Value |
|---|---|
| `CURIOSUM_DOMAIN` | `curiosum.ai` |
| `CURIOSUM_WEBSITE` | `https://curiosum.ai` |
| `CURIOSUM_FOUNDER_EMAIL` | `hamish@curiosum.ai` |
| `CURIOSUM_FOUNDER_PHONE` | `+64 21 717 310` |
| `CURIOSUM_FOUNDER_NAME` | `Hamish Carr` |
| `CURIOSUM_FIRM_LONG` | `Curiosum Management Consulting` |
| `CURIOSUM_FIRM_SHORT` | `Curiosum` |
| `CURIOSUM_TAGLINE` | `Think differently. Transform deliberately.` |
| `EMAIL_FROM_DEFAULT` | `applications@curiosum.ai` |

The .co.nz domain is deprecated. Use curiosum.ai everywhere.

### 12.10 What Doesn't Belong (Common Mistakes)

From the brand master, applied to this app:

- **No white backgrounds in the app shell.** Login, dashboard, history, settings, admin panel: all dark theme. Only the preview cards and the email body are light.
- **No cyan (`#00D4FF`) anywhere.** Reserved for an unrelated demo per brand standards.
- **No body text below 50% opacity on dark.** Body copy is `--text` (full brightness). `--muted` is the floor for body. `--dim` is meta only.
- **No `curiosum.co.nz` strings.** All curiosum.ai.
- **No mid-paragraph bolding for emphasis.** Use real headings or pull quotes.
- **No emoji in admin or production UI.** Brand voice is precise, not playful in this surface. The system prompt already bans emoji in CV/cover letter content.

### 12.11 Brand Quick-Reference for Build

When building each screen, the build conversation should consult this section. The shortest possible checklist:

1. Dark theme by default. Light only in the two preview cards and the email body.
2. DM Sans for everything sans, Instrument Serif italic for hero moments only.
3. Orange (`#E85A0E`) for primary CTAs, section labels, focus rings. Never for body text.
4. Body text on dark = `--text` (full brightness). Always.
5. Status uses semantic accents (green / blue / amber / red). Map per Section 12.2.
6. Cards: `--dark3` background, `--border` border, 10px radius.
7. Buttons: 6px radius, primary orange fill, secondary transparent with border.
8. Domain: curiosum.ai everywhere.
9. The user's CV/cover letter DOCX stays Calibri and unbranded. Brand applies to the **app**, not to the user's documents.
