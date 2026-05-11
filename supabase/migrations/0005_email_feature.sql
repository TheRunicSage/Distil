-- 0005_email_feature.sql
--
-- Email-delivery feature (v1). Two additive columns:
--
--   1. applications.last_emailed_at TIMESTAMPTZ NULL
--      Set by both the manual /api/applications/[id]/email route and the
--      auto-email pipeline step on successful Resend send. Powers the
--      "Emailed X ago" muted line on the success view.
--
--   2. profiles.email_on_generation BOOLEAN NOT NULL DEFAULT false
--      User preference. When true, the generate-application Inngest
--      pipeline fires an automatic email to the user's auth address
--      immediately after files upload on the success branch. Off by
--      default so the feature is opt-in.
--
-- Both columns are nullable / defaulted, so the migration is non-blocking
-- on existing rows. No backfill needed.

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS last_emailed_at TIMESTAMPTZ NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_on_generation BOOLEAN NOT NULL DEFAULT false;
