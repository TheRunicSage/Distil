-- Adds master_cvs.missing_fields — codes for contact-detail fields the
-- parser couldn't detect in the uploaded CV text. Populated at upload
-- time by a regex heuristic (lib/parsing/detect-missing-fields.ts).
-- Surfaced in the (app) UI via the <MissingFieldsBadge> primitive as a
-- soft reminder to the user that their CV would be sharper with these
-- fields present.
--
-- Possible codes (the five "absolutely necessary" fields per the
-- 2026-05-11 product decision):
--   - 'surname'  — first name detectable, surname not
--   - 'phone'    — no phone-number pattern found
--   - 'email'    — no email-address pattern found
--   - 'linkedin' — no linkedin URL or "linkedin" handle reference found
--   - 'location' — no city / region / country pattern found
--
-- Nullable + default null so existing rows are unchanged and only
-- become populated as users re-upload. Empty array `{}` means
-- "parser ran and found everything" — distinct from null which means
-- "parser hadn't run yet".

alter table public.master_cvs
  add column if not exists missing_fields text[];

comment on column public.master_cvs.missing_fields is
  'Codes for contact-detail fields not detected at parse time. Possible values: surname, phone, email, linkedin, location. Null = not yet detected; {} = all fields present.';
