# Candidate Field Extraction

Field map and resolution rules for Step 2 of `req-track`.

## Fields

| Field             | Source                                                       | Required            |
| ----------------- | ------------------------------------------------------------ | ------------------- |
| Name              | Filename, email body, CV                                     | Yes                 |
| Title             | Email body, CV — the candidate's professional title/function | Yes                 |
| Rate              | Email body (e.g. "$120/hr", "€80/h")                         | If available        |
| Availability      | Email body (e.g. "1 month notice", "immediately")            | If available        |
| English           | Email body (e.g. "B2", "Upper-intermediate")                 | If available        |
| Location          | Email body, CV                                               | If available        |
| Source agency     | Sender domain → Organization                                 | Yes                 |
| Recruiter         | Email sender or CC'd recruiter                               | Yes                 |
| CV path           | Attachment directory                                         | If available        |
| Skills            | Email body, CV                                               | If available        |
| Gender            | Pronouns or gendered titles only                             | If identifiable     |
| Summary           | Email body, CV                                               | Yes — 2-3 sentences |
| Role              | Internal requisition profile being hired against             | If available        |
| Req               | Requisition ID from hiring system                            | If available        |
| Channel           | `hr` or `vendor` — see below                                 | Yes                 |
| Hiring manager    | Cross-source inference — see below                           | If determinable     |
| Domain lead       | Resolved from hiring manager's reporting chain               | If determinable     |
| Internal/External | Whether candidate is internal or external                    | If available        |
| Model             | Engagement model (B2B, Direct Hire, etc.)                    | If available        |
| Current title     | CV or email body                                             | If available        |
| Email             | Email body, CV, signature                                    | If available        |
| Phone             | Email body, CV, signature                                    | If available        |
| LinkedIn          | Email body, CV                                               | If available        |
| Also known as     | Alternate name spellings or transliterations                 | If available        |

## Channel

- `vendor` — Source links to an `[[Organizations/...]]` flagged as
  vendor/partner (keywords: supplier, recruitment partner, contractor,
  staffing), or Req contains "via {vendor name}" rather than a system ID.
- `hr` — candidate came through a hiring system (numeric Req), applied
  internally, or was submitted by an internal recruiter.

## Hiring manager and domain lead — resolution chain

Stop at the first match:

1. **Req-first inheritance** — search `Knowledge/Roles/` for a file matching the
   Req number or role description (use filename substring lookup for req-less
   roles); check the `**Status:**` field (open/closed), then inherit Hiring
   manager and Domain lead from the Role file.
2. **Calendar inference** —
   `rg -l "{Candidate Name}" ~/.cache/fit/outpost/apple_calendar/`. The non-user
   organizer of an interview event is likely the hiring manager.
3. **Email inference** — internal To/CC recipients (besides the user)
   cross-checked against `Knowledge/People/`.
4. **Reporting chain** — read the hiring manager's `**Reports to:**` field; walk
   up to a VP / senior leader for the domain lead.
5. **Staffing project timeline** — search staffing notes for the candidate or
   vendor; surrounding context often names the manager.

If none resolve, set `—` and revisit on the next cycle.

## Gender

Record only when **explicitly stated**:

- Pronouns from the recruiter ("she is available", "her CV attached")
- Gendered titles ("Ms.", "Mrs.", "Mr.")

Record as `Woman`, `Man`, or `—` (unknown). When uncertain, use `—`. **Never
infer gender from names** — name-based inference is unreliable and culturally
biased. The field supports aggregate diversity tracking; it has no bearing on
hiring decisions, assessment criteria, or candidate visibility.

## Source and recruiter

- Map sender email domain to an organization in `Knowledge/Organizations/`.
- The person who sent or forwarded the profile is the recruiter — link with
  `[[People/Name]]`.
- Create the organization or recruiter notes if missing.

## CV attachment

```bash
ls ~/.cache/fit/outpost/apple_mail/attachments/{thread_id}/
mkdir -p "Knowledge/Candidates/{Full Name}"
cp "~/.cache/fit/outpost/apple_mail/attachments/{thread_id}/{file}" \
   "Knowledge/Candidates/{Full Name}/CV.pdf"
```

Use `CV.pdf` (PDF) or `CV.docx` (Word). The `## CV` link is `./CV.pdf`.

## Headshot discovery

Search both locations:

1. **Email attachments** —
   `~/.cache/fit/outpost/apple_mail/attachments/{thread_id}/`. Filter to
   portrait images (skip logos, signatures, `image001.png`).
2. **Downloads** —

   ```bash
   find ~/Downloads -maxdepth 3 -type f \
     \( -iname "*.jpg" -o -iname "*.jpeg" \
       -o -iname "*.png" -o -iname "*.heic" \) 2>/dev/null
   ```

Match by name fragment (case-insensitive). Prefer the Downloads match. Always
write `headshot.jpeg`:

```bash
cp "{src}" "Knowledge/Candidates/{Full Name}/headshot.jpeg"
# PNG → JPEG
magick "{src}.png" "Knowledge/Candidates/{Full Name}/headshot.jpeg"
# HEIC → JPEG
magick "{src}.heic" "Knowledge/Candidates/{Full Name}/headshot.jpeg"
```
