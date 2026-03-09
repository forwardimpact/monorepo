# Structured Eval Data Set - HTML5 with Microdata

## Reference Documents

This document references the following files for BioNova content generation:

- **Narrative Context**: `README.md` - Complete BioNova story and background
- **Structural Specifications**: `ONTOLOGY.md` - Entity definitions, quantities,
  and relationships
- **Evaluation Scenarios**: `config/eval.yml` - Test scenarios and validation
  criteria

## Purpose

This file defines HTML format requirements for generating BioNova pharmaceutical
company demo content. All generated content must follow the structural
specifications in `ONTOLOGY.md`, align with the narrative context in
`README.md`, and support the evaluation scenarios defined in `config/eval.yml`.

**Output Location**: `./data/evalset/`

## HTML Format Requirements

Use HTML5 semantic markup with embedded microdata.

**Microdata Requirements**:

- Use `itemscope`, `itemtype`, and `itemprop` attributes
- Use `itemid` to assign a stable IRI to every top-level entity (e.g.,
  `itemid="https://bionova.example/id/person/apollo"`). Nested entities SHOULD
  also include `itemid` when they represent reusable concepts that may be
  referenced across files
- Reuse identical `itemid` IRIs for the same real-world entity across different
  files to enable cross-file graph stitching
- All Schema.org types and properties must be 100% accurate
- Nested microdata for relationships (use nested `itemscope` elements)
- Proper HTML5 semantic elements (`article`, `section`, `header`, etc.)

**IRI Pattern Suggestions**:

```text
Person:        https://bionova.example/id/person/{slug}
Organization:  https://bionova.example/id/org/{slug}
Drug:          https://bionova.example/id/drug/{slug}
Project:       https://bionova.example/id/project/{slug}
ClinicalTrial: https://bionova.example/id/trial/{slug}
Course:        https://bionova.example/id/course/{slug}
Policy:        https://bionova.example/id/policy/{slug}
Platform:      https://bionova.example/id/platform/{slug}
```

**Validation Rules**:

- Every top-level item MUST have `itemid`
- IRIs MUST be lowercase slugs after the type segment (use hyphens for
  multi-word)
- No duplicate IRIs for distinct entities
- Cross-file references MUST exactly match canonical IRIs
- Relationships must use nested microdata with proper `itemid` IRIs

## Content Generation Guidelines

**Before You Start**:

1. Read `README.md` for the complete BioNova narrative context
2. Read `ONTOLOGY.md` thoroughly - it defines all entities, quantities, and
   relationships
3. Review `config/eval.yml` - it defines the evaluation scenarios and validation
   criteria
4. Understand the output format requirements in this file

**Writing Approach** - Follow the content quality guidelines defined in
`config/eval.yml`:

- **Vector-optimized content**: Use semantic diversity techniques (see
  config/eval.yml validation guidelines)
- **Graph-optimized content**: Implement explicit relationships (see
  config/eval.yml validation guidelines)
- **Hybrid content**: Combine both approaches (see config/eval.yml validation
  guidelines)

**Validation** - After generating content, validate against the checklists in
`config/eval.yml`:

- Structural compliance with ONTOLOGY.md
- Scenario support for all test queries in config/eval.yml
- Content quality standards from config/eval.yml validation guidelines

**Task Planning** - Before beginning content generation, the agent MUST invoke
the task planning tool to decompose the large content creation effort into many
small, trackable tasks. Requirements:

1. Create an initial task list that covers: file creation order, entity grouping
   per file, relationship encoding checks, validation passes (structure,
   scenario coverage, quality), and final review.
2. Each task should be narrowly scoped (e.g., "Draft organizational file 1:
   leadership hierarchy" rather than generic "Write org files").
3. Mark exactly one task in progress at a time; update status immediately upon
   completion before starting the next.
4. Include explicit tasks for: cross-referencing `ONTOLOGY.md` counts, ensuring
   Schema.org property accuracy, verifying `itemid` IRI uniqueness and
   correctness, and running post-generation validation against `config/eval.yml`
   checklists.
5. Add a final task for summarizing completion and any follow-up improvement
   opportunities.
6. Revise the task list if new subtasks emerge (always maintain an up-to-date
   plan).

Do NOT proceed with file writing until the initial task list is created and
displayed. This planning step is mandatory to ensure systematic, high-quality
generation.

---

## HTML Examples

**Basic Microdata Structure**:

```html
<div itemscope itemtype="https://schema.org/Person">
  <span itemprop="name">Apollo</span>
  <span itemprop="jobTitle">CEO</span>
  <div itemprop="worksFor" itemscope itemtype="https://schema.org/Organization">
    <span itemprop="name">BioNova</span>
  </div>
</div>
```

**Person with itemid**:

```html
<article
  itemscope
  itemtype="https://schema.org/Person"
  itemid="https://bionova.example/id/person/apollo"
>
  <header>
    <h1 itemprop="name">Apollo</h1>
    <p>
      <span itemprop="jobTitle">CEO</span> of
      <span
        itemprop="worksFor"
        itemscope
        itemtype="https://schema.org/Organization"
        itemid="https://bionova.example/id/org/bionova"
        ><span itemprop="name">BioNova</span></span
      >
    </p>
  </header>
</article>
```

**Organizational Hierarchy**:

```html
<div
  itemscope
  itemtype="https://schema.org/Person"
  itemid="https://bionova.example/id/person/poseidon"
>
  <span itemprop="name">Poseidon</span>
  <div
    itemprop="worksFor"
    itemscope
    itemtype="https://schema.org/Organization"
    itemid="https://bionova.example/id/org/bionova-commercial"
  >
    <span itemprop="name">BioNova Commercial</span>
    <div
      itemprop="parentOrganization"
      itemscope
      itemtype="https://schema.org/Organization"
      itemid="https://bionova.example/id/org/bionova"
    >
      <span itemprop="name">BioNova</span>
    </div>
  </div>
</div>
```

**Drug Development Pipeline**:

```html
<div
  itemscope
  itemtype="https://schema.org/Drug"
  itemid="https://bionova.example/id/drug/immunex-plus"
>
  <span itemprop="name">Immunex-Plus</span>
  <div
    itemprop="prescriptionStatus"
    itemscope
    itemtype="https://schema.org/DrugPrescriptionStatus"
    itemid="https://bionova.example/id/status/immunex-plus/pre-clinical"
  >
    <span itemprop="name"
      >Pre-clinical (requires Immunex and Cardiozen approval)</span
    >
  </div>
</div>
```
