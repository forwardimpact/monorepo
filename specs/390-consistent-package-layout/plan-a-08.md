# Plan A — Part 08: Enforce, document, smoke test

Final part. Flip the allowed-subdirs check to strict mode, rewrite
`CLAUDE.md § Structure` to describe the contract, update the internals docs
and library/product skill files, and run a fresh-install smoke test that
proves every published subpath export still resolves.

## Scope

This part has two stages. Stage 1 is **code and configuration** (run as
staff-engineer): flip strict mode, run the smoke test, verify CI. Stage 2
is **prose** (handed off to the technical-writer sub-agent): rewrite
`CLAUDE.md § Structure`, update internals pages, update library skill files.

The handoff boundary is explicit: after Stage 1 commits cleanly and the
layout check is enforcing strict mode, the staff-engineer launches a
`technical-writer` sub-agent with the prose task and waits for it to
return a commit. The staff-engineer then runs a final `bun run check` and
`bun run test`, pushes, and advances `specs/STATUS` from `active` → `done`.

## Stage 1: Enforce + smoke test

### Flip strict mode

Edit `scripts/check-package-layout.js` from Part 01 so strict mode is the
default:

```diff
-const strict = process.argv.includes("--strict");
+const strict = !process.argv.includes("--no-strict");
```

Equivalently, set `strict = true` unconditionally and remove the
permissive fall-through. The explicit `--no-strict` escape hatch is kept
for ad-hoc debugging.

The script now fails fast on any drift. After Parts 02–07 there should be
zero drift, so this change is a no-op for exit behaviour on a clean
branch.

### Fresh-install smoke test

The spec's success criterion #9 requires proving every published subpath
export key still resolves. The Part 01 check confirms directory layout; the
smoke test confirms **resolution**.

Create `scripts/check-exports-resolve.js`:

```js
#!/usr/bin/env node
// Prove that every published subpath export across every @forwardimpact
// package resolves to a file on disk. Used by spec 390 success criterion #9.

import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { glob } from "node:fs/promises";

const manifests = await Array.fromAsync(
  glob(["libraries/*/package.json", "products/*/package.json", "services/*/package.json"]),
);

let failures = 0;
let total = 0;

for (const manifestPath of manifests) {
  const pkgRoot = dirname(manifestPath);
  const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!pkg.exports) continue;

  const walk = (exports) => {
    if (typeof exports === "string") return [exports];
    return Object.values(exports).flatMap(walk);
  };

  const targets = walk(pkg.exports);
  for (const target of targets) {
    // Skip wildcard patterns — they are resolved per-consumer and can't be
    // checked without a concrete consumer path.
    if (target.includes("*")) continue;
    total += 1;
    const resolved = join(pkgRoot, target);
    if (!existsSync(resolved) || !statSync(resolved).isFile()) {
      console.error(`MISSING: ${pkg.name} → ${target}  (${resolved})`);
      failures += 1;
    }
  }

  // Also verify `main` resolves.
  if (pkg.main) {
    total += 1;
    const resolved = join(pkgRoot, pkg.main);
    if (!existsSync(resolved) || !statSync(resolved).isFile()) {
      console.error(`MISSING main: ${pkg.name} → ${pkg.main}  (${resolved})`);
      failures += 1;
    }
  }

  // And every bin entry.
  if (pkg.bin) {
    for (const [name, target] of Object.entries(pkg.bin)) {
      total += 1;
      const resolved = join(pkgRoot, target);
      if (!existsSync(resolved) || !statSync(resolved).isFile()) {
        console.error(`MISSING bin[${name}]: ${pkg.name} → ${target}  (${resolved})`);
        failures += 1;
      }
    }
  }
}

console.log(`Checked ${total} resolution targets across ${manifests.length} packages.`);
if (failures) {
  console.error(`${failures} missing.`);
  process.exit(1);
}
console.log("All exports resolve.");
```

Wire it into `package.json`:

```jsonc
"scripts": {
  "check": "bun run format && bun run lint && bun run layout && bun run check:exports",
  "check:exports": "node scripts/check-exports-resolve.js"
}
```

Add it to the CI quality workflow as a fourth job.

### Pre-move vs post-move key parity

Before the branch started, snapshot the set of published subpath keys from
`main`:

```sh
git checkout main -- .
node -e '
  const { readFileSync } = require("node:fs");
  const { globSync } = require("node:fs");
  const keys = [];
  for (const p of require("glob").sync(["libraries/*/package.json", "products/*/package.json", "services/*/package.json"])) {
    const m = JSON.parse(readFileSync(p, "utf8"));
    if (!m.exports) continue;
    const walk = (e, prefix = "") => {
      if (typeof e === "string") { keys.push(`${m.name}${prefix}`); return; }
      for (const [k, v] of Object.entries(e)) walk(v, prefix + k.replace(/^\./, ""));
    };
    walk(m.exports);
  }
  keys.sort();
  console.log(keys.join("\n"));
' > /tmp/pre-move-keys.txt
git checkout feat/390-consistent-package-layout -- .
# Same script:
... > /tmp/post-move-keys.txt
diff /tmp/pre-move-keys.txt /tmp/post-move-keys.txt
```

