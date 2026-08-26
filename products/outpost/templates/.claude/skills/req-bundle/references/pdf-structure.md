# Workday CV Bundle — PDF anatomy

What a Workday "Download resumes / attachments" bundle looks like, and why the
PDF outline is the only reliable way to split it.

## The shape of a bundle

- A bundle is **one PDF that concatenates every applicant's attachments** — CV,
  and often a cover letter and certificates too — back to back.
- **Front matter:** page 1 (and sometimes 2–3) is a whole-bundle **Table of
  Contents** titled with the req, e.g. `4951493 - Principal Software Engineer`,
  listing `Candidate Name | Candidate ID | Attachments`. The TOC has **no page
  numbers** in its extracted text, so it is not a usable split key — skip it.
- **No per-candidate separator/cover page.** Each candidate's first attachment
  begins directly on its own page. The TOC is the only inserted page.

## The delimiter: the PDF outline (bookmarks)

Every bundle carries a **flat, depth-0 PDF outline with exactly one bookmark per
candidate**. The bookmark's destination is that candidate's **first page**, and
its title is the **clean candidate name** (no `(Internal)` / `(Referral)`
suffix). This is the split key:

- Candidate *i* → pages `[bookmark(i).page, bookmark(i+1).page − 1]`.
- Last candidate → `[bookmark(last).page, EOF]`.
- A candidate's **multiple attachments are all under their single bookmark**, so
  the page range captures the cover letter + CV + certs together. (This is fine
  — a hiring manager wants the whole packet; `req-screen` reads the CV within.)
- Bookmark counts match roster counts exactly (verified live: 75↔75 on a
  single-part export; 366↔366 across the four parts of a large export).

`split-bundle.mjs` reads this via `pdfjs-dist`: `doc.getOutline()` for the
items, then `doc.getPageIndex(dest[0])` (resolving named destinations through
`doc.getDestination()` first) to turn each bookmark into a 0-based page index,
then sorts by page. Page ranges are extracted losslessly with `pdf-lib`
(`copyPages`).

## What NOT to rely on

- **Separator-page detection** — there are none.
- **Name text at the top of a page** — a CV's printed name is the candidate's
  own styling and often differs from the roster name (bookmark "Vivian Chen" →
  CV reads "Wei-Ling (Vivian) Chen, PhD"). Match the **bookmark title**, not
  page text.
- **Page-text extraction** — unnecessary and unreliable for boundary detection:
  the outline gives exact boundaries and the `.xlsx` already carries the resume
  text.

## Multi-part bundles (`_1_of_N` … `_N_of_N`)

When a req has many applicants, Workday emits several PDFs. Key facts:

- **Each part is self-contained:** its own TOC, its own ~100-candidate subset in
  its own internal order (parts are *not* sequential slices of one ordering).
- **No candidate spans a part boundary** — every part's first bookmark is a
  fresh candidate after its TOC, and its last candidate is fully contained.
- Therefore **process each part independently** and union the results; pass all
  parts to `split-bundle.mjs` in one call.
- A person may legitimately appear in two parts (a genuine duplicate
  application). That surfaces as a **collision** in the manifest (same folder
  targeted twice) — handled per [matching.md](matching.md), not stitched.

## Observed reference numbers (live exports)

| Bundle                                   | Pages | Bookmarks |
| ---------------------------------------- | ----- | --------- |
| Principal SWE req (single file)           | 215   | 75        |
| Sr. Director req `_1_of_4`                | 321   | 100       |
| Sr. Director req `_2_of_4`                | 314   | 100       |
| Sr. Director req `_3_of_4`                | 278   | 100       |
| Sr. Director req `_4_of_4`                | 213   | 66        |

Note: one part's filename carried a slightly different timestamp than its
siblings — glob on the req number, not the timestamp.
