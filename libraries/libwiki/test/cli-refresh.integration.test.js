import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { yearMonth } from "@forwardimpact/libutil";
import { GitClient } from "@forwardimpact/libutil/git-client";
import { createMockSubprocess } from "@forwardimpact/libmock";

import { runRefreshCommand } from "../src/commands/refresh.js";
import { makeRuntime, ctxFor } from "./helpers.js";

const HEADER = "date,metric,value,unit,run,note,event_type";
const FIXED_NOW = Date.UTC(2026, 4, 15);

function makeCSV(metric, values) {
  const rows = values.map(
    (v, i) =>
      `2026-01-${String(i + 1).padStart(2, "0")},${metric},${v},count,,,kata-shift`,
  );
  return [HEADER, ...rows].join("\n");
}

function createProject() {
  const dir = mkdtempSync(join(tmpdir(), "refresh-"));
  writeFileSync(join(dir, "package.json"), '{"name":"root"}');
  execFileSync("git", ["init", dir], { stdio: "pipe" });
  return dir;
}

async function refresh(cwd, storyboardPath) {
  const harness = makeRuntime({ cwd, now: FIXED_NOW });
  const gitClient = new GitClient({ runtime: harness.runtime });
  await runRefreshCommand(
    ctxFor({
      runtime: harness.runtime,
      gitClient,
      options: {},
      args: storyboardPath ? { "storyboard-path": storyboardPath } : {},
    }),
  );
  return harness;
}