**Expected output: empty diff.** Any difference is a missed key and must
be fixed before the part is complete. The exact script is captured in
Part 08 as a one-off verification — do not add it to CI.

### Ordering (Stage 1)

1. Flip strict mode in `scripts/check-package-layout.js`.
2. Add `scripts/check-exports-resolve.js`.
3. Wire both into `package.json` and `.github/workflows/check-quality.yml`.
4. Run `bun run check` locally. Must pass end-to-end.
5. Snapshot pre-move vs post-move key parity. Must match.
6. Run `bun run test`. Must pass.
7. Commit Stage 1.
8. Launch the Stage 2 sub-agent.

## Stage 2: Prose

Handed off to a **`technical-writer` sub-agent** via the `Agent` tool. The
sub-agent does not invoke any skill. Tell it explicitly: no skills, no
nested sub-agents.

### CLAUDE.md § Structure rewrite

The current section (lines 143–175) shows a sample tree with
`landmark/` and `summit/` as products — neither exists as a package. It
does not describe the allowed-root-subdirs contract.

Target state: rewrite the section so it is **the** canonical description
of the per-package layout. New subsections:

1. **Monorepo structure** — one-screen tree showing top-level folders
   (`products/`, `services/`, `libraries/`, `config/`, `data/`, `specs/`,
   `wiki/`, `website/`). Remove `landmark/` and `summit/` from the tree
   comment. They can be mentioned in the products list but not shown as
   directories.

2. **Per-package layout** — the canonical tree for a non-service package,
   the canonical tree for a service, and the allowed-root-subdirs list as
   a bullet:

   > Every package under `products/`, `services/`, and `libraries/`
   > follows this layout. Any directory at the package root must be one
   > of: `bin/`, `config/`, `macos/`, `pkg/`, `proto/`, `schema/`,
   > `src/`, `starter/`, `supabase/`, `templates/`, `test/`. Anything
   > else fails `bun run layout`.

3. **Services exception** — the two-file root (`index.js`, `server.js`),
   loaded by fixed path from `config/config.example.json` service commands,
   is called out explicitly.

4. **Per-package `justfile`** — allowed-list paragraph confirming that a
   package may add its own `justfile` without replacing the top-level one
   (per rule 7 of the spec).

5. **Enforcement** — link to `scripts/check-package-layout.js` and
   `bun run layout` / `bun run check:exports`.

Keep the section concise — under 80 lines. Put the long-form rationale
in an internals page if needed, not CLAUDE.md.

### Internals doc updates

These pages currently have file-tree diagrams that show the old layout.
Each needs a pass:

- `website/docs/internals/map/index.md`
- `website/docs/internals/pathway/index.md`
- `website/docs/internals/basecamp/index.md`
- `website/docs/internals/guide/index.md`
- `website/docs/internals/codegen/index.md` — codegen now writes to
  `src/generated/`, mention the per-package symlink behaviour in one
  paragraph.

The technical-writer sub-agent runs a targeted grep for any tree diagram
or file-path reference that shows the pre-move layout:

```
rg -n 'libraries/[a-z]+/[a-z-]+\.js' website/docs/internals/
rg -n 'products/[a-z]+/[a-z-]+\.js' website/docs/internals/
rg -n '`[a-z-]+\.js`' website/docs/internals/
```

Then fixes each hit. Do not over-expand the scope — only touch the lines
that reference on-disk paths.

### Library skill updates

Every skill file under `.claude/skills/libs-*` lists the libraries it
covers and points at specific files. After the move, those files live
under `src/`. Skills to audit:

- `.claude/skills/libs-service-infrastructure/SKILL.md`
- `.claude/skills/libs-data-persistence/SKILL.md`
- `.claude/skills/libs-llm-orchestration/SKILL.md`
- `.claude/skills/libs-web-presentation/SKILL.md`
- `.claude/skills/libs-system-utilities/SKILL.md`
- `.claude/skills/libs-synthetic-data/SKILL.md`
- `.claude/skills/libskill/SKILL.md` (libskill has its own skill)

And the product skills:

- `.claude/skills/fit-map/SKILL.md`
- `.claude/skills/fit-pathway/SKILL.md`
- `.claude/skills/fit-basecamp/SKILL.md`
- `.claude/skills/fit-guide/SKILL.md`
- `.claude/skills/fit-universe/SKILL.md`

The technical-writer updates every file-path reference from the root to
`src/`. Grep for `.js`  patterns inside each skill file and verify each
matches a file that exists post-move. Rewrite the path if not.

Do not touch published skill _copy_ beyond file paths — that is
documentation policy for the wider skills review, not for this spec.

### gemba-walk / other skill invariants

The staff engineer's Apr 10 memory notes:

> gemba-walk has invariants for both of my workflows (plan-specs and
> implement-plans) in .claude/skills/gemba-walk/references/invariants.md

