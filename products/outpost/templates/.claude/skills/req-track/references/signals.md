# Recruitment Signals

Decide whether an email thread is recruitment-related. Skip threads that match
no signal — most email is not.

## CV/resume attachments

`~/.cache/fit/outpost/apple_mail/attachments/{thread_id}/` contains `.pdf` or
`.docx` files with candidate names in the filename.

## Recruiter sender domains

Sender domain maps to an organization in `Knowledge/Organizations/` tagged as a
recruitment agency. When no agencies are catalogued yet, treat these patterns as
hints:

- Multiple candidates presented by the same sender
- Structured profile formatting (rate, availability, skills)
- Forwarding candidate CVs on behalf of others

## Profile presentation patterns

Structured candidate descriptions containing:

- "Rate:" or rate/cost information
- "Availability:" or notice period
- "English:" or language level
- "Location:" or country/city
- Candidate name + role formatting (e.g. "Staff Software Engineer")
- "years of experience" / "YoE"
- Skills/tech stack listings

## Interview scheduling

- "schedule a call", "schedule an interview"
- "first interview", "second interview", "technical interview"
- "interview slot", "available for a call"

## Follow-up on existing candidates

A thread mentions a candidate already in `Knowledge/Candidates/` by name —
process it to update pipeline status.
