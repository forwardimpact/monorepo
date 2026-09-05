import { test } from "node:test";
import assert from "node:assert/strict";

import { runAssessCommand } from "../src/commands/assess.js";
import { runEngageCommand } from "../src/commands/engage.js";
import { ago, commits, context, created, testRuntime } from "./helpers.js";

/**
 * Install a stub `fetch` that maps a URL fragment to a JSON body, and return
 * a restore function plus the recorded calls.
 */
function stubFetch(routes) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((fragment) => url.includes(fragment));
    const value = key === undefined ? null : routes[key];
    const resolved = typeof value === "function" ? value(url, init) : value;
    if (resolved === undefined) return new Response(null, { status: 404 });
    return new Response(JSON.stringify(resolved), { status: 200 });
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const ENV = {
  GH_TOKEN: "t",
  GITHUB_REPOSITORY: "o/r",
  GITHUB_STEP_SUMMARY: "/gh/summary.md",
  GITHUB_OUTPUT: "/gh/output.txt",
};

const QUIET = {
  "/commits": commits(2),
  "/pulls": created(1),
  "/issues/comments": created(3),
  "/issues?": created(1),
};

const ASSESS = {
  threshold: "32",
  "window-hours": "2",
  "default-branch": "main",
};

test("assess writes the outputs and the summary, and exits 0 when quiet", async () => {
  const stub = stubFetch(QUIET);
  try {
    const runtime = testRuntime(ENV);
    const result = await runAssessCommand(context(ASSESS, runtime));
    assert.deepEqual(result, { ok: true });
    const output = runtime.fs.data.get("/gh/output.txt");
    assert.equal(output, "verdict=quiet\nreason=\n");
    assert.match(
      runtime.fs.data.get("/gh/summary.md"),
      /Verdict: \*\*quiet\*\*/,
    );
  } finally {
    stub.restore();
  }
});

test("assess reports a breach as an engage verdict with an encoded reason", async () => {
  const stub = stubFetch({ ...QUIET, "/issues?": created(40) });
  try {
    const runtime = testRuntime(ENV);
    await runAssessCommand(context(ASSESS, runtime));
    const output = runtime.fs.data.get("/gh/output.txt");
    assert.match(output, /^verdict=engage$/m);
    assert.match(output, /^reason=watchdog\|issues=40\/32\|.+Z$/m);
  } finally {
    stub.restore();
  }
});

test("two appends to one env file accumulate", async () => {
  const stub = stubFetch(QUIET);
  try {
    const runtime = testRuntime(ENV);
    await runAssessCommand(context(ASSESS, runtime));
    await runAssessCommand(context(ASSESS, runtime));
    const output = runtime.fs.data.get("/gh/output.txt");
    assert.equal(output.match(/verdict=quiet/g).length, 2);
    assert.equal(runtime.fs.appendFile.mock.callCount(), 4);
  } finally {
    stub.restore();
  }
});

test("assess renders JSON on --format json", async () => {
  const stub = stubFetch(QUIET);
  try {
    const runtime = testRuntime(ENV);
    await runAssessCommand(context({ ...ASSESS, format: "json" }, runtime));
    const parsed = JSON.parse(runtime.proc.stdout.chunks.join(""));
    assert.equal(parsed.engage, false);
    assert.equal(parsed.counts.length, 4);
  } finally {
    stub.restore();
  }
});

test("assess refuses a missing or non-positive threshold", async () => {
  const runtime = testRuntime(ENV);
  const absent = await runAssessCommand(
    context({ "window-hours": "2" }, runtime),
  );
  assert.equal(absent.ok, false);
  assert.match(absent.error, /--threshold/);
  const zero = await runAssessCommand(
    context({ threshold: "0", "window-hours": "2" }, runtime),
  );
  assert.match(zero.error, /--threshold/);
});

test("assess refuses a missing window and a missing token", async () => {
  const runtime = testRuntime(ENV);
  const noWindow = await runAssessCommand(
    context({ threshold: "32" }, runtime),
  );
  assert.match(noWindow.error, /--window-hours/);

  const bare = testRuntime({ GITHUB_REPOSITORY: "o/r" });
  const noToken = await runAssessCommand(context(ASSESS, bare));
  assert.match(noToken.error, /GH_TOKEN/);
});

const ENGAGE = {
  variable: "MY_KILLSWITCH",
  "window-hours": "2",
  reason: "watchdog|issues=40/32|2026-09-02T14:49:00.000Z",
};

