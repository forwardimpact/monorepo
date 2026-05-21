# plan-a(1170): Deterministic Outpost.app bundle for brew lane

Execution plan for [design-a(1170)](design-a.md). One feat PR on a single
branch. Design Decision 2's data dependency is satisfied by a probe
workflow that runs on `pull_request` against this PR, comparing two
consecutive Outpost.app builds via `diffoscope`. The patch itself is one
edit to `compileLauncher()` in `products/outpost/pkg/build.js`.

## Approach

Localise drift, then patch, then verify — all inside the same PR. A
`pull_request`-triggered probe workflow runs the SC1 build sequence twice
on `macos-14` and uploads a diffoscope diff. The first probe (before the
Step 3 patch is pushed) confirms drift lives in the Swift Mach-O and
vetoes the plan if it does not. The second probe (after the patch) is the
verification that the flag set covers categories (a)/(b)/(c). The probe
ships via `pull_request` rather than `workflow_dispatch` because the
latter requires the workflow file to exist on the default branch before
dispatch is accepted, which would force a two-PR split.

## Steps

### Step 1: Add the determinism probe workflow

A `pull_request`-triggered macos-14 workflow that runs the SC1 build
sequence twice and uploads diffoscope output as an artifact. Filtered to
paths whose changes can affect the Outpost bundle so unrelated PRs do not
pay the runner cost.

- **Created**: `.github/workflows/outpost-determinism-probe.yml`

  ```yaml
  name: "Probe: Outpost determinism"

  on:
    pull_request:
      branches: [main]
      paths:
        - "products/outpost/**"
        - "libraries/libmacos/**"
        - ".github/workflows/outpost-determinism-probe.yml"

  permissions:
    contents: read

  jobs:
    probe:
      runs-on: macos-14
      steps:
        - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
        - uses: ./.github/actions/bootstrap
        - name: Install diffoscope
          run: brew install diffoscope
        - name: First build
          run: |
            just build-binary "fit-outpost"
            just build-app-product outpost
            cp -R dist/apps/fit-outpost.app /tmp/outpost-before.app
            codesign -dvvv dist/apps/fit-outpost.app 2>&1 | grep -i CDHash > /tmp/cdhash.before
        - name: Second build
          run: |
            rm -rf dist/apps dist/binaries products/outpost/dist
            just build-binary "fit-outpost"
            just build-app-product outpost
            cp -R dist/apps/fit-outpost.app /tmp/outpost-after.app
            codesign -dvvv dist/apps/fit-outpost.app 2>&1 | grep -i CDHash > /tmp/cdhash.after
        - name: Diffoscope
          run: |
            set +e
            diffoscope --text /tmp/diffoscope.txt \
              /tmp/outpost-before.app /tmp/outpost-after.app
            echo "diffoscope exit: $?"
            echo "=== CDHash before ==="; cat /tmp/cdhash.before
            echo "=== CDHash after ==="; cat /tmp/cdhash.after
            set -e
        - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
          with:
            name: outpost-determinism-probe
            path: |
              /tmp/diffoscope.txt
              /tmp/cdhash.before
              /tmp/cdhash.after
  ```

- `set +e` around the `diffoscope` invocation lets the captured exit
  status print accurately (without `|| true` swallowing it), then `set -e`
  restores fail-fast for subsequent commands. The diffoscope exit is
  diagnostic; non-zero is the expected outcome before the patch and
  zero is the expected outcome after.
- The workflow uses `pull_request` rather than `workflow_dispatch` because
  `workflow_dispatch` requires the workflow file to be on the default
  branch before any `gh workflow run --ref` invocation is accepted; a
  brand-new workflow on a PR branch cannot satisfy that. `pull_request`
  triggers on the head commit and runs the workflow file as it exists on
  the branch.
- Action SHAs are pinned to match the existing repo convention
  (`actions/checkout` and `actions/upload-artifact` SHAs already used by
  `publish-brew.yml` and `website-fit.yaml`).
