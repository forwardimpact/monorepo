# Plan 2200 — Gemba, an agent-runtime platform product

How to implement the design in `design-a.md`: create the `Gemba` meta-product,
move the run actions and the bring-up scripts into it, refocus Gear, adopt
`fit-bootstrap.sh` into the Monorepo standard, and regenerate the derived
context. The change is a re-home plus a clean-break dependency edit — no library
or CLI is renamed, and no sibling action repo or pin changes.

## End state on disk

```text
products/gemba/                         # new meta-product
  package.json                          # deps = libharness, libwiki, libxmr; no bin/src/README
  actions/
    bootstrap/                          # from .github/actions/bootstrap/
      action.yml                        # runs $GITHUB_ACTION_PATH/fit-bootstrap.sh
      fit-install.sh                    # unchanged, moved with the action
      fit-bootstrap.sh                  # generalized from scripts/bootstrap.sh
      apm-verify.mjs, LICENSE, README.md
    harness/                            # from libraries/libharness/actions/harness/
    benchmark/                          # from libraries/libharness/actions/benchmark/
    wiki/                               # from libraries/libwiki/actions/wiki/
websites/fit/gemba/index.md             # new overview page
.claude/skills/fit-gemba/SKILL.md       # new platform skill

libraries/libharness/                   # actions/ removed — import-only
libraries/libwiki/                      # actions/ removed — import-only
products/gear/package.json              # 3 runtime libs removed; operate clause dropped; svctrace kept
scripts/bootstrap.sh                    # removed
```

Both installers now live only under the `bootstrap` action; neither keeps a
repo-root shim. `svctrace` stays a Gear dependency.

## Sequencing rationale

The phases are ordered so the tree never depends on a path that a later phase
still needs to create. Scaffold the product first, then move sources into it,
then repoint every reference, then edit Gear, then write the narrative and the
standard, and run `bun run check` plus the `rg` gates last, once every path is
final. `bun run check` is expected to fail between phases 2 and 4 (dangling
paths) and is only asserted green at the end.

## Phase 1 — Scaffold the Gemba product shell

1. Create `products/gemba/package.json`: `name` `@forwardimpact/gemba`,
   `private`/no-`bin` like Gear, `description`, `dependencies` = exactly
   `@forwardimpact/libharness`, `@forwardimpact/libwiki`, `@forwardimpact/libxmr`
   at their current versions (`^1.0.0`, `^0.2.0`, `^2.0.0`). No `bin`, no `src`,
   no hand-authored `README.md`.
2. Add one `jobs` Big Hire entry, `user` = `Teams Using Agents`, goal *Stand Up
   and Operate an Agent Team* — worded distinctly from Kata's existing job.
3. Register `products/gemba` in the workspace if the root `package.json`
   enumerates members; run the install/link step so the three deps resolve.

**Verify:** `products/gemba/package.json` parses; deps are the three runtime
libraries and nothing else (no `svctrace`). Covers SC1, SC8.

## Phase 2 — Move the run actions into the product

1. `git mv .github/actions/bootstrap products/gemba/actions/bootstrap`.
2. `git mv libraries/libharness/actions/harness products/gemba/actions/harness`
   and `.../benchmark products/gemba/actions/benchmark`.
3. `git mv libraries/libwiki/actions/wiki products/gemba/actions/wiki`.
4. Remove the now-empty `libraries/libharness/actions/` and
   `libraries/libwiki/actions/` directories.

**Verify:** the four actions exist under `products/gemba/actions/`; the source
`actions/` dirs and `.github/actions/bootstrap/` are gone. Covers SC6.

## Phase 3 — Generalize the bring-up script

1. Turn the moved `scripts/bootstrap.sh` into
   `products/gemba/actions/bootstrap/fit-bootstrap.sh`: strip this repo's
   hardcoded assumptions so it is repo-agnostic and publishable, exactly as
   `fit-install.sh` already is (it now sits beside it in the same action). It
   still reconstitutes the workspace (install/codegen) and syncs the wiki.
2. Edit `products/gemba/actions/bootstrap/action.yml` to run
   `bash "$GITHUB_ACTION_PATH/fit-bootstrap.sh"`, replacing the
   `./scripts/bootstrap.sh` step.
3. Repoint the remaining live callers of the old path: the `.claude/settings.json`
   Stop hook and `scripts/worktree-create.sh`.
4. `git rm scripts/bootstrap.sh`.

**Verify:** `fit-bootstrap.sh` sits beside `fit-install.sh`; the action invokes
it via `$GITHUB_ACTION_PATH`; `scripts/bootstrap.sh` no longer exists. Part of
SC14.

## Phase 4 — Repoint every reference to the moved paths

1. **Bootstrap local-path references** (`.github/actions/bootstrap/` →
   `products/gemba/actions/bootstrap/`) in the eight live files: the
   `.claude/settings.json` SessionStart hook, the `justfile` `install-deps`
   recipe, the `publish-binaries.yml` release `sparse-checkout`/`sed` source,
   and the ignore globs in `.rumdl.toml`, `biome.json`, `eslint.config.js`, and
   the two `.coaligned/invariants/{temporal,model-defaults}.rules.mjs` modules.
