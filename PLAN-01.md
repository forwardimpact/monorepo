# PLAN-01: DSL Grammar + Clinical Block Parser

> Extend the tokenizer and parser to support `clinical {}` as a new
> top-level domain block with `condition`, `site`, `trial` (with nested
> `criteria`), and `content` sub-blocks. This is the foundation — every
> downstream plan depends on the AST nodes produced here.

## Dependencies

None. This is the first plan in the chain.

## Dependency Graph

```
PLAN-01 ──→ PLAN-02 (entities)
        ├─→ PLAN-04 (output formats)
        └─→ PLAN-06 (dataset evolution)
```

## Files to Modify

| File | Change |
|------|--------|
| `libraries/libsyntheticgen/src/dsl/tokenizer.js` | New keywords, `DOTTED_IDENT` token type, `per_*` sentinel tokens |
| `libraries/libsyntheticgen/src/dsl/parser.js` | `clinical` in TOP_LEVEL dispatch (line 140), `ast.clinical` field (line 122) |
| `libraries/libsyntheticgen/src/dsl/parser-helpers.js` | `parseMappedArrays()` helper for `text_fields` blocks |
| `libraries/libsyntheticgen/test/tokenizer.test.js` | Tests for new token types |

## Files to Create

| File | Purpose |
|------|---------|
| `libraries/libsyntheticgen/src/dsl/parser-clinical.js` | `createClinicalParsers(helpers)` factory — clinical block parser |
| `libraries/libsyntheticgen/test/parser-clinical.test.js` | Tests for clinical block parsing |

## Steps

### 1. Tokenizer: New Keywords

Add to the `KEYWORDS` set in `tokenizer.js:20-117`:

