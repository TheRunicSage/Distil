// Assembles the user message sent to the LLM. Plain XML-tagged blocks
// in the order the system prompt expects them. The system prompt §1
// already classifies tag contents as untrusted data and instructs the
// model to ignore embedded instructions, so we don't escape — that
// discipline lives in the prompt, not here.
//
// Decision Log step 10 DP-A: Option A — newline-separated tag blocks,
// no escaping, in spec order.

export type BuildUserMessageOptions = {
  masterCvText: string;
  jobDescription: string;
  region: string; // 'NZ' for v1
  attemptNumber: number; // 1, 2, or 3
  userNotes?: string | null;
};

export function buildUserMessage(opts: BuildUserMessageOptions): string {
  const blocks: string[] = [
    `<master_cv>\n${opts.masterCvText.trim()}\n</master_cv>`,
    `<job_description>\n${opts.jobDescription.trim()}\n</job_description>`,
    `<region>${opts.region}</region>`,
    `<attempt_number>${opts.attemptNumber}</attempt_number>`,
  ];
  if (opts.userNotes && opts.userNotes.trim()) {
    blocks.push(`<user_notes>\n${opts.userNotes.trim()}\n</user_notes>`);
  }
  return blocks.join("\n");
}