- The probe runs both `just build-binary "fit-outpost"` and `just
  build-app-product outpost` to mirror `publish-brew.yml:62–63, 92–94`
  exactly. Spec SC1's local determinism recipe is the same two-step
  sequence; the probe's value is that a green probe implies a green
  gate (SC2) by reproducing the gate's commands, not a subset.
- **Verify**: there is no local YAML parser in this repo's `bun run
  check` and `gh workflow view` queries Actions API metadata rather
  than parsing files. The real Step 1 verification is the probe attempt
  itself in Step 2 — a malformed YAML surfaces as a workflow-file
  failure in the PR Checks tab when the `pull_request` trigger fires.

### Step 2: Capture baseline diffoscope output

Push Step 1 alone first. The `pull_request` trigger fires automatically
when the PR opens; the artifact is the baseline.

- **Action**: Push Step 1 commit, `gh pr create` (PR title `plan(1170):
  deterministic Outpost.app bundle for brew lane`, draft mode). PR
  open fires the probe. Discover the run id via `gh run list
  --workflow outpost-determinism-probe.yml --branch
  plan/1170-outpost-cdhash-determinism --limit 1 --json
  databaseId,status`, wait for `status:completed`, then `gh run
  download <databaseId> -n outpost-determinism-probe -D
  /tmp/probe-baseline`.
- **Expected**: `cdhash.before` and `cdhash.after` differ.
  `diffoscope.txt` names the drift locus inside
  `Contents/MacOS/Outpost` (the Swift Mach-O).
- **Decision gate (D2)**:
  - If drift locus is `Contents/MacOS/Outpost` (Swift binary) → proceed
    to Step 3.
  - If drift locus is elsewhere (Info.plist, embedded resources,
    `Contents/MacOS/fit-outpost`, codesign-internal fields outside
    CodeDirectory) → Decision 1 is vetoed. Post a comment on this PR
    quoting the first 100 lines of `diffoscope.txt` and stating
    "Decision 1 vetoed — drift locus is `<path>`, not the Swift Mach-O;
    handing back to design phase". Do **not** rewrite `wiki/STATUS.md` —
    that signal travels via human review of the comment, which
    `agent-react` then propagates per
    [approval-signals.md](../../.claude/agents/references/approval-signals.md).
    Halt the plan; do not push the source patch.
- **Verify**: copy `cdhash.before` + `cdhash.after` + the first 100
  lines of `diffoscope.txt` into the PR body under a `## Baseline
  diffoscope` heading.

### Step 3: Apply the determinism profile in `compileLauncher()`

One env-var and three `swift build` arguments encode design Decision 4's
three categories. Plan commits the candidate set; Step 4 validates it
against diffoscope.

- **Modified**: `products/outpost/pkg/build.js`
- Replace the body of `compileLauncher()` (current lines 68–85):

  ```js
  function compileLauncher() {
    console.log(`\nCompiling ${LAUNCHER_NAME}...`);
    ensureDir(DIST_DIR);

    const buildDir = join(LAUNCHER_DIR, ".build");
    rmSync(buildDir, { recursive: true, force: true });

    // Determinism profile — spec 1170, design Decision 4.
    // (a) SWIFT_DETERMINISTIC_HASHING=1 — symbol-table/section order.
    // (b) -file-prefix-map — DWARF absolute-path scrubbing.
    //     -no-clang-module-breadcrumbs — strips clang-module debug
    //     paths Swift modules can pull alongside DWARF.
    // (c) -Xlinker -no_uuid — suppress LC_UUID which ld64 derives from
    //     content + build-time entropy; pairs with (a)/(b) to leave
    //     the Mach-O byte-identical across rebuilds.
    const swiftCmd = [
      "swift build -c release",
      "-Xswiftc -no-clang-module-breadcrumbs",
      `-Xswiftc -file-prefix-map -Xswiftc "${LAUNCHER_DIR}=."`,
      "-Xlinker -no_uuid",
    ].join(" ");
    run(swiftCmd, {
      cwd: LAUNCHER_DIR,
      env: { ...process.env, SWIFT_DETERMINISTIC_HASHING: "1" },
    });

    const binary = join(buildDir, "release", LAUNCHER_NAME);
    const outputPath = join(DIST_DIR, LAUNCHER_NAME);
    run(`cp "${binary}" "${outputPath}"`);

    rmSync(buildDir, { recursive: true, force: true });

    console.log(`  -> ${outputPath}`);
    return outputPath;
  }
  ```

- `env` is spread explicitly because passing `env` to `execSync` replaces
  the inherited environment entirely — without `...process.env` the
  spawned `swift` would lose PATH and fail to find the toolchain.
- `compileScheduler()` is **not** modified (design Decision 1 + spec § In
  scope row 2 — the scheduler shares its `bun build --compile` step with
  six passing bundles).
- No change to `Package.swift` (design Decision 5).
- No change to `libraries/libmacos/scripts/` (design Decision 3).
- No change to `.github/workflows/publish-brew.yml` (design Decision 6).
- **Verify**: deferred to Step 4 — the implementer's runner is Linux and
  cannot exercise `swift build`. The probe in Step 4 is the only
  available correctness signal.

### Step 4: Verification diffoscope run

Push Step 3 to the same PR branch. The push fires the probe a second
time; the artifact is the validation.

- **Action**: push the Step 3 commit, discover the new run id via the
  `gh run list` command from Step 2, then `gh run download
  <databaseId> -n outpost-determinism-probe -D /tmp/probe-verify` once
  the probe completes.
- **Expected**:
  - `cdhash.before` and `cdhash.after` identical. The line `cdhash
    stable:` will appear on the next `outpost@v*` tag push (SC2);
    SC1's local diff exits 0.
  - `diffoscope.txt` empty or limited to codesign-internal bytes that
    do not enter the CodeDirectory hash.
- **If drift remains in `Contents/MacOS/Outpost`**:
  - Inspect `diffoscope.txt` to identify which Mach-O sub-region drifts
    (DWARF, symbol table, LC_UUID, `__TEXT,__cstring`, etc.).
  - Adjust the Step 3 flag set **within categories (a)/(b)/(c) only**.
    Valid alternatives the Swift 5.9 driver accepts on `swift build`:
    `-Xswiftc -debug-prefix-map -Xswiftc "$LAUNCHER_DIR=."` (DWARF-only
    path remap, paired with or substituted for `-file-prefix-map`);
    omitting `-Xlinker -no_uuid` and re-running the probe to confirm
    the CodeDirectory hash is insensitive to LC_UUID variance (the
    gate hashes CodeDirectory only, so LC_UUID drift in the diffoscope
    output may be non-load-bearing); `-Xswiftc -gnone` as a
    last-resort drop of debug info entirely if DWARF determinism
    proves unreachable on Swift 5.9. Do not introduce flags from
    outside the three categories — `xcodebuild`-only variables like
    `OTHER_SWIFT_FLAGS` and clang-driver forms like the
    `=`-suffixed `-file-prefix-map=OLD=NEW` token do not apply to
    `swift build`'s Swift frontend and must not appear.
  - **Out-of-category adjustments** (Package.swift bump, scheduler
    rebuild, libmacos changes) are not in scope for this plan. If the
    gap cannot be closed within categories (a)/(b)/(c) on Swift 5.9,
    halt: post a PR comment quoting the verification `diffoscope.txt`
    and stating "design Risk 2 surfaces — Package.swift
    `swift-tools-version` bump becomes load-bearing". The STATUS row
    transition is the human reviewer's call, not the agent's.
- **Verify**: copy verification `cdhash.before` + `cdhash.after` + the
  first 50 lines of `diffoscope.txt` (or "empty diff" note) into the PR
  body under a `## Verification diffoscope` heading. Mark the PR
  ready-for-review when both artifacts read identical CDHash.