/** Route the two latch reads and record every write. */
function latchRoutes({ repository, organization = [], writes }) {
  return {
    "/actions/variables/MY_KILLSWITCH": (_url, init) => {
      if (init?.method === "PATCH") {
        writes.push(JSON.parse(init.body));
        return {};
      }
      return repository;
    },
    "/actions/organization-variables": { variables: organization },
  };
}

test("engage refuses an empty reason and touches no variable", async () => {
  const stub = stubFetch({});
  try {
    const runtime = testRuntime(ENV);
    const result = await runEngageCommand(
      context({ ...ENGAGE, reason: "   " }, runtime),
    );
    assert.deepEqual(result, { ok: false, code: 1 });
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
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
  const stub = stubFetch(
    latchRoutes({
      repository: { name: "MY_KILLSWITCH", value: "", updated_at: ago(600) },
      writes,
    }),
  );
  try {
    const runtime = testRuntime(ENV);
    const result = await runEngageCommand(context(ENGAGE, runtime));
    assert.deepEqual(result, { ok: false, code: 1 });
    assert.deepEqual(writes, [{ name: "MY_KILLSWITCH", value: ENGAGE.reason }]);
    assert.match(
      runtime.fs.data.get("/gh/summary.md"),
      /Decision: \*\*engage\*\*/,
    );
  } finally {
    stub.restore();
  }
});

test("engage skips and exits 0 when the latch already holds a truthy value", async () => {
  const writes = [];
  const stub = stubFetch(
    latchRoutes({
      repository: { name: "MY_KILLSWITCH", value: "1", updated_at: ago(5) },
      writes,
    }),
  );
  try {
    const runtime = testRuntime(ENV);
    const result = await runEngageCommand(context(ENGAGE, runtime));
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(writes, []);
  } finally {
    stub.restore();
  }
});

test("engage skips inside the resume window", async () => {
  const writes = [];
  const stub = stubFetch(
    latchRoutes({
      repository: {
        name: "MY_KILLSWITCH",
        value: "false",
        updated_at: ago(30),
      },
      writes,
    }),
  );
  try {
    const runtime = testRuntime(ENV);
    const result = await runEngageCommand(context(ENGAGE, runtime));
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(writes, []);
  } finally {
    stub.restore();
  }
});

test("a dry run reads both scopes and writes nothing", async () => {
  const writes = [];
  const stub = stubFetch(
    latchRoutes({
      repository: { name: "MY_KILLSWITCH", value: "", updated_at: ago(600) },
      writes,
    }),
  );
  try {
    const runtime = testRuntime(ENV);
    const result = await runEngageCommand(
      context({ ...ENGAGE, "dry-run": true }, runtime),
    );
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(writes, []);
    assert.match(runtime.fs.data.get("/gh/summary.md"), /Dry run/);
  } finally {
    stub.restore();
  }
});

test("a failed latch read exits 1 with no write", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ message: "no" }), { status: 403 });
  };
  try {
    const runtime = testRuntime(ENV);
    const result = await runEngageCommand(context(ENGAGE, runtime));
    assert.deepEqual(result, { ok: false, code: 1 });
    assert.equal(
      calls.every((call) => call.init?.method === undefined),
      true,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("a failed latch write exits 1", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (init?.method === "PATCH" || init?.method === "POST") {
      return new Response(JSON.stringify({ message: "no" }), { status: 403 });
    }
    if (url.includes("organization-variables")) {
      return new Response(JSON.stringify({ variables: [] }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        name: "MY_KILLSWITCH",
        value: "",
        updated_at: ago(600),
      }),
      { status: 200 },
    );
  };
  try {
    const runtime = testRuntime(ENV);
    const result = await runEngageCommand(context(ENGAGE, runtime));
    assert.deepEqual(result, { ok: false, code: 1 });
  } finally {
    globalThis.fetch = original;
  }
});

test("every write path carries a non-empty reason", async () => {
  const writes = [];
  const stub = stubFetch(
    latchRoutes({
      repository: { name: "MY_KILLSWITCH", value: "", updated_at: ago(600) },
      writes,
    }),
  );
  try {
    for (const reason of ["watchdog|a=1/1|t", "manual stop"]) {
      const runtime = testRuntime(ENV);
      await runEngageCommand(context({ ...ENGAGE, reason }, runtime));
    }
    assert.equal(writes.length, 2);
    for (const write of writes) {
      assert.notEqual(write.value.trim(), "");
      assert.equal(
        ["", "0", "false", "no", "off"].includes(write.value),
        false,
      );
    }
  } finally {
    stub.restore();
  }
});
