import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { yearMonth } from "@forwardimpact/libutil";
import { createMockSubprocess } from "@forwardimpact/libmock";

import {
  profileText,
  makeMetricsCSV,
  createRefreshProject,
  runRefresh,
} from "./helpers.js";

// The XmR notice family (every render failure as a notice inside the block)
// lives in the sibling cli-refresh-xmr-notices.integration.test.js.
const FIXED_NOW = Date.UTC(2026, 4, 15);

async function refresh(cwd, storyboardPath) {
  const { harness } = await runRefresh(cwd, { storyboardPath, now: FIXED_NOW });
  return harness;
}

// Refresh with a stubbed `gh` that returns no issues, so the issue-list blocks
// of a fresh skeleton render hermetically. This returns the resolved
// storyboard path (explicit arg, or the current-month default under wiki/).
async function refreshCreates(cwd, storyboardPath) {
  const subprocess = createMockSubprocess({
    responses: { gh: { stdout: "[]", exitCode: 0 } },
  });
  await runRefresh(cwd, { storyboardPath, now: FIXED_NOW, subprocess });
  return storyboardPath
    ? join(cwd, storyboardPath)
    : join(cwd, "wiki", `storyboard-${yearMonth(FIXED_NOW)}.md`);
}

describe("gemba-wiki refresh CLI (in-process)", () => {
  test("no markers — file unchanged", async () => {
    const dir = createRefreshProject();
    const storyboard = join(dir, "storyboard.md");
    const original = "# Storyboard\n\nSome prose.\n";
    writeFileSync(storyboard, original);
    await refresh(dir, "storyboard.md");
    assert.equal(readFileSync(storyboard, "utf-8"), original);
  });

  test("one marker — block regenerated with chart", async () => {
    const dir = createRefreshProject();
    const csvDir = join(dir, "wiki", "metrics", "kata-spec");
    mkdirSync(csvDir, { recursive: true });
    writeFileSync(
      join(csvDir, "2026.csv"),
      makeMetricsCSV("findings", Array(15).fill(10)),
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

  test("idempotent — second refresh produces the same output", async () => {
    const dir = createRefreshProject();
    const csvDir = join(dir, "wiki", "metrics", "kata-spec");
    mkdirSync(csvDir, { recursive: true });
    writeFileSync(
      join(csvDir, "2026.csv"),
      makeMetricsCSV("findings", Array(15).fill(10)),
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

  test("missing CSV — block carries a notice, exit 0", async () => {
    const dir = createRefreshProject();
    const storyboard = join(dir, "storyboard.md");
    writeFileSync(
      storyboard,
      [
        "<!-- xmr:metric:nonexistent.csv -->",
        "old content",
        "<!-- /xmr -->",
      ].join("\n"),
    );
    await refresh(dir, "storyboard.md");
    const after = readFileSync(storyboard, "utf-8");
    assert.ok(after.includes("**XmR block not rendered.** Could not read"));
    assert.ok(!after.includes("old content"));
  });

  test("missing storyboard file — creates a skeleton, exit 0", async () => {
    const dir = createRefreshProject();
    // The test writes no storyboard. Refresh creates it from the skeleton.
    const created = readFileSync(
      await refreshCreates(dir, "storyboard.md"),
      "utf-8",
    );
    assert.match(created, /^# Storyboard — 2026 May$/m);
    assert.match(created, /^## Challenge$/m);
    assert.match(created, /^\*\*Due:\*\* 2026-05-31$/m);
    assert.ok(created.includes("<!-- obstacles:open"));
    assert.ok(created.includes("<!-- experiments:closed"));
  });

  test("a created skeleton carries one section per installed profile", async () => {
    const dir = createRefreshProject();
    const agentsDir = join(dir, ".claude", "agents");
    mkdirSync(agentsDir, { recursive: true });
    for (const agent of ["staff-engineer", "technical-writer"]) {
      writeFileSync(join(agentsDir, `${agent}.md`), profileText(agent));
    }
    writeFileSync(join(agentsDir, "x-team-protocol.md"), "# Protocol\n");
    const created = readFileSync(
      await refreshCreates(dir, "storyboard.md"),
      "utf-8",
    );
    assert.match(created, /^### staff-engineer$/m);
    assert.match(created, /^### technical-writer$/m);
    assert.doesNotMatch(created, /x-team-protocol/);
  });

  test("missing storyboard defaults to the current-month path", async () => {
    const dir = createRefreshProject();
    await refreshCreates(dir, undefined);
    const defaultPath = join(
      dir,
      "wiki",
      `storyboard-${yearMonth(FIXED_NOW)}.md`,
    );
    assert.ok(readFileSync(defaultPath, "utf-8").includes("# Storyboard —"));
  });

  test("clears expired MEMORY.md claims even with no storyboard", async () => {
    const dir = createRefreshProject();
    const wikiDir = join(dir, "wiki");
    mkdirSync(wikiDir, { recursive: true });
    // FIXED_NOW is 2026-05-15. The first row is past its expiry. The second
    // row is not.
    writeFileSync(
      join(wikiDir, "MEMORY.md"),
      [
        "## Active Claims",
        "",
        "| agent | target | branch | pr | claimed_at | expires_at |",
        "| --- | --- | --- | --- | --- | --- |",
        "| staff-engineer | old | feat/o | — | 2026-04-01 | 2026-05-01 |",
        "| staff-engineer | new | feat/n | — | 2026-05-10 | 2026-06-01 |",
        "",
      ].join("\n"),
    );
    await refreshCreates(dir, "storyboard.md"); // no storyboard file on disk
    const after = readFileSync(join(wikiDir, "MEMORY.md"), "utf-8");
    assert.ok(!after.includes("| old |"), "expired row removed");
    assert.ok(after.includes("| new |"), "unexpired row kept");
  });

  test("working-directory independence", async () => {
    const dir = createRefreshProject();
    const csvDir = join(dir, "wiki", "metrics", "kata-spec");
    mkdirSync(csvDir, { recursive: true });
    writeFileSync(
      join(csvDir, "2026.csv"),
      makeMetricsCSV("metric", Array(15).fill(5)),
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

  test("defaults to the current-month storyboard when no path is given", async () => {
    const dir = createRefreshProject();
    const csvDir = join(dir, "wiki", "metrics", "kata-spec");
    mkdirSync(csvDir, { recursive: true });
    writeFileSync(
      join(csvDir, "2026.csv"),
      makeMetricsCSV("metric", Array(15).fill(7)),
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
  // pins the last-successful-sync stamp. `gh` is { stdout, exitCode }.
  async function refreshGh(dir, storyboardPath, nowMs, gh) {
    const subprocess = createMockSubprocess({ responses: { gh } });
    const { harness } = await runRefresh(dir, {
      storyboardPath,
      now: nowMs,
      subprocess,
    });
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
    const dir = createRefreshProject();
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

    // Day 1 (2026-05-10): two labeled issues materialize. The run sets the
    // stamp.
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

    // In a later refresh Exp B lost its agent label, so it drops. The stamp
    // then advances.
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

    // Day 3 (2026-05-12): the tracker fails. The body stays byte-identical.
    // The stamp stays 05-11.
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

    // Day 4 (2026-05-13): the sync succeeds again → the stamp advances.
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
