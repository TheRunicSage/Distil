# Manual verification gate

Block the internal-team rollout on this. Skipping it defeats half the
point of building the safety nets (spec §7.6 Tier 1 #7).

The output quality scanner catches mechanical issues; only a human
catches "this sounds wrong." Read three real generations end to end
before opening to anyone else.

## Setup

1. Create the admin user in Supabase dashboard, then set `is_admin`:
   ```sql
   update public.profiles set is_admin = true where id = '<admin-user-id>';
   ```
2. Sign in at `/login`. Confirm topbar shows the **Admin** link.
3. Upload a real master CV at `/upload`.
4. Have three real, varied job descriptions ready (different roles,
   different seniorities, ideally one public-sector to exercise the
   Te Tiriti rule).

## For each of the three generations

Submit at `/application/new`. Wait for `success`. On the result page:

### Cover letter

- [ ] Date is today's date in NZ format (e.g. "29 April 2026"), **not** `{{TODAY}}`.
- [ ] Salutation is `Kia ora [Name]` if a name was visible in the JD,
      else `Kia ora` (no fallback to "Dear Hiring Manager").
- [ ] Sign-off uses `Nga mihi`.
- [ ] No em or en dashes anywhere.
- [ ] No banned phrases (skim §2.2 of `prompts/system-prompt-v2.md`).
- [ ] Paragraph 2 tells **one specific story** with a concrete number
      or scope, not a list of skills.
- [ ] Paragraph 3 references a **real, verifiable** company project,
      initiative, or value (not a generic "I admire your culture").
- [ ] If public sector and the master CV doesn't show genuine Te Ao
      Maori engagement, no Te Tiriti acknowledgement appears. If it
      does, it's specific (not performative).

### CV

- [ ] Profile length matches the seniority detected (3-4 sentences for
      Graduate/Junior, 3 for Mid, 2-3 for Senior, 2-3 for Lead/Principal).
- [ ] Profile doesn't sound like something the next applicant could
      write — concrete projects/numbers/tools are present.
- [ ] Section order matches §4.1 of the system prompt.
- [ ] No fabricated dates, employers, projects, numbers, or referees.
- [ ] No tables, columns, or graphics.
- [ ] Calibri 11pt body throughout (verify in Word).
- [ ] Filename is `{lastname}_CV_{company_short}_{yyyymmdd}.docx`.

### Fit assessment

- [ ] Score reasoning is honest about gaps, not falsely positive.
- [ ] Warnings list the specific things the candidate should know.

### What we did checklist

- [ ] 5-8 items, each tied to something visible in the documents.
- [ ] No "we tried but couldn't find" items.
- [ ] No generic "wrote a cover letter" items.

### Documents

- [ ] CV downloads successfully via the button.
- [ ] Cover letter downloads successfully.
- [ ] Both open cleanly in Word and Pages.

## Sign-off

If all three generations pass: open the demo to the internal team.
If any fail: revise the prompt or relevant code, run the gate again
on three fresh JDs.
