# Plan 2310-a Part 05: Recruitment and Composing Skills

Rewrite the sixteen recruitment and composing skill trees, and move the
draft-status ledgers to the cache `drafts/` directory (never `state/`;
see plan-a.md § Names). Uses the part-04
declaration grammar. Runs in parallel with parts 04 and 06 after part 03;
shares no files with them.

## Step 1: Skill declarations and path rewrites

- Modified: the sixteen skill trees below (SKILL.md plus references and
  scripts)

| Skill | Write tier | Frontmatter |
| ----- | ---------- | ----------- |
| req-track | `2-Confidential` | candidate |
| req-workday | `2-Confidential` | candidate |
| req-bundle | `2-Confidential` | none (writes CV assets into candidate folders) |
| req-screen | `2-Confidential` | candidate (stamps `status`, `updated`) |
| req-assess | `2-Confidential` | candidate (stamps `status`, `updated`) |
| req-decide | `2-Confidential` | candidate (stamps `status`, `updated`) |
| req-scan | `2-Confidential` | prospect |
| req-forget | `2-Confidential` (erasure record; sweep covers every tier present) | erasure |
| candidate-report | `0-Draft` (report is an export artifact) | none |
| draft-emails | `0-Draft` | none |
| send-chat | `0-Draft` (sending is an export) | none |
| deck-create | `0-Draft` | none |
| deck-review | `0-Draft` | none |
| deck-summarize | `0-Draft` (promotion is a human act) | none |
| doc-create | `0-Draft` | none |
| doc-collab | `0-Draft` (working copies; the human promotes) | none |

Line budget: `req-track/SKILL.md` sits at exactly the jidoka L5 cap (192
counted lines), so the two added declaration lines need two body lines
trimmed in the same edit. Measure every file with
`bunx jidoka instructions` before and after.

Path rewrites in every body: `Knowledge/Candidates/` →
`2-Confidential/Candidates/`, `Knowledge/Prospects/` →
`2-Confidential/Prospects/`, `Knowledge/Roles/` →
`2-Confidential/Roles/`, `Knowledge/People/` → `3-Team/People/`, and
`Drafts/` → `0-Draft/`.

Verification: the criterion 4/18 `rg` gates over the sixteen SKILL.md
files; `rg -e 'Knowledge/' -e 'Drafts/'` over the sixteen trees returns
nothing.

## Step 2: Recruitment overlay and backlink rules

Close the observed leak path: recruitment backlinks into team notes.

- Modified: `req-track/references/{signals,templates,fields}.md`,
  `req-assess/references/{interview-template,panel-template}.md`,
  `req-workday/references/templates.md`

Boundary: `extract-entities` carries the same overlay rules and belongs to
part 04; do not touch it here.

The People-side backlinks the `req-*` skills write land on the person's
`2-Confidential` overlay (`canonical` property pointing at the `3-Team`
note), never on the team note. Templates that emit candidate or prospect
notes open with the frontmatter block (core keys, `aliases`, `status`
from `registry.yaml`). Interview-outcome and assessment prose about a
named subject lives only in the subject's own record (the erasure
authoring rule).

Verification: part-07 fixture recruitment notes pass the validator with
zero `narrower-link` and zero `overlay-undeclared` findings.

## Step 3: req-forget sweeps tiers

- Modified: `req-forget/SKILL.md`,
  `req-forget/references/{classify,locations,report-template}.md`

The sweep covers the subject's record, every recorded alias, every tier
present, and the owner's personal surfaces (`0-Draft/`, `Briefings/`,
cache state). The erasure record stays in `2-Confidential/Erasure/`. The
skill ends with `npx fit-outpost validate <kb-root>` to catch the dangles
the removal creates.

Verification: content review against spec point 8.

## Step 4: Move the draft-status ledgers

Agent state leaves the graph.

- Modified: `draft-emails/SKILL.md`,
  `draft-emails/scripts/scan-emails.mjs`,
  `draft-emails/scripts/send-email.mjs`,
  `draft-emails/references/template.md`

`Drafts/handled` → `~/.cache/fit/outpost/drafts/handled`;
`Drafts/ignored` → `~/.cache/fit/outpost/drafts/ignored`. Never place the
ledgers under `…/state/`: that directory is a daemon-owned trust root the
template settings deny agent writes to (plan-a.md § Names). The scripts
create the `drafts/` directory when absent. Draft bodies themselves go to
`0-Draft/`.

Verification: `rg 'Drafts/' products/outpost/templates/ --hidden` returns
nothing outside `templates/MIGRATION.md` (which documents the legacy
layout by design, per the criterion 12 carve-out); both scripts still
parse (`node --check` in CI; the local toolchain is bun-only, so run the
scripts' scan path under `bun` locally); `bunx jidoka instructions`
passes for the sixteen trees.
