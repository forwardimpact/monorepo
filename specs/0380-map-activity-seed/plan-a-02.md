# Part 02 — DSL Distribution Key Validation

Add a parse-time check that `people.distribution` keys exist in
`framework.levels` when both blocks are present.

## Rationale

The DSL currently accepts `L1`–`L5` distribution keys even when the framework
defines `J040`–`J100` levels. This silent mismatch produces people with levels
that don't exist in the framework, causing downstream validation failures. A
fast check at parse time prevents the entire class of errors.

## Changes

### Modify: `libraries/libsyntheticgen/dsl/parser.js`

Add a validation pass after the main parse loop completes. The validation runs
only when the AST contains both `people.distribution` and `framework.levels`.

**Location**: After the `while` loop in `parse()` that builds the AST, before
`return ast`.

```javascript
// Validate distribution keys against framework levels (when both exist)
if (ast.people?.distribution && ast.framework?.levels?.length) {
  const levelIds = new Set(ast.framework.levels.map((l) => l.id));
  for (const key of Object.keys(ast.people.distribution)) {
    if (!levelIds.has(key)) {
      const have = ast.framework.levels.map((l) => l.id).join(", ");
      throw new Error(
        `distribution key "${key}" does not match any framework level (have: ${have})`,
      );
    }
  }
}
```

**Why here and not in `parser-blocks.js`**: The distribution and framework
blocks are parsed independently (they can appear in any order). The cross-block
validation must run after both have been parsed — the top-level `parse()`
function is the natural place.

**Error type**: The parser uses plain `Error` throughout — there is no custom
`ParseError` class.

### Modify: `libraries/libsyntheticgen/test/activity.test.js`

The existing `MINI_UNIVERSE` test fixture uses `L1`–`L4` distribution keys
without a `framework` block. This continues to work (validation only fires when
both blocks are present).

Add a test that verifies the validation:

```javascript
test("rejects distribution keys that don't match framework levels", () => {
  const source = `
    universe test {
      domain "Testing"
      org "TestCo" {
        department "Eng" { team "A" { size 3 } }
      }
      people {
        count 5
        distribution { L1 50% L2 50% }
      }
      framework {
        levels {
          J040 { title "Junior" rank 1 }
          J060 { title "Mid" rank 2 }
        }
      }
    }
  `;
  assert.throws(
    () => parse(tokenize(source)),
    /distribution key "L1" does not match any framework level/,
  );
});

test("accepts distribution keys matching framework levels", () => {
  const source = `
    universe test {
      domain "Testing"
      org "TestCo" {
        department "Eng" { team "A" { size 3 } }
      }
      people {
        count 5
        distribution { J040 50% J060 50% }
      }
      framework {
        levels {
          J040 { title "Junior" rank 1 }
          J060 { title "Mid" rank 2 }
        }
      }
    }
  `;
  assert.doesNotThrow(() => parse(tokenize(source)));
});
```

**Note**: DSL fixtures must be wrapped in `universe NAME { ... }` — the parser
expects this as the top-level structure. The `org` block also requires at least
one `department` with a `team`.

### Modify: `data/synthetic/story.dsl`

If the monorepo's own story file uses distribution keys that don't match its
framework levels, update the distribution block to use the correct level IDs.
(The spec notes this was already fixed in the working tree — verify it's
committed.)

## Verification

1. `bun test libraries/libsyntheticgen/test/activity.test.js` — new and existing
   tests pass.
2. `bun test libraries/libsyntheticgen/` — full suite passes.
3. `just synthetic` — succeeds with the corrected story.dsl (distribution keys
   match framework levels).

## Risks

- **Downstream DSL files**: External installations using arbitrary distribution
  keys without a `framework` block are unaffected (validation only fires when
  both blocks are present). Installations that define both blocks with
  mismatched keys will get a clear error — this is the intended behavior.
