import { test } from "node:test";
import assert from "node:assert/strict";

import { runAssessCommand } from "../src/commands/assess.js";
import { runEngageCommand } from "../src/commands/engage.js";
import {
  ago,
  commits,
  context,
  created,
  stubRequest,
  testRuntime,
} from "./helpers.js";

const ENV = {
  GH_TOKEN: "t",
  GITHUB_REPOSITORY: "o/r",
  GITHUB_STEP_SUMMARY: "/gh/summary.md",
  GITHUB_OUTPUT: "/gh/output.txt",
};

const QUIET = {
  "/repos/o/r/commits": commits(2),
  "/repos/o/r/pulls": created(1),
  "/repos/o/r/issues/comments": created(3),
  "/repos/o/r/issues": created(1),
};

const ASSESS = {
  threshold: "32",
  "window-hours": "2",
  "default-branch": "main",
};

test("assess writes the outputs and the summary, and exits 0 when quiet", async () => {
  const runtime = testRuntime(ENV);
  const result = await runAssessCommand(
    context(ASSESS, runtime, stubRequest(QUIET)),
  );
  assert.deepEqual(result, { ok: true });
  assert.equal(
    runtime.fs.data.get("/gh/output.txt"),
    "verdict=quiet\nreason=\n",
  );
  const summary = runtime.fs.data.get("/gh/summary.md");
  assert.match(summary, /Verdict: \*\*quiet\*\*/);
  // Every row carries its threshold, including on a quiet run.
  assert.equal(summary.match(/\| 32 \|/g).length, 4);
});

test("assess closes the reason with the run time, not the cutoff", async () => {
  const runtime = testRuntime(ENV);
  await runAssessCommand(
    context(
      ASSESS,
      runtime,
      stubRequest({ ...QUIET, "/repos/o/r/issues": created(40) }),
    ),
  );
  const output = runtime.fs.data.get("/gh/output.txt");
  assert.match(output, /^verdict=engage$/m);
  assert.match(
    output,
    /^reason=watchdog\|issues=40\/32\|2026-09-02T16:49:00.000Z$/m,
  );
  // The cutoff sits one window earlier and must not close the line.
  assert.doesNotMatch(output, /14:49/);
});

test("two appends to one env file accumulate", async () => {
  const runtime = testRuntime(ENV);
  const request = stubRequest(QUIET);
  await runAssessCommand(context(ASSESS, runtime, request));
  await runAssessCommand(context(ASSESS, runtime, request));
  const output = runtime.fs.data.get("/gh/output.txt");
  assert.equal(output.match(/verdict=quiet/g).length, 2);
  assert.equal(runtime.fs.appendFile.mock.callCount(), 4);
});

test("assess renders JSON on --format json", async () => {
  const runtime = testRuntime(ENV);
  await runAssessCommand(
    context({ ...ASSESS, format: "json" }, runtime, stubRequest(QUIET)),
  );
  const parsed = JSON.parse(runtime.proc.stdout.chunks.join(""));
  assert.equal(parsed.engage, false);
  assert.equal(parsed.counts.length, 4);
  assert.equal(parsed.counts[0].threshold, 32);
});

test("assess refuses a missing or non-positive threshold", async () => {
  const runtime = testRuntime(ENV);
  const absent = await runAssessCommand(
    context({ "window-hours": "2", "default-branch": "main" }, runtime),
  );
  assert.equal(absent.ok, false);
  assert.match(absent.error, /--threshold/);
  const zero = await runAssessCommand(
    context(
      { threshold: "0", "window-hours": "2", "default-branch": "main" },
      runtime,
    ),
  );
  assert.match(zero.error, /--threshold/);
});

test("assess refuses a missing window, branch, or token", async () => {
  const runtime = testRuntime(ENV);
  const noWindow = await runAssessCommand(
    context({ threshold: "32", "default-branch": "main" }, runtime),
  );
  assert.match(noWindow.error, /--window-hours/);

  const noBranch = await runAssessCommand(
    context({ threshold: "32", "window-hours": "2" }, runtime),
  );
  assert.match(noBranch.error, /--default-branch/);

  const bare = testRuntime({ GITHUB_REPOSITORY: "o/r" });
  const noToken = await runAssessCommand(context(ASSESS, bare));
  assert.match(noToken.error, /GH_TOKEN/);
});

