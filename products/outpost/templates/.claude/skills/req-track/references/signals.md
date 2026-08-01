# Recruitment Signals

Decide whether an email thread is recruitment-related. Skip threads that match
no signal. Most email is not recruitment-related.

## CV/resume attachments

`~/.cache/fit/outpost/apple_mail/attachments/{thread_id}/` contains `.pdf` or
`.docx` files with candidate names in the filename.

## Recruiter sender domains

The sender domain maps to an organization in `Knowledge/Organizations/` tagged
as a recruitment agency. When no agencies are catalogued yet, treat these
patterns as hints:

- The same sender presents multiple candidates
- The profile uses a structured format (rate, availability, skills)
- The sender forwards candidate CVs on behalf of others

## Profile presentation patterns

Structured candidate descriptions that contain:

- "Rate:" or rate/cost information
- "Availability:" or notice period
- "English:" or language level
- "Location:" or country/city
- Candidate name + role format (e.g. "Staff Software Engineer")
- "years of experience" / "YoE"
- Lists of skills or the tech stack

## Interview scheduling

- "schedule a call", "schedule an interview"
- "first interview", "second interview", "technical interview"
- "interview slot", "available for a call"

## Follow-up on existing candidates

A thread mentions a candidate already in `Knowledge/Candidates/` by name.
Process it to update the pipeline status.
