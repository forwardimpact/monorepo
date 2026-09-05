# Plan 2340-a Part 01: Callback verb and bootstrap input

The source that ships in the gear bundle and in `gemba-bootstrap`. Nothing here
pins a sibling, so this part lands first and alone.

## Step 1: `gemba-harness callback` gains the absent-trace branch

Make `--trace-file` optional. An absent or empty path posts the full terminal
payload with `verdict: failed` and exits zero.

Files modified: `libraries/libharness/src/commands/callback.js`.

Add the two summary literals above `runCallbackCommand`:

```js
/** Terminal summary when the run wrote no trace the verb can read. */
const NO_TRACE_SUMMARY = "The run produced no trace file. See the run log.";

/** Terminal summary when a trace exists but carries no orchestrator summary. */
const NO_SUMMARY_TEXT = "The run ended and produced no summary.";
```

Replace the required-flag guard and the unconditional read:

```js
  if (!callbackUrl)
    return { ok: false, code: 1, error: "--callback-url is required" };

  const content =
    traceFile && runtime.fsSync.existsSync(traceFile)
      ? runtime.fsSync.readFileSync(traceFile, "utf8")
      : null;
  const found =
    content === null
      ? { verdict: "failed", summary: NO_TRACE_SUMMARY, replies: [] }
      : (readTraceSummary(content) ?? {
          verdict: "failed",
          summary: NO_SUMMARY_TEXT,
          replies: [],
        });
  const { totalCostUsd } = sumTraceCost(
    content === null ? [] : content.split("\n"),
  );
```

The payload literal below stays as it is. `found.discussionId` is undefined on
the placeholder branch, so `discussionIdOverride` supplies `discussion_id`.

In the `runCallbackCommand` docstring, keep the wire-shape sample, the
`@param`, and the `@returns` tags. Replace only the sentence that names
`kata-dispatch.yml` as the caller with the optional-flag contract:

```js
 * URL. `--trace-file` is optional: an absent or empty path posts the same
 * shape with `verdict: failed`, so a run that produced no trace never
 * strands its caller.
```

Verify: the suite is red until step 2, because the existing
`requires --trace-file and --callback-url` case asserts the guard this step
removes. Step 2's verify covers both steps.

## Step 2: Cover the branch in the callback test

Files modified: `libraries/libharness/test/callback.test.js`.

Narrow the `requires --trace-file and --callback-url` case to the URL alone,
and rename it:

```js
  test("requires --callback-url", async () => {
    const noUrl = await callback({ "trace-file": TRACE_PATH });
    assert.strictEqual(noUrl.ok, false);
    assert.match(noUrl.error, /--callback-url is required/);
  });
```

Add one case that drives both no-trace inputs. It asserts the full terminal
shape, the zero exit, and the `discussion-id` fallback:

```js
  test("posts the full-shape placeholder when the trace is absent or empty", async () => {
    const server = await startServer(200);
    try {
      const missing = await callback({
        "trace-file": "/callback/missing.ndjson",
        "callback-url": `${server.url}/api/callback/none`,
        "correlation-id": "no-trace",
        "run-url": "https://github.com/foo/bar/actions/runs/9",
        "discussion-id": "GD_no_trace",
      });

      assert.strictEqual(missing.ok, true);
      assert.deepStrictEqual(server.getLastRequest().body, {
        correlation_id: "no-trace",
        kind: "terminal",
        verdict: "failed",
        summary: "The run produced no trace file. See the run log.",
        run_url: "https://github.com/foo/bar/actions/runs/9",
        cost_usd: 0,
        replies: [],
        last_acted_seq: -1,
        discussion_id: "GD_no_trace",
      });

      const empty = await callback({
        "trace-file": "",
        "callback-url": `${server.url}/api/callback/empty`,
        "correlation-id": "empty",
      });

      assert.strictEqual(empty.ok, true);
      assert.strictEqual(server.getLastRequest().body.verdict, "failed");
      assert.strictEqual(server.getLastRequest().body.cost_usd, 0);
    } finally {
      await server.close();
    }
  });
```

