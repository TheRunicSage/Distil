// Assembles the user message sent to the LLM. Plain XML-tagged blocks
// in the order the system prompt expects them. The system prompt §1
// already classifies tag contents as untrusted data and instructs the
// model to ignore embedded instructions, so we don't escape — that
// discipline lives in the prompt, not here.
//
// Decision Log step 10 DP-A: Option A — newline-separated tag blocks,
// no escaping, in spec order.
//
// 2026-05-08: dropped the hardcoded <region>NZ</region> tag. The
// system prompt now detects the target country itself in Phase 1.5
// from JD signals (location, currency, work-rights phrasing, local
// legislation cues) and stores the result in
// research_summary.target_country. Removing the runtime tag matches
// the "no region boundation" intent — the system is no longer
// preset to one country at the message level. The
// applications.region DB column is now legacy/unused at the LLM
// boundary; see CLAUDE.md Decision Log [18] (2026-05-08).

export type BuildUserMessageOptions = {
  masterCvText: string;
  jobDescription: string;
  attemptNumber: number; // 1, 2, or 3
  userNotes?: string | null;
};

export function buildUserMessage(opts: BuildUserMessageOptions): string {
  const blocks: string[] = [
    `<master_cv>\n${opts.masterCvText.trim()}\n</master_cv>`,
    `<job_description>\n${opts.jobDescription.trim()}\n</job_description>`,
    `<attempt_number>${opts.attemptNumber}</attempt_number>`,
  ];
  if (opts.userNotes && opts.userNotes.trim()) {
    blocks.push(`<user_notes>\n${opts.userNotes.trim()}\n</user_notes>`);
  }
  return blocks.join("\n");
}
