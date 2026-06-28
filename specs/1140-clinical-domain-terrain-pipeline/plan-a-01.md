# 1140 Part 01 — DSL Grammar + Clinical Block Parser

Extend the tokenizer and parser to support `clinical {}` as a new top-level
domain block with `condition`, `site`, `trial` (with nested `criteria`), and
`content` sub-blocks.

## Goal

Parse a `clinical {}` block into `ast.clinical: ClinicalBlock` — the foundation
every downstream part depends on.

## Files

| Action | Path |
|--------|------|
| Modified | `libraries/libsyntheticgen/src/dsl/tokenizer.js` |
| Modified | `libraries/libsyntheticgen/src/dsl/parser.js` |
| Modified | `libraries/libsyntheticgen/src/dsl/parser-helpers.js` |
| Modified | `libraries/libsyntheticgen/test/tokenizer.test.js` |
| Created | `libraries/libsyntheticgen/src/dsl/parser-clinical.js` |
| Created | `libraries/libsyntheticgen/test/parser-clinical.test.js` |

## Steps

### Step 1 — Tokenizer: new keywords and DOTTED_IDENT

Add clinical keywords to the `KEYWORDS` set in `tokenizer.js:20-117`:

```text
clinical, condition, site, trial, criteria, inclusion, exclusion,
icd10, synonyms, synthea_module, severity, prose_topic, prose_tone,
address, city, state, country, capacity, specialties,
protocol_id, therapeutic_area, conditions, sites, principal_investigator,
sponsor, status, target_enrollment, current_enrollment, start_date,
estimated_end_date, arms, age_min, age_max, conditions_required,
prior_treatments_allowed, ecog_max, custom, conditions_excluded,
active_autoimmune, prior_immunotherapy,
condition_explainers, therapy_descriptions, therapy_topics,
trial_faqs, consent_summaries, site_descriptions,
patient_stories, patient_story_conditions,
per_condition, per_trial, per_site,
prefix, entities, include_embeddings,
text_fields, supabase_migration, embeddings_jsonl
```

Cross-check against the existing set — only add genuinely new entries.

Modify `readWord()` (`tokenizer.js:204-211`) to continue reading through dots
when followed by a letter, emitting `DOTTED_IDENT` when the word contains at
least one dot:

```javascript
function readWord(source, s) {
  let word = "";
  while (s.i < source.length && /[a-zA-Z0-9_]/.test(source[s.i])) {
    word += source[s.i];
    s.i++;
    if (
      source[s.i] === "." &&
      s.i + 1 < source.length &&
      /[a-zA-Z]/.test(source[s.i + 1])
    ) {
      word += source[s.i];
      s.i++;
    }
  }
  if (word.includes(".")) return { type: "DOTTED_IDENT", value: word };
  return { type: KEYWORDS.has(word) ? "KEYWORD" : "IDENT", value: word };
}
```

**Verify:** `bun test` in `libsyntheticgen` — existing tokenizer tests pass.

### Step 2 — Parser helpers: parseMappedArrays()

Add `parseMappedArrays(blockName)` to `parser-helpers.js`. Reads a
brace-delimited block of `key array` pairs where keys can be `DOTTED_IDENT`,
`IDENT`, or `KEYWORD`:

```javascript
function parseMappedArrays(blockName) {
  expect("LBRACE");
  const map = {};
  while (peek().type !== "RBRACE") {
    const key = advance();
    if (key.type !== "DOTTED_IDENT" && key.type !== "IDENT" && key.type !== "KEYWORD") {
      throw new Error(`Expected identifier in ${blockName} at line ${key.line}, got ${key.type}`);
    }
    map[key.value] = parseArray();
  }
  expect("RBRACE");
  return map;
}
```

Export from `createDispatchHelpers()` alongside `consumeFields`.

**Verify:** `bun test` in `libsyntheticgen`.

### Step 3 — Parser: accept DOTTED_IDENT

In `parser.js:54-62`, extend `parseStringOrIdent()` to accept `DOTTED_IDENT`. In
`parser.js:83-90`, extend `resolveArrayElement()` to handle `DOTTED_IDENT`.

**Verify:** `bun test` in `libsyntheticgen`.

### Step 4 — Clinical block parser

Create `parser-clinical.js` exporting `createClinicalParsers(helpers)` →
`{ parseClinical }`.

`parseClinical()` dispatches on sub-keywords `condition`, `site`, `trial`,
`content` inside a brace-delimited block. Returns
`ClinicalBlock { conditions[], sites[], trials[], content }`.

Sub-parsers:

| Parser | Output | Key fields |
|--------|--------|------------|
| `parseClinicalCondition()` | `{ id, name, icd10, synonyms, synthea_module, severity, prose_topic, prose_tone }` | `icd10` and `synonyms` via `parseArray()` |
| `parseClinicalSite()` | `{ id, name, address, city, state, country, org_ref, capacity, specialties }` | `org` field stored as `org_ref` |
| `parseClinicalTrial()` | Full trial object with nested criteria | `principal_investigator` reads `AT_IDENT`; `criteria` triggers nested parsing |
| `parseCriteria()` | `{ inclusion, exclusion }` | Boolean fields via `parseStringOrIdent()` → convert `"true"/"false"` |
| `parseClinicalContent()` | `ClinicalContentSpec` | Cardinality fields accept number or `per_*` keyword sentinel |

**Verify:** `bun test` in `libsyntheticgen`.

### Step 5 — Parser entry point

In `parser.js`, add `clinical: null` to the AST initializer (`line 122-138`).
Add `clinical` to `TOP_LEVEL` dispatch (`line 140-176`):

```javascript
clinical: () => { ast.clinical = clinical.parseClinical(); },
```

Import `createClinicalParsers` and create the instance alongside `blocks` and
`std`.

**Verify:** Parse the full `data/synthetic/story.dsl` — must produce a valid AST
with `ast.clinical === null`. All existing tests pass:
`cd libraries/libsyntheticgen && bun test`.

### Step 6 — Tests

**tokenizer.test.js:**

- `DOTTED_IDENT` — `clinical.conditions` tokenizes as a single token.
- `DOTTED_IDENT` in array — `[clinical.conditions, clinical.trials]` produces
  two `DOTTED_IDENT` tokens.
- Plain `IDENT` unchanged — `researchers` still tokenizes as `IDENT`.
- New keywords — `clinical`, `condition`, `site`, `trial`, `criteria` all
  tokenize as `KEYWORD`.

**parser-clinical.test.js:**

- Minimal clinical block — single condition, site, trial with criteria, no
  content.
- Full clinical block — 2 conditions, 2 sites, 1 trial, content with `per_*`
  sentinels.
- Per-entity cardinality — `condition_explainers per_condition` parses to string
  `"per_condition"`.
- Cross-domain references — `project oncora` and `principal_investigator @thoth`
  parse correctly.
- Error: unknown keyword in condition — throws with line number.
- Error: unknown keyword in trial — throws with line number.
- Clinical block is optional — `terrain test {}` parses with
  `ast.clinical === null`.

## Blast Radius

Created: `parser-clinical.js`, `parser-clinical.test.js`. Modified:
`tokenizer.js`, `parser.js`, `parser-helpers.js`, `tokenizer.test.js`.

## Verification

```sh
cd libraries/libsyntheticgen && bun test
```
