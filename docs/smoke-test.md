# End-to-end smoke test

Run against the deployed admin user before declaring v1 ready
(spec §7.6 Tier 2 + §10).

This is process, not pytest — build sequence step 19. The point is
to catch wiring regressions that only surface against the real
Vercel + Inngest + Anthropic + Supabase combination.

## Pre-flight

- [ ] All three Sentry alerts configured (see `docs/sentry-alerts.md`)
      and the Alert 3 smoke fire has been verified.
- [ ] Daily summary cron has fired at least once (check `request_logs`
      for `source='cron' name='daily-summary'`).
- [ ] Manual verification gate passed (see `docs/manual-verification.md`).
- [ ] `GENERATION_ENABLED=true` and `DAILY_COST_CEILING_USD=10.00` in
      Vercel env.

## Happy path

1. **Upload CV.** `/upload` → choose a 1-2MB PDF → confirm 201
   redirect to dashboard. Confirm `/dashboard` shows the CV row.
2. **Submit JD.** `/application/new` → paste real JD (300+ words) →
   click submit → land on `/application/[id]` with status `queued`.
3. **Watch SSE.** Loading state shows rotating phase labels: "Researching…"
   → "Drafting cover letter…" → "Rendering your documents…".
4. **Land on success.** Page reloads with fit score, "What we did"
   block, both Download buttons, and both expandable previews.
5. **Download both files.** Confirm filenames are correct, files
   open in Word, content matches the previews.
6. **History.** `/history` shows the application reverse-chronologically.
7. **Admin panel.** `/admin/usage` shows the new row with non-zero
   cost. `/admin/logs` is empty (or only carries cron logs).
   `/admin/telemetry` shows the submission-funnel bars filled.

## Failure paths

8. **Insufficient input retry.** Submit a JD that's clearly gibberish
   ("asdf qwer 200 chars filler ...") → should land on Screen 9
   with a friendly reason → click Retry with a real JD → confirm
   new row created with `parent_application_id` set, attempt 2 begins.
9. **Insufficient input cap.** Force three insufficient_input results
   in a row. The third lands on Screen 10 ("continue queued") not
   Screen 9. Clicking "Continue queued applications" abandons it
   and resumes any paused queue items.
10. **Queue cap.** Submit 4 applications fast. The 4th must return
    `queue_full` (409) with the friendly message.
11. **Cost cap.** Temporarily lower `COST_CAP_PRECHECK_USD` in
    `lib/anthropic/pricing.ts` to `0.001`, redeploy, submit a normal
    JD. Should fail with `generation_too_large` before any LLM call.
    Revert and redeploy.
12. **Kill switch.** Set `GENERATION_ENABLED=false` in Vercel env.
    Submit → friendly `generation_disabled` message. Confirm any
    queued items already in flight stop at the kill-switch-check
    step. Set back to `true`.
13. **Daily ceiling.** Set `DAILY_COST_CEILING_USD=0.01` in Vercel
    env. Submit → `daily_cost_ceiling_reached` (503). Set back to
    `10.00`.

## Cleanup

- [ ] Delete the smoke-test applications via the admin/abandon
      flow if you want a clean History view.
- [ ] Confirm the watchdog cron next-fired on schedule (check
      `request_logs` for `source='cron' name='watchdog-stuck-applications'`).

If everything above passes, the build is ready for real internal use.
