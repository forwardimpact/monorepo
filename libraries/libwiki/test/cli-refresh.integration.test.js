import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { yearMonth } from "@forwardimpact/libutil";
import { GitClient } from "@forwardimpact/libutil/git-client";

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
});
