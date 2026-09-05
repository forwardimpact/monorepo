# Plan 2340-a Part 01: Callback verb and bootstrap input

The source that ships in the gear bundle and in `gemba-bootstrap`. Nothing here
pins a sibling, so this part lands first and alone.

Steps 1 and 2 are one unit. Step 1 removes the guard that step 2's test edit
stops asserting, so the suite is red between them. Land both before you run the
suite.

## Step 1: `gemba-harness callback` gains the absent-trace branch

Files modified: `libraries/libharness/src/commands/callback.js`.

Add the two summary literals above `runCallbackCommand`:

```js
/** Terminal summary when the run wrote no trace the verb can read. */
const NO_TRACE_SUMMARY = "The run produced no trace file. See the run log.";

/** Terminal summary when a trace exists but carries no orchestrator summary. */
const NO_SUMMARY_TEXT = "The run ended and produced no summary.";
```

Replace the required-flag guard and the unconditional read. Keep the existing
`// Total spend across every participant…` comment above the `sumTraceCost`
call:

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
  // Total spend across every participant in the trace. The bridge surfaces
  // it alongside the verdict, so a dispatched run reports what it cost.
  const { totalCostUsd } = sumTraceCost(
    content === null ? [] : content.split("\n"),
  );
```

The payload literal below stays as it is. `found.discussionId` is undefined on
the placeholder branch, so `discussionIdOverride` supplies `discussion_id`.

In the `runCallbackCommand` docstring, keep the wire-shape sample, the
`@param`, and the `@returns` tags. Replace the one sentence that reads
"`kata-dispatch.yml` uses this command to deliver the lead's conclusion to the
bridge that dispatched the run." with:

```text
 * `--trace-file` is optional: an absent or empty path posts the same shape
 * with `verdict: failed`, so a run that produced no trace never strands its
 * caller.
```

Verify: covered by step 2.

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
[`.claude/rules/test-file-shape.md`](../../.claude/rules/test-file-shape.md).

Verify: `bun test libraries/libharness/test/callback.test.js` passes, steps 1
and 2 together, and the existing present-trace cases pass unchanged.

## Step 3: Align the CLI help and the action README

Files modified: `products/gemba/bin/gemba-harness.js`,
`products/gemba/actions/gemba-harness/README.md`.

| File               | Change                                                                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gemba-harness.js` | The `callback` command's `"trace-file"` option description becomes `"Path to the NDJSON trace file (optional; an absent path posts the no-trace placeholder)"`.                                                                              |
| `README.md`        | The `Deliver callback` recipe drops its `if: steps.assess.outputs.trace-file != ''` guard, declares `CALLBACK_URL` and `CORRELATION_ID` in its `env:` block beside `TRACE_FILE`, and calls a bare `gemba-harness callback`. One sentence states that the verb handles an absent trace. |
| `README.md`        | The task-source table and the line "Exactly one of `task-text` or `task-file` is required" name all three sources, `task-event` included. The action has declared it since before this change.                                                |

The recipe's `run:` line drops `node products/gemba/bin/…` because its audience
installs the binary and never has a monorepo checkout
([products/CLAUDE.md § Audience](../../products/CLAUDE.md)).

Verify: `bunx gemba-harness callback --help` shows the new description, and
`rg -e "trace-file != ''" -e 'products/gemba/bin'
products/gemba/actions/gemba-harness/README.md` returns nothing.

## Step 4: Drop the retired step name from the task composer

Files modified: `libraries/libharness/src/events/github.js`,
`libraries/libharness/test/events-github.test.js`.

The module docstring opens by naming `kata-dispatch.yml`'s `Compose task text`
step, which no longer exists. Rewrite the first sentence:

```js
/**
 * GitHub event → task-prompt composition. Each branch in the dispatch
 * function corresponds to one (event_name, action) the agent workflows react
 * to.
 * …
 */
```

In the test file, one name cites "the kata-dispatch shell output". Rename it to
name the behaviour instead of the retired step.

Verify: `rg kata-dispatch libraries/libharness/` returns nothing.

## Step 5: `gemba-bootstrap` treats an empty `bun-version` as its default

Files modified: `products/gemba/actions/gemba-bootstrap/action.yml`,
`products/gemba/actions/gemba-bootstrap/README.md`.

Change the input so it carries no version literal:

```yaml
  bun-version:
    description: >
      Bun version to install. Leave it empty to take the action's pinned
      default, so a wrapper action can forward its own empty input verbatim.
    required: false
    default: ""
```

Resolve the default on the existing `setup-bun` step. A composite action cannot
omit a `with:` key, and `setup-bun` reads `""` as "latest", so the fallback sits
in the expression:

```yaml
    - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2
      with:
        # The pinned default lives here and nowhere else. An empty value
        # arrives from a caller that omits the key and from a wrapper that
        # forwards its own empty input.
        bun-version: ${{ inputs.bun-version != '' && inputs.bun-version || '1.3.11' }}
        no-cache: false
```

In the README inputs table, the `bun-version` row default becomes `""` and its
description becomes `Bun version to install. Empty takes the action's pinned
default.` The row states no version number, so the literal keeps one home.

Verify: `rg '1\.3\.11' products/gemba/actions/gemba-bootstrap/` matches exactly
one line, the `setup-bun` expression, which is the one home design-a.md
§ Components requires.

## Step 6: Repository checks

Files modified: none.

Run `bun run check` and `bun run test`. Both pass. `bun run test` excludes
`products/gemba/actions/`, so the action YAML has no test surface, per
CONTRIBUTING.md § Testing.

Verify: both commands exit zero.
