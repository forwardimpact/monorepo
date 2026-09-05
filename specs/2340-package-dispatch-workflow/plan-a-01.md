# Plan 2340-a Part 01: Callback verb and bootstrap input

Tier-1 and tier-2 source for the release chain in
[plan-a.md](plan-a.md#execution). Nothing here pins a sibling, so this part
lands first and alone.

## Step 1: `gemba-harness callback` gains the absent-trace branch

Make `--trace-file` optional. An absent or empty path posts the full terminal
payload with `verdict: failed` and exits zero.

Files modified: `libraries/libharness/src/commands/callback.js`.

Add the two summary literals above `runCallbackCommand`:

```js
/** Terminal summary when the run wrote no trace the verb can read. */
const NO_TRACE_SUMMARY =
  "The run produced no trace file. See the run log.";

/** Terminal summary when a trace exists but carries no orchestrator summary. */
const NO_SUMMARY_SUMMARY = "The run ended and produced no summary.";
```

Replace the required-flag guard and the unconditional read:

```js
  if (!callbackUrl)
    return { ok: false, code: 1, error: "--callback-url is required" };

  // An absent or empty --trace-file means the run died before it wrote one.
  // The caller is still owed a terminal payload, so build the placeholder from
  // the same shape below instead of failing. One home owns the wire shape.
  const content =
    traceFile && runtime.fsSync.existsSync(traceFile)
      ? runtime.fsSync.readFileSync(traceFile, "utf8")
      : null;
  const found =
    content === null
      ? { verdict: "failed", summary: NO_TRACE_SUMMARY, replies: [] }
      : (readTraceSummary(content) ?? {
          verdict: "failed",
          summary: NO_SUMMARY_SUMMARY,
          replies: [],
        });
  const { totalCostUsd } = sumTraceCost(
    content === null ? [] : content.split("\n"),
  );
```

The payload literal below stays as it is. `found.discussionId` is undefined on
the placeholder branch, so `discussionIdOverride` supplies `discussion_id`.

Rewrite the `runCallbackCommand` docstring. Drop the sentence that names
`kata-dispatch.yml` as the caller. State the absent-trace contract instead:

```js
/**
 * Callback command — read an NDJSON trace and extract the terminal
 * orchestrator summary. POST a canonical callback body to the configured
 * URL. `--trace-file` is optional: an absent or empty path posts the same
 * shape with `verdict: failed`, so a run that produced no trace never
 * strands its caller.
 * …
 */
```

Verify: `bun test libraries/libharness/test/callback.test.js` passes step 2's
new cases.

## Step 2: Cover the branch in the callback test

Files modified: `libraries/libharness/test/callback.test.js`.

Replace the `requires --trace-file and --callback-url` case with a
`--callback-url` case only:

```js
  test("requires --callback-url", async () => {
    const noUrl = await callback({ "trace-file": "/dev/null" });
    assert.strictEqual(noUrl.ok, false);
    assert.match(noUrl.error, /--callback-url is required/);
  });
```

Add one case for the absent path. It asserts the full terminal shape, the zero
exit, and the `discussion-id` fallback:

```js
  test("posts the full-shape placeholder when the trace file is absent", async () => {
    const server = await startServer(200);
    try {
      const result = await callback({
        "trace-file": "/callback/missing.ndjson",
        "callback-url": `${server.url}/api/callback/none`,
        "correlation-id": "no-trace",
        "run-url": "https://github.com/foo/bar/actions/runs/9",
        "discussion-id": "GD_no_trace",
      });

      assert.strictEqual(result.ok, true);
      const req = server.getLastRequest();
      assert.deepStrictEqual(req.body, {
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
    } finally {
      await server.close();
    }
  });
```

Add one case for the empty option. It asserts the same branch:

```js
  test("treats an empty --trace-file option as absent", async () => {
    const server = await startServer(200);
    try {
      const result = await callback({
        "trace-file": "",
        "callback-url": `${server.url}/api/callback/empty`,
        "correlation-id": "empty",
      });

      assert.strictEqual(result.ok, true);
      assert.strictEqual(server.getLastRequest().body.verdict, "failed");
      assert.strictEqual(server.getLastRequest().body.cost_usd, 0);
    } finally {
      await server.close();
    }
  });
```

Both cases call `callback()` with its default `createMockFs()`, which reports
every path absent.

Verify: `bun test libraries/libharness/test/callback.test.js` passes, and the
existing present-trace cases still pass unchanged.

## Step 3: Align the CLI help and the action recipe

Files modified: `products/gemba/bin/gemba-harness.js`,
`products/gemba/actions/gemba-harness/README.md`.

| File               | Change                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gemba-harness.js` | The `callback` command's `"trace-file"` option description becomes `"Path to the NDJSON trace file (optional; an absent path posts the no-trace placeholder)"`.       |
| `README.md`        | The `Deliver callback` recipe drops its `if: steps.assess.outputs.trace-file != ''` guard. The recipe's prose gains one sentence: the verb handles an absent trace.  |

Verify: `bunx gemba-harness callback --help` shows the new description, and
`rg "trace-file != ''" products/gemba/actions/gemba-harness/README.md` returns
nothing.

## Step 4: Drop the caller name from the task composer docstring

Files modified: `libraries/libharness/src/events/github.js`.

The module docstring opens by naming `kata-dispatch.yml`'s `Compose task text`
step. That step no longer exists. Rewrite the first sentence to describe the
module without a caller:

```js
/**
 * GitHub event → task-prompt composition. Each branch in the dispatch
 * function corresponds to one (event_name, action) the agent workflows react
 * to.
 * …
 */
```

Verify: `rg "kata-dispatch" libraries/libharness/src/` returns nothing.

## Step 5: `gemba-bootstrap` treats an empty `bun-version` as its default

A composite action cannot omit a `with:` key, so a wrapper forwards its own
empty input verbatim. The pinned literal moves out of the input default and
into one resolve step, so a forwarded empty value still selects it.

Files modified: `products/gemba/actions/gemba-bootstrap/action.yml`,
`products/gemba/actions/gemba-bootstrap/README.md`.

Change the input:

```yaml
  bun-version:
    description: >
      Bun version to install. Leave it empty to select the pinned default
      (1.3.11), so a wrapper action can forward its own empty input verbatim.
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
        # The pinned default lives here and nowhere else. An empty input
        # reaches this step from a wrapper that forwards its own empty value,
        # and from a caller that omits the key. Both select the same version.
        # setup-bun reads "" as "latest", so the fallback cannot move to the
        # input default.
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
description becomes `Bun version to install. Empty selects 1.3.11.`

Verify: `rg '1\.3\.11' products/gemba/actions/gemba-bootstrap/action.yml`
matches the resolve step only, and the input carries `default: ""`.

## Step 6: Repository checks

Files modified: none.

Run `bun run check` and `bun run test`. Both pass. `bun run test` excludes
`products/gemba/actions/`, so the action YAML has no test surface, by
CONTRIBUTING.md § Testing.

Verify: both commands exit zero.
