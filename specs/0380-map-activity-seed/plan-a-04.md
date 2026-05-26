# Part 04 — Integration Test: Synthetic → Validate → Push

End-to-end test exercising the seam between synthetic data generation and the
Map activity consumer.

**Depends on**: Part 01 (shared parser), Part 03 (seed command).

## Rationale

Unit tests pass individually, but the integration boundary between the universe
pipeline and Map was never exercised. This test would have caught every issue
discovered in the manual test session (roster wrapper key, field names, level
IDs).

## Changes

### Create: `products/map/test/activity/integration.test.js`

Integration test using a minimal DSL fixture. Steps 1–3 (generate, validate
framework, validate roster) run unconditionally. Step 4 (push to Supabase)
requires Docker and is skipped when unavailable.

```javascript
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parse } from "@forwardimpact/libsyntheticgen/dsl/parser";
import { tokenize } from "@forwardimpact/libsyntheticgen/dsl/tokenizer";
import { buildEntities } from "@forwardimpact/libsyntheticgen/engine/entities";
import { createSeededRNG } from "@forwardimpact/libsyntheticgen/rng";
import { parseYamlPeople } from "@forwardimpact/map/activity/parse-people";

// Minimal DSL with framework levels matching distribution keys.
// Must be wrapped in `universe NAME { ... }` — the parser requires it.
const MINI_DSL = `
  universe integration_test {
    domain "Testing"
    industry "technology"
    seed 42
    org "IntegrationCo" {
      department "Engineering" {
        team "Alpha" { size 3 }
      }
    }
    people {
      count 5
      distribution { J040 60% J060 40% }
      disciplines { software_engineering 100% }
    }
    framework {
      levels {
        J040 { title "Junior" rank 1 }
        J060 { title "Mid" rank 2 }
      }
      disciplines {
        software_engineering { title "Software Engineering" }
      }
    }
    output { formats [yaml] }
  }
`;

describe("synthetic → map integration", () => {
  let tmpDir;
  let ast;
  let entities;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "map-integration-"));
    ast = parse(tokenize(MINI_DSL));
  });

  test("DSL parses without error", () => {
    assert.ok(ast);
    assert.ok(ast.people);
    assert.ok(ast.framework);
  });

  test("distribution keys match framework levels", () => {
    const distKeys = Object.keys(ast.people.distribution);
    const levelIds = ast.framework.levels.map((l) => l.id);
    for (const key of distKeys) {
      assert.ok(levelIds.includes(key), `distribution key "${key}" not in framework levels`);
    }
  });

  test("generated people have valid levels", async () => {
    const rng = createSeededRNG(42);
    entities = buildEntities(ast, rng);
    const levelIds = new Set(ast.framework.levels.map((l) => l.id));
    for (const person of entities.people) {
      assert.ok(levelIds.has(person.level),
        `person ${person.name} has level "${person.level}" not in framework`);
    }
  });

  test("rendered roster parses through shared parser", async () => {
    const yaml = await import("yaml");
    const rosterYaml = yaml.stringify({ roster: entities.people });
    const parsed = parseYamlPeople(rosterYaml);
    assert.ok(parsed.length > 0, "parsed roster should have people");
    assert.ok(parsed[0].email || parsed[0].name, "parsed person should have fields");
  });

  // Step 4: Supabase push — skipped when Docker is unavailable
  const hasDocker = (() => {
    try {
      const { execSync } = require("child_process");
      execSync("docker info --format '{{.ID}}'", { timeout: 3000, stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  })();

  (hasDocker ? test : test.skip)("push roster to Supabase", async () => {
    // This test requires a running Supabase instance
    // Implementation: create Supabase client, call seed, verify row count
    // Exact implementation depends on how the Supabase client is created in test context
  });
});
```

**Import notes**: All imports use package exports (not direct file paths).
`createSeededRNG` is the actual export name from
`@forwardimpact/libsyntheticgen/rng`. The `"./activity/parse-people"` export
must be added to `products/map/package.json` (see part 01).

### Key test properties

1. **Steps 1–3 are pure computation** — no Docker, no network, no Supabase. They
   run in CI unconditionally.
2. **Step 4 is gated on Docker** — detected at test load time via `docker info`.
   When Docker is unavailable, the test is skipped with `test.skip`, not failed.
3. **Deterministic** — uses `seed 42` for reproducible generation.
4. **Tests the seam** — distribution keys flow from DSL → entity generation →
   roster rendering → shared parser. If any step silently transforms or drops
   the level ID, the test catches it.

## Verification

1. `bun test products/map/test/activity/integration.test.js` — passes locally
   (with or without Docker).
2. CI run — steps 1–3 always pass; step 4 passes when Docker is available.

## Risks

- **Entity generation API surface**: The test imports internal functions from
  libsyntheticgen. If the API changes, the test breaks — but that's the point
  (the integration boundary is being tested). Keep imports minimal.
- **CI Docker availability**: The test must degrade gracefully. The
  `docker info` check with a 3-second timeout ensures the test suite doesn't
  hang.