const ENGAGE = {
  variable: "MY_KILLSWITCH",
  "window-hours": "2",
  reason: "watchdog|issues=40/32|2026-09-02T16:49:00.000Z",
};

/** Route the two latch reads and record every write. */
function latchStub({ repository, organization = [], writes, failWrite }) {
  const request = async (path, init) => {
    if (path.startsWith("/repos/o/r/actions/organization-variables")) {
      return { body: { variables: organization }, headers: new Headers() };
    }
    if (init?.method === "PATCH" || init?.method === "POST") {
      if (failWrite) {
        const error = new Error("GitHub 403");
        error.status = 403;
        throw error;
      }
      writes.push(JSON.parse(init.body));
      return { body: null, headers: new Headers() };
    }
    if (repository === null) {
      const error = new Error("GitHub 404");
      error.status = 404;
      throw error;
    }
    return { body: repository, headers: new Headers() };
  };
  return request;
}

test("engage refuses an empty reason and touches no variable", async () => {
  const runtime = testRuntime(ENV);
  let called = false;
  const result = await runEngageCommand(
    context({ ...ENGAGE, reason: "   " }, runtime, async () => {
      called = true;
      return { body: null, headers: new Headers() };
    }),
  );
  assert.deepEqual(result, { ok: false, code: 1 });
  assert.equal(called, false);
});

test("engage refuses a missing variable", async () => {
  const runtime = testRuntime(ENV);
  const result = await runEngageCommand(
    context({ ...ENGAGE, variable: "" }, runtime),
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /--variable/);
});

test("engage writes the reason and exits 1", async () => {
  const writes = [];
  const runtime = testRuntime(ENV);
  const result = await runEngageCommand(
    context(
      ENGAGE,
      runtime,
      latchStub({
        repository: { name: "MY_KILLSWITCH", value: "", updated_at: ago(600) },
        writes,
      }),
    ),
  );
  assert.deepEqual(result, { ok: false, code: 1 });
  assert.deepEqual(writes, [{ name: "MY_KILLSWITCH", value: ENGAGE.reason }]);
  assert.match(
    runtime.fs.data.get("/gh/summary.md"),
    /Decision: \*\*engage\*\*/,
  );
});

test("engage skips and exits 0 when the latch already holds a truthy value", async () => {
  const writes = [];
  const runtime = testRuntime(ENV);
  const result = await runEngageCommand(
    context(
      ENGAGE,
      runtime,
      latchStub({
        repository: { name: "MY_KILLSWITCH", value: "1", updated_at: ago(5) },
        writes,
      }),
    ),
  );
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(writes, []);
});

test("engage skips inside the resume window", async () => {
  const writes = [];
  const runtime = testRuntime(ENV);
  const result = await runEngageCommand(
    context(
      ENGAGE,
      runtime,
      latchStub({
        repository: {
          name: "MY_KILLSWITCH",
          value: "false",
          updated_at: ago(30),
        },
        writes,
      }),
    ),
  );
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(writes, []);
});

test("a dry run reads both scopes and writes nothing", async () => {
  const writes = [];
  const runtime = testRuntime(ENV);
  const result = await runEngageCommand(
    context(
      { ...ENGAGE, "dry-run": true },
      runtime,
      latchStub({
        repository: { name: "MY_KILLSWITCH", value: "", updated_at: ago(600) },
        writes,
      }),
    ),
  );
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(writes, []);
  assert.match(runtime.fs.data.get("/gh/summary.md"), /Dry run/);
});

test("a failed latch read exits 1 with no write", async () => {
  const runtime = testRuntime(ENV);
  const result = await runEngageCommand(
    context(ENGAGE, runtime, async () => {
      const error = new Error("GitHub 403");
      error.status = 403;
      throw error;
    }),
  );
  assert.deepEqual(result, { ok: false, code: 1 });
});

