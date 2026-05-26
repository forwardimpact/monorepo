# Spec 0900 — Pathway Job Formatter Data Conventions

## Problem

`fit-pathway job` composes title strings and prose paragraphs by concatenating
two fields from the agent-aligned engineering standard — but the contract those
fields are written against is **unstated**. Two of the four rendering bugs
reported in issue [#874](https://github.com/forwardimpact/monorepo/issues/874)
are symptoms of that gap. Bugs 2 (`× null` track) and 3 (double period after
`impactScope`) ship as a separate trivial fix (PR #878); they have one
unambiguous resolution. Bugs 1 and 4 cannot be fixed without first deciding
which side of an implicit contract is authoritative.

The user-testing repro: `npx fit-pathway job software_engineering J060` against
the **BioNova** synthetic standard renders:

> `# Engineer Software Engineer`
>
> *"…technical deliverables.. **You will works** independently…"*

The same command against the **starter** standard
(`products/map/starter/levels.yaml`) renders correctly. The difference is the
data — not the formatter, not the agent's request, not the persona. Both data
sets pass `fit-map validate` today, because the schema
(`products/map/schema/json/levels.schema.json`) declares the affected fields as
plain strings with prose descriptions and the level validator
(`products/map/src/validation/level.js`) checks only presence. The contract that
makes the formatter work is encoded only in the **shape of the starter file's
values** — and the synthetic-pipeline (`syntheticgen` → BioNova) and any
externally-authored standard have no way to know about it.

The two bug surfaces:

| Bug | Field(s) composed | Starter shape (works) | BioNova shape (breaks) | Failure |
|---|---|---|---|---|
| **1 — Title duplication** | `professionalTitle` + `discipline.roleTitle` (via `generateJobTitle()` at `libraries/libskill/src/derivation.js:264`) | `"Level I" + "Software Engineer"` → `"Software Engineer Level I"` via the `Level`-prefix branch (`derivation.js:271`) | `"Engineer" + "Software Engineer"` → `"Engineer Software Engineer"` (the non-`Level` branch concatenates verbatim) | The non-`Level` branch silently assumes `professionalTitle` is a rank-only token (e.g. `"Senior"`) that prefixes the role title. BioNova writes a complete role-shaped string (`"Engineer"`, `"Senior Engineer"`) instead, and the role token appears twice. |
| **4 — "You will works"** | `"You will " + expectations.autonomyExpectation.toLowerCase()` (at `products/pathway/src/formatters/job/description.js:32`) | `"Work independently on familiar problems"` → `"You will work independently on familiar problems"` | `"Works independently on routine tasks"` → `"You will works independently on routine tasks"` | The formatter silently assumes `autonomyExpectation` opens with a base-form verb suitable for the second-person "You will" frame. BioNova writes a third-person sentence ("Works…", subject elided) and verb agreement breaks. |

Both bugs share a root cause: a **composition expectation** the formatter
relies on, never written down anywhere a data author can read. The starter
file happens to satisfy both expectations; any standard authored without
reading the formatter source can fail either. The synthetic-prose pipeline
produces standards in volume; the JTBD persona handing the rendered
document to a manager has no way to repair the result.

Out-of-scope kin from #874:

- **Bug 2 (`× null` track)** — one right answer (omit when null); in flight as PR #878.
- **Bug 3 (double period)** — one right answer (route through the existing `ensurePeriod()` helper); in flight as PR #878.

If PR #878 lands first, this spec's design and plan inherit a tree where bugs
2 and 3 are already fixed; if this spec's implementation lands first, the bug
2/3 fixes still apply cleanly because they touch different surfaces
(subtitle interpolation and the impactScope sentence) than bugs 1 and 4.

This spec exists because bugs 1 and 4 have **no obvious right answer**: either
the data should be normalised to a documented shape and validated at load
time, or the formatter should accept either shape and normalise on output.

## Personas and Job

The hire is **Empowered Engineers** against the Big Hire "Help me see exactly
what's expected at my level so I stop guessing during reviews" ([JTBD.md](../../JTBD.md)
§ Empowered Engineers: Understand Expectations).

The job is fired *while preparing for a 1:1*: the engineer pastes the rendered
markdown into a prep doc or hands it to a manager. The competing alternative
in the JTBD entry is *"tribal knowledge; manager paraphrase; older job ladders
copy-pasted into Notion"*. A rendered document that contains `× null`,
`"Engineer Software Engineer"`, and `"You will works"` does not win against
those alternatives — the interview persona explicitly said *"if I hand this
to Thoth as-is it undermines the document."*

The secondary beneficiary is **Engineering Leaders** authoring the standard
(via `fit-map` and the synthetic-prose pipeline) — they need to know, at
validation time, whether their data will render correctly, rather than
discovering breakage at the engineer's 1:1.

## Scope

### In scope

| Component | What changes |
|---|---|
| **Contract location** | A single canonical home documents the composition expectations the pathway job formatter relies on. The home is the standard-authoring documentation (one of: the published authoring guide at `websites/fit/docs/products/authoring-standards/`, the `products/map/schema/json/levels.schema.json` field `description` strings, or `products/map/starter/levels.yaml` inline comments — the design picks one and points the others at it). Whatever is documented becomes the **contract**: data authored to it is guaranteed to render; data violating it is the data author's bug, not the formatter's. |
| **`professionalTitle` shape** | The contract defines what `professionalTitle` is — *rank token* (e.g. `"Senior"`, `"Level I"`), *role-complete string* (e.g. `"Senior Software Engineer"`), or *either, distinguished by a marker the formatter inspects*. The decision is a design choice; the spec requires that **one** shape becomes authoritative and that all paths (`generateJobTitle` at `libraries/libskill/src/derivation.js:264`, the starter `levels.yaml`, the synthetic-prose pipeline emitter, the BioNova fixture, and any published agent-aligned engineering standards examples) agree on it. |
| **`autonomyExpectation` shape** | The contract defines what verb form `autonomyExpectation` opens with — *base/imperative* (`"Work independently…"`), *third-person* (`"Works independently…"`), or *either, with the formatter normalising at render time*. The decision is a design choice; the spec requires that **one** shape becomes authoritative and that all paths agree on it. |
| **Enforcement** | Whatever the contract says, violations are caught **before render** rather than at the engineer's 1:1. The enforcement substrate is a design choice: validator rules in `products/map/src/validation/level.js` (and the JSON schema if the rule is expressible there), formatter-side normalisation in `libraries/libskill/src/derivation.js` and `products/pathway/src/formatters/job/description.js`, or a hybrid. v1 must pick one and apply it consistently to both fields. |
| **Starter standard** | `products/map/starter/levels.yaml` continues to render correctly. Whatever the contract says, the starter complies with it. If the contract requires a data-shape change to the starter, the change ships in the same PR as the enforcement. |
| **BioNova fixture parity** | The BioNova synthetic standard used in `kata-interview` is not checked in — it is generated at runtime by `fit-terrain build` (from `libsyntheticgen`) against the kata-interview DSL seed. The design names the exact regeneration command and the DSL-seed pin that produces the BioNova data the interview ran on, then ensures that command's output either (a) is regenerated to comply with the contract, or (b) renders correctly under formatter-side normalisation. v1 requires that the pinned regeneration command followed by `npx fit-pathway job software_engineering J060` emits a document with no duplicated role token and no `"You will works"` (or equivalent verb-agreement bug). |
| **Synthetic-prose pipeline alignment** | Whatever the contract says, the prose generator that produces standards from a DSL — `libsyntheticprose` (prose generation) composed under `libsyntheticgen` / `fit-terrain` (DSL-driven standard generation) — emits compliant `professionalTitle` and `autonomyExpectation` values for newly-generated standards. The mechanism (prompt update, post-processing pass, schema-driven generation) is a design choice. |
| **Test coverage** | The behaviour the spec creates is covered by tests: at least one test asserts that a standard violating the chosen contract is caught at the chosen enforcement point; at least one test asserts that the starter standard renders the `software_engineering` × `J060` job with no duplicated role token and no verb-agreement bug; at least one test asserts the same for the BioNova fixture (post-regeneration or post-normalisation). |
| **Authoring-guide update** | The published authoring guide (`websites/fit/docs/products/authoring-standards/index.md`) names the chosen contract for both fields so external authors can read it without cloning the repo, with an example of compliant vs non-compliant values. |

### Out of scope, deferred

- **Bugs 2 and 3 from #874.** Shipped in PR #878.
- **Other composition expectations in the formatter.** `impactScope`,
  `complexityHandled`, `influenceScope`, `managementTitle`, and
  `qualificationSummary` are all also composed with surrounding prose. They
  are not in v1 because the user-testing run did not produce a failure mode
  against them. Once the v1 contract is in place, a follow-up spec can
  audit the remaining fields for parallel unstated expectations.
- **Render output redesign.** This spec does not change what the rendered
  markdown looks like beyond removing the bugs. The subtitle line, role
  summary paragraph, capability sections, and behaviour table all keep
  their current shape.
- **Schema-driven generation of the entire standard.** If the design picks
  a tighter JSON-schema rule (e.g. a `pattern` for `professionalTitle`), the
  scope is the two named fields. Tightening the rest of the schema is a
  follow-up.
- **Internationalisation of the formatter prose.** The current formatter
  emits English-only template strings (`"You will "`, `"This role
  encompasses "`). Multilingual rendering is a separate change.
- **Backwards-compatibility shim.** If the contract requires a data-shape
  change, in-tree standards (the starter and any in-repo fixtures) are
  updated in the same PR. No runtime shim translates legacy shapes — the
  contract is the contract.
## Success Criteria

| Claim | Verification |
|---|---|
| The composition contract for `professionalTitle` is documented in one canonical location. | Test: the design's named canonical home contains a single section that names the chosen shape (rank-only, role-complete, or marker-distinguished) and gives at least one compliant and one non-compliant example; any non-canonical home the design names points at the canonical one rather than restating the contract. |
| The composition contract for `autonomyExpectation` is documented in the same location. | Test: the same section also names the verb-form rule and gives at least one compliant and one non-compliant example. |
| A standard violating the `professionalTitle` contract is caught before render. | Test: a fixture standard with a non-compliant `professionalTitle` value fails the chosen enforcement point (validator rule, formatter-side normalisation rejection, or schema check) with an error message naming the field and pointing at the contract. |
| A standard violating the `autonomyExpectation` contract is caught before render. | Test: same as above for the verb-form rule. |
| The starter standard renders the `software_engineering` × `J060` job correctly. | Test: rendering against `products/map/starter/levels.yaml` produces a markdown document containing the role title exactly once at the top level and containing no `"You will works"` (or other broken verb-agreement) substring. |
| The BioNova standard used in `kata-interview` renders correctly after the spec lands. | Test: running the design's named regeneration command (a `fit-terrain build` invocation against a pinned DSL seed, per the BioNova fixture parity scope row) followed by `npx fit-pathway job software_engineering J060` produces a markdown document with the role title appearing exactly once at the top level and no broken verb-agreement substring. |
| The synthetic-prose pipeline emits compliant values for newly-generated standards. | Test: a fresh standard generated through `fit-terrain build` (composed under `libsyntheticgen` / `libsyntheticprose`) emits `professionalTitle` and `autonomyExpectation` values that pass the v1 enforcement point. |
| The published authoring guide names the contract. | Test: `websites/fit/docs/products/authoring-standards/index.md` contains a section naming the `professionalTitle` and `autonomyExpectation` contracts in the same form as the canonical home (or links to it), with the same compliant/non-compliant examples. |
| Issue #874 bugs 1 and 4 do not regress. | Test: a regression test against a standard whose `professionalTitle` mirrors BioNova's pre-fix shape (`"Engineer"` + `roleTitle: "Software Engineer"`) and whose `autonomyExpectation` mirrors BioNova's pre-fix shape (`"Works independently…"`) either (a) fails enforcement with a clear message, or (b) renders correctly post-normalisation — depending on which side the design picks. The test names which side. |

— Product Manager 🌱
