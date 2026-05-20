# Spec 1190 — FHIR Microdata HTML Output Format

**JTBD:** Platform Builders / Build Agent-Capable Systems
(→ [Gear](../../JTBD.md)). When a platform builder generates a synthetic
healthcare deployment with `fit-terrain` and stands up Guide against it,
the DSL-declared trials and sites appear in the knowledge graph but the
generated patients do not — leaving the agent unable to answer queries
that span the platform's two existing capabilities (synthetic data
generation and knowledge-graph retrieval).

## Problem

### Evidence — generated patient data is invisible to the knowledge graph

The Guide ingest pipeline consumes Schema.org microdata HTML and emits
RDF main items, accepting `itemtype` values from `https://schema.org/`
and `https://www.forwardimpact.team/schema/rdf/`. The terrain pipeline
already produces such HTML for DSL-declared trials, sites, conditions,
and clinical knowledge pages (spec 1140 part 7). The Synthea-generated
patients that fill those trials produce no microdata at all — the
dataset renderer surface registered through the DSL `output` block
covers JSON, YAML, CSV, Markdown, Parquet, SQL, plus the spec 1140
additions `supabase_migration` and `embeddings_jsonl`, none of which
emit Schema.org-shaped HTML. A platform builder querying Guide for
"patients enrolled in ONCORA-301" gets back the trial node but no
patient nodes.

### Evidence — the trial → patient edge is missing

The `clinical {}` block declares trials with `target_enrollment` and
`current_enrollment` as scalars. The Synthea pipeline emits patients
whose FHIR `Condition.code.coding[].display` may match the trial's
declared `conditions` (`filterByConditions` already exploits this
relationship), yet the rendered trial-card and condition-explainer
pages link only to other DSL-declared entities. No edge exists in the
knowledge graph from a trial to a real enrolled patient, so an agent
cannot answer "show me one patient currently enrolled in this trial."

### Evidence — FHIR-to-Schema.org mapping

Several FHIR resource types map cleanly to Schema.org; others have no
native fit:

| FHIR | Schema.org type | Mapping quality |
|------|----------------|-----------------|
| `Patient` | `Person` | clean — `Person` is the closest Schema.org type and is already accepted by libresource |
| `Condition` | `MedicalCondition` | clean — already used by spec 1140 part 7 |
| `Procedure` | `MedicalProcedure` | clean |
| `MedicationRequest` | `DrugPrescription` | clean |
| `Encounter` | none | no native Schema.org type |
| `Observation` | none | no native Schema.org type |
| `DiagnosticReport` | none | no clean Schema.org type |

The four clean mappings cover what a patient-facing agent surfaces:
who the patient is, what they have, what was done to them, and what
they are taking. Encounter / Observation / DiagnosticReport are dense
auxiliary data; the platform already exposes them through the existing
tabular formats and they do not need a knowledge-graph edge.

### Who is affected

- **A platform builder standing up the Kata stack with Synthea-backed
  patient data** — Guide returns trial nodes but no patient nodes,
  forcing each demo or evaluation app to reimplement a FHIR→microdata
  bridge.
- **Spec 1160 (BioNova Finder)** — the in-tree reference implementation
  consuming this output; without it the demo cannot demonstrate
  patient-matching against a populated knowledge graph.

## Proposal

### 1. A patient-shaped output format

A new dataset output format that accepts Synthea-produced patient data
and emits HTML pages whose Schema.org microdata `libresource` extracts
as RDF main items. Usable in the existing `output` DSL block, the
format takes a directory path and writes one HTML file per patient plus
one index file.

### 2. Patient IRI scheme

Patient pages mint stable IRIs under the same `/id/clinical/` namespace
the DSL `clinical {}` block uses (defined in spec 1140), shaped
`https://{domain}/id/clinical/patient/{patient_id}`, where `{domain}`
is the terrain `domain` and `{patient_id}` derives deterministically
from the FHIR `Patient.id`. The shared namespace is what enables
cross-references between DSL-declared and synthetically-generated
entities.

### 3. Resource coverage

The format renders four FHIR resource types as microdata, each carrying
the Schema.org type from the mapping table:

- `Patient` → `Person`
- `Condition` → `MedicalCondition`
- `Procedure` → `MedicalProcedure`
- `MedicationRequest` → `DrugPrescription`

Each patient page contains exactly one `Person` main item with the
patient's stable IRI, plus inline microdata items for that patient's
Conditions, Procedures, and MedicationRequests, related to the patient
through Schema.org properties such that libresource's RDF extraction
yields quads connecting the patient IRI to each linked resource.

### 4. Trial → patient cross-references

