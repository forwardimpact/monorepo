import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createTestRuntime,
  createMockSubprocess,
} from "@forwardimpact/libmock";

import { runProductMixCommand } from "../src/commands/product-mix.js";

const WINDOW = { until: "2026-06-08", since: "2026-06-01" };

function prsPayload(...specs) {
  // Each spec is a label name (or null for unlabeled). Returns the JSON shape
  // `gh pr list --json number,labels,mergedAt` emits.
  return JSON.stringify(
    specs.map((label, i) => ({
      number: i + 1,
      labels: label ? [{ name: label }] : [],
      mergedAt: "2026-06-05T00:00:00Z",
    })),
  );
}

function runWith(stdout, { options, gitClient, clock } = {}) {
  const subprocess = createMockSubprocess({
    responses: { gh: { stdout }, npx: { stdout: "" } },
  });
  const runtime = createTestRuntime({
    subprocess,
    finder: { findProjectRoot: () => "/repo" },
    ...(clock ? { clock } : {}),
  });
  const ctx = {
    deps: { runtime, gitClient },
    options: options ?? { ...WINDOW, repo: "owner/repo" },
    args: {},
  };
  return { ctx, subprocess, runtime, run: runProductMixCommand(ctx) };
}

describe("fit-wiki product-mix", () => {
  test("records product_share from labeled merged PRs", async () => {
    // 3 product + 1 internal of 4 classified → round(3/4*100) = 75.
    const { subprocess, run } = runWith(
      prsPayload("product", "product", "product", "internal", null),
    );
    const result = await run;
    assert.equal(result.ok, true);

    const recordCall = subprocess.calls.find((c) => c.cmd === "npx");
    assert.ok(recordCall, "fit-xmr record must be invoked");
    assert.equal(recordCall.args[0], "fit-xmr");
    assert.ok(recordCall.args.includes("record"));
    const pair = (flag) => recordCall.args[recordCall.args.indexOf(flag) + 1];
    assert.equal(pair("--skill"), "product-mix");
    assert.equal(pair("--metric"), "product_share");
    assert.equal(pair("--value"), "75");
    assert.equal(pair("--unit"), "pct");
    assert.equal(pair("--date"), "2026-06-08");
  });

  test("emits no row when no PRs carry a classification label", async () => {
    const { subprocess, run } = runWith(prsPayload(null, null));
    const result = await run;
    assert.equal(result.ok, true);
    assert.ok(
      !subprocess.calls.some((c) => c.cmd === "npx"),
      "no fit-xmr record call for a 0/0 window",
    );
  });

  test("emits no row for an empty merged-PR set", async () => {
    const { subprocess, run } = runWith("[]");
    await run;
    assert.ok(!subprocess.calls.some((c) => c.cmd === "npx"));
  });

  test("derives the repo slug from the git origin when --repo is absent", async () => {
    const gitClient = {
      remoteGetUrl: async () => "https://github.com/forwardimpact/monorepo.git",
    };
    const { subprocess, run } = runWith(prsPayload("product"), {
      options: { ...WINDOW },
      gitClient,
    });
    await run;
    const ghCall = subprocess.calls.find((c) => c.cmd === "gh");
    assert.ok(ghCall.args.includes("--repo"));
    assert.equal(
      ghCall.args[ghCall.args.indexOf("--repo") + 1],
      "forwardimpact/monorepo",
    );
  });

  test("defaults the window to the trailing 7 days from the clock", async () => {
    // currentDayIso reads runtime.clock.now(); addDays(-7) sets the start.
    const clock = { now: () => Date.UTC(2026, 5, 8), sleep: async () => {} };
    const { subprocess, run } = runWith(prsPayload("product"), {
      options: { repo: "owner/repo" },
      clock,
    });
    await run;
    const ghCall = subprocess.calls.find((c) => c.cmd === "gh");
    assert.equal(
      ghCall.args[ghCall.args.indexOf("--search") + 1],
      "merged:2026-06-01..2026-06-08",
    );
    const recordCall = subprocess.calls.find((c) => c.cmd === "npx");
    assert.equal(
      recordCall.args[recordCall.args.indexOf("--date") + 1],
      "2026-06-08",
    );
  });

  test("queries gh with the merged: search window", async () => {
    const { subprocess, run } = runWith(prsPayload("product"));
    await run;
    const ghCall = subprocess.calls.find((c) => c.cmd === "gh");
    assert.ok(ghCall, "gh pr list must be invoked");
    assert.ok(ghCall.args.includes("--search"));
    assert.equal(
      ghCall.args[ghCall.args.indexOf("--search") + 1],
      "merged:2026-06-01..2026-06-08",
    );
    assert.ok(ghCall.args.includes("--repo"));
    assert.ok(ghCall.args.includes("owner/repo"));
  });
});
