import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const CLI_PATH = new URL("../bin/fit-wiki.js", import.meta.url).pathname;
const HEADER = "date,metric,value,unit,run,note";

function makeCSV(metric, values) {
  const rows = values.map(
    (v, i) =>
      `2026-01-${String(i + 1).padStart(2, "0")},${metric},${v},count,,`,
  );
  return [HEADER, ...rows].join("\n");
}

function createProject() {
  const dir = mkdtempSync(join(tmpdir(), "refresh-"));
  writeFileSync(join(dir, "package.json"), '{"name":"root"}');
  execFileSync("git", ["init", dir], { stdio: "pipe" });
  return dir;
}

function run(cwd, storyboardPath) {
  return execFileSync("node", [CLI_PATH, "refresh", storyboardPath], {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, PATH: process.env.PATH },
    stdio: "pipe",
  });
}

describe("fit-wiki refresh CLI", () => {
  test("no markers — file unchanged", () => {
    const dir = createProject();
    const storyboard = join(dir, "storyboard.md");
    const original = "# Storyboard\n\nSome prose.\n";
    writeFileSync(storyboard, original);

    run(dir, "storyboard.md");

    const after = readFileSync(storyboard, "utf-8");
    assert.equal(after, original);
  });

  test("one marker — block regenerated with chart", () => {
    const dir = createProject();
    const csvDir = join(dir, "wiki", "metrics", "kata-spec");
    mkdirSync(csvDir, { recursive: true });
    const values = Array(15).fill(10);
    writeFileSync(join(csvDir, "2026.csv"), makeCSV("findings", values));

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

    run(dir, "storyboard.md");

    const after = readFileSync(storyboard, "utf-8");
    assert.ok(after.includes("**Signals:**"));
    assert.ok(after.includes("```"));
    assert.ok(after.includes("trailing prose"));
    assert.ok(!after.includes("old content here"));
  });

  test("idempotent — second refresh produces same output", () => {
    const dir = createProject();
    const csvDir = join(dir, "wiki", "metrics", "kata-spec");
    mkdirSync(csvDir, { recursive: true });
    const values = Array(15).fill(10);
    writeFileSync(join(csvDir, "2026.csv"), makeCSV("findings", values));

    const storyboard = join(dir, "storyboard.md");
    writeFileSync(
      storyboard,
      [
        "<!-- xmr:findings:wiki/metrics/kata-spec/2026.csv -->",
        "placeholder",
        "<!-- /xmr -->",
      ].join("\n"),
    );

    run(dir, "storyboard.md");
    const after1 = readFileSync(storyboard, "utf-8");

    run(dir, "storyboard.md");
    const after2 = readFileSync(storyboard, "utf-8");

    assert.equal(after1, after2);
  });

  test("two markers — both blocks regenerated", () => {
    const dir = createProject();
    const csvDir = join(dir, "wiki", "metrics", "kata-spec");
    mkdirSync(csvDir, { recursive: true });
    const csv = [
      HEADER,
      ...Array(15)
        .fill(null)
        .map(
          (_, i) =>
            `2026-01-${String(i + 1).padStart(2, "0")},alpha,${10 + i},count,,`,
        ),
      ...Array(15)
        .fill(null)
        .map(
          (_, i) =>
            `2026-01-${String(i + 1).padStart(2, "0")},beta,${20 + i},count,,`,
        ),
    ].join("\n");
    writeFileSync(join(csvDir, "2026.csv"), csv);

    const storyboard = join(dir, "storyboard.md");
    writeFileSync(
      storyboard,
      [
        "#### alpha",
        "<!-- xmr:alpha:wiki/metrics/kata-spec/2026.csv -->",
        "old alpha",
        "<!-- /xmr -->",
        "",
        "#### beta",
        "<!-- xmr:beta:wiki/metrics/kata-spec/2026.csv -->",
        "old beta",
        "<!-- /xmr -->",
      ].join("\n"),
    );

    run(dir, "storyboard.md");

    const after = readFileSync(storyboard, "utf-8");
    const signalsCount = (after.match(/\*\*Signals:\*\*/g) || []).length;
    assert.equal(signalsCount, 2);
    assert.ok(!after.includes("old alpha"));
    assert.ok(!after.includes("old beta"));
  });

  test("missing CSV — block unchanged, exit 0", () => {
    const dir = createProject();
    const storyboard = join(dir, "storyboard.md");
    const original = [
      "<!-- xmr:metric:nonexistent.csv -->",
      "preserved content",
      "<!-- /xmr -->",
    ].join("\n");
    writeFileSync(storyboard, original);

    run(dir, "storyboard.md");

    const after = readFileSync(storyboard, "utf-8");
    assert.ok(after.includes("preserved content"));
  });

  test("working-directory independence", () => {
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

    execFileSync("node", [CLI_PATH, "refresh", "storyboard.md"], {
      cwd: subdir,
      encoding: "utf-8",
      env: { ...process.env, PATH: process.env.PATH },
      stdio: "pipe",
    });

    const after = readFileSync(storyboard, "utf-8");
    assert.ok(after.includes("**Signals:**"));
    assert.ok(!after.includes("old"));
  });

  test("defaults to current month storyboard when no path given", () => {
    const dir = createProject();
    const csvDir = join(dir, "wiki", "metrics", "kata-spec");
    mkdirSync(csvDir, { recursive: true });
    writeFileSync(
      join(csvDir, "2026.csv"),
      makeCSV("metric", Array(15).fill(7)),
    );

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const defaultPath = join(dir, "wiki", `storyboard-${yyyy}-M${mm}.md`);
    mkdirSync(join(dir, "wiki"), { recursive: true });
    writeFileSync(
      defaultPath,
      [
        "<!-- xmr:metric:wiki/metrics/kata-spec/2026.csv -->",
        "old",
        "<!-- /xmr -->",
      ].join("\n"),
    );

    execFileSync("node", [CLI_PATH, "refresh"], {
      cwd: dir,
      encoding: "utf-8",
      env: { ...process.env, PATH: process.env.PATH },
      stdio: "pipe",
    });

    const after = readFileSync(defaultPath, "utf-8");
    assert.ok(after.includes("**Signals:**"));
    assert.ok(!after.includes("old"));
  });
});
