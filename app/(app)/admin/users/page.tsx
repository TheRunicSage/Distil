// Admin users page. Reads auth.users via the service-role client's
// admin API (supabase.auth.admin.listUsers) and joins each row to its
// matching profile so we can show the is_admin flag inline. The point
// of this page: a single place to see every email registered with the
// app, plus when they signed up and last signed in.

import { createServiceClient } from "@/lib/supabase/service";
import { userPillLabel, userPillTone } from "@/lib/admin/user-pill";

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

  const [usersRes, profilesRes, deletionsRes] = await Promise.all([
    service.auth.admin.listUsers({ page: 1, perPage: LIST_PAGE_SIZE }),
    service.from("profiles").select("id, is_admin"),
    service
      .from("account_deletions")
      .select("id, deleted_at")
      .order("deleted_at", { ascending: false })
      .limit(50),
  ]);

  const users = usersRes.data?.users ?? [];
  const profileById = new Map<string, { is_admin: boolean | null }>();
  for (const p of profilesRes.data ?? []) {
    profileById.set(p.id, { is_admin: p.is_admin });
  }
  const deletions = deletionsRes.data ?? [];

  const sorted = [...users].sort((a, b) => {
    const aAt = new Date(a.created_at ?? 0).getTime();
    const bAt = new Date(b.created_at ?? 0).getTime();
    return bAt - aAt;
  });

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-4xl font-semibold text-text">Users</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Every email registered with the app. {sorted.length} total.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Registered" value={String(sorted.length)} />
        <Stat
          label="Admins"
          value={String(
            sorted.filter((u) => profileById.get(u.id)?.is_admin).length,
          )}
        />
        <Stat label="Account deletions" value={String(deletions.length)} />
      </section>

      <section className="panel overflow-x-auto">
        <table className="w-full table-auto text-lg">
          <thead className="bg-dark2 text-left text-base font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <tr>
              <th className="whitespace-nowrap px-3 py-3.5">User</th>
              <th className="whitespace-nowrap px-3 py-3.5">Email</th>
              <th className="whitespace-nowrap px-3 py-3.5">Created</th>
              <th className="hidden whitespace-nowrap px-3 py-3.5 lg:table-cell">Last sign-in</th>
              <th className="hidden whitespace-nowrap px-3 py-3.5 sm:table-cell">Confirmed</th>
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
              const profile = profileById.get(u.id);
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
                  <td className="px-3 py-4 text-base">
                    {u.email ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-base text-muted-foreground">
                    {formatDate(u.created_at)}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-4 text-base text-muted-foreground lg:table-cell">
                    {formatDate(u.last_sign_in_at ?? null)}
                  </td>
                  <td className="hidden px-3 py-4 text-base sm:table-cell">
                    {u.email_confirmed_at ? (
                      <span className="text-success">Yes</span>
                    ) : (
                      <span className="text-muted-foreground">No</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-right text-base">
                    {profile?.is_admin ? (
                      <span className="text-orange">Admin</span>
                    ) : (
                      <span className="text-muted-foreground">User</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {deletions.length > 0 && (
        <section className="panel p-8">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-orange">
            Recent deletions
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            Email addresses are stored hashed (sha256) for privacy; this list
            shows the timeline only.
          </p>
          <ul className="mt-6 divide-y divide-border text-base">
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
    <div className="panel p-6">
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-orange">
        {label}
      </p>
      <p className="mt-3 text-4xl font-semibold text-text">{value}</p>
    </div>
  );
}
