# Recruitment Inference

Reference for `extract-entities` Step 7b. Enrich `Knowledge/Roles/` and
`Knowledge/Candidates/` with metadata that no single source carries.

## Requisition number detection

Scan email subjects and bodies for requisition numbers (e.g. 7-digit Workday
IDs).

1. `ls Knowledge/Roles/ | grep "{req_number}"` — does a Role file exist?
2. **No file:** create a stub using the Role-stub template in `req-track` Step
   0b. Search `rg "{req_number}" Knowledge/` for context to enrich it.
3. **File exists:** check whether the email provides new metadata (hiring
   manager, recruiter, locations) and update the Role file.

## Hiring manager — calendar inference

When a calendar event title matches an interview pattern — "Interview",
"Screening", "Screen", "Decomposition", "Panel", "Technical Assessment",
"Candidate" — combined with a person name:

1. Cross-reference the candidate against `Knowledge/Candidates/`.
2. Extract the **organizer**. If the organizer isn't the user (per
   `~/.cache/fit/outpost/state/identity.md`),
   they are likely the hiring manager.
3. Confirm: look up the organizer in `Knowledge/People/` for a manager/HM role
   indication.
4. Check the candidate's `brief.md` for a `Req` field; if known, set the
   matching Role file's `Hiring manager` (only if currently `—`).
5. Set the candidate's `brief.md` `Hiring manager` field if currently `—`.

## Recruiter — email-thread inference

When a thread references candidates (name match against
`Knowledge/Candidates/`):

1. Cross-reference To/CC against `Knowledge/People/`.
2. If a CC'd person's note mentions "recruiter", "talent acquisition", or a
   similar role, they are likely the internal recruiter.
3. Update the candidate's `brief.md` recruiter field and the matching Role file
   (only if currently `—`).

## Domain lead — reporting-chain resolution

When a hiring manager is newly identified:

1. Read their People note for `**Reports to:**`.
2. Walk up the chain to a VP or senior leader listed in a stakeholder map or
   organizational hierarchy note.
3. Set both the Role file's `Domain lead` and the candidate brief's
   `Domain lead`.

## Conservatism

Set hiring manager / domain lead / recruiter only when evidence is strong. A
single calendar invite organized by someone is suggestive but not conclusive —
confirm against People notes or multiple data points before setting the field.
