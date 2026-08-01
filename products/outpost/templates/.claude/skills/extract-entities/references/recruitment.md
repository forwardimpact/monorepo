# Recruitment Inference

Reference for `extract-entities` Step 7b. Enrich `Knowledge/Roles/` and
`Knowledge/Candidates/` with metadata that no single source carries.

All Role files are flat in `Knowledge/Roles/`. The `**Status:**` field
distinguishes:

- **`Status: open`** — active openings (use for new candidates and table
  rebuilds).
- **`Status: closed`** — completed/withdrawn roles (read-only).

## Requisition number detection

Scan email subjects and bodies for requisition numbers (e.g. 7-digit Workday
IDs).

1. `ls Knowledge/Roles/ | grep "{req_number}"` — find out whether a Role file
   exists.
2. **No file:** create a stub with the Role-stub template in `req-track` Step
   0b, and set `**Status:** open`. Search `rg "{req_number}" Knowledge/` for
   context to enrich it.
3. **File exists:** check the `**Status:**` field. If `open`, check whether the
   email provides new metadata (hiring manager, recruiter, locations). Then
   update the Role file. If `closed`, link for historical reference only. Do not
   add new candidates. Do not rebuild tables.

## Hiring manager — calendar inference

A calendar event title can match an interview pattern ("Interview", "Screening",
"Screen", "Decomposition", "Panel", "Technical Assessment", "Candidate") and
also carry a person name. When it does:

1. Cross-reference the candidate against `Knowledge/Candidates/`.
2. Extract the **organizer**. If the organizer isn't the user (per
   `~/.cache/fit/outpost/state/identity.md`),
   they are likely the hiring manager.
3. Confirm the hiring manager. Look up the organizer in `Knowledge/People/` for
   an indication of a manager or HM role.
4. Check the candidate's `brief.md` for a `Req` field. If you know the req, set
   the matching Role file's `Hiring manager` (only if it is currently `—`).
5. Set the candidate's `brief.md` `Hiring manager` field if it is currently `—`.

## Recruiter — email-thread inference

When a thread references candidates (name match against
`Knowledge/Candidates/`):

1. Cross-reference To/CC against `Knowledge/People/`.
2. If a CC'd person's note mentions "recruiter", "talent acquisition", or a
   similar role, they are likely the internal recruiter.
3. Update the candidate's `brief.md` recruiter field and the matching Role file
   (only if it is currently `—`).

## Domain lead — reporting-chain resolution

When a hiring manager is newly identified:

1. Read their People note for `**Reports to:**`.
2. Walk up the chain to a VP or senior leader listed in a stakeholder map or
   organizational hierarchy note.
3. Set both the Role file's `Domain lead` and the candidate brief's
   `Domain lead`.

## Conservatism

Set hiring manager / domain lead / recruiter only when the evidence is strong. A
single calendar invite from one organizer is suggestive but not conclusive.
Confirm against People notes or multiple data points before you set the field.
