# Plan 1960 — Wiki post-push integrity instrument

Implements [design-a.md](./design-a.md) for [spec 1960](./spec.md).

## Approach

Build two pure modules (`lane-files.js`, `integrity.js`) plus three new
read-only `GitClient` verbs, then wire tier 1 into `WikiSync.commitAndPush`
(post-push re-fetch + predicate over the just-pushed delta) and tier 2 into
`runPullCommand` (predicate over the previous-session window on the
just-rebased tree). The presence predicate and window resolver are pure and
fully unit-tested; the two seams get real-git integration tests. Steps are
ordered so each pure unit lands and verifies before the seam that consumes it.
Two HOW-level disambiguations the design left open: (1) tier 2 runs at boot
before the current session has pushed, so the **tip run** of lane commits is
the previous session (not a prior run); (2) the design's "degenerate when the
window is unresolvable" is refined to: the gap structure of any non-empty
history is always resolvable to a tip run, so the only genuine unresolvable
cases are *content*-level (missing author identity, or a commit git cannot
diff), which the sweep raises as degenerate detections.

Libraries used: libutil (`GitClient`, `isoTimestamp`, runtime `clock`/
`subprocess`), libwiki (`constants` name REs, `util/wiki-dir`, `util/clock`),
libmock (`createMockGitClient`).

## Step 1 — GitClient read-only verbs

Add three verbs the predicate needs; all read-only, all over `#runRaw`. They
refine the design's `log`/`showDiff`/`show`: `diffRange` is a two-tree range
diff (so a merge HEAD is diffed correctly), `logByAuthor` filters by author and
`--no-merges` (a `mergeOursStrategy` merge commit is excluded, but its content
additions remain covered by the underlying non-merge lane commits in history).

Files: modified `libraries/libutil/src/git-client.js`,
`libraries/libmock/src/mock/git-client.js`,
`libraries/libutil/test/git-client.test.js`.

```js
/** List commits touching `ref` by `author`, newest first, as {sha, when} (when = commit epoch seconds, %ct). */
async logByAuthor(author, { cwd, ref = "HEAD" } = {}) {
  const r = await this.#runRaw(
    ["log", ref, `--author=${author}`, "--no-merges", "--format=%H %ct"],
    { cwd, allowFailure: true },
  );
  if (r.exitCode !== 0) return [];
  return r.stdout.trim().split("\n").filter(Boolean).map((l) => {
    const [sha, ct] = l.split(" ");
    return { sha, when: Number.parseInt(ct, 10) };
  });
}

/** Unified-diff text (`--unified=0`) of two-tree `range` (e.g. "A B"), or null on git failure. A two-tree range diff (never a merge `git show`) diffs merge commits correctly. Empty string is a legitimate empty diff; null is an error — the caller distinguishes them. */
async diffRange(range, { cwd } = {}) {
  const r = await this.#runRaw(
    ["diff", "--no-color", "--unified=0", ...range.split(" ")],
    { cwd, allowFailure: true },
  );
  return r.exitCode === 0 ? r.stdout : null;
}

/** Contents of `path` at `ref`, or null when absent at that ref. */
async showFile(ref, filePath, { cwd } = {}) {
  const r = await this.#runRaw(["show", `${ref}:${filePath}`], {
    cwd, allowFailure: true,
  });
  return r.exitCode === 0 ? r.stdout : null;
}
```

Mock changes: add `logByAuthor`, `diffRange`, `showFile` to `GIT_METHODS`, and
extend the mock's default-return conditional (today only `status`/`configGet`/
`remoteGetUrl` get string defaults) so `logByAuthor`→`[]`, `diffRange`→`""`,
`showFile`→`null` when no `responses[method]` is configured.

Verification: `bun test libraries/libutil/` green; unit tests assert
`logByAuthor` parses `%H %ct` rows and returns `[]` on non-zero; `diffRange`
returns `+`-line text whose `+++ b/<path>` headers attribute lines to files and
returns `null` (not `""`) on git failure; `showFile` returns null for an absent
path.

## Step 2 — Lane-file matcher (pure)

File: created `libraries/libwiki/src/lane-files.js`.

