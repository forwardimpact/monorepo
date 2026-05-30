import { describe, test } from "node:test";
import assert from "node:assert";
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../bin/fit-selfedit.js", import.meta.url));

const DEFAULT_SETTINGS = {
  permissions: {
    allow: [
      "Edit(.claude/agents/**)",
      "Edit(.claude/skills/**)",
      "Edit(products/*/templates/.claude/skills/**)",
      "Write(.claude/skills/**)",
    ],
  },
};

function runSelfedit(repoCwd, args, stdin) {
  return spawnSync("node", [BIN, ...args], {
    cwd: repoCwd,
    input: stdin ?? "",
    encoding: "utf8",
  });
}

function makeRepo({
  detached = false,
  branch = "feature/x",
  settings = DEFAULT_SETTINGS,
  writeSettings = true,
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "selfedit-test-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: dir,
  });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir });
  execFileSync("git", ["config", "tag.gpgsign", "false"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "# test\n");
  execFileSync("git", ["add", "README.md"], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  fs.mkdirSync(path.join(dir, ".claude", "skills"), { recursive: true });
  if (writeSettings) {
    fs.writeFileSync(
      path.join(dir, ".claude", "settings.json"),
      JSON.stringify(settings, null, 2),
    );
  }
  if (detached) {
    execFileSync("git", ["checkout", "-q", "--detach", "HEAD"], { cwd: dir });
  } else if (branch !== "main") {
    execFileSync("git", ["checkout", "-qb", branch], { cwd: dir });
  }
  return dir;
}

describe("fit-selfedit", () => {
  test("writes content to a settings.json-allowed path on a feature branch", () => {
    const dir = makeRepo();
    const result = runSelfedit(
      dir,
      [".claude/skills/probe.md"],
      "hello world\n",
    );
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(
      fs.readFileSync(path.join(dir, ".claude/skills/probe.md"), "utf8"),
      "hello world\n",
    );
    assert.match(result.stderr, /Edit\(\.claude\/skills\/\*\*\)/);
  });

  test("writes to a path covered by a broader rule (products/*/templates/...)", () => {
    const dir = makeRepo();
    fs.mkdirSync(path.join(dir, "products/foo/templates/.claude/skills"), {
      recursive: true,
    });
    const result = runSelfedit(
      dir,
      ["products/foo/templates/.claude/skills/bar.md"],
      "y",
    );
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(
      result.stderr,
      /Edit\(products\/\*\/templates\/\.claude\/skills\/\*\*\)/,
    );
  });

  test("refuses when no Edit() rule matches the target", () => {
    const dir = makeRepo();
    const result = runSelfedit(dir, ["README.md"], "x");
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /no Edit\(\) rule .* matches 'README\.md'/);
  });

  test("refuses traversal that escapes .claude/", () => {
    const dir = makeRepo();
    const result = runSelfedit(dir, [".claude/../README.md"], "x");
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /no Edit\(\) rule .* matches 'README\.md'/);
  });

  test("refuses when no .claude/settings.json exists in any ancestor", () => {
    const dir = makeRepo({ writeSettings: false });
    const result = runSelfedit(dir, [".claude/skills/probe.md"], "x");
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /no \.claude\/settings\.json found/);
  });

  test("refuses when settings.json has no permissions.allow array", () => {
    const dir = makeRepo({ settings: { permissions: {} } });
    const result = runSelfedit(dir, [".claude/skills/probe.md"], "x");
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /no permissions\.allow/);
  });

  test("refuses when settings.json has allow but no Edit() rules", () => {
    const dir = makeRepo({
      settings: { permissions: { allow: ["Write(.claude/skills/**)"] } },
    });
    const result = runSelfedit(dir, [".claude/skills/probe.md"], "x");
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /no Edit\(\) rules/);
  });

  test("refuses path outside the repo (no settings.json found upward)", () => {
    const dir = makeRepo();
    const result = runSelfedit(dir, ["/etc/hostname"], "x");
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /no \.claude\/settings\.json found/);
  });

  test("refuses while on main", () => {
    const dir = makeRepo({ branch: "main" });
    const result = runSelfedit(dir, [".claude/skills/probe.md"], "x");
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /branch 'main'/);
  });

  test("refuses while HEAD is detached", () => {
    const dir = makeRepo({ detached: true });
    const result = runSelfedit(dir, [".claude/skills/probe.md"], "x");
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /detached/);
  });

  test("settings-allow check runs before the branch check", () => {
    const dir = makeRepo({ branch: "main" });
    // Path is disallowed AND we're on main; expect the allow-rule error first.
    const result = runSelfedit(dir, ["README.md"], "x");
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /no Edit\(\) rule/);
    assert.doesNotMatch(result.stderr, /branch 'main'/);
  });

  test("refuses when parent directory does not exist", () => {
    const dir = makeRepo();
    // .claude/agents/** is allowed; the parent .claude/agents/ does not exist.
    const result = runSelfedit(dir, [".claude/agents/sub/probe.md"], "x");
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /does not exist/);
  });

  test("--help prints usage and exits 0", () => {
    const dir = makeRepo();
    const result = runSelfedit(dir, ["--help"]);
    assert.strictEqual(result.status, 0);
    assert.match(result.stdout, /fit-selfedit/);
    assert.match(result.stdout, /Safeguards/);
  });

  test("--version prints version and exits 0", () => {
    const dir = makeRepo();
    const result = runSelfedit(dir, ["--version"]);
    assert.strictEqual(result.status, 0);
    assert.match(result.stdout, /\d+\.\d+\.\d+/);
  });
});
