# Source Classification

Reference for `extract-entities` Step 1.

## Type detection

- `Meeting:` / `Attendees:` / `Transcript:` headers → **meeting** (creates
  notes).
- `From:` and `To:` or `Subject:` → **email** (updates only).
- `**Platform:** Microsoft Teams` → **teams chat** (updates only).
- File in `Voice Memos/` → **voice memo** (creates notes).
- File in `apple_calendar/` → **calendar event** (enriches existing notes only).
- Ad-hoc document (from `~/Desktop/`, `~/Downloads/`, or another skill passing
  the path) → **document** (creates notes — meeting rules).

## Always process — never skip

Calendar events. Internal-only meetings still enrich Project and Topic notes
(decisions, agenda items). Only skip all-day placeholders with no attendees and
no description (e.g. "Block", "OOO").

**Stub guard:** calendar attendance alone never creates a People note — calendar
events only *enrich* existing notes (see the table below). An attendee who is
only on the invite list, with no interaction or decision attributed to them, is
not profiled. If they matter, they go in the Organization's `## Contacts`. Never
write a placeholder profile; see the
[minimum content bar](resolution.md#minimum-content-bar--no-stubs).

## Skip entirely

- Newsletters (unsubscribe links, "View in browser", bulk-sender indicators).
- Marketing emails (promotional language, no-reply senders).
- Automated notifications (GitHub, Jira, Slack, CI/CD, shipping).
- Spam / cold outreach with no existing relationship.
- Product-update emails, release notes, changelogs.
- Social-media notifications.
- Receipts and order confirmations.
- Calendar-invite emails that are just logistics.
- Mass emails (many recipients, mailing-list headers).

## Process — update existing notes only

- Emails from people already in `Knowledge/People/`.
- Emails referencing existing projects or organizations.

## Process — can create new notes

- Meeting transcripts with external attendees.
- Voice memos.
- Ad-hoc documents.

## Warm-intro exception

If an email is a warm introduction from someone with a note, and they introduce
a new person, **create** a note for the introduced person.

Signals: subject contains "Intro:", "Introduction:", "Meet", "Connecting"; body
contains "introduce you to", "want to connect", "meet [Name]"; new person is
CC'd.

## Self-exclusion

Never create or update notes for the user (matches name, email, or @domain from
`~/.cache/fit/outpost/state/identity.md`) or for `@{user.domain}` colleagues.

## Source-type rules summary

| Source type             | Creates notes?  | Updates notes? | Detects state changes? |
| ----------------------- | --------------- | -------------- | ---------------------- |
| Calendar event          | No              | Yes (always)   | Yes                    |
| Meeting                 | Yes             | Yes            | Yes                    |
| Voice memo              | Yes             | Yes            | Yes                    |
| Ad-hoc document         | Yes             | Yes            | Yes                    |
| Email (known contact)   | No              | Yes            | Yes                    |
| Email (unknown contact) | No (SKIP)       | No             | No                     |
| Email (warm intro)      | Yes (exception) | Yes            | Yes                    |
| Teams chat              | No              | Yes            | Yes                    |
