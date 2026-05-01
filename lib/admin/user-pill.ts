// Deterministic colour pill for user identifiers in the admin panel.
//
// Hashes a user_id to one of N palette tones so the same user always
// renders in the same colour across pages — admins can scan a long
// table of mixed activity and tell at a glance "all these errors are
// from the same person" without reading every UUID.
//
// The palette draws only from existing brand tokens (semantic accents
// + brand orange), so colours stay within the design system and remain
// visible in both light and dark modes via the var() cascade.

const PALETTE = [
  "bg-info/15 text-info border-info/30",
  "bg-success/15 text-success border-success/30",
  "bg-warn/15 text-warn border-warn/30",
  "bg-innovation/15 text-innovation border-innovation/30",
  "bg-danger/15 text-danger border-danger/30",
  "bg-orange/15 text-orange border-orange/30",
] as const;

const NULL_TONE = "bg-dim/15 text-muted-foreground border-border";

function hashString(s: string): number {
  // FNV-1a 32-bit. Cheap, deterministic, well-distributed for short
  // strings like UUIDs. Returns a non-negative integer.
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function userPillTone(userId: string | null | undefined): string {
  if (!userId) return NULL_TONE;
  return PALETTE[hashString(userId) % PALETTE.length];
}

export function userPillLabel(userId: string | null | undefined): string {
  if (!userId) return "—";
  return userId.slice(0, 8);
}
