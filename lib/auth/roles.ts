// Single source of truth for user roles. Replaces the legacy
// is_admin boolean (dropped in migration 0006) with a discrete
// enum so future paid tiers (pro / enterprise / etc.) slot in
// without touching every is_admin check site.
//
// Capability hierarchy:
//   admin  > team > user
//
// But capabilities are encoded as discrete checks, not as numeric
// levels. Adding a future 'pro' role that gets a higher cost cap
// but no admin access is just a new entry here — no comparisons to
// update. See CLAUDE.md Decision Log [14] 2026-05-13.
//
// NOT server-only — capability predicates and presentation maps are
// imported by both server pages (layout, settings, admin) AND client
// components (UserMenu, TopbarNav, UserRolePicker). The module is
// pure (types + helpers + maps; no DB / fetch / fs / env access) so
// bundling it to the client is safe. Server-side gates that DO need
// privileged access (e.g. requireAdmin) live in `lib/auth/require-admin.ts`
// which keeps its own server-only marker.

export const ROLES = ["user", "team", "admin"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function normaliseRole(value: unknown): Role {
  return isRole(value) ? value : "user";
}

// --- Capability checks -------------------------------------------
// Each capability is a named predicate so call sites read like
// `if (canManageUsers(role))` rather than `if (role === 'admin')`.
// Adding a new role: add an entry to whichever capabilities apply.

export function isAdmin(role: Role | null | undefined): boolean {
  return role === "admin";
}

export function isTeam(role: Role | null | undefined): boolean {
  return role === "team";
}

// Trusted-tier check — true for both team and admin. Used by
// operator-side bypasses (kill switch, daily cost ceiling) where
// internal testers shouldn't be blocked.
export function isTrustedTier(role: Role | null | undefined): boolean {
  return role === "team" || role === "admin";
}

// Per-generation cost caps still apply to everyone (a runaway
// generation is still bad, even for testers). Operator cutoffs
// (kill switch + daily ceiling) do not.
export function bypassesKillSwitch(role: Role | null | undefined): boolean {
  return isTrustedTier(role);
}

export function bypassesDailyCostCeiling(role: Role | null | undefined): boolean {
  return isTrustedTier(role);
}

export function canManageUsers(role: Role | null | undefined): boolean {
  return isAdmin(role);
}

// --- Presentation ------------------------------------------------
// Labels, tones, and one-line descriptions for the admin/users
// role picker. Kept here so adding a future role updates the UI
// automatically.

export const ROLE_LABELS: Record<Role, string> = {
  user: "User",
  team: "Team",
  admin: "Admin",
};

// Tailwind classes for the role chip — same shape as STATUS_TONE
// on the application detail page (matching tone families across
// the admin surface).
export const ROLE_TONES: Record<Role, string> = {
  user: "bg-dim/15 text-muted-foreground border-border",
  team: "bg-info/15 text-info border-info/30",
  admin: "bg-orange/15 text-orange border-orange/30",
};

// One-line descriptions surfaced in the role picker popover.
// Plain English, recruiter-friendly — the team-tier description
// reads as a privilege, not a warning.
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  user: "Standard account. Full app access subject to platform limits.",
  team: "Internal team or tester. Bypasses kill switch and daily cost ceiling; per-generation cost caps still apply.",
  admin: "Full access. Manage roles, view admin pages, see every user's logs.",
};
