// Main generation pipeline. Triggered by 'application/generate.requested'.
// Concurrency cap: 1-per-user (Inngest gate). Function-level retries: 2.
// LLM step retries: 0 (each call costs money; the user owns retry).
//
// Step order (per CLAUDE.md "Generation Pipeline"):
//   1.  kill-switch-check       (exit cleanly if GENERATION_ENABLED=false)
//   2.  acquire-slot            (exit cleanly if not at front of queue)
//   3.  load-context
//   4.  mark-running            (status -> running, llm_started SSE event)
//   5.  cost-cap-check          (pre-call estimate, may throw)
//   6.  call-llm                (retries: 0; logs token_usage)
//   7.  cost-cap-postcheck      (warning only, never throws)
//   8.  validate-output         (Zod parse only; ATS coverage moved to quality-scan as a warning)
//   9.  inject-date             (Pacific/Auckland today)
//   10. quality-scan            (warnings only)
//   then branch: success path vs insufficient_input path.
//
// onFailure marks the row errored and sets metadata_expires_at.
// 'application/generation.completed' fires after every terminal state.

import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NonRetriableError } from "inngest";

import {
  llm,
  checkCostCapPre,
  checkCostCapPost,
  submitApplicationTool,
} from "@/lib/llm";
import { sendApplicationEmail } from "@/lib/email/send-application-email";
import { isGenerationEnabled } from "@/lib/env";
import { ApiError } from "@/lib/errors/api-error";
import { buildUserMessage } from "@/lib/llm/build-user-message";
import {
  ApplicationOutputSchema,
  type ApplicationOutput,
  type ApplicationOutputSuccess,
} from "@/lib/llm/output-schema";
import { withInngestStep } from "@/lib/logging/with-inngest-step";
import { runQualityScan } from "@/lib/quality/scan";
import { createServiceClient } from "@/lib/supabase/service";
import { emitTelemetry } from "@/lib/telemetry/emit";

import { inngest } from "../client";
import { checkSlot } from "../steps/acquire-slot";
import {
  finalizeError,
  finalizeInsufficient,
  finalizeSuccess,
  markRendering,
  markRunning,
  writePhaseEvent,
} from "../steps/finalize";
import { injectDate } from "../steps/inject-date";
import { loadContext } from "../steps/load-context";
import { renderAndUpload } from "../steps/render-and-upload";

// Module-scope load: file read happens once per cold start.
const SYSTEM_PROMPT = readFileSync(
  join(process.cwd(), "prompts", "system-prompt-v2.md"),
  "utf-8",
);