### Step 5: PR body documents both probe runs

The PR body is the audit trail design § Risks ¶1 names. A future
regression investigator reads the baseline + verification artifacts here
to learn what flag set was load-bearing.

- **Action**: PR body sections in order: `## Summary`, `## Baseline
  diffoscope` (Step 2 output), `## Verification diffoscope` (Step 4
  output), `## SC1 verification` (one-line: "Verification probe
  identical CDHash on macos-14 arm64; CI `Verify cdhash stability` gate
  passes on the next `outpost@v*` tag push per SC2").
- **Verify**: PR body carries both diffoscope captures before the panel
  review starts.

## Libraries used

Libraries used: none. The probe workflow reuses the existing
`./.github/actions/bootstrap` composite and pins `actions/checkout` +
`actions/upload-artifact` to the SHAs already in repo workflows.

## Risks

- **Probe runner cost.** Each `macos-14` PR-update consumes ~10 min of
  paid runner time (Bun bootstrap + two full Outpost builds + diffoscope
  install + diffoscope run). The `paths` filter scopes the trigger so
  unrelated PRs do not pay; any in-category iteration in Step 4 incurs
  one additional run per push.
- **`pull_request` re-runs on every push.** The probe runs on each push
  to the PR branch — desirable for Steps 2 and 4 but means small
  documentation-only edits to the PR body trigger a probe (a no-op once
  the workflow is on main, but the cost still applies on this PR).
  Mitigation: keep doc-only changes in the PR body via `gh pr edit`
  rather than file edits where possible.
- **Probe persistence after merge.** The probe workflow lives on after
  the patch lands. Design Risk 3 names `publish-brew.yml`'s gate as the
  alarm and does not explicitly authorise an on-demand diagnostic, but
  removing the probe would discard the artifact pipeline this plan
  built to satisfy Decision 2. The probe stays as a regression
  accelerator until the first successful `outpost@v*` publish-brew
  run lands the brew cask past the seed placeholder (SC3); at that
  point a follow-up spec deletes the probe workflow. The cleanup
  trigger is concrete, not "if it proves unused".
- **Flag literal Xcode version drift.** `-file-prefix-map`,
  `-no-clang-module-breadcrumbs`, and `-no_uuid` are documented Swift
  5.9 + Xcode 15 flags but could be renamed in a future Xcode bump.
  `publish-brew.yml § Verify cdhash stability` is the alarm per design
  Risk 3; the probe is the diagnostic.
- **Codesign-internal byte drift after verification.** `codesign
  --force --sign -` with `--options runtime --entitlements ... --deep`
  is deterministic on identical inputs as of Xcode 15, but CMS-wrapper
  fields (signature timestamp, code requirement blob ordering) may
  surface in `diffoscope.txt`. The `CandidateCDHash` gate hashes the
  CodeDirectory only, not the CMS wrapper, so CMS-byte residue in the
  diff is not load-bearing for SC1/SC2. Note such residue in the PR
  body Step 5 if it appears.

## Execution

`staff-engineer`, single sequential pass through Steps 1–5. Steps 1, 3,
5 are local edits + pushes; Steps 2 and 4 each block on the
`pull_request` probe completing on macos-14 (~10 min per run). The path
is sequential because Step 3's flag set is validated by Step 4 which
depends on Step 2's locus confirmation.

**Note on `kata-implement` panel-before-push.** This plan's data
dependency (Decision 2) requires pushing Step 1 to the PR branch before
Step 3 exists locally — the `pull_request` trigger fires off the
pushed commit. That conflicts with `kata-implement`'s DO-CONFIRM "panel
review clean, then push" rule. Honour the rule by running the
implementation panel on the **full local diff after Step 4 lands** (the
PR sits in draft until then); Steps 1 and 3 push commits to the PR
branch but the PR is not marked ready-for-review until the
post-implementation panel is clean. The in-flight pushes are scratch
state, not the implementation under review.

— Staff Engineer 🛠️
