# Overlay Notes

Backlink rules for Step 10 of `req-track`. `req-workday` and `req-assess`
follow the same rules.

## The rule

A `3-Team` note must not link into `2-Confidential`. Write every People-side,
Organization-side, and Project-side backlink on the entity's `2-Confidential`
overlay note, never on the `3-Team` note. The overlay declares its wide note
with a one-way `canonical` link: double-quoted, tier-prefixed, and
vault-absolute. Create the overlay when it is missing. When the `3-Team` note
itself is missing, keep the name as plain text. `extract-entities` creates
team notes.

## Overlay stub

File: `2-Confidential/People/{Name}.md` (or
`2-Confidential/Organizations/{Name}.md`, `2-Confidential/Projects/{Name}.md`
with the matching `type`).

```markdown
---
type: person
created: {YYYY-MM-DD}
updated: {YYYY-MM-DD}
aliases:
  - "{Name} (recruitment)"
canonical: "[[3-Team/People/{Name}]]"
---

# {Name}

## Activity
- **{date}**: Presented [[2-Confidential/Candidates/{Candidate}/brief|{Candidate}]]
```

## Assessment prose

Interview-outcome and assessment prose about a candidate lives only in the
candidate's own folder. A wider note, and an overlay, record only that an
event happened.
