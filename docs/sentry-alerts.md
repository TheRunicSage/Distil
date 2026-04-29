# Sentry alerts (v6)

Three alerts must be configured in the Sentry dashboard before opening the
demo to internal testers (spec §6.10 / §7.6 Tier 1 item 5). All three send
email to `ADMIN_EMAIL`.

These cannot be created from the code — Sentry has no public alert-config
API for project-level alert rules. Recipes below are exact field values
for the **Alerts → Create Alert → Issues** flow.

## Alert 1 — Any 5xx in 15 minutes

**Why:** the `withLogging` wrapper reports 5xx exceptions to Sentry only;
4xx never lands here. So "any new issue in this window" is the right
trigger.

| Field | Value |
|---|---|
| Type | Issue Alert |
| When (filters) | A new issue is created **OR** an issue changes state from resolved to unresolved |
| Conditions | `event.tags.route` is set (catches API route 5xx and Inngest step throws) |
| Time window | 15 minutes |
| Action | Send email to `ADMIN_EMAIL` |

## Alert 2 — `llm_failed` or `llm_invalid_output` in 1 hour

**Why:** these two error codes are the system's eyes on Anthropic
regressions and prompt drift. Already 5xx (502), so Alert 1 catches them
too; this one is a 1-hour digest so the operator notices a trend.

| Field | Value |
|---|---|
| Type | Issue Alert |
| Conditions | `event.tags.error_code` equals `llm_failed` **OR** `event.tags.error_code` equals `llm_invalid_output` |
| Time window | 1 hour |
| Action | Send email to `ADMIN_EMAIL` |

> Implementation note: `withLogging` doesn't currently set
> `error_code` as a Sentry tag. If this alert is needed before the next
> code pass, set `Sentry.getCurrentScope().setTag("error_code", err.code)`
> inside the catch block before `captureException`.

## Alert 3 — Single call > $1.00

**Why:** the per-generation cost cap is $1.00. Going over once means
something pathological — runaway prompts, oversized inputs, or a
model regression. We want the operator to know within minutes.

`checkCostCapPost` calls `Sentry.captureMessage(..., { level: 'warning',
tags: { cost_cap_exceeded: 'true' } })` whenever a generation actually
exceeds the cap. Wire the alert against that tag.

| Field | Value |
|---|---|
| Type | Issue Alert |
| Conditions | `event.tags.cost_cap_exceeded` equals `true` |
| Time window | Immediately (any occurrence) |
| Action | Send email to `ADMIN_EMAIL` |

## Verification

After configuring all three:

1. Trigger Alert 3: temporarily set `COST_CAP_USD = 0.001` in
   `lib/anthropic/pricing.ts`, run one real generation, confirm an
   email arrives. Revert the constant.
2. Trigger Alert 1: add `throw new Error('sentry-smoke-test')` inside
   any API route handler, hit it once, confirm an email arrives.
   Remove the throw.
3. Alert 2 is harder to fire on demand without simulating an LLM
   failure; confirm the rule shows green in the Sentry UI and trust it
   until the first real failure hits.

This verification is part of the manual gate before opening the demo
(spec §7.6 Tier 1 item 7).