2. **Split workflow** `publish-actions.yml`: repoint the `paths:` filter and the
   matrix `prefix:` for `bootstrap`/`harness`/`benchmark`/`wiki` under
   `products/gemba/actions/`. Leave every `repo:` sibling name unchanged.
3. **Release publish** `publish-binaries.yml`: on the existing
   `bundle == 'gear'` gate, add `fit-bootstrap.sh` beside `fit-install.sh` —
   check it out, stamp it the same way, `chmod +x`, and stage it into
   `dist/release/` as a co-versioned Release asset.

**Verify:** `rg --hidden '\.github/actions/bootstrap' -g '!specs/**' -g '!.git/**'`
returns nothing; every listed file points at `products/gemba/actions/bootstrap/`;
`publish-actions.yml` `repo:` names are unchanged; `publish-binaries.yml` stages
both installers on the `gear` gate. Covers SC7, SC13, part of SC14.

## Phase 5 — Refocus Gear

1. In `products/gear/package.json`, remove the three runtime library deps
   (`libharness`, `libwiki`, `libxmr`). Keep `@forwardimpact/svctrace`.
2. Remove the operate-time promise ("chart agent metrics") from Gear's
   `jobs.littleHire`, so Gear's promise is build-time primitives only.

**Verify:** Gear deps contain none of the three runtime libraries and still
contain `svctrace`; the operate clause is gone; each runtime library now belongs
to exactly one product. Covers SC2, SC3, SC4, SC5.

## Phase 6 — Product narrative and Kata framing

1. Write `websites/fit/gemba/index.md` (`layout: product`): the "stand up and
   operate an agent team" story by persona, presenting the four runtime CLIs
   (`fit-harness`, `fit-trace`, `fit-wiki`, `fit-xmr`) and the four CI actions as
   one runtime loop, with a Getting Started that names the bring-up layer.
2. Write `.claude/skills/fit-gemba/SKILL.md`: when to hire the platform and how
   the capabilities compose (stand up → run → see → remember → measure). No
   `## Documentation` CLI-parity block — the meta-package ships no CLI (the
   Gear/Kata exemption in `products/CLAUDE.md`).
3. Frame Kata as the reference tenant in `KATA.md` and on the overview page;
   make no `products/kata/` code change.

**Verify:** page and skill name the bring-up layer, reference the four CLIs, and
present the actions as the loop; `git diff` shows no `products/kata/` change.
Covers SC9, SC10.

## Phase 7 — Adopt fit-bootstrap.sh into the Monorepo standard

1. Rewrite `MONOREPO.md` (§ Workspace and the bring-up description) and the
   `.claude/skills/monorepo-setup/` skill and references so `fit-bootstrap.sh`
   *is* the bring-up script a repo fetches and runs. Write them evergreen — as
   the end state, with no trace of the removed `scripts/bootstrap.sh` and no
   migration language.
2. Repoint the explanatory comments that name the old path in
   `products/gemba/actions/bootstrap/action.yml`,
   `products/kata/actions/kata-agent/action.yml`, and
   `libraries/libwiki/src/util/wiki-dir.js`.

If `.claude/**` writes are blocked, use `echo … | bunx fit-selfedit <path>`.

**Verify:** `MONOREPO.md` § Workspace and the `monorepo-setup` skill name
`fit-bootstrap.sh` as the bring-up step; `rg --hidden 'scripts/bootstrap\.sh'
-g '!specs/**' -g '!.git/**'` returns nothing. Completes SC14.

## Phase 8 — Regenerate context and gate

1. Run `bun run context:fix` to regenerate the `JTBD.md` and
   `products/README.md` catalog/JTBD blocks for both the new product and the
   refocused Gear.
2. Hand-edit the non-generated counts and prose: the `products/README.md` intro
   product count, `CLAUDE.md` § Secondary Products, and the
   `sibling-composite-actions` enum / action-home prose (new homes).
3. Run `bun run check`; fix any lint/format/link fallout.
4. Run the two `rg` gates from SC13 and SC14 to confirm no dangling
   `.github/actions/bootstrap` or `scripts/bootstrap.sh` reference remains
   outside `specs/`.

**Verify:** `bun run check` passes; both `rg` gates are clean; generated blocks
and hand counts reflect both products. Covers SC11 and closes SC13/SC14.

## Deferred, untouched

`fit-terrain`/`libterrain`'s home and the `svcpathway` mis-filing are recorded
in the spec's § Deferred decisions and are not acted on here — `git diff` shows
no `libterrain`/`svcpathway` dependency move, and no runtime library, CLI, or
sibling action repo is renamed. Covers SC12.

## Success-criteria map

| SC | Phase |
| --- | --- |
| 1 | 1 |
| 2, 3, 4, 5 | 5 |
| 6 | 2 |
| 7 | 4 |
| 8 | 1 |
| 9 | 6 |
| 10 | 6 |
| 11 | 8 |
| 12 | deferred (verified in 8) |
| 13 | 4 (gated in 8) |
| 14 | 3 + 4 + 7 (gated in 8) |
