---
name: req-bundle
description: >
  Split a Workday CV-bundle PDF into per-candidate CV.pdf files under
  2-Confidential/Candidates/. Reads the PDF outline (one bookmark per candidate) to
  find each candidate's page range, matches it to the requisition roster so
  folder names agree with req-workday, and extracts each CV losslessly. Use
  when the user provides a Workday CV bundle (a large combined resume PDF, often
  split into `_N_of_M` parts) and asks to split, unbundle, or extract individual
  CVs — run this before req-workday imports the roster.
---

# Workday CV Bundle Split

Write tier: `2-Confidential`
Frontmatter: none (writes CV assets into candidate folders)

Split a Workday CV-**bundle** PDF — one combined file holding every applicant's
attachments — into per-candidate
`2-Confidential/Candidates/{Clean Name}/CV.pdf`.

This is the **PDF companion** to `req-workday`. `req-workday` imports the roster
from the `.xlsx` (briefs + `CV.md` from embedded resume text); `req-bundle`
attaches the real binary CV. Run `req-bundle` **first** so the folders it
creates carry canonical names that `req-workday` then enriches — no duplicate
folders.

**How the split works.** Workday bundles have
**no per-candidate separator page** and the name printed on a CV often differs
from the roster name, so text-based splitting is unreliable. The one dependable
delimiter is the **PDF outline**: exactly one flat bookmark per candidate, its
destination being that candidate's first page. Candidate *i* = pages
`[bookmark(i), bookmark(i+1) − 1]`; the last runs to EOF; the leading Table of
Contents (before the first bookmark) is skipped. Multiple attachments for one
candidate sit under one bookmark, so the range captures them all.
`split-bundle.mjs` reads the outline with `pdfjs-dist` (`getOutline` +
`getPageIndex`) and extracts each range losslessly with `pdf-lib` (`copyPages`).
Full anatomy: [references/pdf-structure.md](references/pdf-structure.md).

## Trigger

- The user provides a Workday CV bundle PDF (a large combined resume export),
  possibly split into `..._1_of_N.pdf … _N_of_N.pdf` parts.
- The user asks to split, unbundle, or extract individual CVs from a Workday
  export before importing candidates.

## Prerequisites

- PDF libraries for the split (`bun`/`node`), installed via the standard guard:
  `bun pm ls pdfjs-dist 2>/dev/null || bun install pdfjs-dist` and
  `bun pm ls pdf-lib 2>/dev/null || bun install pdf-lib`.
- The `req-workday` parser dependencies, since the roster is produced by
  `parse-workday.mjs` (see [../req-workday/SKILL.md](../req-workday/SKILL.md)):
  `read-excel-file` and `fflate`.

## Inputs

- One or more bundle PDF paths (pass **all** parts of a multi-part export).
- The requisition `.xlsx` (same req as the bundle) — parsed by
  `req-workday`'s `parse-workday.mjs` into the roster JSON this script consumes,
  so folder names are identical to what `req-workday` will create.

## Outputs

- `2-Confidential/Candidates/{Clean Name}/CV.pdf` — the candidate's extracted CV
  (created only after the dry-run manifest is reviewed and confirmed).
- A JSON manifest at `$HOME/.cache/fit/outpost/state/req-bundle-{Req ID}.json`
  — the reviewable mapping of every bookmark (page range, matched name, status).
- Never overwrites an existing `CV.pdf`; a second CV for the same person is
  staged as `CV-workday.pdf` / `CV-dup-N.pdf` and flagged for review.

<do_confirm_checklist goal="Verify the split is complete, correctly named, and non-destructive">

- [ ] Bundle page/bookmark counts sanity-checked; all parts of a multi-part
      export passed together.
- [ ] Roster parsed from the matching `.xlsx`; bookmark count reconciled against
      roster count.
- [ ] Dry-run manifest reviewed **before** any write; every `unmatched` bookmark
      resolved to a candidate (or explicitly left staged).
