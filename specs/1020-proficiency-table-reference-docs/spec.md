# Spec 1020 — Proficiency Table Structural Divergence in Reference Docs

## Problem

Two `websites/fit/docs/reference/` pages duplicate the Proficiency Levels
table from the canonical Authoring Standards guide with **divergent column
structure and divergent cell phrasing**. Documentation standards require
canonical proficiency and behaviour maturity tables to "match exactly"
(`.claude/skills/kata-documentation/references/standards.md` § Formatting
Consistency), but the three current shapes encode incompatible mental models
of what a proficiency level means.

| Location | Columns | `awareness` cell |
|---|---|---|
| Canonical: `websites/fit/docs/products/authoring-standards/index.md:82-88` | `Proficiency · Autonomy · Scope` | `with guidance · team` |
| `websites/fit/docs/reference/model/index.md:74-80` | `Proficiency · Description` | `Learning fundamentals, needs guidance` |
| `websites/fit/docs/reference/yaml-schema/index.md:43-49` | `Proficiency · Index · Description` | `Learning fundamentals, needs guidance` |

The canonical version factors a proficiency into two orthogonal dimensions
(autonomy of action, scope of influence) so a level is operationally
recognisable. The reference-page summaries collapse both dimensions into a
single prose phrase that emphasises learning posture ("Learning fundamentals",
"Applies basics independently"), introducing a different vocabulary not used
anywhere else in the product or starter data.

This is not a cell-level copy drift fixable by replacing strings — the column
counts differ. A restructure-or-summarise decision is required before any
edit can be made. The blocker has stood on `wiki/technical-writer.md` since
2026-05-11 (cross-page-consistency review finding), and PR #858 (open since
2026-05-11) explicitly defers it as out of scope for behaviour-maturity
alignment.

The same structural pattern is **not** present for the Behaviour Maturity
table: all three pages use single-column `Description` shapes, and PR #858
is in flight to align the cells. The proficiency table is the unique outlier.

---

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Empowered Engineers, Agents | "Let me look something up" — Reference tier ([JTBD.md](../../JTBD.md)) | A reader who lands on `reference/model/` or `reference/yaml-schema/` to confirm what `awareness` means will get a different definition than a reader who lands on `products/authoring-standards/`. The reference tier silently contradicts the canonical tier. |
| Engineering Leaders authoring standards | "Define the Engineering Standard" — `fit-map` | Calibrating `proficiencyDescriptions` in YAML against the reference page yields different phrasing than calibrating against the authoring-standards guide. |

---

## Scope

### In scope

| File | What changes |
|---|---|
| `websites/fit/docs/reference/model/index.md` | The Proficiency Levels table (lines 74-80) is resolved against the canonical shape. |
| `websites/fit/docs/reference/yaml-schema/index.md` | The Proficiency Levels table (lines 43-49) is resolved against the canonical shape. The page's purpose (YAML-schema reference) requires that the `Index` column (0..4 ordering) remain available to readers, whether inline or by link target. |

### Out of scope

- Behaviour Maturity tables on the same pages — covered by open PR #858
  (cell-level alignment under the existing single-column shape). A separate
  cycle may apply the same resolution pattern to those tables if PR #858 lands
  with the structure still mismatched against canonical.
- Editing the canonical `products/authoring-standards/index.md` table — the
  canonical shape is the authoritative one; reference pages converge on it.
- Renumbering proficiency indices (0..4) or changing the five-level scale.
- Other reference pages (`lifecycle/`, `index.md`) — they do not carry a
  proficiency table.

---

## Resolution Options

The spec does not pick the option; design phase does. Listed here so the
problem statement is complete.

| Option | Shape on reference pages | Trade-off |
|---|---|---|
| A. Restructure to canonical | `Proficiency · Autonomy · Scope` (yaml-schema keeps `Index`) | Reference pages match canonical exactly. Reference-tier readers get two-dimension framing that may be denser than "lookup" intent calls for. |
| B. Link to canonical | One-line "See [Proficiency Levels](../../products/authoring-standards/#…)" instead of the table | Eliminates duplication and drift risk. Reference page loses self-containment for offline / agent fetches. |
| C. Signposted summary | Keep `Description` shape but rewrite cells to canonical autonomy/scope phrasing in a single sentence ("works independently within a team", etc.), and add an inline note that the canonical two-column form lives in authoring-standards | Self-contained reference page that no longer contradicts canonical. Requires synthesising prose; future drift still possible. |

---

## Success Criteria

| Criterion | Verification |
|---|---|
| Reference-page proficiency tables no longer carry the divergent "Learning fundamentals" vocabulary. | `grep -c "Learning fundamentals" websites/fit/docs/reference/model/index.md websites/fit/docs/reference/yaml-schema/index.md` returns 0 on both files. |
| Reference-page proficiency tables agree with canonical autonomy/scope vocabulary, OR have been replaced by an in-page link to the canonical table. | One of: (a) `grep -E "with guidance\|independently\|lead, mentor" websites/fit/docs/reference/{model,yaml-schema}/index.md` returns matches on both files; OR (b) `grep -c "/docs/products/authoring-standards/" websites/fit/docs/reference/{model,yaml-schema}/index.md` returns ≥1 on both files AND the markdown table block (`\| Proficiency`) is absent. |
| `yaml-schema/index.md` continues to expose the `Index` column ordering (0..4) needed by YAML-schema readers — inline if the table is kept, or via the linked canonical target if the table is replaced. | `grep -E "Index" websites/fit/docs/reference/yaml-schema/index.md` returns a match in proficiency context, OR the target of the canonical link contains an `Index` column. |
| `bunx fit-doc build --src=websites/fit --out=dist` succeeds with no broken links. | Build exit code 0; no `MSG` lines reporting unresolved partials or links. |
| The next scheduled `cross-page-consistency` documentation review reports no Proficiency-table divergence finding. | Review log in `wiki/technical-writer-YYYY-Www.md` confirms zero proficiency-table findings; the `Open Blockers` row in `wiki/technical-writer.md` referencing `reference/model/index.md:74-80` and `reference/yaml-schema/index.md:43-49` is removed. |