export const generateApplication = inngest.createFunction(
  {
    id: "generate-application",
    name: "Generate Application",
    retries: 2,
    concurrency: { key: "event.data.user_id", limit: 1 },
    triggers: [{ event: "application/generate.requested" }],
    onFailure: async ({ event, error }) => {
      const data = event.data.event.data as {
        application_id: string;
        user_id: string;
      };
      try {
        await finalizeError({
          application_id: data.application_id,
          error_code: "internal_error",
          error,
        });
        // Emit generation.finalized so the admin telemetry counter
        // for "errors" actually increments. Previously the success
        // and insufficient_input branches both fired this event but
        // the error path did not, so /admin/telemetry's error tab
        // was permanently 0 even when generations were failing.
        await emitTelemetry(
          "generation.finalized",
          {
            application_id: data.application_id,
            outcome: "error",
            // duration_ms is required by the event schema but we
            // can't compute it inside onFailure (we don't have
            // llmStartedAt in scope). 0 is the sentinel for
            // "duration not captured" — admin queries that
            // average duration filter on outcome=success or
            // outcome=insufficient_input where the value is real.
            duration_ms: 0,
          },
          { application_id: data.application_id, user_id: data.user_id },
        );
      } finally {
        await inngest.send({
          name: "application/generation.completed",
          data: {
            application_id: data.application_id,
            user_id: data.user_id,
            outcome: "error",
          },
        });
      }
    },
  },
  async ({ event, step }) => {
    const { application_id, user_id } = event.data as {
      application_id: string;
      user_id: string;
    };
    const stepCtx = { application_id, user_id };

    // 1. Kill switch — read at runtime so toggling in Vercel takes
    // effect mid-queue without redeploy.
    const enabled = await withInngestStep(
      step,
      "kill-switch-check",
      stepCtx,
      () => isGenerationEnabled(),
    );
    if (!enabled) return { halted: "generation_disabled" };

    // 2. Acquire slot. If we're not at the front of the user's queue,
    // re-fire `generate.requested` for the actual front row so the queue
    // self-heals (covers the dead-lock case where the front row's
    // original event was lost). Inngest concurrency:1-per-user prevents
    // a duplicate run when the front row is already in flight.
    const slot = await withInngestStep(step, "acquire-slot", stepCtx, () =>
      checkSlot(application_id, user_id),
    );
    if (!slot.atFrontOfQueue) {
      if (slot.actualFrontId && slot.actualFrontId !== application_id) {
        await step.sendEvent("nudge-front-of-queue", {
          name: "application/generate.requested",
          data: { application_id: slot.actualFrontId, user_id },
        });
      }
      return {
        halted: "not_at_front_of_queue",
        nudged: slot.actualFrontId,
      };
    }

    // 3. Load context.
    const ctx = await withInngestStep(step, "load-context", stepCtx, () =>
      loadContext(application_id),
    );

    // 4. Mark running + emit llm_started.
    await withInngestStep(step, "mark-running", stepCtx, async () => {
      await markRunning(application_id);
      await writePhaseEvent(application_id, "llm_started");
      await emitTelemetry(
        "generation.started",
        { application_id },
        { application_id, user_id },
      );
    });

    const userMessage = buildUserMessage({
      masterCvText: ctx.master_cv_text,
      jobDescription: ctx.job_description,
      attemptNumber: ctx.attempt_number,
      userNotes: ctx.user_notes,
    });

    // 5. Pre-call cost cap. Pre-cap value is per-provider (anthropic
    // and deepseek price input very differently); we look up the
    // active model's cap inside checkCostCapPre rather than passing
    // it explicitly. The model id flows from llm.callLLM's result so
    // we use a static lookup keyed on the env-selected provider.
    //
    // DeepSeek path is locked to Pro — see lib/deepseek/provider.ts.
    // No env-var path can route to Flash; the variant is a code
    // decision, not a config flip. If you ever swap the line below
    // to "deepseek-v4-flash", you must also flip the MODEL constant
    // in the provider for the two to stay in sync.
    const activeModel = process.env.LLM_PROVIDER === "deepseek"
      ? "deepseek-v4-pro"
      : "claude-sonnet-4-6";
    await withInngestStep(step, "cost-cap-check", stepCtx, () =>
      checkCostCapPre(activeModel, userMessage.length, SYSTEM_PROMPT.length),
    );

    // 6. The LLM call. retries: 0 because every call costs money;
    // the user owns the retry decision via the Retry button.
    //
    // Wrapped in withInngestStep so failures land in request_logs
    // with the right error_code (walked off the cause chain — see
    // lib/logging/with-inngest-step.ts). Before this wrapper was
    // applied, call-llm went through bare step.run, which meant
    // a DeepSeek 4xx (e.g. the 2026-05-03 reasoner tool_choice
    // rejection) propagated to onFailure and updated the row's
    // status to error, but never wrote a request_logs row — so
    // /admin/logs showed nothing for the failure even though the
    // Inngest run itself was visible.
    const llmStartedAt = Date.now();
    const llmResult = await withInngestStep(
      step,
      "call-llm",
      stepCtx,
      async () => {
        try {
          return await llm.callLLM({
            system: SYSTEM_PROMPT,
            userMessage,
            // Provider-internal: Anthropic appends its own
            // web_search server tool; DeepSeek appends its own
            // Tavily-backed web_search inside a tool-call loop.
            // The neutral list here is just the custom tool we
            // care about validating output for.
            tools: [submitApplicationTool],
            // "required" forces the response to end on a tool
            // call (no free text) but lets the model pick which
            // tool — critical so it can invoke web_search
            // (provider-internal) before submit_application.
            // Equivalent to Anthropic's { type: "any" }; the
            // DeepSeek provider translates this internally into
            // "auto" + a forced submit reference on the final
            // iteration to dodge the reasoner backend's rejection
            // of "required" (see lib/deepseek/provider.ts).
            toolChoice: "required",
            applicationId: application_id,
          });
        } catch (err) {
          // NonRetriableError prevents Inngest's default per-step
          // retry from re-spending against the provider. We
          // preserve the underlying cause so withInngestStep's
          // chain walker can find the ApiError and stamp
          // error_code='llm_failed' on request_logs.
          const cause = (err as { cause?: unknown })?.cause;
          const message =
            cause instanceof Error
              ? `${cause.name}: ${cause.message}`
              : err instanceof Error
                ? err.message
                : "llm_failed";
          throw new NonRetriableError(message, { cause: err });
        }
      },
    );
    const llmDurationMs = Date.now() - llmStartedAt;

    // Token usage row (DP-B): the wrapper deliberately does not write
    // this; we have user_id in scope here.
    await withInngestStep(step, "log-token-usage", stepCtx, async () => {
      const supabase = createServiceClient();
      await supabase.from("token_usage").insert({
        user_id,
        application_id,
        model: llmResult.model,
        input_tokens: llmResult.usage.input_tokens,
        output_tokens: llmResult.usage.output_tokens,
        cache_creation_tokens: llmResult.usage.cache_creation_tokens,
        cache_read_tokens: llmResult.usage.cache_read_tokens,
        web_search_count: llmResult.usage.web_search_count,
        cost_usd: llmResult.cost_usd,
      });
    });

    // 7. Post-call cost cap (warns only). Cap is per-provider; we
    // pass the actual model the call ran against so the right
    // threshold is applied even if LLM_PROVIDER was flipped mid-
    // queue.
    await withInngestStep(step, "cost-cap-postcheck", stepCtx, () =>
      checkCostCapPost(llmResult.model, llmResult.cost_usd, application_id),
    );

    await withInngestStep(step, "llm-completed-event", stepCtx, async () => {
      await writePhaseEvent(application_id, "llm_completed", {
        duration_ms: llmDurationMs,
      });
      await emitTelemetry(
        "generation.llm_completed",
        { application_id, duration_ms: llmDurationMs },
        { application_id, user_id },
      );
    });

    // 8. Validate. Zod failure → llm_invalid_output → error path via
    // onFailure. This is one of the only spots where we *want* the
    // function to fail (user-visible "AI returned an unexpected result").
    //
    // Error wrapping shape: NonRetriableError("llm_invalid_output") wraps
    // ApiError("llm_invalid_output") wraps ZodError. withInngestStep walks
    // the cause chain so request_logs.error_code = 'llm_invalid_output'
    // (not 'internal_error') and request_logs.metadata.zod_issues holds
    // the failing paths.
    const validated: ApplicationOutput = await withInngestStep(
      step,
      "validate-output",
      stepCtx,
      () => {
        const parsed = ApplicationOutputSchema.safeParse(llmResult.toolInput);
        if (!parsed.success) {
          const apiErr = new ApiError("llm_invalid_output");
          (apiErr as Error & { cause?: unknown }).cause = parsed.error;
          throw new NonRetriableError("llm_invalid_output", {
            cause: apiErr,
          });
        }
        return parsed.data;
      },
    );

    // Branch: insufficient_input vs success.
    if (validated.status === "insufficient_input") {
      await withInngestStep(step, "finalize-insufficient", stepCtx, async () => {
        await finalizeInsufficient({
          application_id,
          user_id,
          reason: validated.insufficient_input_reason,
          llm_response_json: validated,
        });
        await writePhaseEvent(application_id, "finalized", {
          outcome: "insufficient_input",
        });
        await emitTelemetry(
          "generation.finalized",
          {
            application_id,
            outcome: "insufficient_input",
            duration_ms: Date.now() - llmStartedAt,
          },
          { application_id, user_id },
        );
      });
      await inngest.send({
        name: "application/generation.completed",
        data: { application_id, user_id, outcome: "insufficient_input" },
      });
      return { outcome: "insufficient_input" };
    }

    // 9. Inject date (Pacific/Auckland today).
    const dated: ApplicationOutputSuccess = await withInngestStep(
      step,
      "inject-date",
      stepCtx,
      () => injectDate(validated),
    );

    // 10. Quality scan — warnings only, written to request_logs metadata.
    await withInngestStep(
      step,
      "quality-scan",
      { ...stepCtx, metadata: {} },
      () => {
        const warnings = runQualityScan(dated);
        // Stash warnings in this step's own metadata via the closure.
        // We re-call withInngestStep below for the fact-of-warning row.
        return warnings;
      },
    ).then(async (warnings) => {
      if (warnings.length > 0) {
        // Separate row keeps the warnings visible in admin queries.
        await withInngestStep(
          step,
          "quality-scan-warnings",
          { ...stepCtx, metadata: { warnings } },
          () => undefined,
        );
      }
    });

    // Success path: rendering started → render+upload → finalize.
    await withInngestStep(step, "mark-rendering", stepCtx, async () => {
      await markRendering(application_id);
      await writePhaseEvent(application_id, "rendering_started");
    });

    const upload = await withInngestStep(
      step,
      "render-and-upload",
      stepCtx,
      () => renderAndUpload(dated, application_id, user_id),
    );

    await withInngestStep(step, "finalize-success", stepCtx, async () => {
      await finalizeSuccess({
        application_id,
        llm_response_json: dated,
        cv_storage_path: upload.cv_storage_path,
        letter_storage_path: upload.letter_storage_path,
      });
      await writePhaseEvent(application_id, "finalized", { outcome: "success" });
      await emitTelemetry(
        "generation.finalized",
        {
          application_id,
          outcome: "success",
          duration_ms: Date.now() - llmStartedAt,
        },
        { application_id, user_id },
      );
    });

    // Auto-email step (opt-in via profiles.email_on_generation). Runs
    // after the application is fully finalized so the success state
    // doesn't depend on the email outcome — a Resend hiccup leaves the
    // user with downloadable files and a logged telemetry failure, not
    // a broken generation. sendApplicationEmail emits all three
    // email.send.* events internally so we just call and swallow.
    await withInngestStep(step, "auto-email", stepCtx, async () => {
      const service = createServiceClient();
      const { data: profile } = await service
        .from("profiles")
        .select("email_on_generation")
        .eq("id", user_id)
        .maybeSingle();
      if (!profile?.email_on_generation) return { sent: false };
      try {
        await sendApplicationEmail(application_id, service);
        return { sent: true };
      } catch {
        // Telemetry already emitted by sendApplicationEmail; nothing
        // more to surface here — file delivery is best-effort, the
        // success page's manual "Email me" button is the fallback.
        return { sent: false };
      }
    });

    await inngest.send({
      name: "application/generation.completed",
      data: { application_id, user_id, outcome: "success" },
    });

    return { outcome: "success" };
  },
);