- [ ] Folder names equal the roster `cleanName` (annotation stripped) so they
      match what `req-workday` produces.
- [ ] Collisions (duplicate applications) and pre-existing `CV.pdf` files
      handled without overwrite (`CV-dup-N.pdf` / `CV-workday.pdf`), each
      flagged.
- [ ] After commit, output CV count reconciles with matched bookmarks; a few
      PDFs spot-opened to confirm the right, complete candidate.

</do_confirm_checklist>

## Procedure

### 1. Set up

Confirm the bundle PDF path(s) and the matching `.xlsx` (glob on the req number,
not the timestamp — parts can carry different timestamps). Resolve `$HOME`
(never pass a literal `~` to write tools). Ensure dependencies:

```bash
bun pm ls pdfjs-dist 2>/dev/null || bun install pdfjs-dist
bun pm ls pdf-lib 2>/dev/null || bun install pdf-lib
```

### 2. Parse the roster

Produce the canonical candidate list with `req-workday`'s parser (the single
source of truth for `cleanName`s), saving the JSON for the split step:

```bash
node .claude/skills/req-workday/scripts/parse-workday.mjs "<path-to-requisition.xlsx>" --summary
node .claude/skills/req-workday/scripts/parse-workday.mjs "<path-to-requisition.xlsx>" \
  > "$HOME/.cache/fit/outpost/state/req-bundle-roster-{Req ID}.json"
```

### 3. Dry-run the split

Compute the mapping and manifest **without writing** any PDF. Pass every part of
a multi-part bundle in one invocation:

```bash
node .claude/skills/req-bundle/scripts/split-bundle.mjs \
  "<bundle_1_of_N.pdf>" "<bundle_2_of_N.pdf>" ... \
  --roster "$HOME/.cache/fit/outpost/state/req-bundle-roster-{Req ID}.json" \
  --candidates-dir 2-Confidential/Candidates \
  --manifest "$HOME/.cache/fit/outpost/state/req-bundle-{Req ID}.json" \
  --dry-run
```

The script prints a summary (bookmarks, matched, unmatched, collisions,
existing-CV, roster-without-bookmark) and writes the full manifest. Matching
rules and edge cases: [references/matching.md](references/matching.md).

### 4. Reconcile and resolve

Review the manifest. Confirm `bookmarks_total` reconciles with the roster count
(expect a near-exact match). For each `unmatched` bookmark, use its `hints`
(nearest roster names by shared tokens) to identify the candidate; note the
correct `cleanName`. Investigate any `roster_unmatched_names` (applicants with
no CV in the bundle — usually withdrawn/no-attachment). Do not proceed while
unexpected mismatches remain unexplained.

### 5. Confirm, then commit

Summarize for the user: N CVs to write, M unmatched, K collisions/existing.
**Get explicit confirmation** before writing. Re-run without `--dry-run` (same
roster JSON) to create folders and write the CVs:

```bash
node .claude/skills/req-bundle/scripts/split-bundle.mjs \
  "<bundle parts...>" \
  --roster "$HOME/.cache/fit/outpost/state/req-bundle-roster-{Req ID}.json" \
  --candidates-dir 2-Confidential/Candidates \
  --manifest "$HOME/.cache/fit/outpost/state/req-bundle-{Req ID}.json"
```

For bookmarks that were `unmatched` but you resolved by hand in Step 4, move the
staged file into the correct `2-Confidential/Candidates/{Clean Name}/CV.pdf`, or
add the missing name variant and re-run — never hand-edit PDFs.

### 6. Hand off and report

Point `req-workday` at the same `.xlsx` to build briefs/`CV.md` and link the CV
under each brief's `## CV` section. Flag every candidate that now has a `CV.pdf`
for `req-screen`. Report `Split {matched}/{bookmarks_total} CVs for {Req ID}`,
and list any unmatched bookmarks or roster applicants without a CV.
