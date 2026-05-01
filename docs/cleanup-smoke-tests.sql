-- Cleanup snippet for the original ~18 smoke-test applications.
-- Paste into the Supabase SQL Editor.
--
-- IMPORTANT: the SQL Editor runs as the postgres role, not as a
-- logged-in user. `auth.uid()` returns NULL there, so any filter
-- like `where user_id = auth.uid()` silently matches zero rows
-- and the DELETE looks like it worked while doing nothing
-- (CLAUDE.md Decision Log [12] note). Filter by the literal user
-- UUID instead. Find it under Authentication → Users for
-- jalaaaj@curiosum.ai.
--
-- Run the SELECT first to confirm you're about to nuke the right
-- rows, then run the DELETE.

-- ============================================================
-- 1) INSPECT — paste the user UUID and review the rows.
-- ============================================================
-- Replace 'PASTE-USER-UUID-HERE' below with the actual UUID.
SELECT
  id,
  status,
  attempt_number,
  parent_application_id,
  created_at,
  started_at,
  completed_at
FROM applications
WHERE user_id = 'PASTE-USER-UUID-HERE'
ORDER BY created_at ASC;

-- ============================================================
-- 2) DELETE — only after confirming the count above is the 18
--    smoke-test rows you wanted gone (and not real generations).
--    If you've made real submissions since, narrow this further
--    with `AND created_at < 'YYYY-MM-DD HH:MM:SSZ'` so today's
--    work isn't caught.
-- ============================================================
-- BEGIN;
-- DELETE FROM applications
-- WHERE user_id = 'PASTE-USER-UUID-HERE'
--   -- AND created_at < '2026-04-30 00:00:00+00'  -- uncomment if needed
-- ;
-- -- Inspect the count Postgres reports before COMMIT.
-- COMMIT;
--
-- Notes:
--   * applications has FK references from token_usage and
--     request_logs. If their FK constraints don't have ON DELETE
--     CASCADE, the DELETE will error and you'll need to clear
--     those tables for the same ids first. Check with:
--       SELECT conname, conrelid::regclass, confrelid::regclass,
--              confdeltype
--       FROM pg_constraint
--       WHERE confrelid = 'applications'::regclass;
--     `confdeltype = 'c'` means CASCADE, `'a'` means NO ACTION.
--   * Storage objects under generated/{user_id}/{application_id}/
--     are independent — the expire-files cron will sweep them on
--     its next run, or you can delete the folder via the Storage UI.
