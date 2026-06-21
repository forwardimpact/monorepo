# Worked example

A complete module enforcing one invariant: source files must not import a
forbidden package. It shows the three required parts (top comment, `build`,
`rules`) and the optional `seed` for grandfathering.

`.coaligned/invariants/no-legacy-client.rules.mjs`:

```js
// Invariant: src files must not import the legacy "old-client" package.
// New code uses "new-client". A monotone deny-list grandfathers files that
// still import the old one during migration; each PR removes its entries.
// Refresh the deny-list: npx coaligned invariants --seed no-legacy-client

import { stringify as stringifyYaml } from "yaml";

const DIRS = ["src", "packages"];
const SKIP = ["node_modules", "dist", "generated", "tmp", "test"];

function importsLegacy(ast, walk) {
  let found = false;
  walk(ast, (node) => {
    if (
      node.type === "ImportDeclaration" &&
      node.source?.value === "old-client"
    ) {
      found = true;
    }
  });
  return found;
}

function subjects({ scan, parse, walk }) {
  const out = [];
  for (const { path, rel, text } of scan({
    dirs: DIRS,
    skip: SKIP,
    match: (name) => name.endsWith(".js"),
  })) {
    const s = { path, rel };
    try {
      s.legacy = importsLegacy(parse(text, rel), walk);
    } catch (err) {
      s.parseError = err.message;
    }
    out.push(s);
  }
  return out;
}

export default {
  name: "no-legacy-client",

  build(kit) {
    return {
      subjects: { "src-file": subjects(kit) },
      ctx: { deny: kit.config("no-legacy-client.deny.yml", { files: [] }) },
    };
  },

  // Print the current violators as a deny-list to seed the YAML.
  seed(kit) {
    const files = subjects(kit)
      .filter((s) => s.legacy)
      .map((s) => s.rel);
    return stringifyYaml({ files });
  },

  rules: ({ parseError }) => [
    parseError("src-file", {
      id: "no-legacy-client.parse-error",
      hint: "fix the syntax error so the import scan can parse the file",
    }),
    {
      id: "no-legacy-client.import",
      scope: "src-file",
      severity: "fail",
      when: (s) => !s.parseError,
      check: (s, ctx) =>
        s.legacy && !ctx.deny.files.includes(s.rel) ? {} : null,
      message: () => 'imports "old-client"',
      hint: 'import "new-client", or grandfather the file in no-legacy-client.deny.yml during migration',
    },
  ],
};
```

## What to copy

- The **top comment** states the invariant and documents the `--seed` refresh.
- `subjects` collects through the kit and records `parseError` instead of
  throwing — the `parseError` rule turns that into a finding.
- The `check` returns `{}` (truthy) on violation and `null` when clean, and
  consults `ctx.deny` so grandfathered files pass until migrated.
- `seed` reuses the same `subjects` function so the deny-list and the live
  check can never diverge.
