# Matching bookmarks to the roster, and edge cases

How `split-bundle.mjs` maps each PDF bookmark to a canonical candidate folder,
and how it handles duplicates, existing files, and misses. The goal: folder
names identical to what `req-workday` produces, and **never** a destructive
overwrite.

## Why match at all

The bookmark title is a clean name, but folder names must equal the roster
`cleanName` — the applicant name from the `.xlsx` `Candidates` sheet with any
trailing annotation (`(Internal)`, `(Prior Worker)`, …) stripped. That
`cleanName` comes **directly from `req-workday`'s `parse-workday.mjs`** (the
single source of truth this skill consumes as JSON), so the two skills agree by
construction and never create duplicate folders. So: bookmark title → (match) →
roster `cleanName` → folder.

## Normalization (both sides)

Before comparing, each name is folded with `normalize()`:

1. Remove parentheticals — `(ΝΙΚΟΣ ΠΑΠΑΔΟΠΟΥΛΟΣ)`, `(Internal)`, `(Referral)`.
2. Remove bare annotation tokens — internal / referral / prior worker /
   external.
3. Strip diacritics (NFKD) — `Geraño` → `gerano`.
4. Lowercase, keep `[a-z0-9 ]`, collapse whitespace.

## Match methods (conservative, deterministic)

Applied in order; the method is recorded in the manifest:

1. **`exact`** — normalized strings equal.
2. **`token-set`** — same set of tokens regardless of order (handles
   "First Last" ↔ "Last First" and dropped middle names).
3. **`unmatched`** — no confident match. The script does **not** guess by
   subset/Levenshtein (that risks merging two different "David …"s). Instead it
   attaches `hints`: the nearest roster names by shared-token count, for a human
   to resolve.

## Edge cases & how the script handles them

- **Duplicate applications (collisions).** The same person appears under two
  bookmarks (e.g. across two parts of a multi-part bundle). Both resolve to one
  folder. The first writes `CV.pdf`; the next becomes `CV-dup-2.pdf` (then
  `-3`, …) with status `collision`. Review whether it's a true duplicate (keep
  one) or a distinct newer packet (rename intentionally). Never silently
  overwrite.
- **Pre-existing `CV.pdf`.** A candidate who already arrived via email
  (`req-track`) may already have `CV.pdf`. The script writes `CV-workday.pdf`
  with status `existing-cv` and flags it, so the richer existing artifact is
  preserved. Decide per candidate which to keep.
- **Unmatched bookmark.** Staged in a folder named from the sanitized bookmark
  title, status `unmatched`, with `hints`. Resolve by identifying the right
  `cleanName` and moving the staged `CV.pdf` into that folder, or by adding the
  missing name variant and re-running. A genuinely stray bookmark (someone not
  on the roster) is worth flagging to the user.
- **Roster applicant with no bookmark** (`roster_unmatched_names`). Applied but
  no CV in the bundle — usually withdrawn or never attached a resume. Expected;
  just report it. Not an error.
- **No outline** (`no-outline` status for a file). The PDF has no bookmarks —
  it is not a standard Workday bundle, or the outline was stripped. Do not
  attempt a blind page-count split; stop and tell the user.

## Reconciliation checklist

- `bookmarks_total` ≈ roster count (small gaps explained by
  `roster_unmatched_names`).
- `unmatched_bookmarks` == 0 after Step 4 resolution (or each is explained).
- `matched` + resolved unmatched == CVs you expect to write.
- Known repeat applicants line up with the reported `collisions`.
