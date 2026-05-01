-- 0003_preserve_generations_after_user_delete.sql
-- Generations stay alive through account deletion and only expire on
-- the existing 60-day files_expire_at clock (file blobs) and 1-year
-- metadata_expires_at clock (DB rows). Behaviour change: deleting a
-- user no longer cascades to applications / master_cvs / token_usage;
-- the FK is now ON DELETE SET NULL on those tables.
--
-- profiles still cascade-delete (1:1 user metadata with no value
-- after the user is gone). idempotency_keys still cascade (10-min
-- TTL anyway). request_logs and telemetry_events were already
-- SET NULL in 0001 and stay that way.
--
-- The expire-files / expire-metadata crons run as service-role and
-- already key off files_expire_at / metadata_expires_at, not
-- user_id, so they sweep orphaned generations on the same schedule.
-- RLS policies still match `auth.uid() = user_id`; with user_id
-- nulled, no end-user can read the row, only the service role can
-- (which is the desired post-deletion privacy stance).

begin;

-- applications.user_id
alter table public.applications
  alter column user_id drop not null;
alter table public.applications
  drop constraint applications_user_id_fkey;
alter table public.applications
  add constraint applications_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

-- master_cvs.user_id (applications.master_cv_id references this row;
-- if we let cascade fire, every app referencing the deleted user's
-- master CV would break the FK to it. Keep master_cvs around.)
alter table public.master_cvs
  alter column user_id drop not null;
alter table public.master_cvs
  drop constraint master_cvs_user_id_fkey;
alter table public.master_cvs
  add constraint master_cvs_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

-- token_usage.user_id (billing record; preserve for accounting)
alter table public.token_usage
  alter column user_id drop not null;
alter table public.token_usage
  drop constraint token_usage_user_id_fkey;
alter table public.token_usage
  add constraint token_usage_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

commit;
