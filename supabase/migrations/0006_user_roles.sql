-- 0006_user_roles.sql
-- Replace boolean profiles.is_admin with text profiles.role, the
-- payment-tier-ready role enum. See CLAUDE.md Decision Log [14]
-- 2026-05-13 (user roles + admin-managed assignment).
--
-- Initial roles:
--   'user'  — default. Standard customer / signed-up account.
--   'team'  — internal team / tester. Bypasses kill switch + daily
--             cost ceiling so internal testing isn't gated by operator
--             cutoffs. Per-generation cost caps still apply.
--   'admin' — full access to /admin/* + user role management.
--             Inherits all team capabilities.
--
-- Schema choice: TEXT + CHECK constraint over a PostgreSQL ENUM type.
-- Reason: adding a future role like 'pro' / 'enterprise' is just an
-- ALTER on the CHECK constraint; with a PG ENUM type, adding values
-- in a transaction is restricted and requires a different migration
-- shape. The flexibility cost over an enum type is one extra
-- constraint definition.
--
-- All RLS policies that referenced is_admin = true are dropped and
-- recreated against role = 'admin'. Same semantics, different column.
-- All application code reads `role` after this migration ships
-- (capability checks live in lib/auth/roles.ts as a single source
-- of truth).

-- 1. Add role with safe default.
alter table public.profiles
  add column role text not null default 'user';

-- 2. Backfill admins from the existing is_admin flag.
update public.profiles set role = 'admin' where is_admin = true;

-- 3. Constrain to the known role set. Adding 'pro' / 'enterprise' /
--    etc. later: ALTER TABLE ... DROP CONSTRAINT profiles_role_check;
--    then ADD CONSTRAINT with the wider set.
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'team', 'admin'));

-- 4. Update RLS policies that gated admin-only reads on is_admin.
drop policy if exists "request_logs_admin_read" on public.request_logs;
create policy "request_logs_admin_read" on public.request_logs for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

drop policy if exists "token_usage_admin_read" on public.token_usage;
create policy "token_usage_admin_read" on public.token_usage for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

drop policy if exists "telemetry_admin_read" on public.telemetry_events;
create policy "telemetry_admin_read" on public.telemetry_events for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- 5. Drop the legacy boolean. After this point every app site reads
--    `role` directly. If you ever need to roll back: re-add is_admin
--    as a generated column = (role = 'admin'), or paste an inverse
--    migration that recreates it as boolean + backfills from role.
alter table public.profiles drop column is_admin;