A pure predicate `isLaneFile(relPath, agent)` returning true for the lane's own
files: `${agent}.md`, `${agent}-YYYY-Www.md`, `${agent}-YYYY-Www-partN.md`
(reuse `WEEKLY_LOG_NAME_RE` / `WEEKLY_LOG_PART_NAME_RE` from `constants.js`,
matching the captured agent token), and `metrics/{skill}/{year}.csv`.

```js
export function isLaneFile(relPath, agent) {
  const base = path.basename(relPath);
  if (base === `${agent}.md`) return true;
  for (const re of [WEEKLY_LOG_NAME_RE, WEEKLY_LOG_PART_NAME_RE]) {
    const m = base.match(re);
    if (m && m[1] === agent) return true; // m[1] is the captured agent token
  }
  return /^metrics\/[^/]+\/\d{4}\.csv$/.test(relPath.replace(/\\/g, "/"));
}
export function enumerateLaneFiles(wikiRoot, agent, fsSync) {
  // readdirSync(wikiRoot) filtered by isLaneFile (summary + weekly),
  // plus recurse metrics/*/ for *.csv; return {relPath, abs} list.
}
```

`isLaneFile` matches any `metrics/*/<year>.csv` by path; lane ownership of a
metrics CSV is enforced by Step 6's author filter at the commit level, not by
this matcher (design risk note).

Verification: unit test `lane-files.test.js` — summary, weekly main, part file,
foreign-agent weekly (false), metrics CSV (true), unrelated file (false).

## Step 3 — Presence predicate (pure)

File: created `libraries/libwiki/src/integrity.js` (parser + predicate halves).

```js
/** Parse `--unified=0` diff text into per-file change records, tracking `+++ b/<path>`. */
export function parseDiff(diffText) {
  // returns Array<{home: string, added: string[], removed: string[]}>
  // current home = last `+++ b/<path>` (or `/dev/null`); `+`/`-` lines (not `+++`/`---`) push to added/removed.
}

/**
 * @param {Array<{home: string, added: string[], removed: string[]}>} changes -
 *   window changes oldest→newest; `added`/`removed` are the content lines each
 *   change introduced/removed at its home file.
 * @param {string} tipText - concatenated text of the tip's in-scope files.
 * @param {(line:string)=>string} norm - line normalizer (trim trailing ws; drop blanks).
 * @returns {Array<{contentId: string, pushHome: string}>} absent assertions.
 */
export function findAbsent(changes, tipText, norm) { /* see composition below */ }
```