describe("fit-wiki refresh CLI (in-process)", () => {
  test("no markers — file unchanged", async () => {
    const dir = createProject();
    const storyboard = join(dir, "storyboard.md");
    const original = "# Storyboard\n\nSome prose.\n";
    writeFileSync(storyboard, original);
    await refresh(dir, "storyboard.md");
    assert.equal(readFileSync(storyboard, "utf-8"), original);
  });

  test("one marker — block regenerated with chart", async () => {
    const dir = createProject();
    const csvDir = join(dir, "wiki", "metrics", "kata-spec");
    mkdirSync(csvDir, { recursive: true });
    writeFileSync(
      join(csvDir, "2026.csv"),
      makeCSV("findings", Array(15).fill(10)),
    );
    const storyboard = join(dir, "storyboard.md");
    writeFileSync(
      storyboard,
      [
        "#### findings",
        "<!-- xmr:findings:wiki/metrics/kata-spec/2026.csv -->",
        "old content here",
        "<!-- /xmr -->",
        "trailing prose",
      ].join("\n"),
    );
    await refresh(dir, "storyboard.md");
    const after = readFileSync(storyboard, "utf-8");
    assert.ok(after.includes("**Signals:**"));
    assert.ok(after.includes("```"));
    assert.ok(after.includes("trailing prose"));
    assert.ok(!after.includes("old content here"));
  });

  test("idempotent — second refresh produces same output", async () => {
    const dir = createProject();
    const csvDir = join(dir, "wiki", "metrics", "kata-spec");
    mkdirSync(csvDir, { recursive: true });
    writeFileSync(
      join(csvDir, "2026.csv"),
      makeCSV("findings", Array(15).fill(10)),
    );
    const storyboard = join(dir, "storyboard.md");
    writeFileSync(
      storyboard,
      [
        "<!-- xmr:findings:wiki/metrics/kata-spec/2026.csv -->",
        "placeholder",
        "<!-- /xmr -->",
      ].join("\n"),
    );
    await refresh(dir, "storyboard.md");
    const after1 = readFileSync(storyboard, "utf-8");
    await refresh(dir, "storyboard.md");
    const after2 = readFileSync(storyboard, "utf-8");
    assert.equal(after1, after2);
  });

  test("missing CSV — block unchanged, exit 0", async () => {
    const dir = createProject();
    const storyboard = join(dir, "storyboard.md");
    writeFileSync(
      storyboard,
      [
        "<!-- xmr:metric:nonexistent.csv -->",
        "preserved content",
        "<!-- /xmr -->",
      ].join("\n"),
    );
    await refresh(dir, "storyboard.md");
    assert.ok(readFileSync(storyboard, "utf-8").includes("preserved content"));
  });

  test("missing storyboard file — no-op, exit 0", async () => {
    const dir = createProject();
    // No storyboard written at all.
    await assert.doesNotReject(() => refresh(dir, "storyboard.md"));
  });

  test("working-directory independence", async () => {
    const dir = createProject();
    const csvDir = join(dir, "wiki", "metrics", "kata-spec");
    mkdirSync(csvDir, { recursive: true });
    writeFileSync(
      join(csvDir, "2026.csv"),
      makeCSV("metric", Array(15).fill(5)),
    );
    const storyboard = join(dir, "storyboard.md");
    writeFileSync(
      storyboard,
      [
        "<!-- xmr:metric:wiki/metrics/kata-spec/2026.csv -->",
        "old",
        "<!-- /xmr -->",
      ].join("\n"),
    );
    const subdir = join(dir, "deep", "nested");
    mkdirSync(subdir, { recursive: true });
    await refresh(subdir, "storyboard.md");
    const after = readFileSync(storyboard, "utf-8");
    assert.ok(after.includes("**Signals:**"));
    assert.ok(!after.includes("old"));
  });

  test("defaults to current month storyboard when no path given", async () => {
    const dir = createProject();
    const csvDir = join(dir, "wiki", "metrics", "kata-spec");
    mkdirSync(csvDir, { recursive: true });
    writeFileSync(
      join(csvDir, "2026.csv"),
      makeCSV("metric", Array(15).fill(7)),
    );
    const defaultPath = join(
      dir,
      "wiki",
      `storyboard-${yearMonth(FIXED_NOW)}.md`,
    );
    mkdirSync(join(dir, "wiki"), { recursive: true });
    writeFileSync(
      defaultPath,
      [
        "<!-- xmr:metric:wiki/metrics/kata-spec/2026.csv -->",
        "old",
        "<!-- /xmr -->",
      ].join("\n"),
    );
    await refresh(dir, undefined);
    const after = readFileSync(defaultPath, "utf-8");
    assert.ok(after.includes("**Signals:**"));
    assert.ok(!after.includes("old"));
  });

  // Refresh against the agent-experiments block with a stubbed `gh`. `nowMs`
  // pins the last-successful-sync stamp; `gh` is { stdout, exitCode }.
  async function refreshGh(dir, storyboardPath, nowMs, gh) {
    const subprocess = createMockSubprocess({ responses: { gh } });
    const harness = makeRuntime({ cwd: dir, now: nowMs, subprocess });
    const gitClient = new GitClient({ runtime: harness.runtime });
    await runRefreshCommand(
      ctxFor({
        runtime: harness.runtime,
        gitClient,
        options: {},
        args: { "storyboard-path": storyboardPath },
      }),
    );
    return harness;
  }

  function issueJson(number, agent, title, login) {
    return {
      number,
      title,
      labels: [{ name: "experiment" }, { name: `agent:${agent}` }],
      author: { login },
    };
  }

  test("agent-experiments: keep-previous on failure, stamp frozen, drop on de-label", async () => {
    const dir = createProject();
    const storyboard = join(dir, "storyboard.md");
    writeFileSync(
      storyboard,
      [
        "<!-- agent-experiments -->",
        "<!-- last-successful-sync: 2026-05-01 -->",
        "<!-- /agent-experiments -->",
        "trailing prose",
      ].join("\n"),
    );

    // Day 1 (2026-05-10): two labeled issues materialized, stamp set.
    await refreshGh(dir, "storyboard.md", Date.UTC(2026, 4, 10), {
      stdout: JSON.stringify([
        issueJson(11, "staff-engineer", "Exp A", "alice"),
        issueJson(22, "release-engineer", "Exp B", "bob"),
      ]),
      exitCode: 0,
    });
    let body = readFileSync(storyboard, "utf-8");
    assert.ok(body.includes("<!-- last-successful-sync: 2026-05-10 -->"));
    assert.ok(body.includes("- #11 [staff-engineer] Exp A (by alice)"));
    assert.ok(body.includes("- #22 [release-engineer] Exp B (by bob)"));
    assert.ok(body.includes("trailing prose"));

    // Day 2 (2026-05-11): issue 22 lost its agent label → dropped; stamp advances.
    await refreshGh(dir, "storyboard.md", Date.UTC(2026, 4, 11), {
      stdout: JSON.stringify([
        issueJson(11, "staff-engineer", "Exp A", "alice"),
        {
          number: 22,
          title: "Exp B",
          labels: [{ name: "experiment" }],
          author: { login: "bob" },
        },
      ]),
      exitCode: 0,
    });
    body = readFileSync(storyboard, "utf-8");
    assert.ok(body.includes("<!-- last-successful-sync: 2026-05-11 -->"));
    assert.ok(body.includes("- #11 [staff-engineer] Exp A (by alice)"));
    assert.ok(!body.includes("#22"), "de-labeled issue must drop out");

    // Day 3 (2026-05-12): tracker fails → body byte-identical, stamp stays 05-11.
    const harness = await refreshGh(
      dir,
      "storyboard.md",
      Date.UTC(2026, 4, 12),
      {
        stdout: "",
        exitCode: 1,
      },
    );
    const afterFail = readFileSync(storyboard, "utf-8");
    assert.equal(
      afterFail,
      body,
      "failed sync preserves block byte-identically",
    );
    assert.ok(afterFail.includes("<!-- last-successful-sync: 2026-05-11 -->"));
    assert.ok(
      !afterFail.includes("2026-05-12"),
      "failed sync must not advance the stamp",
    );
    assert.match(harness.stderr, /keeping previous materialized items/);

    // Day 4 (2026-05-13): success again → stamp advances.
    await refreshGh(dir, "storyboard.md", Date.UTC(2026, 4, 13), {
      stdout: JSON.stringify([
        issueJson(11, "staff-engineer", "Exp A", "alice"),
      ]),
      exitCode: 0,
    });
    body = readFileSync(storyboard, "utf-8");
    assert.ok(body.includes("<!-- last-successful-sync: 2026-05-13 -->"));
  });
});