Both invocations use `callback()`'s default `createMockFs()`, which reports
every path absent. The `deepStrictEqual` pins the whole wire shape, which is
the contract design-a.md § Callback verb states. One case covers both inputs,
so the file stays near the 400-line target in
[`.claude/rules/test-file-shape.md`](../../.claude/rules/test-file-shape.md)
and needs no split.

Verify: `bun test libraries/libharness/test/callback.test.js` passes, and the
existing present-trace cases pass unchanged.

## Step 3: Align the CLI help and the action recipe

Files modified: `products/gemba/bin/gemba-harness.js`,
`products/gemba/actions/gemba-harness/README.md`.

| File               | Change                                                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gemba-harness.js` | The `callback` command's `"trace-file"` option description becomes `"Path to the NDJSON trace file (optional; an absent path posts the no-trace placeholder)"`.                                                    |
| `README.md`        | The `Deliver callback` recipe drops its `if: steps.assess.outputs.trace-file != ''` guard. Its `run:` line becomes a bare `gemba-harness callback`, because the recipe's audience installs the binary and never has a monorepo checkout ([products/CLAUDE.md § Audience](../../products/CLAUDE.md)). One sentence states that the verb handles an absent trace. |

Verify: `bunx gemba-harness callback --help` shows the new description, and
`rg -e "trace-file != ''" -e 'products/gemba/bin'
products/gemba/actions/gemba-harness/README.md` returns nothing.

## Step 4: Drop the caller name from the task composer

Files modified: `libraries/libharness/src/events/github.js`,
`libraries/libharness/test/events-github.test.js`.

The module docstring opens by naming `kata-dispatch.yml`'s `Compose task text`
step, which this change deletes. Rewrite the first sentence:

```js
/**
 * GitHub event → task-prompt composition. Each branch in the dispatch
 * function corresponds to one (event_name, action) the agent workflows react
 * to.
 * …
 */
```

In the test file, one describe or test name cites "the kata-dispatch shell
output". Rename it to name the behaviour instead of the retired step.

Verify: `rg kata-dispatch libraries/libharness/` returns nothing.

## Step 5: `gemba-bootstrap` treats an empty `bun-version` as its default

Files modified: `products/gemba/actions/gemba-bootstrap/action.yml`,
`products/gemba/actions/gemba-bootstrap/README.md`.

Change the input so it carries no version literal:

```yaml
  bun-version:
    description: >
      Bun version to install. Leave it empty to take the pinned default, so a
      wrapper action can forward its own empty input verbatim.
    required: false
    default: ""
```

Insert the resolve step as the first step under `runs.steps`, above
`oven-sh/setup-bun`:

```yaml
    - name: Resolve Bun version
      id: bun
      shell: bash
      env:
        BUN_VERSION: ${{ inputs.bun-version }}
      run: |
        set -euo pipefail
        # The pinned default lives here and nowhere else in this action. An
        # empty value arrives from a caller that omits the key and from a
        # wrapper that forwards its own empty input. setup-bun reads "" as
        # "latest", so the fallback cannot sit on the input default.
        echo "version=${BUN_VERSION:-1.3.11}" >> "$GITHUB_OUTPUT"
```

Point `setup-bun` at the step output:

```yaml
    - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2
      with:
        bun-version: ${{ steps.bun.outputs.version }}
        no-cache: false
```

In the README inputs table, the `bun-version` row default becomes `""` and its
description becomes `Bun version to install. Empty resolves to 1.3.11.`

Verify: `rg '1\.3\.11' products/gemba/actions/gemba-bootstrap/action.yml`
matches the resolve step and nothing else, so the action holds one home for the
literal, as design-a.md § Components requires. The README row documents that
value without carrying a second home.

## Step 6: Repository checks

Files modified: none.

Run `bun run check` and `bun run test`. Both pass. `bun run test` excludes
`products/gemba/actions/`, so the action YAML has no test surface, per
CONTRIBUTING.md § Testing.

Verify: both commands exit zero.
