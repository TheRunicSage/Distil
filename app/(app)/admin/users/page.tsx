// Admin users page. Reads auth.users via the service-role client's
// admin API (supabase.auth.admin.listUsers) and joins each row to
// its matching profile to show role + manage role assignment inline.
//
// Migration 0006_user_roles.sql replaced the legacy is_admin boolean
// with profiles.role ('user' | 'team' | 'admin'). Adding future paid
// tiers (pro / enterprise) is a single-line update in
// lib/auth/roles.ts + a CHECK-constraint widening migration; the
// stats + table here pick them up automatically. See CLAUDE.md
// Decision Log [14] 2026-05-13.
//
// Style notes:
//   - Stat row shows counts by role plus account deletions. Adding
//     a future role adds a new Stat card via the ROLES array.
//   - Role chip is the same shape as STATUS_TONE on the application
//     detail page so the admin surface stays visually consistent.
//   - UserRolePicker is a per-row segmented control — three pills
//     inline, current one filled, click any other to change. The
//     server action has the last-admin guard; the picker disables
//     itself optimistically on click while the action resolves.

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { userPillLabel, userPillTone } from "@/lib/admin/user-pill";
import {
  ROLE_LABELS,
  ROLE_TONES,
  ROLES,
  normaliseRole,
  type Role,
} from "@/lib/auth/roles";
import { UserRolePicker } from "@/components/admin/UserRolePicker";

export const dynamic = "force-dynamic";

const LIST_PAGE_SIZE = 200;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NZ", {
    timeZone: "Pacific/Auckland",
  });
}

export default async function AdminUsersPage() {
  const service = createServiceClient();
  // Read the current admin's id so the picker can disable self-
  // destructive transitions client-side (server-side last-admin
  // guard still applies regardless).
  const supabase = await createClient();
  const { data: sessionUser } = await supabase.auth.getUser();
  const selfId = sessionUser.user?.id ?? null;

  const [usersRes, profilesRes, deletionsRes] = await Promise.all([
    service.auth.admin.listUsers({ page: 1, perPage: LIST_PAGE_SIZE }),
    service.from("profiles").select("id, role"),
    service
      .from("account_deletions")
      .select("id, deleted_at")
      .order("deleted_at", { ascending: false })
      .limit(50),
  ]);

  const users = usersRes.data?.users ?? [];
  const roleById = new Map<string, Role>();
  for (const p of profilesRes.data ?? []) {
    roleById.set(p.id, normaliseRole(p.role));
  }
  const deletions = deletionsRes.data ?? [];

  const sorted = [...users].sort((a, b) => {
    const aAt = new Date(a.created_at ?? 0).getTime();
    const bAt = new Date(b.created_at ?? 0).getTime();
    return bAt - aAt;
  });

  // Per-role counts. Iterates over the canonical ROLES array so
  // adding a future role surfaces in stats automatically.
  const countsByRole: Record<Role, number> = { user: 0, team: 0, admin: 0 };
  for (const u of sorted) {
    const role = roleById.get(u.id) ?? "user";
    countsByRole[role] += 1;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-text">Users</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Every email registered with the app. {sorted.length} total.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat label="Registered" value={String(sorted.length)} />
        {ROLES.map((role) => (
          <Stat
            key={role}
            label={`${ROLE_LABELS[role]}s`}
            value={String(countsByRole[role])}
          />
        ))}
        <Stat label="Deletions" value={String(deletions.length)} />
      </section>

      <section className="panel overflow-x-auto">
        <table className="w-full table-auto text-base">
          <thead className="bg-dark2 text-left text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <tr>
              <th className="whitespace-nowrap px-3 py-3.5">User</th>
              <th className="whitespace-nowrap px-3 py-3.5">Email</th>
              <th className="whitespace-nowrap px-3 py-3.5">Created</th>
              <th className="hidden whitespace-nowrap px-3 py-3.5 lg:table-cell">
                Last sign-in
              </th>
              <th className="hidden whitespace-nowrap px-3 py-3.5 sm:table-cell">
                Confirmed
              </th>
              <th className="whitespace-nowrap px-3 py-3.5 text-right">Role</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No registered users.
                </td>
              </tr>
            )}
            {sorted.map((u) => {
              const role = roleById.get(u.id) ?? "user";
              const isSelf = u.id === selfId;
              return (
                <tr
                  key={u.id}
                  className="border-t border-border text-text/90"
                >
                  <td className="whitespace-nowrap px-3 py-4">
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-0.5 font-mono text-xs font-semibold ${userPillTone(u.id)}`}
                      title={`user ${u.id}`}
                    >
                      {userPillLabel(u.id)}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-sm">
                    <span className="inline-flex items-center gap-2">
                      {u.email ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {isSelf && (
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-semibold uppercase tracking-[0.08em] ${ROLE_TONES[role]}`}
                        >
                          You
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-sm text-muted-foreground">
                    {formatDate(u.created_at)}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-3.5 text-sm text-muted-foreground lg:table-cell">
                    {formatDate(u.last_sign_in_at ?? null)}
                  </td>
                  <td className="hidden px-3 py-3.5 text-sm sm:table-cell">
                    {u.email_confirmed_at ? (
                      <span className="text-success">Yes</span>
                    ) : (
                      <span className="text-muted-foreground">No</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-right">
                    <UserRolePicker
                      userId={u.id}
                      email={u.email ?? "(no email)"}
                      currentRole={role}
                      isSelf={isSelf}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {deletions.length > 0 && (
        <section className="panel p-6">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-orange">
            Recent deletions
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Email addresses are stored hashed (sha256) for privacy; this list
            shows the timeline only.
          </p>
          <ul className="mt-5 divide-y divide-border text-sm">
            {deletions.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between py-3"
              >
                <span className="font-mono text-text/80">
                  {d.id.slice(0, 8)}
                </span>
                <span className="text-muted-foreground">
                  {new Date(d.deleted_at).toLocaleString("en-NZ", {
                    timeZone: "Pacific/Auckland",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-text">{value}</p>
    </div>
  );
}
