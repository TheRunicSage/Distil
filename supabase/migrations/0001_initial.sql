-- Initial schema for Distil. Source of truth: app_handoff_v8.md §6.2.
-- Tables: profiles, master_cvs, applications, generation_events,
-- account_deletions, request_logs, token_usage, idempotency_keys,
-- telemetry_events. Plus the application_status enum and the
-- on_auth_user_created trigger that mirrors auth.users into profiles.

-- ===== Profiles =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  is_admin boolean not null default false
);
alter table public.profiles enable row level security;
create policy "profiles_self_read" on public.profiles for select using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, created_at) values (new.id, now())
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== Master CVs =====
create table public.master_cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  file_size_bytes integer not null,
  parsed_text text,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by uuid references public.master_cvs(id)
);
create unique index master_cvs_one_current_per_user
  on public.master_cvs (user_id) where superseded_at is null;
create index master_cvs_superseded_at_idx
  on public.master_cvs (superseded_at) where superseded_at is not null;
alter table public.master_cvs enable row level security;
create policy "master_cvs_owner_all" on public.master_cvs
  for all using (auth.uid() = user_id);

-- ===== Applications =====
create type public.application_status as enum (
  'queued', 'paused', 'running', 'rendering',
  'success', 'insufficient_input', 'abandoned', 'error', 'cancelled'
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  master_cv_id uuid not null references public.master_cvs(id),
  parent_application_id uuid references public.applications(id),
  job_description text not null,
  user_notes text,
  region text not null default 'NZ',
  attempt_number integer not null default 1,
  status public.application_status not null default 'queued',
  queue_position integer not null,
  inngest_run_id text,
  llm_response_json jsonb,
  insufficient_input_reason text,
  error_message text,
  cv_storage_path text,
  letter_storage_path text,
  files_expire_at timestamptz,
  metadata_expires_at timestamptz,
  files_deleted_at timestamptz,
  abandoned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  -- v6 additions:
  system_prompt_version text not null default 'v2',
  is_demo boolean not null default false,
  email_send_count integer not null default 0
);
create index applications_user_id_idx on public.applications (user_id);
create index applications_status_idx on public.applications (status);
create index applications_queue_idx
  on public.applications (user_id, queue_position)
  where status in ('queued', 'paused');
create index applications_files_expiry_idx
  on public.applications (files_expire_at)
  where files_deleted_at is null and status = 'success' and is_demo = false;
create index applications_metadata_expiry_idx
  on public.applications (metadata_expires_at) where is_demo = false;
create index applications_stuck_idx
  on public.applications (started_at) where status = 'running';
alter table public.applications enable row level security;
create policy "applications_owner_all" on public.applications
  for all using (auth.uid() = user_id);

-- ===== Generation Events =====
create table public.generation_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  application_id uuid not null references public.applications(id) on delete cascade,
  phase text not null,
  payload jsonb
);
create index generation_events_application_id_idx
  on public.generation_events (application_id, created_at);
alter table public.generation_events enable row level security;
create policy "generation_events_owner_read" on public.generation_events for select using (
  exists (
    select 1 from public.applications a
    where a.id = generation_events.application_id and a.user_id = auth.uid()
  )
);

-- ===== Account Deletions =====
create table public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  hashed_email text not null,
  deleted_at timestamptz not null default now(),
  reason text
);
alter table public.account_deletions enable row level security;
-- no public policies; admin-only via service role

-- ===== Request Logs =====
create table public.request_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  source text not null check (source in ('api_route', 'inngest_step', 'cron')),
  name text not null,
  duration_ms integer not null,
  status text not null check (status in ('ok', 'error')),
  error_code text,
  error_message text,
  metadata jsonb
);
create index request_logs_created_at_idx on public.request_logs (created_at desc);
create index request_logs_user_id_idx on public.request_logs (user_id);
create index request_logs_application_id_idx on public.request_logs (application_id);
create index request_logs_status_idx on public.request_logs (status) where status = 'error';
alter table public.request_logs enable row level security;
create policy "request_logs_admin_read" on public.request_logs for select using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

-- ===== Token Usage =====
create table public.token_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  web_search_count integer not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  metadata jsonb
);
create index token_usage_created_at_idx on public.token_usage (created_at desc);
create index token_usage_user_id_idx on public.token_usage (user_id);
create index token_usage_application_id_idx on public.token_usage (application_id);
alter table public.token_usage enable row level security;
create policy "token_usage_admin_read" on public.token_usage for select using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

-- ===== Idempotency Keys =====
create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  route text not null,
  request_hash text not null,
  response_status integer not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  unique (user_id, key, route)
);
create index idempotency_keys_expires_at_idx on public.idempotency_keys (expires_at);
alter table public.idempotency_keys enable row level security;
-- no public policies; service-role only

-- ===== Telemetry Events =====
create table public.telemetry_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  request_id uuid,
  session_id text,
  name text not null,
  properties jsonb
);
create index telemetry_events_created_at_idx on public.telemetry_events (created_at desc);
create index telemetry_events_name_idx on public.telemetry_events (name);
create index telemetry_events_user_id_idx on public.telemetry_events (user_id);
create index telemetry_events_application_id_idx on public.telemetry_events (application_id);
create index telemetry_events_request_id_idx on public.telemetry_events (request_id);
alter table public.telemetry_events enable row level security;
create policy "telemetry_admin_read" on public.telemetry_events for select using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);
