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
//   8.  validate-output         (Zod + ATS superRefine)
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

import { callLLM } from "@/lib/anthropic/client";
import { checkCostCapPre, checkCostCapPost } from "@/lib/anthropic/cost-cap";
import {
  submitApplicationTool,
  webSearchTool,
  SUBMIT_APPLICATION_TOOL_NAME,
} from "@/lib/anthropic/tool-schema";
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
      region: ctx.region,
      attemptNumber: ctx.attempt_number,
      userNotes: ctx.user_notes,
    });

    // 5. Pre-call cost cap.
    await withInngestStep(step, "cost-cap-check", stepCtx, () =>
      checkCostCapPre(userMessage.length, SYSTEM_PROMPT.length),
    );

    // 6. The LLM call. retries: 0 because every call costs money;
    // the user owns the retry decision via the Retry button.
    const llmStartedAt = Date.now();
    const llmResult = await step.run("call-llm", async () => {
      // Inngest's per-step retry limit lives on the step's run() call
      // signature in v3+; SDK presently exposes it via configure on
      // the function. For this step we wrap manually to ensure no
      // retry happens on Anthropic-side failures (caller decides).
      try {
        return await callLLM({
          system: SYSTEM_PROMPT,
          userMessage,
          tools: [submitApplicationTool, webSearchTool],
          toolChoice: { type: "tool", name: SUBMIT_APPLICATION_TOOL_NAME },
          applicationId: application_id,
        });
      } catch (err) {
        // NonRetriableError prevents Inngest's default per-step retry
        // from re-spending against Anthropic.
        throw new NonRetriableError(
          err instanceof Error ? err.message : "llm_failed",
          { cause: err },
        );
      }
    });
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

    // 7. Post-call cost cap (warns only).
    await withInngestStep(step, "cost-cap-postcheck", stepCtx, () =>
      checkCostCapPost(llmResult.cost_usd, application_id),
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
    const validated: ApplicationOutput = await withInngestStep(
      step,
      "validate-output",
      stepCtx,
      () => {
        const parsed = ApplicationOutputSchema.safeParse(llmResult.toolInput);
        if (!parsed.success) {
          throw new NonRetriableError("llm_invalid_output", {
            cause: parsed.error,
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
        const warnings = runQualityScan(dated, dated ? "NZ" : "NZ");
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

    await inngest.send({
      name: "application/generation.completed",
      data: { application_id, user_id, outcome: "success" },
    });

    return { outcome: "success" };
  },
);
