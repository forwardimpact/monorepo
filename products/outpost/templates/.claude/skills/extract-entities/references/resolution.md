# Entity Resolution

Reference for `extract-entities` Steps 2b–5.

## Name-variant collection

Extract every way a source refers to each entity.

- **People:** full names, first / last names, initials, email addresses,
  roles/titles, pronouns with clear antecedents.
- **Organizations:** full names, short names, abbreviations, email domains.
- **Projects:** explicit names, descriptive references ("the pilot", "the
  deal").
- **Priorities:** references to strategic directions, time-bound targets, or
  measurable outcomes that match `Knowledge/Priorities/` entries.

## Matching

| Source has               | Note has                 | Match if                  |
| ------------------------ | ------------------------ | ------------------------- |
| First name "Sarah"       | Full name "Sarah Chen"   | Same organization context |
| Email "sarah@acme.com"   | Email field              | Exact match               |
| Email domain "@acme.com" | Organization "Acme Corp" | Domain matches org        |
| Any variant              | Aliases field            | Listed in aliases         |

## Disambiguation priority

Email match > Organization context > Role match > Aliases > Recency.

If it is still ambiguous, **skip** rather than guess.

## "Would I prep for this person?" — Step 5

Apply this test to entities that you did not resolve to existing notes (meetings
only).

**Create a note for:**

- Decision makers or key contacts at customers, prospects, partners.
- Investors or potential investors.
- Candidates being interviewed.
- Advisors or mentors with ongoing relationships.
- Introducers who connect you to valuable contacts.

**Do not create notes for:**

- Transactional service providers (bank employees, support reps).
- One-time administrative contacts.
- Large-group attendees you didn't interact with.
- Calendar-only attendees — people who appear solely on an invite's
  attendee list with no interaction, decision, or discussion attributed to them.
- Assistants who handle only logistics.

People who don't get their own note go in the Organization note's `## Contacts`
section instead.

## Minimum content bar — no stubs

Create a People note only if you can write a substantive `## Summary` from the
source. The Summary says who they are, why you know them, and what you work on
together. **If you cannot write that Summary from the source, do not create the
note.** Record the contact in the Organization's `## Contacts` section instead.

Never write a placeholder profile (name + email + generic role + a boilerplate
"created from…" line and nothing else). An email address and a meeting invite
are not, on their own, a reason to create a profile. These stubs add noise
without signal. You must not produce them.

## Role inference

When the role isn't explicit, infer it from context. Qualify it with the basis:

- Organizer of a cross-company meeting → likely senior or partnerships.
- Technical questions → likely engineering.
- Pricing questions → likely procurement or finance.
- "I'll need to check with my team" → manager.
- "I can make that call" → decision maker.

Format: `**Role:** Product Lead (inferred from evaluation discussions)`.

## Never auto-create

`Priorities/`. Link to existing entries when a source references them. Update
progress / backlinks. Never create new ones from extracted content.
