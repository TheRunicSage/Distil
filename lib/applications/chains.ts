// Application chain helpers. A "chain" = an original application plus
// every retry that descends from it via parent_application_id.
// Dashboard + History both render chains rather than flat rows so a
// retry doesn't double-list the original.
//
// Effective status rule: a chain "succeeds" if any descendant has
// status='success'. Otherwise the latest descendant's status wins,
// with system-fault states (error / cancelled) collapsed to a single
// "didn't finish" label for users.

import type { ApplicationOutput, ApplicationOutputSuccess } from "@/lib/llm/output-schema";

export type FlatRow = {
  id: string;
  status: string;
  parent_application_id: string | null;
  created_at: string;
  completed_at: string | null;
  llm_response_json: ApplicationOutput | null;
};

export type ChainAttempt = {
  id: string;
  status: string;
  created_at: string;
  effectiveLabel: string;
  effectiveTone: ChainTone;
};

export type ChainCard = {
  rootId: string;
  title: string | null;
  fallbackId: string;
  effectiveStatus: ChainStatus;
  effectiveLabel: string;
  effectiveTone: ChainTone;
  // Anchor row (success-leaf if present, else latest leaf) — clicking
  // the card opens this id.
  anchorId: string;
  latestActivityAt: string;
  attempts: ChainAttempt[];
};

export type ChainStatus =
  | "ready"
  | "in_progress"
  | "needs_more_info"
  | "didnt_finish"
  | "abandoned";

export type ChainTone = "success" | "warn" | "danger" | "info" | "muted";

const LIVE_STATUSES = new Set([
  "queued",
  "paused",
  "running",
  "rendering",
]);

const RAW_STATUS_META: Record<
  string,
  { label: string; tone: ChainTone }
> = {
  success: { label: "Ready", tone: "success" },
  queued: { label: "Queued", tone: "info" },
  // Paused is a legacy state under Option B — no new rows are written
  // with it; existing ones are swept to cancelled by sweep-paused. Show
  // them as "In progress" until the sweep flips them.
  paused: { label: "In progress", tone: "warn" },
  running: { label: "In progress", tone: "warn" },
  rendering: { label: "In progress", tone: "warn" },
  insufficient_input: { label: "Needs more info", tone: "warn" },
  error: { label: "Didn’t finish", tone: "danger" },
  cancelled: { label: "Didn’t finish", tone: "danger" },
  abandoned: { label: "Abandoned", tone: "muted" },
};

function statusMeta(status: string): { label: string; tone: ChainTone } {
  return RAW_STATUS_META[status] ?? { label: status, tone: "muted" };
}

function deriveTitle(rows: FlatRow[]): string | null {
  // Prefer the earliest successful row (it's the canonical one); fall
  // back to any row with structured output, including insufficient_input
  // payloads (which won't have role/company anyway).
  const candidates = [...rows].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  for (const row of candidates) {
    const json = row.llm_response_json;
    if (!json || json.status !== "success") continue;
    const success = json as ApplicationOutputSuccess;
    const role = success.jd_analysis?.role_archetype?.trim();
    const company = success.cover_letter_content?.header?.company_name?.trim();
    if (role && company) return `${role} @ ${company}`;
    if (role) return role;
    if (company) return company;
  }
  return null;
}

function deriveEffectiveStatus(rows: FlatRow[]): {
  status: ChainStatus;
  label: string;
  tone: ChainTone;
  anchorId: string;
} {
  // Success in chain wins, anchor on the success leaf.
  const success = rows.find((r) => r.status === "success");
  if (success) {
    return {
      status: "ready",
      label: "Ready",
      tone: "success",
      anchorId: success.id,
    };
  }
  // Live status next — anchor on the live leaf.
  const live = rows.find((r) => LIVE_STATUSES.has(r.status));
  if (live) {
    return {
      status: "in_progress",
      label: "In progress",
      tone: "warn",
      anchorId: live.id,
    };
  }
  // Else use the latest row's status. Map to a user-facing label.
  const latest = [...rows].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
  const meta = statusMeta(latest.status);
  let chainStatus: ChainStatus = "didnt_finish";
  if (latest.status === "insufficient_input") chainStatus = "needs_more_info";
  else if (latest.status === "abandoned") chainStatus = "abandoned";
  return {
    status: chainStatus,
    label: meta.label,
    tone: meta.tone,
    anchorId: latest.id,
  };
}

export function groupIntoChains(rows: FlatRow[]): ChainCard[] {
  const byId = new Map<string, FlatRow>();
  for (const r of rows) byId.set(r.id, r);

  // Walk parent links to find each row's chain root within the fetched
  // set. If the actual root is older than our query window, the closest
  // known ancestor stands in as root — still a stable grouping key.
  function findRootId(row: FlatRow): string {
    let current = row;
    const seen = new Set<string>();
    while (
      current.parent_application_id &&
      byId.has(current.parent_application_id) &&
      !seen.has(current.id)
    ) {
      seen.add(current.id);
      const next = byId.get(current.parent_application_id);
      if (!next) break;
      current = next;
    }
    return current.id;
  }

  const groups = new Map<string, FlatRow[]>();
  for (const row of rows) {
    const rootId = findRootId(row);
    const arr = groups.get(rootId) ?? [];
    arr.push(row);
    groups.set(rootId, arr);
  }

  const chains: ChainCard[] = [];
  for (const [rootId, members] of groups) {
    const sortedAsc = [...members].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const title = deriveTitle(members);
    const eff = deriveEffectiveStatus(members);
    const latestActivityAt = sortedAsc[sortedAsc.length - 1].created_at;

    const attempts: ChainAttempt[] = sortedAsc.map((r) => {
      const meta = statusMeta(r.status);
      return {
        id: r.id,
        status: r.status,
        created_at: r.created_at,
        effectiveLabel: meta.label,
        effectiveTone: meta.tone,
      };
    });

    chains.push({
      rootId,
      title,
      fallbackId: rootId.slice(0, 8),
      effectiveStatus: eff.status,
      effectiveLabel: eff.label,
      effectiveTone: eff.tone,
      anchorId: eff.anchorId,
      latestActivityAt,
      attempts,
    });
  }

  // Newest activity first.
  chains.sort(
    (a, b) =>
      new Date(b.latestActivityAt).getTime() -
      new Date(a.latestActivityAt).getTime(),
  );
  return chains;
}

export function chainToneClass(tone: ChainTone): string {
  switch (tone) {
    case "success":
      return "bg-success/15 text-success border-success/30";
    case "warn":
      return "bg-warn/15 text-warn border-warn/30";
    case "danger":
      return "bg-danger/15 text-danger border-danger/30";
    case "info":
      return "bg-info/15 text-info border-info/30";
    case "muted":
    default:
      return "bg-dim/15 text-muted-foreground border-border";
  }
}