Check `invariants.md` for file-path references. Update any that have
moved.

### Ordering (Stage 2)

1. Technical-writer rewrites `CLAUDE.md § Structure`.
2. Technical-writer updates each internals page.
3. Technical-writer updates each library and product skill file.
4. Technical-writer commits with:
   ```
   docs(layout): update structure contract and internals pages (part 08/08)

   Rewrites CLAUDE.md § Structure to describe the allowed-root-subdirs
   contract, removes stale landmark/ and summit/ references, and updates
   every internals page and skill file that referenced the pre-move
   layout.

   Part 08 of 08 for spec 390.
   ```
5. Technical-writer returns control.
6. Staff-engineer runs `bun run check` and `bun run test` one last time.
7. Staff-engineer updates `specs/STATUS`: `390 done`.
8. Staff-engineer commits the STATUS update as
   `chore(specs): advance 390 to done`.
9. Push.

## Stage 2 sub-agent prompt (exact briefing)

Below is the briefing the staff-engineer uses when launching the
technical-writer sub-agent. It is self-contained and explicit about the
no-skills constraint. Adapt the exact prompt text at execution time but
keep these points intact:

> Spec 390 (consistent package layout) has landed as Parts 01–07 of its
> plan. Every package now lives under `src/`; the root-level `generated/`
> output is symlinked as `libraries/{librpc,libtype}/src/generated`;
> `libharness` is fully restructured. Your job is the documentation pass
> that completes Part 08.
>
> Update these surfaces so they reflect the new layout:
>
> 1. `CLAUDE.md § Structure` (lines ~143–175) — rewrite per
>    `specs/390-consistent-package-layout/plan-a-08.md § Stage 2`.
> 2. Internals pages under `website/docs/internals/{map,pathway,basecamp,guide,codegen}/index.md`.
> 3. Library skills under `.claude/skills/libs-*/SKILL.md` and the
>    `libskill/SKILL.md` exception.
> 4. Product skills under `.claude/skills/fit-*/SKILL.md`.
> 5. `.claude/skills/gemba-walk/references/invariants.md` if it references
>    moved file paths.
>
> Scope constraints: do not touch prose beyond file paths unless the
> surrounding prose has become misleading as a result of the move.
> Do not invoke any skill. Do not spawn sub-agents. Use Grep, Read, Edit,
> and Write directly. Commit with the message in plan-a-08.md § Stage 2.
> Return control when the commit is in place.

## Verification

- `bun run check` passes (strict layout check included).
- `bun run check:exports` passes (every subpath target resolves).
- Pre-move vs post-move subpath key diff is empty.
- `bun run test` passes, no regressions.
- `specs/STATUS` shows `390 done`.
- `CLAUDE.md § Structure` no longer mentions `landmark/` or `summit/` as
  directories.
- Fresh-install smoke test: run `npm pack` for a couple of published
  libraries (libskill, libharness, map) and verify the tarball contents
  include `src/**` and no legacy root-level `.js` files.

## Risks

1. **The fresh-install smoke test is only as good as its coverage.**
   `check-exports-resolve.js` skips wildcard patterns (`./components/*`,
   `./css/*`). For libui, a wildcard miss is possible. Mitigation: pick
   one concrete wildcard consumer (e.g., `pathway` importing
   `@forwardimpact/libui/components/card`) and assert it resolves in the
   smoke test. A single-line hardcoded assertion is acceptable.

2. **Strict mode may surface drift the prior parts missed.** If Part 08
   flips the switch and `bun run layout` fails, stop — do not commit.
   Back-fill the missed package in Part 06 or Part 07 as a fixup commit
   and re-run.

3. **The technical-writer sub-agent may edit copy beyond file paths.**
   Scope creep risk. The briefing is explicit, but review the technical
   writer's commit before pushing and revert any prose edits that go
   beyond updating file paths.

4. **`specs/STATUS` advancement must wait until everything is clean.**
   The spec lifecycle is `planned → active → done`. When Part 01 starts,
   the status goes to `active`; when Part 08 finishes and pushes, the
   status advances to `done`. Do not advance to `done` while the
   technical-writer commit is still pending.

## Deliverable commits (stages)

**Stage 1:**

```
refactor(layout): enforce strict mode and smoke-test exports (part 08/08 stage 1)

- flip scripts/check-package-layout.js to strict mode by default
- add scripts/check-exports-resolve.js and wire into bun run check
- add check-exports job to check-quality CI workflow
- verify pre-move vs post-move subpath key parity (empty diff)

Part 08 stage 1 for spec 390.
```

**Stage 2** (technical-writer sub-agent):

```
docs(layout): update structure contract and internals pages (part 08/08 stage 2)

Rewrites CLAUDE.md § Structure to describe the allowed-root-subdirs
contract, removes stale landmark/ and summit/ references, and updates
every internals page and skill file that referenced the pre-move
layout.

Part 08 stage 2 for spec 390.
```

**Status advancement** (staff-engineer):

```
chore(specs): advance 390 to done
```

— Staff Engineer 🛠️
