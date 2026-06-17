# Benchmarking Rubric

Reference data for `candidate-report` Step 3 (benchmark) and Step 4 (verdict).

## Skill ratings

Map each agent-aligned engineering standard skill against candidate evidence (CV
or `screening.md`).

| Rating      | Criteria                                           | Pill class |
| ----------- | -------------------------------------------------- | ---------- |
| **Met**     | Evidence meets or exceeds the expected proficiency | `p-p`      |
| **Partial** | Some evidence but below expected level             | `p-a`      |
| **Gap**     | No evidence, or clearly below expected             | `p-g`      |
| **Unknown** | Cannot assess from available evidence              | `p-u`      |

Apply the **two-level scepticism rule** from `req-screen`: default two levels
below CV claims unless concrete, quantified evidence is provided.

## Behaviour bar widths

Map each agent-aligned behaviour to a 0–100 % width and a CSS variable based on
evidence strength.

| Range    | Signal          | Colour         |
| -------- | --------------- | -------------- |
| 60–100 % | Positive signal | `var(--green)` |
| 30–59 %  | Partial signal  | `var(--amber)` |
| 10–29 %  | Weak / unknown  | `var(--s300)`  |
| 0–9 %    | Gap             | `var(--red)`   |

## Level gauge

Estimate the candidate's realistic level. Choose a 5-level window centred on the
candidate's estimate and the target level.

## Verdict

Pick one verdict class for the report header.

| Verdict              | Class             | When to use                                                         |
| -------------------- | ----------------- | ------------------------------------------------------------------- |
| Proceed              | `verdict-proceed` | Candidate benchmarks at or above target level                       |
| Proceed with Caution | `verdict-caution` | Mixed signals; viable for scoped role or needs interview to resolve |
| Pass                 | `verdict-pass`    | Clear misalignment with role requirements                           |

Write a one-line headline and a brief detail sentence.

## Template sections to populate

Drives the placeholder substitution in Step 5.

| Section           | Source                                                             |
| ----------------- | ------------------------------------------------------------------ |
| Header            | Candidate name, title, org, location from `brief.md`               |
| Verdict           | This file's verdict table                                          |
| Snapshot          | 5–6 key facts (experience, education, source, stack)               |
| Strengths         | 3–5 bullet points — what the candidate brings                      |
| Level gauge       | Estimated vs target level                                          |
| Benchmark grid    | Top skills per capability area with pills                          |
| Behaviours        | Bar chart items with widths and colours                            |
| Coverage counters | Gap / Partial / Unknown / Met counts                               |
| Recommendation    | 2–4 actionable next steps                                          |
| Footer            | Author name and role from `~/.cache/fit/outpost/state/identity.md` |

## A4 single-page budget

The report **must** fit on a single A4 page (210mm × 297mm):

- Snapshot: max 6 `<dt>`/`<dd>` pairs.
- Strengths: max 5 `<li>`, one sentence each.
- Benchmark grid: 4–6 rows per capability area; prioritise notable
  gaps/strengths, omit "Unknown" rows when tight.
- Combine small capability areas (e.g. Docs + ML) into one block.
- Recommendation: max 4 `<li>`.
- Test with browser print preview (Ctrl+P); cut content if it overflows.