```
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

Note: `name`, `type`, `phase`, `teams`, `content`, `project`, `org` are
already keywords. Some fields like `prose_topic` and `prose_tone` are already
in the set (used by `project`). Only add keywords that are genuinely new.

Cross-check against the existing set before adding — duplicates in a `Set` are
harmless but add noise to the diff.

### 2. Tokenizer: DOTTED_IDENT Token Type

Modify `readWord()` (tokenizer.js:204-211) to continue reading through dots
when the character after a dot is a letter. After reading the full word, check
for dots: if the word contains at least one dot, emit `DOTTED_IDENT` instead
of `IDENT` or `KEYWORD`.

```javascript
function readWord(source, s) {
  let word = "";
  while (s.i < source.length && /[a-zA-Z0-9_]/.test(source[s.i])) {
    word += source[s.i];
    s.i++;
    // Continue through dots when followed by a letter (dotted identifiers)
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

### 3. Tokenizer: Per-Entity Sentinel Tokens

`per_condition`, `per_trial`, `per_site` are added to `KEYWORDS` (step 1).
In the parser, they'll be recognized by keyword value and treated as sentinel
values (not numbers) for the cardinality fields in clinical content. No special
token type needed — keyword recognition is sufficient.

### 4. Parser Helpers: parseMappedArrays()

Add to `parser-helpers.js` — a helper that reads a brace-delimited block of
`key array` pairs. Keys can be `DOTTED_IDENT` or `IDENT` or `KEYWORD`.

```javascript
function parseMappedArrays(blockName) {
  const { peek, advance, expect, parseArray } = helpers;
  expect("LBRACE");
  const map = {};
  while (peek().type !== "RBRACE") {
    const key = advance();
    if (
      key.type !== "DOTTED_IDENT" &&
      key.type !== "IDENT" &&
      key.type !== "KEYWORD"
    ) {
      throw new Error(
        `Expected identifier in ${blockName} at line ${key.line}, got ${key.type}`,
      );
    }
    map[key.value] = parseArray();
  }
  expect("RBRACE");
  return map;
}
```

Export from `createDispatchHelpers()` alongside `consumeFields`.

### 5. Clinical Block Parser: New File

Create `parser-clinical.js` following the existing factory pattern. It exports
`createClinicalParsers(helpers)` which returns `{ parseClinical }`.

The `parseClinical()` function:
1. Expects `LBRACE`
2. Loops until `RBRACE`, dispatching on sub-keywords:
   - `condition` → `parseClinicalCondition()`
   - `site` → `parseClinicalSite()`
   - `trial` → `parseClinicalTrial()`
   - `content` → `parseClinicalContent()`
3. Returns `ClinicalBlock`:

```javascript
{
  conditions: ClinicalCondition[],
  sites: ClinicalSite[],
  trials: ClinicalTrial[],
  content: ClinicalContentSpec | null
}
```

#### parseClinicalCondition()

Reads id, then brace-delimited fields:

| Field | Parser | Required |
|-------|--------|----------|
| `name` | parseStringValue | yes |
| `icd10` | parseArray | yes |
| `synonyms` | parseArray | yes |
| `synthea_module` | parseStringOrIdent | yes |
| `severity` | parseStringOrIdent | yes |
| `prose_topic` | parseStringValue | no |
| `prose_tone` | parseStringValue | no |

Returns: `{ id, name, icd10, synonyms, synthea_module, severity, prose_topic, prose_tone }`

#### parseClinicalSite()

Reads id, then brace-delimited fields:

| Field | Parser | Required |
|-------|--------|----------|
| `name` | parseStringValue | yes |
| `address` | parseStringValue | yes |
| `city` | parseStringValue | yes |
| `state` | parseStringValue | yes |
| `country` | parseStringValue | yes |
| `org` | parseStringOrIdent | yes |
| `capacity` | parseNumberValue | yes |
| `specialties` | parseArray | yes |

Returns: `{ id, name, address, city, state, country, org_ref, capacity, specialties }`

#### parseClinicalTrial()

Reads id, then brace-delimited fields. The `criteria` field triggers nested
parsing.

| Field | Parser | Notes |
|-------|--------|-------|
| `name` | parseStringValue | |
| `protocol_id` | parseStringValue | |
| `project` | parseStringOrIdent | Cross-domain ref to terrain root |
| `phase` | parseStringValue | |
| `therapeutic_area` | parseStringValue | |
| `conditions` | parseArray | IDs within clinical scope |
| `sites` | parseArray | IDs within clinical scope |
| `principal_investigator` | advance() (AT_IDENT) | @ref to person |
| `sponsor` | parseStringValue | |
| `status` | parseStringValue | |
| `target_enrollment` | parseNumberValue | |
| `current_enrollment` | parseNumberValue | |
| `start_date` | parseDateValue | |
| `estimated_end_date` | parseDateValue | |
| `arms` | parseArray | |
| `prose_topic` | parseStringValue | |
| `prose_tone` | parseStringValue | |
| `criteria` | parseCriteria() | Nested block |

Returns the full trial object.

#### parseCriteria()

Expects `LBRACE`, dispatches `inclusion` → `parseInclusion()` and
`exclusion` → `parseExclusion()`, expects `RBRACE`.

```javascript
{
  inclusion: { age_min, age_max, conditions_required, prior_treatments_allowed, ecog_max, custom },
  exclusion: { conditions_excluded, active_autoimmune, prior_immunotherapy, custom }
}
```

Boolean fields (`active_autoimmune`, `prior_immunotherapy`): read with
`parseStringOrIdent()`, convert `"true"/"false"` to boolean.

#### parseClinicalContent()

Expects `LBRACE`, dispatches on content field keywords. Cardinality fields
accept either a number (via `parseNumberValue()`) or a `per_*` keyword
sentinel.

```javascript
function parseCardinalityOrNumber() {
  const t = peek();
  if (t.type === "KEYWORD" && t.value.startsWith("per_")) {
    return advance().value; // "per_condition", "per_trial", "per_site"
  }
  return parseNumberValue();
}
```

Fields:

| Field | Parser |
|-------|--------|
| `condition_explainers` | parseCardinalityOrNumber |
| `therapy_descriptions` | parseNumberValue |
| `therapy_topics` | parseArray |
| `trial_faqs` | parseCardinalityOrNumber |
| `consent_summaries` | parseCardinalityOrNumber |
| `site_descriptions` | parseCardinalityOrNumber |
| `patient_stories` | parseNumberValue |
| `patient_story_conditions` | parseArray |

Returns `ClinicalContentSpec`.

### 6. Parser Entry Point: TOP_LEVEL Dispatch

In `parser.js`, add `clinical` to the AST initializer (line 122-138):

```javascript
const ast = {
  // ... existing fields ...
  clinical: null,   // <-- new
};
```

Add to TOP_LEVEL (line 140-176):

```javascript
clinical: () => {
  ast.clinical = clinical.parseClinical();
},
```

Import `createClinicalParsers` at the top and create the instance alongside
`blocks` and `std`:

```javascript
import { createClinicalParsers } from "./parser-clinical.js";
// ...
const clinical = createClinicalParsers(helpers);
```

### 7. parseStringOrIdent: Accept DOTTED_IDENT

In `parser.js:54-62`, extend `parseStringOrIdent()` to also accept
`DOTTED_IDENT`:

```javascript
function parseStringOrIdent() {
  const t = peek();
  if (t.type === "STRING") return advance().value;
  if (t.type === "IDENT") return advance().value;
  if (t.type === "DOTTED_IDENT") return advance().value;
  if (t.type === "KEYWORD") return advance().value;
  throw new Error(
    `Expected string or identifier at line ${t.line}, got ${t.type} '${t.value}'`,
  );
}
```

Similarly extend `resolveArrayElement()` (parser.js:83-90) to handle
`DOTTED_IDENT` in arrays (for `entities [clinical.conditions, ...]`):

```javascript
function resolveArrayElement() {
  const t = peek();
  if (
    t.type === "STRING" ||
    t.type === "IDENT" ||
    t.type === "KEYWORD" ||
    t.type === "DOTTED_IDENT"
  ) {
    return advance().value;
  }
  if (t.type === "NUMBER") return Number(advance().value);
  throw new Error(`Unexpected ${t.type} in array at line ${t.line}`);
}
```

## Verification

### Unit Tests (parser-clinical.test.js)

1. **Minimal clinical block** — single condition, single site, single trial
   with criteria, no content. Assert AST shape matches expected.

2. **Full clinical block** — 2 conditions, 2 sites, 1 trial with both
   inclusion and exclusion criteria, content sub-block with per_* sentinels.

3. **Per-entity cardinality** — `condition_explainers per_condition` parses
   to the string `"per_condition"`, not a number.

4. **Cross-domain references** — trial with `project oncora` and
   `principal_investigator @thoth` parse correctly (@ becomes AT_IDENT).

5. **Error: unknown keyword in condition** — throws with line number.

6. **Error: unknown keyword in trial** — throws with line number.

7. **Clinical block is optional** — `terrain test {}` still parses with
   `ast.clinical === null`.

### Unit Tests (tokenizer.test.js)

8. **DOTTED_IDENT** — `clinical.conditions` tokenizes as a single
   `DOTTED_IDENT` token, not three tokens.

9. **DOTTED_IDENT in array** — `[clinical.conditions, clinical.trials]`
   produces two `DOTTED_IDENT` tokens inside brackets.

10. **Plain IDENT unchanged** — `researchers` still tokenizes as `IDENT`.

11. **New keywords** — `clinical`, `condition`, `site`, `trial`, `criteria`
    all tokenize as `KEYWORD`.

### Smoke Test

Parse the full `data/synthetic/story.dsl` — it must still produce a valid
AST with `ast.clinical === null` (no clinical block yet in the story).

```sh
cd libraries/libsyntheticgen && bun test
```

All existing tests must pass unchanged.