test("a failed latch write exits 1", async () => {
  const runtime = testRuntime(ENV);
  const result = await runEngageCommand(
    context(
      ENGAGE,
      runtime,
      latchStub({
        repository: { name: "MY_KILLSWITCH", value: "", updated_at: ago(600) },
        writes: [],
        failWrite: true,
      }),
    ),
  );
  assert.deepEqual(result, { ok: false, code: 1 });
});

test("engage works on a repository with no organization scope", async () => {
  const writes = [];
  const runtime = testRuntime(ENV);
  const result = await runEngageCommand(
    context(ENGAGE, runtime, async (path, init) => {
      if (path.startsWith("/repos/o/r/actions/organization-variables")) {
        const error = new Error("GitHub 404");
        error.status = 404;
        throw error;
      }
      if (init?.method === "PATCH") {
        writes.push(JSON.parse(init.body));
        return { body: null, headers: new Headers() };
      }
      return {
        body: { name: "MY_KILLSWITCH", value: "", updated_at: ago(600) },
        headers: new Headers(),
      };
    }),
  );
  assert.deepEqual(result, { ok: false, code: 1 });
  assert.equal(writes.length, 1);
});

test("every write path carries a non-empty reason", async () => {
  const writes = [];
  for (const reason of ["watchdog|a=1/1|t", "manual stop"]) {
    const runtime = testRuntime(ENV);
    await runEngageCommand(
      context(
        { ...ENGAGE, reason },
        runtime,
        latchStub({
          repository: {
            name: "MY_KILLSWITCH",
            value: "",
            updated_at: ago(600),
          },
          writes,
        }),
      ),
    );
  }
  assert.equal(writes.length, 2);
  for (const write of writes) {
    assert.notEqual(write.value.trim(), "");
    assert.equal(["", "0", "false", "no", "off"].includes(write.value), false);
  }
});

test("a repo that is not an owner/repo slug does not resolve", async () => {
  const runtime = testRuntime(ENV);
  for (const repo of [
    "o/r/../../evil",
    "o",
    "o/r?x=1",
    " ",
    "../..",
    "./.",
    "o/..",
  ]) {
    const result = await runAssessCommand(
      context({ ...ASSESS, repo }, runtime, stubRequest(QUIET)),
    );
    assert.equal(result.ok, false, repo);
    assert.match(result.error, /--repo/);
  }
});

test("the handler's own transport reaches the API and the counters", async () => {
  // No `deps.request`, so this drives `createRequest` from inside the handler,
  // which is the path CI runs.
  const runtime = testRuntime(ENV);
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    const body = url.includes("/issues/comments")
      ? created(3)
      : url.includes("/pulls")
        ? created(1)
        : url.includes("/issues")
          ? created(40)
          : commits(2);
    return new Response(JSON.stringify(body), { status: 200 });
  };

  const result = await runAssessCommand(
    context(ASSESS, runtime, undefined, fetchImpl),
  );
  assert.deepEqual(result, { ok: true });
  assert.equal(seen.length, 4);
  assert.equal(
    seen[0].url.startsWith("https://api.github.com/repos/o/r/"),
    true,
  );
  assert.equal(seen[0].init.headers.Authorization, "Bearer t");
  assert.match(runtime.fs.data.get("/gh/output.txt"), /^verdict=engage$/m);
});

test("engage refuses a reason every killswitch reader would read as cleared", async () => {
  for (const reason of ["0", "false", "off", "no"]) {
    const writes = [];
    const runtime = testRuntime(ENV);
    const result = await runEngageCommand(
      context(
        { ...ENGAGE, reason },
        runtime,
        latchStub({
          repository: {
            name: "MY_KILLSWITCH",
            value: "",
            updated_at: ago(600),
          },
          writes,
        }),
      ),
    );
    assert.deepEqual(result, { ok: false, code: 1 }, reason);
    assert.deepEqual(writes, [], reason);
  }
});