Composition (oldest→newest over all `changes`): keep an ordered `Map` keyed by
`norm(line)`; each `added` line sets `{contentId, pushHome}` if the key is
unset; each `removed` line **deletes** the key (a later own-lane deletion
cancels an earlier own push's assertion — criterion 5). Presence: build a `Set`
of `norm(line)` over `tipText`; a surviving assertion is present iff its key is
in that set (content-keyed, survives rotation/part-split — criterion 4). Return
the assertions whose key is absent.

Verification: unit tests — present line (none absent, crit 1); erased line
(absent named, crit 2); rotated line in different file (present, crit 4);
own-deleted line (`removed` cancels `added`, never absent, crit 5); empty
changes (empty result); `parseDiff` attributes `+`/`-` lines to the right home
across multiple `+++ b/` headers and ignores `+++`/`---` markers.

## Step 4 — Window resolver (pure)

File: `libraries/libwiki/src/integrity.js` (resolver half) + `constants.js`
(`export const SESSION_GAP_MS = 30 * 60 * 1000;` — the design's `SESSION_GAP`,
in ms).

```js
/**
 * Previous-session commit set by idle-gap. `vacuous` only for empty history;
 * otherwise the tip run is the previous session. (The `degenerate` detection
 * for unresolvable content is raised in the sweep, Step 6 — not here.)
 * @returns {{kind:"vacuous"}|{kind:"window", commits:Array}}
 */
export function previousSessionWindow(commits /* {sha,when} newest-first */, gapMs) { /* ... */ }
```

Concrete change — group `commits` newest→oldest into runs (a gap > `gapMs`
starts a new run) and return:

- empty `commits` ⇒ `{kind:"vacuous"}` (criterion 7 first clause; spec 103–107).
- non-empty ⇒ `{kind:"window", commits: <tip run>}` — the most recent
  contiguous run (the just-ended previous session: claim-time, interim, and
  session-close pushes alike; criteria 3, 6).

(Boot-timing and the degenerate-vs-vacuous split are covered in § Approach.)

Verification: unit tests — single run of N commits (`window` = all N); two runs
split by >30m gap (`window` = the newer/tip run); empty (`vacuous`); a single
lone commit (`window` = that one commit).

## Step 5 — Detection record + renderer

File: `libraries/libwiki/src/integrity.js` (record half).

```js
export function makeDetection({ tier, contentId, pushHome, now, exposureSeconds }) {
  return { tier, contentId, pushHome, detectedAt: isoTimestamp(now),
    ...(exposureSeconds != null ? { exposure: { seconds: exposureSeconds, basis: "commit-timestamp" } } : {}) };
}
export function renderDetections(detections) { /* one line each: tier, pushHome, contentId, detectedAt, exposure(labeled) */ }
```

`detectedAt` uses `isoTimestamp(runtime.clock.now())` (criterion 8, binding
wall-clock); exposure carries the `commit-timestamp` basis label when derived.

Verification: unit test — record carries wall-clock `detectedAt`; exposure line
labels `basis: commit-timestamp`; renderer output names `pushHome` + `contentId`
(criterion 10); `renderDetections([])` returns the empty string (criterion 12,
clean-path silence).

## Step 6 — Tier-2 sweep in runPullCommand

Files: modified `libraries/libwiki/src/integrity.js` (orchestrator
`sweepTier2`), `libraries/libwiki/src/commands/sync.js`,
`libraries/libwiki/src/cli-definition.js` (add `...agentOpt`/`...todayOpt` to
the `pull` command so the sweep knows its lane). The sweep runs git and reads
files at the **wiki clone dir** (`resolveWikiRoot(runtime, options)`) — the
same path `WikiSync` uses as `#wikiDir`; pass it as `wikiDir` so the git `cwd`
and the fs read-root are one directory (the just-rebased tree).

`sweepTier2({ runtime, gitClient, wikiDir, agent, now }) -> Detection[]`:

1. `email = await gitClient.configGet("user.email", { cwd: wikiDir })`. An empty
   email means the lane identity is unresolvable → return one degenerate
   `makeDetection({tier:2, contentId:"<unresolvable: no author identity>",
   pushHome:"-", now})` (criterion 7: never a silent vacuous pass when the
   sweep cannot resolve). (`inheritIdentity` normally sets this at init.)
2. `commits = await gitClient.logByAuthor(email, { cwd: wikiDir, ref: "HEAD" })`
   — `HEAD` is the rebased tip after `WikiSync.pull`.
3. `w = previousSessionWindow(commits, SESSION_GAP_MS)`: `w.kind === "vacuous"`
   ⇒ return `[]`; else `w.kind === "window"` with the tip-run commits.
4. For each window commit (oldest→newest), diff against its parent:
   `diff = await diffRange(sha + "~1 " + sha, { cwd: wikiDir })`.
   `diff === null` (git failure / unresolvable content) ⇒ emit a degenerate
   detection (criterion 7 content clause) and continue. An empty string is a
   legitimate no-addition commit — skip silently. Otherwise `parseDiff(diff)`,
   keeping records whose `home` satisfies `isLaneFile(home, agent)`. (A root
   commit has no `~1` parent and returns `null`; window commits are never the
   repo root, so this does not arise in practice, but the `null` path covers it
   as degenerate.)
5. `tipText = enumerateLaneFiles(wikiDir, agent, runtime.fsSync)` files read and
   concatenated.
6. `findAbsent(laneChanges, tipText, norm)` → one `makeDetection({tier:2,
   contentId, pushHome, now, exposureSeconds: now/1000 - commit.when})` per
   absent line (`now` ms, `commit.when` epoch seconds).

`runPullCommand`: after `wikiSync.pull()` succeeds, resolve `agent =
options.agent`, `wikiDir = resolveWikiRoot(runtime, options)`, `now =
runtime.clock.now()`; call `sweepTier2`; `renderDetections(...)` to stdout.
Wrap the sweep so any git/fs error degrades to no detections — it never throws
into the flow, never changes the exit code (criteria 9, 12, 13).

Verification: integration test (real git) — clone, lane commits across two
sessions (back-date the older via the `git` helper's new env arg, below), erase
a previous-session (tip-run) line at origin, pull → detection named (crit 3);
clean previous session → no detection; rotation of a previous-session line into
a part file → no detection (crit 4); empty history → vacuous, empty author →
degenerate detection (crit 7 both clauses); a previous-session commit that
added no lines → silent (no spurious degenerate); a unit test of the
content-unresolvable path configures the mock with `responses.diffRange = null`
and asserts the degenerate detection.

## Step 7 — Tier-1 probe in commitAndPush

Files: modified `libraries/libwiki/src/wiki-sync.js`,
`libraries/libwiki/src/commands/sync.js`.

In `commitAndPush`, after the existing pre-push fetch/rebase/merge has produced
the final local HEAD but **before** the post-push fetch advances
`origin/master`, capture the pushed delta; then probe after the push:

1. Right before `client.push(...)` (the local fetch+rebase has run, so HEAD is
   final and `origin/master` is the pre-push base), compute the pushed delta as
   the two-tree range diff `diffRange("origin/master HEAD", {cwd: #wikiDir})` →
   `parseDiff` → `{home, added, removed}` records, the **full** delta (lane
   files **and** shared surfaces — design Tier-1 scope).
2. After the push, a **new** post-push `this.fetch()` (the design's new
   behaviour on this seam) advances `origin/master` to the current tip.
3. For each delta `home`, read the tip blob `showFile("origin/master", home,
   {cwd: #wikiDir})` (null when absent); concat present contents into `tipText`.
4. `findAbsent(deltaChanges, tipText, norm)` → `makeDetection({tier:1, …, now:
   this.#runtime.clock.now()})` per absent line (criterion 8 wall-clock stamp).
5. Return `{ pushed, reason, detections }`. The probe is wrapped in try/catch so
   any git error degrades to `detections: []` — it never throws into the flow
   and never writes (criteria 9, 12, 13).

`runPushCommand` renders `result.detections` after the existing push message;
exit code unchanged. (Tier 1 verifies the full delta and stamps via
`runtime.clock`, so the push command needs no `--agent` option.)

Verification: integration test — push then a sibling clone erases the pushed
line at origin before the probe's fetch → tier-1 detection named (crit 2);
clean push → no detection, no extra output beyond the verification (crit 1, 12);
a rebase-conflict push that lands via `mergeOursStrategy` still captures and
verifies its delta (merge-HEAD coverage); probe git failure → empty detections,
push still reports success (crit 13).

## Step 8 — Cross-tier and identity assertions

Files: integration tests in `libraries/libwiki/test/` (new
`integrity.integration.test.js`); modified `libraries/libwiki/test/helpers.js`
(extend the `git(dir, ...args)` helper to accept a trailing `{env}` so the
two-session fixtures can set `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` on the older
commits — the only test-infra change, additive and back-compatible).

- Identical semantics across lanes (criterion 11): parametrize **both** the
  tier-1 and tier-2 tests over two agent ids.
- Recursive victim (criterion 6): a detection record is itself a lane push;
  erase it, next pull catches it through the ordinary window — no special case.
- No-write invariant (criterion 9): assert `git status` clean and origin tip
  unchanged after a detection in each tier.

Verification: `bun test libraries/libwiki/` and `bun test libraries/libutil/`
all green; `bun run format`; `bunx coaligned instructions`.

## Risks

- **Author identity vs filename lane token.** `logByAuthor` keys on git author
  email (inherited parent identity); `isLaneFile` keys on the filename agent
  token. Step 6 resolves the author email from wiki config (`configGet
  user.email`), not from `agent`. Fixtures must set `user.email` and author lane
  files whose filenames carry `agent` — keep the two consistent, or the window
  enumerates no commits and the sweep silently passes vacuously.
- **`--unified=0` line attribution.** `diffRange` yields `+`/`-` lines without
  per-file framing; `parseDiff` must track the current `+++ b/<path>` to
  attribute each line, and skip the `+++`/`---` headers themselves. Step 3's
  verification exercises a multi-file diff to pin this.

## Execution

Single engineering agent, sequential: Steps 1→5 are pure/independent and land
first; Steps 6–7 depend on 1–5; Step 8 depends on 6–7. No parallel split.

— Staff Engineer 🛠️