When a FHIR `Condition` on a generated patient matches a DSL-declared
`clinical.conditions[].id` (matched by the same rule
`filterByConditions` uses today — `Condition.code.coding[].code`
exact match, or `display` normalized to lowercase with whitespace
replaced by underscore), the patient page links to every trial whose
`conditions` list contains that id. The reverse link (trial-card →
patient) is treated separately under proposal §5.

### 5. Reverse cross-links from existing clinical pages

The spec 1140 trial-card, condition-explainer, and site-description
templates are extended to emit links to every patient whose synthetic
Condition matches the page's entity, using the same matching rule as
§4. This is a behavior change to already-rendered output from spec
1140: when this format is wired up and a Synthea Patient dataset is
present, those three page types gain new outgoing edges; when no
Synthea dataset is present, they render identically to before.

### 6. Aggregate index

A single `index.html` at the configured path listing every patient
with name and condition summary, sufficient for Guide's crawler to
discover the per-Patient pages without requiring filesystem listings.

## Scope

### Included

- A new `output` format keyword usable in DSL `output` blocks against
  a Synthea-produced Patient dataset.
- Rendering of per-Patient HTML pages and an index page covering the
  four FHIR resource types from §3.
- Trial → patient cross-references on the new patient pages (§4).
- Reverse patient → trial / patient → site links on the existing spec
  1140 templates (§5).
- An end-to-end test that runs Synthea, renders the format, parses the
  output through libresource's microdata parser, and asserts the
  expected items and cross-references appear in the extracted RDF.

### Excluded

- `Encounter`, `Observation`, `DiagnosticReport`, `Claim`,
  `ExplanationOfBenefit`, `Immunization`, `AllergyIntolerance`, and
  other FHIR resource types not listed in §3.
- A FHIR-as-RDF (Turtle / JSON-LD / N-Triples) output format —
  separate concern, deferred until a SPARQL-consuming downstream
  exists.
- LLM-enriched patient prose summaries — patient pages stay
  deterministic at this scope; enrichment can be added later without
  changing the output contract.
- Modifications to libresource or Guide's ingest pipeline — Schema.org
  microdata is the existing contract; this spec produces compliant
  output, not new ingest behavior.
- Changes to Synthea's `filterByConditions` or to how clinical
  conditions resolve to Synthea modules — that pipeline stage stays
  unchanged.
- A generalization to non-FHIR datasets — the format is specific to
  Synthea-shaped patient data; other tools (faker, sdv) keep their
  existing renderer surface.

## Success Criteria

1. A DSL file declaring a Synthea dataset with this output format
   produces one HTML file per patient plus one index file under the
   configured path. Verify: `bun test` in `libsyntheticrender` passes
   a fixture-based test asserting one file per FHIR Patient record
   plus exactly one `index.html`.

2. Every per-Patient page contains exactly one Schema.org main item
   typed `Person` with `itemid` matching `https://{domain}/id/clinical/patient/{patient_id}`.
   Verify: parsing the rendered HTML through libresource's
   `Parser.parseHTML()` returns exactly one main item per file whose
   `itemtype` is `https://schema.org/Person` and whose IRI shape
   matches the pattern.

3. Each patient page produces inline microdata items for that
   patient's Conditions, Procedures, and MedicationRequests, related
   through Schema.org properties to the patient. Verify: RDF quads
   extracted by `libresource` include subject=patient-IRI predicates
   linking to each `MedicalCondition`, `MedicalProcedure`, and
   `DrugPrescription` item rendered on that page.

4. When a FHIR Condition matches a DSL-declared
   `clinical.conditions[].id` under the §4 matching rule, the patient
   page emits a link to every trial whose `conditions` list contains
   that id. Verify: integration test seeds a clinical block with a
   condition and a trial referencing it, runs Synthea, asserts the
   rendered patient page's extracted RDF contains a quad from the
   patient IRI to the trial IRI.

5. The spec 1140 trial-card, condition-explainer, and site-description
   pages emit reverse links to matching patients when a Synthea
   Patient dataset is present. Verify: extending the spec 1140 clinical
   HTML test suite, assert that when the test fixture includes a
   matching synthetic patient, the trial-card page's extracted RDF
   contains a quad from the trial IRI to the patient IRI.

6. Running the libresource parser stack against the rendered output
   produces an RDF graph where the patient IRI and the matching trial
   IRI are connected by at least one quad in each direction. Verify:
   the end-to-end test calls `libresource`'s `Parser.parseHTML()` on
   both the per-Patient page and the trial-card page, asserts the
   expected quads exist by inspecting the returned items.

7. Terrain DSL files that do not wire this new format produce output
   byte-identical to before. Verify: `bun test` covers a regression
   fixture that exercises the spec 1140 clinical block without the
   new output format and asserts each rendered file matches a stored
   snapshot. The §5 reverse-link addition fires only when a Synthea
   Patient dataset is rendered through this format; absent that, the
   1140 pages render unchanged.
